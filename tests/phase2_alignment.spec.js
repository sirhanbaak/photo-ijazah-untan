const { test, expect } = require('@playwright/test');

test.describe('Fase 2: Keselarasan Frontend-Backend (GAP-04, GAP-05, GAP-06, GAP-07)', () => {

  test('GAP-04: Elemen input berkas e-KTP dan Berkas Pendukung tersedia dan interaktif di pengajuan.html', async ({ page }) => {
    await page.goto('/pengajuan.html');

    // Input berkas KTP dan Berkas Pendukung harus ada
    const ktpInput = page.locator('#berkasKtp');
    const pendukungInput = page.locator('#berkasPendukung');
    const ktpStatus = page.locator('#berkasKtpStatus');
    const pendukungStatus = page.locator('#berkasPendukungStatus');

    await expect(ktpInput).toBeAttached();
    await expect(pendukungInput).toBeAttached();
    await expect(ktpStatus).toContainText('Belum ada berkas');
    await expect(pendukungStatus).toContainText('Belum ada berkas');

    // Simulasi pemilihan file e-KTP
    await ktpInput.setInputFiles({
      name: 'ktp_fauzi_2026.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 dummy ktp content')
    });
    await expect(ktpStatus).toContainText('ktp_fauzi_2026.pdf');
    await expect(ktpStatus).toContainText('siap diunggah');

    // Simulasi pemilihan file berkas pendukung
    await pendukungInput.setInputFiles({
      name: 'surat_kehilangan_polisi.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 dummy surat kehilangan content')
    });
    await expect(pendukungStatus).toContainText('surat_kehilangan_polisi.pdf');
    await expect(pendukungStatus).toContainText('siap diunggah');
  });

  test('GAP-04: submitPengajuan memproses dan mengunggah berkas_ktp dan berkas_pendukung ke Supabase Storage', async ({ page }) => {
    await page.goto('/pengajuan.html');

    const result = await page.evaluate(async () => {
      if (!window.UntanSupabase) return { error: 'UntanSupabase not found' };

      // Mock uploadFile untuk memverifikasi kategori yang diterima
      const originalUpload = window.UntanSupabase.uploadFile;
      const uploadedCategories = [];

      window.UntanSupabase.uploadFile = async function (file, category, options) {
        uploadedCategories.push(category);
        return {
          url: `https://storage.untan.ac.id/dokumen-ijazah/${category}/mock_${file.name}`,
          error: null
        };
      };

      const dummyPhoto = new File([new Uint8Array(450 * 660 * 4)], 'pas_foto_4x6.jpg', { type: 'image/jpeg' });
      const dummyKtp = new File([new Uint8Array(1024)], 'ktp_sample.pdf', { type: 'application/pdf' });
      const dummyPendukung = new File([new Uint8Array(2048)], 'ijazah_lama.pdf', { type: 'application/pdf' });

      // Mock client insert
      const client = window.UntanSupabase.getClient();
      let capturedPayload = null;
      let origFrom = null;
      if (client) {
        origFrom = client.from;
        client.from = function (table) {
          if (table === 'pengajuan_ijazah') {
            const builder = {
              select: function () { return builder; },
              eq: function () { return builder; },
              or: function () { return builder; },
              order: function () { return builder; },
              limit: function () { return Promise.resolve({ data: [], error: null }); },
              single: function () { return Promise.resolve({ data: capturedPayload, error: null }); },
              then: function (resolve) { resolve({ data: [], error: null }); },
              insert: function (records) {
                capturedPayload = records[0];
                return {
                  select: function () {
                    return {
                      single: function () {
                        return Promise.resolve({
                          data: { id: 'mock-uuid-1234', ...records[0] },
                          error: null
                        });
                      }
                    };
                  }
                };
              }
            };
            return builder;
          }
          if (table === 'riwayat_status') {
            return {
              insert: function () {
                return Promise.resolve({ data: [], error: null });
              }
            };
          }
          return origFrom.apply(this, arguments);
        };
      }

      const res = await window.UntanSupabase.submitPengajuan({
        nim: 'F1081191099',
        nama_lengkap: 'TEST MAHASISWA BERKAS',
        nik: '6171010101010001',
        tempat_lahir: 'Pontianak',
        tanggal_lahir: '2000-01-01',
        fakultas: 'FKIP',
        prodi: 'Pendidikan Matematika',
        whatsapp: '081234567890',
        email: 'test.berkas@student.untan.ac.id'
      }, {
        foto: dummyPhoto,
        berkas_ktp: dummyKtp,
        berkas_pendukung: dummyPendukung
      });

      window.UntanSupabase.uploadFile = originalUpload;
      if (client && origFrom) client.from = origFrom;

      return {
        success: res.success,
        error: res.error ? (res.error.message || res.error) : null,
        uploadedCategories,
        hasKtpUrl: Boolean(capturedPayload && capturedPayload.berkas_ktp_url),
        hasPendukungUrl: Boolean(capturedPayload && capturedPayload.berkas_pendukung_url),
        ktpUrl: capturedPayload ? capturedPayload.berkas_ktp_url : '',
        pendukungUrl: capturedPayload ? capturedPayload.berkas_pendukung_url : ''
      };
    });

    expect(result.success).toBe(true);
    expect(result.uploadedCategories).toContain('pas-foto');
    expect(result.uploadedCategories).toContain('berkas-ktp');
    expect(result.uploadedCategories).toContain('berkas-pendukung');
    expect(result.hasKtpUrl).toBe(true);
    expect(result.hasPendukungUrl).toBe(true);
    expect(result.ktpUrl).toContain('berkas-ktp');
    expect(result.pendukungUrl).toContain('berkas-pendukung');
  });

  test('GAP-07: Proteksi Account Lockout - Menghitung failed_login_attempts dan mengunci akun setelah 5 kali gagal', async ({ page }) => {
    await page.goto('/user/login.html');

    const lockoutResult = await page.evaluate(async () => {
      if (!window.UntanUserAuth) return { error: 'UntanUserAuth missing' };

      // Siapkan user percobaan pengujian
      const testEmail = 'fauzi.lockout.test@student.untan.ac.id';
      const testNim = 'F1081199999';
      const users = JSON.parse(localStorage.getItem('UNTAN_LOCAL_USERS_DB') || '[]');
      let testUser = users.find(u => u.email === testEmail);

      if (!testUser) {
        testUser = {
          id: 'test-user-lockout-uuid',
          nim: testNim,
          email: testEmail,
          nama_lengkap: 'FAUZI LOCKOUT TEST',
          password_hash: '0312509e3bd0a061610329e337a7faf00ec571b3cfd0fe7d9697189eb145cc3a',
          password_salt: 'untan_salt_2026_secure',
          role: 'mahasiswa',
          status: 'active',
          failed_login_attempts: 0,
          locked_until: null
        };
        users.push(testUser);
        localStorage.setItem('UNTAN_LOCAL_USERS_DB', JSON.stringify(users));
      } else {
        testUser.failed_login_attempts = 0;
        testUser.locked_until = null;
        localStorage.setItem('UNTAN_LOCAL_USERS_DB', JSON.stringify(users));
      }

      // Coba login salah 4 kali
      const attempt1 = await window.UntanUserAuth.login(testEmail, 'PasswordSalah1!');
      const attempt2 = await window.UntanUserAuth.login(testEmail, 'PasswordSalah2!');
      const attempt3 = await window.UntanUserAuth.login(testEmail, 'PasswordSalah3!');
      const attempt4 = await window.UntanUserAuth.login(testEmail, 'PasswordSalah4!');

      // Coba login salah ke-5 (harus memicu penguncian akun)
      const attempt5 = await window.UntanUserAuth.login(testEmail, 'PasswordSalah5!');

      // Percobaan ke-6 (saat sudah terkunci)
      const attempt6 = await window.UntanUserAuth.login(testEmail, 'PasswordUntan123!');

      const updatedUsers = JSON.parse(localStorage.getItem('UNTAN_LOCAL_USERS_DB') || '[]');
      const savedUser = updatedUsers.find(u => u.email === testEmail);

      return {
        att1Success: attempt1.success,
        att1Attempts: attempt1.failedAttempts,
        att4Warning: attempt4.message.includes('Sisa kesempatan'),
        att5Locked: attempt5.locked === true,
        att5Msg: attempt5.message,
        att6Success: attempt6.success,
        att6Msg: attempt6.message,
        savedAttempts: savedUser ? savedUser.failed_login_attempts : 0,
        isLockedUntilFuture: Boolean(savedUser && savedUser.locked_until && new Date(savedUser.locked_until) > new Date())
      };
    });

    expect(lockoutResult.att1Success).toBe(false);
    expect(lockoutResult.att1Attempts).toBe(1);
    expect(lockoutResult.att4Warning).toBe(true);
    expect(lockoutResult.att5Locked).toBe(true);
    expect(lockoutResult.att5Msg).toContain('terkunci');
    expect(lockoutResult.att6Success).toBe(false);
    expect(lockoutResult.att6Msg).toContain('sementara terkunci');
    expect(lockoutResult.isLockedUntilFuture).toBe(true);
  });

  test('GAP-05 & GAP-06: changePassword dan verifyResetToken mendukung sinkronisasi data', async ({ page }) => {
    await page.goto('/user/index.html');

    const testRes = await page.evaluate(async () => {
      if (!window.UntanUserAuth) return { error: 'UntanUserAuth missing' };

      // 1. Uji changePassword menolak password lama salah
      const wrongOldPass = await window.UntanUserAuth.changePassword(
        'c1d2e3f4-a5b6-7890-cdef-333333333331',
        'SalahKetikPassword123!',
        'KataSandiBaruValid2026!'
      );

      // 2. Uji requestPasswordReset dan verifyResetToken
      const resetReq = await window.UntanUserAuth.requestPasswordReset('F1081191042');
      const token = resetReq.resetToken;
      const otp = resetReq.otpCode;

      const checkToken = await window.UntanUserAuth.verifyResetToken(token);
      const checkOtp = await window.UntanUserAuth.verifyResetToken(otp);
      const checkInvalid = await window.UntanUserAuth.verifyResetToken('TOKEN_SALAH_EXPIRED');

      return {
        wrongOldPassSuccess: wrongOldPass.success,
        wrongOldPassMsg: wrongOldPass.message,
        resetReqSuccess: resetReq.success,
        tokenValid: checkToken.valid,
        otpValid: checkOtp.valid,
        invalidValid: checkInvalid.valid
      };
    });

    expect(testRes.wrongOldPassSuccess).toBe(false);
    expect(testRes.wrongOldPassMsg).toContain('salah');
    expect(testRes.resetReqSuccess).toBe(true);
    expect(testRes.tokenValid).toBe(true);
    expect(testRes.otpValid).toBe(true);
    expect(testRes.invalidValid).toBe(false);
  });

});
