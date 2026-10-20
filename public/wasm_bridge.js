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
    let wasmBytes;

    if (typeof wasmSource === 'string') {
      const response = await fetch(wasmSource);
      if (!response.ok) {
        throw new Error(`Gagal memuat binary WebAssembly dari ${wasmSource}: status ${response.status}`);
      }
      if (typeof WebAssembly.instantiateStreaming === 'function') {
        try {
          const { instance } = await WebAssembly.instantiateStreaming(response);
          this.wasmInstance = instance;
          this.memory = instance.exports.memory;
          this.isReady = true;
          return;
        } catch (_streamingErr) {
          // Fallback ke arrayBuffer jika streaming gagal karena MIME type
          wasmBytes = await (await fetch(wasmSource)).arrayBuffer();
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
   * Memotong dan merotasi citra menggunakan WebAssembly
   * @param {ArrayBuffer|Uint8Array} imageBytes
   * @param {Object} options
   * @returns {Promise<{ data: Uint8Array, blob: Blob|null, url: string|null }>}
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
    } = options;

    const inputData = imageBytes instanceof Uint8Array ? imageBytes : new Uint8Array(imageBytes);
    const inputLen = inputData.byteLength;

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

    // Jalankan pemotongan dan transformasi di Rust
    const status = crop_process(
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
      formatCode
    );

    // Dealokasi input buffer setelah selesai
    dealloc(inputPtr, inputLen);

    if (status !== 0) {
      throw new Error(`Pemrosesan crop gagal di engine Rust dengan kode error: ${status}`);
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
      sizeBytes: outLen,
    };
  }
}
