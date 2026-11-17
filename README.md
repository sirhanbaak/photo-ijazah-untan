# Portal Layanan Penerbitan Ijazah Universitas Tanjungpura

[![Production Status](https://img.shields.io/badge/status-production%20ready-emerald)](https://photo-ijazah-untan.vercel.app)
[![WebAssembly Engine](https://img.shields.io/badge/engine-Rust%20WASM-orange.svg)](https://photo-ijazah-untan.vercel.app/crop/)
[![Database](https://img.shields.io/badge/database-Supabase%20PostgreSQL-3ecf8e.svg)](https://supabase.com)
[![Testing Suite](https://img.shields.io/badge/tests-Playwright%20100%25%20passed-blue)](docs/TESTING.md)
[![PRD Version](https://img.shields.io/badge/PRD-v3.15-purple)](PRD.md)

Portal administrasi akademik dan penerbitan dokumen kelulusan terpadu bagi wisudawan, alumni, dan staf **Biro Akademik dan Kemahasiswaan (BAK) Universitas Tanjungpura**. Portal ini menggabungkan formulir permohonan daring terproteksi, pelacakan linimasa status berkas waktu-nyata, studio pemotong pas foto 4×6 murni sisi klien (*client-side*) berbasis **Rust WebAssembly**, dan sistem keamanan akun dengan **Autentikasi Multi-Faktor (MFA)**.

🌐 **Alamat Produksi Resmi:** [https://photo-ijazah-untan.vercel.app](https://photo-ijazah-untan.vercel.app)  
🏛️ **Pusat Layanan:** Gedung Rektorat Lantai 1 BAK UNTAN, Pontianak, Kalimantan Barat.

---

## 📚 Struktur Dokumentasi Proyek

Dokumentasi proyek telah ditata secara modular agar mudah dipelajari oleh seluruh pemangku kepentingan (*stakeholders*):

| Dokumen | Lokasi Berkas | Deskripsi & Isi Pokok |
| :--- | :--- | :--- |
| **Product Requirements Document (PRD)** | [PRD.md](PRD.md) / [docs/PRD.md](docs/PRD.md) | Spesifikasi produk lengkap v3.15, 5 klasifikasi layanan, aturan bisnis penguncian, standar pas foto 4×6, aturan dua lapis tombol crop, dan changelog komprehensif. |
| **Arsitektur Teknis & Database** | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Diagram arsitektur sistem, skema relasional 13 tabel Supabase, alur otentikasi MFA Web Crypto API, dan integrasi pilar sistem. |
| **Panduan Pengujian & QA Matrix** | [docs/TESTING.md](docs/TESTING.md) | Matriks pengujian otomatis Playwright (58+ skenario uji lulus 100%), konfigurasi desktop & mobile, dan seed akun demo uji coba. |

---

## 🏛️ Tujuh Pilar Ekosistem Portal

1. **Beranda & Katalog Layanan (`public/index.html`):**
   - Arsitektur visual **Bento Grid 12 Kolom** yang modular, rapi, dan responsif tanpa *horizontal overflow*.
   - Navigasi **Mega Menu** terkelompok (Layanan Ijazah, Panduan, Portal Akun) dengan penataan simetris berjarak lega.
   - Katalog 5 kategori layanan: *Penerbitan Baru*, *Perbaikan Data*, *Penerbitan Ulang*, *Pencetakan Ulang*, dan *Ijazah Digital TTE*.
2. **Panduan & SOP Persyaratan (`public/panduan.html`):**
   - Regulasi Permendikbudristek No. 6/2022, standar pas foto wisuda latar biru, dan checklist berkas.
3. **Formulir Pengajuan Terproteksi (`public/pengajuan.html`):**
   - Gerbang login (*auth gate*), pengisian data mahasiswa otomatis (*pre-fill*), validasi IPK numerik, dan integrasi penerima foto crop WASM.
4. **Pelacakan Status Berkas Real-Time (`public/lacak.html`):**
   - Pelacakan berbasis NIM / Nomor Tiket dengan otorisasi privasi data dan linimasa 6 tahapan berkas.
   - Pengecualian khusus Penerbitan Ulang: Tahap 3 (PISN) otomatis selesai dan dilewati.
5. **PixelCrop Studio WASM (`public/crop/`):**
   - Studio pemotong pas foto 4×6 murni client-side beresolusi 300 DPI dengan algoritma resampling Lanczos3.
   - **Aturan Dua Lapis Tombol Gunakan:** Tombol HANYA muncul jika pengguna telah login DAN berkas belum mencapai Tahap 4 (Pencetakan Blangko Sekuritas).
6. **Portal Pengguna & Autentikasi MFA (`public/user/`):**
   - Dasbor pemohon, pengaturan MFA (Email OTP, Google Authenticator TOTP, SMS, Backup Codes), ubah kata sandi, dan pemulihan akun (*forgot password*).
   - Kartu 1-klik akun demo uji coba cepat lengkap dengan penayangan langsung kode OTP (`123456`).
7. **Pangkalan Data Supabase & Cloud Storage:**
   - 13 tabel relasional PostgreSQL, bucket `dokumen-ijazah`, mekanisme auto-delete berkas usang, dan Row Level Security (RLS).

---

## 🎯 Standar Dimensi Pas Foto 4×6 cm Berdasarkan DPI

Aplikasi PixelCrop Studio mengunci proporsi pas foto ijazah pada rasio 4:6 dengan resolusi preset teruji:

| Kerapatan DPI | Dimensi Piksel | Dimensi Fisik Cetak | Kategori Penggunaan |
| :--- | :--- | :--- | :--- |
| **72 DPI** | `108 × 158 px` | 3.81 × 5.57 cm | Pratinjau Layar Standar |
| **96 DPI** | `144 × 211 px` | 3.81 × 5.58 cm | Tampilan Web & Digital |
| **150 DPI** | `225 × 330 px` | 3.81 × 5.59 cm | Kualitas Medium |
| **200 DPI** | `300 × 440 px` | 3.81 × 5.59 cm | Cetak Cepat |
| **300 DPI** *(Default)* | `450 × 660 px` | 3.81 × 5.59 cm | **Standar Resmi Dokumen Ijazah & Transkrip UNTAN** |
| **400 DPI** | `600 × 880 px` | 3.81 × 5.59 cm | Ultra Tajam (*High-End Archive Print*) |
| **Konversi Digital** | `472 × 709 px` | 3.99 × 6.00 cm | Standar Portal PDDikti / Seleksi Nasional |

---

## 🚀 Panduan Memulai Cepat (Quick Start)

### 1. Menjalankan Server Lokal

Aplikasi menggunakan modul WebAssembly (`.wasm`) sehingga memerlukan server HTTP lokal yang mengirimkan header MIME type `application/wasm`:

```bash
# Jalankan server lokal Python pada port 8080
python server.py
```

Akses portal melalui peramban:
👉 **`http://localhost:8080`**

### 2. Kompilasi Ulang Modul Rust WebAssembly (Opsional)

Jika Anda melakukan modifikasi pada kode pemrosesan citra di `wasm_crop/src/lib.rs`:

```bash
# 1. Pastikan target wasm32 terpasang
rustup target add wasm32-unknown-unknown

# 2. Uji unit test Rust
cargo test --manifest-path wasm_crop/Cargo.toml

# 3. Kompilasi release dan salin otomatis ke public/crop/wasm_crop.wasm
npm run build:wasm
```

### 3. Menjalankan Pengujian Otomatis (Testing Suite)

```bash
# Menjalankan seluruh pengujian Playwright end-to-end (Desktop & Mobile)
npx playwright test

# Menjalankan pengujian spesifik per fitur
npx playwright test tests/crop_stage_lock.spec.js   # Aturan 2 lapis tombol crop & tahap 4
npx playwright test tests/crop_app.spec.js          # Studio WASM & transfer foto
npx playwright test tests/user_auth.spec.js         # Otentikasi MFA & privasi data
npx playwright test tests/mega_menu.spec.js         # Mega menu desktop & drawer mobile
npx playwright test tests/hero_responsiveness.spec.js # Responsivitas Bento Grid hero
```

---

## 🔒 Akun Uji Coba Cepat (Seed Credentials)

Disediakan 3 akun demo siap pakai yang dapat diakses melalui 1-klik tombol pada formulir login (`/user/login.html`):

| NIM / Pengenal | Nama Pemohon | Sandi Default | Karakteristik Akun |
| :--- | :--- | :--- | :--- |
| **`F1081191001`** | Budi Santoso, S.Pd. | `PasswordUntan123!` | Mahasiswa Baru, MFA Email Aktif (**OTP: `123456`**) |
| **`F1081191002`** | Siti Aminah, S.Pd. | `PasswordUntan123!` | Wisudawati, Tanpa MFA (Langsung Masuk Dasbor) |
| **`F1081171015`** | Bambang Triatmojo, S.Pd. | `PasswordUntan123!` | Penerbitan Ulang, MFA Email (**OTP: `123456`**), Tiket: `UNTAN-IJZ-2026-0843` (Tahap 4) |

---

## 📁 Struktur Direktori Repositori

```
PhotoIjazah/
├── docs/                             # Dokumentasi Terstruktur
│   ├── PRD.md                        # Product Requirements Document Lengkap (v3.15)
│   ├── ARCHITECTURE.md               # Arsitektur Teknis & ERD Database
│   └── TESTING.md                    # Matriks Jaminan Mutu & Panduan QA
├── public/                           # Antarmuka Pengguna & Frontend Assets
│   ├── index.html                    # Beranda (Bento Grid Hero & Mega Menu)
│   ├── panduan.html                  # Panduan Dokumen & Regulasi BAK
│   ├── pengajuan.html                # Formulir Pengajuan Permohonan Ijazah
│   ├── lacak.html                    # Pelacakan Status Berkas Real-Time
│   ├── logo.png                      # Aset Logo Resmi Universitas Tanjungpura
│   ├── js/
│   │   ├── megaMenu.js               # Kontroler Interaksi Mega Menu & Drawer
│   │   └── supabaseClient.js         # Klien API Supabase & Aturan Penguncian Status
│   ├── user/                         # Portal Akun & Autentikasi Pengguna
│   │   ├── index.html                # Dasbor Pemohon & Pengaturan MFA
│   │   ├── login.html                # Form Masuk Akun dengan 3 Akun Demo & OTP
│   │   ├── mfa.html                  # Layar Verifikasi MFA (Email, TOTP, SMS, Backup)
│   │   ├── forgot-password.html      # Permintaan Reset Kata Sandi
│   │   ├── reset-password.html       # Formulir Pembaruan Kata Sandi Baru
│   │   └── userAuth.js               # Engine Otentikasi Web Crypto API (SHA-256)
│   └── crop/                         # PixelCrop Studio (Rust WebAssembly)
│       ├── index.html                # Antarmuka Studio Pemotong Foto
│       ├── style.css                 # Darkroom Canvas & Handle Styling
│       ├── app.js                    # Controller Kanvas, Marquee, & Aturan Tombol
│       ├── wasm_bridge.js            # Loader & Memory Bridge WebAssembly
│       └── wasm_crop.wasm            # Binary WebAssembly Terkompilasi (~480 KB)
├── wasm_crop/                        # Sumber Kode Rust Crate
│   ├── Cargo.toml
│   └── src/lib.rs                    # Image Processing Engine & C-ABI
├── supabase/                         # Pangkalan Data Supabase
│   ├── schema.sql                    # Skema Lengkap 13 Tabel PostgreSQL & Trigger
│   └── migrations/                   # Skrip Migrasi SQL & Pengerasan RLS
├── tests/                            # Suite Pengujian Otomatis Playwright
│   ├── crop_stage_lock.spec.js       # Uji Aturan 2 Lapis Tombol Crop & Tahap 4
│   ├── crop_app.spec.js              # Uji Fungsionalitas Studio WASM
│   ├── user_auth.spec.js             # Uji Alur Login, MFA, & Privasi Data
│   ├── mega_menu.spec.js             # Uji Interaksi Navigasi Menu
│   └── hero_responsiveness.spec.js   # Uji Responsivitas Bento Grid Hero
├── playwright.config.js              # Konfigurasi Runner Playwright
├── vercel.json                       # Konfigurasi Routing, Rewrites, & Header Vercel
├── server.py                         # HTTP Server Lokal Pengujian
├── PRD.md                            # Dokumen PRD Utama (Root Reference)
└── README.md                         # Dokumen Ringkasan Proyek Ini
```

---

## 🏛️ Lisensi & Hak Cipta

© 2026 **Biro Akademik dan Kemahasiswaan (BAK) Universitas Tanjungpura** & Tim Pengembang SimalumApps. Seluruh hak cipta dilindungi undang-undang.
