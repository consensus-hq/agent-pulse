import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const distCjs = path.join(root, 'dist-cjs');

function copy(srcRel, dstRel) {
  const src = path.join(distCjs, srcRel);
  const dst = path.join(dist, dstRel);
  if (!fs.existsSync(src)) {
    throw new Error(`Missing CJS build artifact: ${srcRel}`);
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

// Copy CJS bundles alongside the ESM output.
copy('index.js', 'index.cjs');
copy('middleware.js', 'middleware.cjs');

console.log('CJS artifacts written to dist/*.cjs');
