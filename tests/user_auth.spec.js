const { test, expect } = require('@playwright/test');

// Pastikan suite autentikasi user selalu dijalankan dalam konteks awal bersih (unauthenticated/guest)
test.use({ storageState: { cookies: [], origins: [] } });

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

    // Reset counter gagal login pada user uji agar tidak mengunci akun untuk pengujian berikutnya
    await page.evaluate(async () => {
      try {
        const users = JSON.parse(localStorage.getItem('UNTAN_LOCAL_USERS_DB') || '[]');
        const u = users.find(x => x.nim === 'F1081191042');
        if (u) {
          u.failed_login_attempts = 0;
          u.locked_until = null;
          localStorage.setItem('UNTAN_LOCAL_USERS_DB', JSON.stringify(users));
        }
        const client = window.UntanSupabase ? window.UntanSupabase.getClient() : null;
        if (client) {
          await client.from('users').update({ failed_login_attempts: 0, locked_until: null }).eq('nim', 'F1081191042');
        }
      } catch (_) {}
    });
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


  test('pengunjung belum login dibatasi: otomatis dialihkan ke form login terlebih dahulu saat membuka pengajuan.html', async ({ page }) => {
    // 1. Pastikan tidak ada sesi aktif dengan logout
    await page.goto('/user/login.html');
    await page.evaluate(() => {
      if (window.UntanUserAuth) window.UntanUserAuth.logout();
    });

    // 2. Buka laman /pengajuan.html tanpa sesi login
    await page.goto('/pengajuan.html');

    // 3. Verifikasi otomatis dialihkan ke /user/login.html dengan parameter redirect
    await page.waitForURL(/\/user\/login\.html(\?redirect=.*)?/);
    expect(page.url()).toContain('user/login.html');
    expect(page.url()).toContain('redirect=pengajuan.html');

    // 4. Verifikasi banner pemberitahuan akses terproteksi tampil di laman login
    const redirectNotice = page.locator('#redirectNotice');
    await expect(redirectNotice).toBeVisible();
    await expect(redirectNotice).toContainText('Akses Layanan Terproteksi');
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

    // 4. Verifikasi data default form terisi otomatis dari akun Siti Aminah
    const nimVal = await page.locator('#nim').inputValue();
    const namaVal = await page.locator('#nama_lengkap').inputValue();
    const emailVal = await page.locator('#email').inputValue();
    const ipkVal = await page.locator('#ipk').inputValue();
    expect(nimVal).toBe('F1081191002');
    expect(namaVal).toContain('Siti Aminah');
    expect(emailVal).toBe('siti.aminah@student.untan.ac.id');
    expect(ipkVal).toContain('3.91');

    // 5. Verifikasi tombol submit aktif
    const btnKirim = page.locator('#btnKirimPermohonan');
    await expect(btnKirim).toBeEnabled();

    // 6. Verifikasi photo profile user muncul di menu kanan atas
    const profileBtn = page.locator('#userProfileDropdownBtn');
    await expect(profileBtn).toBeVisible();

    // 7. Klik photo profile untuk membuka submenu dropdown
    await profileBtn.click();
    const dropdownMenu = page.locator('#userProfileDropdownMenu');
    await expect(dropdownMenu).toBeVisible();

    // 8. Verifikasi isi submenu dropdown: Info user, Setting Akun, dan Logout
    await expect(dropdownMenu).toContainText('Siti Aminah');
    await expect(dropdownMenu.locator('#menuItemDashboard')).toBeVisible();
    await expect(dropdownMenu.locator('#menuItemSettings')).toBeVisible();
    await expect(dropdownMenu.locator('#headerBtnLogout')).toBeVisible();

    // 9. Klik menu logout dan verifikasi otomatis dialihkan langsung ke beranda
    await dropdownMenu.locator('#headerBtnLogout').click();
    await page.waitForURL(/\/index\.html/);
    expect(page.url()).toContain('index.html');
  });

  test('data default pada laman pengajuan menyesuaikan otomatis saat jenis layanan diubah', async ({ page }) => {
    // 1. Login terlebih dahulu menggunakan akun Siti Aminah
    await page.goto('/user/login.html');
    await page.fill('#identifier', 'F1081191002');
    await page.fill('#password', 'PasswordUntan123!');
    await page.click('#btnSubmitLogin');
    await page.waitForURL(/\/user\/(index\.html)?$/);

    // 2. Buka form pengajuan dalam keadaan telah login
    await page.goto('/pengajuan.html');

    // 3. Default: Penerbitan Baru
    await expect(page.locator('#sidebarServiceTitle')).toContainText('Penerbitan Ijazah Baru');
    await expect(page.locator('#sidebarBiayaAdmin')).toContainText('Gratis');
    await expect(page.locator('#berkasPendukungBadge')).toContainText('Opsional');

    // 4. Ubah jenis layanan ke Penerbitan Ulang
    await page.locator('label:has(input[value="penerbitan_ulang"])').click();
    await expect(page.locator('#sidebarServiceTitle')).toContainText('Penerbitan Ulang');
    await expect(page.locator('#sidebarBiayaAdmin')).toContainText('200.000');
    await expect(page.locator('#berkasPendukungBadge')).toContainText('Wajib');
    await expect(page.locator('#berkasPendukungTitle')).toContainText('Surat Kehilangan');

    // 5. Ubah jenis layanan ke Perbaikan Data
    await page.locator('label:has(input[value="perbaikan_data"])').click();
    await expect(page.locator('#sidebarServiceTitle')).toContainText('Perbaikan Data');
    await expect(page.locator('#berkasPendukungBadge')).toContainText('Wajib');
    await expect(page.locator('#berkasPendukungTitle')).toContainText('Scan Fisik Ijazah Asli Lama');

    // 6. Kembalikan ke Penerbitan Baru
    await page.locator('label:has(input[value="penerbitan_baru"])').click();
    await expect(page.locator('#sidebarServiceTitle')).toContainText('Penerbitan Ijazah Baru');
    await expect(page.locator('#berkasPendukungBadge')).toContainText('Opsional');
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

  test('pelacakan status di lacak.html memproteksi akses guest dan mengarahkan ke login dengan redirect q', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/lacak.html');
    await page.evaluate(() => {
      localStorage.removeItem('UNTAN_USER_AUTH_SESSION');
    });
    await page.reload();

    // 1. Guest buka lacak.html
    await expect(page.locator('#searchQuery')).toBeVisible();

    // Verifikasi data default awal dikosongkan (empty state) sebelum pencarian
    await expect(page.locator('#displayNomorTiket')).toHaveText('-');
    await expect(page.locator('#displayNamaPemohon')).toHaveText('-');
    await expect(page.locator('#displayNim')).toHaveText('NIM: -');
    await expect(page.locator('#displayEstimasiSelesai')).toHaveText('-');
    await expect(page.locator('#displaySisaHari')).toHaveText('-');
    await expect(page.locator('#displayBiayaLayanan')).toHaveText('-');
    await expect(page.locator('#timelineEmptyState')).toBeVisible();

    // 2. Guest mengisi nomor tiket dan klik Cari Status Permohonan
    await page.fill('#searchQuery', 'UNTAN-IJZ-2025-0842');

    // Tangkap dialog alert akses terproteksi
    let dialogMessage = '';
    page.once('dialog', async dialog => {
      dialogMessage = dialog.message();
      await dialog.accept();
    });

    await page.click('#searchBtn');

    // 3. Harus dialihkan ke login.html dengan parameter redirect lacak.html?q=UNTAN-IJZ-2025-0842
    await page.waitForURL(/\/user\/login\.html/);
    expect(page.url()).toContain('redirect=');
    expect(page.url()).toContain('lacak.html');
    expect(decodeURIComponent(page.url())).toContain('UNTAN-IJZ-2025-0842');
    expect(dialogMessage).toContain('Akses Pelacakan Terproteksi');

    // 4. Banner notifikasi akses terproteksi di login.html harus menampilkan pesan khusus pelacakan
    const notice = page.locator('#redirectNotice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('Layanan pelacakan status permohonan ijazah terproteksi');

    // 5. Login menggunakan akun Rian Adiputra (D101181042 - PasswordUntan123!)
    await page.fill('#identifier', 'D101181042');
    await page.fill('#password', 'PasswordUntan123!');
    await page.click('#btnSubmitLogin');

    // Akun Rian Adiputra memiliki proteksi MFA: selesaikan verifikasi OTP
    await page.waitForURL(/\/user\/mfa\.html/);
    expect(page.url()).toContain('redirect=');
    await page.click('#btnAutoFillOtp');
    await page.click('#btnVerifyMfa');

    // 6. Pengguna otomatis dialihkan kembali ke lacak.html?q=UNTAN-IJZ-2025-0842 dan data tampil
    await page.waitForURL(/\/lacak\.html/);
    expect(page.url()).toContain('lacak.html');
    
    // Verifikasi data riil Rian Adiputra dimuat setelah pencarian berhasil
    await expect(page.locator('#displayNomorTiket')).toHaveText('UNTAN-IJZ-2025-0842');
    await expect(page.locator('#displayNamaPemohon')).toContainText('Rian Adiputra');
    await expect(page.locator('#displayNim')).toContainText('D101181042');
    await expect(page.locator('#displayEstimasiSelesai')).not.toHaveText('-');
    await expect(page.locator('#displaySisaHari')).not.toHaveText('-');
    await expect(page.locator('#displayBiayaLayanan')).not.toHaveText('-');
    await expect(page.locator('#timelineContainer')).toContainText('Tahap 1');
    await expect(page.locator('#trackingNoticeBox')).toBeHidden();
  });

  test('pelacakan status di lacak.html menolak menampilkan data permohonan milik NIM lain', async ({ page }) => {
    // 1. Login menggunakan akun Siti Aminah (F1081191002 - tanpa tantangan MFA)
    await page.goto('/user/login.html');
    await page.fill('#identifier', 'F1081191002');
    await page.fill('#password', 'PasswordUntan123!');
    await page.click('#btnSubmitLogin');
    await page.waitForURL(/\/user\/(index\.html)?$/);

    // 2. Buka halaman lacak.html
    await page.goto('/lacak.html');
    await expect(page.locator('#searchQuery')).toBeVisible();

    // 3. Coba cari tiket milik Rian Adiputra (UNTAN-IJZ-2025-0842 - NIM D101181042)
    await page.fill('#searchQuery', 'UNTAN-IJZ-2025-0842');

    const dialogPromise = page.waitForEvent('dialog');
    await page.click('#searchBtn');
    const dialog = await dialogPromise;

    // 4. Akses harus ditolak karena NIM tidak sesuai dengan akun yang login
    expect(dialog.message()).toContain('Akses Ditolak');
    expect(dialog.message()).toContain('F1081191002');
    await dialog.accept();

    // 5. Verifikasi bahwa data Rian Adiputra TIDAK ditampilkan (tetap dikosongkan)
    await expect(page.locator('#displayNomorTiket')).toHaveText('-');
    await expect(page.locator('#displayNamaPemohon')).toHaveText('-');
    await expect(page.locator('#trackingNoticeBox')).toBeVisible();
    await expect(page.locator('#trackingNoticeBox')).toContainText('Akses Ditolak');
  });
});
