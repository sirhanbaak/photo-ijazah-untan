use image::{ImageBuffer, Rgba};
use std::io::Cursor;
use wasm_crop::{crop_and_resize_image, OutputFormat};

#[test]
fn test_all_4x6_dpi_presets() {
    // Buat gambar sintetis 1200x1600 RGBA
    let img: ImageBuffer<Rgba<u8>, Vec<u8>> = ImageBuffer::from_pixel(1200, 1600, Rgba([200, 50, 50, 255]));
    let mut png_bytes = Vec::new();
    img.write_to(&mut Cursor::new(&mut png_bytes), image::ImageOutputFormat::Png)
        .expect("Gagal encode dummy PNG");

    let presets = [
        ("72 DPI", 108, 158, 72),
        ("96 DPI", 144, 211, 96),
        ("150 DPI", 225, 330, 150),
        ("200 DPI", 300, 440, 200),
        ("300 DPI (Standar Cetak)", 450, 660, 300),
        ("400 DPI", 600, 880, 400),
        ("Digital Konversi Umum", 472, 709, 300),
    ];

    for (label, target_w, target_h, dpi) in presets {
        // Crop bagian tengah (misal x: 200, y: 100, w: 800, h: 1200)
        let output_bytes = crop_and_resize_image(
            &png_bytes,
            200,
            100,
            800,
            1200,
            target_w,
            target_h,
            0.0,
            false,
            false,
            OutputFormat::Png,
            dpi,
        )
        .expect(&format!("Gagal crop untuk preset {}", label));

        let res_img = image::load_from_memory(&output_bytes)
            .expect(&format!("Gagal load output untuk preset {}", label));

        assert_eq!(
            res_img.width(),
            target_w,
            "Lebar tidak cocok untuk preset {}",
            label
        );
        assert_eq!(
            res_img.height(),
            target_h,
            "Tinggi tidak cocok untuk preset {}",
            label
        );
    }
}

#[test]
fn test_c_abi_allocation_and_crop() {
    // Test alokasi buffer dan C-ABI functions
    use wasm_crop::{alloc, dealloc, crop_process, get_output_ptr, get_output_len};

    let img: ImageBuffer<Rgba<u8>, Vec<u8>> = ImageBuffer::from_pixel(600, 800, Rgba([100, 150, 200, 255]));
    let mut png_bytes = Vec::new();
    img.write_to(&mut Cursor::new(&mut png_bytes), image::ImageOutputFormat::Png).unwrap();

    let input_len = png_bytes.len();
    let ptr = alloc(input_len);
    assert!(!ptr.is_null());

    unsafe {
        std::ptr::copy_nonoverlapping(png_bytes.as_ptr(), ptr, input_len);
        let ret = crop_process(
            ptr,
            input_len,
            50,
            50,
            400,
            600,
            450,
            660,
            0.0,
            0,
            0,
            1, // PNG
            300,
        );
        assert_eq!(ret, 0, "crop_process harus mengembalikan status 0 (sukses)");

        let out_len = get_output_len();
        assert!(out_len > 0);
        let out_ptr = get_output_ptr();
        assert!(!out_ptr.is_null());

        let out_slice = std::slice::from_raw_parts(out_ptr, out_len);
        let loaded = image::load_from_memory(out_slice).unwrap();
        assert_eq!(loaded.width(), 450);
        assert_eq!(loaded.height(), 660);

        dealloc(ptr, input_len);
    }
}

#[test]
fn test_metadata_dpi_tertulis_pada_jpeg_dan_png() {
    let img: ImageBuffer<Rgba<u8>, Vec<u8>> = ImageBuffer::from_pixel(1200, 1600, Rgba([30, 60, 120, 255]));
    let mut png_bytes = Vec::new();
    img.write_to(&mut Cursor::new(&mut png_bytes), image::ImageOutputFormat::Png)
        .expect("Gagal encode dummy PNG");

    for dpi in [72u32, 150, 300, 400] {
        let jpeg = crop_and_resize_image(
            &png_bytes, 100, 100, 600, 900, 450, 660, 0.0, false, false, OutputFormat::Jpeg, dpi,
        )
        .expect("Gagal crop JPEG");

        let (units, density_x, density_y) =
            baca_density_jfif(&jpeg).expect("Segmen APP0/JFIF wajib ada sebelum SOS");
        assert_eq!(units, 1, "JFIF units harus 1 (dots per inch) untuk {dpi} DPI");
        assert_eq!(density_x, dpi as u16, "Xdensity JFIF harus {dpi}");
        assert_eq!(density_y, dpi as u16, "Ydensity JFIF harus {dpi}");

        let png = crop_and_resize_image(
            &png_bytes, 100, 100, 600, 900, 450, 660, 0.0, false, false, OutputFormat::Png, dpi,
        )
        .expect("Gagal crop PNG");

        let (ppm_x, ppm_y, unit, crc_valid) =
            baca_phys(&png).expect("Chunk pHYs wajib ada sebelum IDAT");
        assert!(crc_valid, "CRC chunk pHYs tidak valid untuk {dpi} DPI");
        assert_eq!(unit, 1, "pHYs unit harus 1 (meter) untuk {dpi} DPI");
        let expected_ppm = ((dpi as f64) / 0.0254).round() as u32;
        assert_eq!(ppm_x, expected_ppm, "pHYs sumbu X harus {expected_ppm} px/m");
        assert_eq!(ppm_y, expected_ppm, "pHYs sumbu Y harus {expected_ppm} px/m");

        // Pastikan penyisipan metadata tidak merusak struktur berkas.
        let decoded_jpeg = image::load_from_memory(&jpeg).expect("JPEG hasil harus tetap valid");
        assert_eq!((decoded_jpeg.width(), decoded_jpeg.height()), (450, 660));
        let decoded_png = image::load_from_memory(&png).expect("PNG hasil harus tetap valid");
        assert_eq!((decoded_png.width(), decoded_png.height()), (450, 660));
    }
}


// ---------------------------------------------------------------------------
// Regresi rotasi, validasi area crop, dan penyampaian pesan error
// ---------------------------------------------------------------------------

/// Gambar uji 400×400: separuh kiri merah, separuh kanan biru.
fn gambar_dua_warna() -> Vec<u8> {
    let mut img: ImageBuffer<Rgba<u8>, Vec<u8>> =
        ImageBuffer::from_pixel(400, 400, Rgba([0, 0, 255, 255]));
    for y in 0..400 {
        for x in 0..200 {
            img.put_pixel(x, y, Rgba([255, 0, 0, 255]));
        }
    }

    let mut png_bytes = Vec::new();
    img.write_to(&mut Cursor::new(&mut png_bytes), image::ImageOutputFormat::Png)
        .expect("Gagal encode gambar uji");
    png_bytes
}

#[test]
fn test_rotasi_90_derajat_memutar_isi_crop() {
    let png_bytes = gambar_dua_warna();

    let output = crop_and_resize_image(
        &png_bytes,
        150,
        150,
        100,
        100,
        100,
        100,
        90.0,
        false,
        false,
        OutputFormat::Png,
        300,
    )
    .expect("Crop dengan rotasi 90° harus berhasil");

    let hasil = image::load_from_memory(&output)
        .expect("Output rotasi harus valid")
        .to_rgba8();

    // Rotasi 90° searah jarum jam: sisi kiri (merah) berpindah ke atas.
    let atas = hasil.get_pixel(50, 5);
    let bawah = hasil.get_pixel(50, 94);
    assert!(
        atas[0] > 200 && atas[2] < 50,
        "Bagian atas harus merah, didapat {:?}",
        atas
    );
    assert!(
        bawah[2] > 200 && bawah[0] < 50,
        "Bagian bawah harus biru, didapat {:?}",
        bawah
    );
}

#[test]
fn test_rotasi_360_sama_dengan_tanpa_rotasi() {
    let png_bytes = gambar_dua_warna();
    let tanpa_rotasi = crop_and_resize_image(
        &png_bytes,
        40,
        60,
        80,
        80,
        80,
        80,
        0.0,
        false,
        false,
        OutputFormat::Png,
        300,
    )
    .expect("Crop tanpa rotasi harus berhasil");
    let rotasi_penuh = crop_and_resize_image(
        &png_bytes,
        40,
        60,
        80,
        80,
        80,
        80,
        360.0,
        false,
        false,
        OutputFormat::Png,
        300,
    )
    .expect("Crop dengan rotasi 360° harus berhasil");

    assert_eq!(
        tanpa_rotasi, rotasi_penuh,
        "Rotasi 360° harus identik dengan tanpa rotasi"
    );
}

#[test]
fn test_rotasi_30_derajat_mengubah_piksel() {
    let png_bytes = gambar_dua_warna();
    let args = (140u32, 140u32, 120u32, 120u32, 120u32, 120u32);

    let tanpa_rotasi = crop_and_resize_image(
        &png_bytes,
        args.0,
        args.1,
        args.2,
        args.3,
        args.4,
        args.5,
        0.0,
        false,
        false,
        OutputFormat::Png,
        300,
    )
    .expect("Crop tanpa rotasi harus berhasil");
    let miring = crop_and_resize_image(
        &png_bytes,
        args.0,
        args.1,
        args.2,
        args.3,
        args.4,
        args.5,
        30.0,
        false,
        false,
        OutputFormat::Png,
        300,
    )
    .expect("Crop dengan rotasi 30° harus berhasil");

    let a = image::load_from_memory(&tanpa_rotasi).unwrap().to_rgba8();
    let b = image::load_from_memory(&miring).unwrap().to_rgba8();
    assert_eq!((b.width(), b.height()), (120, 120));
    assert!(
        a.pixels().zip(b.pixels()).any(|(pa, pb)| pa != pb),
        "Rotasi 30° harus menghasilkan piksel yang berbeda dari rotasi 0°"
    );
}

#[test]
fn test_status_engine_menolak_input_di_luar_batas() {
    let png_bytes = gambar_dua_warna();
    let err = crop_and_resize_image(
        &png_bytes,
        5000,
        0,
        100,
        100,
        100,
        100,
        0.0,
        false,
        false,
        OutputFormat::Png,
        300,
    )
    .expect_err("Crop di luar batas harus ditolak");
    assert!(err.contains("Area crop"), "pesan error: {err}");

    let err_kanan = crop_and_resize_image(
        &png_bytes,
        350,
        0,
        100,
        100,
        100,
        100,
        0.0,
        false,
        false,
        OutputFormat::Png,
        300,
    )
    .expect_err("Crop yang melewati tepi kanan harus ditolak");
    assert!(err_kanan.contains("melebihi batas"), "pesan error: {err_kanan}");

    let err_nol = crop_and_resize_image(
        &png_bytes,
        0,
        0,
        0,
        100,
        100,
        100,
        0.0,
        false,
        false,
        OutputFormat::Png,
        300,
    )
    .expect_err("Crop dengan lebar 0 harus ditolak");
    assert!(err_nol.contains("Area crop"), "pesan error: {err_nol}");

    let err_target = crop_and_resize_image(
        &png_bytes,
        0,
        0,
        100,
        100,
        9000,
        660,
        0.0,
        false,
        false,
        OutputFormat::Png,
        300,
    )
    .expect_err("Target di atas batas harus ditolak");
    assert!(err_target.contains("Ukuran target"), "pesan error: {err_target}");
}

/// Gambar uji 400×400 dengan empat kuadran berbeda warna.
fn gambar_empat_kuadran() -> Vec<u8> {
    let mut img: ImageBuffer<Rgba<u8>, Vec<u8>> =
        ImageBuffer::from_pixel(400, 400, Rgba([255, 255, 255, 255]));
    for y in 0..400 {
        for x in 0..400 {
            let warna = match (x < 200, y < 200) {
                (true, true) => Rgba([255, 0, 0, 255]),     // kiri atas: merah
                (false, true) => Rgba([0, 255, 0, 255]),    // kanan atas: hijau
                (true, false) => Rgba([0, 0, 255, 255]),    // kiri bawah: biru
                (false, false) => Rgba([255, 255, 0, 255]), // kanan bawah: kuning
            };
            img.put_pixel(x, y, warna);
        }
    }

    let mut png_bytes = Vec::new();
    img.write_to(&mut Cursor::new(&mut png_bytes), image::ImageOutputFormat::Png)
        .expect("Gagal encode gambar uji");
    png_bytes
}

#[test]
fn test_rotasi_90_offset_mengikuti_geometri_pratinjau() {
    let png_bytes = gambar_empat_kuadran();

    // Kotak di kiri-atas. Setelah diputar 90° mengelilingi pusat gambar,
    // isi yang tampak di kotak tersebut berasal dari kuadran kiri-bawah (biru).
    let output = crop_and_resize_image(
        &png_bytes,
        20,
        20,
        40,
        40,
        40,
        40,
        90.0,
        false,
        false,
        OutputFormat::Png,
        300,
    )
    .expect("Crop offset dengan rotasi 90° harus berhasil");

    let hasil = image::load_from_memory(&output)
        .expect("Output rotasi harus valid")
        .to_rgba8();
    let tengah = hasil.get_pixel(20, 20);
    assert!(
        tengah[2] > 200 && tengah[0] < 60 && tengah[1] < 60,
        "Kuadran kiri-bawah (biru) harus muncul, didapat {:?}",
        tengah
    );

    // Tanpa rotasi, area yang sama berisi kuadran kiri-atas (merah)
    let tanpa_rotasi = crop_and_resize_image(
        &png_bytes,
        20,
        20,
        40,
        40,
        40,
        40,
        0.0,
        false,
        false,
        OutputFormat::Png,
        300,
    )
    .expect("Crop tanpa rotasi harus berhasil");
    let merah_gambar = image::load_from_memory(&tanpa_rotasi)
        .expect("Output crop harus valid")
        .to_rgba8();
    let merah = merah_gambar.get_pixel(20, 20);
    assert!(
        merah[0] > 200 && merah[1] < 60 && merah[2] < 60,
        "Tanpa rotasi area harus merah, didapat {:?}",
        merah
    );
}

/// Membaca `units` serta `X/Y density` dari segmen APP0/JFIF pertama pada JPEG.
/// Mengembalikan `None` bila segmen tidak ditemukan sebelum SOS.
fn baca_density_jfif(jpeg: &[u8]) -> Option<(u8, u16, u16)> {
    if jpeg.len() < 4 || jpeg[0] != 0xFF || jpeg[1] != 0xD8 {
        return None;
    }

    let mut i = 2usize;
    while i + 4 <= jpeg.len() {
        if jpeg[i] != 0xFF {
            return None;
        }
        let marker = jpeg[i + 1];
        if marker == 0xFF {
            i += 1;
            continue;
        }
        if marker == 0x01 || (0xD0..=0xD8).contains(&marker) {
            i += 2;
            continue;
        }
        if marker == 0xD9 || marker == 0xDA {
            return None;
        }

        let seg_len = u16::from_be_bytes([jpeg[i + 2], jpeg[i + 3]]) as usize;
        if seg_len < 2 || i + 2 + seg_len > jpeg.len() {
            return None;
        }

        let data = i + 4;
        if marker == 0xE0 && seg_len >= 16 && jpeg[data..data + 5] == [b'J', b'F', b'I', b'F', 0x00] {
            let units = jpeg[data + 7];
            let density_x = u16::from_be_bytes([jpeg[data + 8], jpeg[data + 9]]);
            let density_y = u16::from_be_bytes([jpeg[data + 10], jpeg[data + 11]]);
            return Some((units, density_x, density_y));
        }

        i += 2 + seg_len;
    }

    None
}

/// Membaca chunk `pHYs` (piksel/meter + satuan) beserta validasi CRC-nya.
fn baca_phys(png: &[u8]) -> Option<(u32, u32, u8, bool)> {
    if png.len() < 8 {
        return None;
    }

    let mut pos = 8usize;
    while pos + 12 <= png.len() {
        let chunk_len = u32::from_be_bytes([
            png[pos],
            png[pos + 1],
            png[pos + 2],
            png[pos + 3],
        ]) as usize;
        let chunk_end = pos + 12 + chunk_len;
        if chunk_end > png.len() {
            return None;
        }

        let kind = &png[pos + 4..pos + 8];

        if kind == b"pHYs" && chunk_len == 9 {
            let data = pos + 8;
            let ppm_x = u32::from_be_bytes([png[data], png[data + 1], png[data + 2], png[data + 3]]);
            let ppm_y = u32::from_be_bytes([
                png[data + 4],
                png[data + 5],
                png[data + 6],
                png[data + 7],
            ]);
            let unit = png[data + 8];
            let crc_terbaca = u32::from_be_bytes([
                png[data + 9],
                png[data + 10],
                png[data + 11],
                png[data + 12],
            ]);
            return Some((ppm_x, ppm_y, unit, crc_terbaca == crc32(&png[pos + 4..data + 9])));
        }

        // pHYs wajib mendahului IDAT.
        if kind == b"IDAT" {
            return None;
        }

        pos = chunk_end;
    }

    None
}

/// CRC-32 (polinomial 0xEDB88320) sesuai spesifikasi PNG.
fn crc32(data: &[u8]) -> u32 {
    let mut crc = 0xFFFF_FFFFu32;
    for &byte in data {
        crc ^= byte as u32;
        for _ in 0..8 {
            let mask = (crc & 1).wrapping_neg();
            crc = (crc >> 1) ^ (0xEDB8_8320 & mask);
        }
    }
    !crc
}

#[test]
fn test_custom_and_arbitrary_dimensions() {
    // 1. Uji sumber dengan berbagai macam rasio aspek dan ukuran
    let sources = [
        ("Landscape 16:9", 1920, 1080),
        ("Persegi 1:1", 1000, 1000),
        ("Ultra-tinggi 1:3", 600, 1800),
        ("Resolusi Kecil", 300, 400),
        ("Resolusi Tinggi", 3000, 4000),
    ];

    // 2. Berbagai macam ukuran target di luar preset baku 4x6
    let custom_targets = [
        ("Pas Foto 2x3 (300 DPI)", 236, 354, 300),
        ("Pas Foto 3x4 (300 DPI)", 354, 472, 300),
        ("Paspor ICAO 35x45mm (300 DPI)", 413, 531, 300),
        ("Persegi 1:1 (500x500)", 500, 500, 150),
        ("Dimensi Ganjil (333x555)", 333, 555, 200),
        ("Dimensi Kecil Ekstrem (64x96)", 64, 96, 72),
        ("Dimensi Besar (2400x3600)", 2400, 3600, 600),
    ];

    for &(src_name, src_w, src_h) in &sources {
        let img: ImageBuffer<Rgba<u8>, Vec<u8>> =
            ImageBuffer::from_pixel(src_w, src_h, Rgba([120, 160, 200, 255]));
        let mut src_bytes = Vec::new();
        img.write_to(&mut Cursor::new(&mut src_bytes), image::ImageOutputFormat::Png)
            .expect("Gagal encode PNG sumber");

        for &(target_name, target_w, target_h, dpi) in &custom_targets {
            // Ambil area crop di tengah sumber dengan batas aman
            let crop_w = (src_w / 2).max(10);
            let crop_h = (src_h / 2).max(10);
            let crop_x = (src_w - crop_w) / 4;
            let crop_y = (src_h - crop_h) / 4;

            for rot in [0.0f32, 12.5f32, -25.0f32] {
                let out_png = crop_and_resize_image(
                    &src_bytes,
                    crop_x,
                    crop_y,
                    crop_w,
                    crop_h,
                    target_w,
                    target_h,
                    rot,
                    false,
                    false,
                    OutputFormat::Png,
                    dpi,
                )
                .unwrap_or_else(|e| {
                    panic!(
                        "Gagal crop sumber '{src_name}' ({src_w}x{src_h}) ke target '{target_name}' ({target_w}x{target_h}, rot={rot}): {e}"
                    )
                });

                let loaded = image::load_from_memory(&out_png).expect("Output PNG harus dapat didecode");
                assert_eq!(
                    loaded.width(),
                    target_w,
                    "Lebar output harus persis {target_w} px (sumber: {src_name}, target: {target_name})"
                );
                assert_eq!(
                    loaded.height(),
                    target_h,
                    "Tinggi output harus persis {target_h} px (sumber: {src_name}, target: {target_name})"
                );
            }
        }
    }
}
