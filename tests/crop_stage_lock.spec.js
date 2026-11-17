const { test, expect } = require('@playwright/test');

test.describe('Fitur Penguncian Tombol Gunakan di Aplikasi Crop Berdasarkan Tahap Berkas', () => {

  test('Kondisi 1: Berkas belum mencapai Tahap 4 (Tahap 1, 2, 3 atau permohonan baru) - Tombol Gunakan muncul', async ({ page }) => {
    // Buka aplikasi crop tanpa parameter (mode default / tahap < 4)
    await page.goto('/crop/');
    await page.waitForFunction(
      () => window.photoCropApp && window.photoCropApp.wasmEngine && window.photoCropApp.wasmEngine.isReady,
      null,
      { timeout: 25000 }
    );

    // Tombol Gunakan di Top Header harus terlihat
    const topUseBtn = page.locator('#top-use-pengajuan-btn');
    await expect(topUseBtn).toBeVisible();

    // Tombol Gunakan di Sidebar Inspector harus terlihat
    const directUseBtn = page.locator('#direct-use-pengajuan-btn');
    await expect(directUseBtn).toBeVisible();

    // Notice penguncian harus tersembunyi
    const lockNotice = page.locator('#crop-stage-lock-notice');
    await expect(lockNotice).toBeHidden();

    // Buka modal hasil crop dan pastikan tombol modal terlihat
    await page.evaluate(() => window.photoCropApp.applyCrop());
    const modalUseBtn = page.locator('#use-in-pengajuan-btn');
    await expect(modalUseBtn).toBeVisible();
    await expect(page.locator('#crop-modal-stage-lock-notice')).toBeHidden();
  });

  test('Kondisi 2: Berkas telah mencapai Tahap 4 (Pencetakan Blangko Ijazah) via parameter ?step=4 - Tombol Gunakan disembunyikan', async ({ page }) => {
    await page.goto('/crop/?step=4');
    await page.waitForFunction(
      () => window.photoCropApp && window.photoCropApp.wasmEngine && window.photoCropApp.wasmEngine.isReady,
      null,
      { timeout: 25000 }
    );

    // Tombol Gunakan di Header, Dock, dan Sidebar harus tersembunyi
    await expect(page.locator('#top-use-pengajuan-btn')).toBeHidden();
    await expect(page.locator('#direct-use-pengajuan-btn')).toBeHidden();
    await expect(page.locator('#dock-btn-use-pengajuan')).toBeHidden();

    // Banner notifikasi penguncian Tahap 4 harus terlihat
    const lockNotice = page.locator('#crop-stage-lock-notice');
    await expect(lockNotice).toBeVisible();
    await expect(lockNotice).toContainText('Tahap 4: Pencetakan Blangko Ijazah');

    // Buka modal hasil crop dan pastikan tombol modal tersembunyi, sedangkan modal notice terlihat
    await page.evaluate(() => window.photoCropApp.applyCrop());
    await expect(page.locator('#use-in-pengajuan-btn')).toBeHidden();
    await expect(page.locator('#crop-modal-stage-lock-notice')).toBeVisible();
    await expect(page.locator('#download-final-btn')).toBeVisible(); // Unduh tetap tersedia untuk arsip
  });

  test('Kondisi 3: Melacak tiket dummy penerbitan ulang Tahap 4 (UNTAN-IJZ-2026-0843) di crop app - Tombol Gunakan otomatis tersembunyi', async ({ page }) => {
    await page.goto('/crop/?ticket=UNTAN-IJZ-2026-0843');
    await page.waitForFunction(
      () => window.photoCropApp && window.photoCropApp.wasmEngine && window.photoCropApp.wasmEngine.isReady,
      null,
      { timeout: 25000 }
    );

    // Otomatis terdeteksi Tahap 4
    await expect(page.locator('#top-use-pengajuan-btn')).toBeHidden();
    await expect(page.locator('#direct-use-pengajuan-btn')).toBeHidden();
    await expect(page.locator('#crop-stage-lock-notice')).toBeVisible();

    // Pengujian proteksi: jika useInPengajuan dipanggil langsung, harus tertolak dengan alert
    let dialogMessage = '';
    page.on('dialog', async (dialog) => {
      dialogMessage = dialog.message();
      await dialog.accept();
    });

    await page.evaluate(() => window.photoCropApp.useInPengajuan());
    expect(dialogMessage).toContain('Tahap 4 (Pencetakan Blangko Ijazah');
  });

  test('Kondisi 4: Validasi data dummy penerbitan ulang Tahap 4 di lacak.html', async ({ page }) => {
    // Buka lacak dengan bypass_auth untuk menguji data dummy tiket 0843
    await page.goto('/lacak.html?q=UNTAN-IJZ-2026-0843&bypass_auth=1');

    // Verifikasi Nomor Tiket
    await expect(page.locator('#displayNomorTiket')).toHaveText('UNTAN-IJZ-2026-0843');

    // Verifikasi Klasifikasi Layanan: Penerbitan Ulang
    await expect(page.locator('#displayKlasifikasiLayanan')).toContainText('Penerbitan Ulang');

    // Verifikasi Nama dan NIM Pemohon
    await expect(page.locator('#displayNamaPemohon')).toHaveText('Bambang Triatmojo, S.Pd.');
    await expect(page.locator('#displayNim')).toContainText('F1081171015');

    // Verifikasi Badge Step: Tahap 4 dari 6
    await expect(page.locator('#displayCurrentStepBadge')).toHaveText('Tahap 4 dari 6');

    // Verifikasi Status Ijazah: Proses Cetak
    const statusIjazah = page.locator('#displayStatusIjazahBadge');
    await expect(statusIjazah).toBeVisible();
    await expect(statusIjazah).toContainText('Proses Cetak');

    // Verifikasi teks tahap 4 pada linimasa riwayat
    const step4Title = page.locator('#timelineContainer').locator('text=Tahap 4: Pencetakan Blangko Ijazah & Verifikasi Fisik Pas Foto');
    await expect(step4Title).toBeVisible();

    // Verifikasi aturan khusus Penerbitan Ulang: Tahap 3 (PISN) dilewati dan dianggap selesai
    const step3Container = page.locator('#timelineContainer');
    await expect(step3Container).toContainText('Tahap 3: Penerbitan & Registrasi PISN Kemdiktisaintek (Dilewati / Tidak Diperlukan)');
    await expect(step3Container).toContainText('Dilewati (Selesai)');
    await expect(step3Container).toContainText('Penerbitan nomor registrasi PISN baru tidak diperlukan karena alumni telah memiliki Nomor PISN sah');
  });

  test('Kondisi 5: Khusus kasus penerbitan ulang, Tahap 3 tidak diperlukan/dilewati dan otomatis dianggap selesai', async ({ page }) => {
    // Buka lacak tiket penerbitan ulang
    await page.goto('/lacak.html?q=UNTAN-IJZ-2026-0843&bypass_auth=1');

    const timeline = page.locator('#timelineContainer');
    await expect(timeline).toBeVisible();

    // Pastikan badge "Dilewati (Selesai)" tampil untuk tahap 3
    const step3Badge = timeline.locator('text=Dilewati (Selesai)');
    await expect(step3Badge).toBeVisible();

    // Pastikan ikon fast_forward atau pemeriksa otomatis tampil
    await expect(timeline).toContainText('Sistem Terintegrasi PISN Kemdiktisaintek (Otomatis Selesai)');
  });

  test('Kondisi 6: Pengguna belum login (Guest / Anonim) - Tombol Gunakan disembunyikan dan notifikasi login tampil', async ({ browser }) => {
    // Buat context peramban baru yang bersih tanpa session login (Guest)
    const guestContext = await browser.newContext({
      storageState: { cookies: [], origins: [] }
    });
    const page = await guestContext.newPage();

    await page.goto('/crop/');
    await page.waitForFunction(
      () => window.photoCropApp && window.photoCropApp.wasmEngine && window.photoCropApp.wasmEngine.isReady,
      null,
      { timeout: 25000 }
    );

    // 1. Seluruh tombol "Gunakan" harus tersembunyi untuk guest
    await expect(page.locator('#top-use-pengajuan-btn')).toBeHidden();
    await expect(page.locator('#direct-use-pengajuan-btn')).toBeHidden();
    await expect(page.locator('#dock-btn-use-pengajuan')).toBeHidden();

    // 2. Banner notifikasi login untuk Guest harus tampil di sidebar inspector
    const guestNotice = page.locator('#crop-guest-notice');
    await expect(guestNotice).toBeVisible();
    await expect(guestNotice).toContainText('Masuk Akun untuk Menggunakan Foto');
    await expect(guestNotice).toContainText('hanya tersedia bagi mahasiswa/alumni yang telah masuk');

    // 3. Tombol masuk akun di header harus tampil
    const topLoginBtn = page.locator('#top-login-btn');
    await expect(topLoginBtn).toBeVisible();

    // 4. Buka modal hasil crop dan pastikan tombol modal tersembunyi, sedangkan guest notice modal tampil
    await page.evaluate(() => window.photoCropApp.applyCrop());
    await expect(page.locator('#use-in-pengajuan-btn')).toBeHidden();
    const modalGuestNotice = page.locator('#crop-modal-guest-notice');
    await expect(modalGuestNotice).toBeVisible();
    await expect(modalGuestNotice).toContainText('Masuk Akun untuk Menggunakan di Pengajuan');

    // Unduh pas foto tetap dapat dilakukan bebas oleh guest
    await expect(page.locator('#download-final-btn')).toBeVisible();

    // 5. Proteksi: Panggilan useInPengajuan oleh guest harus ditolak dengan peringatan login
    let alertText = '';
    page.on('dialog', async (dialog) => {
      alertText = dialog.message();
      await dialog.accept();
    });

    await page.evaluate(() => window.photoCropApp.useInPengajuan());
    expect(alertText).toContain('Anda harus masuk ke akun mahasiswa/alumni terlebih dahulu');

    await guestContext.close();
  });

});
