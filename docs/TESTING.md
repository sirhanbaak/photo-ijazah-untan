# Panduan Pengujian & Matriks Jaminan Mutu (QA)

Dokumen ini menjelaskan strategi pengujian, konfigurasi lingkungan uji, dan matriks rinci skenario automated test Playwright dan Rust WebAssembly untuk Portal Layanan Penerbitan Ijazah UNTAN.

---

## 🧪 1. Konfigurasi Lingkungan Pengujian

### Prasyarat:
- **Node.js:** Versi 18+ (disarankan v20+).
- **Python:** Versi 3.8+ (untuk menjalankan server pengujian `server.py`).
- **Playwright:** Terpasang via `npm install` (`@playwright/test`).

### Menjalankan Server Lokal:
```bash
# Jalankan server lokal pada port 8080
python server.py
```

### Konfigurasi Test Runner (`playwright.config.js`):
- **Base URL:** `http://localhost:8080`
- **Default Storage State:** `tests/auth_state.json` (Akun login default Fauzi `F1081191042`).
- **Proyek Pengujian:**
  1. `Desktop Chrome` (Chromium 1280 × 720).
  2. `Mobile Chrome (Pixel 5)` (Emulasi layar sentuh ponsel 393 × 851).
- **Reporter:** List console output.

---

## 📋 2. Perintah Eksekusi Pengujian

```bash
# 1. Jalankan seluruh rangkaian pengujian (Desktop & Mobile)
npx playwright test

# 2. Jalankan pengujian pada Desktop Chrome saja
npx playwright test --project="Desktop Chrome"

# 3. Jalankan pengujian pada Mobile Chrome saja
npx playwright test --project="Mobile Chrome (Pixel 5)"

# 4. Menjalankan pengujian spesifik per file:
npx playwright test tests/crop_stage_lock.spec.js
npx playwright test tests/crop_app.spec.js
npx playwright test tests/user_auth.spec.js
npx playwright test tests/mega_menu.spec.js
npx playwright test tests/hero_responsiveness.spec.js
npx playwright test tests/security_hash_routing.spec.js

# 5. Menjalankan pengujian engine Rust WebAssembly:
cargo test --manifest-path wasm_crop/Cargo.toml
npm run test:wasm
```

---

## 📊 3. Matriks Skenario Uji Playwright (58+ Skenario Lulus 100%)

### 3.1. `tests/crop_stage_lock.spec.js` (6 Skenario Pokok)
1. **Kondisi 1:** Berkas belum mencapai Tahap 4 (Tahap 1, 2, 3 atau permohonan baru) $\rightarrow$ Seluruh tombol Gunakan muncul aktif.
2. **Kondisi 2:** Berkas telah mencapai Tahap 4 via parameter `?step=4` $\rightarrow$ Seluruh tombol Gunakan disembunyikan, notice penguncian Tahap 4 muncul.
3. **Kondisi 3:** Melacak tiket dummy penerbitan ulang Tahap 4 (`UNTAN-IJZ-2026-0843`) $\rightarrow$ Tombol Gunakan tersembunyi & panggilan paksa ditolak alert.
4. **Kondisi 4:** Validasi data dummy penerbitan ulang Tahap 4 di `lacak.html` $\rightarrow$ Verifikasi tiket, NIM `F1081171015`, status Proses Cetak, loket pengambilan.
5. **Kondisi 5:** Pengecualian Penerbitan Ulang $\rightarrow$ Tahap 3 (Registrasi PISN Baru) berstatus *"Dilewati (Selesai)"*.
6. **Kondisi 6 (Guest Protection):** Pengguna belum login $\rightarrow$ Tombol Gunakan disembunyikan, banner notifikasi login tampil di sidebar & modal, tombol Masuk tampil di header, panggilan fungsi diblokir dengan peringatan.

### 3.2. `tests/crop_app.spec.js` (7 Skenario Pokok)
1. Memuat engine WASM dan inisialisasi kotak crop 4:6.
2. Ekspor citra dengan rotasi halus 30° menghasilkan berkas JPEG 450 × 660 px 300 DPI valid.
3. Rotasi 90° menukar dimensi sumber dan mempertahankan aspek rasio.
4. Unggahan JPEG dan WebP dinormalisasi sebelum diproses engine.
5. Fit to window, toggle grid rule of thirds, dan pintasan keyboard (Spasi, Scroll, Enter).
6. Integrasi tombol Gunakan memindahkan foto ke formulir pengajuan tanpa ter-overwrite oleh timer `cekDataMahasiswa`.
7. Tombol langsung Gunakan (header/sidebar) otomatis memproses crop dan mengarahkan ke form pengajuan.

### 3.3. `tests/user_auth.spec.js` (15 Skenario Pokok)
1. Routing `/user/` dan inisialisasi modul `userAuth.js`.
2. Validasi login dengan kredensial salah menampilkan pesan kesalahan yang ramah.
3. Alur login MFA Email (`F1081191001`) $\rightarrow$ Verifikasi OTP 6-Digit (`123456`) $\rightarrow$ Masuk ke Dasbor.
4. Alur login Smartphone Authenticator App (TOTP RFC 6238).
5. Alur ubah kata sandi saat login (validasi sandi lama & konfirmasi baru).
6. Alur Lupa Kata Sandi (Request to Reset) & token kriptografis.
7. Pengaturan preferensi MFA di dasbor dapat diubah dan disimpan.
8. Penanganan sesi LocalStorage terproteksi.
9. Pre-fill otomatis data profil pengguna ke formulir pengajuan.
10. Adaptasi reaktif formulir pengajuan saat jenis layanan diubah.
11. Tampilan photo profile / avatar dan submenu dropdown di navbar saat login.
12. Pelacakan status di `lacak.html` memproteksi akses guest (auto-redirect ke login).
13. Otorisasi privasi: `lacak.html` menolak menampilkan data milik NIM lain.
14. Tombol akun demo Penerbitan Ulang (`F1081171015`) mengisi form dan login dengan sukses.
15. Penayangan langsung kode OTP verifikasi (`123456`) pada kartu akun demo form login.

### 3.4. `tests/mega_menu.spec.js` (5 Skenario Pokok)
1. Mega menu desktop dapat dibuka dan ditutup dengan klik maupun hover.
2. Atribut ARIA `aria-expanded` diperbarui secara dinamis saat dropdown terbuka/tertutup.
3. Klik di luar area menu (*click-outside*) atau penekanan tombol `Escape` otomatis menutup menu.
4. Tombol mandiri PixelCrop WASM berwarna hijau emerald tampil di bilah navigasi atas.
5. Drawer navigasi mobile mengelompokkan tautan ke dalam kategori yang rapi.

### 3.5. `tests/hero_responsiveness.spec.js` (4 Skenario Pokok)
1. Layout Bento Grid 12 kolom pada hero section Beranda tampil proporsional tanpa *horizontal scroll bar* di desktop maupun mobile.
2. Kartu pratinjau pas foto 4×6 interaktif menampilkan rasio yang presisi dan tombol pintasan PixelCrop Studio.
3. Tiga kartu metrik dan legalitas institusional tampil simetris di baris bawah grid.
4. Tipografi fluida (*fluid typography clamp*) beradaptasi secara mulus terhadap berbagai ukuran layar.

---

## 🔒 4. Validasi Keamanan Akun Uji Coba (Seed Credentials)

| Identitas Akun | Peran / Skenario | Kredensial Masuk | Karakteristik MFA & Pengujian |
| :--- | :--- | :--- | :--- |
| **`F1081191001`** | Mahasiswa Baru (Budi Santoso, S.Pd.) | `PasswordUntan123!` | MFA Email Aktif (**OTP: `123456`**) |
| **`F1081191002`** | Wisudawati (Siti Aminah, S.Pd.) | `PasswordUntan123!` | Tanpa MFA (Langsung ke Dasbor) |
| **`F1081171015`** | Alumni Penerbitan Ulang (Bambang Triatmojo, S.Pd.) | `PasswordUntan123!` | MFA Email Aktif (**OTP: `123456`**), Tiket: `UNTAN-IJZ-2026-0843` (Tahap 4) |
| **`F1081191042`** | Akun Default Playwright (M. Fauzi Pratama, S.Pd.) | `PasswordUntan123!` | Sesi tersimpan di `tests/auth_state.json` (Tahap 1) |
