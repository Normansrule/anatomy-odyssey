// Build assets/manifest.json: the SHA-256 and byte size of every shipped asset.
// The app refuses any downloaded asset whose hash or size differs (see
// src/security/assetIntegrity.js). Run after adding or changing files in assets/.
//
//   npm run manifest            write the manifest
//   npm run manifest -- --check fail if the manifest is out of date (used in CI)
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const ROOT = 'assets';
const TYPES = new Set(['.glb', '.gltf', '.bin', '.ktx2', '.png', '.jpg', '.webp', '.pdb', '.cif', '.sdf']);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = walk(ROOT)
  .filter((p) => TYPES.has(extname(p).toLowerCase()))
  .sort();

const manifest = {
  generated: 'tools/build-asset-manifest.mjs',
  note: 'Hashes of every shipped asset. Licenses are listed per file in assets/CREDITS.md.',
  assets: Object.fromEntries(
    files.map((p) => {
      const bytes = readFileSync(p);
      return [relative(ROOT, p).split('\\').join('/'), { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length }];
    }),
  ),
};

const out = `${JSON.stringify(manifest, null, 2)}\n`;
const path = join(ROOT, 'manifest.json');
if (process.argv.includes('--check')) {
  const current = readFileSync(path, 'utf8');
  if (current !== out) {
    console.error('assets/manifest.json is out of date. Run: npm run manifest');
    process.exit(1);
  }
  console.log(`manifest up to date (${files.length} assets)`);
} else {
  writeFileSync(path, out);
  console.log(`wrote ${path} (${files.length} assets)`);
}
