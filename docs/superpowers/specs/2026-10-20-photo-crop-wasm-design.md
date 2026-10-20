# Design Document: Aplikasi Pas Foto 4x6 Croping dengan Rust WebAssembly

**Tanggal:** 20 Oktober 2026  
**Status:** Menunggu Persetujuan Pengguna  
**Inspirasi Desain:** Proyek Stitch `projects/4260287883781724389` (*PixelCrop Studio - Photo Ijazah Untan*)

---

## 1. Intent & The Why

Aplikasi ini bertujuan untuk mempermudah calon wisudawan, mahasiswa, dan masyarakat umum dalam menyiapkan dan memotong (crop) pas foto ukuran standar 4x6 cm (misalnya untuk foto ijazah, dokumen lamaran CPNS/BUMN, atau buku nikah) dengan resolusi piksel dan DPI yang presisi. 

Dengan memanfaatkan **Rust WebAssembly (WASM)**, pemrosesan pemotongan citra, rotasi, dan resampling dilakukan secara lokal di sisi klien (browser) secara instan, aman tanpa mengunggah data foto privat ke server eksternal, dan menjaga ketajaman kualitas cetak.

---

## 2. Goals, Non-Goals, & Anti-Goals

### Goals
- **Preset Standar Pas Foto 4x6 (DPI-based):**
  - **72 DPI** (Layar standar): `108 × 158` piksel
  - **96 DPI** (Web / Digital): `144 × 211` piksel
  - **150 DPI** (Medium): `225 × 330` piksel
  - **200 DPI** (Cetak Cepat): `300 × 440` piksel
  - **300 DPI** (Standar Cetak Tajam / Ijazah Resmi): `450 × 660` piksel *(Default)*
  - **400 DPI** (Ultra Tajam): `600 × 880` piksel
  - **Standar Konversi Digital Umum**: `472 × 709` piksel
- **Kanvas Interaktif:**
  - Menampilkan foto sumber dengan fitur Pan (geser) dan Zoom (skala 25% - 300%).
  - Kotak template crop (*crop marquee box*) dengan rasio 4:6 yang dapat digeser bebas dan diubah ukurannya (*resizable* dengan menjaga rasio 4:6).
  - Garis panduan visual *Rule of Thirds* (3x3 grid) dan titik tengah (*center crosshair*) untuk membantu membidik proporsi wajah dan bahu sesuai standar pas foto.
  - Opsi rotasi pelurusan (-45° s/d +45°, +90° bertahap, Flip Horizontal / Vertikal).
- **Engine Pemrosesan Rust WebAssembly:**
  - Kode Rust yang dikompilasi menjadi WebAssembly (`.wasm`) bertugas melakukan slicing piksel, transformasi rotasi/flip, dan resampling interpolasi tinggi (bilinear/lanczos) dari foto asli ke ukuran target piksel yang dipilih.
- **Area Tampilan Hasil Terpisah & Unduh:**
  - Menampilkan hasil pemotongan (*cropped image preview*) di area terpisah (modal preview atau panel khusus) lengkap dengan informasi resolusi, perkiraan ukuran file, dan dimensi fisik cetak.
  - Tombol unduh hasil crop dalam format JPEG / PNG beresolusi tinggi sesuai target DPI.
- **UI Profesional Berkelas:**
  - Mengadopsi visual theme dari Stitch (*PixelCrop Studio*), nuansa *Dark Darkroom* (`#0b1326`, `#6366f1` Indigo, `#4cd7f6` Cyan, `#4edea3` Emerald) dengan tipografi *Plus Jakarta Sans*, *Inter*, dan *JetBrains Mono*.

### Non-Goals
- Tidak memerlukan backend server cloud/API pemrosesan foto (semua berjalan murni *client-side* di browser menggunakan Rust WASM).
- Tidak melakukan filter AI kecantikan (face smoothing, makeup AI) atau penghapusan latar belakang (background removal) otomatis di tahap awal ini, fokus utama adalah *precision crop & sizing*.

### Anti-Goals
- Tidak menghasilkan gambar buram atau pecah akibat penskalaan layar (crop dieksekusi dari piksel resolusi asli foto sumber, bukan dari resolusi kanvas CSS).
- Tidak mengubah rasio foto 4:6 menjadi gepeng/distorsi saat kotak pemotong diperbesar/diperkecil.

---

## 3. Constraints & Technical Decisions

1. **Rust & WASM Architecture:**
   - Target Rust: `wasm32-unknown-unknown`.
   - Modul Rust mengekspos fungsi pemrosesan citra berkecepatan tinggi:
     - `crop_and_resize(image_bytes, crop_x, crop_y, crop_width, crop_height, target_width, target_height, rotation_deg, flip_h, flip_v, format) -> Vec<u8>`.
   - Menghasilkan binary WASM yang ringan dan dapat dimuat langsung oleh antarmuka web melalui `WebAssembly.instantiate` atau `wasm-bindgen`.
2. **Frontend Interactivity:**
   - Single Page Application responsif berbasis HTML5 Canvas & DOM overlays.
   - Menggunakan Tailwind CSS CDN + Google Fonts sesuai rancangan Stitch.
   - Panning gambar dengan mouse drag (mode pan atau tahan Spasi), zooming dengan wheel mouse atau zoom slider.
3. **Format Dukungan:**
   - Input: JPEG, PNG, WEBP.
   - Output: JPEG kualitas tinggi (92-100%) dan PNG lossless.

---

## 4. User Workflow

1. **Unggah Foto:** Pengguna membuka aplikasi dan memilih/menarik (*drag & drop*) foto portrait dari perangkat.
2. **Atur Posisi & Komposisi:**
   - Foto tampil di ruang kerja (*canvas arena*).
   - Pengguna memilih preset DPI (default: 300 DPI - 450x660 px untuk foto ijazah).
   - Kotak crop 4:6 digeser dan diatur posisinya di atas kepala/bahu subjek dengan bantuan garis panduan *Rule of Thirds*.
   - Jika foto miring, pengguna dapat mengatur slider rotasi untuk meluruskannya.
3. **Terapkan Pemotongan:**
   - Pengguna menekan tombol "Terapkan Crop & Unduh".
   - Koordinat crop dikirim ke modul Rust WebAssembly yang memproses piksel gambar resolusi asli.
4. **Pratinjau & Unduh:**
   - Hasil foto yang sudah terpotong rapi ditampilkan di area pratinjau terpisah dengan detail resolusi (misal `450 × 660 px @ 300 DPI`).
   - Pengguna dapat mengunduh file langsung ke komputernya.

---

## 5. What's Left to the Builder

- Implementasi struktur crate Rust (`src/lib.rs`, `Cargo.toml`) dan mekanisme kompilasi ke WASM.
- Implementasi interaksi drag, resize handle kotak crop, dan bounding box constraints agar tidak keluar dari batas foto.
- Penataan script lokal untuk menjalankan aplikasi dan menyajikan berkas WASM dengan header MIME type yang tepat.
