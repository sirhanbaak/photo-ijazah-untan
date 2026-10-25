//! Penulisan metadata DPI (resolusi cetak) ke berkas hasil encode.
//!
//! Encoder `image` (0.24) hanya menuliskan dimensi piksel tanpa densitas cetak,
//! sehingga foto 450 x 660 px untuk preset 300 DPI tetap terbaca sebagai 72 DPI
//! oleh peramban, portal akademik, maupun aplikasi percetakan. Modul ini menambal
//! metadata tersebut langsung pada byte hasil encode:
//!
//! - **JPEG**: segmen `APP0`/`JFIF` dengan `units = 1` (dots per inch) dan
//!   `X/Y density = dpi`. Bila encoder tidak menyertakan `APP0`, segmen baru
//!   disisipkan tepat setelah marker `SOI`.
//! - **PNG**: chunk `pHYs` (piksel per meter, `unit = 1`) yang disisipkan sebelum
//!   chunk `IDAT` sesuai spesifikasi PNG.

use crate::OutputFormat;

const PNG_SIGNATURE: [u8; 8] = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

/// Panjang segmen APP0/JFIF yang disisipkan (termasuk 2 byte field panjang).
const JFIF_APP0_LEN: u16 = 16;

/// Jumlah piksel per meter untuk nilai DPI tertentu (dipakai chunk `pHYs`).
fn dpi_to_pixels_per_meter(dpi: u16) -> u32 {
    ((dpi as f64) / 0.0254).round() as u32
}

/// Menuliskan metadata DPI ke bytes hasil encode sesuai format keluaran.
pub fn embed_dpi(bytes: &mut Vec<u8>, format: OutputFormat, dpi: u32) -> Result<(), String> {
    let dpi = dpi.clamp(1, u16::MAX as u32) as u16;
    match format {
        OutputFormat::Jpeg => embed_jpeg_dpi(bytes, dpi),
        OutputFormat::Png => embed_png_dpi(bytes, dpi),
    }
}

/// Menambal / menyisipkan segmen APP0 JFIF pada berkas JPEG.
fn embed_jpeg_dpi(bytes: &mut Vec<u8>, dpi: u16) -> Result<(), String> {
    if bytes.len() < 4 || bytes[0] != 0xFF || bytes[1] != 0xD8 {
        return Err("Berkas JPEG tidak diawali marker SOI".to_string());
    }

    let mut i = 2usize;
    while i + 4 <= bytes.len() {
        if bytes[i] != 0xFF {
            return Err("Struktur segmen JPEG tidak valid".to_string());
        }
        let marker = bytes[i + 1];

        // Byte pengisi (fill byte) di antara marker.
        if marker == 0xFF {
            i += 1;
            continue;
        }
        // Marker tanpa payload: TEM (0x01), RST0-RST7 (0xD0-0xD7), SOI (0xD8).
        if marker == 0x01 || (0xD0..=0xD8).contains(&marker) {
            i += 2;
            continue;
        }
        // EOI sebelum APP0 -> metadata tidak dapat disisipkan.
        if marker == 0xD9 {
            break;
        }
        // SOS: seluruh metadata wajib berada sebelum segmen ini.
        if marker == 0xDA {
            break;
        }

        let seg_len = u16::from_be_bytes([bytes[i + 2], bytes[i + 3]]) as usize;
        if seg_len < 2 || i + 2 + seg_len > bytes.len() {
            return Err("Panjang segmen JPEG tidak valid".to_string());
        }

        let data = i + 4; // awal payload segmen
        if marker == 0xE0
            && seg_len >= JFIF_APP0_LEN as usize
            && bytes[data..data + 5] == [b'J', b'F', b'I', b'F', 0x00]
        {
            bytes[data + 7] = 1; // units: 1 = dots per inch
            bytes[data + 8..data + 10].copy_from_slice(&dpi.to_be_bytes());
            bytes[data + 10..data + 12].copy_from_slice(&dpi.to_be_bytes());
            return Ok(());
        }

        i += 2 + seg_len;
    }

    // Encoder tidak menulis APP0/JFIF -> sisipkan tepat setelah SOI.
    let mut app0 = Vec::with_capacity(JFIF_APP0_LEN as usize);
    app0.extend_from_slice(&[0xFF, 0xE0]);
    app0.extend_from_slice(&JFIF_APP0_LEN.to_be_bytes());
    app0.extend_from_slice(b"JFIF\0");
    app0.extend_from_slice(&[0x01, 0x01, 0x01]); // versi 1.1, units = 1 (inch)
    app0.extend_from_slice(&dpi.to_be_bytes()); // Xdensity
    app0.extend_from_slice(&dpi.to_be_bytes()); // Ydensity
    app0.extend_from_slice(&[0x00, 0x00]); // tanpa thumbnail
    bytes.splice(2..2, app0);

    Ok(())
}

/// Menambal / menyisipkan chunk `pHYs` pada berkas PNG.
fn embed_png_dpi(bytes: &mut Vec<u8>, dpi: u16) -> Result<(), String> {
    if bytes.len() < PNG_SIGNATURE.len() || bytes[0..8] != PNG_SIGNATURE {
        return Err("Berkas PNG tidak memiliki signature yang valid".to_string());
    }

    let ppm = dpi_to_pixels_per_meter(dpi);
    let mut payload = Vec::with_capacity(9);
    payload.extend_from_slice(&ppm.to_be_bytes()); // piksel per meter (sumbu X)
    payload.extend_from_slice(&ppm.to_be_bytes()); // piksel per meter (sumbu Y)
    payload.push(1); // satuan: 1 = meter

    let mut pos = PNG_SIGNATURE.len();
    while pos + 12 <= bytes.len() {
        let chunk_len =
            u32::from_be_bytes([bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]])
                as usize;
        let chunk_end = pos + 12 + chunk_len;
        if chunk_end > bytes.len() {
            return Err("Panjang chunk PNG tidak valid".to_string());
        }

        let kind = &bytes[pos + 4..pos + 8];

        if kind == b"pHYs" && chunk_len == 9 {
            let data = pos + 8;
            bytes[data..data + 9].copy_from_slice(&payload);
            let crc = crc32(&bytes[pos + 4..data + 9]);
            bytes[data + 9..data + 13].copy_from_slice(&crc.to_be_bytes());
            return Ok(());
        }

        // pHYs wajib muncul sebelum IDAT -> sisipkan bila belum ada.
        if kind == b"IDAT" {
            let mut chunk = Vec::with_capacity(21);
            chunk.extend_from_slice(&9u32.to_be_bytes());
            chunk.extend_from_slice(b"pHYs");
            chunk.extend_from_slice(&payload);
            chunk.extend_from_slice(&crc32(&chunk[4..17]).to_be_bytes());
            bytes.splice(pos..pos, chunk);
            return Ok(());
        }

        pos = chunk_end;
    }

    Err("Chunk IDAT tidak ditemukan pada berkas PNG".to_string())
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
