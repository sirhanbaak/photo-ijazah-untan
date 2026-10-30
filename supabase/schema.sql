-- ==============================================================================
-- SKEMA DATABASE SUPABASE: PORTAL LAYANAN PENERBITAN IJAZAH UNTAN
-- ==============================================================================
-- Jalankan skrip ini di Supabase SQL Editor (Dashboard > SQL Editor > New query).
-- Skrip ini akan membuat tabel, relasi, indeks, Row Level Security (RLS), 
-- konfigurasi bucket storage, serta data contoh awal (seed data).
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
    current_step INT DEFAULT 1,
    total_steps INT DEFAULT 6,
    loket_pengambilan VARCHAR(150),
    catatan_petugas TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('asia/jakarta', NOW()),
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('asia/jakarta', NOW())
);

-- Indeks untuk pencarian cepat berdasarkan nomor tiket dan NIM
CREATE INDEX IF NOT EXISTS idx_pengajuan_nomor_tiket ON public.pengajuan_ijazah(nomor_tiket);
CREATE INDEX IF NOT EXISTS idx_pengajuan_nim ON public.pengajuan_ijazah(nim);
CREATE INDEX IF NOT EXISTS idx_pengajuan_email ON public.pengajuan_ijazah(email);

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

-- Izinkan update pengajuan
DROP POLICY IF EXISTS "Public can update pengajuan" ON public.pengajuan_ijazah;
CREATE POLICY "Public can update pengajuan" 
ON public.pengajuan_ijazah 
FOR UPDATE 
TO anon, authenticated 
USING (true)
WITH CHECK (true);

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

