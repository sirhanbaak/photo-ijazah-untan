# PixelCrop Studio - Aplikasi Pas Foto 4×6 (Rust WebAssembly)

Aplikasi web pemotong (*cropping*) dan pengubah ukuran pas foto standar 4×6 cm dengan ketajaman tinggi (*high-fidelity Lanczos resampling*) yang diproses murni di sisi browser pengguna (*client-side*) menggunakan **Rust WebAssembly**.

---

## 🎯 Standar Ukuran Pas Foto 4×6 Berdasarkan DPI

Ukuran foto 4×6 cm standar pas foto dokumen resmi (ijazah, buku nikah, paspor, pendaftaran seleksi CPNS/PPDS) memiliki dimensi piksel sesuai nilai DPI (*dots per inch*):

| Kerapatan DPI | Dimensi Piksel | Dimensi Fisik Cetak | Kategori Penggunaan |
| :--- | :--- | :--- | :--- |
| **72 DPI** | `108 × 158 px` | 3.81 × 5.57 cm | Layar Standar |
| **96 DPI** | `144 × 211 px` | 3.81 × 5.58 cm | Tampilan Web & Digital |
| **150 DPI** | `225 × 330 px` | 3.81 × 5.59 cm | Kualitas Medium |
| **200 DPI** | `300 × 440 px` | 3.81 × 5.59 cm | Cetak Cepat |
| **300 DPI** *(Default)* | `450 × 660 px` | 3.81 × 5.59 cm | **Standar Cetak Tajam / Dokumen Ijazah Resmi** |
| **400 DPI** | `600 × 880 px` | 3.81 × 5.59 cm | Ultra Tajam (*High-End Print*) |
| **Konversi Digital Umum** | `472 × 709 px` | 3.99 × 6.00 cm | Standar Portal Akademik / Seleksi Online |

---

## ✨ Fitur Utama

- 🦀 **Engine Rust WebAssembly**: Pemotongan, rotasi, flip, dan resampling citra dieksekusi secara instan di peramban tanpa mengunggah data foto ke server pihak ketiga (100% aman dan privat).
- 🔲 **Template Kotak Crop Bebas & Presisi**:
  - Aspek rasio terkunci pada proporsi pas foto 4:6.
  - Dapat digeser (*drag*) dan diperbesar/diperkecil (*8 grab handles*) dengan bebas di atas gambar sumber.
  - Dilengkapi garis bantu **Rule of Thirds (3×3)** dan titik bidik tengah (*crosshair*) untuk memudahkan penyesuaian posisi wajah dan bahu.
- 🔍 **Kanvas Interaktif**:
  - Kontrol Zoom (25% s/d 300%) dan Pan (*geser kanvas dengan mouse atau tahan Spasi*).
  - Pelurusan rotasi halus (-45° s/d +45°) serta putar bertahap 90° dan flip horizontal/vertikal — hasil ekspor selalu sama dengan pratinjau.
- 🖼️ **Area Pratinjau Terpisah**:
  - Hasil pemotongan ditampilkan pada dialog pratinjau khusus lengkap dengan informasi ukuran piksel, dimensi fisik cetak (cm), DPI, dan perkiraan ukuran file.
  - Pilihan format ekspor: **JPEG** (kualitas 95% untuk upload ijazah) atau **PNG** (lossless).
  - Tombol unduh otomatis dengan penamaan berkas terstruktur.
- 🏷️ **Metadata DPI Tertanam**: Berkas hasil ekspor menyimpan densitas cetak langsung di dalam metadata — chunk `pHYs` untuk PNG dan segmen `APP0/JFIF` untuk JPEG — sehingga aplikasi cetak membaca **300 DPI**, bukan 72 DPI bawaan.

---

## 🚀 Cara Menjalankan

### 1. Menjalankan Server Lokal

Aplikasi menggunakan WebAssembly sehingga membutuhkan server HTTP lokal untuk menyajikan file `.wasm` dengan MIME type yang benar:

```bash
python server.py
```

Buka peramban Anda di:
👉 **`http://localhost:8080`**

### 2. Kompilasi Ulang Modul Rust WASM (Opsional)

Jika Anda memodifikasi kode pemrosesan di folder `wasm_crop/src/lib.rs`:

```bash
# Pastikan target wasm32 terpasang
rustup target add wasm32-unknown-unknown

# Uji engine Rust (termasuk regresi rotasi & validasi area crop)
cargo test --manifest-path wasm_crop/Cargo.toml

# Kompilasi release lalu salin otomatis ke public/crop/wasm_crop.wasm
npm run build:wasm
```

### 3. Menjalankan Pengujian

```bash
npm run test:wasm        # Uji bridge WebAssembly via Node
npm run test:playwright  # Uji E2E Chromium (Desktop & Mobile)
npm test                 # Keduanya
```

### 4. Batas Pemrosesan

- Ukuran berkas unggahan maksimum **25 MB**.
- Dimensi sumber dibatasi **4096 px** pada sisi terpanjang sebelum dikirim ke engine.
- Orientasi EXIF dan format seperti WebP dinormalisasi di peramban (canvas), sehingga engine Rust selalu menerima JPEG/PNG yang sudah tegak.
- Rotasi halus (-45° s/d +45°) dan putaran 90° menghasilkan berkas ekspor yang identik dengan pratinjau.
- Koordinat crop divalidasi di UI dan di engine; area di luar batas ditolak dengan pesan kesalahan spesifik.

---

## 📁 Struktur Direktori

```
PhotoIjazah/
├── docs/
│   └── superpowers/
│       ├── specs/2026-10-20-photo-crop-wasm-design.md
│       └── plans/2026-10-20-photo-crop-wasm.md
├── public/
│   ├── index.html            # Beranda Layanan Penerbitan Ijazah Untan
│   ├── panduan.html          # Panduan & Persyaratan Dokumen
│   ├── pengajuan.html        # Formulir Pengajuan Permohonan Ijazah Online
│   ├── lacak.html            # Lacak Status Tiket Pengajuan Ijazah
│   ├── logo.png              # Aset Logo Resmi Universitas Tanjungpura
│   ├── logo-IAIs.png         # Aset Logo Associate Partner
│   └── crop/                 # Aplikasi Pemotong Pas Foto 4x6
│       ├── index.html        # Antarmuka PixelCrop Studio
│       ├── style.css         # Tema Darkroom, handles & custom styling
│       ├── app.js            # Interaksi kanvas, crop box, event listeners
│       ├── wasm_bridge.js    # Modul loader & memory bridge Rust WebAssembly
│       ├── wasm_crop.wasm    # Binary WebAssembly terkompilasi (~480 KB)
│       └── sample.jpg        # Foto formal contoh pas foto
├── wasm_crop/                # Crate Rust
│   ├── Cargo.toml
│   ├── src/lib.rs        # Core C-ABI & image processing engine
│   └── tests/crop_tests.rs
├── tests/
│   └── wasm_bridge.test.js
├── server.py             # Server HTTP lokal dengan MIME-type application/wasm
└── README.md
```
