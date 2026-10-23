// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

test.describe('Hero Section & Mobile Responsiveness Tests', () => {

  test('Hero section loads cleanly and displays responsive typography without overflow', async ({ page, isMobile }, testInfo) => {
    // Navigasi ke halaman beranda
    const response = await page.goto('/index.html');
    expect(response?.status()).toBe(200);

    // Pastikan section hero terlihat
    const heroSection = page.locator('#hero-section');
    await expect(heroSection).toBeVisible();

    // Pastikan judul h1 terlihat
    const heroTitle = heroSection.locator('h1');
    await expect(heroTitle).toBeVisible();
    await expect(heroTitle).toContainText('Layanan Penerbitan Ijazah');
    await expect(heroTitle).toContainText('Universitas Tanjungpura');

    // Ambil ukuran font terkomputasi dari judul h1
    const computedFontSize = await heroTitle.evaluate((el) => {
      return parseFloat(window.getComputedStyle(el).fontSize);
    });

    // Ambil lebar viewport saat ini
    const viewportSize = page.viewportSize();
    const isSmallViewport = viewportSize ? viewportSize.width < 768 : false;

    if (isSmallViewport || isMobile) {
      // 1. Pada mode smartphone / mobile, font size harus mengecil secara dinamis (fluid clamp <= 32px)
      expect(computedFontSize).toBeLessThanOrEqual(32);
      expect(computedFontSize).toBeGreaterThanOrEqual(24);

      // 2. Pastikan tidak ada horizontal overflow di layar HP
      const hasHorizontalOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(hasHorizontalOverflow).toBe(false);

      // 3. Pastikan pseudo-elemen ::after (sapuan lampu strobe yang berkedip) dinonaktifkan di mobile
      const afterDisplay = await page.evaluate(() => {
        const panel = document.querySelector('.glass-hero-panel');
        if (!panel) return 'none';
        return window.getComputedStyle(panel, '::after').display;
      });
      expect(afterDisplay).toBe('none');

    } else {
      // Pada mode desktop, font size mencapai ukuran display penuh (~40px)
      expect(computedFontSize).toBeGreaterThanOrEqual(36);
    }

    // Buat direktori screenshots jika belum ada
    const screenshotsDir = path.join(__dirname, 'screenshots');
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    // Ambil screenshot halaman (viewport) pada posisi scroll teratas sebagai bukti visual uji coba
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    const screenshotName = `hero_${testInfo.project.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.png`;
    await page.screenshot({ path: path.join(screenshotsDir, screenshotName) });
  });

  test('Pengajuan page displays updated TTE BSrE 2027/2028 announcement', async ({ page }) => {
    const response = await page.goto('/pengajuan.html');
    expect(response?.status()).toBe(200);

    const announcementText = page.locator('text=Diperkirakan tersedia untuk yudisium mulai semester genap 2027/2028 secara otomatis.');
    await expect(announcementText).toBeVisible();
  });

});
