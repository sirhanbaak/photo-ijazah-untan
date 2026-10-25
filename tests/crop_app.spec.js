const { test, expect } = require('@playwright/test');

// Halaman uji memuat engine WASM + gambar contoh, lalu menunggu kotak crop siap
async function openApp(page) {
  await page.goto('/crop/');
  await page.waitForFunction(
    () => window.photoCropApp && window.photoCropApp.wasmEngine.isReady,
    null,
    { timeout: 25000 }
  );
  await page.waitForFunction(
    () => {
      const app = window.photoCropApp;
      return Boolean(app && app.sourceBuffer && app.naturalW > 1 && app.cropW > 0);
    },
    null,
    { timeout: 20000 }
  );
}

function collectPageErrors(page) {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

test.describe('Aplikasi Crop Photo Ijazah', () => {
  test('memuat engine WASM dan menyiapkan kotak crop 4:6', async ({ page }) => {
    const errors = collectPageErrors(page);
    await openApp(page);

    const state = await page.evaluate(() => {
      const app = window.photoCropApp;
      return {
        naturalW: app.naturalW,
        naturalH: app.naturalH,
        ratio: app.cropW / app.cropH,
        src: app.sourceImage.getAttribute('src') || '',
        targetW: app.currentPreset.targetW,
        targetH: app.currentPreset.targetH,
      };
    });

    expect(state.naturalW).toBeGreaterThan(1);
    expect(state.src.startsWith('blob:')).toBe(true);
    expect(state.ratio).toBeCloseTo(state.targetW / state.targetH, 1);
    expect(errors).toEqual([]);

    // Grid panduan tampil secara default
    await expect(page.locator('#grid-rule-thirds')).not.toHaveClass(/hidden/);
  });

  test('ekspor dengan rotasi halus 30 derajat menghasilkan berkas valid', async ({ page }) => {
    const dialogs = [];
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.message());
      await dialog.dismiss();
    });
    await openApp(page);

    await page.evaluate(() => {
      const slider = document.getElementById('rotation-slider');
      slider.value = '30';
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect
      .poll(() => page.evaluate(() => window.photoCropApp.rotationDeg))
      .toBeCloseTo(30, 1);

    await page.evaluate(() => window.photoCropApp.applyCrop());
    await expect(page.locator('#result-modal')).toBeVisible();

    const result = await page.evaluate(() => {
      const res = window.photoCropApp.lastCropResult;
      return {
        width: res.width,
        height: res.height,
        dpi: res.dpi,
        format: res.format,
        sizeBytes: res.sizeBytes,
        url: res.url,
      };
    });

    expect(result.width).toBe(450);
    expect(result.height).toBe(660);
    expect(result.dpi).toBe(300);
    expect(result.format).toBe('jpeg');
    expect(result.sizeBytes).toBeGreaterThan(1000);
    expect(result.url.startsWith('blob:')).toBe(true);
    await expect(page.locator('#result-dpi-info')).toContainText('300 DPI');
    expect(dialogs).toEqual([]);

    // Escape menutup modal sekaligus melepas object URL hasil
    await page.keyboard.press('Escape');
    await expect(page.locator('#result-modal')).toBeHidden();

    const sesudahTutup = await page.evaluate(() => window.photoCropApp.lastCropResult);
    expect(sesudahTutup).toBeNull();
  });

  test('putar 90 derajat menukar dimensi sumber dan tetap dapat diekspor', async ({ page }) => {
    const dialogs = [];
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.message());
      await dialog.dismiss();
    });
    await openApp(page);

    const sebelum = await page.evaluate(() => ({
      w: window.photoCropApp.naturalW,
      h: window.photoCropApp.naturalH,
    }));

    await page.evaluate(() => document.getElementById('rotate-90-btn').click());
    await page.waitForFunction(() => window.photoCropApp.quarterTurns === 1, null, {
      timeout: 20000,
    });

    const sesudah = await page.evaluate(() => ({
      w: window.photoCropApp.naturalW,
      h: window.photoCropApp.naturalH,
      ratio: window.photoCropApp.cropW / window.photoCropApp.cropH,
      targetRatio:
        window.photoCropApp.currentPreset.targetW / window.photoCropApp.currentPreset.targetH,
    }));

    expect(sesudah.w).toBe(sebelum.h);
    expect(sesudah.h).toBe(sebelum.w);
    expect(sesudah.ratio).toBeCloseTo(sesudah.targetRatio, 1);

    await page.evaluate(() => window.photoCropApp.applyCrop());
    await expect(page.locator('#result-modal')).toBeVisible();
    const result = await page.evaluate(() => ({
      width: window.photoCropApp.lastCropResult.width,
      height: window.photoCropApp.lastCropResult.height,
    }));
    expect(result).toEqual({ width: 450, height: 660 });
    expect(dialogs).toEqual([]);
  });

  test('unggahan JPEG dan WebP dinormalisasi sebelum diproses engine', async ({ page }) => {
    const dialogs = [];
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.message());
      await dialog.dismiss();
    });
    await openApp(page);

    const dimensiAwal = await page.evaluate(() => ({
      w: window.photoCropApp.naturalW,
      h: window.photoCropApp.naturalH,
    }));

    // Unggah ulang gambar contoh berformat JPEG
    const sample = await page.request.get('/crop/sample.jpg');
    const sampleBuffer = await sample.body();
    await page.setInputFiles('#file-input', {
      name: 'unggahan.jpg',
      mimeType: 'image/jpeg',
      buffer: sampleBuffer,
    });
    await page.waitForFunction(
      () =>
        window.photoCropApp.sourceFileName === 'unggahan.jpg' &&
        window.photoCropApp.quarterTurns === 0,
      null,
      { timeout: 20000 }
    );

    const setelahJpeg = await page.evaluate(() => ({
      w: window.photoCropApp.naturalW,
      h: window.photoCropApp.naturalH,
      mime: window.photoCropApp.baseBlob.type,
    }));
    expect(setelahJpeg.w).toBe(dimensiAwal.w);
    expect(setelahJpeg.h).toBe(dimensiAwal.h);
    expect(['image/jpeg', 'image/png']).toContain(setelahJpeg.mime);
    await expect(page.locator('#upload-modal')).toBeHidden();

    // WebP harus ditranskode di peramban karena engine hanya mendukung JPEG/PNG
    const webpBase64 = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 120;
      canvas.height = 160;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#1d4ed8';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary);
    });

    await page.setInputFiles('#file-input', {
      name: 'uji.webp',
      mimeType: 'image/webp',
      buffer: Buffer.from(webpBase64, 'base64'),
    });
    await page.waitForFunction(
      () =>
        window.photoCropApp.sourceFileName === 'uji.webp' &&
        window.photoCropApp.naturalW === 120,
      null,
      { timeout: 20000 }
    );

    await page.evaluate(() => window.photoCropApp.applyCrop());
    await expect(page.locator('#result-modal')).toBeVisible();
    const hasil = await page.evaluate(() => ({
      width: window.photoCropApp.lastCropResult.width,
      height: window.photoCropApp.lastCropResult.height,
    }));
    expect(hasil).toEqual({ width: 450, height: 660 });
    expect(dialogs).toEqual([]);
  });

  test('fit to window, grid, dan pintasan keyboard berperilaku benar', async ({ page }) => {
    await openApp(page);

    await page.evaluate(() => window.photoCropApp.setZoom(2));
    // Tombol Fit berada di toolbar yang dapat tersembunyi pada layar kecil
    await page.evaluate(() => document.getElementById('fit-win-btn').click());
    const zoom = await page.evaluate(() => window.photoCropApp.zoom);
    expect(zoom).toBeLessThanOrEqual(1.0001);

    await page.evaluate(() => document.getElementById('btn-grid-thirds').click());
    await expect(page.locator('#grid-rule-thirds')).toHaveClass(/hidden/);
    await page.evaluate(() => document.getElementById('btn-grid-thirds').click());
    await expect(page.locator('#grid-rule-thirds')).not.toHaveClass(/hidden/);

    // Spasi saat fokus di kontrol formulir tidak boleh mengaktifkan mode pan
    await page.focus('#rotation-slider');
    await page.keyboard.press('Space');
    const spacePressed = await page.evaluate(() => window.photoCropApp.isSpacePressed);
    expect(spacePressed).toBe(false);
  });
});
