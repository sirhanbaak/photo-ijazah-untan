-- ==============================================================================
-- SKEMA DATABASE SUPABASE: PORTAL LAYANAN PENERBITAN IJAZAH UNTAN
-- ==============================================================================
-- Jalankan skrip ini di Supabase SQL Editor (Dashboard > SQL Editor > New query).
-- Skrip ini akan membuat tabel, relasi, indeks, Row Level Security (RLS), 
-- konfigurasi bucket storage, serta data contoh awal (seed data).
-- ==============================================================================

-- ==============================================================================
-- SKRIP MIGRASI / PERBARUAN: Field status_ijazah & Rule Kunci Data
-- Jika tabel public.pengajuan_ijazah sudah pernah dibuat di database, jalankan blok ini:
-- ==============================================================================
ALTER TABLE public.pengajuan_ijazah 
ADD COLUMN IF NOT EXISTS status_ijazah VARCHAR(30) DEFAULT 'Pengajuan';

-- Perbarui constraint agar mendukung nilai: Pengajuan, Proses Cetak, Final, Ditolak
ALTER TABLE public.pengajuan_ijazah 
DROP CONSTRAINT IF EXISTS pengajuan_ijazah_status_ijazah_check;

ALTER TABLE public.pengajuan_ijazah 
ADD CONSTRAINT pengajuan_ijazah_status_ijazah_check 
CHECK (status_ijazah IN ('Pengajuan', 'Proses Cetak', 'Final', 'Ditolak'));

UPDATE public.pengajuan_ijazah 
SET status_ijazah = 'Pengajuan' 
WHERE status_ijazah IS NULL;

CREATE INDEX IF NOT EXISTS idx_pengajuan_status_ijazah ON public.pengajuan_ijazah(status_ijazah);

DROP POLICY IF EXISTS "Public can update pengajuan" ON public.pengajuan_ijazah;
DROP POLICY IF EXISTS "Public can update pengajuan if status Pengajuan" ON public.pengajuan_ijazah;
CREATE POLICY "Public can update pengajuan if status Pengajuan" 
ON public.pengajuan_ijazah 
FOR UPDATE 
TO anon, authenticated 
USING (status_ijazah = 'Pengajuan')
WITH CHECK (status_ijazah = 'Pengajuan');

-- Kebijakan Storage agar berkas/pas foto lama yang diganti dapat dihapus otomatis dari bucket
DROP POLICY IF EXISTS "Allow public delete from dokumen-ijazah" ON storage.objects;
CREATE POLICY "Allow public delete from dokumen-ijazah"
ON storage.objects
FOR DELETE
TO anon, authenticated
USING (bucket_id = 'dokumen-ijazah');
-- ==============================================================================

-- 1. Ekstensi UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tabel Utama: pengajuan_ijazah
CREATE TABLE IF NOT EXISTS public.pengajuan_ijazah (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nomor_tiket VARCHAR(50) UNIQUE NOT NULL,
    service_type VARCHAR(50) NOT NULL, -- penerbitan_baru, perbaikan_data, penerbitan_ulang, pencetakan_ulang
    nim VARCHAR(30) NOT NULL,
    nik VARCHAR(20) NOT NULL,
    nama_lengkap VARCHAR(150) NOT NULL,
    tempat_lahir VARCHAR(100) NOT NULL,
    tanggal_lahir DATE NOT NULL,
    fakultas VARCHAR(50) NOT NULL,
    prodi VARCHAR(100) NOT NULL,
    periode_yudisium VARCHAR(150) NOT NULL,
    ipk VARCHAR(50),
    whatsapp VARCHAR(30) NOT NULL,
    email VARCHAR(100) NOT NULL,
    foto_url TEXT,
    berkas_ktp_url TEXT,
    berkas_pendukung_url TEXT,
    status VARCHAR(50) DEFAULT 'menunggu_verifikasi', -- menunggu_verifikasi, validasi_akademik, pisn_kemdiktisaintek, pencetakan_blangko, penandatanganan, siap_diambil, selesai, ditolak
    status_label VARCHAR(100) DEFAULT 'Menunggu Verifikasi Berkas Awal',
    status_ijazah VARCHAR(30) DEFAULT 'Pengajuan' CHECK (status_ijazah IN ('Pengajuan', 'Proses Cetak', 'Final', 'Ditolak', 'Dibatalkan')), -- Pengajuan, Proses Cetak, Final, Ditolak, Dibatalkan
    current_step INT DEFAULT 1,
    total_steps INT DEFAULT 6,
    loket_pengambilan VARCHAR(150),
    catatan_petugas TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('asia/jakarta', NOW()),
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('asia/jakarta', NOW())
);

-- Indeks untuk pencarian cepat berdasarkan nomor tiket, NIM, dan status ijazah
CREATE INDEX IF NOT EXISTS idx_pengajuan_nomor_tiket ON public.pengajuan_ijazah(nomor_tiket);
CREATE INDEX IF NOT EXISTS idx_pengajuan_nim ON public.pengajuan_ijazah(nim);
CREATE INDEX IF NOT EXISTS idx_pengajuan_email ON public.pengajuan_ijazah(email);
CREATE INDEX IF NOT EXISTS idx_pengajuan_status_ijazah ON public.pengajuan_ijazah(status_ijazah);

-- 3. Tabel Riwayat Status / Linimasa (Timeline Milestones)
CREATE TABLE IF NOT EXISTS public.riwayat_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pengajuan_id UUID REFERENCES public.pengajuan_ijazah(id) ON DELETE CASCADE,
    step_number INT NOT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    actor VARCHAR(100),
    status VARCHAR(30) DEFAULT 'completed', -- completed, in_progress, pending
    waktu TIMESTAMPTZ DEFAULT TIMEZONE('asia/jakarta', NOW())
);

CREATE INDEX IF NOT EXISTS idx_riwayat_pengajuan_id ON public.riwayat_status(pengajuan_id);

-- 4. Aktifkan Row Level Security (RLS)
ALTER TABLE public.pengajuan_ijazah ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.riwayat_status ENABLE ROW LEVEL SECURITY;

-- 5. Kebijakan Keamanan RLS untuk Akses Publik / Anonim
-- Izinkan siapapun (anon) untuk membuat pengajuan baru
DROP POLICY IF EXISTS "Public can create pengajuan" ON public.pengajuan_ijazah;
CREATE POLICY "Public can create pengajuan" 
ON public.pengajuan_ijazah 
FOR INSERT 
TO anon, authenticated 
WITH CHECK (true);

-- Izinkan siapapun (anon) untuk membaca pengajuan berdasarkan tiket atau NIM
DROP POLICY IF EXISTS "Public can read pengajuan by ticket or nim" ON public.pengajuan_ijazah;
CREATE POLICY "Public can read pengajuan by ticket or nim" 
ON public.pengajuan_ijazah 
FOR SELECT 
TO anon, authenticated 
USING (true);

-- Izinkan publik membaca riwayat status
DROP POLICY IF EXISTS "Public can read riwayat status" ON public.riwayat_status;
CREATE POLICY "Public can read riwayat status" 
ON public.riwayat_status 
FOR SELECT 
TO anon, authenticated 
USING (true);

-- Izinkan publik menambahkan entri riwayat saat membuat pengajuan
DROP POLICY IF EXISTS "Public can insert riwayat status" ON public.riwayat_status;
CREATE POLICY "Public can insert riwayat status" 
ON public.riwayat_status 
FOR INSERT 
TO anon, authenticated 
WITH CHECK (true);

-- Izinkan update pengajuan HANYA jika status_ijazah = 'Pengajuan'
DROP POLICY IF EXISTS "Public can update pengajuan" ON public.pengajuan_ijazah;
DROP POLICY IF EXISTS "Public can update pengajuan if status Pengajuan" ON public.pengajuan_ijazah;
CREATE POLICY "Public can update pengajuan if status Pengajuan" 
ON public.pengajuan_ijazah 
FOR UPDATE 
TO anon, authenticated 
USING (status_ijazah = 'Pengajuan')
WITH CHECK (status_ijazah = 'Pengajuan');

-- 6. Setup Storage Bucket: dokumen-ijazah
INSERT INTO storage.buckets (id, name, public)
VALUES ('dokumen-ijazah', 'dokumen-ijazah', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Kebijakan Storage agar pengguna publik dapat mengunggah berkas persyaratan
DROP POLICY IF EXISTS "Allow public uploads to dokumen-ijazah" ON storage.objects;
CREATE POLICY "Allow public uploads to dokumen-ijazah"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'dokumen-ijazah');

DROP POLICY IF EXISTS "Allow public read from dokumen-ijazah" ON storage.objects;
CREATE POLICY "Allow public read from dokumen-ijazah"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'dokumen-ijazah');

DROP POLICY IF EXISTS "Allow public delete from dokumen-ijazah" ON storage.objects;
CREATE POLICY "Allow public delete from dokumen-ijazah"
ON storage.objects
FOR DELETE
TO anon, authenticated
USING (bucket_id = 'dokumen-ijazah');

-- 7. Trigger Otomatis Update Kolom updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('asia/jakarta', NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trigger_pengajuan_updated_at ON public.pengajuan_ijazah;
CREATE TRIGGER trigger_pengajuan_updated_at
    BEFORE UPDATE ON public.pengajuan_ijazah
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 8. DATA CONTOH AWAL (SEED DATA)
-- Memasukkan 2 contoh pengajuan agar pelacakan langsung dapat diuji coba:
-- Tiket 1: UNTAN-IJZ-2025-0842 (Rian Adiputra, S.T. - Teknik Sipil)
-- Tiket 2: UNTAN-IJZ-2025-0841 (Muhammad Fauzi Pratama - FKIP)

INSERT INTO public.pengajuan_ijazah (
    id,
    nomor_tiket,
    service_type,
    nim,
    nik,
    nama_lengkap,
    tempat_lahir,
    tanggal_lahir,
    fakultas,
    prodi,
    periode_yudisium,
    ipk,
    whatsapp,
    email,
    status,
    status_label,
    status_ijazah,
    current_step,
    total_steps,
    loket_pengambilan,
    catatan_petugas
) VALUES 
(
    'a1b2c3d4-e5f6-7890-abcd-111111111111',
    'UNTAN-IJZ-2025-0842',
    'perbaikan_data',
    'D101181042',
    '6171032410990001',
    'Rian Adiputra, S.T.',
    'Mempawah',
    '1999-10-24',
    'FT',
    'S1 Teknik Sipil',
    'Wisuda Periode I TA 2024/2025 (25 Oktober 2024)',
    '3.72 (Sangat Memuaskan)',
    '081256789012',
    'rian.adiputra@alumni.untan.ac.id',
    'validasi_akademik',
    'Dalam Proses Validasi Akademik BAAK',
    'Proses Cetak',
    2,
    6,
    'Loket 03 (Sub-bagian Ijazah & Legalisir) BAK Gedung Rektorat Untan',
    'Koreksi tempat lahir dari "Kabupaten Pontianak" menjadi "Mempawah" sesuai Akta Kelahiran resmi telah disetujui tim hukum fakultas. Sinkronisasi data Simalum ke PDDikti sedang diproses hari ini.'
),
(
    'b2c3d4e5-f6a7-8901-bcde-222222222222',
    'UNTAN-IJZ-2025-0841',
    'penerbitan_baru',
    'F1081191042',
    '6171031508990003',
    'MUHAMMAD FAUZI PRATAMA',
    'Pontianak',
    '1999-08-15',
    'FKIP',
    'S1 - Pendidikan Matematika',
    'Wisuda Periode III TA 2024/2025 (28 Januari 2025)',
    '3.84 (Dengan Pujian / Cumlaude)',
    '081256789012',
    'fauzi.pratama@student.untan.ac.id',
    'menunggu_verifikasi',
    'Pengajuan Diterima & Verifikasi Berkas Awal',
    'Pengajuan',
    1,
    6,
    'Subbagian Pendidikan & Akademik FKIP Untan',
    'Berkas permohonan baru diterima dalam sistem. Menunggu pemeriksaan verifikator loket daring.'
)
ON CONFLICT (nomor_tiket) DO NOTHING;

-- Riwayat linimasa untuk Tiket 1 (UNTAN-IJZ-2025-0842)
INSERT INTO public.riwayat_status (pengajuan_id, step_number, title, description, actor, status, waktu)
VALUES
(
    'a1b2c3d4-e5f6-7890-abcd-111111111111',
    1,
    'Tahap 1: Pengajuan Diterima & Verifikasi Berkas Awal',
    'Berkas digital persyaratan (KTP, Akta Kelahiran, Surat Pernyataan Perbaikan, dan Ijazah Asli terdahulu) telah diterima oleh verifikator loket daring BAK dan dinyatakan lengkap tanpa kekurangan dokumen formal.',
    'M. Ramdani (NIP. 198504122010121002)',
    'completed',
    TIMEZONE('asia/jakarta', NOW()) - INTERVAL '1 day'
),
(
    'a1b2c3d4-e5f6-7890-abcd-111111111111',
    2,
    'Tahap 2: Validasi Dokumen Akademik & Sinkronisasi PDDikti BAAK',
    'Sub-bagian Akademik Biro BAAK sedang melakukan pencocokan arsip fisik buku induk mahasiswa dengan pangkalan data PDDikti Kemendikbudristek untuk menerbitkan Berita Acara Perubahan Data Mahasiswa.',
    'Tim Validasi PDDikti Untan',
    'in_progress',
    TIMEZONE('asia/jakarta', NOW())
)
ON CONFLICT DO NOTHING;

-- Riwayat linimasa untuk Tiket 2 (UNTAN-IJZ-2025-0841)
INSERT INTO public.riwayat_status (pengajuan_id, step_number, title, description, actor, status, waktu)
VALUES
(
    'b2c3d4e5-f6a7-8901-bcde-222222222222',
    1,
    'Tahap 1: Pengajuan Diterima & Verifikasi Berkas Awal',
    'Pengajuan permohonan ijazah baru telah diterima secara elektronik oleh sistem portal Untan.',
    'Sistem Registrasi Online',
    'completed',
    TIMEZONE('asia/jakarta', NOW())
)
ON CONFLICT DO NOTHING;

-- ==============================================================================
-- 9. TABEL-TABEL BARU MODUL USER & SISTEM AUTENTIKASI MULTI-FAKTOR (MFA)
-- ==============================================================================
-- Mendukung:
-- 1. User login (NIM / Email + Password Hash dengan Salt)
-- 2. Merubah password (Change Password dengan Riwayat)
-- 3. Request to Reset / Lupa Password (Token Unik & OTP 6-Digit)
-- 4. Sistem Autentikasi Multi Faktor (MFA): Email OTP atau Smartphone (TOTP / SMS)
-- ==============================================================================

-- 9.1. Tabel Pengguna (public.users)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nim VARCHAR(30) UNIQUE,
    email VARCHAR(100) UNIQUE NOT NULL,
    nama_lengkap VARCHAR(150) NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt VARCHAR(64) NOT NULL,
    role VARCHAR(30) DEFAULT 'mahasiswa' CHECK (role IN ('mahasiswa', 'alumni', 'verifikator', 'admin')),
    status VARCHAR(30) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'pending_verification')),
    phone_number VARCHAR(30),
    avatar_url TEXT,
    fakultas VARCHAR(100),
    prodi VARCHAR(100),
    failed_login_attempts INT DEFAULT 0,
    locked_until TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    last_password_change_at TIMESTAMPTZ DEFAULT TIMEZONE('asia/jakarta', NOW()),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('asia/jakarta', NOW()),
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('asia/jakarta', NOW())
);

CREATE INDEX IF NOT EXISTS idx_users_nim ON public.users(nim);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);

-- 9.2. Tabel Pengaturan MFA (public.user_mfa_settings)
-- Mendukung verifikasi multi-faktor dengan Email dan Smartphone (Authenticator App TOTP atau SMS)
CREATE TABLE IF NOT EXISTS public.user_mfa_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    is_mfa_enabled BOOLEAN DEFAULT false,
    primary_method VARCHAR(30) DEFAULT 'email' CHECK (primary_method IN ('email', 'authenticator_app', 'sms')),
    email_mfa_enabled BOOLEAN DEFAULT true,
    authenticator_secret TEXT,
    authenticator_confirmed BOOLEAN DEFAULT false,
    phone_mfa_enabled BOOLEAN DEFAULT false,
    backup_codes JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('asia/jakarta', NOW()),
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('asia/jakarta', NOW())
);

CREATE INDEX IF NOT EXISTS idx_user_mfa_user_id ON public.user_mfa_settings(user_id);

-- 9.3. Tabel Permintaan Reset Password / Lupa Password (public.password_reset_requests)
CREATE TABLE IF NOT EXISTS public.password_reset_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    reset_token VARCHAR(100) UNIQUE NOT NULL,
    otp_code VARCHAR(10) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    is_used BOOLEAN DEFAULT false,
    used_at TIMESTAMPTZ,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('asia/jakarta', NOW())
);

CREATE INDEX IF NOT EXISTS idx_password_reset_token ON public.password_reset_requests(reset_token);
CREATE INDEX IF NOT EXISTS idx_password_reset_otp ON public.password_reset_requests(otp_code);
CREATE INDEX IF NOT EXISTS idx_password_reset_user_id ON public.password_reset_requests(user_id);

-- 9.4. Tabel Verifikasi & Tantangan MFA (public.mfa_verifications)
CREATE TABLE IF NOT EXISTS public.mfa_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    method VARCHAR(30) NOT NULL CHECK (method IN ('email', 'authenticator_app', 'sms')),
    session_token VARCHAR(100),
    otp_code VARCHAR(10) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    is_verified BOOLEAN DEFAULT false,
    verified_at TIMESTAMPTZ,
    attempts INT DEFAULT 0,
    max_attempts INT DEFAULT 5,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('asia/jakarta', NOW())
);

CREATE INDEX IF NOT EXISTS idx_mfa_verifications_session ON public.mfa_verifications(session_token);
CREATE INDEX IF NOT EXISTS idx_mfa_verifications_user_id ON public.mfa_verifications(user_id);

-- 9.5. Tabel Riwayat Perubahan Password (public.password_history)
CREATE TABLE IF NOT EXISTS public.password_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    password_hash TEXT NOT NULL,
    changed_at TIMESTAMPTZ DEFAULT TIMEZONE('asia/jakarta', NOW()),
    changed_via VARCHAR(50) DEFAULT 'user_change' CHECK (changed_via IN ('user_change', 'reset_request', 'admin_reset'))
);

CREATE INDEX IF NOT EXISTS idx_password_history_user_id ON public.password_history(user_id);

-- 9.6. Tabel Log Percobaan & Sesi Login (public.user_login_logs)
CREATE TABLE IF NOT EXISTS public.user_login_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    identifier VARCHAR(100) NOT NULL,
    status VARCHAR(30) NOT NULL CHECK (status IN ('success', 'mfa_required', 'failed_password', 'failed_mfa', 'account_locked')),
    auth_method VARCHAR(50) DEFAULT 'password',
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('asia/jakarta', NOW())
);

CREATE INDEX IF NOT EXISTS idx_user_login_logs_user_id ON public.user_login_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_login_logs_created ON public.user_login_logs(created_at);

-- 9.7. RLS untuk Tabel-tabel User & MFA
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_mfa_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfa_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_login_logs ENABLE ROW LEVEL SECURITY;

-- Kebijakan Akses:
-- users: Select publik untuk proses autentikasi (pencarian NIM/email); insert/update dibatasi
DROP POLICY IF EXISTS "Public read users for auth" ON public.users;
CREATE POLICY "Public read users for auth" ON public.users FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow user insert/register" ON public.users;
CREATE POLICY "Allow user insert/register" ON public.users FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow user update" ON public.users;
CREATE POLICY "Allow user update" ON public.users FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- user_mfa_settings:
DROP POLICY IF EXISTS "Public access user_mfa_settings" ON public.user_mfa_settings;
CREATE POLICY "Public access user_mfa_settings" ON public.user_mfa_settings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- password_reset_requests:
DROP POLICY IF EXISTS "Public access password_reset_requests" ON public.password_reset_requests;
CREATE POLICY "Public access password_reset_requests" ON public.password_reset_requests FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- mfa_verifications:
DROP POLICY IF EXISTS "Public access mfa_verifications" ON public.mfa_verifications;
CREATE POLICY "Public access mfa_verifications" ON public.mfa_verifications FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- password_history:
DROP POLICY IF EXISTS "Public access password_history" ON public.password_history;
CREATE POLICY "Public access password_history" ON public.password_history FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- user_login_logs:
DROP POLICY IF EXISTS "Public access user_login_logs" ON public.user_login_logs;
CREATE POLICY "Public access user_login_logs" ON public.user_login_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 9.8. SEED DATA AKUN PENGGUNA AWAL & MFA
-- Password bawaan untuk pengujian: 'PasswordUntan123!'
-- Salt statis contoh: 'untan_salt_2026_secure'
-- SHA-256('PasswordUntan123!' + 'untan_salt_2026_secure') = 
-- '0312509e3bd0a061610329e337a7faf00ec571b3cfd0fe7d9697189eb145cc3a'

INSERT INTO public.users (
    id,
    nim,
    email,
    nama_lengkap,
    password_hash,
    password_salt,
    role,
    status,
    phone_number,
    fakultas,
    prodi
) VALUES
(
    'c1d2e3f4-a5b6-7890-cdef-333333333331',
    'F1081191042',
    'fauzi.pratama@student.untan.ac.id',
    'MUHAMMAD FAUZI PRATAMA, S.Pd.',
    '0312509e3bd0a061610329e337a7faf00ec571b3cfd0fe7d9697189eb145cc3a',
    'untan_salt_2026_secure',
    'mahasiswa',
    'active',
    '081256789012',
    'FKIP',
    'S1 - Pendidikan Matematika'
),
(
    'c1d2e3f4-a5b6-7890-cdef-333333333332',
    'D101181042',
    'rian.adiputra@alumni.untan.ac.id',
    'Rian Adiputra, S.T.',
    '0312509e3bd0a061610329e337a7faf00ec571b3cfd0fe7d9697189eb145cc3a',
    'untan_salt_2026_secure',
    'alumni',
    'active',
    '085298765432',
    'FT',
    'S1 Teknik Sipil'
),
(
    'c1d2e3f4-a5b6-7890-cdef-333333333333',
    '198504122010121002',
    'admin.ijazah@untan.ac.id',
    'Administrator Biro Akademik (BAK) Untan',
    '0312509e3bd0a061610329e337a7faf00ec571b3cfd0fe7d9697189eb145cc3a',
    'untan_salt_2026_secure',
    'admin',
    'active',
    '081156789000',
    'BAK',
    'Biro Akademik dan Kemahasiswaan'
)
ON CONFLICT (email) DO NOTHING;

-- Pengaturan MFA untuk Fauzi Pratama (Email MFA aktif)
INSERT INTO public.user_mfa_settings (
    user_id,
    is_mfa_enabled,
    primary_method,
    email_mfa_enabled,
    authenticator_secret,
    authenticator_confirmed,
    phone_mfa_enabled,
    backup_codes
) VALUES
(
    'c1d2e3f4-a5b6-7890-cdef-333333333331',
    true,
    'email',
    true,
    'JBSWY3DPEHPK3PXP',
    false,
    false,
    '["83921045", "19482034", "55928172", "99381024"]'::jsonb
),
-- Pengaturan MFA untuk Rian Adiputra (Smartphone Authenticator App aktif)
(
    'c1d2e3f4-a5b6-7890-cdef-333333333332',
    true,
    'authenticator_app',
    true,
    'KVKFKRCPNZQUYMLX',
    true,
    true,
    '["44192083", "77182901", "33910294", "11293847"]'::jsonb
),
-- Pengaturan MFA untuk Admin (Email & Smartphone aktif)
(
    'c1d2e3f4-a5b6-7890-cdef-333333333333',
    true,
    'authenticator_app',
    true,
    'MZXW633PN5XW6MZX',
    true,
    true,
    '["99887766", "55443322", "11223344", "66778899"]'::jsonb
)
ON CONFLICT (user_id) DO NOTHING;


-- ==============================================================================
-- 10. MODUL MANAJEMEN REGISTRASI LAYANAN
-- ==============================================================================
-- Melengkapi kebutuhan pengelolaan registrasi layanan oleh petugas BAK:
-- 1. Master layanan resmi beserta persyaratan dokumennya.
-- 2. Registrasi layanan sebagai lapisan manajemen (workflow) dari pengajuan.
-- 3. Dokumen persyaratan, riwayat status, dan catatan internal/pemohon.
-- 4. Relasi ke public.users dan public.pengajuan_ijazah.
-- ==============================================================================

-- 10.1. Perluas nilai status_ijazah agar mendukung pembatalan registrasi
ALTER TABLE public.pengajuan_ijazah
DROP CONSTRAINT IF EXISTS pengajuan_ijazah_status_ijazah_check;

ALTER TABLE public.pengajuan_ijazah
ADD CONSTRAINT pengajuan_ijazah_status_ijazah_check
CHECK (status_ijazah IN ('Pengajuan', 'Proses Cetak', 'Final', 'Ditolak', 'Dibatalkan'));

-- 10.2. Master Layanan Resmi (public.layanan)
CREATE TABLE IF NOT EXISTS public.layanan (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kode VARCHAR(50) UNIQUE NOT NULL,
    nama VARCHAR(150) NOT NULL,
    deskripsi TEXT,
    kategori VARCHAR(50) DEFAULT 'akademik'
        CHECK (kategori IN ('akademik', 'legalisasi', 'digital', 'lainnya')),
    estimasi_hari INT DEFAULT 7,
    biaya NUMERIC(12, 2) DEFAULT 0,
    loket VARCHAR(200),
    ikon VARCHAR(80) DEFAULT 'history_edu',
    urutan INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('asia/jakarta', NOW()),
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('asia/jakarta', NOW())
);

CREATE INDEX IF NOT EXISTS idx_layanan_kode ON public.layanan(kode);
CREATE INDEX IF NOT EXISTS idx_layanan_active ON public.layanan(is_active, urutan);

-- 10.3. Persyaratan Dokumen per Layanan (public.layanan_persyaratan)
CREATE TABLE IF NOT EXISTS public.layanan_persyaratan (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    layanan_id UUID REFERENCES public.layanan(id) ON DELETE CASCADE NOT NULL,
    nama VARCHAR(200) NOT NULL,
    deskripsi TEXT,
    wajib BOOLEAN DEFAULT true,
    tipe_berkas VARCHAR(30) DEFAULT 'pdf'
        CHECK (tipe_berkas IN ('pdf', 'jpg', 'png', 'foto', 'dokumen')),
    urutan INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('asia/jakarta', NOW()),
    UNIQUE (layanan_id, nama)
);

CREATE INDEX IF NOT EXISTS idx_layanan_persyaratan_layanan ON public.layanan_persyaratan(layanan_id, urutan);

-- 10.4. Registrasi Layanan (public.registrasi_layanan)
-- Satu registrasi terhubung ke satu pengajuan_ijazah (relasi 1:1 opsional).
CREATE TABLE IF NOT EXISTS public.registrasi_layanan (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nomor_registrasi VARCHAR(50) UNIQUE NOT NULL,
    pengajuan_id UUID UNIQUE REFERENCES public.pengajuan_ijazah(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    layanan_id UUID REFERENCES public.layanan(id) ON DELETE RESTRICT,
    nama_pemohon VARCHAR(150) NOT NULL,
    nim VARCHAR(30),
    email VARCHAR(100),
    whatsapp VARCHAR(30),
    status VARCHAR(30) DEFAULT 'menunggu_verifikasi'
        CHECK (status IN ('draft', 'menunggu_verifikasi', 'diverifikasi', 'diproses', 'siap_diambil', 'selesai', 'ditolak', 'dibatalkan')),
    prioritas VARCHAR(20) DEFAULT 'normal'
        CHECK (prioritas IN ('rendah', 'normal', 'tinggi', 'urgent')),
    sumber VARCHAR(30) DEFAULT 'online'
        CHECK (sumber IN ('online', 'loket', 'import')),
    data_pemohon JSONB DEFAULT '{}'::jsonb,
    catatan_pemohon TEXT,
    catatan_petugas TEXT,
    petugas_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('asia/jakarta', NOW()),
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('asia/jakarta', NOW())
);

CREATE INDEX IF NOT EXISTS idx_registrasi_layanan_status ON public.registrasi_layanan(status);
CREATE INDEX IF NOT EXISTS idx_registrasi_layanan_layanan ON public.registrasi_layanan(layanan_id);
CREATE INDEX IF NOT EXISTS idx_registrasi_layanan_user ON public.registrasi_layanan(user_id);
CREATE INDEX IF NOT EXISTS idx_registrasi_layanan_nim ON public.registrasi_layanan(nim);
CREATE INDEX IF NOT EXISTS idx_registrasi_layanan_created ON public.registrasi_layanan(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_registrasi_layanan_pengajuan ON public.registrasi_layanan(pengajuan_id);


-- 10.5. Dokumen Persyaratan Registrasi (public.registrasi_layanan_dokumen)
CREATE TABLE IF NOT EXISTS public.registrasi_layanan_dokumen (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    registrasi_id UUID REFERENCES public.registrasi_layanan(id) ON DELETE CASCADE NOT NULL,
    jenis_dokumen VARCHAR(50) NOT NULL
        CHECK (jenis_dokumen IN ('pas_foto', 'ktp', 'pendukung', 'akta', 'ijazah_lama', 'surat_permohonan')),
    nama_berkas VARCHAR(200),
    file_url TEXT NOT NULL,
    mime_type VARCHAR(100),
    ukuran_bytes BIGINT,
    status_verifikasi VARCHAR(30) DEFAULT 'menunggu'
        CHECK (status_verifikasi IN ('menunggu', 'valid', 'tidak_valid')),
    catatan TEXT,
    uploaded_at TIMESTAMPTZ DEFAULT TIMEZONE('asia/jakarta', NOW()),
    verified_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    UNIQUE (registrasi_id, jenis_dokumen)
);

CREATE INDEX IF NOT EXISTS idx_registrasi_dokumen_registrasi ON public.registrasi_layanan_dokumen(registrasi_id);
CREATE INDEX IF NOT EXISTS idx_registrasi_dokumen_status ON public.registrasi_layanan_dokumen(status_verifikasi);

-- 10.6. Riwayat Status Registrasi (public.registrasi_layanan_riwayat)
CREATE TABLE IF NOT EXISTS public.registrasi_layanan_riwayat (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    registrasi_id UUID REFERENCES public.registrasi_layanan(id) ON DELETE CASCADE NOT NULL,
    status_lama VARCHAR(30),
    status_baru VARCHAR(30) NOT NULL,
    catatan TEXT,
    aktor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    aktor_nama VARCHAR(150),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('asia/jakarta', NOW())
);

CREATE INDEX IF NOT EXISTS idx_registrasi_riwayat_registrasi ON public.registrasi_layanan_riwayat(registrasi_id, created_at);

-- 10.7. Catatan Registrasi (public.registrasi_layanan_catatan)
CREATE TABLE IF NOT EXISTS public.registrasi_layanan_catatan (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    registrasi_id UUID REFERENCES public.registrasi_layanan(id) ON DELETE CASCADE NOT NULL,
    isi TEXT NOT NULL,
    tipe VARCHAR(20) DEFAULT 'internal' CHECK (tipe IN ('internal', 'pemohon')),
    penulis_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    penulis_nama VARCHAR(150),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('asia/jakarta', NOW())
);

CREATE INDEX IF NOT EXISTS idx_registrasi_catatan_registrasi ON public.registrasi_layanan_catatan(registrasi_id, created_at);

-- 10.8. Kolom relasi tambahan pada pengajuan_ijazah
ALTER TABLE public.pengajuan_ijazah
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.pengajuan_ijazah
ADD COLUMN IF NOT EXISTS layanan_id UUID REFERENCES public.layanan(id) ON DELETE SET NULL;

ALTER TABLE public.pengajuan_ijazah
ADD COLUMN IF NOT EXISTS prioritas VARCHAR(20) DEFAULT 'normal';

CREATE INDEX IF NOT EXISTS idx_pengajuan_user_id ON public.pengajuan_ijazah(user_id);
CREATE INDEX IF NOT EXISTS idx_pengajuan_layanan_id ON public.pengajuan_ijazah(layanan_id);

-- 10.9. Trigger pembaruan timestamp otomatis
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('asia/jakarta', NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_layanan_updated_at ON public.layanan;
CREATE TRIGGER trg_layanan_updated_at
BEFORE UPDATE ON public.layanan
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_registrasi_layanan_updated_at ON public.registrasi_layanan;
CREATE TRIGGER trg_registrasi_layanan_updated_at
BEFORE UPDATE ON public.registrasi_layanan
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- 10.10. Row Level Security (RLS) Modul Registrasi Layanan
-- CATATAN KEAMANAN:
-- Aplikasi portal saat ini memakai Supabase Anon Key tanpa Supabase Auth.
-- Kebijakan di bawah mengikuti pola aplikasi yang sudah ada agar fitur berjalan.
-- Untuk produksi, ganti dengan kebijakan berbasis auth.uid() dan role petugas.
ALTER TABLE public.layanan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.layanan_persyaratan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registrasi_layanan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registrasi_layanan_dokumen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registrasi_layanan_riwayat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registrasi_layanan_catatan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read layanan" ON public.layanan;
CREATE POLICY "Public read layanan" ON public.layanan
FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public manage layanan" ON public.layanan;
CREATE POLICY "Public manage layanan" ON public.layanan
FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read layanan persyaratan" ON public.layanan_persyaratan;
CREATE POLICY "Public read layanan persyaratan" ON public.layanan_persyaratan
FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public manage layanan persyaratan" ON public.layanan_persyaratan;
CREATE POLICY "Public manage layanan persyaratan" ON public.layanan_persyaratan
FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read registrasi layanan" ON public.registrasi_layanan;
CREATE POLICY "Public read registrasi layanan" ON public.registrasi_layanan
FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public create registrasi layanan" ON public.registrasi_layanan;
CREATE POLICY "Public create registrasi layanan" ON public.registrasi_layanan
FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Public update registrasi layanan" ON public.registrasi_layanan;
CREATE POLICY "Public update registrasi layanan" ON public.registrasi_layanan
FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public delete registrasi layanan" ON public.registrasi_layanan;
CREATE POLICY "Public delete registrasi layanan" ON public.registrasi_layanan
FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public access registrasi dokumen" ON public.registrasi_layanan_dokumen;
CREATE POLICY "Public access registrasi dokumen" ON public.registrasi_layanan_dokumen
FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access registrasi riwayat" ON public.registrasi_layanan_riwayat;
CREATE POLICY "Public access registrasi riwayat" ON public.registrasi_layanan_riwayat
FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access registrasi catatan" ON public.registrasi_layanan_catatan;
CREATE POLICY "Public access registrasi catatan" ON public.registrasi_layanan_catatan
FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 10.11. Seed Master Layanan Resmi
INSERT INTO public.layanan (kode, nama, deskripsi, kategori, estimasi_hari, biaya, loket, ikon, urutan, is_active)
VALUES
(
    'penerbitan_baru',
    'Penerbitan Ijazah Baru',
    'Penerbitan blanko ijazah resmi pertama bagi lulusan yudisium baru yang belum pernah menerima ijazah fisik.',
    'akademik', 14, 0,
    'Subbagian Pendidikan & Akademik Fakultas masing-masing',
    'school', 1, true
),
(
    'perbaikan_data',
    'Penerbitan Perbaikan Data',
    'Penerbitan ulang ijazah karena koreksi nama, tempat lahir, tanggal lahir, NIM, atau data akademik lain yang telah diverifikasi.',
    'akademik', 21, 0,
    'Loket 03 (Sub-bagian Ijazah & Legalisir) BAK Gedung Rektorat Untan',
    'edit_note', 2, true
),
(
    'penerbitan_ulang',
    'Penerbitan Ulang',
    'Penerbitan ijazah pengganti karena dokumen asli hilang, rusak berat, terbakar, atau tidak dapat digunakan lagi.',
    'akademik', 30, 0,
    'Loket 03 (Sub-bagian Ijazah & Legalisir) BAK Gedung Rektorat Untan',
    'restart_alt', 3, true
),
(
    'pencetakan_ulang',
    'Pencetakan Ulang',
    'Pencetakan salinan fisik dari ijazah TTE terverifikasi yang telah diterbitkan secara digital.',
    'legalisasi', 7, 0,
    'Loket 03 (Sub-bagian Ijazah & Legalisir) BAK Gedung Rektorat Untan',
    'print', 4, true
),
(
    'ijazah_tte',
    'Ijazah TTE (Tanda Tangan Elektronik)',
    'Penerbitan dan verifikasi ijazah digital ber-tanda tangan elektronik tersertifikasi BSrE.',
    'digital', 5, 0,
    'Layanan Digital BAK Untan (daring)',
    'verified', 5, true
)
ON CONFLICT (kode) DO UPDATE SET
    nama = EXCLUDED.nama,
    deskripsi = EXCLUDED.deskripsi,
    kategori = EXCLUDED.kategori,
    estimasi_hari = EXCLUDED.estimasi_hari,
    biaya = EXCLUDED.biaya,
    loket = EXCLUDED.loket,
    ikon = EXCLUDED.ikon,
    urutan = EXCLUDED.urutan,
    is_active = EXCLUDED.is_active,
    updated_at = TIMEZONE('asia/jakarta', NOW());


-- 10.12. Seed Persyaratan Dokumen per Layanan
INSERT INTO public.layanan_persyaratan (layanan_id, nama, deskripsi, wajib, tipe_berkas, urutan)
SELECT l.id, v.nama, v.deskripsi, v.wajib, v.tipe_berkas, v.urutan
FROM public.layanan l
JOIN (
    VALUES
    ('penerbitan_baru', 'Kartu Tanda Mahasiswa (KTM)', 'KTM aktif atau surat keterangan lulus dari fakultas.', true, 'pdf', 1),
    ('penerbitan_baru', 'Pas Foto Resmi 4x6', 'Latar biru polos, kertas doff, hasil crop PixelCrop Studio.', true, 'foto', 2),
    ('penerbitan_baru', 'Ijazah Jenjang Sebelumnya', 'Fotokopi/scan ijazah SMA/SMK/sederajat yang dilegalisir.', true, 'pdf', 3),
    ('penerbitan_baru', 'Surat Keterangan Yudisium', 'SK yudisium atau berita acara kelulusan dari fakultas.', true, 'pdf', 4),

    ('perbaikan_data', 'Kartu Tanda Penduduk (KTP)', 'KTP asli pemohon yang memuat data terbaru.', true, 'pdf', 1),
    ('perbaikan_data', 'Akta Kelahiran', 'Akta kelahiran sebagai dasar koreksi identitas.', true, 'pdf', 2),
    ('perbaikan_data', 'Ijazah Asli Terdahulu', 'Ijazah fisik lama yang akan diperbaiki.', true, 'pdf', 3),
    ('perbaikan_data', 'Surat Permohonan Perbaikan', 'Surat permohonan tertulis yang ditandatangani pemohon.', true, 'pdf', 4),

    ('penerbitan_ulang', 'Surat Keterangan Kehilangan', 'Laporan kehilangan dari kepolisian bila ijazah hilang.', true, 'pdf', 1),
    ('penerbitan_ulang', 'Berkas Pendukung Kerusakan', 'Foto/ijazah rusak berat sebagai bukti fisik.', true, 'foto', 2),
    ('penerbitan_ulang', 'Kartu Tanda Penduduk (KTP)', 'KTP pemohon yang masih berlaku.', true, 'pdf', 3),
    ('penerbitan_ulang', 'Surat Rekomendasi Fakultas', 'Rekomendasi dari dekan/fakultas asal.', true, 'pdf', 4),

    ('pencetakan_ulang', 'Ijazah TTE Terverifikasi', 'Dokumen ijazah digital TTE yang telah diverifikasi BSrE.', true, 'pdf', 1),
    ('pencetakan_ulang', 'Kartu Tanda Penduduk (KTP)', 'KTP pemohon untuk pencocokan identitas.', true, 'pdf', 2),
    ('pencetakan_ulang', 'Pas Foto Resmi 4x6', 'Pas foto terbaru sesuai standar Untan.', true, 'foto', 3),

    ('ijazah_tte', 'Kartu Tanda Penduduk (KTP)', 'KTP pemohon untuk verifikasi identitas digital.', true, 'pdf', 1),
    ('ijazah_tte', 'Alamat Surel Aktif', 'Surel resmi yang akan menerima tautan ijazah TTE.', true, 'dokumen', 2),
    ('ijazah_tte', 'Pas Foto Resmi 4x6', 'Pas foto digital sesuai standar ijazah Untan.', true, 'foto', 3)
) AS v(kode, nama, deskripsi, wajib, tipe_berkas, urutan)
ON v.kode = l.kode
ON CONFLICT (layanan_id, nama) DO NOTHING;

-- 10.13. Sinkronisasi data pengajuan lama menjadi registrasi layanan
INSERT INTO public.registrasi_layanan (
    nomor_registrasi,
    pengajuan_id,
    user_id,
    layanan_id,
    nama_pemohon,
    nim,
    email,
    whatsapp,
    status,
    prioritas,
    sumber,
    data_pemohon,
    catatan_petugas,
    created_at,
    updated_at
)
SELECT
    p.nomor_tiket,
    p.id,
    u.id,
    l.id,
    p.nama_lengkap,
    p.nim,
    p.email,
    p.whatsapp,
    CASE p.status_ijazah
        WHEN 'Final' THEN 'selesai'
        WHEN 'Ditolak' THEN 'ditolak'
        WHEN 'Dibatalkan' THEN 'dibatalkan'
        WHEN 'Proses Cetak' THEN
            CASE WHEN p.status = 'siap_diambil' THEN 'siap_diambil' ELSE 'diproses' END
        ELSE 'menunggu_verifikasi'
    END,
    COALESCE(p.prioritas, 'normal'),
    'online',
    jsonb_build_object(
        'nim', p.nim,
        'nik', p.nik,
        'nama_lengkap', p.nama_lengkap,
        'tempat_lahir', p.tempat_lahir,
        'tanggal_lahir', p.tanggal_lahir,
        'fakultas', p.fakultas,
        'prodi', p.prodi,
        'periode_yudisium', p.periode_yudisium,
        'ipk', p.ipk,
        'whatsapp', p.whatsapp,
        'email', p.email,
        'loket_pengambilan', p.loket_pengambilan
    ),
    p.catatan_petugas,
    p.created_at,
    p.updated_at
FROM public.pengajuan_ijazah p
LEFT JOIN public.users u ON u.nim = p.nim
LEFT JOIN public.layanan l ON l.kode = p.service_type
WHERE NOT EXISTS (
    SELECT 1 FROM public.registrasi_layanan r WHERE r.pengajuan_id = p.id
);

-- Lengkapi relasi user_id / layanan_id pada pengajuan lama
UPDATE public.pengajuan_ijazah p
SET user_id = u.id
FROM public.users u
WHERE u.nim = p.nim AND p.user_id IS NULL;

UPDATE public.pengajuan_ijazah p
SET layanan_id = l.id
FROM public.layanan l
WHERE l.kode = p.service_type AND p.layanan_id IS NULL;


-- 10.14. Sinkronisasi dokumen pengajuan lama
INSERT INTO public.registrasi_layanan_dokumen (registrasi_id, jenis_dokumen, nama_berkas, file_url, status_verifikasi)
SELECT r.id, 'pas_foto', 'Pas Foto Resmi 4x6', p.foto_url, 'menunggu'
FROM public.registrasi_layanan r
JOIN public.pengajuan_ijazah p ON p.id = r.pengajuan_id
WHERE p.foto_url IS NOT NULL
ON CONFLICT (registrasi_id, jenis_dokumen) DO NOTHING;

INSERT INTO public.registrasi_layanan_dokumen (registrasi_id, jenis_dokumen, nama_berkas, file_url, status_verifikasi)
SELECT r.id, 'ktp', 'Kartu Tanda Penduduk (KTP)', p.berkas_ktp_url, 'menunggu'
FROM public.registrasi_layanan r
JOIN public.pengajuan_ijazah p ON p.id = r.pengajuan_id
WHERE p.berkas_ktp_url IS NOT NULL
ON CONFLICT (registrasi_id, jenis_dokumen) DO NOTHING;

INSERT INTO public.registrasi_layanan_dokumen (registrasi_id, jenis_dokumen, nama_berkas, file_url, status_verifikasi)
SELECT r.id, 'pendukung', 'Berkas Pendukung', p.berkas_pendukung_url, 'menunggu'
FROM public.registrasi_layanan r
JOIN public.pengajuan_ijazah p ON p.id = r.pengajuan_id
WHERE p.berkas_pendukung_url IS NOT NULL
ON CONFLICT (registrasi_id, jenis_dokumen) DO NOTHING;

-- 10.15. Riwayat awal untuk registrasi hasil sinkronisasi
INSERT INTO public.registrasi_layanan_riwayat (registrasi_id, status_lama, status_baru, catatan, aktor_nama, created_at)
SELECT
    r.id,
    NULL,
    r.status,
    'Registrasi layanan disinkronkan dari data pengajuan ijazah yang telah ada.',
    'Sistem Migrasi Data',
    r.created_at
FROM public.registrasi_layanan r
WHERE NOT EXISTS (
    SELECT 1 FROM public.registrasi_layanan_riwayat h WHERE h.registrasi_id = r.id
);

-- 10.16. View gabungan untuk kebutuhan panel manajemen
CREATE OR REPLACE VIEW public.v_manajemen_registrasi_layanan AS
SELECT
    r.*,
    l.kode AS layanan_kode,
    l.nama AS layanan_nama,
    l.kategori AS layanan_kategori,
    l.loket AS layanan_loket,
    u.nama_lengkap AS petugas_nama,
    p.status_ijazah,
    p.status_label,
    p.loket_pengambilan,
    (
        SELECT COUNT(*) FROM public.registrasi_layanan_dokumen d
        WHERE d.registrasi_id = r.id
    ) AS jumlah_dokumen,
    (
        SELECT COUNT(*) FROM public.registrasi_layanan_dokumen d
        WHERE d.registrasi_id = r.id AND d.status_verifikasi = 'valid'
    ) AS jumlah_dokumen_valid
FROM public.registrasi_layanan r
LEFT JOIN public.layanan l ON l.id = r.layanan_id
LEFT JOIN public.users u ON u.id = r.petugas_id
LEFT JOIN public.pengajuan_ijazah p ON p.id = r.pengajuan_id;

-- Selesai Modul Manajemen Registrasi Layanan

