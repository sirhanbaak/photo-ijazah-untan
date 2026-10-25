import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import { WasmCropEngine } from '../public/crop/wasm_bridge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** CRC-32 (polinomial 0xEDB88320) sesuai spesifikasi PNG. */
function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Ambil chunk pHYs (piksel/meter + satuan) beserta validitas CRC-nya. */
function readPngPhys(data) {
  let pos = 8;
  while (pos + 12 <= data.length) {
    const len = data.readUInt32BE(pos);
    const type = data.toString('ascii', pos + 4, pos + 8);
    const end = pos + 12 + len;
    if (end > data.length) return null;

    if (type === 'pHYs' && len === 9) {
      const payloadEnd = pos + 8 + len;
      return {
        ppmX: data.readUInt32BE(pos + 8),
        ppmY: data.readUInt32BE(pos + 12),
        unit: data[pos + 16],
        crcValid: data.readUInt32BE(payloadEnd) === crc32(data.subarray(pos + 4, payloadEnd)),
      };
    }
    if (type === 'IDAT') return null; // pHYs wajib mendahului IDAT
    pos = end;
  }
  return null;
}

/** Ambil units + X/Y density dari segmen APP0/JFIF pertama pada JPEG. */
function readJpegDensity(data) {
  if (data[0] !== 0xff || data[1] !== 0xd8) return null;

  let i = 2;
  while (i + 4 <= data.length) {
    if (data[i] !== 0xff) return null;
    const marker = data[i + 1];
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      i += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null;

    const segLen = data.readUInt16BE(i + 2);
    const at = i + 4;
    if (segLen < 2 || i + 2 + segLen > data.length) return null;

    if (marker === 0xe0 && segLen >= 16 && data.toString('ascii', at, at + 4) === 'JFIF') {
      return {
        units: data[at + 7],
        densityX: data.readUInt16BE(at + 8),
        densityY: data.readUInt16BE(at + 10),
      };
    }
    i += 2 + segLen;
  }
  return null;
}


/** Membuat PNG RGBA sederhana (filter none) untuk pengujian rotasi. */
function buildPng(width, height, pixelAt) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0; // filter: none
    offset += 1;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixelAt(x, y);
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
      offset += 4;
    }
  }

  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'ascii');
    data.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}


async function runTests() {
  console.log('Testing WasmCropEngine...');

  const wasmPath = path.join(__dirname, '../public/crop/wasm_crop.wasm');
  const wasmBuffer = fs.readFileSync(wasmPath);

  const engine = new WasmCropEngine();
  await engine.init(wasmBuffer);
  assert.ok(engine.isReady, 'Engine must be ready after init');

  // Buat minimal PNG buffer 2x2 px menggunakan buffer biner standar
  // Simple valid 1x1 RGBA PNG
  const valid1x1Png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );

  const result = await engine.cropImage(valid1x1Png, {
    cropX: 0,
    cropY: 0,
    cropW: 1,
    cropH: 1,
    targetW: 450,
    targetH: 660,
    rotationDeg: 0,
    flipH: false,
    flipV: false,
    format: 'png',
    dpi: 300,
  });

  assert.ok(result.data instanceof Uint8Array, 'Result data must be Uint8Array');
  assert.ok(result.data.length > 50, 'Result PNG data must be non-empty valid image bytes');
  // Check PNG magic header: 0x89 0x50 0x4E 0x47
  assert.strictEqual(result.data[0], 0x89);
  assert.strictEqual(result.data[1], 0x50);
  assert.strictEqual(result.data[2], 0x4e);
  assert.strictEqual(result.data[3], 0x47);

  // Metadata DPI (bug #2): PNG harus memuat chunk pHYs yang valid
  assert.strictEqual(result.dpi, 300, 'Result harus melaporkan DPI yang dipakai');
  const pngPhys = readPngPhys(Buffer.from(result.data));
  assert.ok(pngPhys, 'Chunk pHYs wajib ada sebelum IDAT');
  assert.strictEqual(pngPhys.unit, 1, 'pHYs unit harus 1 (meter)');
  assert.strictEqual(pngPhys.ppmX, Math.round(300 / 0.0254), 'pHYs sumbu X harus 11811 px/m');
  assert.strictEqual(pngPhys.ppmY, Math.round(300 / 0.0254), 'pHYs sumbu Y harus 11811 px/m');
  assert.ok(pngPhys.crcValid, 'CRC chunk pHYs harus valid');

  // Metadata DPI untuk JPEG: segmen APP0/JFIF harus menyimpan density 150
  const jpegResult = await engine.cropImage(valid1x1Png, {
    cropX: 0,
    cropY: 0,
    cropW: 1,
    cropH: 1,
    targetW: 225,
    targetH: 330,
    format: 'jpeg',
    dpi: 150,
  });
  assert.strictEqual(jpegResult.data[0], 0xff, 'JPEG harus diawali marker SOI');
  assert.strictEqual(jpegResult.data[1], 0xd8, 'JPEG harus diawali marker SOI');
  const jfif = readJpegDensity(Buffer.from(jpegResult.data));
  assert.ok(jfif, 'Segmen APP0/JFIF wajib ada sebelum SOS');
  assert.strictEqual(jfif.units, 1, 'JFIF units harus 1 (dots per inch)');
  assert.strictEqual(jfif.densityX, 150, 'Xdensity JFIF harus 150');
  assert.strictEqual(jfif.densityY, 150, 'Ydensity JFIF harus 150');

  // Rotasi arbitrer harus benar-benar mengubah piksel hasil ekspor
  const duaWarna = buildPng(200, 200, (x) => (x < 100 ? [255, 0, 0, 255] : [0, 0, 255, 255]));
  const opsiCrop = {
    cropX: 50,
    cropY: 50,
    cropW: 100,
    cropH: 100,
    targetW: 100,
    targetH: 100,
    format: 'png',
    dpi: 300,
  };
  const rotasi0 = await engine.cropImage(duaWarna, { ...opsiCrop, rotationDeg: 0 });
  const rotasi30 = await engine.cropImage(duaWarna, { ...opsiCrop, rotationDeg: 30 });
  assert.notStrictEqual(
    Buffer.compare(Buffer.from(rotasi0.data), Buffer.from(rotasi30.data)),
    0,
    'Rotasi 30° harus mengubah piksel hasil ekspor'
  );

  // Area crop di luar batas harus ditolak dengan pesan yang jelas
  await assert.rejects(
    () => engine.cropImage(duaWarna, { ...opsiCrop, cropX: 5000 }),
    /Area crop/,
    'Area crop di luar batas harus ditolak dengan pesan yang jelas'
  );

  // Engine harus tetap bisa dipakai setelah error validasi
  assert.ok(engine.isReady, 'Engine harus tetap siap setelah error validasi');
  const setelahError = await engine.cropImage(duaWarna, { ...opsiCrop, rotationDeg: 0 });
  assert.ok(setelahError.data.length > 0, 'Crop valid setelah error harus tetap berhasil');

  console.log('✓ WasmCropEngine successfully initialized and cropped image to target dimensions!');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
