const { test, expect } = require('@playwright/test');

test.describe('Struktur halaman portal', () => {
  test('formulir pengajuan membungkus seluruh tahap dan memiliki input berkas', async ({ page }) => {
    await page.goto('/pengajuan.html');

    const struktur = await page.evaluate(() => {
      const form = document.getElementById('ijazahForm');
      if (!form) return null;
      const foto = form.querySelector('input[type="file"][name="foto"]');
      return {
        hasNim: Boolean(form.querySelector('#nim')),
        hasLegal: Boolean(form.querySelector('#legalCheckbox')),
        hasFoto: Boolean(foto),
        accept: foto ? foto.getAttribute('accept') : '',
        demoNotice: document.body.textContent.includes('Mode demo'),
      };
    });

    expect(struktur).not.toBeNull();
    expect(struktur.hasNim).toBe(true);
    expect(struktur.hasLegal).toBe(true);
    expect(struktur.hasFoto).toBe(true);
    expect(struktur.accept).toContain('image/jpeg');
    expect(struktur.demoNotice).toBe(true);
  });

  test('halaman lacak menandai data contoh dan unduhan demo', async ({ page }) => {
    await page.goto('/lacak.html');
    await expect(page.locator('#resultArea')).toContainText('Contoh tampilan (demo)');

    await page.evaluate(() => {
      downloadProofModal();
      simulateDownload();
    });
    await expect(page.locator('#downloadActionBtn')).toContainText('Mode demo');
  });
});
