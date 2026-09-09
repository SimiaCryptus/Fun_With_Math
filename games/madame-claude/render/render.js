#!/usr/bin/env node
// Renders all 78 cards + card back to ../assets/cards as PNG.
// Idempotent: a manifest of content hashes skips unchanged cards unless --force.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { program } from 'commander';
import { composeCard, composeBack } from './compose.js';
import { W, H } from './frame.js';

const here = path.dirname(fileURLToPath(import.meta.url));

program
  .name('render')
  .description('Render Madame Claude card art')
  .option('--only <ids>', 'comma-separated card ids (use "back" for the card back)')
  .option('--size <px>', 'output width in px', '600')
  .option('--force', 're-render even if unchanged')
  .option('--out <dir>', 'output directory', path.join(here, '..', 'assets', 'cards'))
  .option('--cards <file>', 'path to cards.json', path.join(here, '..', 'data', 'cards.json'))
  .option('--svg', 'also write the intermediate .svg next to each png')
  .parse();

const opts = program.opts();
const width = Math.max(100, parseInt(opts.size, 10) || 600);
const height = Math.round(width * (H / W));

const cards = JSON.parse(await readFile(opts.cards, 'utf8'));
await mkdir(opts.out, { recursive: true });

const manifestPath = path.join(opts.out, '.render-manifest.json');
const manifest = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, 'utf8')) : {};

const only = opts.only
  ? new Set(opts.only.split(',').map((s) => s.trim()).map((s) => (s === 'back' ? 'card-back' : s)))
  : null;

const jobs = [
  ...cards.map((card) => ({ id: card.id, svg: () => composeCard(card) })),
  { id: 'card-back', svg: () => composeBack() },
];

let rendered = 0;
let skipped = 0;
const started = Date.now();

for (const job of jobs) {
  if (only && !only.has(job.id)) continue;
  const svg = job.svg();
  const digest = createHash('sha1').update(svg).update(`|${width}`).digest('hex');
  const outFile = path.join(opts.out, `${job.id}.png`);

  if (!opts.force && manifest[job.id] === digest && existsSync(outFile)) {
    skipped++;
    continue;
  }

  // Rasterise at 2× then downsample for crisp edges.
  const density = Math.round((72 * width * 2) / W);
  await sharp(Buffer.from(svg), { density })
    .resize(width, height, { fit: 'fill' })
    .png({ compressionLevel: 9 })
    .toFile(outFile);
  if (opts.svg) await writeFile(path.join(opts.out, `${job.id}.svg`), svg);

  manifest[job.id] = digest;
  rendered++;
  process.stdout.write(`rendered ${job.id}\n`);
}

await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
const secs = ((Date.now() - started) / 1000).toFixed(1);
console.log(`Done in ${secs}s: ${rendered} rendered, ${skipped} unchanged → ${opts.out}`);