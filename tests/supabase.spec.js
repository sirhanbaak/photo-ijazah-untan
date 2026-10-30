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
});
