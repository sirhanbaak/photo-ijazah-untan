use image::imageops::{self, FilterType};
use image::{DynamicImage, GenericImageView, ImageOutputFormat};
use std::io::Cursor;
use std::sync::Mutex;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OutputFormat {
    Jpeg,
    Png,
}

// Global output buffer untuk memegang hasil crop untuk dibaca oleh WebAssembly / host
static OUTPUT_BUFFER: Mutex<Vec<u8>> = Mutex::new(Vec::new());

/// Alokasi buffer memori dari sisi JavaScript host
#[no_mangle]
pub extern "C" fn alloc(size: usize) -> *mut u8 {
    let mut buf = Vec::with_capacity(size);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

/// Dealokasi buffer memori dari sisi JavaScript host
#[no_mangle]
pub extern "C" fn dealloc(ptr: *mut u8, size: usize) {
    if !ptr.is_null() && size > 0 {
        unsafe {
            let _ = Vec::from_raw_parts(ptr, 0, size);
        }
    }
}

/// Pointer ke hasil output
#[no_mangle]
pub extern "C" fn get_output_ptr() -> *const u8 {
    let buf = OUTPUT_BUFFER.lock().unwrap();
    buf.as_ptr()
}

/// Panjang byte hasil output
#[no_mangle]
pub extern "C" fn get_output_len() -> usize {
    let buf = OUTPUT_BUFFER.lock().unwrap();
    buf.len()
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
) -> Result<Vec<u8>, String> {
    if target_w == 0 || target_h == 0 {
        return Err("Ukuran target (lebar/tinggi) tidak boleh 0".to_string());
    }

    // Decode citra dari bytes
    let mut img = image::load_from_memory(image_bytes)
        .map_err(|e| format!("Gagal mendecode gambar: {}", e))?;

    // Terapkan flip jika diminta
    if flip_h {
        img = img.fliph();
    }
    if flip_v {
        img = img.flipv();
    }

    // Terapkan rotasi derajat jika merupakan kelipatan 90
    let normalized_rot = ((rotation_deg % 360.0) + 360.0) % 360.0;
    if (normalized_rot - 90.0).abs() < 0.1 {
        img = img.rotate90();
    } else if (normalized_rot - 180.0).abs() < 0.1 {
        img = img.rotate180();
    } else if (normalized_rot - 270.0).abs() < 0.1 {
        img = img.rotate270();
    }

    let (img_w, img_h) = img.dimensions();
    if img_w == 0 || img_h == 0 {
        return Err("Dimensi gambar sumber kosong (0 piksel)".to_string());
    }

    // Pastikan crop box berada di dalam batas gambar (boundary clamping)
    let safe_x = crop_x.min(img_w.saturating_sub(1));
    let safe_y = crop_y.min(img_h.saturating_sub(1));
    let safe_w = crop_w.min(img_w - safe_x).max(1);
    let safe_h = crop_h.min(img_h - safe_y).max(1);

    // Potong sub-area dari citra
    let cropped = imageops::crop_imm(&img, safe_x, safe_y, safe_w, safe_h).to_image();
    let cropped_dyn = DynamicImage::ImageRgba8(cropped);

    // Resampling berpresisi tinggi (Lanczos3 menghasilkan ketajaman maksimal untuk pas foto)
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

    Ok(output_bytes)
}

/// C-ABI pemrosesan crop yang dipanggil langsung oleh WebAssembly host
/// Return: 0 = sukses, 1 = input null/kosong, 2 = proses gagal
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
    ) {
        Ok(result_bytes) => {
            let mut buf = OUTPUT_BUFFER.lock().unwrap();
            *buf = result_bytes;
            0
        }
        Err(_err) => 2,
    }
}
