const { test, expect } = require('@playwright/test');

test.describe('Portal Pengguna & Sistem Autentikasi MFA', () => {
  test('routing /user/ dan modul userAuth terpasang dengan benar', async ({ page }) => {
    await page.goto('/user/');
    await expect(page).toHaveTitle(/Portal Pengguna/);

    const hasAuth = await page.evaluate(() => {
      return Boolean(window.UntanUserAuth && typeof window.UntanUserAuth.login === 'function');
    });
    expect(hasAuth).toBe(true);

    // Guest view tampil jika belum login
    await expect(page.locator('#guestView')).toBeVisible();
    await expect(page.locator('#headerLoginBtn')).toBeVisible();
  });

  test('alur login dengan kredensial salah menampilkan pesan error', async ({ page }) => {
    await page.goto('/user/login.html');
    await expect(page).toHaveTitle(/Masuk Akun Pengguna/);

    await page.fill('#identifier', 'F1081191042');
    await page.fill('#password', 'KataSandiSalah123!');
    await page.click('#btnSubmitLogin');

    const alert = page.locator('#loginAlert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('salah');
  });

  test('alur login dengan akun MFA Email -> Verifikasi OTP -> Masuk ke Dashboard', async ({ page }) => {
    await page.goto('/user/login.html');

    // 1. Login menggunakan akun Mahasiswa Fauzi Pratama (MFA Email aktif)
    await page.fill('#identifier', 'F1081191042');
    await page.fill('#password', 'PasswordUntan123!');
    await page.click('#btnSubmitLogin');

    // 2. Dialihkan ke halaman /user/mfa.html
    await page.waitForURL(/\/user\/mfa\.html/);
    expect(page.url()).toContain('/user/mfa.html');

    await expect(page.locator('#mfaUserName')).toContainText('MUHAMMAD FAUZI PRATAMA');
    await expect(page.locator('#panelEmail')).toBeVisible();

    // 3. Otomatis isi kode OTP valid atau gunakan kode pengujian '123456'
    await page.click('#btnAutoFillOtp');
    const otpVal = await page.inputValue('#inputEmailOtp');
    expect(otpVal.length).toBe(6);

    // 4. Klik verifikasi
    await page.click('#btnVerifyMfa');

    // 5. Berhasil masuk ke dashboard /user/index.html
    await page.waitForURL(/\/user\/(index\.html)?$/);
    await expect(page.locator('#authDashboardView')).toBeVisible();
    await expect(page.locator('#userNameTitle')).toContainText('MUHAMMAD FAUZI PRATAMA');
    await expect(page.locator('#userNimDisplay')).toContainText('F1081191042');
  });

  test('alur login dengan akun MFA Smartphone Authenticator App -> Verifikasi TOTP -> Masuk', async ({ page }) => {
    // Logout terlebih dahulu jika ada sesi aktif
    await page.goto('/user/login.html?relogin=1');

    // Login akun Alumni Rian Adiputra (MFA Smartphone Authenticator aktif)
    await page.fill('#identifier', 'D101181042');
    await page.fill('#password', 'PasswordUntan123!');
    await page.click('#btnSubmitLogin');

    // Dialihkan ke /user/mfa.html
    await page.waitForURL(/\/user\/mfa\.html/);
    await expect(page.locator('#mfaUserName')).toContainText('Rian Adiputra');

    // Tab aplikasi smartphone aktif
    await expect(page.locator('#panelApp')).toBeVisible();

    // Isi kode TOTP otomatis
    await page.click('#btnAutoFillOtp');
    const codeVal = await page.inputValue('#inputAppOtp');
    expect(codeVal.length).toBe(6);

    // Verifikasi
    await page.click('#btnVerifyMfa');

    // Masuk ke dashboard
    await page.waitForURL(/\/user\/(index\.html)?$/);
    await expect(page.locator('#authDashboardView')).toBeVisible();
    await expect(page.locator('#userNameTitle')).toContainText('Rian Adiputra');
  });

  test('alur Ubah Kata Sandi (Change Password) saat login', async ({ page }) => {
    // Pastikan login sebagai Fauzi
    await page.goto('/user/index.html');
    const isLoggedIn = await page.evaluate(() => Boolean(window.UntanUserAuth.getCurrentUser()));
    if (!isLoggedIn) {
      await page.goto('/user/login.html');
      await page.fill('#identifier', 'F1081191042');
      await page.fill('#password', 'PasswordUntan123!');
      await page.click('#btnSubmitLogin');
      await page.waitForURL(/\/user\/mfa\.html/);
      await page.click('#btnAutoFillOtp');
      await page.click('#btnVerifyMfa');
      await page.waitForURL(/\/user\/(index\.html)?$/);
    }

    // Beralih ke tab Ubah Kata Sandi
    await page.click('#btnTabPassword');
    await expect(page.locator('#contentPassword')).toBeVisible();

    // Isi password lama salah terlebih dahulu
    await page.fill('#oldPassword', 'SalahPassword123!');
    await page.fill('#newPasswordInput', 'UntanBaru2026!');
    await page.fill('#confirmNewPasswordInput', 'UntanBaru2026!');
    await page.click('#btnSubmitChangePass');

    const alert = page.locator('#changePassAlert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('salah');

    // Isi dengan password lama yang benar 'PasswordUntan123!' dan ganti ke 'UntanBaru2026!'
    await page.fill('#oldPassword', 'PasswordUntan123!');
    await page.fill('#newPasswordInput', 'UntanBaru2026!');
    await page.fill('#confirmNewPasswordInput', 'UntanBaru2026!');
    await page.click('#btnSubmitChangePass');

    await expect(alert).toBeVisible();
    await expect(alert).toContainText('berhasil diubah');

    // Kembalikan ke default agar tes lain tetap konsisten
    await page.fill('#oldPassword', 'UntanBaru2026!');
    await page.fill('#newPasswordInput', 'PasswordUntan123!');
    await page.fill('#confirmNewPasswordInput', 'PasswordUntan123!');
    await page.click('#btnSubmitChangePass');
    await expect(alert).toContainText('berhasil diubah');
  });

  test('alur Request to Reset (Lupa Kata Sandi) dan Reset Kata Sandi Baru', async ({ page }) => {
    // 1. Buka halaman lupa password
    await page.goto('/user/forgot-password.html');
    await expect(page).toHaveTitle(/Lupa Kata Sandi/);

    // 2. Masukkan NIM untuk request reset
    await page.fill('#identifier', 'F1081191042');
    await page.click('#btnSubmitReset');

    // 3. Verifikasi banner aksi sukses muncul dengan kode OTP dan token
    const successBox = page.locator('#successActionBox');
    await expect(successBox).toBeVisible();
    const otpCode = await page.locator('#resOtpCode').textContent();
    expect(otpCode.length).toBe(6);

    // 4. Klik tombol langsung ke halaman buat password baru
    await page.click('#btnDirectReset');
    await page.waitForURL(/\/user\/reset-password\.html/);

    // Token / OTP harus terisi otomatis dari URL
    const tokenInputVal = await page.inputValue('#tokenInput');
    expect(Boolean(tokenInputVal)).toBe(true);

    // 5. Isi password baru
    await page.fill('#newPassword', 'PasswordUntanBaru2026!');
    await page.fill('#confirmPassword', 'PasswordUntanBaru2026!');
    await page.click('#btnSubmitNewPass');

    // 6. Verifikasi notifikasi berhasil
    const resetAlert = page.locator('#resetStatusAlert');
    await expect(resetAlert).toBeVisible();
    await expect(resetAlert).toContainText('berhasil diperbarui');

    // Reset kembali ke password default pengujian
    await page.evaluate(async () => {
      const users = JSON.parse(localStorage.getItem('UNTAN_LOCAL_USERS_DB') || '[]');
      const u = users.find(x => x.nim === 'F1081191042');
      if (u) {
        u.password_hash = 'd8a8b13920cbe0a16827c130ef75f4d1eebae2903e5c709ad699e3ca15b57f20';
        u.password_salt = 'untan_salt_2026_secure';
        localStorage.setItem('UNTAN_LOCAL_USERS_DB', JSON.stringify(users));
      }
    });
  });

  test('pengaturan MFA di dashboard dapat diubah dan disimpan', async ({ page }) => {
    await page.goto('/user/index.html');
    const isLoggedIn = await page.evaluate(() => Boolean(window.UntanUserAuth.getCurrentUser()));
    if (!isLoggedIn) {
      await page.goto('/user/login.html');
      await page.fill('#identifier', 'F1081191042');
      await page.fill('#password', 'PasswordUntan123!');
      await page.click('#btnSubmitLogin');
      await page.waitForURL(/\/user\/mfa\.html/);
      await page.click('#btnAutoFillOtp');
      await page.click('#btnVerifyMfa');
      await page.waitForURL(/\/user\/(index\.html)?$/);
    }

    // Buka tab MFA
    await page.click('#btnTabMfa');
    await expect(page.locator('#contentMfa')).toBeVisible();

    // Buat kunci baru TOTP
    await page.click('#btnGenNewSecret');
    const newSecret = await page.locator('#totpSecretDisplay').textContent();
    expect(newSecret.length).toBeGreaterThan(10);

    // Simpan pengaturan
    await page.click('#btnSaveMfaSettings');
    const saveAlert = page.locator('#mfaSaveAlert');
    await expect(saveAlert).toBeVisible();
    await expect(saveAlert).toContainText('berhasil disimpan');
  });


  test('pengunjung belum login dibatasi: banner login tampil dan tombol kirim disabled di pengajuan.html', async ({ page }) => {
    // Pastikan tidak ada sesi aktif
    await page.goto('/pengajuan.html');
    await page.evaluate(() => {
      if (window.UntanUserAuth) window.UntanUserAuth.logout();
    });
    await page.reload();

    // Verifikasi banner peringatan wajib login tampil
    const authRequiredCard = page.locator('#authRequiredCard');
    await expect(authRequiredCard).toBeVisible();
    await expect(authRequiredCard).toContainText('Akses Dibatasi');
    await expect(authRequiredCard).toContainText('Masuk Akun');

    // Verifikasi banner terotentikasi tersembunyi
    await expect(page.locator('#authActiveCard')).toBeHidden();

    // Verifikasi tombol submit permohonan disabled
    const btnKirim = page.locator('#btnKirimPermohonan');
    await expect(btnKirim).toBeDisabled();

    // Verifikasi tombol login di header tersedia
    const loginBtn = page.locator('#headerLoginBtn');
    await expect(loginBtn).toBeVisible();
  });

  test('pengguna berhasil login dapat mengakses form pengajuan dengan data terisi otomatis dan foto profil aktif', async ({ page }) => {
    // 1. Login menggunakan akun Siti Aminah (F1081191002, tanpa MFA untuk akses langsung)
    await page.goto('/user/login.html');
    await page.fill('#identifier', 'F1081191002');
    await page.fill('#password', 'PasswordUntan123!');
    await page.click('#btnSubmitLogin');
    await page.waitForURL(/\/user\/(index\.html)?$/);

    // 2. Buka halaman /pengajuan.html
    await page.goto('/pengajuan.html');

    // 3. Verifikasi banner terotentikasi tampil dan banner belum login tersembunyi
    await expect(page.locator('#authActiveCard')).toBeVisible();
    await expect(page.locator('#authActiveCard')).toContainText('Siti Aminah');
    await expect(page.locator('#authRequiredCard')).toBeHidden();

    // 4. Verifikasi tombol submit aktif
    const btnKirim = page.locator('#btnKirimPermohonan');
    await expect(btnKirim).toBeEnabled();

    // 5. Verifikasi photo profile user muncul di menu kanan atas
    const profileBtn = page.locator('#userProfileDropdownBtn');
    await expect(profileBtn).toBeVisible();

    // 6. Klik photo profile untuk membuka submenu dropdown
    await profileBtn.click();
    const dropdownMenu = page.locator('#userProfileDropdownMenu');
    await expect(dropdownMenu).toBeVisible();

    // 7. Verifikasi isi submenu dropdown: Info user, Setting Akun, dan Logout
    await expect(dropdownMenu).toContainText('Siti Aminah');
    await expect(dropdownMenu.locator('#menuItemDashboard')).toBeVisible();
    await expect(dropdownMenu.locator('#menuItemSettings')).toBeVisible();
    await expect(dropdownMenu.locator('#headerBtnLogout')).toBeVisible();

    // 8. Klik menu logout dan verifikasi sesi terhapus
    await dropdownMenu.locator('#headerBtnLogout').click();
    
    // Setelah logout, menu kembali menampilkan tombol Masuk Akun
    await expect(page.locator('#headerLoginBtn')).toBeVisible();
    await expect(page.locator('#authRequiredCard')).toBeVisible();
    await expect(page.locator('#btnKirimPermohonan')).toBeDisabled();
  });

  test('photo profile user dan submenu dropdown aktif di beranda index.html saat login', async ({ page }) => {
    // Login akun
    await page.goto('/user/login.html');
    await page.fill('#identifier', 'F1081191002');
    await page.fill('#password', 'PasswordUntan123!');
    await page.click('#btnSubmitLogin');
    await page.waitForURL(/\/user\/(index\.html)?$/);

    // Ke beranda
    await page.goto('/index.html');

    // Profile dropdown tombol harus terlihat di kanan atas
    const profileBtn = page.locator('#userProfileDropdownBtn');
    await expect(profileBtn).toBeVisible();

    // Buka dropdown
    await profileBtn.click();
    await expect(page.locator('#userProfileDropdownMenu')).toBeVisible();
    await expect(page.locator('#userProfileDropdownMenu')).toContainText('Siti Aminah');
    await expect(page.locator('#userProfileDropdownMenu')).toContainText('Pengaturan Akun & MFA');

    // Klik di luar untuk menutup
    await page.click('body', { position: { x: 10, y: 10 } });
    await expect(page.locator('#userProfileDropdownMenu')).toBeHidden();
  });
});
