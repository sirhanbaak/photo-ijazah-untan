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
  - Pelurusan rotasi halus (-45° s/d +45°) serta putar bertahap 90° dan flip horizontal/vertikal.
- 🖼️ **Area Pratinjau Terpisah**:
  - Hasil pemotongan ditampilkan pada dialog pratinjau khusus lengkap dengan informasi ukuran piksel, dimensi fisik cetak (cm), DPI, dan perkiraan ukuran file.
  - Pilihan format ekspor: **JPEG** (kualitas 95% untuk upload ijazah) atau **PNG** (lossless).
  - Tombol unduh otomatis dengan penamaan berkas terstruktur.

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

# Jalankan pengujian unit test Rust
cargo test --manifest-path wasm_crop/Cargo.toml

# Kompilasi ke binary release WebAssembly
cargo build --manifest-path wasm_crop/Cargo.toml --target wasm32-unknown-unknown --release

# Salin binary ke folder public
cp wasm_crop/target/wasm32-unknown-unknown/release/wasm_crop.wasm public/wasm_crop.wasm
```

---

## 📁 Struktur Direktori

```
PhotoIjazah/
├── docs/
│   └── superpowers/
│       ├── specs/2026-10-20-photo-crop-wasm-design.md
│       └── plans/2026-10-20-photo-crop-wasm.md
├── public/
│   ├── index.html        # Antarmuka PixelCrop Studio
│   ├── style.css         # Tema Darkroom, handles & custom styling
│   ├── app.js            # Interaksi kanvas, crop box, event listeners
│   ├── wasm_bridge.js    # Modul loader & memory bridge Rust WebAssembly
│   ├── wasm_crop.wasm    # Binary WebAssembly terkompilasi (~499 KB)
│   └── sample.jpg        # Foto formal contoh pas foto
├── wasm_crop/            # Crate Rust
│   ├── Cargo.toml
│   ├── src/lib.rs        # Core C-ABI & image processing engine
│   └── tests/crop_tests.rs
├── tests/
│   └── wasm_bridge.test.js
├── server.py             # Server HTTP lokal dengan MIME-type application/wasm
└── README.md
```
