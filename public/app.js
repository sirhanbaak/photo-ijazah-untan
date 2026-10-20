import { WasmCropEngine } from './wasm_bridge.js';

// Konfigurasi Preset Ukuran Pas Foto 4x6 berdasarkan DPI
const DPI_PRESETS = {
  '72': {
    dpi: 72,
    targetW: 108,
    targetH: 158,
    label: '72 DPI (Layar Standar)',
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
    label: '300 DPI (Standar Cetak Tajam / Dokumen Resmi)',
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
    label: 'Standar Konversi Digital Umum',
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
    this.naturalW = 0;
    this.naturalH = 0;
    this.displayedW = 0;
    this.displayedH = 0;

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
    this.headerApplyBtn = document.getElementById('header-apply-btn');
    this.zoomIndicator = document.getElementById('zoom-indicator');
    this.zoomInBtn = document.getElementById('zoom-in-btn');
    this.zoomOutBtn = document.getElementById('zoom-out-btn');
    this.fitWinBtn = document.getElementById('fit-win-btn');
    this.actualSizeBtn = document.getElementById('actual-size-btn');

    // Kanvas & Elemen Interaktif
    this.canvasArena = document.getElementById('canvas-arena');
    this.compWrapper = document.getElementById('composition-wrapper');
    this.imageContainer = document.getElementById('image-container');
    this.sourceImage = document.getElementById('source-image');
    this.cropMarquee = document.getElementById('crop-marquee');
    this.dimensionChipText = document.getElementById('dimension-chip-text');

    // Scrim pieces
    this.scrimTop = document.getElementById('scrim-top');
    this.scrimBottom = document.getElementById('scrim-bottom');
    this.scrimLeft = document.getElementById('scrim-left');
    this.scrimRight = document.getElementById('scrim-right');

    // Dock Tools
    this.dockBtnPan = document.getElementById('dock-btn-pan');
    this.dockBtnMove = document.getElementById('dock-btn-move');
    this.dockBtnCenter = document.getElementById('dock-btn-center');
    this.dockBtnApply = document.getElementById('dock-btn-apply');
    this.toolPanToggle = document.getElementById('tool-pan-toggle');

    // Inspector
    this.presetButtons = document.querySelectorAll('.preset-btn');
    this.badgeActiveDpi = document.getElementById('badge-active-dpi');
    this.rotationSlider = document.getElementById('rotation-slider');
    this.rotationValChip = document.getElementById('rotation-val-chip');
    this.rotate90Btn = document.getElementById('rotate-90-btn');
    this.flipHBtn = document.getElementById('flip-h-btn');
    this.flipVBtn = document.getElementById('flip-v-btn');
    this.resetParamsBtn = document.getElementById('reset-params-btn');
    this.btnRecenter = document.getElementById('btn-recenter');
    this.applyCropBtn = document.getElementById('apply-crop-btn');

    // Telemetri
    this.telemetryPresetTag = document.getElementById('telemetry-preset-tag');
    this.telemetryResolution = document.getElementById('telemetry-resolution');
    this.telemetryPhysical = document.getElementById('telemetry-physical');
    this.telemetryDpi = document.getElementById('telemetry-dpi');

    // Grid controls
    this.gridThirdsBtn = document.getElementById('grid-thirds-btn');
    this.gridToggleBtn = document.getElementById('grid-toggle-btn');
    this.gridToggleText = document.getElementById('grid-toggle-text');
    this.gridRuleThirds = document.getElementById('grid-rule-thirds');
    this.gridCrosshair = document.getElementById('grid-crosshair');

    // Upload Modal
    this.openUploadBtn = document.getElementById('open-upload-btn');
    this.inspectorDropzone = document.getElementById('inspector-dropzone');
    this.uploadModal = document.getElementById('upload-modal');
    this.closeModalBtn = document.getElementById('close-modal-btn');
    this.browseBtn = document.getElementById('browse-btn');
    this.fileInput = document.getElementById('file-input');
    this.dropzone = document.getElementById('dropzone');

    // Result Modal (Separate preview area)
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

    // Loading overlay
    this.loadingOverlay = document.getElementById('loading-overlay');
  }

  async bootstrap() {
    try {
      this.showLoading(true);
      // Inisialisasi WASM engine
      await this.wasmEngine.init('wasm_crop.wasm');
      console.log('Rust WebAssembly Crop Engine berhasil dimuat!');

      // Muat gambar awal (sample.jpg)
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

    this.sourceImage.onload = () => {
      this.naturalW = this.sourceImage.naturalWidth || this.sourceImage.width;
      this.naturalH = this.sourceImage.naturalHeight || this.sourceImage.height;
      this.displayedW = this.sourceImage.width;
      this.displayedH = this.sourceImage.height;

      this.headerResolution.textContent = `${this.naturalW} × ${this.naturalH} px`;
      this.setupDefaultCropBox();
      this.fitToWindow();
    };

    this.sourceImage.src = URL.createObjectURL(blob);
  }

  setupDefaultCropBox() {
    const ratio = this.currentPreset.targetW / this.currentPreset.targetH; // ~4:6 (0.6818)
    const imgW = this.sourceImage.offsetWidth || 600;
    const imgH = this.sourceImage.offsetHeight || 800;

    // Ambil ~75% tinggi gambar untuk kotak pas foto portrait
    let boxH = Math.round(imgH * 0.75);
    let boxW = Math.round(boxH * ratio);

    if (boxW > imgW * 0.95) {
      boxW = Math.round(imgW * 0.9);
      boxH = Math.round(boxW / ratio);
    }

    this.cropW = boxW;
    this.cropH = boxH;
    // Posisikan di tengah horizontal, agak ke atas (fokus kepala dan dada)
    this.cropX = Math.round((imgW - boxW) / 2);
    this.cropY = Math.round((imgH - boxH) * 0.25);

    this.renderCropMarquee();
  }

  renderCropMarquee() {
    const imgW = this.sourceImage.offsetWidth;
    const imgH = this.sourceImage.offsetHeight;

    if (!imgW || !imgH) return;

    // Boundary clamps
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

    // Update label ribbon
    this.dimensionChipText.textContent = `Pas Foto 4×6 — ${this.currentPreset.targetW} × ${this.currentPreset.targetH} px (${this.currentPreset.label})`;
  }

  initEvents() {
    // Zoom & Pan Buttons
    this.zoomInBtn.addEventListener('click', () => this.setZoom(this.zoom + 0.15));
    this.zoomOutBtn.addEventListener('click', () => this.setZoom(this.zoom - 0.15));
    this.actualSizeBtn.addEventListener('click', () => {
      this.panX = 0;
      this.panY = 0;
      this.setZoom(1.0);
    });
    this.fitWinBtn.addEventListener('click', () => this.fitToWindow());

    // Mouse Wheel Zoom
    this.canvasArena.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      this.setZoom(this.zoom + delta);
    }, { passive: false });

    // Keyboard Shortcuts (Space for Pan, Enter for Crop)
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !this.isSpacePressed && e.target.tagName !== 'INPUT') {
        this.isSpacePressed = true;
        this.updateCanvasCursor();
      }
      if (e.code === 'Enter' && !this.uploadModal.classList.contains('flex') && !this.resultModal.classList.contains('flex')) {
        this.applyCrop();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.isSpacePressed = false;
        this.updateCanvasCursor();
      }
    });

    // Toggle Pan Mode
    this.dockBtnPan.addEventListener('click', () => {
      this.isPanMode = !this.isPanMode;
      this.dockBtnPan.classList.toggle('bg-[#6366f1]', this.isPanMode);
      this.dockBtnPan.classList.toggle('text-white', this.isPanMode);
      this.updateCanvasCursor();
    });

    this.toolPanToggle.addEventListener('click', () => {
      this.isPanMode = !this.isPanMode;
      this.dockBtnPan.classList.toggle('bg-[#6366f1]', this.isPanMode);
      this.updateCanvasCursor();
    });

    this.dockBtnMove.addEventListener('click', () => {
      this.isPanMode = false;
      this.dockBtnPan.classList.remove('bg-[#6366f1]', 'text-white');
      this.updateCanvasCursor();
    });

    this.dockBtnCenter.addEventListener('click', () => this.recenterCropBox());
    this.btnRecenter.addEventListener('click', () => this.recenterCropBox());

    // Canvas Arena Panning Mouse Events
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

    // Marquee Drag Moving
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

    // Marquee 8 Grab Handles Resizing
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

    // DPI Preset Buttons Click
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

    // Grid Controls
    this.gridToggleBtn.addEventListener('click', () => {
      const isHidden = this.gridRuleThirds.classList.contains('hidden');
      if (isHidden) {
        this.gridRuleThirds.classList.remove('hidden');
        this.gridCrosshair.classList.remove('hidden');
        this.gridToggleText.textContent = 'Sembunyikan';
      } else {
        this.gridRuleThirds.classList.add('hidden');
        this.gridCrosshair.classList.add('hidden');
        this.gridToggleText.textContent = 'Tampilkan';
      }
    });

    // Upload Modal Events
    this.openUploadBtn.addEventListener('click', () => this.openUploadModal());
    this.inspectorDropzone.addEventListener('click', () => this.openUploadModal());
    this.closeModalBtn.addEventListener('click', () => this.closeUploadModal());
    this.browseBtn.addEventListener('click', () => this.fileInput.click());

    this.uploadModal.addEventListener('click', (e) => {
      if (e.target === this.uploadModal) this.closeUploadModal();
    });

    this.fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        this.handleUploadedFile(e.target.files[0]);
      }
    });

    // Drag and Drop
    this.dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropzone.classList.add('border-[#4cd7f6]', 'bg-[#222a3d]/80');
    });

    this.dropzone.addEventListener('dragleave', () => {
      this.dropzone.classList.remove('border-[#4cd7f6]', 'bg-[#222a3d]/80');
    });

    this.dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropzone.classList.remove('border-[#4cd7f6]', 'bg-[#222a3d]/80');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        this.handleUploadedFile(e.dataTransfer.files[0]);
      }
    });

    // Apply Crop Actions
    this.headerApplyBtn.addEventListener('click', () => this.applyCrop());
    this.dockBtnApply.addEventListener('click', () => this.applyCrop());
    this.applyCropBtn.addEventListener('click', () => this.applyCrop());

    // Result Modal
    this.closeResultModalBtn.addEventListener('click', () => this.closeResultModal());
    this.resultEditAgainBtn.addEventListener('click', () => this.closeResultModal());
    this.downloadFinalBtn.addEventListener('click', () => this.downloadCroppedPhoto());

    this.formatJpgBtn.addEventListener('click', () => this.selectOutputFormat('jpeg'));
    this.formatPngBtn.addEventListener('click', () => this.selectOutputFormat('png'));
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
    const ratio = this.currentPreset.targetW / this.currentPreset.targetH; // width / height

    let newW = this.initialCrop.w;
    let newH = this.initialCrop.h;
    let newX = this.initialCrop.x;
    let newY = this.initialCrop.y;

    const handle = this.activeHandle;

    if (handle === 'br') {
      newW = Math.max(50, this.initialCrop.w + dx);
      newH = Math.round(newW / ratio);
    } else if (handle === 'bl') {
      newW = Math.max(50, this.initialCrop.w - dx);
      newH = Math.round(newW / ratio);
      newX = this.initialCrop.x + (this.initialCrop.w - newW);
    } else if (handle === 'tr') {
      newW = Math.max(50, this.initialCrop.w + dx);
      newH = Math.round(newW / ratio);
      newY = this.initialCrop.y + (this.initialCrop.h - newH);
    } else if (handle === 'tl') {
      newW = Math.max(50, this.initialCrop.w - dx);
      newH = Math.round(newW / ratio);
      newX = this.initialCrop.x + (this.initialCrop.w - newW);
      newY = this.initialCrop.y + (this.initialCrop.h - newH);
    } else if (handle === 'b') {
      newH = Math.max(70, this.initialCrop.h + dy);
      newW = Math.round(newH * ratio);
      newX = this.initialCrop.x + (this.initialCrop.w - newW) / 2;
    } else if (handle === 't') {
      newH = Math.max(70, this.initialCrop.h - dy);
      newW = Math.round(newH * ratio);
      newY = this.initialCrop.y + (this.initialCrop.h - newH);
      newX = this.initialCrop.x + (this.initialCrop.w - newW) / 2;
    } else if (handle === 'r') {
      newW = Math.max(50, this.initialCrop.w + dx);
      newH = Math.round(newW / ratio);
      newY = this.initialCrop.y + (this.initialCrop.h - newH) / 2;
    } else if (handle === 'l') {
      newW = Math.max(50, this.initialCrop.w - dx);
      newH = Math.round(newW / ratio);
      newX = this.initialCrop.x + (this.initialCrop.w - newW);
      newY = this.initialCrop.y + (this.initialCrop.h - newH) / 2;
    }

    const imgW = this.sourceImage.offsetWidth;
    const imgH = this.sourceImage.offsetHeight;

    if (newX >= 0 && newY >= 0 && newX + newW <= imgW && newY + newH <= imgH) {
      this.cropX = Math.round(newX);
      this.cropY = Math.round(newY);
      this.cropW = Math.round(newW);
      this.cropH = Math.round(newH);
      this.renderCropMarquee();
    }
  }

  selectPreset(key) {
    this.currentPresetKey = key;
    this.currentPreset = DPI_PRESETS[key];

    // Update styling tombol preset aktif
    this.presetButtons.forEach((btn) => {
      const isCurrent = btn.dataset.dpi === key;
      btn.classList.toggle('active-preset', isCurrent);
      btn.classList.toggle('bg-[#2f2ebe]', isCurrent);
      btn.classList.toggle('text-white', isCurrent);
      btn.classList.toggle('ring-2', isCurrent);
      btn.classList.toggle('ring-[#6366f1]/40', isCurrent);
      btn.classList.toggle('bg-[#171f33]', !isCurrent);
    });

    // Update active badge & telemetri
    this.badgeActiveDpi.textContent = `${this.currentPreset.dpi} DPI Aktif`;
    this.telemetryResolution.textContent = `${this.currentPreset.targetW} × ${this.currentPreset.targetH} px`;
    this.telemetryPhysical.textContent = `${this.currentPreset.cm} (~4×6 cm)`;
    this.telemetryDpi.textContent = `${this.currentPreset.dpi} DPI (${this.currentPreset.category})`;
    this.telemetryPresetTag.textContent = `${this.currentPreset.dpi} DPI`;

    // Sesuaikan aspek rasio kotak crop
    const targetRatio = this.currentPreset.targetW / this.currentPreset.targetH;
    this.cropW = Math.round(this.cropH * targetRatio);
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
    this.zoomIndicator.textContent = `${Math.round(this.zoom * 100)}%`;
    this.updateTransform();
  }

  fitToWindow() {
    const arenaW = this.canvasArena.clientWidth - 80;
    const arenaH = this.canvasArena.clientHeight - 80;
    const imgW = this.sourceImage.offsetWidth || 800;
    const imgH = this.sourceImage.offsetHeight || 1000;

    const scaleX = arenaW / imgW;
    const scaleY = arenaH / imgH;
    const fitScale = Math.min(scaleX, scaleY, 1.0);

    this.panX = 0;
    this.panY = 0;
    this.setZoom(fitScale);
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

  openUploadModal() {
    this.uploadModal.classList.remove('hidden');
    this.uploadModal.classList.add('flex');
  }

  closeUploadModal() {
    this.uploadModal.classList.add('hidden');
    this.uploadModal.classList.remove('flex');
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
        this.displayedW = this.sourceImage.offsetWidth;
        this.displayedH = this.sourceImage.offsetHeight;

        this.headerResolution.textContent = `${this.naturalW} × ${this.naturalH} px`;
        this.setupDefaultCropBox();
        this.fitToWindow();
        this.closeUploadModal();
        this.showLoading(false);
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
      // Hitung koordinat crop relatif terhadap ukuran piksel resolusi asli gambar
      const scaleX = this.naturalW / this.sourceImage.offsetWidth;
      const scaleY = this.naturalH / this.sourceImage.offsetHeight;

      const exactCropX = Math.round(this.cropX * scaleX);
      const exactCropY = Math.round(this.cropY * scaleY);
      const exactCropW = Math.round(this.cropW * scaleX);
      const exactCropH = Math.round(this.cropH * scaleY);

      const targetW = this.currentPreset.targetW;
      const targetH = this.currentPreset.targetH;

      // Panggil Rust WebAssembly untuk memproses gambar
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
    this.resultDpiInfo.textContent = `${this.currentPreset.dpi} DPI (${this.currentPreset.category})`;
    
    const kb = (result.sizeBytes / 1024).toFixed(1);
    this.resultFilesize.textContent = `~${kb} KB (${result.format.toUpperCase()})`;

    // Buka modal hasil terpisah
    this.resultModal.classList.remove('hidden');
    this.resultModal.classList.add('flex');
  }

  closeResultModal() {
    this.resultModal.classList.add('hidden');
    this.resultModal.classList.remove('flex');
  }

  selectOutputFormat(format) {
    this.currentFormat = format;

    this.formatJpgBtn.classList.toggle('bg-[#2f2ebe]', format === 'jpeg');
    this.formatJpgBtn.classList.toggle('text-white', format === 'jpeg');
    this.formatJpgBtn.classList.toggle('bg-[#0b1326]', format !== 'jpeg');
    this.formatJpgBtn.classList.toggle('text-[#c7c4d7]', format !== 'jpeg');

    this.formatPngBtn.classList.toggle('bg-[#2f2ebe]', format === 'png');
    this.formatPngBtn.classList.toggle('text-white', format === 'png');
    this.formatPngBtn.classList.toggle('bg-[#0b1326]', format !== 'png');
    this.formatPngBtn.classList.toggle('text-[#c7c4d7]', format !== 'png');

    // Re-apply crop jika result modal sedang terbuka
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

// Inisialisasi aplikasi saat DOM siap
window.addEventListener('DOMContentLoaded', () => {
  window.photoCropApp = new PhotoCropApp();
});
