import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wasmPath = path.join(root, 'public', 'crop', 'wasm_crop.wasm');

if (!fs.existsSync(wasmPath)) {
  console.error(`Berkas WASM tidak ditemukan: ${wasmPath}`);
  console.error('Jalankan "npm run build:wasm" untuk mengompilasi engine Rust.');
  process.exit(1);
}

const bytes = fs.readFileSync(wasmPath);
const sha = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 12);
console.log(
  `Aset siap: public/crop/wasm_crop.wasm (${(bytes.length / 1024).toFixed(1)} KB, sha256:${sha})`
);
