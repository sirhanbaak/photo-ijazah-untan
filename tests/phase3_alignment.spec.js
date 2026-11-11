const { test, expect } = require('@playwright/test');

test.describe('Fase 3: Penyelarasan Frontend-Backend (GAP-08 s/d GAP-14)', () => {

  test('GAP-08: Validasi IPK wajib untuk layanan Penerbitan Baru di pengajuan.html dan helper validateIpk', async ({ page }) => {
    // 1. Verifikasi helper validateIpk di UntanSupabase
    await page.goto('/pengajuan.html');
    const helperCheck = await page.evaluate(() => {
      const valid = window.UntanSupabase.validateIpk('3.75', 'penerbitan_baru');
      const emptyCheck = window.UntanSupabase.validateIpk('', 'penerbitan_baru');
      const negativeCheck = window.UntanSupabase.validateIpk('-1', 'penerbitan_baru');
      const overCheck = window.UntanSupabase.validateIpk('4.50', 'penerbitan_baru');
      const otherServiceEmpty = window.UntanSupabase.validateIpk('', 'perbaikan_data');

      return {
        valid: valid.valid,
        emptyValid: emptyCheck.valid,
        emptyMessage: emptyCheck.message,
        negativeValid: negativeCheck.valid,
        overValid: overCheck.valid,
        otherServiceValid: otherServiceEmpty.valid
      };
    });

    expect(helperCheck.valid).toBe(true);
    expect(helperCheck.emptyValid).toBe(false);
    expect(helperCheck.emptyMessage).toContain('wajib diisi');
    expect(helperCheck.negativeValid).toBe(false);
    expect(helperCheck.overValid).toBe(false);
    expect(helperCheck.otherServiceValid).toBe(true);

    // 2. Verifikasi pencegahan submit saat IPK dikosongkan pada pengajuan.html
    // Login akun terlebih dahulu
    await page.evaluate(() => {
      window.UntanUserAuth.completeLoginSession({
        id: 'usr_test_gap08',
        email: 'budi.santoso@student.untan.ac.id',
        nim: 'F1081191001',
        nama_lengkap: 'BUDI SANTOSO',
        role: 'mahasiswa'
      });
    });

    await page.reload();

    // Tangkap dialog alert
    let dialogMessages = [];
    page.on('dialog', async dialog => {
      dialogMessages.push(dialog.message());
      await dialog.accept();
    });

    // Pastikan tombol kirim aktif
    const btnKirim = page.locator('#btnKirimPermohonan');
    await expect(btnKirim).toBeEnabled();

    // Centang checkbox legalitas
    await page.check('#legalCheckbox');

    // Kosongkan nilai IPK
    await page.evaluate(() => {
      const el = document.getElementById('ipk');
      if (el) el.value = '';
    });

    // Klik submit
    await page.click('#btnKirimPermohonan');

    const ipkAlert = dialogMessages.find(m => m.includes('Indeks Prestasi Kumulatif (IPK) wajib diisi'));
    expect(ipkAlert).toBeDefined();
  });

  test('GAP-09: user/index.html menggunakan initHeaderNav secara terpadu untuk guest dan user login', async ({ page }) => {
    // 1. Uji Mode Guest (Belum Login)
    await page.goto('/user/login.html');
    await page.evaluate(() => window.UntanUserAuth.logout());
    await page.goto('/user/index.html');

    // Container #userProfileHeader memuat tombol Masuk Akun via initHeaderNav
    const headerLoginBtn = page.locator('#userProfileHeader #headerLoginBtn');
    await expect(headerLoginBtn).toBeVisible();
    await expect(headerLoginBtn).toHaveAttribute('href', 'login.html');

    // Drawer mobile memuat #mobileUserProfileDrawer
    const mobileDrawer = page.locator('#mobileUserProfileDrawer');
    await expect(mobileDrawer).toBeAttached();

    // 2. Uji Mode Terotentikasi (Sudah Login)
    await page.evaluate(() => {
      window.UntanUserAuth.completeLoginSession({
        id: 'usr_test_gap09',
        email: 'hendra.gunawan@student.untan.ac.id',
        nim: 'F1081191044',
        nama_lengkap: 'Hendra Gunawan',
        role: 'mahasiswa'
      });
    });

    await page.reload();

    // Header memuat avatar dropdown
    const dropdownBtn = page.locator('#userProfileHeader #userProfileDropdownBtn');
    await expect(dropdownBtn).toBeVisible();
    await expect(dropdownBtn).toContainText('Hendra');

    // Buka dropdown
    await dropdownBtn.click();
    const dropdownMenu = page.locator('#userProfileHeader #userProfileDropdownMenu');
    await expect(dropdownMenu).toBeVisible();
    await expect(dropdownMenu).toContainText('Hendra Gunawan');
    await expect(dropdownMenu.locator('#headerBtnLogout')).toBeVisible();

    // Klik tombol logout dari dropdown header
    await dropdownMenu.locator('#headerBtnLogout').click();

    // Setelah logout, kembali menampilkan tombol Masuk Akun
    await expect(page.locator('#userProfileHeader #headerLoginBtn')).toBeVisible();
  });

  test('GAP-10: SERVICE_TYPES enum dan validasi tipe layanan resmi di submitPengajuan', async ({ page }) => {
    await page.goto('/pengajuan.html');

    const result = await page.evaluate(async () => {
      // 1. Periksa kamus SERVICE_TYPES
      const types = window.UntanSupabase.SERVICE_TYPES;
      const valid1 = window.UntanSupabase.isValidServiceType('penerbitan_baru');
      const valid2 = window.UntanSupabase.isValidServiceType('perbaikan_data');
      const valid3 = window.UntanSupabase.isValidServiceType('penerbitan_ulang');
      const valid4 = window.UntanSupabase.isValidServiceType('pencetakan_ulang');
      const invalid = window.UntanSupabase.isValidServiceType('layanan_ilegal');

      // 2. Coba kirimkan service_type yang tidak sah ke submitPengajuan
      const submitRes = await window.UntanSupabase.submitPengajuan({
        service_type: 'layanan_palsu_99',
        nim: 'F1081191001',
        nama_lengkap: 'TEST'
      });

      return {
        types,
        validAll: valid1 && valid2 && valid3 && valid4,
        invalidRejected: !invalid,
        submitSuccess: submitRes.success,
        submitError: submitRes.error ? submitRes.error.message : ''
      };
    });

    expect(result.validAll).toBe(true);
    expect(result.invalidRejected).toBe(true);
    expect(result.types.PENERBITAN_BARU).toBe('penerbitan_baru');
    expect(result.submitSuccess).toBe(false);
    expect(result.submitError).toContain('tidak valid');
  });

  test('GAP-11, GAP-12, GAP-13: Verifikasi MFA, Pencatatan Log Login Gagal & Sanitasi Upsert MFA', async ({ page }) => {
    await page.goto('/user/login.html');

    const result = await page.evaluate(async () => {
      let insertedLogs = [];
      let updatedVerifications = [];
      let upsertedMfa = [];

      // Mock Supabase Client
      const mockClient = {
        from: (tableName) => {
          return {
            insert: async (data) => {
              if (tableName === 'user_login_logs') insertedLogs.push(data);
              return { data, error: null };
            },
            update: (updateData) => {
              return {
                eq: async (col, val) => {
                  if (tableName === 'mfa_verifications') {
                    updatedVerifications.push({ col, val, ...updateData });
                  }
                  return { data: updateData, error: null };
                }
              };
            },
            upsert: async (data, opts) => {
              if (tableName === 'user_mfa_settings') {
                upsertedMfa.push({ data, opts });
              }
              return { data, error: null };
            },
            select: () => ({
              eq: () => ({
                single: async () => ({ data: null, error: null })
              })
            })
          };
        }
      };

      const origGetClient = window.UntanSupabase ? window.UntanSupabase.getClient : null;
      if (window.UntanSupabase) {
        window.UntanSupabase.getClient = () => mockClient;
      }

      // 1. GAP-12: Percobaan login gagal mencatat ke user_login_logs dengan user_agent
      await window.UntanUserAuth.login('F1081191042', 'PasswordSalahTotal!');

      // 2. GAP-11: verifyMfa memperbarui mfa_verifications
      sessionStorage.setItem('UNTAN_PENDING_MFA', JSON.stringify({
        user: { id: 'usr_gap11', email: 'test@untan.ac.id' },
        sessionToken: 'sess_test_mfa_token',
        emailOtp: '888999',
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        mfaSettings: { primary_method: 'email', is_mfa_enabled: true }
      }));

      await window.UntanUserAuth.verifyMfa('sess_test_mfa_token', '888999', 'email');

      // 3. GAP-13: updateMfaSettings memanggil upsert dengan { onConflict: 'user_id' } dan membersihkan id non-UUID
      await window.UntanUserAuth.updateMfaSettings('usr_gap13', {
        id: 'fake_local_id_not_uuid',
        is_mfa_enabled: true,
        primary_method: 'authenticator_app'
      });

      if (window.UntanSupabase && origGetClient) {
        window.UntanSupabase.getClient = origGetClient;
      }

      return {
        insertedLogs,
        updatedVerifications,
        upsertedMfa
      };
    });

    // Evaluasi hasil
    // GAP-12: Ada log gagal dengan status 'failed'
    expect(result.insertedLogs.length).toBeGreaterThan(0);
    const failedLog = result.insertedLogs.find(l => l.status === 'failed');
    expect(failedLog).toBeDefined();
    expect(failedLog.failure_reason).toBe('invalid_password');
    expect(failedLog.user_agent).toBeDefined();

    // GAP-11: mfa_verifications diupdate is_verified: true
    expect(result.updatedVerifications.length).toBeGreaterThan(0);
    expect(result.updatedVerifications[0].is_verified).toBe(true);
    expect(result.updatedVerifications[0].val).toBe('sess_test_mfa_token');

    // GAP-13: upsert user_mfa_settings menggunakan onConflict: 'user_id' dan id non-UUID dibersihkan
    expect(result.upsertedMfa.length).toBeGreaterThan(0);
    expect(result.upsertedMfa[0].opts).toEqual({ onConflict: 'user_id' });
    expect(result.upsertedMfa[0].data.id).toBeUndefined();
    expect(result.upsertedMfa[0].data.is_mfa_enabled).toBe(true);
  });

  test('GAP-14: Resolusi layanan_id dan penyertaan kolom prioritas pada payload submitPengajuan', async ({ page }) => {
    await page.goto('/pengajuan.html');

    const result = await page.evaluate(async () => {
      let interceptedPayload = null;

      const mockClient = {
        from: (table) => {
          if (table === 'layanan') {
            return {
              select: () => ({
                eq: (col, val) => ({
                  limit: async () => ({
                    data: [{ id: 'layanan_uuid_penerbitan_baru_123' }],
                    error: null
                  })
                })
              })
            };
          }
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
                interceptedPayload = arr[0];
                return {
                  select: () => ({
                    single: async () => ({
                      data: { id: 'new_pengajuan_id', ...arr[0] },
                      error: null
                    })
                  })
                };
              }
            };
          }
          if (table === 'riwayat_status') {
            return {
              insert: async () => ({ data: [], error: null })
            };
          }
          return {};
        }
      };

      const origClient = window.UntanSupabase.getClient;
      window.UntanSupabase.getClient = () => mockClient;

      const dummyFile = new Blob(['sample'], { type: 'text/plain' });

      await window.UntanSupabase.submitPengajuan({
        nim: 'F1081191055',
        nama_lengkap: 'TES RESOLUSI LAYANAN',
        service_type: 'penerbitan_baru',
        ipk: '3.90'
      });

      window.UntanSupabase.getClient = origClient;

      return {
        payload: interceptedPayload
      };
    });

    expect(result.payload).toBeDefined();
    expect(result.payload.layanan_id).toBe('layanan_uuid_penerbitan_baru_123');
    expect(result.payload.prioritas).toBe('normal');
    expect(result.payload.service_type).toBe('penerbitan_baru');
  });

});
