# Implementasi Aplikasi Pas Foto 4x6 Croping dengan Rust WebAssembly

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun aplikasi web pemotong pas foto 4x6 cm interaktif berbasis Rust WebAssembly yang memproses citra dengan presisi tinggi sesuai standar resolusi DPI (72, 96, 150, 200, 300, 400 DPI dan konversi digital 472x709 px) dengan tampilan profesional PixelCrop Studio.

**Architecture:** Modul inti Rust dikompilasi ke target `wasm32-unknown-unknown` untuk memotong, merotasi, dan melakukan resampling citra pada resolusi piksel sebenarnya. Antarmuka web (HTML5, Tailwind CSS, JavaScript Canvas) mengelola drag-and-drop foto, pan & zoom kanvas, manipulasi kotak crop 4:6 (dengan grid rule of thirds), serta menampilkan pratinjau hasil crop di area terpisah dan unduhan.

**Tech Stack:** Rust 2021 (`image` crate, `wasm32-unknown-unknown`), WebAssembly ABI, JavaScript ES6+, HTML5 Canvas, Tailwind CSS, Google Fonts (*Plus Jakarta Sans*, *Inter*, *JetBrains Mono*).

**Spec:** [docs/superpowers/specs/2026-10-20-photo-crop-wasm-design.md](file:///d:/PROJECTS/AI/PhotoIjazah/docs/superpowers/specs/2026-10-20-photo-crop-wasm-design.md)

## Global Constraints

- Standar ukuran pas foto 4×6 cm:
  - 72 DPI: 108 × 158 piksel
  - 96 DPI: 144 × 211 piksel
  - 150 DPI: 225 × 330 piksel
  - 200 DPI: 300 × 440 piksel
  - 300 DPI: 450 × 660 piksel *(Standar cetak tajam / dokumen resmi / default)*
  - 400 DPI: 600 × 880 piksel
  - Standar konversi digital umum: 472 × 709 piksel
- Pemrosesan citra wajib dieksekusi di sisi klien via Rust WebAssembly (tanpa server backend pihak ketiga).
- Kotak crop harus mempertahankan rasio 4:6 saat digeser atau diubah ukurannya dan tidak boleh melebihi batas gambar sumber.
- Hasil crop wajib ditampilkan pada area/modal terpisah dengan tombol unduh file (JPEG / PNG).

## Review Focus

1. **Batas Koordinat Crop:** Kotak crop yang digeser mendekati ujung foto tidak boleh menghasilkan koordinat di luar batas dimensi foto asli (mencegah out-of-bounds index).
2. **Kualitas Resampling:** Penskalaan dari crop area ke ukuran target (misal 450x660 px) harus menggunakan interpolasi berkualitas tinggi (Lanczos3 atau Triangle) agar foto ijazah tajam dan tidak pecah.
3. **MIME Type WebAssembly:** Server lokal harus menyajikan file `.wasm` dengan Content-Type `application/wasm`.
4. **Foto Berbagai Format (JPEG/PNG/WEBP):** Engine Rust harus mampu mendecode dan mengencode format input umum tanpa crash.
5. **Rotasi dan Flip:** Rotasi sudut (-45° s/d +45°) dan flip harus dihitung sebelum crop atau diikutsertakan dalam pipeline transformasi tanpa memotong bagian penting.

---

### Task 1: Setup Crate Rust `wasm_crop` & Engine Pemrosesan Citra

**Files:**
- Create: `wasm_crop/Cargo.toml`
- Create: `wasm_crop/src/lib.rs`
- Test: `wasm_crop/tests/crop_tests.rs`

**Interfaces:**
- Produces:
  - `pub extern "C" fn alloc(size: usize) -> *mut u8`
  - `pub extern "C" fn dealloc(ptr: *mut u8, size: usize)`
  - `pub extern "C" fn crop_process(img_ptr: *const u8, img_len: usize, crop_x: u32, crop_y: u32, crop_w: u32, crop_h: u32, target_w: u32, target_h: u32, rotation_deg: f32, flip_h: u32, flip_v: u32, output_format_code: u32) -> u32`
  - `pub extern "C" fn get_output_ptr() -> *const u8`
  - `pub extern "C" fn get_output_len() -> usize`

- [ ] **Step 1: Inisialisasi Crate Rust dan buat Cargo.toml**
  Konfigurasi crate dengan `crate-type = ["cdylib", "rlib"]`, dependensi `image = { version = "0.24", default-features = false, features = ["jpeg", "png"] }`.

- [ ] **Step 2: Tulis test awal pemotongan citra di `wasm_crop/tests/crop_tests.rs`**
  Uji fungsi pemotongan citra dummy 1000x1000 px ke preset 300 DPI (450x660 px) dan verifikasi dimensi outputnya tepat 450 × 660 piksel.

- [ ] **Step 3: Jalankan `cargo test` untuk memverifikasi test gagal (belum ada implementasi)**
  Run: `cargo test --manifest-path wasm_crop/Cargo.toml`
  Expected: FAIL

- [ ] **Step 4: Implementasikan fungsi pemrosesan citra dan memory management di `wasm_crop/src/lib.rs`**
  Implementasikan decoding, rotasi/flip, crop, resampling Lanczos3/Triangle ke `target_w` x `target_h`, dan encoding ke JPEG/PNG buffer.

- [ ] **Step 5: Jalankan `cargo test` untuk memverifikasi test lulus**
  Run: `cargo test --manifest-path wasm_crop/Cargo.toml`
  Expected: PASS

- [ ] **Step 6: Kompilasi Rust crate ke WebAssembly (`wasm32-unknown-unknown`)**
  Run: `cargo build --manifest-path wasm_crop/Cargo.toml --target wasm32-unknown-unknown --release`
  Expected: Berhasil menghasilkan `wasm_crop/target/wasm32-unknown-unknown/release/wasm_crop.wasm`.

---

### Task 2: Modul Bridge JavaScript & WebAssembly Loader

**Files:**
- Create: `public/wasm_bridge.js`
- Test: `tests/wasm_bridge.test.js`

**Interfaces:**
- Consumes: `wasm_crop.wasm` memory & C-ABI exports.
- Produces:
  - `class WasmCropEngine`:
    - `async init(wasmUrl: string): Promise<void>`
    - `cropImage(imageBuffer: ArrayBuffer, options: CropOptions): Promise<{ data: Uint8Array, blob: Blob, url: string }>`

- [ ] **Step 1: Tulis unit test / mock test untuk WasmCropEngine**
  Verifikasi alokasi buffer di memori WebAssembly, pengiriman koordinat crop, dan penerimaan kembali byte citra yang terpotong.

- [ ] **Step 2: Implementasikan `public/wasm_bridge.js`**
  Implementasikan inisialisasi WASM melalui `WebAssembly.instantiateStreaming` (dengan fallback `ArrayBuffer`), manajemen alokasi `alloc` dan `dealloc`, pemanggilan fungsi `crop_process`, serta konversi hasil ke `Blob` dan `objectURL`.

- [ ] **Step 3: Uji pemanggilan WASM bridge dengan buffer gambar sintetis**
  Jalankan node script sederhana untuk memverifikasi `WasmCropEngine` berhasil menginisialisasi dan memproses buffer.

---

### Task 3: Antarmuka Web Interaktif (PixelCrop Studio Canvas & Marquee)

**Files:**
- Create: `public/index.html`
- Create: `public/app.js`
- Create: `public/style.css`

**Interfaces:**
- Consumes: `WasmCropEngine` dari `public/wasm_bridge.js`.
- Produces:
  - Canvas arena dengan interaksi:
    - Zoom (slider & tombol + / - / fit / 100%)
    - Pan (geser kanvas dengan mouse drag atau Spasi + drag)
    - Resizable & draggable crop box terkunci pada rasio 4:6
    - Preset DPI switcher (72, 96, 150, 200, 300, 400 DPI & konversi digital 472x709)
    - Panduan garis Rule of Thirds & Crosshair
    - Slider rotasi pelurusan (-45° s/d +45°) dan tombol flip

- [ ] **Step 1: Buat `public/index.html` mengadopsi desain visual Stitch PixelCrop Studio**
  Menyusun struktur DOM lengkap: header bar (status foto, zoom, upload), left sidebar tools, center canvas arena (gambar sumber, crop marquee, rule of thirds, 8 handle grip, floating tool dock), right inspector panel (preset DPI, ukuran piksel, telemetri cetak), dan upload modal drawer.

- [ ] **Step 2: Buat `public/style.css` untuk tata letak dan interaksi kanvas**
  Menambahkan aturan CSS untuk handles, boundary constraints, animasi glassmorphism, dan custom scrollbars.

- [ ] **Step 3: Implementasikan logika interaksi di `public/app.js`**
  - Event listener untuk drag & drop foto serta file input.
  - Perhitungan koordinat crop relatif terhadap piksel asli foto sumber (bukan sekadar ukuran tampilan kanvas).
  - Penyesuaian ukuran kotak crop otomatis saat preset DPI diganti agar tetap berada dalam rasio 4:6.
  - Bounding logic agar kotak crop tidak bisa ditarik keluar dari area gambar.

---

### Task 4: Area Tampilan Hasil Crop Terpisah & Fitur Unduh

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`

**Interfaces:**
- Consumes: Output Blob dari `WasmCropEngine.cropImage`.
- Produces:
  - Modal / Area Tampilan Pratinjau Hasil Crop yang menampilkan:
    - Gambar hasil pemotongan tajam
    - Detail informasi: Resolusi piksel, DPI, estimasi ukuran file, dimensi fisik cetak (cm)
    - Pilihan format simpan (JPEG kualitas tinggi 95% atau PNG lossless)
    - Tombol "Unduh Pas Foto" dengan penamaan file otomatis (contoh: `pas_foto_4x6_300dpi_450x660.jpg`)

- [ ] **Step 1: Tambahkan komponen Modal / Drawer Hasil Crop di `public/index.html`**
  Desain dialog modal hasil crop yang elegan dengan perbandingan visual sebelum vs sesudah (*side-by-side preview*), tabel spesifikasi cetak, dan tombol aksi unduh.

- [ ] **Step 2: Integrasikan trigger crop di `public/app.js` dengan WASM Engine**
  Saat tombol "Terapkan Crop & Unduh" ditekan:
  1. Ambil koordinat crop (x, y, w, h) dari posisi kotak crop.
  2. Panggil `wasmEngine.cropImage(...)`.
  3. Tampilkan hasil foto pada modal pratinjau terpisah.
  4. Aktifkan tombol unduh file secara instan.

---

### Task 5: Server Lokal, Verifikasi End-to-End, dan Pengujian Lengkap

**Files:**
- Create: `server.py` (server HTTP lokal ringan dengan MIME type `application/wasm`)
- Create: `public/sample.jpg` (contoh foto pengujian pas foto)

- [ ] **Step 1: Buat `server.py` untuk melayani berkas lokal dengan header WASM yang benar**
  Script Python standar `http.server` yang menyajikan direktori `public/` dan file binary WASM dengan MIME type `application/wasm`.

- [ ] **Step 2: Jalankan kompilasi release akhir Rust WASM dan salin binary ke `public/wasm_crop.wasm`**
  Run: `cargo build --manifest-path wasm_crop/Cargo.toml --target wasm32-unknown-unknown --release`
  Salin: `wasm_crop/target/wasm32-unknown-unknown/release/wasm_crop.wasm` -> `public/wasm_crop.wasm`.

- [ ] **Step 3: Uji fungsi pemotongan di browser menggunakan browser subagent**
  - Buka aplikasi di browser lokal.
  - Unggah foto uji.
  - Ganti preset ke 300 DPI (450 x 660 px), geser kotak crop.
  - Tekan tombol "Terapkan Crop & Unduh".
  - Verifikasi bahwa modal pratinjau hasil crop muncul di area terpisah dan menampilkan foto hasil potongan dengan dimensi tepat 450 × 660 px.
  - Uji preset lainnya (72, 96, 150, 200, 400 DPI dan 472x709 px).

- [ ] **Step 4: Dokumentasikan petunjuk cara menjalankan aplikasi di `README.md`**
  Tulis panduan langkah demi langkah cara mengompilasi Rust WASM dan menjalankan server lokal.
