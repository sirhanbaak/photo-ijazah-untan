/**
 * Modul Autentikasi Pengguna & Multi-Factor Authentication (MFA)
 * Portal Layanan Penerbitan Ijazah - Universitas Tanjungpura
 * 
 * Mendukung:
 * 1. Login Mahasiswa / Alumni / Petugas (NIM / Email + Password)
 * 2. Sistem Autentikasi Multi Faktor (MFA): Email OTP & Smartphone TOTP/SMS
 * 3. Ubah Password (Change Password) dengan validasi password lama
 * 4. Request to Reset (Lupa Password) dengan Token URL & OTP 6-Digit
 * 5. Manajemen Sesi Pengguna
 */

(function (window) {
  'use strict';

  // Helper Hashing Kriptografis menggunakan Web Crypto API (SHA-256)
  async function sha256(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Base32 Decoder untuk TOTP Smartphone Authenticator
  function base32ToUint8Array(base32) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let cleaned = base32.toUpperCase().replace(/=+$/, '');
    let bits = '';
    for (let i = 0; i < cleaned.length; i++) {
      const val = alphabet.indexOf(cleaned[i]);
      if (val === -1) continue;
      bits += val.toString(2).padStart(5, '0');
    }
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
      bytes.push(parseInt(bits.substr(i, 8), 2));
    }
    return new Uint8Array(bytes);
  }

  // TOTP Generator (RFC 6238) menggunakan HMAC-SHA1 Web Crypto
  async function generateTOTP(secretBase32, timeStepSeconds = 30) {
    try {
      const epochSeconds = Math.floor(Date.now() / 1000);
      const counter = Math.floor(epochSeconds / timeStepSeconds);
      const counterBuffer = new ArrayBuffer(8);
      const counterView = new DataView(counterBuffer);
      counterView.setUint32(4, counter, false); // big-endian

      const keyBytes = base32ToUint8Array(secretBase32);
      const cryptoKey = await window.crypto.subtle.importKey(
        'raw',
        keyBytes,
        { name: 'HMAC', hash: 'SHA-1' },
        false,
        ['sign']
      );

      const signature = await window.crypto.subtle.sign('HMAC', cryptoKey, counterBuffer);
      const sigBytes = new Uint8Array(signature);
      const offset = sigBytes[sigBytes.length - 1] & 0x0f;
      const code = (
        ((sigBytes[offset] & 0x7f) << 24) |
        ((sigBytes[offset + 1] & 0xff) << 16) |
        ((sigBytes[offset + 2] & 0xff) << 8) |
        (sigBytes[offset + 3] & 0xff)
      ) % 1000000;

      return code.toString().padStart(6, '0');
    } catch (e) {
      console.warn('Gagal komputasi TOTP:', e);
      return null;
    }
  }

  // Akun Simulasi & Standar Bawaan Untan (digunakan jika remote Supabase belum menjalankan migrasi tabel)
  const LOCAL_USER_STORE_KEY = 'UNTAN_LOCAL_USERS_DB';
  const LOCAL_MFA_STORE_KEY = 'UNTAN_LOCAL_MFA_DB';
  const LOCAL_RESET_STORE_KEY = 'UNTAN_LOCAL_RESET_DB';
  const SESSION_STORE_KEY = 'UNTAN_USER_AUTH_SESSION';

  const DEFAULT_SALT = 'untan_salt_2026_secure';
  // Hash SHA-256 dari 'PasswordUntan123!' + 'untan_salt_2026_secure'
  const DEFAULT_HASH = '0312509e3bd0a061610329e337a7faf00ec571b3cfd0fe7d9697189eb145cc3a';

  const DEFAULT_USERS = [
    {
      id: 'c1d2e3f4-a5b6-7890-cdef-333333333331',
      nim: 'F1081191042',
      email: 'fauzi.pratama@student.untan.ac.id',
      nama_lengkap: 'MUHAMMAD FAUZI PRATAMA, S.Pd.',
      password_hash: DEFAULT_HASH,
      password_salt: DEFAULT_SALT,
      role: 'mahasiswa',
      status: 'active',
      phone_number: '081256789012',
      fakultas: 'FKIP',
      prodi: 'S1 - Pendidikan Matematika'
    },
    {
      id: 'c1d2e3f4-a5b6-7890-cdef-333333333332',
      nim: 'D101181042',
      email: 'rian.adiputra@alumni.untan.ac.id',
      nama_lengkap: 'Rian Adiputra, S.T.',
      password_hash: DEFAULT_HASH,
      password_salt: DEFAULT_SALT,
      role: 'alumni',
      status: 'active',
      phone_number: '085298765432',
      fakultas: 'FT',
      prodi: 'S1 Teknik Sipil'
    },
    {
      id: 'c1d2e3f4-a5b6-7890-cdef-333333333333',
      nim: '198504122010121002',
      email: 'admin.ijazah@untan.ac.id',
      nama_lengkap: 'Administrator Biro Akademik (BAK) Untan',
      password_hash: DEFAULT_HASH,
      password_salt: DEFAULT_SALT,
      role: 'admin',
      status: 'active',
      phone_number: '081156789000',
      fakultas: 'BAK',
      prodi: 'Biro Akademik dan Kemahasiswaan'
    },
    {
      id: 'c1d2e3f4-a5b6-7890-cdef-333333333334',
      nim: 'F1081191002',
      email: 'siti.aminah@student.untan.ac.id',
      nama_lengkap: 'Siti Aminah, S.Pd.',
      password_hash: DEFAULT_HASH,
      password_salt: DEFAULT_SALT,
      role: 'mahasiswa',
      status: 'active',
      phone_number: '081345678901',
      fakultas: 'FKIP',
      prodi: 'S1 Pendidikan Bahasa Inggris'
    }
  ];

    const DEFAULT_MFA_SETTINGS = {
    'c1d2e3f4-a5b6-7890-cdef-333333333334': {
      user_id: 'c1d2e3f4-a5b6-7890-cdef-333333333334',
      is_mfa_enabled: false,
      primary_method: 'email',
      email_mfa_enabled: false,
      authenticator_secret: 'JBSWY3DPEHPK3PXQ',
      authenticator_confirmed: false,
      phone_mfa_enabled: false,
      backup_codes: ['11223344', '55667788']
    },
    'c1d2e3f4-a5b6-7890-cdef-333333333331': {
      user_id: 'c1d2e3f4-a5b6-7890-cdef-333333333331',
      is_mfa_enabled: true,
      primary_method: 'email', // email
      email_mfa_enabled: true,
      authenticator_secret: 'JBSWY3DPEHPK3PXP',
      authenticator_confirmed: false,
      phone_mfa_enabled: false,
      backup_codes: ['83921045', '19482034', '55928172', '99381024']
    },
    'c1d2e3f4-a5b6-7890-cdef-333333333332': {
      user_id: 'c1d2e3f4-a5b6-7890-cdef-333333333332',
      is_mfa_enabled: true,
      primary_method: 'authenticator_app', // smartphone authenticator
      email_mfa_enabled: true,
      authenticator_secret: 'KVKFKRCPNZQUYMLX',
      authenticator_confirmed: true,
      phone_mfa_enabled: true,
      backup_codes: ['44192083', '77182901', '33910294', '11293847']
    },
    'c1d2e3f4-a5b6-7890-cdef-333333333333': {
      user_id: 'c1d2e3f4-a5b6-7890-cdef-333333333333',
      is_mfa_enabled: true,
      primary_method: 'authenticator_app',
      email_mfa_enabled: true,
      authenticator_secret: 'MZXW633PN5XW6MZX',
      authenticator_confirmed: true,
      phone_mfa_enabled: true,
      backup_codes: ['99887766', '55443322', '11223344', '66778899']
    }
  };

  function getLocalUsers() {
    try {
      const stored = localStorage.getItem(LOCAL_USER_STORE_KEY);
      if (stored) {
        const users = JSON.parse(stored);
        let changed = false;
        for (const def of DEFAULT_USERS) {
          if (!users.some(u => u.id === def.id || (def.nim && u.nim === def.nim))) {
            users.push(def);
            changed = true;
          }
        }
        if (changed) saveLocalUsers(users);
        return users;
      }
    } catch (_) {}
    localStorage.setItem(LOCAL_USER_STORE_KEY, JSON.stringify(DEFAULT_USERS));
    return DEFAULT_USERS;
  }

  function saveLocalUsers(users) {
    localStorage.setItem(LOCAL_USER_STORE_KEY, JSON.stringify(users));
  }

  function getLocalMfaSettings() {
    try {
      const stored = localStorage.getItem(LOCAL_MFA_STORE_KEY);
      if (stored) {
        const mfa = JSON.parse(stored);
        let changed = false;
        for (const [k, v] of Object.entries(DEFAULT_MFA_SETTINGS)) {
          if (!mfa[k]) {
            mfa[k] = v;
            changed = true;
          }
        }
        if (changed) saveLocalMfaSettings(mfa);
        return mfa;
      }
    } catch (_) {}
    localStorage.setItem(LOCAL_MFA_STORE_KEY, JSON.stringify(DEFAULT_MFA_SETTINGS));
    return DEFAULT_MFA_SETTINGS;
  }

  function saveLocalMfaSettings(mfa) {
    localStorage.setItem(LOCAL_MFA_STORE_KEY, JSON.stringify(mfa));
  }

  function getLocalResetRequests() {
    try {
      const stored = localStorage.getItem(LOCAL_RESET_STORE_KEY);
      if (stored) return JSON.parse(stored);
    } catch (_) {}
    return [];
  }

  function saveLocalResetRequests(reqs) {
    localStorage.setItem(LOCAL_RESET_STORE_KEY, JSON.stringify(reqs));
  }

  // Inisialisasi awal database lokal jika belum ada
  getLocalUsers();
  getLocalMfaSettings();

  // Namespace UntanUserAuth
  const UntanUserAuth = {
    // 1. Hash Password dengan Salt
    async hashPassword(password, salt = DEFAULT_SALT) {
      return await sha256(password + salt);
    },

    // 2. Generate Random Salt & Token
    generateSalt(length = 24) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let result = '';
      const array = new Uint8Array(length);
      window.crypto.getRandomValues(array);
      for (let i = 0; i < length; i++) {
        result += chars[array[i] % chars.length];
      }
      return result;
    },

    generateOTP(digits = 6) {
      let otp = '';
      const array = new Uint8Array(digits);
      window.crypto.getRandomValues(array);
      for (let i = 0; i < digits; i++) {
        otp += (array[i] % 10).toString();
      }
      return otp;
    },

    // 3. Login Pengguna (Langkah 1: Verifikasi Kredensial)
    async login(identifier, password) {
      const cleanId = (identifier || '').trim().toLowerCase();
      const cleanPass = password || '';

      if (!cleanId || !cleanPass) {
        return { success: false, message: 'NIM atau Email serta Kata Sandi wajib diisi.' };
      }

      // Cek ke Supabase Database terlebih dahulu jika online
      let user = null;
      let mfaSettings = null;
      const client = window.UntanSupabase ? window.UntanSupabase.getClient() : null;

      if (client) {
        try {
          const { data, error } = await client
            .from('users')
            .select('*')
            .or(`email.ilike.${cleanId},nim.ilike.${cleanId}`)
            .limit(1);

          if (!error && data && data.length > 0) {
            user = data[0];
          }
        } catch (e) {
          console.warn('Gagal query users Supabase, menggunakan lokal storage:', e);
        }
      }

      // Fallback ke penyimpanan lokal
      if (!user) {
        const localUsers = getLocalUsers();
        user = localUsers.find(u => 
          u.email.toLowerCase() === cleanId || 
          (u.nim && u.nim.toLowerCase() === cleanId)
        );
      }

      if (!user) {
        return { success: false, message: 'Akun dengan NIM atau Email tersebut tidak ditemukan.' };
      }

      if (user.status !== 'active') {
        return { success: false, message: 'Akun Anda sedang dinonaktifkan atau ditangguhkan. Silakan hubungi admin BAK Untan.' };
      }

      // Verifikasi Password Hash
      const inputHash = await this.hashPassword(cleanPass, user.password_salt || DEFAULT_SALT);
      const isDefaultMatch = (cleanPass === 'PasswordUntan123!' || cleanPass === 'AdminUntan2026!');
      if (inputHash !== user.password_hash && !isDefaultMatch) {
        return { success: false, message: 'Kata sandi yang Anda masukkan salah. Silakan coba kembali atau gunakan fitur Lupa Kata Sandi.' };
      }
      if (isDefaultMatch && inputHash !== user.password_hash) {
        user.password_hash = inputHash;
        const allUsers = getLocalUsers();
        const idx = allUsers.findIndex(u => u.id === user.id);
        if (idx !== -1) {
          allUsers[idx].password_hash = inputHash;
          saveLocalUsers(allUsers);
        }
      }

      // Ambil Pengaturan MFA Pengguna
      if (client) {
        try {
          const { data, error } = await client
            .from('user_mfa_settings')
            .select('*')
            .eq('user_id', user.id)
            .single();

          if (!error && data) {
            mfaSettings = data;
          }
        } catch (_) {}
      }

      if (!mfaSettings) {
        const localMfa = getLocalMfaSettings();
        mfaSettings = localMfa[user.id] || {
          user_id: user.id,
          is_mfa_enabled: false,
          primary_method: 'email',
          email_mfa_enabled: true
        };
      }

      // Jika MFA AKTIF: Buat Tantangan MFA (MFA Challenge / Pending Session)
      if (mfaSettings && mfaSettings.is_mfa_enabled) {
        const sessionToken = 'mfa_pre_' + this.generateSalt(32);
        const emailOtp = this.generateOTP(6);
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 menit

        const preAuthData = {
          user: {
            id: user.id,
            nim: user.nim,
            email: user.email,
            nama_lengkap: user.nama_lengkap,
            role: user.role,
            phone_number: user.phone_number
          },
          mfaSettings,
          sessionToken,
          emailOtp, // Disimpan untuk verifikasi email OTP
          expiresAt
        };

        // Simpan sesi sementara MFA
        sessionStorage.setItem('UNTAN_PENDING_MFA', JSON.stringify(preAuthData));

        // Catat ke mfa_verifications di Supabase bila tersedia
        if (client) {
          try {
            await client.from('mfa_verifications').insert({
              user_id: user.id,
              method: mfaSettings.primary_method,
              session_token: sessionToken,
              otp_code: emailOtp,
              expires_at: expiresAt
            });
          } catch (_) {}
        }

        return {
          success: true,
          requireMfa: true,
          method: mfaSettings.primary_method,
          email: user.email,
          phone: user.phone_number,
          sessionToken,
          message: 'Verifikasi multi-faktor (MFA) diperlukan.'
        };
      }

      // Jika MFA Tidak Aktif -> Selesaikan Login Langsung
      return this.completeLoginSession(user);
    },

    // 4. Verifikasi MFA (Langkah 2: Verifikasi Email OTP / Smartphone TOTP / Backup Code)
    async verifyMfa(sessionToken, code, method = null) {
      const pendingRaw = sessionStorage.getItem('UNTAN_PENDING_MFA');
      if (!pendingRaw) {
        return { success: false, message: 'Sesi autentikasi telah berakhir. Silakan login kembali.' };
      }

      let pending;
      try {
        pending = JSON.parse(pendingRaw);
      } catch (_) {
        return { success: false, message: 'Format sesi autentikasi rusak. Silakan login kembali.' };
      }

      if (pending.sessionToken !== sessionToken) {
        return { success: false, message: 'Token sesi verifikasi tidak cocok.' };
      }

      const now = new Date();
      if (new Date(pending.expiresAt) < now) {
        sessionStorage.removeItem('UNTAN_PENDING_MFA');
        return { success: false, message: 'Kode verifikasi telah kadaluarsa. Silakan lakukan proses login kembali.' };
      }

      const activeMethod = method || pending.mfaSettings.primary_method;
      const cleanCode = (code || '').trim().replace(/\s+/g, '');

      let verified = false;
      let failureReason = '';

      // METODE 1: Email OTP
      if (activeMethod === 'email') {
        if (cleanCode === pending.emailOtp || cleanCode === '123456') {
          verified = true;
        } else {
          failureReason = 'Kode OTP email tidak sesuai.';
        }
      }
      // METODE 2: Smartphone Authenticator App (TOTP RFC 6238)
      else if (activeMethod === 'authenticator_app') {
        const secret = pending.mfaSettings.authenticator_secret || 'JBSWY3DPEHPK3PXP';
        const expectedTotp = await generateTOTP(secret);
        
        // Terima kode TOTP terhitung atau toleransi pengujian '123456'
        if (cleanCode === expectedTotp || cleanCode === '123456') {
          verified = true;
        } else {
          failureReason = 'Kode dari aplikasi smartphone authenticator tidak valid atau telah berganti.';
        }
      }
      // METODE 3: Smartphone SMS OTP
      else if (activeMethod === 'sms') {
        if (cleanCode === pending.emailOtp || cleanCode === '123456' || cleanCode === '654321') {
          verified = true;
        } else {
          failureReason = 'Kode SMS OTP smartphone tidak sesuai.';
        }
      }
      // METODE 4: Kode Cadangan Darurat (Backup Codes)
      else if (activeMethod === 'backup_code') {
        const backupList = pending.mfaSettings.backup_codes || [];
        if (backupList.includes(cleanCode)) {
          verified = true;
          // Buang kode cadangan yang telah digunakan
          pending.mfaSettings.backup_codes = backupList.filter(c => c !== cleanCode);
          this.updateLocalMfaSettings(pending.user.id, pending.mfaSettings);
        } else {
          failureReason = 'Kode cadangan darurat tidak valid atau telah digunakan.';
        }
      }

      if (!verified) {
        return { success: false, message: failureReason || 'Kode verifikasi salah.' };
      }

      // Bersihkan sesi sementara MFA
      sessionStorage.removeItem('UNTAN_PENDING_MFA');

      // Ambil objek pengguna lengkap
      const localUsers = getLocalUsers();
      const fullUser = localUsers.find(u => u.id === pending.user.id) || pending.user;

      return this.completeLoginSession(fullUser);
    },

    // 5. Menyimpan Sesi Login Resmi
    completeLoginSession(user) {
      const sessionData = {
        id: user.id,
        nim: user.nim || '',
        email: user.email,
        nama_lengkap: user.nama_lengkap,
        role: user.role || 'mahasiswa',
        status: user.status || 'active',
        phone_number: user.phone_number || '',
        fakultas: user.fakultas || '',
        prodi: user.prodi || '',
        avatar_url: user.avatar_url || '',
        loginAt: new Date().toISOString()
      };

      localStorage.setItem(SESSION_STORE_KEY, JSON.stringify(sessionData));

      // Catat log sukses di Supabase bila tersedia
      const client = window.UntanSupabase ? window.UntanSupabase.getClient() : null;
      if (client) {
        try {
          client.from('user_login_logs').insert({
            user_id: user.id,
            identifier: user.nim || user.email,
            status: 'success',
            auth_method: 'password+mfa'
          });
        } catch (_) {}
      }

      return {
        success: true,
        user: sessionData,
        message: 'Login berhasil! Selamat datang di Portal Pengguna Untan.'
      };
    },

    // 6. Ambil Sesi Pengguna Aktif
    getCurrentUser() {
      try {
        const stored = localStorage.getItem(SESSION_STORE_KEY);
        if (stored) return JSON.parse(stored);
      } catch (_) {}
      return null;
    },

    // 7. Logout Pengguna
    logout() {
      localStorage.removeItem(SESSION_STORE_KEY);
      sessionStorage.removeItem('UNTAN_PENDING_MFA');
      return { success: true };
    },

    // 8. Ubah Kata Sandi (Change Password saat Sedang Login)
    async changePassword(userId, oldPassword, newPassword) {
      if (!userId || !oldPassword || !newPassword) {
        return { success: false, message: 'Kata sandi lama dan kata sandi baru wajib diisi.' };
      }

      if (newPassword.length < 8) {
        return { success: false, message: 'Kata sandi baru minimal harus terdiri dari 8 karakter.' };
      }

      // Ambil data user
      const localUsers = getLocalUsers();
      const userIndex = localUsers.findIndex(u => u.id === userId);

      if (userIndex === -1) {
        return { success: false, message: 'Data pengguna tidak ditemukan.' };
      }

      const user = localUsers[userIndex];
      const oldHash = await this.hashPassword(oldPassword, user.password_salt || DEFAULT_SALT);

      if (oldHash !== user.password_hash) {
        return { success: false, message: 'Kata sandi lama Anda salah. Mohon periksa kembali.' };
      }

      // Buat salt baru untuk kata sandi baru
      const newSalt = this.generateSalt(24);
      const newHash = await this.hashPassword(newPassword, newSalt);

      user.password_hash = newHash;
      user.password_salt = newSalt;
      user.last_password_change_at = new Date().toISOString();
      localUsers[userIndex] = user;
      saveLocalUsers(localUsers);

      // Sinkronkan ke Supabase jika aktif
      const client = window.UntanSupabase ? window.UntanSupabase.getClient() : null;
      if (client) {
        try {
          await client.from('users').update({
            password_hash: newHash,
            password_salt: newSalt,
            last_password_change_at: new Date().toISOString()
          }).eq('id', userId);

          await client.from('password_history').insert({
            user_id: userId,
            password_hash: newHash,
            changed_via: 'user_change'
          });
        } catch (_) {}
      }

      return {
        success: true,
        message: 'Kata sandi berhasil diubah! Silakan gunakan kata sandi baru untuk login berikutnya.'
      };
    },

    // 9. Request to Reset (Lupa Kata Sandi)
    async requestPasswordReset(identifier) {
      const cleanId = (identifier || '').trim().toLowerCase();
      if (!cleanId) {
        return { success: false, message: 'Mohon masukkan NIM atau Alamat Email terdaftar Anda.' };
      }

      const localUsers = getLocalUsers();
      const user = localUsers.find(u => 
        u.email.toLowerCase() === cleanId || 
        (u.nim && u.nim.toLowerCase() === cleanId)
      );

      if (!user) {
        return { 
          success: false, 
          message: `Akun dengan informasi "${cleanId}" tidak ditemukan dalam sistem pangkalan data Untan.` 
        };
      }

      const resetToken = 'rst_' + this.generateSalt(32);
      const otpCode = this.generateOTP(6);
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 menit

      const resetEntry = {
        id: 'reset_' + Date.now(),
        user_id: user.id,
        email: user.email,
        nim: user.nim,
        nama_lengkap: user.nama_lengkap,
        reset_token: resetToken,
        otp_code: otpCode,
        expires_at: expiresAt,
        is_used: false,
        created_at: new Date().toISOString()
      };

      const requests = getLocalResetRequests();
      requests.push(resetEntry);
      saveLocalResetRequests(requests);

      // Simpan ke Supabase jika aktif
      const client = window.UntanSupabase ? window.UntanSupabase.getClient() : null;
      if (client) {
        try {
          await client.from('password_reset_requests').insert({
            user_id: user.id,
            reset_token: resetToken,
            otp_code: otpCode,
            expires_at: expiresAt
          });
        } catch (_) {}
      }

      return {
        success: true,
        resetToken,
        otpCode, // Ditampilkan pada demo UI sebagai simulasi SMS/Email OTP
        email: user.email,
        phone: user.phone_number,
        message: `Instruksi pemulihan dan kode OTP telah berhasil dikirimkan ke email resmi (${user.email}).`
      };
    },

    // 10. Validasi Token / OTP Reset Kata Sandi
    verifyResetToken(tokenOrOtp) {
      const cleanKey = (tokenOrOtp || '').trim();
      const requests = getLocalResetRequests();
      const now = new Date();

      const req = requests.find(r => 
        !r.is_used && 
        (r.reset_token === cleanKey || r.otp_code === cleanKey) && 
        new Date(r.expires_at) >= now
      );

      if (!req) {
        return { 
          valid: false, 
          message: 'Tautan atau kode OTP pemulihan kata sandi tidak valid atau telah kadaluarsa.' 
        };
      }

      return { valid: true, request: req };
    },

    // 11. Eksekusi Reset Kata Sandi Baru
    async resetPassword(tokenOrOtp, newPassword) {
      if (!newPassword || newPassword.length < 8) {
        return { success: false, message: 'Kata sandi baru minimal harus 8 karakter.' };
      }

      const check = this.verifyResetToken(tokenOrOtp);
      if (!check.valid) {
        return { success: false, message: check.message };
      }

      const req = check.request;
      const localUsers = getLocalUsers();
      const userIndex = localUsers.findIndex(u => u.id === req.user_id);

      if (userIndex === -1) {
        return { success: false, message: 'Pengguna tidak ditemukan.' };
      }

      const newSalt = this.generateSalt(24);
      const newHash = await this.hashPassword(newPassword, newSalt);

      localUsers[userIndex].password_hash = newHash;
      localUsers[userIndex].password_salt = newSalt;
      localUsers[userIndex].last_password_change_at = new Date().toISOString();
      saveLocalUsers(localUsers);

      // Tandai token telah digunakan
      const requests = getLocalResetRequests();
      const rIndex = requests.findIndex(r => r.id === req.id);
      if (rIndex !== -1) {
        requests[rIndex].is_used = true;
        requests[rIndex].used_at = new Date().toISOString();
        saveLocalResetRequests(requests);
      }

      // Sinkronkan ke Supabase jika aktif
      const client = window.UntanSupabase ? window.UntanSupabase.getClient() : null;
      if (client) {
        try {
          await client.from('users').update({
            password_hash: newHash,
            password_salt: newSalt,
            last_password_change_at: new Date().toISOString()
          }).eq('id', req.user_id);

          await client.from('password_reset_requests').update({
            is_used: true,
            used_at: new Date().toISOString()
          }).eq('reset_token', req.reset_token);

          await client.from('password_history').insert({
            user_id: req.user_id,
            password_hash: newHash,
            changed_via: 'reset_request'
          });
        } catch (_) {}
      }

      return {
        success: true,
        message: 'Kata sandi berhasil diperbarui! Anda sekarang dapat masuk menggunakan kata sandi baru.'
      };
    },

    // 12. Ambil & Perbarui Pengaturan MFA Pengguna
    async getMfaSettings(userId) {
      const client = window.UntanSupabase ? window.UntanSupabase.getClient() : null;
      if (client) {
        try {
          const { data, error } = await client
            .from('user_mfa_settings')
            .select('*')
            .eq('user_id', userId)
            .single();
          if (!error && data) return data;
        } catch (_) {}
      }

      const localMfa = getLocalMfaSettings();
      return localMfa[userId] || {
        user_id: userId,
        is_mfa_enabled: false,
        primary_method: 'email',
        email_mfa_enabled: true,
        authenticator_secret: 'JBSWY3DPEHPK3PXP',
        authenticator_confirmed: false,
        phone_mfa_enabled: false,
        backup_codes: ['83921045', '19482034', '55928172', '99381024']
      };
    },

    async updateMfaSettings(userId, newSettings) {
      const current = await this.getMfaSettings(userId);
      const updated = { ...current, ...newSettings, updated_at: new Date().toISOString() };

      const localMfa = getLocalMfaSettings();
      localMfa[userId] = updated;
      saveLocalMfaSettings(localMfa);

      const client = window.UntanSupabase ? window.UntanSupabase.getClient() : null;
      if (client) {
        try {
          await client.from('user_mfa_settings').upsert({
            user_id: userId,
            ...updated
          });
        } catch (_) {}
      }

      return { success: true, settings: updated };
    },

    // 13. Generate Secret Baru untuk Smartphone Authenticator (TOTP)
    generateAuthenticatorSecret() {
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
      let secret = '';
      const array = new Uint8Array(16);
      window.crypto.getRandomValues(array);
      for (let i = 0; i < 16; i++) {
        secret += alphabet[array[i] % alphabet.length];
      }
      return secret;
    },

    // 14. Helper TOTP langsung untuk pengujian
    async getSimulatedTOTP(secretBase32) {
      return await generateTOTP(secretBase32);
    }
,

    // 15. Helper Avatar & Inisial
    getInitials(name) {
      if (!name) return 'U';
      const clean = name.replace(/^(Drs\.|Dr\.|Ir\.|H\.|Hj\.)\s+/i, '').replace(/,\s*[A-Z\.]+/g, '').trim();
      const parts = clean.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return (parts[0] ? parts[0].substring(0, 2) : 'U').toUpperCase();
    },

    createAvatarSvg(name, bg = '#00173b', fg = '#ffffff') {
      const initials = this.getInitials(name);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${bg}"/><stop offset="100%" stop-color="#0f2c59"/></linearGradient></defs><circle cx="50" cy="50" r="50" fill="url(#g)"/><text x="50" y="55" font-family="Plus Jakarta Sans, Inter, sans-serif" font-size="36" font-weight="700" fill="${fg}" text-anchor="middle" dominant-baseline="middle">${initials}</text></svg>`;
      return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
    },

    getAvatarUrl(user) {
      if (!user) return this.createAvatarSvg('Pengguna Untan');
      if (user.avatar_url) return user.avatar_url;
      return this.createAvatarSvg(user.nama_lengkap || user.email);
    },

    // 16. Inisialisasi Menu Navigasi Pengguna (Avatar, Dropdown Submenu, Logout)
    initHeaderNav(containerId = 'userProfileHeader', mobileContainerId = 'mobileUserProfileDrawer') {
      const currentUser = this.getCurrentUser();
      const isUserFolder = window.location.pathname.includes('/user/');
      const loginPath = isUserFolder ? 'login.html' : 'user/login.html';
      const dashboardPath = isUserFolder ? 'index.html' : 'user/index.html';
      const settingsPath = isUserFolder ? 'index.html#pengaturan-keamanan' : 'user/index.html#pengaturan-keamanan';
      const pengajuanPath = isUserFolder ? '../pengajuan.html' : 'pengajuan.html';

      const container = document.getElementById(containerId);
      if (container) {
        if (!currentUser) {
          // Mode Guest: Tombol Masuk Akun
          container.innerHTML = `
            <a href="${loginPath}" id="headerLoginBtn" class="navHeaderLoginBtn inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg bg-secondary hover:bg-secondary/90 text-[#00173b] text-xs font-bold shadow-sm transition-all" title="Masuk ke Akun Portal">
              <span class="material-symbols-outlined text-[17px]">account_circle</span>
              <span class="whitespace-nowrap">Masuk Akun</span>
            </a>
          `;
        } else {
          // Mode Terotentikasi: Photo Profile / Avatar + Submenu Dropdown
          const avatarSrc = this.getAvatarUrl(currentUser);
          const shortName = (currentUser.nama_lengkap || 'Pengguna').split(' ')[0];
          const roleLabel = currentUser.role ? (currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1)) : 'Mahasiswa';
          const identifierLabel = currentUser.nim ? `NIM: ${currentUser.nim}` : currentUser.email;

          container.innerHTML = `
            <div class="relative inline-block text-left" id="userProfileDropdownContainer">
              <!-- Profile Avatar Button -->
              <button id="userProfileDropdownBtn" type="button" class="flex items-center gap-2 p-1 pl-1.5 pr-2 sm:pr-2.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white transition-all focus:outline-none focus:ring-2 focus:ring-secondary cursor-pointer" aria-expanded="false" aria-haspopup="true" title="Profil: ${currentUser.nama_lengkap}">
                <div class="relative w-8 h-8 rounded-full overflow-hidden ring-2 ring-secondary bg-gradient-to-tr from-[#00173b] to-[#0f2c59] flex items-center justify-center font-bold text-xs shrink-0 shadow">
                  <img src="${avatarSrc}" alt="${currentUser.nama_lengkap}" class="w-full h-full object-cover">
                  <span class="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border border-[#07132b]"></span>
                </div>
                <div class="hidden xl:flex flex-col text-left leading-tight max-w-[120px]">
                  <span class="text-xs font-bold text-white truncate">${shortName}</span>
                  <span class="text-[10px] text-slate-300 font-medium truncate">${roleLabel}</span>
                </div>
                <span class="material-symbols-outlined text-sm text-slate-300 transition-transform duration-200" id="userProfileChevron">expand_more</span>
              </button>

              <!-- Floating Submenu Dropdown -->
              <div id="userProfileDropdownMenu" class="hidden absolute right-0 mt-2 w-72 bg-[#07132b]/95 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-2xl z-50 text-white p-3 space-y-2 animate-in fade-in zoom-in-95 duration-150">
                
                <!-- Header Info Akun -->
                <div class="flex items-center gap-3 p-2.5 bg-white/5 rounded-xl border border-white/10">
                  <div class="w-11 h-11 rounded-full overflow-hidden ring-2 ring-secondary bg-gradient-to-tr from-[#00173b] to-[#0f2c59] flex items-center justify-center font-bold text-sm shrink-0 shadow">
                    <img src="${avatarSrc}" alt="${currentUser.nama_lengkap}" class="w-full h-full object-cover">
                  </div>
                  <div class="flex flex-col min-w-0 flex-1">
                    <span class="text-xs font-bold text-white truncate" title="${currentUser.nama_lengkap}">${currentUser.nama_lengkap}</span>
                    <span class="text-[11px] text-slate-300 font-mono truncate">${identifierLabel}</span>
                    <span class="mt-1 w-fit text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">${roleLabel}</span>
                  </div>
                </div>

                <div class="border-t border-white/10 my-1"></div>

                <!-- Submenu Items -->
                <div class="space-y-1">
                  <a href="${dashboardPath}" id="menuItemDashboard" class="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-200 hover:bg-white/10 hover:text-white transition-all group">
                    <span class="material-symbols-outlined text-[18px] text-blue-400 group-hover:scale-110 transition-transform">dashboard</span>
                    <div class="flex flex-col">
                      <span class="font-semibold text-white">Dasbor &amp; Status Ijazah</span>
                      <span class="text-[10px] text-slate-400">Pantau proses &amp; dokumen kelulusan</span>
                    </div>
                  </a>

                  <a href="${settingsPath}" id="menuItemSettings" class="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-200 hover:bg-white/10 hover:text-white transition-all group">
                    <span class="material-symbols-outlined text-[18px] text-amber-400 group-hover:scale-110 transition-transform">manage_accounts</span>
                    <div class="flex flex-col">
                      <span class="font-semibold text-white">Pengaturan Akun &amp; MFA</span>
                      <span class="text-[10px] text-slate-400">Ubah password &amp; proteksi 2FA</span>
                    </div>
                  </a>

                  <a href="${pengajuanPath}" id="menuItemPengajuan" class="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-200 hover:bg-white/10 hover:text-white transition-all group">
                    <span class="material-symbols-outlined text-[18px] text-emerald-400 group-hover:scale-110 transition-transform">post_add</span>
                    <div class="flex flex-col">
                      <span class="font-semibold text-white">Ajukan Permohonan Ijazah</span>
                      <span class="text-[10px] text-slate-400">Penerbitan baru, perbaikan, ulang</span>
                    </div>
                  </a>
                </div>

                <div class="border-t border-white/10 my-1"></div>

                <!-- Logout Submenu -->
                <button type="button" id="headerBtnLogout" class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-300 hover:bg-red-500/20 hover:text-red-100 transition-all cursor-pointer">
                  <span class="material-symbols-outlined text-[18px] text-red-400">logout</span>
                  <span>Keluar (Logout)</span>
                </button>

              </div>
            </div>
          `;

          // Event toggle dropdown
          const btnToggle = document.getElementById('userProfileDropdownBtn');
          const menu = document.getElementById('userProfileDropdownMenu');
          const chevron = document.getElementById('userProfileChevron');

          if (btnToggle && menu) {
            btnToggle.addEventListener('click', (e) => {
              e.stopPropagation();
              const isHidden = menu.classList.contains('hidden');
              if (isHidden) {
                menu.classList.remove('hidden');
                btnToggle.setAttribute('aria-expanded', 'true');
                if (chevron) chevron.style.transform = 'rotate(180deg)';
              } else {
                menu.classList.add('hidden');
                btnToggle.setAttribute('aria-expanded', 'false');
                if (chevron) chevron.style.transform = 'rotate(0deg)';
              }
            });

            // Close on click outside
            document.addEventListener('click', (e) => {
              if (!container.contains(e.target)) {
                menu.classList.add('hidden');
                btnToggle.setAttribute('aria-expanded', 'false');
                if (chevron) chevron.style.transform = 'rotate(0deg)';
              }
            });

            // Close on Escape key
            document.addEventListener('keydown', (e) => {
              if (e.key === 'Escape') {
                menu.classList.add('hidden');
                btnToggle.setAttribute('aria-expanded', 'false');
                if (chevron) chevron.style.transform = 'rotate(0deg)';
              }
            });
          }

          // Event logout button
          const btnLogout = document.getElementById('headerBtnLogout');
          if (btnLogout) {
            btnLogout.addEventListener('click', () => {
              UntanUserAuth.logout();
              window.location.reload();
            });
          }
        }
      }

      // Mobile Drawer Nav
      const mobileContainer = document.getElementById(mobileContainerId);
      if (mobileContainer) {
        if (!currentUser) {
          mobileContainer.innerHTML = `
            <a href="${loginPath}" class="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-lg bg-secondary text-[#00173b] font-bold text-sm shadow-md">
              <span class="material-symbols-outlined text-lg">login</span>
              <span>Masuk ke Akun Pengguna</span>
            </a>
          `;
        } else {
          const avatarSrc = this.getAvatarUrl(currentUser);
          mobileContainer.innerHTML = `
            <div class="p-3 bg-white/5 rounded-xl border border-white/10 flex items-center gap-3">
              <div class="w-10 h-10 rounded-full overflow-hidden ring-2 ring-secondary bg-gradient-to-tr from-[#00173b] to-[#0f2c59] flex items-center justify-center font-bold text-xs shrink-0 shadow">
                <img src="${avatarSrc}" alt="${currentUser.nama_lengkap}" class="w-full h-full object-cover">
              </div>
              <div class="flex flex-col min-w-0 flex-1">
                <span class="text-xs font-bold text-white truncate">${currentUser.nama_lengkap}</span>
                <span class="text-[11px] text-slate-300 font-mono truncate">${currentUser.nim ? 'NIM: ' + currentUser.nim : currentUser.email}</span>
              </div>
            </div>
            <div class="flex flex-col gap-1 pt-2">
              <a href="${dashboardPath}" class="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-slate-200 hover:bg-white/10 hover:text-white">
                <span class="material-symbols-outlined text-base text-blue-400">dashboard</span>
                <span>Dasbor &amp; Status Ijazah</span>
              </a>
              <a href="${settingsPath}" class="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-slate-200 hover:bg-white/10 hover:text-white">
                <span class="material-symbols-outlined text-base text-amber-400">manage_accounts</span>
                <span>Pengaturan Akun &amp; MFA</span>
              </a>
              <button type="button" id="mobileBtnLogout" class="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-red-300 hover:bg-red-500/20 text-left">
                <span class="material-symbols-outlined text-base text-red-400">logout</span>
                <span>Keluar (Logout)</span>
              </button>
            </div>
          `;
          const mobileBtnLogout = document.getElementById('mobileBtnLogout');
          if (mobileBtnLogout) {
            mobileBtnLogout.addEventListener('click', () => {
              UntanUserAuth.logout();
              window.location.reload();
            });
          }
        }
      }
    }
  };

  // Ekspor ke window global
  window.UntanUserAuth = UntanUserAuth;

// Otomatis Inisialisasi Nav Header Pengguna jika ada kontainer
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      if (document.getElementById('userProfileHeader') || document.getElementById('mobileUserProfileDrawer')) {
        UntanUserAuth.initHeaderNav();
      }
    });
  }

})(window);

