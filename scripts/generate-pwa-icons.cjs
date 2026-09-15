#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────
   Generates the PWA icon set from a single source image.

   Emits:
     icons/icon-<n>.png        (transparent, "any" purpose)
     icons/maskable-<n>.png    (padded to the 80% safe zone, opaque)
     icons/apple-touch-icon.png (180×180, opaque)

   Usage:
     node scripts/generate-pwa-icons.cjs [--src icon.png] [--out icons]
   ───────────────────────────────────────────────────────────── */

'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const SIZES = [48, 72, 96, 128, 144, 152, 180, 192, 256, 384, 512];
const MASKABLE = [192, 512];
const BG = { r: 0x0a, g: 0x0a, b: 0x14, alpha: 1 };

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main() {
  const src = path.resolve(ROOT, arg('--src', 'icon.png'));
  const outDir = path.resolve(ROOT, arg('--out', 'icons'));

  if (!fs.existsSync(src)) {
    console.error(`Source icon not found: ${src}`);
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });

  for (const size of SIZES) {
    const file = path.join(outDir, `icon-${size}.png`);
    await sharp(src)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(file);
    console.log(`✓ ${path.relative(ROOT, file)}`);
  }

  // Maskable icons: art must fit inside the central 80% safe zone.
  for (const size of MASKABLE) {
    const inner = Math.round(size * 0.8);
    const pad = Math.round((size - inner) / 2);
    const art = await sharp(src)
      .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    const file = path.join(outDir, `maskable-${size}.png`);
    await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
      .composite([{ input: art, top: pad, left: pad }])
      .png({ compressionLevel: 9 })
      .toFile(file);
    console.log(`✓ ${path.relative(ROOT, file)}`);
  }

  // iOS home-screen icon: no transparency, no rounding.
  const apple = path.join(outDir, 'apple-touch-icon.png');
  await sharp(src)
    .resize(180, 180, { fit: 'contain', background: BG })
    .flatten({ background: BG })
    .png({ compressionLevel: 9 })
    .toFile(apple);
  console.log(`✓ ${path.relative(ROOT, apple)}`);

  console.log(`Done — ${SIZES.length + MASKABLE.length + 1} icons in ${path.relative(ROOT, outDir)}/`);
}

main().catch((err) => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});