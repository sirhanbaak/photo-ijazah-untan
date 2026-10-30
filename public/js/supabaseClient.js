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

  // 6. Unggah Berkas ke Supabase Storage (Bucket: dokumen-ijazah)
  async uploadFile(file, subfolder = 'pas-foto') {
    const client = this.getClient();
    if (!client) {
      return { url: null, error: new Error('Supabase client belum siap') };
    }

    try {
      const config = this.getConfig();
      const ext = file.name.split('.').pop();
      const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
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

      // Unggah foto jika berkas disertakan
      if (files.foto && files.foto instanceof File) {
        const uploadRes = await this.uploadFile(files.foto, 'pas-foto');
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
        current_step: 1,
        total_steps: 6,
        loket_pengambilan: loketPengambilan,
        catatan_petugas: 'Permohonan baru berhasil dikirim dan masuk dalam antrean verifikasi berkas daring BAK Untan.'
      };

      // Insert ke tabel pengajuan_ijazah
      const { data: insertedData, error: insertError } = await client
        .from('pengajuan_ijazah')
        .insert([payload])
        .select()
        .single();

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
