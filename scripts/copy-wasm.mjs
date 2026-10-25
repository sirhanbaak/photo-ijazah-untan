import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(
  root,
  'wasm_crop',
  'target',
  'wasm32-unknown-unknown',
  'release',
  'wasm_crop.wasm'
);
const destination = path.join(root, 'public', 'crop', 'wasm_crop.wasm');

if (!fs.existsSync(source)) {
  console.error(`Hasil build tidak ditemukan: ${source}`);
  console.error(
    'Jalankan lebih dulu: cargo build --release --target wasm32-unknown-unknown --manifest-path wasm_crop/Cargo.toml'
  );
  process.exit(1);
}

fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.copyFileSync(source, destination);

const bytes = fs.readFileSync(destination);
const sha = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 12);
console.log(
  `WASM disalin ke ${path.relative(root, destination)} (${(bytes.length / 1024).toFixed(1)} KB, sha256:${sha})`
);
