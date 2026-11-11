-- ==============================================================================
-- Migrasi Supabase: Penyelarasan Frontend-Backend Fase 3 (GAP-08 s/d GAP-14)
-- Tanggal: 9 November 2026
-- ==============================================================================

-- 1. Constraint Validasi service_type pada pengajuan_ijazah (GAP-10)
ALTER TABLE public.pengajuan_ijazah 
DROP CONSTRAINT IF EXISTS pengajuan_ijazah_service_type_check;

ALTER TABLE public.pengajuan_ijazah 
ADD CONSTRAINT pengajuan_ijazah_service_type_check 
CHECK (service_type IN ('penerbitan_baru', 'perbaikan_data', 'penerbitan_ulang', 'pencetakan_ulang'));

-- 2. Pastikan kolom layanan_id & prioritas tersedia (GAP-14)
ALTER TABLE public.pengajuan_ijazah 
ADD COLUMN IF NOT EXISTS layanan_id UUID REFERENCES public.layanan(id) ON DELETE SET NULL;

ALTER TABLE public.pengajuan_ijazah 
ADD COLUMN IF NOT EXISTS prioritas VARCHAR(20) DEFAULT 'normal';

-- 3. Indeks untuk optimasi query berdasarkan service_type & prioritas
CREATE INDEX IF NOT EXISTS idx_pengajuan_service_type ON public.pengajuan_ijazah(service_type);
CREATE INDEX IF NOT EXISTS idx_pengajuan_layanan_id ON public.pengajuan_ijazah(layanan_id);
CREATE INDEX IF NOT EXISTS idx_pengajuan_prioritas ON public.pengajuan_ijazah(prioritas);

-- 4. Pastikan kolom user_agent dan failure_reason pada user_login_logs ada (GAP-12)
ALTER TABLE public.user_login_logs
ADD COLUMN IF NOT EXISTS user_agent TEXT;

ALTER TABLE public.user_login_logs
ADD COLUMN IF NOT EXISTS failure_reason VARCHAR(100);

-- 5. Pastikan indeks audit log & login log cepat
CREATE INDEX IF NOT EXISTS idx_user_login_logs_user_status ON public.user_login_logs(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_auth_logs_event ON public.audit_auth_logs(event_type, created_at DESC);

