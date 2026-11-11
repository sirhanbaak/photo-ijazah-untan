const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test.describe('Fase 4: Penyelarasan Frontend-Backend (GAP-15, GAP-18, GAP-19, GAP-20)', () => {

  test('GAP-15: updateAvatarUrl dan uploadAvatar memperbarui sesi dan sinkron ke users Supabase', async ({ page }) => {
    await page.goto('/user/login.html');

    const result = await page.evaluate(async () => {
      let updatedUsers = [];
      let auditLogs = [];

      const mockClient = {
        from: (table) => {
          if (table === 'users') {
            return {
              update: (data) => ({
                eq: async (col, val) => {
                  updatedUsers.push({ col, val, ...data });
                  return { data, error: null };
                }
              })
            };
          }
          if (table === 'audit_auth_logs') {
            return {
              insert: async (data) => {
                auditLogs.push(data);
                return { data, error: null };
              }
            };
          }
          return {};
        },
        storage: {
          from: () => ({
            upload: async () => ({ data: { path: 'avatars/test.jpg' }, error: null }),
            getPublicUrl: (path) => ({ data: { publicUrl: 'https://supabase.co/storage/v1/object/public/dokumen-ijazah/' + path } })
          })
        }
      };

      const origClient = window.UntanSupabase ? window.UntanSupabase.getClient : null;
      if (window.UntanSupabase) {
        window.UntanSupabase.getClient = () => mockClient;
      }

      // Login akun simulasi
      window.UntanUserAuth.completeLoginSession({
        id: 'usr_avatar_test_1',
        email: 'avatar.tester@student.untan.ac.id',
        nim: 'F1081191088',
        nama_lengkap: 'Avatar Tester',
        role: 'mahasiswa'
      });

      // 1. Uji updateAvatarUrl
      const testAvatarUrl = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80';
      const updateRes = await window.UntanUserAuth.updateAvatarUrl('usr_avatar_test_1', testAvatarUrl);

      // Periksa sesi aktif setelah update
      const currentAfter = window.UntanUserAuth.getCurrentUser();

      // 2. Uji uploadAvatar dengan Dummy File
      const dummyFile = new File(['dummy binary'], 'profile.jpg', { type: 'image/jpeg' });
      const uploadRes = await window.UntanUserAuth.uploadAvatar('usr_avatar_test_1', dummyFile);

      if (window.UntanSupabase && origClient) {
        window.UntanSupabase.getClient = origClient;
      }

      return {
        updateRes,
        sessionAvatar: currentAfter.avatar_url,
        updatedUsers,
        auditLogs,
        uploadSuccess: uploadRes.success,
        uploadUrl: uploadRes.avatarUrl
      };
    });

    expect(result.updateRes.success).toBe(true);
    expect(result.sessionAvatar).toBe('https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80');
    expect(result.updatedUsers.length).toBeGreaterThan(0);
    expect(result.updatedUsers[0].val).toBe('usr_avatar_test_1');
    expect(result.updatedUsers[0].avatar_url).toBeDefined();

    expect(result.uploadSuccess).toBe(true);
    expect(result.uploadUrl).toContain('avatars/');
  });

  test('GAP-18: Memastikan payload dan kode frontend bersih dari referensi obsolete berkas_syarat_urls', async ({ page }) => {
    await page.goto('/pengajuan.html');

    const check = await page.evaluate(async () => {
      let capturedPayload = null;

      const mockClient = {
        from: (table) => {
          if (table === 'pengajuan_ijazah') {
            return {
              select: () => ({
                eq: () => ({
                  limit: async () => ({ data: [], error: null }),
                  order: () => ({
                    limit: async () => ({ data: [], error: null })
                  })
                })
              }),
              insert: (arr) => {
                capturedPayload = arr[0];
                return {
                  select: () => ({
                    single: async () => ({ data: { id: 'new_id', ...arr[0] }, error: null })
                  })
                };
              }
            };
          }
          if (table === 'riwayat_status') {
            return { insert: async () => ({ data: [], error: null }) };
          }
          if (table === 'layanan') {
            return {
              select: () => ({
                eq: () => ({ limit: async () => ({ data: [{ id: 'lay_1' }], error: null }) })
              })
            };
          }
          return {};
        }
      };

      const origClient = window.UntanSupabase.getClient;
      window.UntanSupabase.getClient = () => mockClient;

      await window.UntanSupabase.submitPengajuan({
        nim: 'F1081191077',
        nama_lengkap: 'TEST BEBAS OBSOLETE',
        service_type: 'penerbitan_baru',
        ipk: '3.80'
      });

      window.UntanSupabase.getClient = origClient;

      return {
        hasLegacyField: 'berkas_syarat_urls' in (capturedPayload || {}),
        hasKtpField: 'berkas_ktp_url' in (capturedPayload || {}),
        hasPendukungField: 'berkas_pendukung_url' in (capturedPayload || {})
      };
    });

    expect(check.hasLegacyField).toBe(false);
    expect(check.hasKtpField).toBe(true);
    expect(check.hasPendukungField).toBe(true);
  });

  test('GAP-19: File migrasi pengerasan RLS produksi dan indeks skalabilitas tersedia', async () => {
    const migrationFile = path.join(__dirname, '..', 'supabase', 'migrations', '20261109_production_rls_hardening.sql');
    expect(fs.existsSync(migrationFile)).toBe(true);

    const content = fs.readFileSync(migrationFile, 'utf8');
    expect(content).toContain('idx_pengajuan_user_id_created');
    expect(content).toContain('idx_pengajuan_nim_created');
    expect(content).toContain('auth.uid()');
    expect(content).toContain('public.users');
    expect(content).toContain('public.user_mfa_settings');
  });

  test('GAP-20: Teks notice pratinjau di lacak.html diperbarui dan disembunyikan saat data riil ditemukan', async ({ page, context }) => {
    await context.clearCookies();
    await page.addInitScript(() => {
      localStorage.removeItem('UNTAN_USER_AUTH_SESSION');
    });
    await page.goto('/lacak.html');

    // 1. Verifikasi teks banner notice awal
    const noticeBox = page.locator('#trackingNoticeBox');
    await expect(noticeBox).toBeVisible();
    await expect(noticeBox).toContainText('Pratinjau Format Linimasa');

    // 2. Mock pencarian sukses dan verifikasi banner disembunyikan
    await page.evaluate(async () => {
      window.UntanSupabase.getPengajuan = async () => ({
        success: true,
        data: {
          nomor_tiket: 'UNTAN-IJZ-2026-LIVE',
          nim: 'F1081191042',
          nama_lengkap: 'MUHAMMAD FAUZI PRATAMA, S.PD.',
          status_label: 'Tahap 3: Validasi PIN PDDikti',
          status_ijazah: 'Pengajuan',
          current_step: 3,
          total_steps: 6
        },
        riwayat: [
          { step_number: 1, title: 'Pengajuan Berkas', status: 'completed' },
          { step_number: 2, title: 'Verifikasi Berkas', status: 'completed' },
          { step_number: 3, title: 'Validasi PIN', status: 'in_progress' }
        ]
      });

      // Sesi login mock agar pencarian terotentikasi dapat dieksekusi
      if (window.UntanUserAuth && typeof window.UntanUserAuth.completeLoginSession === 'function') {
        window.UntanUserAuth.completeLoginSession({
          id: 'usr_fauzi_mock',
          nim: 'F1081191042',
          nama_lengkap: 'MUHAMMAD FAUZI PRATAMA, S.PD.'
        });
      }

      // Panggil pencarian
      await triggerSearchVisual('UNTAN-IJZ-2026-LIVE');
    });

    // Verifikasi noticeBox sekarang tersembunyi
    await expect(noticeBox).toBeHidden();
  });

});
