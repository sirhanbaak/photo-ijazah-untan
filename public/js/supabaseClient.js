/**
 * Supabase Client & Service Helper
 * Portal Layanan Penerbitan Ijazah - Universitas Tanjungpura
 */

// Konfigurasi Default (Ganti dengan kredensial project Supabase Anda)
const DEFAULT_SUPABASE_CONFIG = {
  url: 'https://kfspavyphfteuowfqrau.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtmc3BhdnlwaGZ0ZXVvd2ZxcmF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyOTUwODMsImV4cCI6MjEwODg3MTA4M30.SMupKHMo8pUZUG7fIQrVo8kMWTI6ED5pGPEV5UWmPGY',
  storageBucket: 'dokumen-ijazah'
};

// Objek namespace global
window.UntanSupabase = {
  config: { ...DEFAULT_SUPABASE_CONFIG },
  client: null,

  // 1. Memeriksa & Mengambil Konfigurasi
  getConfig() {
    const savedUrl = localStorage.getItem('UNTAN_SUPABASE_URL');
    const savedKey = localStorage.getItem('UNTAN_SUPABASE_ANON_KEY');

    const url = (savedUrl && savedUrl.trim()) ? savedUrl.trim() : this.config.url;
    const anonKey = (savedKey && savedKey.trim()) ? savedKey.trim() : this.config.anonKey;

    const isConfigured = Boolean(
      url &&
      !url.includes('YOUR_PROJECT_ID') &&
      anonKey &&
      !anonKey.includes('YOUR_SUPABASE_ANON_KEY')
    );

    return {
      url,
      anonKey,
      storageBucket: this.config.storageBucket,
      isConfigured
    };
  },

  // 2. Simpan Kredensial Baru ke LocalStorage
  saveConfig(url, anonKey) {
    if (url && url.trim()) {
      localStorage.setItem('UNTAN_SUPABASE_URL', url.trim());
    }
    if (anonKey && anonKey.trim()) {
      localStorage.setItem('UNTAN_SUPABASE_ANON_KEY', anonKey.trim());
    }
    this.client = null; // Reset client agar diinisialisasi ulang
    return this.getConfig();
  },

  // 3. Reset Konfigurasi ke Default
  resetConfig() {
    localStorage.removeItem('UNTAN_SUPABASE_URL');
    localStorage.removeItem('UNTAN_SUPABASE_ANON_KEY');
    this.client = null;
    return this.getConfig();
  },

  // 4. Inisialisasi Supabase Client
  getClient() {
    if (typeof window.supabase === 'undefined') {
      console.warn('SDK @supabase/supabase-js belum termuat di peramban.');
      return null;
    }

    const currentConfig = this.getConfig();
    if (!currentConfig.isConfigured) {
      console.warn('Supabase belum dikonfigurasi dengan URL & Anon Key yang valid.');
      return null;
    }

    if (!this.client || this.client._savedUrl !== currentConfig.url) {
      try {
        this.client = window.supabase.createClient(currentConfig.url, currentConfig.anonKey);
        this.client._savedUrl = currentConfig.url;
      } catch (err) {
        console.error('Kesalahan saat membuat client Supabase:', err);
        return null;
      }
    }

    return this.client;
  },

  // 5. Generate Nomor Tiket Otomatis
  generateTicketNumber() {
    const year = new Date().getFullYear();
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    return `UNTAN-IJZ-${year}-${randomNum}`;
  },

  // 5a. Nilai Resmi dan Helper Status Ijazah
  STATUS_IJAZAH: {
    PENGAJUAN: 'Pengajuan',
    PROSES_CETAK: 'Proses Cetak',
    FINAL: 'Final',
    DITOLAK: 'Ditolak',
    DIBATALKAN: 'Dibatalkan'
  },

  // RULE UTAMA: Update data hanya dapat dilakukan, termasuk upload berkas dan pas photo jika status_ijazah=Pengajuan
  canUpdatePengajuan(statusIjazah) {
    if (!statusIjazah) return true; // Default ke Pengajuan bila belum di-set
    return String(statusIjazah).trim() === 'Pengajuan';
  },

  // Memvalidasi apakah nilai status_ijazah sesuai enum yang sah
  isValidStatusIjazah(status) {
    if (!status) return false;
    const allowed = ['Pengajuan', 'Proses Cetak', 'Final', 'Ditolak', 'Dibatalkan'];
    return allowed.includes(String(status).trim());
  },

  // 5b. Validasi Dimensi dan Rasio Pas Foto Hasil Crop (Standar 4x6 Untan)
  async validateCropDimensions(file) {
    return new Promise((resolve) => {
      if (!file || !(file instanceof Blob)) {
        return resolve({
          valid: false,
          width: 0,
          height: 0,
          ratio: 0,
          reason: 'Berkas foto tidak valid atau kosong.'
        });
      }

      // Pastikan tipe mime adalah gambar (JPEG, PNG, WebP)
      if (file.type && !file.type.startsWith('image/')) {
        return resolve({
          valid: false,
          width: 0,
          height: 0,
          ratio: 0,
          reason: 'Format berkas bukan citra/gambar yang didukung.'
        });
      }

      const img = new Image();
      let objectUrl = '';
      try {
        objectUrl = URL.createObjectURL(file);
      } catch (e) {
        return resolve({ valid: false, width: 0, height: 0, ratio: 0, reason: 'Gagal membuat URL objek dari berkas.' });
      }

      img.onload = () => {
        try { URL.revokeObjectURL(objectUrl); } catch (_) {}
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;

        // 1. Orientasi harus portrait (tegak), tolak landscape dan square
        if (h <= w) {
          return resolve({
            valid: false,
            width: w,
            height: h,
            ratio: Number((w / (h || 1)).toFixed(4)),
            reason: `Orientasi foto harus portrait (tegak). Ukuran saat ini ${w}×${h} px (bukan format pas foto 4x6).`
          });
        }

        // 2. Batas resolusi minimal pas foto ijazah
        if (w < 100 || h < 140) {
          return resolve({
            valid: false,
            width: w,
            height: h,
            ratio: Number((w / h).toFixed(4)),
            reason: `Dimensi citra terlalu kecil (${w}×${h} px). Standar ijazah minimal 300×440 px (rekomendasi 450×660 px pada 300 DPI).`
          });
        }

        // 3. Validasi rasio aspek pas foto 4:6 (ideal: 4/6 = 0.6667 s.d. 450/660 = 0.6818)
        // Toleransi rasio yang diizinkan: 0.64 s.d. 0.71
        const ratio = w / h;
        const isRatioAcceptable = ratio >= 0.64 && ratio <= 0.71;

        if (!isRatioAcceptable) {
          return resolve({
            valid: false,
            width: w,
            height: h,
            ratio: Number(ratio.toFixed(4)),
            reason: `Rasio aspek (${ratio.toFixed(2)}) tidak sesuai dengan proporsi pas foto 4:6 (0.67 - 0.68). Silakan potong foto Anda menggunakan modul pemotong foto 4x6.`
          });
        }

        // Cek apakah persis sesuai preset standar cetak Untan
        const isExactStandardPreset = (w === 450 && h === 660) || (w === 600 && h === 880) || (w === 472 && h === 709);

        return resolve({
          valid: true,
          width: w,
          height: h,
          ratio: Number(ratio.toFixed(4)),
          isExactPreset: isExactStandardPreset,
          reason: 'Dimensi dan rasio aspek terverifikasi sesuai standar crop pas foto 4x6 Untan.'
        });
      };

      img.onerror = () => {
        try { URL.revokeObjectURL(objectUrl); } catch (_) {}
        return resolve({
          valid: false,
          width: 0,
          height: 0,
          ratio: 0,
          reason: 'Citra gambar rusak atau format tidak dapat didekode.'
        });
      };

      img.src = objectUrl;
    });
  },

  // 6. Unggah Berkas ke Supabase Storage (Bucket: dokumen-ijazah)
  // Menolak berkas dan pas foto jika status_ijazah !== 'Pengajuan'
  // Serta menolak secara ketat foto pas foto yang tidak sesuai dimensi & rasio hasil crop
  async uploadFile(file, subfolder = 'pas-foto', options = {}) {
    const client = this.getClient();
    if (!client) {
      return { url: null, error: new Error('Supabase client belum siap') };
    }

    try {
      // RULE UTAMA: Upload berkas dan pas foto hanya dapat dilakukan jika status_ijazah = 'Pengajuan'
      if (options.statusIjazah && !this.canUpdatePengajuan(options.statusIjazah)) {
        const errMsg = `Upload ditolak: Status ijazah saat ini adalah "${options.statusIjazah}". Upload berkas persyaratan dan pas foto hanya diizinkan jika status ijazah adalah "Pengajuan".`;
        console.warn(errMsg);
        return {
          url: null,
          rejected: true,
          blockedByStatus: true,
          status_ijazah: options.statusIjazah,
          error: new Error(errMsg)
        };
      }

      // Validasi ketat jika subfolder adalah pas-foto
      if (subfolder === 'pas-foto') {
        const val = await this.validateCropDimensions(file);
        if (!val.valid) {
          const errMsg = `Foto ditolak: Dimensi (${val.width || 0}×${val.height || 0} px, rasio ${val.ratio || 0}) tidak sesuai dengan hasil crop pas foto 4:6. ${val.reason} Berkas tidak disimpan ke bucket dokumen-ijazah.`;
          console.warn(errMsg);
          return {
            url: null,
            rejected: true,
            validation: val,
            error: new Error(errMsg)
          };
        }
      }

      const config = this.getConfig();
      const ext = file.name ? file.name.split('.').pop() : 'jpg';
      const cleanName = file.name ? file.name.replace(/[^a-zA-Z0-9._-]/g, '_') : `foto_4x6_${Date.now()}.${ext}`;
      const filePath = `${subfolder}/${Date.now()}_${cleanName}`;

      const { data, error } = await client.storage
        .from(config.storageBucket)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (error) {
        console.error('Gagal upload berkas ke Supabase Storage:', error);
        return { url: null, error };
      }

      // Dapatkan Public URL
      const { data: publicData } = client.storage
        .from(config.storageBucket)
        .getPublicUrl(filePath);

      return { url: publicData.publicUrl, error: null };
    } catch (err) {
      console.error('Exception upload file:', err);
      return { url: null, error: err };
    }
  },

  // 6b. Ekstraksi Path Relatif Objek di Bucket Storage dari URL
  extractStoragePath(fileUrl, bucketName = this.config.storageBucket) {
    if (!fileUrl || typeof fileUrl !== 'string') return null;
    const clean = fileUrl.trim();

    // Pola umum URL Supabase Storage: /storage/v1/object/public/<bucketName>/<filePath>
    const searchBucket = `/${bucketName}/`;
    const idx = clean.indexOf(searchBucket);
    if (idx !== -1) {
      const pathPart = clean.substring(idx + searchBucket.length);
      const cleanPath = pathPart.split('?')[0];
      return decodeURIComponent(cleanPath);
    }

    // Jika sudah berupa path relatif (misal: "pas-foto/173000_foto.jpg")
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      return clean.split('?')[0];
    }

    return null;
  },

  // 6c. Hapus Berkas dari Supabase Storage Secara Otomatis (Bucket: dokumen-ijazah)
  async deleteFile(fileUrlOrPath, bucketName = this.config.storageBucket) {
    const client = this.getClient();
    if (!client || !fileUrlOrPath) {
      return { success: false, skipped: true };
    }

    try {
      const relativePath = this.extractStoragePath(fileUrlOrPath, bucketName);
      if (!relativePath) {
        return { success: false, skipped: true, reason: 'Bukan berkas yang berasal dari bucket storage' };
      }

      const { data, error } = await client.storage
        .from(bucketName)
        .remove([relativePath]);

      if (error) {
        console.warn(`Gagal menghapus berkas lama (${relativePath}) dari bucket ${bucketName}:`, error);
        return { success: false, error, path: relativePath };
      }

      console.log(`✓ Berkas lama berhasil dihapus otomatis dari bucket ${bucketName}:`, relativePath);
      return { success: true, data, path: relativePath };
    } catch (err) {
      console.warn('Exception saat menghapus berkas lama:', err);
      return { success: false, error: err };
    }
  },

  // 7. Simpan Pengajuan Baru ke Database
  async submitPengajuan(formData, files = {}) {
    const client = this.getClient();
    if (!client) {
      return {
        success: false,
        error: new Error('Supabase belum dikonfigurasi. Silakan masukkan Project URL & Anon Key terlebih dahulu.')
      };
    }

    try {
      const ticketNumber = formData.nomor_tiket || this.generateTicketNumber();
      let fotoUrl = null;

      // Cek apakah permohonan dengan NIM atau Nomor Tiket ini sudah ada di database
      let existingRecord = null;
      if (formData.nomor_tiket) {
        const { data: recByTicket } = await client
          .from('pengajuan_ijazah')
          .select('id, nomor_tiket, nim, status_ijazah, service_type, foto_url, berkas_ktp_url, berkas_pendukung_url')
          .eq('nomor_tiket', formData.nomor_tiket)
          .limit(1);
        if (recByTicket && recByTicket.length > 0) existingRecord = recByTicket[0];
      }
      if (!existingRecord && formData.nim) {
        const { data: recByNim } = await client
          .from('pengajuan_ijazah')
          .select('id, nomor_tiket, nim, status_ijazah, service_type, foto_url, berkas_ktp_url, berkas_pendukung_url')
          .eq('nim', (formData.nim || '').trim().toUpperCase())
          .order('created_at', { ascending: false })
          .limit(1);
        if (recByNim && recByNim.length > 0) existingRecord = recByNim[0];
      }

      // RULE UNTUK SELURUH JENIS PENGAJUAN:
      // Jika data pengajuan sudah ada dan status_ijazah bukan 'Pengajuan', tolak pembaruan dan upload berkas/pas foto
      if (existingRecord) {
        const currentStatusIjazah = existingRecord.status_ijazah || 'Pengajuan';
        if (!this.canUpdatePengajuan(currentStatusIjazah)) {
          const blockMsg = `Pembaruan data ditolak: Permohonan untuk NIM ${existingRecord.nim || formData.nim} memiliki status ijazah "${currentStatusIjazah}". Pembaruan data, berkas dokumen, dan pas foto hanya dapat dilakukan jika status ijazah adalah "Pengajuan".`;
          console.warn(blockMsg);
          return {
            success: false,
            blocked: true,
            status_ijazah: currentStatusIjazah,
            error: new Error(blockMsg),
            message: blockMsg
          };
        }
      }

      // Unggah foto jika berkas disertakan (dengan validasi hasil crop 4:6 dan status ijazah)
      if (files.foto && (files.foto instanceof File || files.foto instanceof Blob)) {
        const uploadRes = await this.uploadFile(files.foto, 'pas-foto', {
          statusIjazah: existingRecord ? existingRecord.status_ijazah : 'Pengajuan'
        });
        if (uploadRes.error) {
          // Bila foto ditolak karena bukan hasil crop atau status ijazah terkunci, hentikan proses submit
          return {
            success: false,
            rejectedPhoto: uploadRes.rejected,
            blocked: uploadRes.blockedByStatus,
            error: uploadRes.error
          };
        }
        if (uploadRes.url) {
          fotoUrl = uploadRes.url;
        }
      }

      // Tentukan lokasi pengambilan fisik sesuai fakultas & tipe layanan
      let loketPengambilan = 'Loket 03 (Sub-bagian Ijazah & Legalisir) BAK Gedung Rektorat Untan';
      if (formData.service_type === 'penerbitan_baru') {
        loketPengambilan = `Subbagian Pendidikan & Akademik Fakultas (${formData.fakultas || 'Fakultas Asal'}) Untan`;
      }

      const payload = {
        nomor_tiket: ticketNumber,
        user_id: formData.user_id || null,
        service_type: formData.service_type || 'penerbitan_baru',
        nim: (formData.nim || '').trim().toUpperCase(),
        nik: (formData.nik || '').trim(),
        nama_lengkap: (formData.nama_lengkap || '').trim().toUpperCase(),
        tempat_lahir: (formData.tempat_lahir || '').trim(),
        tanggal_lahir: formData.tanggal_lahir,
        fakultas: formData.fakultas || 'FKIP',
        prodi: formData.prodi || 'Pendidikan Matematika',
        periode_yudisium: formData.periode_yudisium || '',
        ipk: formData.ipk || '',
        whatsapp: (formData.whatsapp || '').trim(),
        email: (formData.email || '').trim().toLowerCase(),
        foto_url: fotoUrl,
        berkas_ktp_url: formData.berkas_ktp_url || null,
        berkas_pendukung_url: formData.berkas_pendukung_url || null,
        status: 'menunggu_verifikasi',
        status_label: 'Tahap 1: Pengajuan Diterima & Verifikasi Berkas Awal',
        status_ijazah: 'Pengajuan',
        current_step: 1,
        total_steps: 6,
        loket_pengambilan: loketPengambilan,
        catatan_petugas: 'Permohonan baru berhasil dikirim dan masuk dalam antrean verifikasi berkas daring BAK Untan.'
      };

      // Khusus Pembaruan Data Pengajuan yang Sudah Ada (misal Penerbitan Baru dengan NIM yang sama)
      if (existingRecord) {
        const existId = existingRecord.id;
        const existTicket = existingRecord.nomor_tiket;

        const updatePayload = {
          nim: payload.nim,
          nama_lengkap: payload.nama_lengkap,
          tempat_lahir: payload.tempat_lahir,
          tanggal_lahir: payload.tanggal_lahir,
          nik: payload.nik,
          fakultas: payload.fakultas,
          prodi: payload.prodi,
          periode_yudisium: payload.periode_yudisium,
          whatsapp: payload.whatsapp,
          email: payload.email,
          updated_at: new Date().toISOString()
        };
        if (fotoUrl) updatePayload.foto_url = fotoUrl;
        if (formData.user_id) updatePayload.user_id = formData.user_id;

        let { data: updatedData, error: updateErr } = await client
          .from('pengajuan_ijazah')
          .update(updatePayload)
          .eq('id', existId)
          .select()
          .single();

        if (updateErr) {
          console.error('Gagal memperbarui pengajuan penerbitan baru:', updateErr);
          return { success: false, error: updateErr };
        }

        // Otomatis hapus berkas lama yang diganti dari bucket dokumen-ijazah
        if (fotoUrl && existingRecord.foto_url && existingRecord.foto_url !== fotoUrl) {
          await this.deleteFile(existingRecord.foto_url);
        }
        if (updatePayload.berkas_ktp_url && existingRecord.berkas_ktp_url && existingRecord.berkas_ktp_url !== updatePayload.berkas_ktp_url) {
          await this.deleteFile(existingRecord.berkas_ktp_url);
        }
        if (updatePayload.berkas_pendukung_url && existingRecord.berkas_pendukung_url && existingRecord.berkas_pendukung_url !== updatePayload.berkas_pendukung_url) {
          await this.deleteFile(existingRecord.berkas_pendukung_url);
        }

        // Catat riwayat pembaruan
        try {
          await client.from('riwayat_status').insert([{
            pengajuan_id: existId,
            step_number: 1,
            title: 'Pembaruan Data Permohonan Penerbitan Baru',
            description: 'Pembaruan data NIM, Nama Lengkap, Tempat Lahir, dan Tanggal Lahir berhasil disinkronkan.',
            actor: 'Pemohon (Pembaruan Mandiri)',
            status: 'completed'
          }]);
        } catch (logErr) {
          console.warn('Gagal mencatat log riwayat_status:', logErr);
        }

        return {
          success: true,
          isUpdated: true,
          data: updatedData,
          ticketNumber: existTicket
        };
      }

      // Insert pengajuan baru bila belum pernah ada
      let { data: insertedData, error: insertError } = await client
        .from('pengajuan_ijazah')
        .insert([payload])
        .select()
        .single();

      // Toleransi jika remote database belum menambahkan kolom status_ijazah
      if (insertError && insertError.code === '42703' && payload.status_ijazah) {
        delete payload.status_ijazah;
        const retryRes = await client
          .from('pengajuan_ijazah')
          .insert([payload])
          .select()
          .single();
        insertedData = retryRes.data;
        insertError = retryRes.error;
      }

      if (insertError) {
        console.error('Gagal menyimpan pengajuan ke Supabase:', insertError);
        return { success: false, error: insertError };
      }

      // Tambahkan entri riwayat awal ke tabel riwayat_status
      if (insertedData && insertedData.id) {
        await client.from('riwayat_status').insert([
          {
            pengajuan_id: insertedData.id,
            step_number: 1,
            title: 'Tahap 1: Pengajuan Diterima & Verifikasi Berkas Awal',
            description: 'Permohonan berhasil dikirim oleh pemohon secara daring dan telah teregistrasi di database pusat Untan.',
            actor: 'Sistem Registrasi Online Untan',
            status: 'completed'
          },
          {
            pengajuan_id: insertedData.id,
            step_number: 2,
            title: 'Tahap 2: Validasi Dokumen Akademik & Sinkronisasi PDDikti BAAK',
            description: 'Menunggu jadwal antrean verifikator akademik BAAK untuk pencocokan berkas dengan pangkalan data Dikti.',
            actor: 'BAAK Universitas Tanjungpura',
            status: 'in_progress'
          }
        ]);
      }

      return {
        success: true,
        data: insertedData,
        ticketNumber: ticketNumber
      };
    } catch (err) {
      console.error('Exception saat submit pengajuan:', err);
      return { success: false, error: err };
    }
  },

  // 7b. Fitur Pembaruan Khusus: Update Data Nim, Nama Lengkap, Tempat Lahir dan Tanggal Lahir
  // Serta unggah berkas dan pas photo jika status_ijazah = 'Pengajuan'
  async updateDataMahasiswa(identifier, updatedData = {}, files = {}) {
    const client = this.getClient();
    if (!client) {
      return { success: false, error: new Error('Supabase client belum siap') };
    }

    try {
      const cleanId = (identifier || '').trim();
      if (!cleanId) {
        return { success: false, error: new Error('NIM atau Nomor Tiket wajib diisi.') };
      }

      // 1. Temukan pengajuan yang ada
      const { data: records, error: searchErr } = await client
        .from('pengajuan_ijazah')
        .select('*')
        .or(`nim.ilike.${cleanId},nomor_tiket.ilike.${cleanId}`)
        .order('created_at', { ascending: false })
        .limit(1);

      if (searchErr) throw searchErr;

      if (!records || records.length === 0) {
        return {
          success: false,
          notFound: true,
          message: `Data mahasiswa dengan NIM/Tiket "${cleanId}" tidak ditemukan.`
        };
      }

      const existing = records[0];
      const statusIjazah = existing.status_ijazah || 'Pengajuan';

      // Simpan URL berkas lama untuk pembersihan otomatis jika diganti
      const oldFotoUrl = existing.foto_url || null;
      const oldBerkasKtpUrl = existing.berkas_ktp_url || null;
      const oldBerkasPendukungUrl = existing.berkas_pendukung_url || null;

      // RULE UTAMA UNTUK SELURUH JENIS PENGAJUAN:
      // Update data hanya dapat dilakukan, termasuk upload berkas dan pas photo jika status_ijazah=Pengajuan
      if (!this.canUpdatePengajuan(statusIjazah)) {
        const blockMsg = `Pembaruan data ditolak: Status ijazah saat ini adalah "${statusIjazah}". Seluruh pembaruan data identitas, berkas persyaratan, dan pas foto hanya dapat dilakukan jika status ijazah berstatus "Pengajuan".`;
        console.warn(blockMsg);
        return {
          success: false,
          blocked: true,
          status_ijazah: statusIjazah,
          error: new Error(blockMsg),
          message: blockMsg
        };
      }

      let fotoUrl = updatedData.foto_url || existing.foto_url || null;

      // 2. Upload pas foto jika disertakan di parameter files
      if (files && files.foto && (files.foto instanceof File || files.foto instanceof Blob)) {
        const uploadRes = await this.uploadFile(files.foto, 'pas-foto', { statusIjazah });
        if (uploadRes.error) {
          return {
            success: false,
            rejectedPhoto: uploadRes.rejected,
            blocked: uploadRes.blockedByStatus,
            error: uploadRes.error
          };
        }
        if (uploadRes.url) {
          fotoUrl = uploadRes.url;
        }
      }

      // 3. Upload berkas tambahan jika disertakan
      let berkasKtpUrl = updatedData.berkas_ktp_url || existing.berkas_ktp_url || null;
      if (files && files.berkas_ktp && (files.berkas_ktp instanceof File || files.berkas_ktp instanceof Blob)) {
        const uploadKtp = await this.uploadFile(files.berkas_ktp, 'berkas-ktp', { statusIjazah });
        if (uploadKtp.url) berkasKtpUrl = uploadKtp.url;
      }

      let berkasPendukungUrl = updatedData.berkas_pendukung_url || existing.berkas_pendukung_url || null;
      if (files && files.berkas_pendukung && (files.berkas_pendukung instanceof File || files.berkas_pendukung instanceof Blob)) {
        const uploadPendukung = await this.uploadFile(files.berkas_pendukung, 'berkas-pendukung', { statusIjazah });
        if (uploadPendukung.url) berkasPendukungUrl = uploadPendukung.url;
      }

      const updatePayload = {
        updated_at: new Date().toISOString()
      };

      // 4 Kolom pokok yang diperbarui sesuai instruksi pengguna:
      if (updatedData.nim) updatePayload.nim = updatedData.nim.trim().toUpperCase();
      if (updatedData.nama_lengkap) updatePayload.nama_lengkap = updatedData.nama_lengkap.trim().toUpperCase();
      if (updatedData.tempat_lahir) updatePayload.tempat_lahir = updatedData.tempat_lahir.trim();
      if (updatedData.tanggal_lahir) updatePayload.tanggal_lahir = updatedData.tanggal_lahir;

      // Kolom opsional lain
      if (updatedData.nik) updatePayload.nik = updatedData.nik.trim();
      if (updatedData.fakultas) updatePayload.fakultas = updatedData.fakultas;
      if (updatedData.prodi) updatePayload.prodi = updatedData.prodi;
      if (updatedData.whatsapp) updatePayload.whatsapp = updatedData.whatsapp.trim();
      if (updatedData.email) updatePayload.email = updatedData.email.trim().toLowerCase();
      if (fotoUrl) updatePayload.foto_url = fotoUrl;
      if (berkasKtpUrl) updatePayload.berkas_ktp_url = berkasKtpUrl;
      if (berkasPendukungUrl) updatePayload.berkas_pendukung_url = berkasPendukungUrl;

      // Izinkan pembaruan status_ijazah jika diinstruksikan secara eksplisit dan valid
      if (updatedData.status_ijazah && this.isValidStatusIjazah(updatedData.status_ijazah)) {
        updatePayload.status_ijazah = updatedData.status_ijazah;
      }

      let { data: updatedRecord, error: updateErr } = await client
        .from('pengajuan_ijazah')
        .update(updatePayload)
        .eq('id', existing.id)
        .select()
        .single();

      // Toleransi jika kolom status_ijazah belum dieksekusi di database Supabase remote
      if (updateErr && updateErr.code === '42703' && updatePayload.status_ijazah) {
        delete updatePayload.status_ijazah;
        const retryRes = await client
          .from('pengajuan_ijazah')
          .update(updatePayload)
          .eq('id', existing.id)
          .select()
          .single();
        updatedRecord = retryRes.data;
        updateErr = retryRes.error;
      }

      if (updateErr) throw updateErr;

      // Otomatis hapus berkas lama yang diganti dari bucket dokumen-ijazah
      if (updatePayload.foto_url && oldFotoUrl && oldFotoUrl !== updatePayload.foto_url) {
        await this.deleteFile(oldFotoUrl);
      }
      if (updatePayload.berkas_ktp_url && oldBerkasKtpUrl && oldBerkasKtpUrl !== updatePayload.berkas_ktp_url) {
        await this.deleteFile(oldBerkasKtpUrl);
      }
      if (updatePayload.berkas_pendukung_url && oldBerkasPendukungUrl && oldBerkasPendukungUrl !== updatePayload.berkas_pendukung_url) {
        await this.deleteFile(oldBerkasPendukungUrl);
      }

      // Catat entri riwayat pembaruan status
      try {
        await client.from('riwayat_status').insert([{
          pengajuan_id: existing.id,
          step_number: existing.current_step || 1,
          title: 'Pembaruan Data Identitas Mahasiswa',
          description: `Pembaruan data Nim (${updatePayload.nim || existing.nim}), Nama Lengkap (${updatePayload.nama_lengkap || existing.nama_lengkap}), Tempat Lahir (${updatePayload.tempat_lahir || existing.tempat_lahir}), dan Tanggal Lahir (${updatePayload.tanggal_lahir || existing.tanggal_lahir}) berhasil disimpan.`,
          actor: 'Mahasiswa / Pemohon',
          status: 'completed'
        }]);
      } catch (logErr) {
        console.warn('Gagal mencatat log riwayat_status:', logErr);
      }

      return {
        success: true,
        data: updatedRecord,
        ticketNumber: existing.nomor_tiket
      };
    } catch (err) {
      console.error('Exception updateDataMahasiswa:', err);
      return { success: false, error: err };
    }
  },

  // 8. Lacak Status Pengajuan Berdasarkan Nomor Tiket atau NIM
  async getPengajuan(query) {
    const client = this.getClient();
    if (!client) {
      return {
        success: false,
        error: new Error('Supabase belum dikonfigurasi. Periksa kredensial project Anda.')
      };
    }

    try {
      const cleanQuery = (query || '').trim();
      if (!cleanQuery) {
        return { success: false, error: new Error('Nomor tiket atau NIM tidak boleh kosong.') };
      }

      // Cari di tabel pengajuan_ijazah
      const { data, error } = await client
        .from('pengajuan_ijazah')
        .select('*')
        .or(`nomor_tiket.ilike.%${cleanQuery}%,nim.ilike.%${cleanQuery}%`)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Gagal mengambil data pengajuan:', error);
        return { success: false, error };
      }

      if (!data || data.length === 0) {
        return {
          success: false,
          notFound: true,
          message: `Data permohonan dengan kata kunci "${cleanQuery}" tidak ditemukan.`
        };
      }

      const pengajuan = data[0];

      // Ambil linimasa riwayat status
      const { data: riwayatData, error: riwayatError } = await client
        .from('riwayat_status')
        .select('*')
        .eq('pengajuan_id', pengajuan.id)
        .order('step_number', { ascending: true });

      return {
        success: true,
        data: pengajuan,
        riwayat: riwayatData || []
      };
    } catch (err) {
      console.error('Exception lacak pengajuan:', err);
      return { success: false, error: err };
    }
  },

  // 9. Komponen Modal Konfigurasi Supabase (Bantuan Interaktif di Web)
  renderConfigModal() {
    const existing = document.getElementById('supabaseConfigModal');
    if (existing) {
      existing.classList.remove('hidden');
      existing.classList.add('flex');
      return;
    }

    const currentConfig = this.getConfig();

    const modalHtml = `
      <div id="supabaseConfigModal" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div class="bg-surface-container-lowest rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden p-6 flex flex-col gap-4 text-on-surface">
          <div class="flex items-center justify-between pb-3 border-b border-surface-container-high">
            <div class="flex items-center gap-2.5">
              <div class="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                <span class="material-symbols-outlined text-[24px]">database</span>
              </div>
              <div>
                <h3 class="font-title-lg text-primary font-bold">Koneksi Supabase</h3>
                <p class="text-xs text-on-surface-variant">Konfigurasi Database &amp; Penyimpanan Dokumen</p>
              </div>
            </div>
            <button onclick="UntanSupabase.closeConfigModal()" class="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant">
              <span class="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          <div class="text-xs text-on-surface-variant bg-surface-container-low p-3.5 rounded-lg border border-surface-container leading-relaxed">
            Dapatkan URL dan Anon Key dari Dashboard Supabase Anda:
            <br><strong>Project Settings &gt; API &gt; Project URL &amp; anon / public key</strong>.
          </div>

          <div class="flex flex-col gap-3">
            <div>
              <label class="block text-xs font-semibold text-primary mb-1">Project URL Supabase</label>
              <input id="sbInputUrl" type="url" placeholder="https://xyzcompany.supabase.co" 
                value="${currentConfig.url.includes('YOUR_PROJECT_ID') ? '' : currentConfig.url}"
                class="w-full h-10 px-3 text-sm bg-surface-container-low rounded-lg border border-outline-variant/50 focus:outline-none focus:ring-2 focus:ring-primary text-on-surface">
            </div>

            <div>
              <label class="block text-xs font-semibold text-primary mb-1">Anon / Public API Key</label>
              <input id="sbInputKey" type="password" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..." 
                value="${currentConfig.anonKey.includes('YOUR_SUPABASE_ANON_KEY') ? '' : currentConfig.anonKey}"
                class="w-full h-10 px-3 text-sm bg-surface-container-low rounded-lg border border-outline-variant/50 focus:outline-none focus:ring-2 focus:ring-primary text-on-surface">
            </div>
          </div>

          <div id="sbStatusMsg" class="text-xs py-1.5 px-2.5 rounded-lg hidden font-medium"></div>

          <div class="flex items-center justify-between pt-2">
            <button onclick="UntanSupabase.handleResetConfig()" class="text-xs text-red-600 hover:underline">
              Reset ke Default
            </button>
            <div class="flex items-center gap-2">
              <button onclick="UntanSupabase.closeConfigModal()" class="px-4 py-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-xs font-semibold">
                Batal
              </button>
              <button onclick="UntanSupabase.handleSaveConfig()" class="px-5 py-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-xs font-semibold shadow-md flex items-center gap-1.5">
                <span class="material-symbols-outlined text-[16px]">save</span>
                <span>Simpan Kredensial</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
  },

  closeConfigModal() {
    const modal = document.getElementById('supabaseConfigModal');
    if (modal) modal.classList.add('hidden');
  },

  handleSaveConfig() {
    const url = document.getElementById('sbInputUrl').value.trim();
    const key = document.getElementById('sbInputKey').value.trim();
    const statusMsg = document.getElementById('sbStatusMsg');

    if (!url || !key) {
      statusMsg.className = 'text-xs py-1.5 px-2.5 rounded-lg bg-red-100 text-red-800 block';
      statusMsg.textContent = 'Mohon isi kedua kolom URL dan Anon Key.';
      return;
    }

    this.saveConfig(url, key);
    statusMsg.className = 'text-xs py-1.5 px-2.5 rounded-lg bg-emerald-100 text-emerald-800 block';
    statusMsg.textContent = 'Koneksi Supabase berhasil disimpan! Memuat ulang halaman...';

    setTimeout(() => {
      this.closeConfigModal();
      window.location.reload();
    }, 900);
  },

  handleResetConfig() {
    this.resetConfig();
    const statusMsg = document.getElementById('sbStatusMsg');
    statusMsg.className = 'text-xs py-1.5 px-2.5 rounded-lg bg-amber-100 text-amber-800 block';
    statusMsg.textContent = 'Konfigurasi telah direset.';
    setTimeout(() => {
      this.closeConfigModal();
      window.location.reload();
    }, 700);
  }
};
