const { test, expect } = require('@playwright/test');

test.describe('Integrasi Supabase Portal Ijazah', () => {
  test('modul Supabase terpasang dan dapat mengelola konfigurasi kredensial', async ({ page }) => {
    await page.goto('/pengajuan.html');

    const result = await page.evaluate(() => {
      if (!window.UntanSupabase) return { loaded: false };
      
      const initialConfig = window.UntanSupabase.getConfig();
      const ticket = window.UntanSupabase.generateTicketNumber();

      // Tes penyimpanan konfigurasi ke localStorage
      window.UntanSupabase.saveConfig('https://testproject123.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummykey');
      const savedConfig = window.UntanSupabase.getConfig();

      // Reset kembali ke default kfspavyphfteuowfqrau
      window.UntanSupabase.resetConfig();
      const resetConfig = window.UntanSupabase.getConfig();

      return {
        loaded: true,
        initialIsConfigured: initialConfig.isConfigured,
        ticketValid: /^UNTAN-IJZ-\d{4}-\d{4}$/.test(ticket),
        savedUrl: savedConfig.url,
        savedIsConfigured: savedConfig.isConfigured,
        resetUrl: resetConfig.url,
        resetIsConfigured: resetConfig.isConfigured
      };
    });

    expect(result.loaded).toBe(true);
    expect(result.ticketValid).toBe(true);
    expect(result.savedUrl).toBe('https://testproject123.supabase.co');
    expect(result.savedIsConfigured).toBe(true);
    expect(result.resetUrl).toContain('kfspavyphfteuowfqrau.supabase.co');
    expect(result.resetIsConfigured).toBe(true);
  });

  test('modal pengaturan Supabase dapat dibuka di halaman pengajuan dan lacak', async ({ page }) => {
    await page.goto('/lacak.html');

    // Buka modal konfigurasi melalui fungsi helper
    await page.evaluate(() => {
      window.UntanSupabase.renderConfigModal();
    });

    const modal = page.locator('#supabaseConfigModal');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Koneksi Supabase');
    await expect(modal).toContainText('Project URL Supabase');

    // Tutup modal
    await page.evaluate(() => {
      window.UntanSupabase.closeConfigModal();
    });
    await expect(modal).toBeHidden();
  });

  test('validasi dimensi dan rasio pas foto 4x6: menerima hasil crop dan menolak foto non-crop', async ({ page }) => {
    await page.goto('/pengajuan.html');

    const testResults = await page.evaluate(async () => {
      function makeBlob(w, h) {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#0033aa';
        ctx.fillRect(0, 0, w, h);
        return new Promise(resolve => c.toBlob(b => resolve(new File([b], `test_${w}x${h}.jpg`, { type: 'image/jpeg' })), 'image/jpeg'));
      }

      // 1. Uji Pas Foto 4x6 Hasil Crop Valid (300 DPI: 450x660, 400 DPI: 600x880, Digital: 472x709)
      const valid300 = await makeBlob(450, 660);
      const valid400 = await makeBlob(600, 880);
      const validDigital = await makeBlob(472, 709);

      const resValid300 = await window.UntanSupabase.validateCropDimensions(valid300);
      const resValid400 = await window.UntanSupabase.validateCropDimensions(valid400);
      const resValidDigital = await window.UntanSupabase.validateCropDimensions(validDigital);

      // 2. Uji Foto Tidak Sesuai (Landscape, Square, Rasio 3:4, Dimensi Terlalu Kecil)
      const invalidLandscape = await makeBlob(800, 600);
      const invalidSquare = await makeBlob(500, 500);
      const invalid3to4 = await makeBlob(600, 800);
      const invalidSmall = await makeBlob(60, 90);

      const resInvalidLandscape = await window.UntanSupabase.validateCropDimensions(invalidLandscape);
      const resInvalidSquare = await window.UntanSupabase.validateCropDimensions(invalidSquare);
      const resInvalid3to4 = await window.UntanSupabase.validateCropDimensions(invalid3to4);
      const resInvalidSmall = await window.UntanSupabase.validateCropDimensions(invalidSmall);

      // 3. Uji uploadFile menolak foto tidak sesuai crop
      const uploadAttempt = await window.UntanSupabase.uploadFile(invalidLandscape, 'pas-foto');

      return {
        valid300: resValid300.valid,
        valid400: resValid400.valid,
        validDigital: resValidDigital.valid,
        invalidLandscape: resInvalidLandscape.valid,
        invalidSquare: resInvalidSquare.valid,
        invalid3to4: resInvalid3to4.valid,
        invalidSmall: resInvalidSmall.valid,
        uploadRejected: uploadAttempt.rejected === true,
        uploadHasError: Boolean(uploadAttempt.error)
      };
    });

    // Hasil crop valid diterima
    expect(testResults.valid300).toBe(true);
    expect(testResults.valid400).toBe(true);
    expect(testResults.validDigital).toBe(true);

    // Foto tidak sesuai crop ditolak
    expect(testResults.invalidLandscape).toBe(false);
    expect(testResults.invalidSquare).toBe(false);
    expect(testResults.invalid3to4).toBe(false);
    expect(testResults.invalidSmall).toBe(false);

    // uploadFile wajib menolak dan tidak menyimpan ke bucket dokumen-ijazah
    expect(testResults.uploadRejected).toBe(true);
    expect(testResults.uploadHasError).toBe(true);
  });

  test('fitur update data mahasiswa (NIM, Nama Lengkap, Tempat Lahir, Tanggal Lahir)', async ({ page }) => {
    await page.goto('/pengajuan.html');

    const updateResult = await page.evaluate(async () => {
      if (!window.UntanSupabase) return { error: 'UntanSupabase missing' };

      // Cari atau update data mahasiswa yang sudah ada (contoh tiket F1081191042 atau UNTAN-IJZ-2025-0841)
      const res = await window.UntanSupabase.updateDataMahasiswa('F1081191042', {
        nim: 'F1081191042',
        nama_lengkap: 'MUHAMMAD FAUZI PRATAMA, S.PD.',
        tempat_lahir: 'Kota Pontianak',
        tanggal_lahir: '1999-08-15'
      });

      return res;
    });

    expect(updateResult.success).toBe(true);
    expect(updateResult.data.nama_lengkap).toBe('MUHAMMAD FAUZI PRATAMA, S.PD.');
    expect(updateResult.data.tempat_lahir).toBe('Kota Pontianak');
    expect(updateResult.data.tanggal_lahir).toBe('1999-08-15');
  });

  test('rule status_ijazah: hanya mengizinkan update data dan upload berkas/pas foto jika status_ijazah=Pengajuan', async ({ page }) => {
    await page.goto('/pengajuan.html');

    const ruleTest = await page.evaluate(async () => {
      if (!window.UntanSupabase) return { error: 'UntanSupabase missing' };

      // 1. Verifikasi enum status_ijazah dan helper fungsi
      const statuses = window.UntanSupabase.STATUS_IJAZAH;
      const canUpdatePengajuan = window.UntanSupabase.canUpdatePengajuan('Pengajuan');
      const canUpdateProsesCetak = window.UntanSupabase.canUpdatePengajuan('Proses Cetak');
      const canUpdateFinal = window.UntanSupabase.canUpdatePengajuan('Final');
      const canUpdateDitolak = window.UntanSupabase.canUpdatePengajuan('Ditolak');
      const canUpdateNull = window.UntanSupabase.canUpdatePengajuan(null);

      const isValidPengajuan = window.UntanSupabase.isValidStatusIjazah('Pengajuan');
      const isValidProsesCetak = window.UntanSupabase.isValidStatusIjazah('Proses Cetak');
      const isValidFinal = window.UntanSupabase.isValidStatusIjazah('Final');
      const isValidDitolak = window.UntanSupabase.isValidStatusIjazah('Ditolak');
      const isValidInvalid = window.UntanSupabase.isValidStatusIjazah('Sembarang Status');

      // 2. Buat blob foto 4x6 valid
      const c = document.createElement('canvas');
      c.width = 450;
      c.height = 660;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#0033aa';
      ctx.fillRect(0, 0, 450, 660);
      const photoBlob = await new Promise(resolve => c.toBlob(b => resolve(new File([b], 'test_4x6.jpg', { type: 'image/jpeg' })), 'image/jpeg'));

      // 3. Uji uploadFile dengan options.statusIjazah:
      // a. Saat status_ijazah = 'Proses Cetak' -> upload WAJIB DITOLAK
      const uploadProsesCetak = await window.UntanSupabase.uploadFile(photoBlob, 'pas-foto', {
        statusIjazah: 'Proses Cetak'
      });

      // b. Saat status_ijazah = 'Final' -> upload WAJIB DITOLAK
      const uploadFinal = await window.UntanSupabase.uploadFile(photoBlob, 'pas-foto', {
        statusIjazah: 'Final'
      });

      // c. Saat status_ijazah = 'Ditolak' -> upload WAJIB DITOLAK
      const uploadDitolak = await window.UntanSupabase.uploadFile(photoBlob, 'pas-foto', {
        statusIjazah: 'Ditolak'
      });

      // 4. Uji simulasi updateDataMahasiswa terhadap record yang status_ijazah != 'Pengajuan'
      // Mock sementara query getClient() untuk mengembalikan status 'Proses Cetak'
      const client = window.UntanSupabase.getClient();
      const origFrom = client.from;

      client.from = function (table) {
        if (table === 'pengajuan_ijazah') {
          return {
            select: () => ({
              or: () => ({
                order: () => ({
                  limit: () => Promise.resolve({
                    data: [{
                      id: 'mock-uuid-test-proses-cetak',
                      nomor_tiket: 'UNTAN-IJZ-2025-MOCK',
                      nim: 'D101181042',
                      status_ijazah: 'Proses Cetak'
                    }],
                    error: null
                  })
                })
              })
            }),
            update: () => ({ eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: {}, error: null }) }) }) })
          };
        }
        return origFrom.call(client, table);
      };

      let blockedUpdateResult = null;
      try {
        blockedUpdateResult = await window.UntanSupabase.updateDataMahasiswa('D101181042', {
          nama_lengkap: 'NAMA BARU DITOLAK'
        }, { foto: photoBlob });
      } finally {
        client.from = origFrom;
      }

      return {
        statuses,
        canUpdatePengajuan,
        canUpdateProsesCetak,
        canUpdateFinal,
        canUpdateDitolak,
        canUpdateNull,
        isValidPengajuan,
        isValidProsesCetak,
        isValidFinal,
        isValidDitolak,
        isValidInvalid,
        uploadProsesCetakBlocked: uploadProsesCetak.blockedByStatus === true,
        uploadProsesCetakError: Boolean(uploadProsesCetak.error),
        uploadFinalBlocked: uploadFinal.blockedByStatus === true,
        uploadFinalError: Boolean(uploadFinal.error),
        uploadDitolakBlocked: uploadDitolak.blockedByStatus === true,
        uploadDitolakError: Boolean(uploadDitolak.error),
        updateDataBlocked: blockedUpdateResult.blocked === true,
        updateDataSuccess: blockedUpdateResult.success === false,
        updateDataErrorMsg: blockedUpdateResult.error?.message || ''
      };
    });

    expect(ruleTest.statuses.PENGAJUAN).toBe('Pengajuan');
    expect(ruleTest.statuses.PROSES_CETAK).toBe('Proses Cetak');
    expect(ruleTest.statuses.FINAL).toBe('Final');
    expect(ruleTest.statuses.DITOLAK).toBe('Ditolak');

    expect(ruleTest.canUpdatePengajuan).toBe(true);
    expect(ruleTest.canUpdateProsesCetak).toBe(false);
    expect(ruleTest.canUpdateFinal).toBe(false);
    expect(ruleTest.canUpdateDitolak).toBe(false);
    expect(ruleTest.canUpdateNull).toBe(true);

    expect(ruleTest.isValidPengajuan).toBe(true);
    expect(ruleTest.isValidProsesCetak).toBe(true);
    expect(ruleTest.isValidFinal).toBe(true);
    expect(ruleTest.isValidDitolak).toBe(true);
    expect(ruleTest.isValidInvalid).toBe(false);

    // Upload berkas & foto ditolak saat status Proses Cetak, Final, atau Ditolak
    expect(ruleTest.uploadProsesCetakBlocked).toBe(true);
    expect(ruleTest.uploadProsesCetakError).toBe(true);
    expect(ruleTest.uploadFinalBlocked).toBe(true);
    expect(ruleTest.uploadFinalError).toBe(true);
    expect(ruleTest.uploadDitolakBlocked).toBe(true);
    expect(ruleTest.uploadDitolakError).toBe(true);

    // Pembaruan data ditolak saat status bukan Pengajuan
    expect(ruleTest.updateDataBlocked).toBe(true);
    expect(ruleTest.updateDataSuccess).toBe(true);
    expect(ruleTest.updateDataErrorMsg).toContain('Proses Cetak');
  });

  test('tampilan UI penguncian di halaman pengajuan & status ijazah di lacak', async ({ page }) => {
    // 1. Uji Penguncian UI di halaman pengajuan saat status_ijazah != 'Pengajuan'
    await page.goto('/pengajuan.html');

    await page.evaluate(() => {
      window.UntanSupabase.getPengajuan = async () => ({
        success: true,
        data: {
          nim: 'F1081191042',
          nama_lengkap: 'MUHAMMAD FAUZI PRATAMA',
          tempat_lahir: 'Pontianak',
          tanggal_lahir: '1999-08-15',
          status_ijazah: 'Proses Cetak'
        }
      });
    });

    await page.fill('#nim', 'F1081191042');
    await page.click('#btnCekNim');

    const banner = page.locator('#updateDataNotice');
    await expect(banner).toBeVisible();
    await expect(page.locator('#updateNoticeStatusBadge')).toContainText('Terkunci');
    await expect(page.locator('#btnUpdateDataIdentitas')).toBeDisabled();
    await expect(page.locator('#fotoIjazah')).toBeDisabled();

    // 2. Uji Badge Status Ijazah di halaman lacak.html
    await page.goto('/lacak.html');

    const lacakBadges = await page.evaluate(() => {
      const elBadge = document.getElementById('displayStatusIjazahBadge');
      
      // Tes simulasi renderTrackingData untuk 3 status yang sah
      window.renderTrackingData({
        nomor_tiket: 'UNTAN-IJZ-2025-0841',
        nama_lengkap: 'MUHAMMAD FAUZI PRATAMA',
        status_ijazah: 'Pengajuan',
        current_step: 1,
        total_steps: 6
      });
      const textPengajuan = elBadge ? elBadge.textContent : '';

      window.renderTrackingData({
        nomor_tiket: 'UNTAN-IJZ-2025-0842',
        nama_lengkap: 'RIAN ADIPUTRA, S.T.',
        status_ijazah: 'Proses Cetak',
        current_step: 2,
        total_steps: 6
      });
      const textProsesCetak = elBadge ? elBadge.textContent : '';

      window.renderTrackingData({
        nomor_tiket: 'UNTAN-IJZ-2025-0843',
        nama_lengkap: 'ALUMNI SELESAI',
        status_ijazah: 'Final',
        current_step: 6,
        total_steps: 6
      });
      const textFinal = elBadge ? elBadge.textContent : '';

      window.renderTrackingData({
        nomor_tiket: 'UNTAN-IJZ-2025-0844',
        nama_lengkap: 'PEMOHON DITOLAK',
        status_ijazah: 'Ditolak',
        current_step: 1,
        total_steps: 6
      });
      const textDitolak = elBadge ? elBadge.textContent : '';
      const classDitolak = elBadge ? elBadge.className : '';

      return {
        textPengajuan,
        textProsesCetak,
        textFinal,
        textDitolak,
        classDitolak
      };
    });

    expect(lacakBadges.textPengajuan).toContain('Pengajuan');
    expect(lacakBadges.textPengajuan).toContain('Pembaruan Terbuka');
    expect(lacakBadges.textProsesCetak).toContain('Proses Cetak');
    expect(lacakBadges.textProsesCetak).toContain('Terkunci');
    expect(lacakBadges.textFinal).toContain('Final');
    expect(lacakBadges.textFinal).toContain('Terkunci');

    // Verifikasi badge status_ijazah 'Ditolak' dengan lencana merah
    expect(lacakBadges.textDitolak).toContain('Ditolak');
    expect(lacakBadges.classDitolak).toContain('bg-red-100');
    expect(lacakBadges.classDitolak).toContain('text-red-800');
  });

  test('otomatis menghapus berkas/pas foto lama dari bucket dokumen-ijazah saat terjadi pembaruan', async ({ page }) => {
    await page.goto('/pengajuan.html');

    const testResults = await page.evaluate(async () => {
      if (!window.UntanSupabase) return { error: 'UntanSupabase missing' };

      // 1. Uji extractStoragePath
      const sampleUrl1 = 'https://kfspavyphfteuowfqrau.supabase.co/storage/v1/object/public/dokumen-ijazah/pas-foto/173000_foto.jpg';
      const sampleUrl2 = 'https://kfspavyphfteuowfqrau.supabase.co/storage/v1/object/public/dokumen-ijazah/berkas-ktp/173000_ktp.pdf?token=abc';
      const sampleRelative = 'pas-foto/173000_foto.jpg';

      const path1 = window.UntanSupabase.extractStoragePath(sampleUrl1);
      const path2 = window.UntanSupabase.extractStoragePath(sampleUrl2);
      const path3 = window.UntanSupabase.extractStoragePath(sampleRelative);
      const pathNull = window.UntanSupabase.extractStoragePath(null);

      // 2. Uji deleteFile memanggil storage.remove dengan path relatif yang benar
      const client = window.UntanSupabase.getClient();
      let removedPaths = [];
      const origStorage = client.storage;
      const mockRemove = async (paths) => {
        removedPaths.push(...paths);
        return { data: paths, error: null };
      };

      // Mock storage.from(bucket).remove
      client.storage = {
        ...origStorage,
        from(bucket) {
          const b = origStorage.from.call(origStorage, bucket);
          return {
            ...b,
            remove: mockRemove
          };
        }
      };

      try {
        await window.UntanSupabase.deleteFile(sampleUrl1);

        // 3. Uji integrasi updateDataMahasiswa memicu deleteFile untuk berkas lama yang diganti
        const origUpdate = window.UntanSupabase.updateDataMahasiswa;
        let deleteTriggeredFor = [];
        window.UntanSupabase.deleteFile = async (url) => {
          deleteTriggeredFor.push(url);
          return { success: true };
        };

        // Mock client.from untuk mengembalikan record dengan old foto_url
        const origFrom = client.from;
        client.from = function (table) {
          if (table === 'pengajuan_ijazah') {
            return {
              select: () => ({
                or: () => ({
                  order: () => ({
                    limit: () => Promise.resolve({
                      data: [{
                        id: 'mock-uuid-delete-test',
                        nomor_tiket: 'UNTAN-IJZ-2025-0841',
                        nim: 'F1081191042',
                        status_ijazah: 'Pengajuan',
                        foto_url: 'https://kfspavyphfteuowfqrau.supabase.co/storage/v1/object/public/dokumen-ijazah/pas-foto/foto_lama_diganti.jpg'
                      }],
                      error: null
                    })
                  })
                })
              }),
              update: () => ({
                eq: () => ({
                  select: () => ({
                    single: () => Promise.resolve({
                      data: {
                        id: 'mock-uuid-delete-test',
                        foto_url: 'https://kfspavyphfteuowfqrau.supabase.co/storage/v1/object/public/dokumen-ijazah/pas-foto/foto_baru.jpg'
                      },
                      error: null
                    })
                  })
                })
              })
            };
          }
          if (table === 'riwayat_status') {
            return {
              insert: () => Promise.resolve({ error: null })
            };
          }
          return origFrom.call(client, table);
        };

        await origUpdate.call(window.UntanSupabase, 'F1081191042', {
          foto_url: 'https://kfspavyphfteuowfqrau.supabase.co/storage/v1/object/public/dokumen-ijazah/pas-foto/foto_baru.jpg'
        });

        return {
          path1,
          path2,
          path3,
          pathNull,
          removedPaths,
          deleteTriggeredFor
        };
      } finally {
        client.storage = origStorage;
      }
    });

    expect(testResults.path1).toBe('pas-foto/173000_foto.jpg');
    expect(testResults.path2).toBe('berkas-ktp/173000_ktp.pdf');
    expect(testResults.path3).toBe('pas-foto/173000_foto.jpg');
    expect(testResults.pathNull).toBeNull();
    expect(testResults.removedPaths).toContain('pas-foto/173000_foto.jpg');
    expect(testResults.deleteTriggeredFor).toContain('https://kfspavyphfteuowfqrau.supabase.co/storage/v1/object/public/dokumen-ijazah/pas-foto/foto_lama_diganti.jpg');
  });
});
