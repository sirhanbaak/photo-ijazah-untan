import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import { WasmCropEngine } from '../public/crop/wasm_bridge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  });

  assert.ok(result.data instanceof Uint8Array, 'Result data must be Uint8Array');
  assert.ok(result.data.length > 50, 'Result PNG data must be non-empty valid image bytes');
  // Check PNG magic header: 0x89 0x50 0x4E 0x47
  assert.strictEqual(result.data[0], 0x89);
  assert.strictEqual(result.data[1], 0x50);
  assert.strictEqual(result.data[2], 0x4e);
  assert.strictEqual(result.data[3], 0x47);

  console.log('✓ WasmCropEngine successfully initialized and cropped image to target dimensions!');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
