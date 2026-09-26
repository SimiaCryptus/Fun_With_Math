// One-time vendoring of pinned libraries (spec §9.2). Usage: node scripts/vendor.mjs
// Requires Node 18+ (global fetch). Writes into ./vendor and records SHA-256 in vendor/VERSIONS.md.
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const T = 'https://unpkg.com/three@0.170.0';
const FILES = [
  ['three.js', '0.170.0', `${T}/build/three.module.js`, 'vendor/three/three.module.js'],
  ['three OrbitControls', '0.170.0', `${T}/examples/jsm/controls/OrbitControls.js`, 'vendor/three/addons/controls/OrbitControls.js'],
  ['three BufferGeometryUtils', '0.170.0', `${T}/examples/jsm/utils/BufferGeometryUtils.js`, 'vendor/three/addons/utils/BufferGeometryUtils.js'],
  ['three CSS2DRenderer', '0.170.0', `${T}/examples/jsm/renderers/CSS2DRenderer.js`, 'vendor/three/addons/renderers/CSS2DRenderer.js'],
  ['three stats', '0.170.0', `${T}/examples/jsm/libs/stats.module.js`, 'vendor/three/addons/libs/stats.module.js'],
  ['simplex-noise', '4.0.3', 'https://unpkg.com/simplex-noise@4.0.3/dist/esm/simplex-noise.js', 'vendor/simplex-noise/simplex-noise.js'],
  ['fflate', '0.8.2', 'https://unpkg.com/fflate@0.8.2/esm/browser.js', 'vendor/fflate/fflate.js'],
  ['lil-gui', '0.20.0', 'https://unpkg.com/lil-gui@0.20.0/dist/lil-gui.esm.js', 'vendor/lil-gui/lil-gui.esm.js'],
];

const rows = [];
for (const [name, ver, url, path] of FILES) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const out = join(root, path);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, buf);
  const sha = createHash('sha256').update(buf).digest('hex');
  rows.push(`| ${name} | ${ver} | ${url} | ${path} | ${sha} |`);
  console.log(`ok  ${path}  ${sha}`);
}
await writeFile(join(root, 'vendor/VERSIONS.md'),
  '# Vendored libraries (pinned; never loaded from CDN)\n\n' +
  '| Library | Version | Source | Local path | SHA-256 |\n|---|---|---|---|---|\n' +
  rows.join('\n') + '\n\nRegenerate with `node scripts/vendor.mjs`.\n');