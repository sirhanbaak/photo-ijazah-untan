# Arsitektur Teknis Portal Layanan Penerbitan Ijazah UNTAN

Dokumen ini menjelaskan arsitektur teknis, diagram komponen sistem, alur data, spesifikasi keamanan, dan integrasi pangkalan data untuk Portal Layanan Penerbitan Ijazah Universitas Tanjungpura.

---

## 🏗️ 1. Diagram Arsitektur Sistem Global

```mermaid
graph TB
    subgraph Client Tier ["Client Tier (Browser Peramban)"]
        UI_Home["Beranda & Bento Hero<br/>(public/index.html)"]
        UI_Form["Form Pengajuan Terproteksi<br/>(public/pengajuan.html)"]
        UI_Track["Lacak Status Berkas<br/>(public/lacak.html)"]
        UI_User["Portal Akun & Dasbor MFA<br/>(public/user/)"]
        WASM_Crop["PixelCrop Studio WASM<br/>(public/crop/)"]
    end

    subgraph Logic & State Tier ["Client Logic & WebAssembly Tier"]
        Auth_Engine["Web Crypto Engine<br/>(SHA-256 + TOTP RFC 6238)"]
        WASM_Engine["Rust Image Processing<br/>(Lanczos3 Resampling)"]
        MegaMenu_Ctrl["MegaMenu Controller<br/>(public/js/megaMenu.js)"]
        Supa_Client["Supabase API Wrapper<br/>(public/js/supabaseClient.js)"]
    end

    subgraph Cloud Infrastructure ["Cloud Tier (Vercel & Supabase Platform)"]
        Vercel_Edge["Vercel Edge / CDN<br/>(Clean Routing & Headers)"]
        Supa_Auth["Supabase PostgreSQL<br/>(13 Relational Tables)"]
        Supa_Storage["Supabase Storage<br/>(Bucket: dokumen-ijazah)"]
    end

    subgraph Institutional Ecosystem ["External Institutional Systems"]
        Kemdikbud["PISN Kemdiktisaintek / PDDikti"]
        Simalum["Simalum Untan Hub"]
        BSrE["TTE BSrE - BSSN"]
    end

    UI_Home --> MegaMenu_Ctrl
    UI_User --> Auth_Engine
    WASM_Crop --> WASM_Engine
    UI_Form --> Supa_Client
    UI_Track --> Supa_Client
    Auth_Engine --> Supa_Client
    WASM_Crop -.->|"DataTransfer & SessionStorage"| UI_Form

    Client Tier --> Vercel_Edge
    Supa_Client --> Supa_Auth
    Supa_Client --> Supa_Storage
    Supa_Auth -.-> Kemdikbud
    Supa_Auth -.-> Simalum
    Supa_Auth -.-> BSrE
```

---

## 📦 2. Komponen & Lapisan Teknologi (Technology Stack)

| Komponen | Teknologi / Pustaka | Peran & Tanggung Jawab |
| :--- | :--- | :--- |
| **Frontend Framework** | HTML5, Tailwind CSS (CDN & JIT), Material Symbols | Antarmuka responsif mobile-first, arsitektur Bento Grid, Glassmorphism, dan komponen aksesibel. |
| **Core Client Engine** | Rust `image` crate dikompilasi ke WebAssembly (`wasm32-unknown-unknown`) | Pemotongan pas foto 4×6, rotasi halus sub-derajat, transformasi 90°, dan resampling Lanczos3 murni di sisi browser. |
| **Autentikasi & Kriptografi** | Web Crypto API (`window.crypto.subtle`), HMAC-SHA1 TOTP murni JS | Hashing kata sandi SHA-256 + salt unik, generator TOTP RFC 6238 30-detik, token hex 32-byte. |
| **Pangkalan Data** | Supabase Managed PostgreSQL | Penyimpanan relasional 13 tabel, view komposit, trigger pencabutan sesi, dan Row Level Security (RLS). |
| **Penyimpanan Berkas** | Supabase Object Storage (`dokumen-ijazah`) | Isolasi folder `pas-foto/`, `berkas-ktp/`, `berkas-pendukung/`, dan `avatars/` dengan auto-cleanup berkas usang. |
| **Infrastruktur Hosting** | Vercel Serverless Platform | Distribusi CDN global, clean URL rewrites, MIME header `.wasm`, dan proteksi deployment. |
| **Jaminan Mutu (QA)** | Playwright Test Runner (Chromium Desktop & Mobile Pixel 5) | Pengujian end-to-end otomatis (58+ skenario pengujian lulus 100%). |

---

## 🔐 3. Alur Otentikasi & Keamanan Multi-Faktor (MFA)

```mermaid
sequenceDiagram
    autonumber
    actor Pemohon as Mahasiswa / Alumni
    participant Browser as Peramban Web
    participant Auth as userAuth.js (Web Crypto)
    participant DB as Supabase (users & mfa_settings)

    Pemohon->>Browser: Masukkan NIM/Email & Password
    Browser->>Auth: Kirim Kredensial
    Auth->>DB: Kueri data pengguna & salt
    DB-->>Auth: Kembalikan password_hash & user_mfa_settings
    Auth->>Auth: Hash input: SHA-256(password + salt)
    
    alt Password Tidak Cocok
        Auth->>DB: Increment failed_login_attempts
        Auth-->>Browser: Tampilkan Galat (Sisa Percobaan)
        Note over Auth,DB: Kunci Akun 15 Menit jika 5x Gagal
    else Password Cocok
        alt is_mfa_enabled == true
            Auth->>DB: Terbitkan challenge session_token (10 Menit)
            Auth-->>Browser: Alihkan ke /user/mfa.html
            Pemohon->>Browser: Masukkan Kode OTP / TOTP / Backup Code
            Browser->>Auth: Validasi Kode Verifikasi
            Auth->>DB: Update is_verified = true di mfa_verifications
        end
        Auth->>DB: Reset failed_login_attempts & Catat user_sessions
        Auth-->>Browser: Simpan UNTAN_USER_AUTH_SESSION di LocalStorage
        Browser-->>Pemohon: Alihkan ke Dasbor / Form Pengajuan
    end
```

---

## 🎯 4. Logika Dua Lapis Penguncian Tombol "Gunakan" di PixelCrop Studio

```mermaid
flowchart TD
    Start([Pengguna Buka /crop/]) --> CheckAuth{Apakah Pengguna Telah Login?<br/>UntanUserAuth.getCurrentUser}
    
    CheckAuth -- TIDAK (Guest) --> GuestAction[Sembunyikan 4 Tombol Gunakan]
    GuestAction --> ShowGuestNotice[Tampilkan Notifikasi Login & Tombol Masuk Akun]
    GuestAction --> FreeDownload[Tombol Unduh Pas Foto Tetap Tersedia Bebas]

    CheckAuth -- YA (User Login) --> CheckStage{Evaluasi Tahap Berkas Aktif<br/>current_step >= 4 ATAU locked=1?}
    
    CheckStage -- YA (Tahap 4, 5, 6) --> StageLocked[Sembunyikan 4 Tombol Gunakan]
    StageLocked --> ShowStageNotice[Tampilkan Banner Penguncian Blangko Sekuritas]
    StageLocked --> FreeDownload

    CheckStage -- TIDAK (Tahap 1, 2, 3 / Baru) --> AllowUse[Tampilkan 4 Tombol Gunakan Aktif]
    AllowUse --> ActionUse[Klik Gunakan -> Transfer Foto 4x6 ke Formulir Pengajuan]
    ActionUse --> FormRedirect[Arahkan ke /pengajuan.html?cropped=1]
```

---

## 📊 5. Skema Relasi Antar Tabel (Entity Relationship Overview)

```mermaid
erDiagram
    users ||--o{ pengajuan_ijazah : "memiliki"
    users ||--o| user_mfa_settings : "konfigurasi MFA"
    users ||--o{ password_reset_requests : "permintaan reset"
    users ||--o{ mfa_verifications : "sesi verifikasi"
    users ||--o{ password_history : "riwayat sandi"
    users ||--o{ user_login_logs : "audit masuk"
    users ||--o{ user_sessions : "sesi aktif"
    users ||--o| user_profiles : "biodata akademik"
    users ||--o| user_notification_preferences : "preferensi notif"
    users ||--o{ user_notifications : "pesan notifikasi"
    users ||--o{ user_trusted_devices : "perangkat terpercaya"
    
    layanan ||--o{ pengajuan_ijazah : "kategori layanan"
    pengajuan_ijazah ||--o{ riwayat_status : "linimasa tahapan"

    users {
        uuid id PK
        string nim UK
        string email UK
        string nama_lengkap
        string password_hash
        string password_salt
        string role
        string status
        timestamp locked_until
    }

    pengajuan_ijazah {
        uuid id PK
        string nomor_tiket UK
        string service_type
        string status_ijazah
        int current_step
        int total_steps
        string nim
        string nama_lengkap
        text foto_url
        text berkas_ktp_url
        text berkas_pendukung_url
    }

    user_mfa_settings {
        uuid id PK
        uuid user_id FK
        boolean is_mfa_enabled
        string primary_method
        string authenticator_secret
        jsonb backup_codes
    }

    riwayat_status {
        uuid id PK
        uuid pengajuan_id FK
        int step_number
        string title
        text description
        string actor
        string status
        timestamp waktu
    }
```
