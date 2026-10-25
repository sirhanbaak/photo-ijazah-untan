/**
 * WasmCropEngine - Bridge antara JavaScript dan WebAssembly image processing engine
 */
export class WasmCropEngine {
  constructor() {
    this.wasmInstance = null;
    this.memory = null;
    this.isReady = false;
  }

  /**
   * Inisialisasi modul WebAssembly dari URL atau ArrayBuffer
   * @param {string|ArrayBuffer|Uint8Array} wasmSource
   */
  async init(wasmSource = 'wasm_crop.wasm') {
    this.isReady = false;
    let wasmBytes;

    if (typeof wasmSource === 'string') {
      const response = await fetch(wasmSource);
      if (!response.ok) {
        throw new Error(`Gagal memuat binary WebAssembly dari ${wasmSource}: status ${response.status}`);
      }
      if (typeof WebAssembly.instantiateStreaming === 'function') {
        // Simpan salinan response agar tidak perlu fetch ulang saat streaming gagal
        const fallbackResponse = response.clone();
        try {
          const { instance } = await WebAssembly.instantiateStreaming(response);
          this.wasmInstance = instance;
          this.memory = instance.exports.memory;
          this.isReady = true;
          return;
        } catch (_streamingErr) {
          // Fallback ke arrayBuffer jika streaming gagal karena MIME type
          wasmBytes = await fallbackResponse.arrayBuffer();
        }
      } else {
        wasmBytes = await response.arrayBuffer();
      }
    } else if (wasmSource instanceof ArrayBuffer || wasmSource instanceof Uint8Array) {
      wasmBytes = wasmSource;
    } else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(wasmSource)) {
      wasmBytes = wasmSource;
    } else {
      throw new Error('Sumber WebAssembly tidak valid. Harap berikan URL atau buffer biner.');
    }

    const { instance } = await WebAssembly.instantiate(wasmBytes, {});
    this.wasmInstance = instance;
    this.memory = instance.exports.memory;
    this.isReady = true;
  }

  /**
   * Membaca pesan kesalahan terakhir yang dilaporkan engine Rust.
   * @returns {string} Pesan UTF-8, atau string kosong bila tidak tersedia
   */
  readLastError() {
    if (!this.wasmInstance) return '';
    const { get_last_error_ptr: getPtr, get_last_error_len: getLen } = this.wasmInstance.exports;
    if (typeof getPtr !== 'function' || typeof getLen !== 'function') return '';

    const ptr = getPtr();
    const len = getLen();
    if (!ptr || !len) return '';

    try {
      return new TextDecoder().decode(new Uint8Array(this.memory.buffer, ptr, len));
    } catch (_err) {
      return '';
    }
  }

  /** Keterangan cadangan bila engine tidak menyertakan pesan error. */
  describeStatus(status) {
    switch (status) {
      case 1:
        return 'data gambar kosong';
      case 3:
        return 'area crop tidak valid atau di luar batas gambar';
      case 4:
        return 'ukuran target tidak valid';
      case 6:
        return 'ukuran berkas melebihi batas engine';
      default:
        return 'gagal mendecode, memproses, atau meng-encode gambar';
    }
  }

  /**
   * Memotong dan merotasi citra menggunakan WebAssembly
   * @param {ArrayBuffer|Uint8Array} imageBytes
   * @param {Object} options
   * @param {number} [options.dpi=300] Densitas cetak yang ditanam sebagai metadata (JPEG APP0 / PNG pHYs)
   * @returns {Promise<{ data: Uint8Array, blob: Blob|null, url: string|null, dpi: number }>}
   */
  async cropImage(imageBytes, options = {}) {
    if (!this.isReady || !this.wasmInstance) {
      throw new Error('WasmCropEngine belum diinisialisasi. Panggil init() terlebih dahulu.');
    }

    const {
      cropX = 0,
      cropY = 0,
      cropW = 100,
      cropH = 100,
      targetW = 450,
      targetH = 660,
      rotationDeg = 0.0,
      flipH = false,
      flipV = false,
      format = 'jpeg', // 'jpeg' atau 'png'
      dpi = 300, // densitas cetak (DPI) yang ditanam ke metadata berkas hasil
    } = options;

    const inputData = imageBytes instanceof Uint8Array ? imageBytes : new Uint8Array(imageBytes);
    const inputLen = inputData.byteLength;

    if (inputLen === 0) {
      throw new Error('Data gambar kosong; tidak ada yang dapat diproses.');
    }

    // Tolak nilai non-numerik lebih awal agar tidak dikonversi diam-diam menjadi 0/NaN
    const numericOptions = { cropX, cropY, cropW, cropH, targetW, targetH, rotationDeg, dpi };
    for (const [name, value] of Object.entries(numericOptions)) {
      if (!Number.isFinite(Number(value))) {
        throw new Error(`Parameter ${name} tidak valid: harus berupa angka terbatas.`);
      }
    }

    const { alloc, dealloc, crop_process, get_output_ptr, get_output_len } = this.wasmInstance.exports;

    // Alokasikan memori di WebAssembly
    const inputPtr = alloc(inputLen);
    if (!inputPtr) {
      throw new Error('Gagal mengalokasikan memori di WebAssembly untuk citra sumber.');
    }

    // Salin byte gambar ke memori WebAssembly
    const wasmMemView = new Uint8Array(this.memory.buffer, inputPtr, inputLen);
    wasmMemView.set(inputData);

    const formatCode = format.toLowerCase() === 'png' ? 1 : 0;
    const flipHCode = flipH ? 1 : 0;
    const flipVCode = flipV ? 1 : 0;
    // Sanitasi DPI: preset "Konversi Digital" tidak menyebut DPI eksplisit
    const dpiValue = Number.isFinite(Number(dpi)) && Number(dpi) > 0 ? Math.round(Number(dpi)) : 300;

    // Jalankan pemotongan dan transformasi di Rust
    let status;
    try {
      status = crop_process(
        inputPtr,
        inputLen,
        Math.round(cropX),
        Math.round(cropY),
        Math.round(cropW),
        Math.round(cropH),
        Math.round(targetW),
        Math.round(targetH),
        rotationDeg,
        flipHCode,
        flipVCode,
        formatCode,
        dpiValue
      );
    } catch (err) {
      if (typeof WebAssembly.RuntimeError === 'function' && err instanceof WebAssembly.RuntimeError) {
        // Instance yang ter-trap tidak dapat dipakai lagi
        this.isReady = false;
        throw new Error(
          'Engine WebAssembly berhenti tak terduga saat memproses gambar. Muat ulang halaman untuk memulihkan.'
        );
      }
      throw err;
    } finally {
      // Dealokasi input buffer pada semua jalur, termasuk saat terjadi error
      dealloc(inputPtr, inputLen);
    }

    if (status !== 0) {
      const detail = this.readLastError() || this.describeStatus(status);
      throw new Error(`Pemrosesan crop gagal (kode ${status}): ${detail}`);
    }

    // Ambil pointer dan panjang data output
    const outPtr = get_output_ptr();
    const outLen = get_output_len();

    if (!outPtr || outLen === 0) {
      throw new Error('Engine Rust tidak menghasilkan data output yang valid.');
    }

    // Salin data hasil ke Uint8Array independen
    const outView = new Uint8Array(this.memory.buffer, outPtr, outLen);
    const resultBytes = new Uint8Array(outLen);
    resultBytes.set(outView);

    // Buat Blob dan URL jika berjalan di lingkungan browser
    let blob = null;
    let url = null;
    const mimeType = format.toLowerCase() === 'png' ? 'image/png' : 'image/jpeg';

    if (typeof Blob !== 'undefined') {
      blob = new Blob([resultBytes], { type: mimeType });
      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        url = URL.createObjectURL(blob);
      }
    }

    return {
      data: resultBytes,
      blob,
      url,
      width: targetW,
      height: targetH,
      format: format.toLowerCase(),
      dpi: dpiValue,
      sizeBytes: outLen,
    };
  }
}
