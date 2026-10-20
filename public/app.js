import { WasmCropEngine } from './wasm_bridge.js';

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
    this.rotationDeg = 0.0;
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

    // Hasil Crop Terakhir
    this.lastCropResult = null;

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
    this.sourceFileName = fileName;
    this.headerFilename.textContent = fileName;

    const response = await fetch(srcUrl);
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    this.sourceBuffer = new Uint8Array(arrayBuffer);

    const onImgLoaded = () => {
      this.naturalW = this.sourceImage.naturalWidth || 1200;
      this.naturalH = this.sourceImage.naturalHeight || 1600;

      const resText = `${this.naturalW} × ${this.naturalH} px`;
      this.headerResolution.textContent = `(${resText})`;

      requestAnimationFrame(() => {
        this.setupDefaultCropBox();
        this.fitToWindow();
      });
    };

    if (this.sourceImage.complete && this.sourceImage.naturalWidth > 0) {
      onImgLoaded();
    } else {
      this.sourceImage.onload = onImgLoaded;
    }

    this.sourceImage.src = URL.createObjectURL(blob);
  }

  setupDefaultCropBox() {
    const ratio = this.currentPreset.targetW / this.currentPreset.targetH; // 450 / 660 ~ 0.6818
    const imgW = this.sourceImage.offsetWidth || 400;
    const imgH = this.sourceImage.offsetHeight || 580;

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

    // Boundary clamping
    this.cropW = Math.max(40, Math.min(this.cropW, imgW));
    this.cropH = Math.max(60, Math.min(this.cropH, imgH));
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

  initEvents() {
    // Zoom Buttons & Slider
    this.zoomInBtn.addEventListener('click', () => this.setZoom(this.zoom + 0.15));
    this.zoomOutBtn.addEventListener('click', () => this.setZoom(this.zoom - 0.15));
    this.actualSizeBtn.addEventListener('click', () => {
      this.panX = 0;
      this.panY = 0;
      this.setZoom(1.0);
    });
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

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !this.isSpacePressed && e.target.tagName !== 'INPUT') {
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
      if (e.code === 'Enter' && this.uploadModal.classList.contains('hidden') && this.resultModal.classList.contains('hidden')) {
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
    this.toolPanLeft.addEventListener('click', () => this.togglePanMode());

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

    // Panning Mouse Drag
    this.canvasArena.addEventListener('mousedown', (e) => {
      if (this.isPanMode || this.isSpacePressed || e.button === 1) {
        this.isDraggingPan = true;
        this.panStartX = e.clientX - this.panX;
        this.panStartY = e.clientY - this.panY;
        this.canvasArena.style.cursor = 'grabbing';
      }
    });

    window.addEventListener('mousemove', (e) => {
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

    window.addEventListener('mouseup', () => {
      this.isDraggingPan = false;
      this.isMovingCrop = false;
      this.isResizingCrop = false;
      this.activeHandle = null;
      this.updateCanvasCursor();
    });

    // Crop Marquee Drag
    this.cropMarquee.addEventListener('mousedown', (e) => {
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

    // 8 Grab Handles Resizing
    const handles = this.cropMarquee.querySelectorAll('.crop-handle');
    handles.forEach((handle) => {
      handle.addEventListener('mousedown', (e) => {
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
      });
    });

    // DPI Presets Click
    this.presetButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const dpiKey = btn.dataset.dpi;
        if (DPI_PRESETS[dpiKey]) {
          this.selectPreset(dpiKey);
        }
      });
    });

    // Rotasi & Flip
    this.rotationSlider.addEventListener('input', (e) => {
      this.rotationDeg = parseFloat(e.target.value);
      this.rotationValChip.textContent = `${this.rotationDeg > 0 ? '+' : ''}${this.rotationDeg.toFixed(1)}°`;
      this.updateImageOrientation();
    });

    this.rotate90Btn.addEventListener('click', () => {
      this.rotationDeg = (this.rotationDeg + 90) % 360;
      this.rotationSlider.value = 0;
      this.rotationValChip.textContent = `${this.rotationDeg}°`;
      this.updateImageOrientation();
    });

    this.flipHBtn.addEventListener('click', () => {
      this.flipH = !this.flipH;
      this.updateImageOrientation();
    });

    this.flipVBtn.addEventListener('click', () => {
      this.flipV = !this.flipV;
      this.updateImageOrientation();
    });

    this.resetParamsBtn.addEventListener('click', () => {
      this.rotationDeg = 0;
      this.flipH = false;
      this.flipV = false;
      this.rotationSlider.value = 0;
      this.rotationValChip.textContent = '0.0°';
      this.updateImageOrientation();
      this.recenterCropBox();
      this.setZoom(1.0);
    });

    // Grid Toggle
    this.btnGridToggle.addEventListener('click', () => {
      const isHidden = this.gridRuleThirds.classList.contains('hidden');
      if (isHidden) {
        this.gridRuleThirds.classList.remove('hidden');
        this.gridCrosshair.classList.remove('hidden');
        this.gridToggleText.textContent = 'Sembunyikan';
        this.btnGridToggle.querySelector('.material-symbols-outlined').textContent = 'visibility';
      } else {
        this.gridRuleThirds.classList.add('hidden');
        this.gridCrosshair.classList.add('hidden');
        this.gridToggleText.textContent = 'Tampilkan';
        this.btnGridToggle.querySelector('.material-symbols-outlined').textContent = 'visibility_off';
      }
    });

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
• Spasi + Geser Mouse: Geser (Pan) kanvas
• Scroll Mouse: Zoom In / Zoom Out
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
    };
    const closeModal = () => {
      this.uploadModal.classList.add('hidden');
      this.uploadModal.classList.remove('flex');
    };

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
  }

  togglePanMode() {
    this.isPanMode = !this.isPanMode;
    this.updatePanButtonsUI();
  }

  updatePanButtonsUI() {
    this.dockBtnPan.classList.toggle('bg-primary-container', this.isPanMode);
    this.dockBtnPan.classList.toggle('text-on-primary-container', this.isPanMode);
    this.toolPanLeft.classList.toggle('bg-primary-container', this.isPanMode);
    this.toolPanLeft.classList.toggle('text-on-primary-container', this.isPanMode);
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
      w = Math.max(50, this.initialCrop.w + dx);
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
      w = Math.max(50, this.initialCrop.w - dx);
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
      w = Math.max(50, this.initialCrop.w + dx);
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
      w = Math.max(50, this.initialCrop.w - dx);
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
      h = Math.max(70, this.initialCrop.h + dy);
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
      h = Math.max(70, this.initialCrop.h - dy);
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
      w = Math.max(50, this.initialCrop.w + dx);
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
      w = Math.max(50, this.initialCrop.w - dx);
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
      btn.classList.toggle('active-preset', isCurrent);
      if (isCurrent) {
        btn.classList.add('border-primary');
        if (key === '300') {
          btn.classList.add('bg-primary-container', 'text-on-primary-container');
        } else {
          btn.classList.add('bg-surface-container-high');
        }
      } else {
        btn.classList.remove('border-primary');
        if (btn.dataset.dpi === '300') {
          btn.classList.remove('bg-primary-container', 'text-on-primary-container');
          btn.classList.add('bg-surface-container');
        } else {
          btn.classList.remove('bg-surface-container-high');
        }
      }
    });

    this.badgeActiveDpi.textContent = `${this.currentPreset.dpi} DPI Aktif`;
    this.barResolution.textContent = `${this.currentPreset.targetW} × ${this.currentPreset.targetH} px`;
    this.telemetryResolution.textContent = `${this.currentPreset.targetW} × ${this.currentPreset.targetH} px`;
    this.telemetryPhysical.textContent = `${this.currentPreset.cm} (~4 × 6 cm)`;
    this.telemetryDpi.textContent = `${this.currentPreset.dpi} DPI • sRGB Pas Foto`;
    this.telemetryTag.textContent = `${this.currentPreset.dpi} DPI Cetak`;

    // Sesuaikan aspek rasio crop box sesuai preset baru
    const targetRatio = this.currentPreset.targetW / this.currentPreset.targetH;
    const imgW = this.sourceImage.offsetWidth;
    const imgH = this.sourceImage.offsetHeight;

    let newW = Math.round(this.cropH * targetRatio);
    if (newW > imgW) {
      newW = imgW;
      this.cropH = Math.round(newW / targetRatio);
    }
    this.cropW = newW;
    this.cropX = Math.max(0, Math.min(this.cropX, imgW - this.cropW));
    this.cropY = Math.max(0, Math.min(this.cropY, imgH - this.cropH));

    this.renderCropMarquee();
  }

  updateImageOrientation() {
    const scaleX = this.flipH ? -1 : 1;
    const scaleY = this.flipV ? -1 : 1;
    this.sourceImage.style.transform = `rotate(${this.rotationDeg}deg) scale(${scaleX}, ${scaleY})`;
  }

  recenterCropBox() {
    const imgW = this.sourceImage.offsetWidth;
    const imgH = this.sourceImage.offsetHeight;
    this.cropX = Math.round((imgW - this.cropW) / 2);
    this.cropY = Math.round((imgH - this.cropH) / 2);
    this.renderCropMarquee();
  }

  setZoom(val) {
    this.zoom = Math.min(Math.max(val, 0.25), 3.0);
    const pct = Math.round(this.zoom * 100);
    this.zoomIndicator.textContent = `${pct}%`;
    this.zoomSlider.value = pct;
    this.updateTransform();
  }

  fitToWindow() {
    this.panX = 0;
    this.panY = 0;
    this.setZoom(1.0);
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
    if (!file || !file.type.startsWith('image/')) {
      alert('Harap pilih berkas gambar yang valid (JPG, PNG, atau WEBP).');
      return;
    }

    this.showLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      this.sourceBuffer = new Uint8Array(buffer);
      this.sourceFileName = file.name;
      this.headerFilename.textContent = file.name;

      const blob = new Blob([this.sourceBuffer], { type: file.type });
      const objUrl = URL.createObjectURL(blob);

      this.sourceImage.onload = () => {
        this.naturalW = this.sourceImage.naturalWidth;
        this.naturalH = this.sourceImage.naturalHeight;
        const resText = `${this.naturalW} × ${this.naturalH} px`;
        this.headerResolution.textContent = `(${resText})`;

        requestAnimationFrame(() => {
          this.setupDefaultCropBox();
          this.fitToWindow();
          this.uploadModal.classList.add('hidden');
          this.uploadModal.classList.remove('flex');
          this.showLoading(false);
        });
      };

      this.sourceImage.src = objUrl;
    } catch (err) {
      this.showLoading(false);
      console.error('Gagal membaca gambar:', err);
      alert('Terjadi kesalahan saat memproses gambar: ' + err.message);
    }
  }

  async applyCrop() {
    if (!this.sourceBuffer) {
      alert('Belum ada gambar yang dimuat.');
      return;
    }

    this.showLoading(true);

    try {
      // Hitung koordinat crop relatif terhadap ukuran asli gambar
      const scaleX = this.naturalW / this.sourceImage.offsetWidth;
      const scaleY = this.naturalH / this.sourceImage.offsetHeight;

      const exactCropX = Math.round(this.cropX * scaleX);
      const exactCropY = Math.round(this.cropY * scaleY);
      const exactCropW = Math.round(this.cropW * scaleX);
      const exactCropH = Math.round(this.cropH * scaleY);

      const targetW = this.currentPreset.targetW;
      const targetH = this.currentPreset.targetH;

      const result = await this.wasmEngine.cropImage(this.sourceBuffer, {
        cropX: exactCropX,
        cropY: exactCropY,
        cropW: exactCropW,
        cropH: exactCropH,
        targetW: targetW,
        targetH: targetH,
        rotationDeg: this.rotationDeg,
        flipH: this.flipH,
        flipV: this.flipV,
        format: this.currentFormat,
      });

      this.lastCropResult = result;
      this.showCroppedResult(result);
    } catch (err) {
      console.error('Pemotongan via Rust WASM gagal:', err);
      alert('Gagal memotong foto: ' + err.message);
    } finally {
      this.showLoading(false);
    }
  }

  showCroppedResult(result) {
    this.resultImagePreview.src = result.url;
    this.resultPxDim.textContent = `${result.width} × ${result.height} px`;
    this.resultCmDim.textContent = this.currentPreset.cm;
    this.resultDpiInfo.textContent = `${this.currentPreset.dpi} DPI • ${this.currentPreset.category.split('/')[0].trim()}`;
    
    const kb = (result.sizeBytes / 1024).toFixed(1);
    this.resultFilesize.textContent = `~${kb} KB (${result.format.toUpperCase()})`;

    this.resultModal.classList.remove('hidden');
    this.resultModal.classList.add('flex');
  }

  closeResultModal() {
    this.resultModal.classList.add('hidden');
    this.resultModal.classList.remove('flex');
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

    const ext = this.currentFormat === 'png' ? 'png' : 'jpg';
    const dpiTag = `${this.currentPreset.dpi}dpi`;
    const dimTag = `${this.lastCropResult.width}x${this.lastCropResult.height}`;
    const baseName = this.sourceFileName.replace(/\.[^/.]+$/, '');
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
