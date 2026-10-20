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
        ("72 DPI", 108, 158),
        ("96 DPI", 144, 211),
        ("150 DPI", 225, 330),
        ("200 DPI", 300, 440),
        ("300 DPI (Standar Cetak)", 450, 660),
        ("400 DPI", 600, 880),
        ("Digital Konversi Umum", 472, 709),
    ];

    for (label, target_w, target_h) in presets {
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
