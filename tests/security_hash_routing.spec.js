const { test, expect } = require('@playwright/test');

// Pastikan context awal bersih (guest)
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Navigasi Hash #pengaturan-keamanan pada Portal Pengguna', () => {

  test('Pengunjung (Guest) membuka user/index.html#pengaturan-keamanan melihat kartu keamanan dan tombol login', async ({ page }) => {
    await page.goto('/user/index.html#pengaturan-keamanan');
    await page.waitForLoadState('networkidle');

    // Guest view harus tampil
    const guestCard = page.locator('#guestPengaturanKeamanan');
    await expect(guestCard).toBeVisible();
    await expect(guestCard).toContainText('Pengaturan Keamanan Akun & 2FA');

    // Tombol login dengan redirect aman
    const loginCta = guestCard.locator('a[href*="login.html"]').first();
    await expect(loginCta).toBeVisible();
    const href = await loginCta.getAttribute('href');
    expect(href).toContain('redirect=index.html%23pengaturan-keamanan');

    // Tautan reset password
    const resetCta = guestCard.locator('a[href*="forgot-password.html"]');
    await expect(resetCta).toBeVisible();
  });

  test('Pengguna terautentikasi membuka user/index.html#pengaturan-keamanan otomatis mengaktifkan tab MFA', async ({ page }) => {
    // 1. Lakukan login terlebih dahulu
    await page.goto('/user/login.html');
    await page.fill('#identifier', 'F1081191042');
    await page.fill('#password', 'PasswordUntan123!');
    await page.click('#btnSubmitLogin');

    // 2. Selesaikan alur verifikasi MFA
    await page.waitForURL(/\/user\/mfa\.html/);
    await page.click('#btnAutoFillOtp');
    await page.click('#btnVerifyMfa');

    // 3. Masuk ke dashboard user
    await page.waitForURL(/\/user\/(index\.html)?/);
    await expect(page.locator('#authDashboardView')).toBeVisible();

    // 4. Buka URL langsung dengan hash #pengaturan-keamanan
    await page.goto('/user/index.html#pengaturan-keamanan');
    await page.waitForLoadState('networkidle');

    // Tab MFA (#contentMfa) harus aktif dan terlihat
    const tabMfa = page.locator('#contentMfa');
    await expect(tabMfa).toBeVisible();

    // Tab Ringkasan & Ubah Password harus tersembunyi
    await expect(page.locator('#contentOverview')).not.toBeVisible();
    await expect(page.locator('#contentPassword')).not.toBeVisible();

    // Tombol tab MFA harus berstatus aktif (class font-bold)
    const btnMfa = page.locator('#btnTabMfa');
    await expect(btnMfa).toHaveClass(/bg-primary/);

    // 5. Uji klik cross-link "Ubah Kata Sandi" di dalam panel MFA
    const crossLinkPassword = tabMfa.locator('button:has-text("Ubah Kata Sandi")');
    await expect(crossLinkPassword).toBeVisible();
    await crossLinkPassword.click();

    // Tab Password harus aktif
    const tabPass = page.locator('#contentPassword');
    await expect(tabPass).toBeVisible();
    await expect(tabMfa).not.toBeVisible();

    // 6. Uji klik cross-link "Atur Multi-Faktor (MFA)" di dalam form Ubah Kata Sandi
    const crossLinkMfa = tabPass.locator('button:has-text("Atur Multi-Faktor (MFA)")');
    await expect(crossLinkMfa).toBeVisible();
    await crossLinkMfa.click();

    // Tab MFA kembali aktif
    await expect(tabMfa).toBeVisible();
    await expect(tabPass).not.toBeVisible();
  });

  test('Perubahan window.location.hash secara dinamis merespons tab dashboard yang sesuai', async ({ page }) => {
    await page.goto('/user/login.html');
    await page.fill('#identifier', 'F1081191042');
    await page.fill('#password', 'PasswordUntan123!');
    await page.click('#btnSubmitLogin');

    await page.waitForURL(/\/user\/mfa\.html/);
    await page.click('#btnAutoFillOtp');
    await page.click('#btnVerifyMfa');
    await page.waitForURL(/\/user\/(index\.html)?/);

    await expect(page.locator('#authDashboardView')).toBeVisible();

    // Ubah hash ke #ubah-sandi
    await page.evaluate(() => {
      window.location.hash = '#ubah-sandi';
    });
    await expect(page.locator('#contentPassword')).toBeVisible();
    await expect(page.locator('#contentMfa')).not.toBeVisible();

    // Ubah hash ke #pengaturan-keamanan
    await page.evaluate(() => {
      window.location.hash = '#pengaturan-keamanan';
    });
    await expect(page.locator('#contentMfa')).toBeVisible();
    await expect(page.locator('#contentPassword')).not.toBeVisible();

    // Ubah hash ke #overview
    await page.evaluate(() => {
      window.location.hash = '#overview';
    });
    await expect(page.locator('#contentOverview')).toBeVisible();
    await expect(page.locator('#contentMfa')).not.toBeVisible();
  });

  test('Linimasa Progres Tahapan Berkas: khusus penerbitan baru tahap 6 menampilkan Dokumen Siap Diambil di Fakultas', async ({ page }) => {
    await page.goto('/lacak.html');

    // 1. Uji render penerbitan_baru
    await page.evaluate(() => {
      const mockData = {
        nomor_tiket: 'UNTAN-IJZ-2026-BARU',
        nim: 'F1081191042',
        nama_lengkap: 'MUHAMMAD FAUZI PRATAMA',
        service_type: 'penerbitan_baru',
        status_label: 'Tahap 6: Dokumen Siap Diambil di Fakultas',
        current_step: 6,
        total_steps: 6
      };
      renderTrackingData(mockData, []);
    });

    const timelineText = await page.locator('#timelineContainer').textContent();
    expect(timelineText).toContain('Tahap 6: Dokumen Siap Diambil di Fakultas');
    expect(timelineText).not.toContain('Tahap 6: Dokumen Siap Diambil di Loket BAK Untan');

    // 2. Uji render layanan non-penerbitan baru (misal perbaikan_data) tetap di Loket BAK Untan
    await page.evaluate(() => {
      const mockDataNonBaru = {
        nomor_tiket: 'UNTAN-IJZ-2026-PERBAIKAN',
        nim: 'F1081191042',
        nama_lengkap: 'MUHAMMAD FAUZI PRATAMA',
        service_type: 'perbaikan_data',
        current_step: 6,
        total_steps: 6
      };
      renderTrackingData(mockDataNonBaru, []);
    });

    const timelineTextNonBaru = await page.locator('#timelineContainer').textContent();
    expect(timelineTextNonBaru).toContain('Tahap 6: Dokumen Siap Diambil di Loket BAK Untan');
  });

});
