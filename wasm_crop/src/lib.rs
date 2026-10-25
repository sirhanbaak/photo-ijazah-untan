use image::imageops::{self, FilterType};
use image::{DynamicImage, GenericImageView, ImageOutputFormat, Rgba};
use std::alloc::{alloc as raw_alloc, dealloc as raw_dealloc, Layout};
use std::io::Cursor;
use std::sync::{Mutex, MutexGuard};

mod dpi;

/// Batas maksimum byte gambar sumber yang diterima engine (32 MiB).
pub const MAX_INPUT_BYTES: usize = 32 * 1024 * 1024;
/// Batas maksimum dimensi target (piksel) untuk setiap sisi.
pub const MAX_TARGET_DIM: u32 = 8000;
/// Toleransi pembulatan koordinat crop yang dikirim dari sisi UI (piksel).
const CROP_ROUNDING_TOLERANCE: u32 = 3;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OutputFormat {
    Jpeg,
    Png,
}

// Global output buffer untuk memegang hasil crop untuk dibaca oleh WebAssembly / host
static OUTPUT_BUFFER: Mutex<Vec<u8>> = Mutex::new(Vec::new());
// Pesan error terakhir agar host bisa menampilkan penyebab kegagalan yang sebenarnya
static LAST_ERROR: Mutex<Vec<u8>> = Mutex::new(Vec::new());

fn lock_output() -> MutexGuard<'static, Vec<u8>> {
    OUTPUT_BUFFER.lock().unwrap_or_else(|err| err.into_inner())
}

fn lock_error() -> MutexGuard<'static, Vec<u8>> {
    LAST_ERROR.lock().unwrap_or_else(|err| err.into_inner())
}

fn set_last_error(message: &str) {
    *lock_error() = message.as_bytes().to_vec();
}

/// Alokasi buffer memori dari sisi JavaScript host.
/// Memakai allocator global dengan Layout 1-byte agar `dealloc` selalu konsisten.
#[no_mangle]
pub extern "C" fn alloc(size: usize) -> *mut u8 {
    if size == 0 {
        return std::ptr::null_mut();
    }
    match Layout::from_size_align(size, 1) {
        Ok(layout) => unsafe { raw_alloc(layout) },
        Err(_) => std::ptr::null_mut(),
    }
}

/// Dealokasi buffer memori dari sisi JavaScript host
#[no_mangle]
pub extern "C" fn dealloc(ptr: *mut u8, size: usize) {
    if ptr.is_null() || size == 0 {
        return;
    }
    if let Ok(layout) = Layout::from_size_align(size, 1) {
        unsafe { raw_dealloc(ptr, layout) };
    }
}

/// Pointer ke hasil output
#[no_mangle]
pub extern "C" fn get_output_ptr() -> *const u8 {
    lock_output().as_ptr()
}

/// Panjang byte hasil output
#[no_mangle]
pub extern "C" fn get_output_len() -> usize {
    lock_output().len()
}

/// Pointer pesan error terakhir (UTF-8 tanpa terminator null)
#[no_mangle]
pub extern "C" fn get_last_error_ptr() -> *const u8 {
    lock_error().as_ptr()
}

/// Panjang pesan error terakhir dalam byte
#[no_mangle]
pub extern "C" fn get_last_error_len() -> usize {
    lock_error().len()
}

/// Sumber piksel yang sudah dinormalisasi untuk sampling bebas.
struct PixelSource<'a> {
    data: &'a [u8],
    width: u32,
    height: u32,
    channels: usize,
}

impl<'a> PixelSource<'a> {
    fn channel_at(&self, x: i64, y: i64, channel: usize) -> f32 {
        // Edge-clamp: area di luar foto memakai piksel tepi terdekat
        let px = x.clamp(0, self.width as i64 - 1) as usize;
        let py = y.clamp(0, self.height as i64 - 1) as usize;
        let index = (py * self.width as usize + px) * self.channels + channel;
        self.data[index] as f32
    }

    /// Sampling bilinear dengan penanganan koordinat di luar batas gambar.
    fn bilinear(&self, x: f32, y: f32) -> Rgba<u8> {
        let x_floor = x.floor();
        let y_floor = y.floor();
        let fx = x - x_floor;
        let fy = y - y_floor;
        let x0 = x_floor as i64;
        let y0 = y_floor as i64;

        let mut out = [0u8; 4];
        for (channel, slot) in out.iter_mut().enumerate().take(3) {
            let top = self.channel_at(x0, y0, channel) * (1.0 - fx)
                + self.channel_at(x0 + 1, y0, channel) * fx;
            let bottom = self.channel_at(x0, y0 + 1, channel) * (1.0 - fx)
                + self.channel_at(x0 + 1, y0 + 1, channel) * fx;
            *slot = (top * (1.0 - fy) + bottom * fy).round().clamp(0.0, 255.0) as u8;
        }
        out[3] = 255;
        Rgba(out)
    }
}


/// Memotong area crop sambil menerapkan rotasi arbitrer.
///
/// Geometri mengikuti pratinjau CSS (`transform: rotate(θ) scale(...)` dengan
/// `transform-origin: center`): isi yang tampak di dalam kotak crop yang diam
/// adalah citra yang diputar θ terhadap pusat gambar. Pemetaan dilakukan secara
/// invers (layar → sumber) sehingga hasil ekspor identik dengan pratinjau.
fn rotated_crop(
    img: &DynamicImage,
    crop_x: u32,
    crop_y: u32,
    crop_w: u32,
    crop_h: u32,
    rotation_deg: f32,
) -> image::RgbaImage {
    let (width, height) = img.dimensions();

    // Hindari salinan penuh bila decoder sudah menghasilkan RGB/RGBA
    let converted: Option<image::RgbaImage> =
        if img.as_rgba8().is_none() && img.as_rgb8().is_none() {
            Some(img.to_rgba8())
        } else {
            None
        };

    let source = if let Some(buf) = img.as_rgba8() {
        PixelSource {
            data: buf.as_raw(),
            width,
            height,
            channels: 4,
        }
    } else if let Some(buf) = img.as_rgb8() {
        PixelSource {
            data: buf.as_raw(),
            width,
            height,
            channels: 3,
        }
    } else {
        let buf = converted
            .as_ref()
            .expect("buffer RGBA hasil konversi harus tersedia");
        PixelSource {
            data: buf.as_raw(),
            width,
            height,
            channels: 4,
        }
    };

    let theta = rotation_deg.to_radians();
    let (sin_t, cos_t) = theta.sin_cos();
    let center_x = width as f32 / 2.0;
    let center_y = height as f32 / 2.0;

    let mut output = image::RgbaImage::new(crop_w.max(1), crop_h.max(1));
    for (out_x, out_y, pixel) in output.enumerate_pixels_mut() {
        let screen_x = crop_x as f32 + out_x as f32 + 0.5;
        let screen_y = crop_y as f32 + out_y as f32 + 0.5;
        let dx = screen_x - center_x;
        let dy = screen_y - center_y;
        // R(-θ): kebalikan rotasi CSS (positif = searah jarum jam di layar)
        let source_x = center_x + dx * cos_t + dy * sin_t - 0.5;
        let source_y = center_y - dx * sin_t + dy * cos_t - 0.5;
        *pixel = source.bilinear(source_x, source_y);
    }

    output
}

/// Fungsi utama pemotongan dan resampling citra
pub fn crop_and_resize_image(
    image_bytes: &[u8],
    crop_x: u32,
    crop_y: u32,
    crop_w: u32,
    crop_h: u32,
    target_w: u32,
    target_h: u32,
    rotation_deg: f32,
    flip_h: bool,
    flip_v: bool,
    format: OutputFormat,
    dpi: u32,
) -> Result<Vec<u8>, String> {
    if target_w == 0 || target_h == 0 {
        return Err("Ukuran target (lebar/tinggi) tidak boleh 0".to_string());
    }
    if target_w > MAX_TARGET_DIM || target_h > MAX_TARGET_DIM {
        return Err(format!(
            "Ukuran target melebihi batas {} piksel per sisi",
            MAX_TARGET_DIM
        ));
    }
    if image_bytes.len() > MAX_INPUT_BYTES {
        return Err(format!(
            "Ukuran berkas melebihi batas {} MB",
            MAX_INPUT_BYTES / (1024 * 1024)
        ));
    }
    if !rotation_deg.is_finite() {
        return Err("Sudut rotasi tidak valid (NaN atau tak terhingga)".to_string());
    }

    // Decode citra dari bytes
    let mut img = image::load_from_memory(image_bytes)
        .map_err(|e| format!("Gagal mendecode gambar: {}", e))?;

    // Flip diterapkan lebih dulu agar identik dengan urutan transform CSS
    // `rotate(θ) scale(sx, sy)` (transform paling kanan dieksekusi lebih awal).
    if flip_h {
        img = img.fliph();
    }
    if flip_v {
        img = img.flipv();
    }

    let (img_w, img_h) = img.dimensions();
    if img_w == 0 || img_h == 0 {
        return Err("Dimensi gambar sumber kosong (0 piksel)".to_string());
    }

    // --- Validasi area crop -------------------------------------------------
    if crop_w == 0 || crop_h == 0 {
        return Err("Area crop tidak valid: lebar dan tinggi minimal 1 piksel".to_string());
    }
    if crop_x >= img_w || crop_y >= img_h {
        return Err(format!(
            "Area crop di luar batas gambar (x={}, y={}, gambar {}×{})",
            crop_x, crop_y, img_w, img_h
        ));
    }
    let edge_x = crop_x as u64 + crop_w as u64;
    let edge_y = crop_y as u64 + crop_h as u64;
    if edge_x > img_w as u64 + CROP_ROUNDING_TOLERANCE as u64
        || edge_y > img_h as u64 + CROP_ROUNDING_TOLERANCE as u64
    {
        return Err(format!(
            "Area crop melebihi batas gambar (kanan={}, bawah={}, gambar {}×{})",
            edge_x, edge_y, img_w, img_h
        ));
    }

    // Pemotongan toleran terhadap pembulatan sub-piksel dari UI
    let safe_w = crop_w.min(img_w - crop_x);
    let safe_h = crop_h.min(img_h - crop_y);

    // Normalisasi sudut ke rentang (-180, 180]
    let wrapped = rotation_deg % 360.0;
    let normalized_rot = if wrapped > 180.0 {
        wrapped - 360.0
    } else if wrapped <= -180.0 {
        wrapped + 360.0
    } else {
        wrapped
    };

    // Resampling berpresisi tinggi (Lanczos3 untuk ketajaman maksimal pas foto).
    // Rotasi 0° memakai jalur cepat tanpa interpolasi tambahan.
    let cropped_dyn: DynamicImage = if normalized_rot.abs() < 0.01 {
        DynamicImage::ImageRgba8(
            imageops::crop_imm(&img, crop_x, crop_y, safe_w, safe_h).to_image(),
        )
    } else {
        DynamicImage::ImageRgba8(rotated_crop(
            &img,
            crop_x,
            crop_y,
            safe_w,
            safe_h,
            normalized_rot,
        ))
    };

    let resized = imageops::resize(&cropped_dyn, target_w, target_h, FilterType::Lanczos3);

    // Encode ke format yang dipilih
    let mut output_bytes = Vec::new();
    let dyn_resized = DynamicImage::ImageRgba8(resized);

    match format {
        OutputFormat::Jpeg => {
            // Encode JPEG dengan kualitas tinggi 95% untuk cetak dokumen resmi
            let rgb_img = dyn_resized.to_rgb8();
            rgb_img
                .write_to(&mut Cursor::new(&mut output_bytes), ImageOutputFormat::Jpeg(95))
                .map_err(|e| format!("Gagal encode JPEG: {}", e))?;
        }
        OutputFormat::Png => {
            dyn_resized
                .write_to(&mut Cursor::new(&mut output_bytes), ImageOutputFormat::Png)
                .map_err(|e| format!("Gagal encode PNG: {}", e))?;
        }
    }

    // Tuliskan metadata DPI agar densitas cetak (mis. 300 DPI) ikut tersimpan
    dpi::embed_dpi(&mut output_bytes, format, dpi)?;

    Ok(output_bytes)
}

/// C-ABI pemrosesan crop yang dipanggil langsung oleh WebAssembly host
/// Return: 0 = sukses, 1 = input null/kosong, 2 = proses gagal (decode/encode),
/// 3 = area crop tidak valid, 4 = ukuran target tidak valid, 6 = input terlalu besar.
/// Pesan penyebab kegagalan dapat dibaca lewat `get_last_error_ptr`/`get_last_error_len`.
#[no_mangle]
pub extern "C" fn crop_process(
    img_ptr: *const u8,
    img_len: usize,
    crop_x: u32,
    crop_y: u32,
    crop_w: u32,
    crop_h: u32,
    target_w: u32,
    target_h: u32,
    rotation_deg: f32,
    flip_h: u32,
    flip_v: u32,
    output_format_code: u32,
    dpi: u32,
) -> u32 {
    if img_ptr.is_null() || img_len == 0 {
        return 1;
    }

    let input_slice = unsafe { std::slice::from_raw_parts(img_ptr, img_len) };
    let format = if output_format_code == 1 {
        OutputFormat::Png
    } else {
        OutputFormat::Jpeg
    };

    match crop_and_resize_image(
        input_slice,
        crop_x,
        crop_y,
        crop_w,
        crop_h,
        target_w,
        target_h,
        rotation_deg,
        flip_h != 0,
        flip_v != 0,
        format,
        dpi,
    ) {
        Ok(result_bytes) => {
            *lock_output() = result_bytes;
            // Bersihkan pesan error lama agar tidak menyesatkan pemanggilan berikutnya
            lock_error().clear();
            0
        }
        Err(message) => {
            // Kode error dipetakan dari kategori pesan agar host dapat membedakan sebabnya
            let code = if message.starts_with("Ukuran target") {
                4
            } else if message.starts_with("Area crop") {
                3
            } else if message.starts_with("Ukuran berkas") {
                6
            } else {
                2
            };
            set_last_error(&message);
            code
        }
    }
}
