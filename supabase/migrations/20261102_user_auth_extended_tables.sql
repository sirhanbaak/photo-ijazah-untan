-- ==============================================================================
-- MIGRASI SUPABASE: TABEL-TABEL TAMBAHAN MODUL AKUN & OTENTIFIKASI PENGGUNA
-- PORTAL LAYANAN PENERBITAN IJAZAH - UNIVERSITAS TANJUNGPURA
-- ==============================================================================
-- Jalankan skrip ini di Supabase SQL Editor (Dashboard > SQL Editor > New query).
-- Skrip ini melengkapi seluruh arsitektur akun, sesi, audit, dan otentifikasi:
-- 1. public.user_sessions              (Sesi login multi-perangkat & pembatalan sesi)
-- 2. public.auth_otp_codes             (Sentralisasi kode OTP multi-saluran)
-- 3. public.user_trusted_devices       (Daftar perangkat terpercaya bypass MFA 30 hari)
-- 4. public.audit_auth_logs            (Jejak audit komprehensif keamanan akun)
-- 5. public.user_profiles              (Biodata kependudukan & akademik pemohon)
-- 6. public.user_notification_preferences (Preferensi notifikasi email/whatsapp)
-- 7. public.user_notifications         (Pusat notifikasi in-app pengguna)
-- 8. Triggers, Views & Seed Data
-- ==============================================================================

-- 1. Ekstensi UUID (bila belum aktif)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- 0. PRASYARAT TABEL MASTER USER & INDUK PENGAJUAN (JIKA BELUM ADA)
-- ==============================================================================
-- Memastikan skrip migrasi ini mandiri (self-contained) dan dapat dijalankan langsung
-- tanpa ketergantungan urutan skema terdahulu.

-- 0.1. Tabel Pengguna (public.users)
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

-- 0.2. Tabel Pengaturan MFA (public.user_mfa_settings)
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

-- 0.3. Tabel Permintaan Reset Password (public.password_reset_requests)
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

-- 0.4. Tabel Verifikasi & Tantangan MFA (public.mfa_verifications)
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

-- 0.5. Tabel Riwayat Perubahan Password (public.password_history)
CREATE TABLE IF NOT EXISTS public.password_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    password_hash TEXT NOT NULL,
    changed_at TIMESTAMPTZ DEFAULT TIMEZONE('asia/jakarta', NOW()),
    changed_via VARCHAR(50) DEFAULT 'user_change' CHECK (changed_via IN ('user_change', 'reset_request', 'admin_reset'))
);

CREATE INDEX IF NOT EXISTS idx_password_history_user_id ON public.password_history(user_id);

-- 0.6. Tabel Log Percobaan & Sesi Login (public.user_login_logs)
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

-- 0.7. Tabel Induk Pengajuan Ijazah (public.pengajuan_ijazah) jika belum ada
CREATE TABLE IF NOT EXISTS public.pengajuan_ijazah (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nomor_tiket VARCHAR(50) UNIQUE NOT NULL,
    service_type VARCHAR(50) NOT NULL DEFAULT 'penerbitan_baru',
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    layanan_id UUID,
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
    status VARCHAR(50) DEFAULT 'menunggu_verifikasi',
    status_label VARCHAR(100) DEFAULT 'Menunggu Verifikasi Berkas Awal',
    status_ijazah VARCHAR(30) DEFAULT 'Pengajuan',
    current_step INT DEFAULT 1,
    total_steps INT DEFAULT 6,
    loket_pengambilan VARCHAR(150),
    catatan_petugas TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('asia/jakarta', NOW()),
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('asia/jakarta', NOW())
);

-- Pastikan kolom user_id dan status_ijazah ada pada tabel yang sudah dibuat terdahulu
ALTER TABLE public.pengajuan_ijazah 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.pengajuan_ijazah 
ADD COLUMN IF NOT EXISTS layanan_id UUID;

ALTER TABLE public.pengajuan_ijazah 
ADD COLUMN IF NOT EXISTS status_ijazah VARCHAR(30) DEFAULT 'Pengajuan';

CREATE INDEX IF NOT EXISTS idx_pengajuan_nomor_tiket ON public.pengajuan_ijazah(nomor_tiket);
CREATE INDEX IF NOT EXISTS idx_pengajuan_nim ON public.pengajuan_ijazah(nim);
CREATE INDEX IF NOT EXISTS idx_pengajuan_user_id ON public.pengajuan_ijazah(user_id);

-- 0.8. Seed Data Pengguna Awal (Budi Santoso & Rian Adiputra & Admin)
INSERT INTO public.users (
    id, nim, email, nama_lengkap, password_hash, password_salt, role, status, phone_number, fakultas, prodi
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

INSERT INTO public.user_mfa_settings (
    user_id, is_mfa_enabled, primary_method, email_mfa_enabled, authenticator_secret, authenticator_confirmed, phone_mfa_enabled, backup_codes
) VALUES
(
    'c1d2e3f4-a5b6-7890-cdef-333333333331',
    true, 'email', true, 'JBSWY3DPEHPK3PXP', false, false,
    '["83921045", "19482034", "55928172", "99381024"]'::jsonb
),
(
    'c1d2e3f4-a5b6-7890-cdef-333333333332',
    true, 'authenticator_app', true, 'KVKFKRCPNZQUYMLX', true, true,
    '["44192083", "77182901", "33910294", "11293847"]'::jsonb
),
(
    'c1d2e3f4-a5b6-7890-cdef-333333333333',
    true, 'authenticator_app', true, 'MZXW633PN5XW6MZX', true, true,
    '["99887766", "55443322", "11223344", "66778899"]'::jsonb
)
ON CONFLICT (user_id) DO NOTHING;

-- RLS untuk tabel-tabel modul autentikasi inti
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_mfa_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfa_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_login_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read users for auth" ON public.users;
CREATE POLICY "Public read users for auth" ON public.users FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Allow user insert/register" ON public.users;
CREATE POLICY "Allow user insert/register" ON public.users FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Allow user update" ON public.users;
CREATE POLICY "Allow user update" ON public.users FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access user_mfa_settings" ON public.user_mfa_settings;
CREATE POLICY "Public access user_mfa_settings" ON public.user_mfa_settings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access password_reset_requests" ON public.password_reset_requests;
CREATE POLICY "Public access password_reset_requests" ON public.password_reset_requests FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access mfa_verifications" ON public.mfa_verifications;
CREATE POLICY "Public access mfa_verifications" ON public.mfa_verifications FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access password_history" ON public.password_history;
CREATE POLICY "Public access password_history" ON public.password_history FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access user_login_logs" ON public.user_login_logs;
CREATE POLICY "Public access user_login_logs" ON public.user_login_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ==============================================================================
-- 1. TABEL SESI LOGIN PENGGUNA (public.user_sessions)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    session_token VARCHAR(128) UNIQUE NOT NULL,
    refresh_token VARCHAR(128) UNIQUE,
    device_type VARCHAR(50) DEFAULT 'desktop' CHECK (device_type IN ('desktop', 'mobile', 'tablet', 'unknown')),
    device_name VARCHAR(150),
    browser VARCHAR(100),
    os VARCHAR(100),
    ip_address VARCHAR(50),
    user_agent TEXT,
    is_active BOOLEAN DEFAULT true,
    is_revoked BOOLEAN DEFAULT false,
    revoked_at TIMESTAMPTZ,
    revoked_reason VARCHAR(100), -- 'user_logout', 'password_changed', 'security_lock', 'expired', 'admin_revoked'
    last_active_at TIMESTAMPTZ DEFAULT TIMEZONE('asia/jakarta', NOW()),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('asia/jakarta', NOW())
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON public.user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON public.user_sessions(user_id, is_active, is_revoked);

-- ==============================================================================
-- 2. TABEL KODE VERIFIKASI OTP SENTRAL (public.auth_otp_codes)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.auth_otp_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    identifier VARCHAR(100) NOT NULL, -- Email atau nomor telepon tujuan
    otp_code VARCHAR(10) NOT NULL,
    otp_hash TEXT,
    purpose VARCHAR(50) NOT NULL 
        CHECK (purpose IN ('email_mfa', 'sms_mfa', 'whatsapp_mfa', 'forgot_password', 'email_verification', 'phone_verification', 'change_password_verify', 'sensitive_action')),
    channel VARCHAR(20) DEFAULT 'email' 
        CHECK (channel IN ('email', 'sms', 'whatsapp')),
    expires_at TIMESTAMPTZ NOT NULL,
    is_consumed BOOLEAN DEFAULT false,
    consumed_at TIMESTAMPTZ,
    attempts INT DEFAULT 0,
    max_attempts INT DEFAULT 5,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('asia/jakarta', NOW())
);

CREATE INDEX IF NOT EXISTS idx_auth_otp_identifier ON public.auth_otp_codes(identifier, purpose, is_consumed);
CREATE INDEX IF NOT EXISTS idx_auth_otp_code ON public.auth_otp_codes(otp_code);
CREATE INDEX IF NOT EXISTS idx_auth_otp_expires ON public.auth_otp_codes(expires_at);

-- ==============================================================================
-- 3. TABEL PERANGKAT TERPERCAYA (public.user_trusted_devices)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.user_trusted_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    device_fingerprint VARCHAR(128) NOT NULL,
    device_name VARCHAR(150) NOT NULL,
    device_type VARCHAR(50) DEFAULT 'desktop' CHECK (device_type IN ('desktop', 'mobile', 'tablet')),
    browser VARCHAR(100),
    os VARCHAR(100),
    ip_address VARCHAR(50),
    is_trusted BOOLEAN DEFAULT true,
    trusted_until TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ DEFAULT TIMEZONE('asia/jakarta', NOW()),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('asia/jakarta', NOW()),
    UNIQUE(user_id, device_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_trusted_devices_user ON public.user_trusted_devices(user_id, is_trusted);
CREATE INDEX IF NOT EXISTS idx_trusted_devices_fingerprint ON public.user_trusted_devices(device_fingerprint);

-- ==============================================================================
-- 4. TABEL JEJAK AUDIT KEAMANAN AKUN (public.audit_auth_logs)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.audit_auth_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    event_type VARCHAR(60) NOT NULL,
    severity VARCHAR(20) DEFAULT 'info' 
        CHECK (severity IN ('info', 'low', 'medium', 'warning', 'high', 'critical')),
    description TEXT NOT NULL,
    actor_type VARCHAR(30) DEFAULT 'user' 
        CHECK (actor_type IN ('user', 'admin', 'system')),
    actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    ip_address VARCHAR(50),
    user_agent TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('asia/jakarta', NOW())
);

CREATE INDEX IF NOT EXISTS idx_audit_auth_user ON public.audit_auth_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_auth_event ON public.audit_auth_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_auth_created ON public.audit_auth_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_auth_severity ON public.audit_auth_logs(severity);

-- ==============================================================================
-- 5. TABEL BIODATA & PROFIL DETAIL AKADEMIK (public.user_profiles)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    nik VARCHAR(20),
    tempat_lahir VARCHAR(100),
    tanggal_lahir DATE,
    jenis_kelamin VARCHAR(20) CHECK (jenis_kelamin IN ('Laki-laki', 'Perempuan')),
    agama VARCHAR(30),
    alamat_domisili TEXT,
    rt_rw VARCHAR(20),
    kelurahan VARCHAR(100),
    kecamatan VARCHAR(100),
    kota VARCHAR(100),
    provinsi VARCHAR(100),
    kode_pos VARCHAR(10),
    kontak_darurat_nama VARCHAR(150),
    kontak_darurat_hubungan VARCHAR(50),
    kontak_darurat_telepon VARCHAR(30),
    tahun_masuk INT,
    tahun_lulus INT,
    ipk_kelulusan VARCHAR(30),
    pin_pddikti VARCHAR(50),
    nomor_ijazah_nasional VARCHAR(50),
    status_akademik VARCHAR(30) DEFAULT 'lulus' 
        CHECK (status_akademik IN ('aktif', 'lulus', 'cuti', 'drop_out', 'alumni')),
    ktp_file_url TEXT,
    ktm_file_url TEXT,
    ijazah_file_url TEXT,
    is_data_verified BOOLEAN DEFAULT false,
    verified_at TIMESTAMPTZ,
    verified_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('asia/jakarta', NOW()),
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('asia/jakarta', NOW())
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON public.user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_nik ON public.user_profiles(nik);

-- ==============================================================================
-- 6. TABEL PREFERENSI NOTIFIKASI AKUN (public.user_notification_preferences)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.user_notification_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    notify_login_new_device BOOLEAN DEFAULT true,
    notify_status_change BOOLEAN DEFAULT true,
    notify_security_alerts BOOLEAN DEFAULT true,
    notify_via_email BOOLEAN DEFAULT true,
    notify_via_whatsapp BOOLEAN DEFAULT true,
    preferred_language VARCHAR(10) DEFAULT 'id',
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('asia/jakarta', NOW()),
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('asia/jakarta', NOW())
);

CREATE INDEX IF NOT EXISTS idx_user_notif_pref_user ON public.user_notification_preferences(user_id);

-- ==============================================================================
-- 7. TABEL NOTIFIKASI IN-APP PENGGUNA (public.user_notifications)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.user_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    category VARCHAR(50) DEFAULT 'info' 
        CHECK (category IN ('info', 'permohonan', 'keamanan', 'pengumuman', 'sistem')),
    action_url TEXT,
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('asia/jakarta', NOW())
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_read ON public.user_notifications(user_id, is_read, created_at DESC);

-- ==============================================================================
-- 8. TRIGGERS & FUNGSI OTOMATISASI KEAMANAN
-- ==============================================================================
-- Helper fungsi update timestamp
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('asia/jakarta', NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_updated_at
BEFORE UPDATE ON public.user_profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_user_notif_pref_updated_at ON public.user_notification_preferences;
CREATE TRIGGER trg_user_notif_pref_updated_at
BEFORE UPDATE ON public.user_notification_preferences
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Trigger Otomatis: Batalkan Sesi Aktif saat Kata Sandi Diganti
CREATE OR REPLACE FUNCTION public.handle_user_password_change()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.password_hash <> OLD.password_hash THEN
        NEW.last_password_change_at = TIMEZONE('asia/jakarta', NOW());
        
        -- 1. Cabut seluruh sesi aktif milik akun ini di semua perangkat
        UPDATE public.user_sessions
        SET is_active = false,
            is_revoked = true,
            revoked_at = TIMEZONE('asia/jakarta', NOW()),
            revoked_reason = 'password_changed'
        WHERE user_id = NEW.id AND is_active = true;

        -- 2. Catat audit trail keamanan tingkat warning
        INSERT INTO public.audit_auth_logs (
            user_id, event_type, severity, description, actor_type, actor_id
        ) VALUES (
            NEW.id,
            'password_changed',
            'warning',
            'Kata sandi akun telah berhasil diperbarui. Seluruh sesi aktif di perangkat lain otomatis dicabut.',
            'user',
            NEW.id
        );

        -- 3. Terbitkan notifikasi in-app kepada pengguna
        INSERT INTO public.user_notifications (
            user_id, title, message, category
        ) VALUES (
            NEW.id,
            'Kata Sandi Akun Berhasil Diperbarui',
            'Kata sandi akun Anda baru saja diganti. Jika Anda tidak merasa melakukan tindakan ini, segera amankan akun Anda via HelpDesk BAK Untan.',
            'keamanan'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_password_changed ON public.users;
CREATE TRIGGER trg_user_password_changed
BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.handle_user_password_change();

-- ==============================================================================
-- 9. ROW LEVEL SECURITY (RLS)
-- ==============================================================================
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_otp_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_trusted_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_auth_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public access user_sessions" ON public.user_sessions;
CREATE POLICY "Public access user_sessions" ON public.user_sessions
FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access auth_otp_codes" ON public.auth_otp_codes;
CREATE POLICY "Public access auth_otp_codes" ON public.auth_otp_codes
FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access user_trusted_devices" ON public.user_trusted_devices;
CREATE POLICY "Public access user_trusted_devices" ON public.user_trusted_devices
FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access audit_auth_logs" ON public.audit_auth_logs;
CREATE POLICY "Public access audit_auth_logs" ON public.audit_auth_logs
FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access user_profiles" ON public.user_profiles;
CREATE POLICY "Public access user_profiles" ON public.user_profiles
FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access user_notification_preferences" ON public.user_notification_preferences;
CREATE POLICY "Public access user_notification_preferences" ON public.user_notification_preferences
FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access user_notifications" ON public.user_notifications;
CREATE POLICY "Public access user_notifications" ON public.user_notifications
FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ==============================================================================
-- 10. SEED DATA AWAL MODUL AKUN
-- ==============================================================================
-- 10.1. Profil Mahasiswa Fauzi Pratama & Rian Adiputra
INSERT INTO public.user_profiles (
    user_id, nik, tempat_lahir, tanggal_lahir, jenis_kelamin, agama,
    alamat_domisili, kota, provinsi, tahun_masuk, tahun_lulus, ipk_kelulusan,
    pin_pddikti, status_akademik, is_data_verified
) VALUES
(
    'c1d2e3f4-a5b6-7890-cdef-333333333331',
    '6171031508990003',
    'Pontianak',
    '1999-08-15',
    'Laki-laki',
    'Islam',
    'Jl. Daya Nasional, Kompleks Untan No. B-12',
    'Kota Pontianak',
    'Kalimantan Barat',
    2019,
    2024,
    '3.84',
    'PIN-UNTAN-2025-FKIP-0841',
    'lulus',
    true
),
(
    'c1d2e3f4-a5b6-7890-cdef-333333333332',
    '6171032410990001',
    'Mempawah',
    '1999-10-24',
    'Laki-laki',
    'Islam',
    'Jl. Gusti M. Taufik No. 45',
    'Kabupaten Mempawah',
    'Kalimantan Barat',
    2018,
    2024,
    '3.72',
    'PIN-UNTAN-2024-FT-0842',
    'alumni',
    true
)
ON CONFLICT (user_id) DO NOTHING;

-- 10.2. Preferensi Notifikasi Awal
INSERT INTO public.user_notification_preferences (user_id, notify_login_new_device, notify_status_change, notify_security_alerts, notify_via_email, notify_via_whatsapp)
VALUES
('c1d2e3f4-a5b6-7890-cdef-333333333331', true, true, true, true, true),
('c1d2e3f4-a5b6-7890-cdef-333333333332', true, true, true, true, false),
('c1d2e3f4-a5b6-7890-cdef-333333333333', true, true, true, true, true)
ON CONFLICT (user_id) DO NOTHING;

-- 10.3. Notifikasi Awal Pengguna
INSERT INTO public.user_notifications (user_id, title, message, category, action_url)
VALUES
(
    'c1d2e3f4-a5b6-7890-cdef-333333333331',
    'Selamat Datang di Portal Ijazah UNTAN',
    'Akun Anda telah aktif dan terhubung ke Pangkalan Data Mahasiswa. Pengajuan UNTAN-IJZ-2025-0841 sedang dalam proses verifikasi berkas awal.',
    'permohonan',
    '../lacak.html?q=UNTAN-IJZ-2025-0841'
),
(
    'c1d2e3f4-a5b6-7890-cdef-333333333331',
    'Proteksi Autentikasi Multi-Faktor (MFA) Aktif',
    'Akun Anda dilindungi dengan autentikasi lapis kedua (Surel OTP). Setiap proses masuk akan diverifikasi melalui surel resmi Anda.',
    'keamanan',
    'index.html#pengaturan-keamanan'
),
(
    'c1d2e3f4-a5b6-7890-cdef-333333333332',
    'Status Berkas: Dalam Proses Cetak',
    'Permohonan perbaikan data UNTAN-IJZ-2025-0842 telah disetujui dan sedang dalam validasi akademik BAAK.',
    'permohonan',
    '../lacak.html?q=UNTAN-IJZ-2025-0842'
);

-- ==============================================================================
-- 11. VIEW TERPADU IKHTISAR AKUN PENGGUNA (public.v_user_account_overview)
-- ==============================================================================
CREATE OR REPLACE VIEW public.v_user_account_overview AS
SELECT
    u.id AS user_id,
    u.nim,
    u.email,
    u.nama_lengkap,
    u.role,
    u.status,
    u.phone_number,
    u.avatar_url,
    u.fakultas,
    u.prodi,
    u.failed_login_attempts,
    u.locked_until,
    u.last_login_at,
    u.last_password_change_at,
    COALESCE(m.is_mfa_enabled, false) AS is_mfa_enabled,
    COALESCE(m.primary_method, 'email') AS mfa_primary_method,
    COALESCE(m.email_mfa_enabled, true) AS email_mfa_enabled,
    COALESCE(m.authenticator_confirmed, false) AS authenticator_confirmed,
    COALESCE(m.phone_mfa_enabled, false) AS phone_mfa_enabled,
    p.nik,
    p.tempat_lahir,
    p.tanggal_lahir,
    p.jenis_kelamin,
    p.status_akademik,
    p.pin_pddikti,
    p.is_data_verified,
    (
        SELECT COUNT(*) FROM public.user_sessions s
        WHERE s.user_id = u.id AND s.is_active = true AND s.expires_at > TIMEZONE('asia/jakarta', NOW())
    ) AS active_session_count,
    (
        SELECT COUNT(*) FROM public.user_trusted_devices td
        WHERE td.user_id = u.id AND td.is_trusted = true AND td.trusted_until > TIMEZONE('asia/jakarta', NOW())
    ) AS trusted_device_count,
    (
        SELECT COUNT(*) FROM public.user_notifications n
        WHERE n.user_id = u.id AND n.is_read = false
    ) AS unread_notification_count,
    (
        SELECT COUNT(*) FROM public.pengajuan_ijazah pi
        WHERE pi.user_id = u.id OR (u.nim IS NOT NULL AND pi.nim = u.nim)
    ) AS total_pengajuan_count
FROM public.users u
LEFT JOIN public.user_mfa_settings m ON m.user_id = u.id
LEFT JOIN public.user_profiles p ON p.user_id = u.id;

-- Selesai Skrip Migrasi Modul Akun Tambahan

