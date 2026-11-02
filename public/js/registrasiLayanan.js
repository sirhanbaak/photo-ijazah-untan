/**
 * Modul Manajemen Registrasi Layanan
 * Portal Layanan Penerbitan Ijazah - Universitas Tanjungpura
 *
 * Bertanggung jawab atas:
 * 1. Master layanan & persyaratan.
 * 2. Daftar, detail, pembuatan, dan pembatalan registrasi layanan.
 * 3. Perubahan status, verifikasi dokumen, dan catatan petugas.
 * 4. Sinkronisasi data pengajuan_ijazah lama ke registrasi_layanan.
 * 5. Statistik dan ekspor CSV untuk panel manajemen.
 */

(function (global) {
  'use strict';

  const STATUS = Object.freeze({
    DRAFT: 'draft',
    MENUNGGU_VERIFIKASI: 'menunggu_verifikasi',
    DIVERIFIKASI: 'diverifikasi',
    DIPROSES: 'diproses',
    SIAP_DIAMBIL: 'siap_diambil',
    SELESAI: 'selesai',
    DITOLAK: 'ditolak',
    DIBATALKAN: 'dibatalkan'
  });

  const STATUS_META = Object.freeze({
    draft: {
      label: 'Draf',
      icon: 'edit_note',
      badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
      step: 0
    },
    menunggu_verifikasi: {
      label: 'Menunggu Verifikasi',
      icon: 'hourglass_top',
      badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
      step: 1
    },
    diverifikasi: {
      label: 'Terverifikasi',
      icon: 'fact_check',
      badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      step: 2
    },
    diproses: {
      label: 'Diproses',
      icon: 'sync',
      badgeClass: 'bg-blue-100 text-blue-900 border-blue-300',
      step: 3
    },
    siap_diambil: {
      label: 'Siap Diambil',
      icon: 'inventory_2',
      badgeClass: 'bg-indigo-100 text-indigo-900 border-indigo-300',
      step: 4
    },
    selesai: {
      label: 'Selesai',
      icon: 'task_alt',
      badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-400',
      step: 5
    },
    ditolak: {
      label: 'Ditolak',
      icon: 'cancel',
      badgeClass: 'bg-red-100 text-red-800 border-red-300',
      step: 5
    },
    dibatalkan: {
      label: 'Dibatalkan',
      icon: 'block',
      badgeClass: 'bg-slate-200 text-slate-700 border-slate-400',
      step: 5
    }
  });

  const STATUS_TO_IJAZAH = Object.freeze({
    draft: 'Pengajuan',
    menunggu_verifikasi: 'Pengajuan',
    diverifikasi: 'Pengajuan',
    diproses: 'Proses Cetak',
    siap_diambil: 'Proses Cetak',
    selesai: 'Final',
    ditolak: 'Ditolak',
    dibatalkan: 'Dibatalkan'
  });

  const IJAZAH_TO_STATUS = Object.freeze({
    Pengajuan: 'menunggu_verifikasi',
    'Proses Cetak': 'diproses',
    Final: 'selesai',
    Ditolak: 'ditolak',
    Dibatalkan: 'dibatalkan'
  });

  const FINAL_STATUSES = ['selesai', 'ditolak', 'dibatalkan'];
  const CANCELLABLE_STATUSES = ['draft', 'menunggu_verifikasi', 'diverifikasi', 'diproses'];

  const DEFAULT_LAYANAN = Object.freeze([
    {
      kode: 'penerbitan_baru',
      nama: 'Penerbitan Ijazah Baru',
      kategori: 'akademik',
      estimasi_hari: 14,
      loket: 'Subbagian Pendidikan & Akademik Fakultas'
    },
    {
      kode: 'perbaikan_data',
      nama: 'Penerbitan Perbaikan Data',
      kategori: 'akademik',
      estimasi_hari: 21,
      loket: 'Loket 03 BAK Gedung Rektorat Untan'
    },
    {
      kode: 'penerbitan_ulang',
      nama: 'Penerbitan Ulang',
      kategori: 'akademik',
      estimasi_hari: 30,
      loket: 'Loket 03 BAK Gedung Rektorat Untan'
    },
    {
      kode: 'pencetakan_ulang',
      nama: 'Pencetakan Ulang',
      kategori: 'legalisasi',
      estimasi_hari: 7,
      loket: 'Loket 03 BAK Gedung Rektorat Untan'
    },
    {
      kode: 'ijazah_tte',
      nama: 'Ijazah TTE (Tanda Tangan Elektronik)',
      kategori: 'digital',
      estimasi_hari: 5,
      loket: 'Layanan Digital BAK Untan'
    }
  ]);

  let cachedLayanan = null;
  let cachedLayananAt = 0;
  const LAYANAN_CACHE_MS = 60 * 1000;

  function getClient() {
    if (!global.UntanSupabase || typeof global.UntanSupabase.getClient !== 'function') {
      return null;
    }
    return global.UntanSupabase.getClient();
  }

  function isMissingTable(error) {
    if (!error) return false;
    const code = String(error.code || '');
    const message = String(error.message || '').toLowerCase();
    return (
      code === '42P01' ||
      code === 'PGRST205' ||
      message.includes('could not find the table') ||
      message.includes('schema cache') ||
      message.includes('does not exist') ||
      (message.includes('relation') && message.includes('not found'))
    );
  }

  function normalizeStatus(status) {
    const value = String(status || '').trim().toLowerCase();
    if (STATUS_META[value]) return value;
    if (IJAZAH_TO_STATUS[status]) return IJAZAH_TO_STATUS[status];
    return STATUS.MENUNGGU_VERIFIKASI;
  }

  function statusToIjazah(status) {
    return STATUS_TO_IJAZAH[normalizeStatus(status)] || 'Pengajuan';
  }

  function ijazahToStatus(statusIjazah) {
    return IJAZAH_TO_STATUS[statusIjazah] || STATUS.MENUNGGU_VERIFIKASI;
  }

  function getStatusMeta(status) {
    return STATUS_META[normalizeStatus(status)];
  }

  function isFinalStatus(status) {
    return FINAL_STATUSES.indexOf(normalizeStatus(status)) !== -1;
  }

  function canCancel(status) {
    return CANCELLABLE_STATUSES.indexOf(normalizeStatus(status)) !== -1;
  }

  function getLayananName(kode) {
    const found = DEFAULT_LAYANAN.find(function (item) {
      return item.kode === kode;
    });
    return found ? found.nama : (kode || 'Layanan Ijazah');
  }

  function safeSearchTerm(value) {
    return String(value || '')
      .replace(/[%,()*]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function formatDate(value, withTime) {
    if (!value) return '-';
    const date = new Date(value);
    if (isNaN(date.getTime())) return String(value);
    const options = {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Jakarta'
    };
    if (withTime) {
      options.hour = '2-digit';
      options.minute = '2-digit';
    }
    return new Intl.DateTimeFormat('id-ID', options).format(date);
  }

  function formatDateTime(value) {
    return formatDate(value, true);
  }

  async function resolveUser(pengajuan, user) {
    if (user && user.id) return user;
    const client = getClient();
    if (!client || !pengajuan) return null;
    const byNim = (pengajuan.nim || '').trim();
    const byEmail = (pengajuan.email || '').trim().toLowerCase();
    if (!byNim && !byEmail) return null;
    try {
      let query = client.from('users').select('id, nim, email, nama_lengkap, role');
      query = byNim ? query.eq('nim', byNim) : query.eq('email', byEmail);
      const result = await query.limit(1);
      if (!result.error && result.data && result.data.length > 0) {
        return result.data[0];
      }
    } catch (_) {}
    return null;
  }

  async function getLayananMap(forceRefresh) {
    const now = Date.now();
    if (!forceRefresh && cachedLayanan && (now - cachedLayananAt) < LAYANAN_CACHE_MS) {
      return cachedLayanan;
    }

    const client = getClient();
    if (!client) {
      cachedLayanan = DEFAULT_LAYANAN.slice();
      cachedLayananAt = now;
      return cachedLayanan;
    }

    try {
      const result = await client
        .from('layanan')
        .select('*')
        .order('urutan', { ascending: true });

      cachedLayanan = (!result.error && Array.isArray(result.data) && result.data.length > 0)
        ? result.data
        : DEFAULT_LAYANAN.slice();
    } catch (_) {
      cachedLayanan = DEFAULT_LAYANAN.slice();
    }

    cachedLayananAt = now;
    return cachedLayanan;
  }

  function attachLayanan(rows, layananList) {
    const byId = {};
    const byKode = {};
    (layananList || []).forEach(function (item) {
      byId[item.id] = item;
      byKode[item.kode] = item;
    });

    return (rows || []).map(function (row) {
      const layanan = row.layanan_id ? byId[row.layanan_id] : null;
      const kode = (layanan && layanan.kode) || row.service_type || row.layanan_kode || '';
      return Object.assign({}, row, {
        layanan: layanan || byKode[kode] || {
          kode: kode,
          nama: getLayananName(kode)
        },
        layanan_nama: (layanan && layanan.nama) || getLayananName(kode)
      });
    });
  }


  async function listLayanan(forceRefresh) {
    const layanan = await getLayananMap(forceRefresh);
    return {
      success: true,
      data: layanan.filter(function (item) { return item.is_active !== false; })
    };
  }

  async function listPersyaratan(layananId) {
    const client = getClient();
    if (!client || !layananId) return { success: false, data: [] };
    try {
      const result = await client
        .from('layanan_persyaratan')
        .select('*')
        .eq('layanan_id', layananId)
        .order('urutan', { ascending: true });
      return {
        success: !result.error,
        data: result.data || [],
        error: result.error || null
      };
    } catch (err) {
      return { success: false, data: [], error: err };
    }
  }

  function mapPengajuanToRegistrasi(row) {
    return {
      id: row.id,
      registrasi_id: null,
      pengajuan_id: row.id,
      nomor_registrasi: row.nomor_tiket,
      nama_pemohon: row.nama_lengkap,
      nim: row.nim,
      email: row.email,
      whatsapp: row.whatsapp,
      status: ijazahToStatus(row.status_ijazah),
      prioritas: row.prioritas || 'normal',
      sumber: 'online',
      data_pemohon: row,
      catatan_pemohon: null,
      catatan_petugas: row.catatan_petugas || null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      status_ijazah: row.status_ijazah,
      is_fallback: true,
      layanan: {
        kode: row.service_type,
        nama: getLayananName(row.service_type)
      },
      layanan_nama: getLayananName(row.service_type),
      jumlah_dokumen: [row.foto_url, row.berkas_ktp_url, row.berkas_pendukung_url]
        .filter(Boolean).length
    };
  }

  async function fallbackFromPengajuan(filters) {
    const client = getClient();
    if (!client) {
      return { success: false, data: [], total: 0, error: new Error('Supabase belum dikonfigurasi.') };
    }

    const limit = Math.max(1, Number(filters.limit) || 25);
    const page = Math.max(1, Number(filters.page) || 1);
    const offset = (page - 1) * limit;

    try {
      let query = client
        .from('pengajuan_ijazah')
        .select('*', { count: 'exact' });

      if (filters.status) {
        query = query.eq('status_ijazah', statusToIjazah(filters.status));
      }
      if (filters.nim) {
        query = query.eq('nim', String(filters.nim).trim().toUpperCase());
      }
      if (filters.from) {
        query = query.gte('created_at', filters.from);
      }
      if (filters.to) {
        query = query.lte('created_at', filters.to + 'T23:59:59');
      }

      const term = safeSearchTerm(filters.search);
      if (term) {
        query = query.or([
          'nomor_tiket.ilike.%' + term + '%',
          'nim.ilike.%' + term + '%',
          'nama_lengkap.ilike.%' + term + '%',
          'email.ilike.%' + term + '%'
        ].join(','));
      }

      const result = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (result.error) {
        return { success: false, data: [], total: 0, error: result.error, fallback: true };
      }

      const rows = (result.data || []).map(mapPengajuanToRegistrasi);
      return {
        success: true,
        data: rows,
        total: result.count || rows.length,
        fallback: true,
        message: 'Tabel registrasi_layanan belum tersedia. Data ditampilkan dari pengajuan_ijazah.'
      };
    } catch (err) {
      return { success: false, data: [], total: 0, error: err, fallback: true };
    }
  }


  async function attachDokumenCounts(rows) {
    const client = getClient();
    const ids = (rows || []).map(function (row) { return row.id; }).filter(Boolean);
    if (!client || ids.length === 0) return rows;

    try {
      const result = await client
        .from('registrasi_layanan_dokumen')
        .select('id, registrasi_id, jenis_dokumen, file_url, status_verifikasi')
        .in('registrasi_id', ids);

      if (result.error || !Array.isArray(result.data)) return rows;

      const grouped = {};
      result.data.forEach(function (doc) {
        if (!grouped[doc.registrasi_id]) grouped[doc.registrasi_id] = [];
        grouped[doc.registrasi_id].push(doc);
      });

      return rows.map(function (row) {
        const docs = grouped[row.id] || [];
        return Object.assign({}, row, {
          dokumen: docs,
          jumlah_dokumen: docs.length,
          jumlah_dokumen_valid: docs.filter(function (doc) {
            return doc.status_verifikasi === 'valid';
          }).length
        });
      });
    } catch (_) {
      return rows;
    }
  }

  async function listRegistrasi(filters) {
    const params = filters || {};
    const client = getClient();
    if (!client) {
      return {
        success: false,
        data: [],
        total: 0,
        error: new Error('Supabase belum dikonfigurasi. Periksa kredensial project.')
      };
    }

    const limit = Math.max(1, Number(params.limit) || 25);
    const page = Math.max(1, Number(params.page) || 1);
    const offset = (page - 1) * limit;

    try {
      let query = client
        .from('registrasi_layanan')
        .select('*', { count: 'exact' });

      if (params.status) query = query.eq('status', normalizeStatus(params.status));
      if (params.layananId) query = query.eq('layanan_id', params.layananId);
      if (params.userId) query = query.eq('user_id', params.userId);
      if (params.nim) query = query.eq('nim', String(params.nim).trim().toUpperCase());
      if (params.prioritas) query = query.eq('prioritas', params.prioritas);
      if (params.from) query = query.gte('created_at', params.from);
      if (params.to) query = query.lte('created_at', params.to + 'T23:59:59');

      const term = safeSearchTerm(params.search);
      if (term) {
        query = query.or([
          'nomor_registrasi.ilike.%' + term + '%',
          'nama_pemohon.ilike.%' + term + '%',
          'nim.ilike.%' + term + '%',
          'email.ilike.%' + term + '%'
        ].join(','));
      }

      const result = await query
        .order(params.orderBy || 'created_at', { ascending: params.ascending === true })
        .range(offset, offset + limit - 1);

      if (result.error) {
        if (isMissingTable(result.error)) {
          return await fallbackFromPengajuan(Object.assign({}, params, { page: page, limit: limit }));
        }
        return { success: false, data: [], total: 0, error: result.error };
      }

      const layanan = await getLayananMap();
      let rows = attachLayanan(result.data || [], layanan);
      rows = await attachDokumenCounts(rows);

      return {
        success: true,
        data: rows,
        total: result.count || rows.length,
        page: page,
        limit: limit,
        fallback: false
      };
    } catch (err) {
      if (isMissingTable(err)) {
        return await fallbackFromPengajuan(Object.assign({}, params, { page: page, limit: limit }));
      }
      return { success: false, data: [], total: 0, error: err };
    }
  }


  async function getFallbackDetail(pengajuanId) {
    const client = getClient();
    if (!client || !pengajuanId) return { success: false, data: null };
    try {
      const result = await client
        .from('pengajuan_ijazah')
        .select('*')
        .eq('id', pengajuanId)
        .limit(1);

      if (result.error || !result.data || result.data.length === 0) {
        return { success: false, data: null, error: result.error };
      }

      const row = mapPengajuanToRegistrasi(result.data[0]);
      const riwayatRes = await client
        .from('riwayat_status')
        .select('*')
        .eq('pengajuan_id', pengajuanId)
        .order('step_number', { ascending: true });

      row.riwayat = (riwayatRes.data || []).map(function (item) {
        return {
          status_baru: item.status === 'completed' ? row.status : (item.status === 'in_progress' ? 'diproses' : 'menunggu_verifikasi'),
          catatan: item.description,
          aktor_nama: item.actor,
          created_at: item.waktu,
          title: item.title
        };
      });
      row.catatan = [];
      row.dokumen = [
        { jenis_dokumen: 'pas_foto', nama_berkas: 'Pas Foto Resmi 4x6', file_url: result.data[0].foto_url },
        { jenis_dokumen: 'ktp', nama_berkas: 'Kartu Tanda Penduduk (KTP)', file_url: result.data[0].berkas_ktp_url },
        { jenis_dokumen: 'pendukung', nama_berkas: 'Berkas Pendukung', file_url: result.data[0].berkas_pendukung_url }
      ].filter(function (doc) { return Boolean(doc.file_url); }).map(function (doc) {
        return Object.assign({}, doc, {
          id: null,
          status_verifikasi: 'menunggu',
          is_fallback: true
        });
      });

      return { success: true, data: row, fallback: true };
    } catch (err) {
      return { success: false, data: null, error: err, fallback: true };
    }
  }

  async function getRegistrasi(id) {
    const client = getClient();
    if (!client) {
      return { success: false, data: null, error: new Error('Supabase belum dikonfigurasi.') };
    }
    if (!id) {
      return { success: false, data: null, error: new Error('ID registrasi wajib diisi.') };
    }

    try {
      const result = await client
        .from('registrasi_layanan')
        .select('*')
        .eq('id', id)
        .limit(1);

      if (result.error) {
        if (isMissingTable(result.error)) {
          return await getFallbackDetail(id);
        }
        return { success: false, data: null, error: result.error };
      }

      if (!result.data || result.data.length === 0) {
        return await getFallbackDetail(id);
      }

      const row = result.data[0];
      const layanan = await getLayananMap();

      const [dokumenRes, riwayatRes, catatanRes] = await Promise.all([
        client.from('registrasi_layanan_dokumen').select('*').eq('registrasi_id', id).order('uploaded_at', { ascending: true }),
        client.from('registrasi_layanan_riwayat').select('*').eq('registrasi_id', id).order('created_at', { ascending: true }),
        client.from('registrasi_layanan_catatan').select('*').eq('registrasi_id', id).order('created_at', { ascending: false })
      ]);

      const decorated = attachLayanan([row], layanan)[0];
      decorated.dokumen = dokumenRes.data || [];
      decorated.riwayat = riwayatRes.data || [];
      decorated.catatan = catatanRes.data || [];

      return { success: true, data: decorated, fallback: false };
    } catch (err) {
      if (isMissingTable(err)) {
        return await getFallbackDetail(id);
      }
      return { success: false, data: null, error: err };
    }
  }

  async function findRegistrasiByNomor(nomor) {
    const client = getClient();
    if (!client || !nomor) return { success: false, data: null };
    try {
      const result = await client
        .from('registrasi_layanan')
        .select('id')
        .eq('nomor_registrasi', nomor)
        .limit(1);

      if (!result.error && result.data && result.data.length > 0) {
        return await getRegistrasi(result.data[0].id);
      }

      const pengajuanRes = await client
        .from('pengajuan_ijazah')
        .select('id')
        .eq('nomor_tiket', nomor)
        .limit(1);

      if (!pengajuanRes.error && pengajuanRes.data && pengajuanRes.data.length > 0) {
        return await getFallbackDetail(pengajuanRes.data[0].id);
      }

      return { success: false, data: null, error: result.error || pengajuanRes.error };
    } catch (err) {
      return { success: false, data: null, error: err };
    }
  }

  async function listForUser(user) {
    if (!user) {
      return { success: false, data: [], total: 0, error: new Error('Sesi pengguna tidak ditemukan.') };
    }

    const byId = await listRegistrasi({
      userId: user.id,
      limit: 100,
      page: 1,
      orderBy: 'created_at'
    });

    if (byId.success && byId.data.length > 0) {
      return byId;
    }

    if (user.nim) {
      const byNim = await listRegistrasi({
        nim: user.nim,
        limit: 100,
        page: 1,
        orderBy: 'created_at'
      });
      if (byNim.success) return byNim;
    }

    return byId;
  }


  function buildRegistrasiPayload(pengajuan, user, layanan) {
    const status = ijazahToStatus(pengajuan.status_ijazah || 'Pengajuan');
    return {
      nomor_registrasi: pengajuan.nomor_tiket,
      pengajuan_id: pengajuan.id,
      user_id: (user && user.id) || pengajuan.user_id || null,
      layanan_id: (layanan && layanan.id) || pengajuan.layanan_id || null,
      nama_pemohon: pengajuan.nama_lengkap || (user && user.nama_lengkap) || 'Pemohon',
      nim: pengajuan.nim || null,
      email: pengajuan.email || null,
      whatsapp: pengajuan.whatsapp || null,
      status: status,
      prioritas: pengajuan.prioritas || 'normal',
      sumber: 'online',
      data_pemohon: {
        nim: pengajuan.nim || null,
        nik: pengajuan.nik || null,
        nama_lengkap: pengajuan.nama_lengkap || null,
        tempat_lahir: pengajuan.tempat_lahir || null,
        tanggal_lahir: pengajuan.tanggal_lahir || null,
        fakultas: pengajuan.fakultas || null,
        prodi: pengajuan.prodi || null,
        periode_yudisium: pengajuan.periode_yudisium || null,
        ipk: pengajuan.ipk || null,
        whatsapp: pengajuan.whatsapp || null,
        email: pengajuan.email || null,
        loket_pengambilan: pengajuan.loket_pengambilan || null
      },
      catatan_pemohon: pengajuan.catatan_pemohon || null,
      catatan_petugas: pengajuan.catatan_petugas || null,
      created_at: pengajuan.created_at || new Date().toISOString(),
      updated_at: pengajuan.updated_at || new Date().toISOString()
    };
  }

  function buildDokumenPayload(registrasiId, pengajuan) {
    const docs = [
      { jenis_dokumen: 'pas_foto', nama_berkas: 'Pas Foto Resmi 4x6', file_url: pengajuan.foto_url },
      { jenis_dokumen: 'ktp', nama_berkas: 'Kartu Tanda Penduduk (KTP)', file_url: pengajuan.berkas_ktp_url },
      { jenis_dokumen: 'pendukung', nama_berkas: 'Berkas Pendukung', file_url: pengajuan.berkas_pendukung_url }
    ];

    return docs.filter(function (doc) {
      return Boolean(doc.file_url);
    }).map(function (doc) {
      return {
        registrasi_id: registrasiId,
        jenis_dokumen: doc.jenis_dokumen,
        nama_berkas: doc.nama_berkas,
        file_url: doc.file_url,
        status_verifikasi: 'menunggu'
      };
    });
  }

  async function addInitialHistory(client, registrasiId, status, catatan) {
    try {
      await client.from('registrasi_layanan_riwayat').insert([{
        registrasi_id: registrasiId,
        status_lama: null,
        status_baru: status,
        catatan: catatan || 'Registrasi layanan dibuat dari pengajuan pemohon.',
        aktor_nama: 'Sistem Registrasi Online'
      }]);
    } catch (_) {}
  }

  async function ensureForPengajuan(pengajuan, user) {
    const client = getClient();
    if (!client || !pengajuan || !pengajuan.id) {
      return { success: false, skipped: true, error: new Error('Data pengajuan tidak lengkap.') };
    }

    try {
      const existing = await client
        .from('registrasi_layanan')
        .select('id, status, nomor_registrasi')
        .eq('pengajuan_id', pengajuan.id)
        .limit(1);

      if (existing.error) {
        if (isMissingTable(existing.error)) {
          return { success: false, skipped: true, error: existing.error };
        }
        return { success: false, error: existing.error };
      }

      if (existing.data && existing.data.length > 0) {
        return { success: true, data: existing.data[0], existing: true };
      }

      const layananList = await getLayananMap();
      const resolvedUser = await resolveUser(pengajuan, user);
      const kode = pengajuan.service_type || 'penerbitan_baru';
      const layanan = layananList.find(function (item) { return item.kode === kode; });
      const payload = buildRegistrasiPayload(pengajuan, resolvedUser, layanan);

      const inserted = await client
        .from('registrasi_layanan')
        .insert([payload])
        .select('*')
        .single();

      if (inserted.error) {
        if (inserted.error.code === '23505') {
          const retry = await client
            .from('registrasi_layanan')
            .select('id, status, nomor_registrasi')
            .eq('pengajuan_id', pengajuan.id)
            .limit(1);
          return { success: true, data: (retry.data || [])[0] || null, existing: true };
        }
        return { success: false, error: inserted.error };
      }

      const registrasiId = inserted.data.id;
      await addInitialHistory(client, registrasiId, payload.status, payload.catatan_petugas);

      const docs = buildDokumenPayload(registrasiId, pengajuan);
      if (docs.length > 0) {
        try {
          await client
            .from('registrasi_layanan_dokumen')
            .upsert(docs, { onConflict: 'registrasi_id,jenis_dokumen' });
        } catch (_) {}
      }

      return { success: true, data: inserted.data, existing: false };
    } catch (err) {
      return { success: false, error: err, skipped: isMissingTable(err) };
    }
  }


  async function syncFromPengajuan(options) {
    const params = options || {};
    const client = getClient();
    if (!client) {
      return { success: false, inserted: 0, skipped: 0, error: new Error('Supabase belum dikonfigurasi.') };
    }

    const limit = Math.max(1, Math.min(Number(params.limit) || 500, 2000));

    try {
      const [pengajuanRes, existingRes, layananList, usersRes] = await Promise.all([
        client.from('pengajuan_ijazah').select('*').order('created_at', { ascending: false }).limit(limit),
        client.from('registrasi_layanan').select('pengajuan_id, nomor_registrasi').limit(5000),
        getLayananMap(true),
        client.from('users').select('id, nim, email').limit(5000)
      ]);

      if (pengajuanRes.error) {
        return { success: false, inserted: 0, skipped: 0, error: pengajuanRes.error };
      }
      if (existingRes.error) {
        if (isMissingTable(existingRes.error)) {
          return { success: false, inserted: 0, skipped: 0, error: existingRes.error, missingTable: true };
        }
        return { success: false, inserted: 0, skipped: 0, error: existingRes.error };
      }

      const existingPengajuan = new Set();
      const existingNomor = new Set();
      (existingRes.data || []).forEach(function (row) {
        if (row.pengajuan_id) existingPengajuan.add(row.pengajuan_id);
        if (row.nomor_registrasi) existingNomor.add(row.nomor_registrasi);
      });

      const layananByKode = {};
      (layananList || []).forEach(function (item) { layananByKode[item.kode] = item; });

      const userByNim = {};
      const userByEmail = {};
      (usersRes.data || []).forEach(function (user) {
        if (user.nim) userByNim[user.nim] = user;
        if (user.email) userByEmail[String(user.email).toLowerCase()] = user;
      });

      const missing = (pengajuanRes.data || []).filter(function (row) {
        if (existingPengajuan.has(row.id)) return false;
        if (row.nomor_tiket && existingNomor.has(row.nomor_tiket)) return false;
        return true;
      });

      if (missing.length === 0) {
        return { success: true, inserted: 0, skipped: 0, totalPengajuan: (pengajuanRes.data || []).length };
      }

      const payloadRows = missing.map(function (row) {
        const user = userByNim[row.nim] || userByEmail[String(row.email || '').toLowerCase()] || null;
        const layanan = layananByKode[row.service_type] || null;
        return buildRegistrasiPayload(row, user, layanan);
      });

      let insertedRows = [];
      const batchSize = 100;
      for (let i = 0; i < payloadRows.length; i += batchSize) {
        const batch = payloadRows.slice(i, i + batchSize);
        const insertRes = await client
          .from('registrasi_layanan')
          .insert(batch)
          .select('id, pengajuan_id, status');

        if (insertRes.error) {
          if (isMissingTable(insertRes.error)) {
            return {
              success: false,
              inserted: insertedRows.length,
              skipped: missing.length,
              error: insertRes.error,
              missingTable: true
            };
          }
          return {
            success: false,
            inserted: insertedRows.length,
            skipped: missing.length - insertedRows.length,
            error: insertRes.error
          };
        }
        insertedRows = insertedRows.concat(insertRes.data || []);
      }

      const pengajuanById = {};
      missing.forEach(function (row) { pengajuanById[row.id] = row; });

      const historyRows = [];
      const documentRows = [];
      insertedRows.forEach(function (row) {
        const pengajuan = pengajuanById[row.pengajuan_id];
        if (!pengajuan) return;
        historyRows.push({
          registrasi_id: row.id,
          status_lama: null,
          status_baru: row.status,
          catatan: 'Registrasi layanan disinkronkan dari data pengajuan yang telah ada.',
          aktor_nama: 'Sistem Sinkronisasi Registrasi'
        });
        buildDokumenPayload(row.id, pengajuan).forEach(function (doc) {
          documentRows.push(doc);
        });
      });

      if (historyRows.length > 0) {
        try {
          await client.from('registrasi_layanan_riwayat').insert(historyRows);
        } catch (_) {}
      }
      if (documentRows.length > 0) {
        try {
          await client
            .from('registrasi_layanan_dokumen')
            .upsert(documentRows, { onConflict: 'registrasi_id,jenis_dokumen' });
        } catch (_) {}
      }

      return {
        success: true,
        inserted: insertedRows.length,
        skipped: missing.length - insertedRows.length,
        totalPengajuan: (pengajuanRes.data || []).length
      };
    } catch (err) {
      return { success: false, inserted: 0, skipped: 0, error: err, missingTable: isMissingTable(err) };
    }
  }


  function actorName(aktor) {
    if (!aktor) return 'Petugas BAK';
    return aktor.nama_lengkap || aktor.email || 'Petugas BAK';
  }

  async function addCatatan(registrasiId, isi, tipe, aktor) {
    const client = getClient();
    if (!client || !registrasiId || !String(isi || '').trim()) {
      return { success: false, error: new Error('Catatan dan ID registrasi wajib diisi.') };
    }

    try {
      const result = await client
        .from('registrasi_layanan_catatan')
        .insert([{
          registrasi_id: registrasiId,
          isi: String(isi).trim(),
          tipe: tipe || 'internal',
          penulis_id: (aktor && aktor.id) || null,
          penulis_nama: actorName(aktor)
        }])
        .select('*')
        .single();

      return { success: !result.error, data: result.data || null, error: result.error || null };
    } catch (err) {
      return { success: false, error: err };
    }
  }

  async function updateStatus(id, newStatus, options) {
    const opts = options || {};
    const client = getClient();
    if (!client || !id) {
      return { success: false, error: new Error('Supabase atau ID registrasi tidak tersedia.') };
    }

    const status = normalizeStatus(newStatus);
    if (!STATUS_META[status]) {
      return { success: false, error: new Error('Status registrasi tidak valid.') };
    }

    try {
      const currentRes = await client
        .from('registrasi_layanan')
        .select('*')
        .eq('id', id)
        .limit(1);

      if (currentRes.error) {
        if (isMissingTable(currentRes.error)) {
          return {
            success: false,
            error: new Error('Tabel registrasi_layanan belum tersedia. Jalankan migrasi supabase/schema.sql terlebih dahulu.')
          };
        }
        return { success: false, error: currentRes.error };
      }

      if (!currentRes.data || currentRes.data.length === 0) {
        return { success: false, error: new Error('Registrasi layanan tidak ditemukan.') };
      }

      const current = currentRes.data[0];
      const now = new Date().toISOString();
      const actor = opts.aktor || {};

      const updates = {
        status: status,
        updated_at: now
      };
      if (opts.catatan !== undefined) updates.catatan_petugas = opts.catatan;
      if (opts.prioritas) updates.prioritas = opts.prioritas;
      if (status === 'diverifikasi') {
        updates.verified_at = now;
        if (actor.id) updates.petugas_id = actor.id;
      }
      if (status === 'selesai') updates.completed_at = now;
      if (status === 'dibatalkan') updates.cancelled_at = now;

      const updateRes = await client
        .from('registrasi_layanan')
        .update(updates)
        .eq('id', id)
        .select('*')
        .single();

      if (updateRes.error) {
        return { success: false, error: updateRes.error };
      }

      // Sinkronkan status ke pengajuan_ijazah agar portal pelacakan tetap konsisten.
      if (current.pengajuan_id) {
        const pengajuanUpdate = {
          status_ijazah: statusToIjazah(status),
          status: status,
          status_label: STATUS_META[status].label,
          updated_at: now
        };
        if (opts.catatan !== undefined) pengajuanUpdate.catatan_petugas = opts.catatan;
        if (status === 'selesai') pengajuanUpdate.current_step = 6;
        if (status === 'ditolak' || status === 'dibatalkan') {
          pengajuanUpdate.current_step = Math.max(1, Number(current.current_step) || 5);
        }

        let pengajuanRes = await client
          .from('pengajuan_ijazah')
          .update(pengajuanUpdate)
          .eq('id', current.pengajuan_id);

        // Toleransi bila constraint status_ijazah lama belum memuat 'Dibatalkan'.
        if (pengajuanRes.error && pengajuanRes.error.code === '23514') {
          pengajuanUpdate.status_ijazah = 'Ditolak';
          pengajuanRes = await client
            .from('pengajuan_ijazah')
            .update(pengajuanUpdate)
            .eq('id', current.pengajuan_id);
        }

        try {
          await client.from('riwayat_status').insert([{
            pengajuan_id: current.pengajuan_id,
            step_number: Math.max(1, STATUS_META[status].step || 1),
            title: 'Pembaruan Status Registrasi Layanan',
            description: opts.catatan || ('Status registrasi diperbarui dari "' + STATUS_META[normalizeStatus(current.status)].label + '" menjadi "' + STATUS_META[status].label + '".'),
            actor: actorName(actor),
            status: status === 'selesai' ? 'completed' : ((status === 'ditolak' || status === 'dibatalkan') ? 'pending' : 'in_progress')
          }]);
        } catch (_) {}
      }

      try {
        await client.from('registrasi_layanan_riwayat').insert([{
          registrasi_id: id,
          status_lama: current.status,
          status_baru: status,
          catatan: opts.catatan || null,
          aktor_id: actor.id || null,
          aktor_nama: actorName(actor)
        }]);
      } catch (_) {}

      if (opts.catatan && String(opts.catatan).trim()) {
        await addCatatan(id, opts.catatan, 'internal', actor);
      }

      return { success: true, data: updateRes.data };
    } catch (err) {
      return { success: false, error: err };
    }
  }


  async function updateRegistrasi(id, data) {
    const client = getClient();
    if (!client || !id || !data) {
      return { success: false, error: new Error('Data pembaruan tidak lengkap.') };
    }

    const allowed = [
      'prioritas', 'catatan_petugas', 'catatan_pemohon', 'data_pemohon',
      'layanan_id', 'nama_pemohon', 'nim', 'email', 'whatsapp', 'user_id'
    ];
    const payload = {};
    allowed.forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        payload[key] = data[key];
      }
    });

    if (Object.keys(payload).length === 0) {
      return { success: false, error: new Error('Tidak ada kolom yang dapat diperbarui.') };
    }

    payload.updated_at = new Date().toISOString();

    try {
      const result = await client
        .from('registrasi_layanan')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();

      return { success: !result.error, data: result.data || null, error: result.error || null };
    } catch (err) {
      return { success: false, error: err };
    }
  }

  async function cancelRegistrasi(id, alasan, aktor) {
    const detail = await getRegistrasi(id);
    if (!detail.success || !detail.data) {
      return { success: false, error: detail.error || new Error('Registrasi tidak ditemukan.') };
    }
    if (detail.data.is_fallback) {
      return {
        success: false,
        error: new Error('Registrasi ini belum dimigrasikan. Jalankan sinkronisasi pada panel manajemen terlebih dahulu.')
      };
    }
    if (!canCancel(detail.data.status)) {
      return {
        success: false,
        error: new Error('Registrasi dengan status "' + getStatusMeta(detail.data.status).label + '" tidak dapat dibatalkan.')
      };
    }

    return updateStatus(id, STATUS.DIBATALKAN, {
      catatan: alasan || 'Registrasi dibatalkan oleh pemohon.',
      aktor: aktor
    });
  }

  async function verifyDokumen(docId, status, catatan, aktor) {
    const client = getClient();
    if (!client || !docId) {
      return { success: false, error: new Error('ID dokumen tidak tersedia.') };
    }

    const normalized = ['valid', 'tidak_valid', 'menunggu'].indexOf(status) !== -1 ? status : null;
    if (!normalized) {
      return { success: false, error: new Error('Status verifikasi dokumen tidak valid.') };
    }

    try {
      const payload = {
        status_verifikasi: normalized,
        catatan: catatan || null,
        verified_at: normalized === 'menunggu' ? null : new Date().toISOString(),
        verified_by: normalized === 'menunggu' ? null : ((aktor && aktor.id) || null)
      };

      const result = await client
        .from('registrasi_layanan_dokumen')
        .update(payload)
        .eq('id', docId)
        .select('*')
        .single();

      if (result.error) {
        return { success: false, error: result.error };
      }

      if (result.data && result.data.registrasi_id && catatan) {
        await addCatatan(
          result.data.registrasi_id,
          'Verifikasi dokumen ' + (result.data.nama_berkas || result.data.jenis_dokumen) + ': ' + normalized + '. ' + catatan,
          'internal',
          aktor
        );
      }

      return { success: true, data: result.data };
    } catch (err) {
      return { success: false, error: err };
    }
  }


  function emptyStatistik() {
    return {
      total: 0,
      draft: 0,
      menunggu_verifikasi: 0,
      diverifikasi: 0,
      diproses: 0,
      siap_diambil: 0,
      selesai: 0,
      ditolak: 0,
      dibatalkan: 0,
      fallback: false
    };
  }

  async function statisticFromPengajuan() {
    const client = getClient();
    const stats = emptyStatistik();
    stats.fallback = true;
    if (!client) return stats;

    try {
      const result = await client
        .from('pengajuan_ijazah')
        .select('status_ijazah')
        .limit(5000);

      if (result.error || !Array.isArray(result.data)) return stats;

      result.data.forEach(function (row) {
        const status = normalizeStatus(ijazahToStatus(row.status_ijazah));
        stats[status] = (stats[status] || 0) + 1;
        stats.total += 1;
      });
    } catch (_) {}

    return stats;
  }

  async function getStatistik() {
    const client = getClient();
    if (!client) {
      return { success: false, data: emptyStatistik(), error: new Error('Supabase belum dikonfigurasi.') };
    }

    try {
      const result = await client
        .from('registrasi_layanan')
        .select('status')
        .limit(5000);

      if (result.error) {
        if (isMissingTable(result.error)) {
          const fallback = await statisticFromPengajuan();
          return { success: true, data: fallback, fallback: true };
        }
        return { success: false, data: emptyStatistik(), error: result.error };
      }

      const stats = emptyStatistik();
      (result.data || []).forEach(function (row) {
        const status = normalizeStatus(row.status);
        stats[status] = (stats[status] || 0) + 1;
        stats.total += 1;
      });

      if (stats.total === 0) {
        const fallback = await statisticFromPengajuan();
        if (fallback.total > 0) {
          return { success: true, data: fallback, fallback: true };
        }
      }

      return { success: true, data: stats, fallback: false };
    } catch (err) {
      if (isMissingTable(err)) {
        const fallback = await statisticFromPengajuan();
        return { success: true, data: fallback, fallback: true };
      }
      return { success: false, data: emptyStatistik(), error: err };
    }
  }

  function csvCell(value) {
    const text = value === null || value === undefined ? '' : String(value);
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function exportCsv(rows) {
    const header = [
      'Nomor Registrasi',
      'Tanggal Registrasi',
      'Nama Pemohon',
      'NIM',
      'Layanan',
      'Status',
      'Prioritas',
      'Email',
      'WhatsApp',
      'Catatan Petugas'
    ];

    const lines = [header.map(csvCell).join(',')];
    (rows || []).forEach(function (row) {
      lines.push([
        row.nomor_registrasi,
        formatDateTime(row.created_at),
        row.nama_pemohon,
        row.nim,
        row.layanan_nama || (row.layanan && row.layanan.nama),
        getStatusMeta(row.status).label,
        row.prioritas || 'normal',
        row.email,
        row.whatsapp,
        row.catatan_petugas
      ].map(csvCell).join(','));
    });

    return '\uFEFF' + lines.join('\r\n');
  }

  function downloadCsv(filename, rows) {
    if (typeof document === 'undefined') return false;
    const content = exportCsv(rows);
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || ('registrasi-layanan-' + new Date().toISOString().slice(0, 10) + '.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  }


  global.UntanRegistrasiLayanan = {
    STATUS: STATUS,
    STATUS_META: STATUS_META,
    DEFAULT_LAYANAN: DEFAULT_LAYANAN,
    normalizeStatus: normalizeStatus,
    statusToIjazah: statusToIjazah,
    ijazahToStatus: ijazahToStatus,
    getStatusMeta: getStatusMeta,
    isFinalStatus: isFinalStatus,
    canCancel: canCancel,
    getLayananName: getLayananName,
    isMissingTable: isMissingTable,
    formatDate: formatDate,
    formatDateTime: formatDateTime,
    listLayanan: listLayanan,
    listPersyaratan: listPersyaratan,
    listRegistrasi: listRegistrasi,
    listForUser: listForUser,
    getRegistrasi: getRegistrasi,
    findRegistrasiByNomor: findRegistrasiByNomor,
    ensureForPengajuan: ensureForPengajuan,
    syncFromPengajuan: syncFromPengajuan,
    updateStatus: updateStatus,
    updateRegistrasi: updateRegistrasi,
    cancelRegistrasi: cancelRegistrasi,
    verifyDokumen: verifyDokumen,
    addCatatan: addCatatan,
    getStatistik: getStatistik,
    exportCsv: exportCsv,
    downloadCsv: downloadCsv
  };
})(window);

