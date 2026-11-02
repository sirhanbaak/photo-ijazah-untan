const { test, expect } = require('@playwright/test');

test.describe('Fase 1: Penyelarasan Frontend-Backend (GAP-01, GAP-02, GAP-03)', () => {

  test('GAP-02: STATUS_IJAZAH, isValidStatusIjazah, dan canUpdatePengajuan mendukung Dibatalkan', async ({ page }) => {
    await page.goto('/pengajuan.html');

    const result = await page.evaluate(() => {
      const sb = window.UntanSupabase;
      return {
        hasDibatalkanEnum: sb.STATUS_IJAZAH.DIBATALKAN === 'Dibatalkan',
        isValidDibatalkan: sb.isValidStatusIjazah('Dibatalkan'),
        canUpdatePengajuan: sb.canUpdatePengajuan('Pengajuan'),
        cannotUpdateProsesCetak: sb.canUpdatePengajuan('Proses Cetak'),
        cannotUpdateFinal: sb.canUpdatePengajuan('Final'),
        cannotUpdateDitolak: sb.canUpdatePengajuan('Ditolak'),
        cannotUpdateDibatalkan: sb.canUpdatePengajuan('Dibatalkan'),
      };
    });

    expect(result.hasDibatalkanEnum).toBe(true);
    expect(result.isValidDibatalkan).toBe(true);
    expect(result.canUpdatePengajuan).toBe(true);
    expect(result.cannotUpdateProsesCetak).toBe(false);
    expect(result.cannotUpdateFinal).toBe(false);
    expect(result.cannotUpdateDitolak).toBe(false);
    expect(result.cannotUpdateDibatalkan).toBe(false);
  });

  test('GAP-01: submitPengajuan menyertakan user_id dari sesi login pengguna aktif', async ({ page }) => {
    page.on('dialog', async d => {
      await d.accept();
    });

    await page.goto('/user/login.html');

    // Login sebagai Siti Aminah
    await page.fill('#identifier', 'F1081191002');
    await page.fill('#password', 'PasswordUntan123!');
    await page.click('#btnSubmitLogin');

    await page.waitForURL(/\/user\/index\.html/);

    await page.goto('/pengajuan.html');
    await expect(page.locator('#authActiveCard')).toBeVisible();

    const result = await page.evaluate(async () => {
      let intercepted = null;

      // Mock submitPengajuan untuk menangkap payload
      window.UntanSupabase.submitPengajuan = async function (formData, files) {
        intercepted = { ...formData };
        return { success: true, ticketNumber: 'UNTAN-IJZ-TEST-9999' };
      };

      const form = document.getElementById('ijazahForm');
      const submitEvt = new Event('submit', { cancelable: true, bubbles: true });
      form.dispatchEvent(submitEvt);

      // Tunggu promise mikro
      for (let i = 0; i < 20; i++) {
        if (intercepted !== null) break;
        await new Promise(r => setTimeout(r, 50));
      }

      return {
        intercepted,
        user: window.UntanUserAuth.getCurrentUser()
      };
    });

    expect(result.intercepted).not.toBeNull();
    expect(result.intercepted.user_id).toBe(result.user.id);
    expect(result.intercepted.user_id).toBe('c1d2e3f4-a5b6-7890-cdef-333333333334');
  });

  test('GAP-03: lacak.html menginisialisasi header nav dan merender status Dibatalkan', async ({ page }) => {
    await page.goto('/lacak.html');

    // Header nav profile container terpasang
    const headerContainer = page.locator('#userProfileHeader');
    await expect(headerContainer).toBeVisible();

    // Uji render status Dibatalkan
    const dibatalkanBadge = await page.evaluate(() => {
      const mockData = {
        nomor_tiket: 'UNTAN-IJZ-2025-9999',
        nama_lengkap: 'TEST USER',
        nim: 'F1081191099',
        status_ijazah: 'Dibatalkan',
        status_label: 'Permohonan Dibatalkan',
        current_step: 1,
        total_steps: 6
      };
      renderTrackingData(mockData, []);
      const badge = document.getElementById('displayStatusIjazahBadge');
      return {
        text: badge ? badge.textContent : '',
        hasBlockIcon: badge ? Boolean(badge.querySelector('.material-symbols-outlined')) : false
      };
    });

    expect(dibatalkanBadge.text).toContain('Dibatalkan');
    expect(dibatalkanBadge.text).toContain('Terkunci');
    expect(dibatalkanBadge.hasBlockIcon).toBe(true);
  });

  test('GAP-03: triggerSearchVisual memanggil UntanSupabase.getPengajuan dan menyembunyikan noticeBox', async ({ page }) => {
    await page.goto('/lacak.html');

    const result = await page.evaluate(async () => {
      // Mock getPengajuan
      const originalGet = window.UntanSupabase.getPengajuan;
      let queriedTicket = '';
      window.UntanSupabase.getPengajuan = async function (q) {
        queriedTicket = q;
        return {
          success: true,
          data: {
            nomor_tiket: q,
            nama_lengkap: 'RIAN ADIPUTRA, S.T.',
            nim: 'D101181042',
            status_ijazah: 'Pengajuan',
            status_label: 'Tahap 1: Verifikasi Berkas Awal',
            current_step: 1,
            total_steps: 6
          },
          riwayat: [
            { step_number: 1, title: 'Tahap 1', status: 'completed' }
          ]
        };
      };

      document.getElementById('searchQuery').value = 'UNTAN-IJZ-2025-0842';
      await triggerSearchVisual();

      const noticeBox = document.getElementById('trackingNoticeBox');
      const isNoticeHidden = noticeBox ? noticeBox.classList.contains('hidden') : false;
      const displayTiket = document.getElementById('displayNomorTiket').textContent;

      window.UntanSupabase.getPengajuan = originalGet;
      return {
        queriedTicket,
        isNoticeHidden,
        displayTiket
      };
    });

    expect(result.queriedTicket).toBe('UNTAN-IJZ-2025-0842');
    expect(result.isNoticeHidden).toBe(true);
    expect(result.displayTiket).toBe('UNTAN-IJZ-2025-0842');
  });

});
