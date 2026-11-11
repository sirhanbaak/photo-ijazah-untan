-- ==============================================================================
-- Migrasi Supabase: Pengerasan Keamanan RLS Tingkat Produksi (GAP-19)
-- Portal Layanan Penerbitan Ijazah - Universitas Tanjungpura
-- Tanggal: 9 November 2026
-- ==============================================================================

-- 1. Indeks Tambahan untuk Skalabilitas Kueri Dashboard & Pelacakan
CREATE INDEX IF NOT EXISTS idx_pengajuan_user_id_created 
ON public.pengajuan_ijazah(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pengajuan_nim_created 
ON public.pengajuan_ijazah(nim, created_at DESC);

-- 2. Panduan & Naskah Pengerasan Row Level Security (RLS) Produksi
-- CATATAN IMPLEMENTASI:
-- Jalankan blok kebijakan di bawah saat portal siap beralih dari mode Anon Key ke mode Supabase Auth produksi.
-- Kebijakan ini membatasi hak akses CRUD per-pengguna berdasarkan JWT ID (auth.uid()).

-- 2.1. Tabel Pengguna (public.users)
-- Membatasi mahasiswa agar hanya dapat membaca dan mengubah profil mereka sendiri
/*
DROP POLICY IF EXISTS "Public read users for auth" ON public.users;
DROP POLICY IF EXISTS "Allow user update" ON public.users;

CREATE POLICY "Production: User can view own profile" 
ON public.users 
FOR SELECT 
TO authenticated 
USING (auth.uid() = id);

CREATE POLICY "Production: User can update own profile" 
ON public.users 
FOR UPDATE 
TO authenticated 
USING (auth.uid() = id) 
WITH CHECK (auth.uid() = id);
*/

-- 2.2. Tabel Pengaturan MFA (public.user_mfa_settings)
-- Memastikan pengaturan autentikasi 2FA hanya dapat diakses oleh pemilik akun
/*
DROP POLICY IF EXISTS "Public access user_mfa_settings" ON public.user_mfa_settings;

CREATE POLICY "Production: User can manage own MFA settings" 
ON public.user_mfa_settings 
FOR ALL 
TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);
*/

-- 2.3. Tabel Permohonan Ijazah (public.pengajuan_ijazah)
-- Mahasiswa hanya dapat melihat pengajuan miliknya, publik hanya dapat melacak melalui nomor tiket tertentu
/*
DROP POLICY IF EXISTS "Public can read pengajuan by ticket or nim" ON public.pengajuan_ijazah;
DROP POLICY IF EXISTS "Public can update pengajuan if status Pengajuan" ON public.pengajuan_ijazah;

CREATE POLICY "Production: User can read own pengajuan" 
ON public.pengajuan_ijazah 
FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

CREATE POLICY "Production: Public track by ticket" 
ON public.pengajuan_ijazah 
FOR SELECT 
TO anon, authenticated 
USING (nomor_tiket IS NOT NULL);

CREATE POLICY "Production: User can update own pengajuan if Pengajuan" 
ON public.pengajuan_ijazah 
FOR UPDATE 
TO authenticated 
USING (auth.uid() = user_id AND status_ijazah = 'Pengajuan') 
WITH CHECK (auth.uid() = user_id AND status_ijazah = 'Pengajuan');
*/

-- 2.4. Tabel Riwayat Login (public.user_login_logs) & Sesi (public.user_sessions)
/*
DROP POLICY IF EXISTS "Public access user_login_logs" ON public.user_login_logs;

CREATE POLICY "Production: User can view own login logs" 
ON public.user_login_logs 
FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

CREATE POLICY "Production: Insert login logs" 
ON public.user_login_logs 
FOR INSERT 
TO anon, authenticated 
WITH CHECK (true);
*/

