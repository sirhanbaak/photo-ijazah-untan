const { test, expect } = require('@playwright/test');

test.describe('Mega Menu Navigasi Portal Ijazah UNTAN', () => {

  test('desktop header menampilkan Mega Menu terstruktur: Beranda, Layanan Ijazah, Panduan & Bantuan, Portal Akun serta tombol PixelCrop mandiri', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Mega Menu dirancang khusus untuk bilah navigasi desktop (lg ke atas)');
    await page.goto('/index.html');

    // 1. Verifikasi 3 container Mega Menu utama ada di desktop navbar
    const megaMenuLayanan = page.locator('#megaMenuLayanan');
    const megaMenuPanduan = page.locator('#megaMenuPanduan');
    const megaMenuAkun = page.locator('#megaMenuAkun');
    await expect(megaMenuLayanan).toBeVisible();
    await expect(megaMenuPanduan).toBeVisible();
    await expect(megaMenuAkun).toBeVisible();

    // 2. Verifikasi tombol PixelCrop 4x6 tampil tersendiri di bilah navigasi utama
    const btnCropStandalone = page.locator('header nav a[href="/crop/"]');
    await expect(btnCropStandalone).toBeVisible();
    await expect(btnCropStandalone).toContainText('Crop Pas Foto 4x6');

    // 3. Verifikasi ketiadaan tombol HelpDesk BAK di header desktop kanan
    const helpdeskBakHeaderBtn = page.locator('header .hidden.xl\\:inline-flex:has-text("HelpDesk BAK")');
    await expect(helpdeskBakHeaderBtn).toHaveCount(0);

    // 4. Verifikasi tombol trigger Layanan Ijazah
    const btnLayanan = page.locator('#btnMegaMenuLayanan');
    await expect(btnLayanan).toContainText('Layanan Ijazah');

    // Panel awalnya tersembunyi secara visual (opacity: 0 / invisible)
    const panelLayanan = page.locator('#panelMegaMenuLayanan');
    await expect(panelLayanan).toHaveCSS('visibility', 'hidden');

    // 5. Klik tombol Layanan Ijazah untuk membuka Mega Menu (mendukung touch / click toggle)
    await btnLayanan.click();
    await expect(panelLayanan).toHaveCSS('visibility', 'visible');
    await expect(btnLayanan).toHaveAttribute('aria-expanded', 'true');

    // Verifikasi konten di dalam Mega Menu Layanan Ijazah:
    // - Kolom 1: Pengajuan & Pelacakan
    await expect(panelLayanan.locator('a[href="pengajuan.html"]')).toContainText('Ajukan Permohonan');
    await expect(panelLayanan.locator('a[href="lacak.html"]')).toContainText('Lacak Status Berkas');
    await expect(panelLayanan.locator('a[href="index.html#katalog-layanan"]')).toContainText('Katalog 5 Jenis Layanan');

    // - Kolom 2: Legalitas & Pengambilan (PixelCrop telah dikeluarkan dari sini)
    await expect(panelLayanan.locator('a[href="/crop/"]')).toHaveCount(0);
    await expect(panelLayanan.locator('a[href="index.html#tte-bsre"]').first()).toContainText('Validasi PIN PDDikti');
    await expect(panelLayanan.locator('a[href="panduan.html#syarat-loket"]')).toContainText('Loket Pengambilan');

    // - Kolom 3: Highlight Loket BAK Untan
    await expect(panelLayanan).toContainText('Loket BAK UNTAN');
    await expect(panelLayanan).toContainText('08.00 - 15.30 WIB');

    // 6. Buka Mega Menu Panduan & Bantuan -> Mega Menu Layanan otomatis tertutup
    const btnPanduan = page.locator('#btnMegaMenuPanduan');
    await btnPanduan.click();

    const panelPanduan = page.locator('#panelMegaMenuPanduan');
    await expect(panelPanduan).toHaveCSS('visibility', 'visible');
    await expect(panelLayanan).toHaveCSS('visibility', 'hidden');

    // Verifikasi isi Mega Menu Panduan & Bantuan:
    await expect(panelPanduan.locator('a[href="panduan.html"]')).toContainText('Panduan & Prosedur');
    await expect(panelPanduan.locator('a[href="panduan.html#standar-foto"]')).toContainText('Standar Pas Foto 4x6');
    await expect(panelPanduan.locator('a[href="index.html#faq-dan-kontak"]')).toContainText('HelpDesk & FAQ');
    await expect(panelPanduan.locator('a[href*="wa.me"]')).toContainText('WhatsApp HelpDesk');

    // 7. Buka Mega Menu Portal Akun -> Mega Menu Panduan otomatis tertutup
    const btnAkun = page.locator('#btnMegaMenuAkun');
    await btnAkun.click();

    const panelAkun = page.locator('#panelMegaMenuAkun');
    await expect(panelAkun).toHaveCSS('visibility', 'visible');
    await expect(panelPanduan).toHaveCSS('visibility', 'hidden');

    // Verifikasi isi Mega Menu Portal Akun:
    await expect(panelAkun.locator('a[href="user/index.html"]')).toContainText('Dasbor Pemohon');
    await expect(panelAkun.locator('a[href="user/login.html"]')).toContainText('Masuk Akun');
    await expect(panelAkun.locator('a[href="user/index.html#pengaturan-keamanan"]')).toContainText('Pengaturan & MFA');
    await expect(panelAkun.locator('a[href="user/forgot-password.html"]')).toContainText('Lupa Password');
    await expect(panelAkun).toContainText('Proteksi Simalum MFA Aktif');

    // 8. Tekan Escape -> Menu tertutup
    await page.keyboard.press('Escape');
    await expect(panelAkun).toHaveCSS('visibility', 'hidden');
    await expect(btnAkun).toHaveAttribute('aria-expanded', 'false');
  });

  test('halaman pengajuan.html menandai kategori Layanan Ijazah dan link Ajukan Permohonan sebagai aktif', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Mega Menu dirancang khusus untuk bilah navigasi desktop (lg ke atas)');
    await page.goto('/pengajuan.html');

    // Tombol induk Layanan Ijazah memiliki indikator aktif
    const btnLayanan = page.locator('#btnMegaMenuLayanan');
    await expect(btnLayanan).toHaveClass(/bg-white\/15/);

    // Buka mega menu
    await btnLayanan.click();
    const panelLayanan = page.locator('#panelMegaMenuLayanan');
    await expect(panelLayanan).toHaveCSS('visibility', 'visible');

    // Item Ajukan Permohonan memiliki badge Aktif
    const activeItem = panelLayanan.locator('a[href="pengajuan.html"][aria-current="page"]');
    await expect(activeItem).toBeVisible();
    await expect(activeItem).toContainText('Aktif');

    // Tombol standalone PixelCrop tetap ada di header
    await expect(page.locator('header nav a[href="/crop/"]')).toBeVisible();
  });

  test('halaman lacak.html menandai kategori Layanan Ijazah dan link Lacak Status sebagai aktif', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Mega Menu dirancang khusus untuk bilah navigasi desktop (lg ke atas)');
    await page.goto('/lacak.html');

    const btnLayanan = page.locator('#btnMegaMenuLayanan');
    await expect(btnLayanan).toHaveClass(/bg-white\/15/);

    await btnLayanan.click();
    const panelLayanan = page.locator('#panelMegaMenuLayanan');
    const activeItem = panelLayanan.locator('a[href="lacak.html"][aria-current="page"]');
    await expect(activeItem).toBeVisible();
    await expect(activeItem).toContainText('Aktif');
  });

  test('halaman panduan.html menandai kategori Panduan & Bantuan sebagai aktif', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Mega Menu dirancang khusus untuk bilah navigasi desktop (lg ke atas)');
    await page.goto('/panduan.html');

    const btnPanduan = page.locator('#btnMegaMenuPanduan');
    await expect(btnPanduan).toHaveClass(/bg-white\/15/);

    await btnPanduan.click();
    const panelPanduan = page.locator('#panelMegaMenuPanduan');
    const activeItem = panelPanduan.locator('a[href="panduan.html"][aria-current="page"]');
    await expect(activeItem).toBeVisible();
    await expect(activeItem).toContainText('Aktif');
  });

  test('halaman user/index.html menandai kategori Portal Akun dan link Dasbor sebagai aktif', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Mega Menu dirancang khusus untuk bilah navigasi desktop (lg ke atas)');
    await page.goto('/user/index.html');

    // Tombol induk Portal Akun memiliki indikator aktif
    const btnAkun = page.locator('#btnMegaMenuAkun');
    await expect(btnAkun).toHaveClass(/bg-white\/15/);

    // Buka mega menu akun
    await btnAkun.click();
    const panelAkun = page.locator('#panelMegaMenuAkun');
    await expect(panelAkun).toHaveCSS('visibility', 'visible');

    // Item Dasbor Pemohon memiliki badge Aktif
    const activeItem = panelAkun.locator('a[href="index.html"][aria-current="page"]');
    await expect(activeItem).toBeVisible();
    await expect(activeItem).toContainText('Aktif');

    // Tombol standalone PixelCrop tersedia
    await expect(page.locator('header nav a[href="../crop/"]')).toBeVisible();
  });

  test('drawer navigasi mobile berfungsi dengan pengelompokan yang rapi', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/index.html');

    // Desktop nav tersembunyi
    const desktopNav = page.locator('header nav');
    await expect(desktopNav).toBeHidden();

    // Tombol hamburger terlihat
    const toggleBtn = page.locator('#mobile-menu-toggle');
    await expect(toggleBtn).toBeVisible();

    const drawer = page.locator('#mobile-menu-drawer');
    await expect(drawer).toBeHidden();

    // Buka drawer
    await toggleBtn.click();
    await expect(drawer).toBeVisible();
    await expect(page.locator('#menu-icon')).toContainText('close');

    // Verifikasi kelompok navigasi dalam drawer
    await expect(drawer).toContainText('Navigasi Utama');
    await expect(drawer).toContainText('Alat & Bantuan Cepat');
    await expect(drawer.locator('a[href="pengajuan.html"]')).toBeVisible();
    await expect(drawer.locator('a[href="lacak.html"]')).toBeVisible();
    await expect(drawer.locator('a[href="panduan.html"]')).toBeVisible();
    await expect(drawer.locator('a[href="/crop/"]')).toBeVisible();
    await expect(drawer.locator('a[href="user/index.html"]')).toBeVisible();

    // Klik link di drawer otomatis menutup drawer
    await drawer.locator('a[href="#faq-dan-kontak"]').click();
    await expect(drawer).toBeHidden();
    await expect(page.locator('#menu-icon')).toContainText('menu');
  });

});
