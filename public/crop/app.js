import { WasmCropEngine } from './wasm_bridge.js';

// Batas dimensi sumber agar konsumsi memori engine WebAssembly tetap wajar
const MAX_SOURCE_DIM = 4096;
// Batas ukuran berkas unggahan (25 MB)
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
// Format yang dapat dinormalisasi peramban sebelum dikirim ke engine
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Konfigurasi Preset Pas Foto 4x6 Berdasarkan DPI
const DPI_PRESETS = {
  '72': {
    dpi: 72,
    targetW: 108,
    targetH: 158,
    label: '72 DPI (Layar)',
    cm: '3.81 × 5.57 cm',
    category: 'Layar Standar'
  },
  '96': {
    dpi: 96,
    targetW: 144,
    targetH: 211,
    label: '96 DPI (Web)',
    cm: '3.81 × 5.58 cm',
    category: 'Web / Digital'
  },
  '150': {
    dpi: 150,
    targetW: 225,
    targetH: 330,
    label: '150 DPI (Medium)',
    cm: '3.81 × 5.59 cm',
    category: 'Medium Cetak'
  },
  '200': {
    dpi: 200,
    targetW: 300,
    targetH: 440,
    label: '200 DPI (Cetak Cepat)',
    cm: '3.81 × 5.59 cm',
    category: 'Cetak Cepat'
  },
  '300': {
    dpi: 300,
    targetW: 450,
    targetH: 660,
    label: '300 DPI (Standar Cetak)',
    cm: '3.81 × 5.59 cm',
    category: 'Standar Ijazah / Dokumen Resmi'
  },
  '400': {
    dpi: 400,
    targetW: 600,
    targetH: 880,
    label: '400 DPI (Ultra Tajam)',
    cm: '3.81 × 5.59 cm',
    category: 'Ultra Tajam'
  },
  'digital': {
    dpi: 'Digital',
    targetW: 472,
    targetH: 709,
    label: 'Standar Konversi Digital',
    cm: '3.99 × 6.00 cm',
    category: 'Konversi Digital Umum'
  }
};

class PhotoCropApp {
  constructor() {
    this.wasmEngine = new WasmCropEngine();
    this.currentPresetKey = '300';
    this.currentPreset = DPI_PRESETS['300'];
    this.currentFormat = 'jpeg'; // 'jpeg' atau 'png'

    // Status Transformasi & Kanvas
    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 0;
    // Rotasi halus (-45°..45°) yang ikut diterapkan engine saat ekspor
    this.rotationDeg = 0.0;
    // Jumlah putaran 90° yang sudah dibakar ke bitmap sumber
    this.quarterTurns = 0;
    this.flipH = false;
    this.flipV = false;

    this.isPanMode = false;
    this.isSpacePressed = false;
    this.isDraggingPan = false;
    this.panStartX = 0;
    this.panStartY = 0;

    // Status Kotak Crop (Marquee)
    this.cropX = 0;
    this.cropY = 0;
    this.cropW = 0;
    this.cropH = 0;

    this.isMovingCrop = false;
    this.isResizingCrop = false;
    this.activeHandle = null;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.initialCrop = { x: 0, y: 0, w: 0, h: 0 };

    // Buffer Gambar Sumber
    this.sourceBuffer = null;
    this.sourceFileName = 'sample_pas_foto.jpg';
    this.naturalW = 1200;
    this.naturalH = 1600;
    // Blob sumber yang sudah tegak (EXIF ternormalisasi) sebagai basis putaran 90°
    this.baseBlob = null;
    // Object URL aktif untuk pratinjau agar tidak menumpuk di memori
    this.sourceObjectUrl = null;

    // Hasil Crop Terakhir
    this.lastCropResult = null;
    // Penjaga agar operasi berat (crop/rotasi/unggah) tidak berjalan bersamaan
    this.isBusy = false;

    this.initDOM();
    this.initEvents();
    this.bootstrap();
  }

  initDOM() {
    // Header & Meta
    this.headerFilename = document.getElementById('header-filename');
    this.headerResolution = document.getElementById('header-resolution');
    this.barResolution = document.getElementById('bar-resolution');
    this.topUploadBtn = document.getElementById('top-upload-btn');
    this.topApplyBtn = document.getElementById('top-apply-btn');

    // Zoom & Toolbar
    this.zoomIndicator = document.getElementById('zoom-indicator');
    this.zoomSlider = document.getElementById('zoom-slider');
    this.zoomInBtn = document.getElementById('zoom-in-btn');
    this.zoomOutBtn = document.getElementById('zoom-out-btn');
    this.fitWinBtn = document.getElementById('fit-win-btn');
    this.actualSizeBtn = document.getElementById('actual-size-btn');
    this.btnCenterTop = document.getElementById('btn-center-top');

    // Mobile & Tablet Drawer
    this.mobileToggleInspector = document.getElementById('mobile-toggle-inspector');
    this.closeInspectorBtn = document.getElementById('close-inspector-btn');
    this.rightInspectorPanel = document.getElementById('right-inspector-panel');
    this.inspectorBackdrop = document.getElementById('inspector-backdrop');

    // Kanvas
    this.canvasArena = document.getElementById('canvas-arena');
    this.compWrapper = document.getElementById('composition-wrapper');
    this.imageContainer = document.getElementById('image-container');
    this.sourceImage = document.getElementById('source-image');
    this.cropMarquee = document.getElementById('crop-marquee');
    this.dimensionChipText = document.getElementById('dimension-chip-text');

    // Scrim
    this.scrimTop = document.getElementById('scrim-top');
    this.scrimBottom = document.getElementById('scrim-bottom');
    this.scrimLeft = document.getElementById('scrim-left');
    this.scrimRight = document.getElementById('scrim-right');

    // Dock Tools
    this.dockBtnPan = document.getElementById('dock-btn-pan');
    this.dockBtnCrop = document.getElementById('dock-btn-crop');
    this.dockBtnCenter = document.getElementById('dock-btn-center');
    this.dockBtnApply = document.getElementById('dock-btn-apply');
    this.toolPanLeft = document.getElementById('tool-pan-left');
    this.btnInfoLeft = document.getElementById('btn-info-left');
    this.btnHotkeys = document.getElementById('btn-hotkeys');

    // Inspector
    this.presetButtons = document.querySelectorAll('.preset-btn');
    this.badgeActiveDpi = document.getElementById('badge-active-dpi');
    this.rotationSlider = document.getElementById('rotation-slider');
    this.rotationValChip = document.getElementById('rotation-val-chip');
    this.rotate90Btn = document.getElementById('rotate-90-btn');
    this.flipHBtn = document.getElementById('flip-h-btn');
    this.flipVBtn = document.getElementById('flip-v-btn');
    this.resetParamsBtn = document.getElementById('reset-params-btn');
    this.cancelCropBtn = document.getElementById('cancel-crop-btn');
    this.applyCropBtn = document.getElementById('apply-crop-btn');

    // Telemetri
    this.telemetryTag = document.getElementById('telemetry-tag');
    this.telemetryResolution = document.getElementById('telemetry-resolution');
    this.telemetryPhysical = document.getElementById('telemetry-physical');
    this.telemetryFilesize = document.getElementById('telemetry-filesize');
    this.telemetryDpi = document.getElementById('telemetry-dpi');

    // Grid
    this.btnGridThirds = document.getElementById('btn-grid-thirds');
    this.btnGridToggle = document.getElementById('btn-grid-toggle');
    this.gridToggleText = document.getElementById('grid-toggle-text');
    this.gridRuleThirds = document.getElementById('grid-rule-thirds');
    this.gridCrosshair = document.getElementById('grid-crosshair');

    // Upload Modal
    this.inspectorDropzone = document.getElementById('inspector-dropzone');
    this.uploadModal = document.getElementById('upload-modal');
    this.closeModalBtn = document.getElementById('close-modal-btn');
    this.browseBtn = document.getElementById('browse-btn');
    this.fileInput = document.getElementById('file-input');
    this.dropzone = document.getElementById('dropzone');

    // Result Modal
    this.resultModal = document.getElementById('result-modal');
    this.closeResultModalBtn = document.getElementById('close-result-modal-btn');
    this.resultImagePreview = document.getElementById('result-image-preview');
    this.resultBadgeRatio = document.getElementById('result-badge-ratio');
    this.resultPxDim = document.getElementById('result-px-dim');
    this.resultCmDim = document.getElementById('result-cm-dim');
    this.resultDpiInfo = document.getElementById('result-dpi-info');
    this.resultFilesize = document.getElementById('result-filesize');
    this.formatJpgBtn = document.getElementById('format-jpg-btn');
    this.formatPngBtn = document.getElementById('format-png-btn');
    this.resultEditAgainBtn = document.getElementById('result-edit-again-btn');
    this.downloadFinalBtn = document.getElementById('download-final-btn');

    // Loading
    this.loadingOverlay = document.getElementById('loading-overlay');
  }

  async bootstrap() {
    try {
      this.showLoading(true);
      await this.wasmEngine.init('wasm_crop.wasm');
      console.log('Rust WebAssembly Crop Engine berhasil dimuat!');

      await this.loadInitialImage('sample.jpg', 'sample_pas_foto.jpg');
    } catch (err) {
      console.error('Inisialisasi aplikasi gagal:', err);
      alert('Gagal memuat modul WebAssembly: ' + err.message);
    } finally {
      this.showLoading(false);
    }
  }

  async loadInitialImage(srcUrl, fileName = 'sample_pas_foto.jpg') {
    const response = await fetch(srcUrl, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Gagal memuat gambar awal (${srcUrl}): status ${response.status}`);
    }
    const blob = await response.blob();
    await this.applySourceBlob(blob, fileName, 0);
  }

  /**
   * Mendekode blob menjadi bitmap yang sudah tegak.
   * Peramban menerapkan orientasi EXIF secara otomatis, sehingga hasilnya
   * konsisten dengan pratinjau dan tidak lagi bergantung pada metadata.
   */
  async decodeSource(blob) {
    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
        return { image: bitmap, release: () => bitmap.close && bitmap.close() };
      } catch (_err) {
        try {
          const bitmap = await createImageBitmap(blob);
          return { image: bitmap, release: () => bitmap.close && bitmap.close() };
        } catch (_err2) {
          // Lanjut ke fallback <img> di bawah
        }
      }
    }

    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch (err) {
      URL.revokeObjectURL(url);
      throw new Error('Berkas gambar tidak dapat dibaca oleh peramban ini.');
    }
    return { image: img, release: () => URL.revokeObjectURL(url) };
  }

  /** Encode canvas menjadi blob pada format yang diminta. */
  canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => {
      if (typeof canvas.toBlob !== 'function') {
        resolve(null);
        return;
      }
      canvas.toBlob((blob) => resolve(blob), type, quality);
    });
  }

  /**
   * Menormalkan blob sumber: orientasi EXIF diterapkan peramban, format yang
   * tidak didukung engine (mis. WebP) ditranskode, dan putaran 90° dibakar ke
   * bitmap agar koordinat crop selalu searah dengan pratinjau.
   */
  async normalizeSourceBlob(blob, quarterTurns = 0) {
    const { image, release } = await this.decodeSource(blob);
    try {
      const sourceW = image.width || image.naturalWidth || 0;
      const sourceH = image.height || image.naturalHeight || 0;
      if (!sourceW || !sourceH) {
        throw new Error('Gambar tidak memiliki dimensi yang valid.');
      }

      // Batasi dimensi agar pemakaian memori engine tetap aman
      const scale = Math.min(1, MAX_SOURCE_DIM / Math.max(sourceW, sourceH));
      const drawW = Math.max(1, Math.round(sourceW * scale));
      const drawH = Math.max(1, Math.round(sourceH * scale));

      const turns = ((quarterTurns % 4) + 4) % 4;
      const swapped = turns % 2 === 1;
      const canvas = document.createElement('canvas');
      canvas.width = swapped ? drawH : drawW;
      canvas.height = swapped ? drawW : drawH;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D tidak tersedia di peramban ini.');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((turns * Math.PI) / 2);
      ctx.drawImage(image, -drawW / 2, -drawH / 2, drawW, drawH);

      // PNG dipertahankan untuk sumber ber-alpha; selain itu JPEG agar hemat memori
      const keepAlpha = /image\/(png|gif|bmp)/i.test(blob.type || '');
      const mime = keepAlpha ? 'image/png' : 'image/jpeg';
      const encoded = await this.canvasToBlob(canvas, mime, 0.95);
      if (!encoded) throw new Error('Gagal mengubah gambar ke format yang didukung engine.');

      return { blob: encoded, width: canvas.width, height: canvas.height, mime };
    } finally {
      release();
    }
  }

  /** Menunggu satu frame agar perubahan DOM (mis. overlay loading) sempat tampil. */
  nextFrame() {
    return new Promise((resolve) => {
      let selesai = false;
      const finish = () => {
        if (selesai) return;
        selesai = true;
        resolve();
      };
      requestAnimationFrame(finish);
      setTimeout(finish, 120);
    });
  }


  /**
   * Menjadikan blob sebagai sumber aktif aplikasi.
   * @param {Blob} blob
   * @param {string} fileName
   * @param {number} quarterTurns Jumlah putaran 90° yang dibakar ke bitmap
   * @param {boolean} updateBase true bila blob adalah sumber asli (bukan hasil rotasi)
   */
  async applySourceBlob(blob, fileName, quarterTurns = 0, updateBase = true) {
    const normalized = await this.normalizeSourceBlob(blob, quarterTurns);
    const bytes = new Uint8Array(await normalized.blob.arrayBuffer());

    if (updateBase) {
      this.baseBlob = normalized.blob;
    }
    this.quarterTurns = ((quarterTurns % 4) + 4) % 4;
    this.sourceBuffer = bytes;
    this.naturalW = normalized.width;
    this.naturalH = normalized.height;
    if (fileName) this.sourceFileName = fileName;

    if (this.headerFilename) this.headerFilename.textContent = this.sourceFileName;
    if (this.headerResolution) {
      this.headerResolution.textContent = `(${this.naturalW} × ${this.naturalH} px)`;
    }

    if (this.sourceObjectUrl) {
      URL.revokeObjectURL(this.sourceObjectUrl);
    }
    this.sourceObjectUrl = URL.createObjectURL(normalized.blob);
    this.sourceImage.src = this.sourceObjectUrl;
    await this.waitForImageLoad();

    // Pastikan layout sudah diperbarui sebelum mengukur ukuran tampil gambar
    await this.nextFrame();
    this.setupDefaultCropBox();
    this.fitToWindow();
  }

  /** Menunggu gambar pratinjau siap dipakai, dengan batas waktu agar tidak menggantung. */
  async waitForImageLoad() {
    if (typeof this.sourceImage.decode === 'function') {
      try {
        await this.sourceImage.decode();
        return;
      } catch (_err) {
        // Lanjut ke penantian berbasis event di bawah
      }
    }
    if (this.sourceImage.complete && this.sourceImage.naturalWidth > 0) return;

    await new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        this.sourceImage.removeEventListener('load', onLoad);
        this.sourceImage.removeEventListener('error', onError);
      };
      const onLoad = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error('Gambar gagal dimuat oleh peramban.'));
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Waktu tunggu memuat gambar habis (15 detik).'));
      }, 15000);

      this.sourceImage.addEventListener('load', onLoad);
      this.sourceImage.addEventListener('error', onError);
    });
  }

  setupDefaultCropBox() {
    const ratio = this.currentPreset.targetW / this.currentPreset.targetH; // 450 / 660 ~ 0.6818
    const imgW = this.sourceImage.offsetWidth || 340;
    const imgH = this.sourceImage.offsetHeight || 500;

    // Ambil ~75% tinggi gambar untuk proporsi pas foto standar
    let boxH = Math.round(imgH * 0.75);
    let boxW = Math.round(boxH * ratio);

    if (boxW > imgW * 0.95) {
      boxW = Math.round(imgW * 0.9);
      boxH = Math.round(boxW / ratio);
    }

    this.cropW = boxW;
    this.cropH = boxH;
    this.cropX = Math.round((imgW - boxW) / 2);
    this.cropY = Math.round((imgH - boxH) * 0.2);

    this.renderCropMarquee();
  }

  renderCropMarquee() {
    const imgW = this.sourceImage.offsetWidth;
    const imgH = this.sourceImage.offsetHeight;

    if (!imgW || !imgH) return;

    // Boundary clamping dengan rasio preset tetap terjaga
    const ratio = this.currentPreset.targetW / this.currentPreset.targetH;
    const minW = Math.min(imgW, 40);
    const minH = Math.min(imgH, Math.round(minW / ratio));

    if (this.cropW < minW || this.cropH < minH) {
      this.cropW = minW;
      this.cropH = minH;
    }
    this.cropW = Math.min(this.cropW, imgW);
    this.cropH = Math.min(this.cropH, imgH);

    // Bila batas gambar memaksa salah satu sisi mengecil, sisi lain ikut disesuaikan
    if (this.cropW / this.cropH > ratio) {
      this.cropW = Math.round(this.cropH * ratio);
    } else {
      this.cropH = Math.round(this.cropW / ratio);
    }

    this.cropX = Math.max(0, Math.min(this.cropX, imgW - this.cropW));
    this.cropY = Math.max(0, Math.min(this.cropY, imgH - this.cropH));

    // Update posisi crop box
    this.cropMarquee.style.left = `${this.cropX}px`;
    this.cropMarquee.style.top = `${this.cropY}px`;
    this.cropMarquee.style.width = `${this.cropW}px`;
    this.cropMarquee.style.height = `${this.cropH}px`;

    // Update 4 potongan Scrim
    this.scrimTop.style.top = '0px';
    this.scrimTop.style.left = '0px';
    this.scrimTop.style.right = '0px';
    this.scrimTop.style.height = `${this.cropY}px`;

    this.scrimBottom.style.top = `${this.cropY + this.cropH}px`;
    this.scrimBottom.style.left = '0px';
    this.scrimBottom.style.right = '0px';
    this.scrimBottom.style.bottom = '0px';

    this.scrimLeft.style.top = `${this.cropY}px`;
    this.scrimLeft.style.left = '0px';
    this.scrimLeft.style.width = `${this.cropX}px`;
    this.scrimLeft.style.height = `${this.cropH}px`;

    this.scrimRight.style.top = `${this.cropY}px`;
    this.scrimRight.style.left = `${this.cropX + this.cropW}px`;
    this.scrimRight.style.right = '0px';
    this.scrimRight.style.height = `${this.cropH}px`;

    // Update label ribbon di atas kotak crop
    this.dimensionChipText.textContent = `Pas Foto 4×6 — ${this.currentPreset.targetW} × ${this.currentPreset.targetH} px (${this.currentPreset.label})`;
  }

  openMobileInspector() {
    if (this.rightInspectorPanel) {
      this.rightInspectorPanel.classList.remove('translate-x-full');
      this.rightInspectorPanel.classList.add('translate-x-0');
    }
    if (this.inspectorBackdrop) {
      this.inspectorBackdrop.classList.remove('hidden');
    }
  }

  closeMobileInspector() {
    if (this.rightInspectorPanel) {
      this.rightInspectorPanel.classList.add('translate-x-full');
      this.rightInspectorPanel.classList.remove('translate-x-0');
    }
    if (this.inspectorBackdrop) {
      this.inspectorBackdrop.classList.add('hidden');
    }
  }

  initEvents() {
    // Mobile Drawer Toggle
    if (this.mobileToggleInspector) {
      this.mobileToggleInspector.addEventListener('click', () => this.openMobileInspector());
    }
    if (this.closeInspectorBtn) {
      this.closeInspectorBtn.addEventListener('click', () => this.closeMobileInspector());
    }
    if (this.inspectorBackdrop) {
      this.inspectorBackdrop.addEventListener('click', () => this.closeMobileInspector());
    }

    // Zoom Buttons & Slider
    this.zoomInBtn.addEventListener('click', () => this.setZoom(this.zoom + 0.15));
    this.zoomOutBtn.addEventListener('click', () => this.setZoom(this.zoom - 0.15));
    if (this.actualSizeBtn) {
      this.actualSizeBtn.addEventListener('click', () => {
        this.panX = 0;
        this.panY = 0;
        this.setZoom(1.0);
      });
    }
    this.fitWinBtn.addEventListener('click', () => this.fitToWindow());

    this.zoomSlider.addEventListener('input', (e) => {
      this.setZoom(parseInt(e.target.value) / 100);
    });

    // Wheel Zoom
    this.canvasArena.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      this.setZoom(this.zoom + delta);
    }, { passive: false });

    // Touch Pinch to Zoom Support for Mobile & Tablet
    let initialTouchDistance = null;
    let initialTouchZoom = 1.0;

    this.canvasArena.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        initialTouchDistance = Math.hypot(dx, dy);
        initialTouchZoom = this.zoom;
      }
    }, { passive: true });

    this.canvasArena.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && initialTouchDistance) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const currentDistance = Math.hypot(dx, dy);
        const scale = currentDistance / initialTouchDistance;
        this.setZoom(initialTouchZoom * scale);
      }
    }, { passive: true });

    this.canvasArena.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) {
        initialTouchDistance = null;
      }
    }, { passive: true });

    // Keyboard Shortcuts
    const isEditableTarget = (target) => {
      if (!target || !target.tagName) return false;
      const tag = target.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        tag === 'BUTTON' ||
        target.isContentEditable === true
      );
    };

    window.addEventListener('keydown', (e) => {
      // Escape menutup modal hasil yang sedang terbuka
      if (e.key === 'Escape' && !this.resultModal.classList.contains('hidden')) {
        this.closeResultModal();
        return;
      }

      // Jangan menyerobot pintasan saat fokus berada di kontrol formulir
      if (isEditableTarget(e.target)) return;

      if (e.code === 'Space' && !this.isSpacePressed) {
        e.preventDefault();
        this.isSpacePressed = true;
        this.updateCanvasCursor();
      }
      if (e.code === 'KeyC') {
        this.isPanMode = false;
        this.updatePanButtonsUI();
      }
      if (e.code === 'KeyH') {
        this.togglePanMode();
      }
      if (
        e.code === 'Enter' &&
        !e.repeat &&
        this.uploadModal.classList.contains('hidden') &&
        this.resultModal.classList.contains('hidden')
      ) {
        this.applyCrop();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.isSpacePressed = false;
        this.updateCanvasCursor();
      }
    });

    // Pan Toggle
    this.dockBtnPan.addEventListener('click', () => this.togglePanMode());
    if (this.toolPanLeft) {
      this.toolPanLeft.addEventListener('click', () => this.togglePanMode());
    }

    this.dockBtnCrop.addEventListener('click', () => {
      this.isPanMode = false;
      this.updatePanButtonsUI();
    });

    // Pusatkan Crop Box
    this.dockBtnCenter.addEventListener('click', () => this.recenterCropBox());
    this.cancelCropBtn.addEventListener('click', () => this.recenterCropBox());
    if (this.btnCenterTop) {
      this.btnCenterTop.addEventListener('click', () => this.recenterCropBox());
    }

    // Panning Drag (Pointer Events for unified Mouse & Touch)
    this.canvasArena.addEventListener('pointerdown', (e) => {
      if (this.isPanMode || this.isSpacePressed || e.button === 1) {
        this.isDraggingPan = true;
        this.panStartX = e.clientX - this.panX;
        this.panStartY = e.clientY - this.panY;
        this.canvasArena.style.cursor = 'grabbing';
      }
    });

    // Crop Marquee Drag (Pointer Events for Touch & Mouse)
    this.cropMarquee.addEventListener('pointerdown', (e) => {
      if (this.isPanMode || this.isSpacePressed) return;
      if (e.target.classList.contains('crop-handle')) return;

      e.stopPropagation();
      this.isMovingCrop = true;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.initialCrop = {
        x: this.cropX,
        y: this.cropY,
        w: this.cropW,
        h: this.cropH
      };
    });

    // 8 Grab Handles Resizing with Pointer Events
    const handles = this.cropMarquee.querySelectorAll('.crop-handle');
    handles.forEach((handle) => {
      handle.addEventListener('pointerdown', (e) => {
        if (this.isPanMode || this.isSpacePressed) return;
        e.stopPropagation();
        this.isResizingCrop = true;
        this.activeHandle = handle.dataset.handle;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.initialCrop = {
          x: this.cropX,
          y: this.cropY,
          w: this.cropW,
          h: this.cropH
        };
        try {
          handle.setPointerCapture(e.pointerId);
        } catch (err) {}
      });
    });

    // Global Pointer Move & Up
    window.addEventListener('pointermove', (e) => {
      if (this.isDraggingPan) {
        this.panX = e.clientX - this.panStartX;
        this.panY = e.clientY - this.panStartY;
        this.updateTransform();
      } else if (this.isMovingCrop) {
        this.handleMoveCrop(e);
      } else if (this.isResizingCrop) {
        this.handleResizeCrop(e);
      }
    });

    const handlePointerEnd = () => {
      this.isDraggingPan = false;
      this.isMovingCrop = false;
      this.isResizingCrop = false;
      this.activeHandle = null;
      this.updateCanvasCursor();
    };

    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);

    // DPI Presets Click
    this.presetButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const dpiKey = btn.dataset.dpi;
        if (DPI_PRESETS[dpiKey]) {
          this.selectPreset(dpiKey);
          // Auto-close drawer on small mobile if selected
          if (window.innerWidth < 640) {
            setTimeout(() => this.closeMobileInspector(), 200);
          }
        }
      });
    });

    // Rotasi & Flip
    this.rotationSlider.addEventListener('input', (e) => {
      const nilai = parseFloat(e.target.value);
      this.rotationDeg = Number.isFinite(nilai) ? Math.min(45, Math.max(-45, nilai)) : 0;
      this.rotationValChip.textContent = `${this.rotationDeg > 0 ? '+' : ''}${this.rotationDeg.toFixed(1)}°`;
      this.updateImageOrientation();
    });

    // Putar 90° dengan membakar rotasi ke bitmap sumber agar kotak crop tetap valid
    this.rotate90Btn.addEventListener('click', () => this.rotateQuarterTurn());

    this.flipHBtn.addEventListener('click', () => {
      this.flipH = !this.flipH;
      this.updateImageOrientation();
    });

    this.flipVBtn.addEventListener('click', () => {
      this.flipV = !this.flipV;
      this.updateImageOrientation();
    });

    this.resetParamsBtn.addEventListener('click', () => this.resetAdjustments());

    // Grid Toggle (kedua tombol mengendalikan overlay yang sama)
    const toggleGrid = () => {
      const isHidden = this.gridRuleThirds.classList.contains('hidden');
      this.setGridVisible(isHidden);
    };
    this.btnGridToggle.addEventListener('click', toggleGrid);
    if (this.btnGridThirds) {
      this.btnGridThirds.addEventListener('click', toggleGrid);
    }

    // Info & Hotkeys Modal Helper
    const showInfoAlert = () => {
      alert(`Panduan Standar Pas Foto 4×6:
• Ukuran Resmi 4×6 cm pada 300 DPI adalah 450 × 660 piksel (Rekomendasi Dokumen / Ijazah).
• Pada konversi digital umum: 472 × 709 piksel.
• Posisi wajah ideal berada di tengah dengan komposisi Rule of Thirds.
• Gunakan pan & zoom untuk memposisikan kepala dan bahu secara proporsional.`);
    };

    const showHotkeysAlert = () => {
      alert(`Pintasan Keyboard Photo Ijazah Untan (Part of SimalumApps):
• Spasi + Geser Mouse / Sentuh: Geser (Pan) kanvas
• Scroll Mouse / Cubit Layar: Zoom In / Zoom Out
• Tombol H: Beralih ke alat Hand (Pan)
• Tombol C: Beralih ke alat Crop Presisi
• Tombol Enter: Terapkan Pemotongan Foto`);
    };

    if (this.btnInfoLeft) this.btnInfoLeft.addEventListener('click', showInfoAlert);
    if (this.btnHotkeys) this.btnHotkeys.addEventListener('click', showHotkeysAlert);

    // Upload Modals
    const openModal = () => {
      this.uploadModal.classList.remove('hidden');
      this.uploadModal.classList.add('flex');
      this.browseBtn.focus();
    };
    const closeModal = () => {
      this.uploadModal.classList.add('hidden');
      this.uploadModal.classList.remove('flex');
      if (this.topUploadBtn) this.topUploadBtn.focus();
    };

    // Escape menutup modal unggah
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.uploadModal.classList.contains('hidden')) {
        closeModal();
      }
    });

    this.topUploadBtn.addEventListener('click', openModal);
    this.inspectorDropzone.addEventListener('click', openModal);
    this.closeModalBtn.addEventListener('click', closeModal);
    this.browseBtn.addEventListener('click', () => this.fileInput.click());

    this.uploadModal.addEventListener('click', (e) => {
      if (e.target === this.uploadModal) closeModal();
    });

    this.fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        this.handleUploadedFile(e.target.files[0]);
      }
    });

    // Drag & drop
    this.dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropzone.classList.add('border-secondary', 'bg-surface-container-high/60');
    });

    this.dropzone.addEventListener('dragleave', () => {
      this.dropzone.classList.remove('border-secondary', 'bg-surface-container-high/60');
    });

    this.dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropzone.classList.remove('border-secondary', 'bg-surface-container-high/60');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        this.handleUploadedFile(e.dataTransfer.files[0]);
      }
    });

    // Apply Crop
    this.topApplyBtn.addEventListener('click', () => this.applyCrop());
    this.dockBtnApply.addEventListener('click', () => this.applyCrop());
    this.applyCropBtn.addEventListener('click', () => this.applyCrop());

    // Result Modal
    this.closeResultModalBtn.addEventListener('click', () => this.closeResultModal());
    this.resultEditAgainBtn.addEventListener('click', () => this.closeResultModal());
    this.downloadFinalBtn.addEventListener('click', () => this.downloadCroppedPhoto());

    this.formatJpgBtn.addEventListener('click', () => this.selectOutputFormat('jpeg'));
    this.formatPngBtn.addEventListener('click', () => this.selectOutputFormat('png'));

    // Window Resize Clamping
    window.addEventListener('resize', () => {
      const imgW = this.sourceImage.offsetWidth;
      const imgH = this.sourceImage.offsetHeight;
      if (imgW && imgH) {
        this.cropW = Math.max(40, Math.min(this.cropW, imgW));
        this.cropH = Math.max(60, Math.min(this.cropH, imgH));
        this.cropX = Math.max(0, Math.min(this.cropX, imgW - this.cropW));
        this.cropY = Math.max(0, Math.min(this.cropY, imgH - this.cropH));
        this.renderCropMarquee();
      }
    });
  }

  togglePanMode() {
    this.isPanMode = !this.isPanMode;
    this.updatePanButtonsUI();
  }

  updatePanButtonsUI() {
    this.dockBtnPan.classList.toggle('bg-primary-container', this.isPanMode);
    this.dockBtnPan.classList.toggle('text-on-primary-container', this.isPanMode);
    if (this.toolPanLeft) {
      this.toolPanLeft.classList.toggle('bg-primary-container', this.isPanMode);
      this.toolPanLeft.classList.toggle('text-on-primary-container', this.isPanMode);
    }
    this.dockBtnCrop.classList.toggle('bg-primary-container', !this.isPanMode);
    this.dockBtnCrop.classList.toggle('text-on-primary-container', !this.isPanMode);
    this.updateCanvasCursor();
  }

  handleMoveCrop(e) {
    const dx = (e.clientX - this.dragStartX) / this.zoom;
    const dy = (e.clientY - this.dragStartY) / this.zoom;

    this.cropX = Math.round(this.initialCrop.x + dx);
    this.cropY = Math.round(this.initialCrop.y + dy);
    this.renderCropMarquee();
  }

  handleResizeCrop(e) {
    const dx = (e.clientX - this.dragStartX) / this.zoom;
    const dy = (e.clientY - this.dragStartY) / this.zoom;
    const ratio = this.currentPreset.targetW / this.currentPreset.targetH; // e.g. 450/660 ~ 0.6818

    const imgW = this.sourceImage.offsetWidth;
    const imgH = this.sourceImage.offsetHeight;
    if (!imgW || !imgH) return;

    let { x, y, w, h } = this.initialCrop;
    const handle = this.activeHandle;

    if (handle === 'br') {
      w = Math.max(40, this.initialCrop.w + dx);
      h = Math.round(w / ratio);
      if (x + w > imgW) {
        w = imgW - x;
        h = Math.round(w / ratio);
      }
      if (y + h > imgH) {
        h = imgH - y;
        w = Math.round(h * ratio);
      }
    } else if (handle === 'bl') {
      w = Math.max(40, this.initialCrop.w - dx);
      h = Math.round(w / ratio);
      let proposedX = this.initialCrop.x + (this.initialCrop.w - w);
      if (proposedX < 0) {
        w = this.initialCrop.x + this.initialCrop.w;
        h = Math.round(w / ratio);
        proposedX = 0;
      }
      if (y + h > imgH) {
        h = imgH - y;
        w = Math.round(h * ratio);
        proposedX = this.initialCrop.x + (this.initialCrop.w - w);
      }
      x = proposedX;
    } else if (handle === 'tr') {
      w = Math.max(40, this.initialCrop.w + dx);
      h = Math.round(w / ratio);
      let proposedY = this.initialCrop.y + (this.initialCrop.h - h);
      if (x + w > imgW) {
        w = imgW - x;
        h = Math.round(w / ratio);
        proposedY = this.initialCrop.y + (this.initialCrop.h - h);
      }
      if (proposedY < 0) {
        h = this.initialCrop.y + this.initialCrop.h;
        w = Math.round(h * ratio);
        proposedY = 0;
      }
      y = proposedY;
    } else if (handle === 'tl') {
      w = Math.max(40, this.initialCrop.w - dx);
      h = Math.round(w / ratio);
      let proposedX = this.initialCrop.x + (this.initialCrop.w - w);
      let proposedY = this.initialCrop.y + (this.initialCrop.h - h);
      if (proposedX < 0) {
        w = this.initialCrop.x + this.initialCrop.w;
        h = Math.round(w / ratio);
        proposedX = 0;
        proposedY = this.initialCrop.y + (this.initialCrop.h - h);
      }
      if (proposedY < 0) {
        h = this.initialCrop.y + this.initialCrop.h;
        w = Math.round(h * ratio);
        proposedY = 0;
        proposedX = this.initialCrop.x + (this.initialCrop.w - w);
      }
      x = proposedX;
      y = proposedY;
    } else if (handle === 'b') {
      h = Math.max(60, this.initialCrop.h + dy);
      w = Math.round(h * ratio);
      let proposedX = this.initialCrop.x + (this.initialCrop.w - w) / 2;
      if (y + h > imgH) {
        h = imgH - y;
        w = Math.round(h * ratio);
        proposedX = this.initialCrop.x + (this.initialCrop.w - w) / 2;
      }
      if (proposedX < 0) proposedX = 0;
      if (proposedX + w > imgW) proposedX = imgW - w;
      x = proposedX;
    } else if (handle === 't') {
      h = Math.max(60, this.initialCrop.h - dy);
      w = Math.round(h * ratio);
      let proposedY = this.initialCrop.y + (this.initialCrop.h - h);
      let proposedX = this.initialCrop.x + (this.initialCrop.w - w) / 2;
      if (proposedY < 0) {
        h = this.initialCrop.y + this.initialCrop.h;
        w = Math.round(h * ratio);
        proposedY = 0;
        proposedX = this.initialCrop.x + (this.initialCrop.w - w) / 2;
      }
      if (proposedX < 0) proposedX = 0;
      if (proposedX + w > imgW) proposedX = imgW - w;
      x = proposedX;
      y = proposedY;
    } else if (handle === 'r') {
      w = Math.max(40, this.initialCrop.w + dx);
      h = Math.round(w / ratio);
      let proposedY = this.initialCrop.y + (this.initialCrop.h - h) / 2;
      if (x + w > imgW) {
        w = imgW - x;
        h = Math.round(w / ratio);
        proposedY = this.initialCrop.y + (this.initialCrop.h - h) / 2;
      }
      if (proposedY < 0) proposedY = 0;
      if (proposedY + h > imgH) proposedY = imgH - h;
      x = this.initialCrop.x;
      y = proposedY;
    } else if (handle === 'l') {
      w = Math.max(40, this.initialCrop.w - dx);
      h = Math.round(w / ratio);
      let proposedX = this.initialCrop.x + (this.initialCrop.w - w);
      let proposedY = this.initialCrop.y + (this.initialCrop.h - h) / 2;
      if (proposedX < 0) {
        w = this.initialCrop.x + this.initialCrop.w;
        h = Math.round(w / ratio);
        proposedX = 0;
        proposedY = this.initialCrop.y + (this.initialCrop.h - h) / 2;
      }
      if (proposedY < 0) proposedY = 0;
      if (proposedY + h > imgH) proposedY = imgH - h;
      x = proposedX;
      y = proposedY;
    }

    // Final Clamping
    this.cropW = Math.max(40, Math.min(Math.round(w), imgW));
    this.cropH = Math.max(60, Math.min(Math.round(h), imgH));
    this.cropX = Math.max(0, Math.min(Math.round(x), imgW - this.cropW));
    this.cropY = Math.max(0, Math.min(Math.round(y), imgH - this.cropH));

    this.renderCropMarquee();
  }

  selectPreset(key) {
    this.currentPresetKey = key;
    this.currentPreset = DPI_PRESETS[key];

    this.presetButtons.forEach((btn) => {
      const isCurrent = btn.dataset.dpi === key;
      const primed = isCurrent && key === '300';

      btn.classList.toggle('active-preset', isCurrent);
      btn.classList.toggle('border-primary', isCurrent);
      btn.classList.toggle('border-outline-variant/30', !isCurrent);
      btn.classList.toggle('bg-primary-container', primed);
      btn.classList.toggle('text-on-primary-container', primed);
      btn.classList.toggle('bg-surface-container-high', isCurrent && !primed);
      btn.classList.toggle('bg-surface-container', !isCurrent);
      btn.classList.toggle('text-on-surface-variant', !isCurrent);
      btn.setAttribute('aria-pressed', isCurrent ? 'true' : 'false');
    });

    // Preset "Konversi Digital" tidak menyebut DPI; tampilkan resolusi sebenarnya
    const dpiAktif = this.resolvePresetDpi();
    this.badgeActiveDpi.textContent = `${dpiAktif} DPI Aktif`;
    this.barResolution.textContent = `${this.currentPreset.targetW} × ${this.currentPreset.targetH} px`;
    this.telemetryResolution.textContent = `${this.currentPreset.targetW} × ${this.currentPreset.targetH} px`;
    this.telemetryPhysical.textContent = `${this.currentPreset.cm} (~4 × 6 cm)`;
    this.telemetryDpi.textContent = `${dpiAktif} DPI • sRGB Pas Foto`;
    this.telemetryTag.textContent = `${dpiAktif} DPI Cetak`;

    // Sesuaikan aspek rasio crop box sesuai preset baru
    const targetRatio = this.currentPreset.targetW / this.currentPreset.targetH;
    const imgW = this.sourceImage.offsetWidth;
    const imgH = this.sourceImage.offsetHeight;
    if (!imgW || !imgH || !this.cropH) {
      return;
    }

    let newW = Math.max(40, Math.round(this.cropH * targetRatio));
    let newH = Math.round(newW / targetRatio);
    if (newW > imgW) {
      newW = imgW;
      newH = Math.round(newW / targetRatio);
    }
    if (newH > imgH) {
      newH = imgH;
      newW = Math.round(newH * targetRatio);
    }

    this.cropW = newW;
    this.cropH = newH;
    this.cropX = Math.max(0, Math.min(this.cropX, imgW - this.cropW));
    this.cropY = Math.max(0, Math.min(this.cropY, imgH - this.cropH));

    this.renderCropMarquee();
  }

  resolvePresetDpi() {
    const value = Number(this.currentPreset.dpi);
    if (Number.isFinite(value) && value > 0) return Math.round(value);

    // Preset "Konversi Digital" tidak menyebut DPI eksplisit:
    // hitung dari lebar target terhadap dimensi fisik 3,99 cm.
    return Math.round(this.currentPreset.targetW / (3.99 / 2.54));
  }

  updateImageOrientation() {
    const scaleX = this.flipH ? -1 : 1;
    const scaleY = this.flipV ? -1 : 1;
    this.sourceImage.style.transform = `rotate(${this.rotationDeg}deg) scale(${scaleX}, ${scaleY})`;
  }

  /** Menampilkan / menyembunyikan panduan grid dan menyinkronkan status tombolnya. */
  setGridVisible(visible) {
    if (!this.gridRuleThirds || !this.gridCrosshair) return;

    this.gridRuleThirds.classList.toggle('hidden', !visible);
    this.gridCrosshair.classList.toggle('hidden', !visible);

    if (this.gridToggleText) {
      this.gridToggleText.textContent = visible ? 'Sembunyikan' : 'Tampilkan';
    }
    const toggleIcon = this.btnGridToggle.querySelector('.material-symbols-outlined');
    if (toggleIcon) toggleIcon.textContent = visible ? 'visibility' : 'visibility_off';

    if (this.btnGridThirds) {
      this.btnGridThirds.classList.toggle('bg-surface-container-high', visible);
      this.btnGridThirds.classList.toggle('text-primary', visible);
      this.btnGridThirds.classList.toggle('border-primary/30', visible);
      this.btnGridThirds.classList.toggle('bg-surface-container', !visible);
      this.btnGridThirds.classList.toggle('text-on-surface-variant', !visible);
      this.btnGridThirds.classList.toggle('border-outline-variant/30', !visible);
      this.btnGridThirds.setAttribute('aria-pressed', visible ? 'true' : 'false');
    }
  }

  recenterCropBox() {
    const imgW = this.sourceImage.offsetWidth;
    const imgH = this.sourceImage.offsetHeight;
    this.cropX = Math.round((imgW - this.cropW) / 2);
    this.cropY = Math.round((imgH - this.cropH) / 2);
    this.renderCropMarquee();
  }

  setZoom(val) {
    const numeric = Number(val);
    const clamped = Number.isFinite(numeric) ? Math.min(Math.max(numeric, 0.1), 3.0) : 1.0;
    this.zoom = clamped;
    const pct = Math.round(this.zoom * 100);
    this.zoomIndicator.textContent = `${pct}%`;
    this.zoomSlider.value = pct;
    this.updateTransform();
  }

  fitToWindow() {
    const imgW = this.sourceImage.offsetWidth;
    const imgH = this.sourceImage.offsetHeight;
    if (!imgW || !imgH || !this.canvasArena) {
      this.panX = 0;
      this.panY = 0;
      this.setZoom(1.0);
      return;
    }

    const arenaRect = this.canvasArena.getBoundingClientRect();
    const availableW = Math.max(120, arenaRect.width - 48);
    const availableH = Math.max(120, arenaRect.height - 48);
    // Skala agar seluruh foto muat di arena, tanpa memperbesar melebihi 100%
    const fit = Math.min(availableW / imgW, availableH / imgH, 1);

    this.panX = 0;
    this.panY = 0;
    this.setZoom(fit);
  }

  updateTransform() {
    this.compWrapper.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
  }

  updateCanvasCursor() {
    if (this.isPanMode || this.isSpacePressed) {
      this.canvasArena.style.cursor = 'grab';
    } else {
      this.canvasArena.style.cursor = 'default';
    }
  }

  async handleUploadedFile(file) {
    if (!file) return;

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      alert('Format berkas tidak didukung. Gunakan JPG, PNG, atau WEBP.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      alert(
        `Ukuran berkas terlalu besar (maksimal ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB).`
      );
      return;
    }

    if (this.isBusy) return;

    this.showLoading(true);
    this.isBusy = true;
    try {
      // Reset seluruh transformasi untuk sumber baru
      this.rotationDeg = 0;
      this.flipH = false;
      this.flipV = false;
      this.rotationSlider.value = '0';
      this.rotationValChip.textContent = '0.0°';
      this.updateImageOrientation();

      await this.applySourceBlob(file, file.name, 0);

      this.uploadModal.classList.add('hidden');
      this.uploadModal.classList.remove('flex');
    } catch (err) {
      console.error('Gagal membaca gambar:', err);
      alert('Terjadi kesalahan saat memproses gambar: ' + err.message);
    } finally {
      this.isBusy = false;
      this.showLoading(false);
    }
  }

  /** Memutar bitmap sumber 90° searah jarum jam lalu mengatur ulang kotak crop. */
  async rotateQuarterTurn() {
    if (!this.baseBlob || this.isBusy) return;

    const targetTurns = (this.quarterTurns + 1) % 4;
    this.showLoading(true);
    this.isBusy = true;
    try {
      await this.applySourceBlob(this.baseBlob, this.sourceFileName, targetTurns, false);
    } catch (err) {
      console.error('Gagal memutar gambar:', err);
      alert('Gagal memutar gambar: ' + err.message);
    } finally {
      this.isBusy = false;
      this.showLoading(false);
    }
  }

  /** Mengembalikan rotasi, flip, dan zoom ke kondisi awal. */
  async resetAdjustments() {
    if (this.isBusy) return;

    this.showLoading(true);
    this.isBusy = true;
    try {
      if (this.baseBlob && this.quarterTurns !== 0) {
        await this.applySourceBlob(this.baseBlob, this.sourceFileName, 0, false);
      }
      this.rotationDeg = 0;
      this.flipH = false;
      this.flipV = false;
      this.rotationSlider.value = '0';
      this.rotationValChip.textContent = '0.0°';
      this.updateImageOrientation();
      this.setZoom(1.0);
      this.recenterCropBox();
    } catch (err) {
      console.error('Gagal mereset penyesuaian:', err);
      alert('Gagal mereset penyesuaian: ' + err.message);
    } finally {
      this.isBusy = false;
      this.showLoading(false);
    }
  }

  async applyCrop() {
    if (this.isBusy) return;
    if (!this.sourceBuffer) {
      alert('Belum ada gambar yang dimuat.');
      return;
    }

    const imgW = this.sourceImage.offsetWidth;
    const imgH = this.sourceImage.offsetHeight;
    if (!imgW || !imgH) {
      alert('Gambar belum siap. Tunggu hingga pratinjau selesai dimuat.');
      return;
    }

    // Hitung koordinat crop relatif terhadap ukuran asli gambar
    const scaleX = this.naturalW / imgW;
    const scaleY = this.naturalH / imgH;
    if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) {
      alert('Ukuran gambar tidak valid untuk dipotong.');
      return;
    }

    // Batasi ke area gambar agar pembulatan sub-piksel tidak melewati batas engine
    const exactCropW = Math.min(this.naturalW, Math.max(1, Math.round(this.cropW * scaleX)));
    const exactCropH = Math.min(this.naturalH, Math.max(1, Math.round(this.cropH * scaleY)));
    const exactCropX = Math.min(
      Math.max(0, Math.round(this.cropX * scaleX)),
      this.naturalW - exactCropW
    );
    const exactCropY = Math.min(
      Math.max(0, Math.round(this.cropY * scaleY)),
      this.naturalH - exactCropH
    );

    this.showLoading(true);
    this.isBusy = true;

    try {
      // Beri kesempatan overlay loading tampil sebelum komputasi berat di engine
      await this.nextFrame();

      const result = await this.wasmEngine.cropImage(this.sourceBuffer, {
        cropX: exactCropX,
        cropY: exactCropY,
        cropW: exactCropW,
        cropH: exactCropH,
        targetW: this.currentPreset.targetW,
        targetH: this.currentPreset.targetH,
        // Hanya rotasi halus; putaran 90° sudah dibakar ke bitmap sumber
        rotationDeg: this.rotationDeg,
        flipH: this.flipH,
        flipV: this.flipV,
        format: this.currentFormat,
        dpi: this.resolvePresetDpi(),
      });

      this.releaseResultUrl();
      this.lastCropResult = result;
      this.showCroppedResult(result);
    } catch (err) {
      console.error('Pemotongan via Rust WASM gagal:', err);
      alert('Gagal memotong foto: ' + err.message);
    } finally {
      this.isBusy = false;
      this.showLoading(false);
    }
  }

  /** Melepas object URL hasil crop sebelumnya agar tidak menumpuk di memori. */
  releaseResultUrl() {
    if (this.lastCropResult && this.lastCropResult.url) {
      URL.revokeObjectURL(this.lastCropResult.url);
    }
    this.lastCropResult = null;
  }

  showCroppedResult(result) {
    this.resultImagePreview.src = result.url;
    this.resultPxDim.textContent = `${result.width} × ${result.height} px`;
    this.resultCmDim.textContent = this.currentPreset.cm;
    this.resultDpiInfo.textContent = `${result.dpi} DPI • ${this.currentPreset.category.split('/')[0].trim()}`;
    if (this.resultBadgeRatio) {
      this.resultBadgeRatio.textContent = `Rasio ${result.width}:${result.height}`;
    }

    const kb = (result.sizeBytes / 1024).toFixed(1);
    this.resultFilesize.textContent = `~${kb} KB (${result.format.toUpperCase()})`;

    this.resultModal.classList.remove('hidden');
    this.resultModal.classList.add('flex');
    if (this.downloadFinalBtn) this.downloadFinalBtn.focus();
  }

  closeResultModal() {
    this.resultModal.classList.add('hidden');
    this.resultModal.classList.remove('flex');
    // Lepas URL hasil agar memori tidak terus bertambah
    this.releaseResultUrl();
    this.resultImagePreview.removeAttribute('src');
    if (this.topApplyBtn) this.topApplyBtn.focus();
  }

  selectOutputFormat(format) {
    this.currentFormat = format;

    this.formatJpgBtn.classList.toggle('bg-primary-container', format === 'jpeg');
    this.formatJpgBtn.classList.toggle('text-on-primary-container', format === 'jpeg');
    this.formatJpgBtn.classList.toggle('bg-surface-container', format !== 'jpeg');
    this.formatJpgBtn.classList.toggle('text-on-surface-variant', format !== 'jpeg');

    this.formatPngBtn.classList.toggle('bg-primary-container', format === 'png');
    this.formatPngBtn.classList.toggle('text-on-primary-container', format === 'png');
    this.formatPngBtn.classList.toggle('bg-surface-container', format !== 'png');
    this.formatPngBtn.classList.toggle('text-on-surface-variant', format !== 'png');

    if (!this.resultModal.classList.contains('hidden')) {
      this.applyCrop();
    }
  }

  downloadCroppedPhoto() {
    if (!this.lastCropResult || !this.lastCropResult.url) {
      alert('Tidak ada foto yang siap diunduh.');
      return;
    }

    const ext = this.lastCropResult.format === 'png' ? 'png' : 'jpg';
    const dpiTag = `${this.lastCropResult.dpi}dpi`;
    const dimTag = `${this.lastCropResult.width}x${this.lastCropResult.height}`;
    const baseName = (this.sourceFileName || 'foto').replace(/\.[^/.]+$/, '') || 'foto';
    const downloadName = `pas_foto_4x6_${baseName}_${dpiTag}_${dimTag}.${ext}`;

    const a = document.createElement('a');
    a.href = this.lastCropResult.url;
    a.download = downloadName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  showLoading(show) {
    if (show) {
      this.loadingOverlay.classList.remove('hidden');
      this.loadingOverlay.classList.add('flex');
    } else {
      this.loadingOverlay.classList.add('hidden');
      this.loadingOverlay.classList.remove('flex');
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.photoCropApp = new PhotoCropApp();
});
