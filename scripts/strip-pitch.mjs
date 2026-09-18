#!/usr/bin/env node
/**
 * scripts/strip-pitch.mjs
 *
 * Removes the deprecated `pitch` field from every entry.json sidecar.
 *   - description present -> delete pitch
 *   - description missing -> rename pitch to description
 *
 *   node scripts/strip-pitch.mjs            # rewrite in place
 *   node scripts/strip-pitch.mjs --dry-run  # show what would change
 */
import {promises as fs} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(path.join(HERE, '..'));
const DRY = process.argv.includes('--dry-run');
const ENTRY = 'entry.json';
const IGNORED = new Set([
    '.git', 'node_modules', 'dist', 'build', 'out', 'target',
    'vendor', 'coverage', '__pycache__', 'venv', 'site-packages',
]);

async function* walk(rel = '', depth = 0) {
    if (depth > 6) return;
    let dirents;
    try {
        dirents = await fs.readdir(path.join(ROOT, rel), {withFileTypes: true});
    } catch {
        return;
    }
    for (const d of dirents) {
        if (d.name.startsWith('.')) continue;
        const next = rel ? `${rel}/${d.name}` : d.name;
        if (d.isDirectory()) {
            if (IGNORED.has(d.name)) continue;
            yield* walk(next, depth + 1);
        } else if (d.isFile() && d.name === ENTRY) {
            yield next;
        }
    }
}

let touched = 0;
for await (const rel of walk()) {
    const abs = path.join(ROOT, rel);
    const text = await fs.readFile(abs, 'utf8');
    let data;
    try {
        data = JSON.parse(text);
    } catch (err) {
        console.error(`  skip     ${rel} (invalid JSON: ${err.message})`);
        continue;
    }
    if (!Object.prototype.hasOwnProperty.call(data, 'pitch')) continue;

    const pitch = data.pitch;
    const hasDescription = typeof data.description === 'string' && data.description.trim().length > 0;

    // Rebuild in key order so `description` lands where `pitch` used to be.
    const out = {};
    for (const [k, v] of Object.entries(data)) {
        if (k === 'pitch') {
            if (!hasDescription && typeof pitch === 'string' && pitch.trim()) out.description = pitch;
            continue;
        }
        out[k] = v;
    }

    const next = `${JSON.stringify(out, null, 2)}\n`;
    if (next === text) continue;
    touched++;
    const action = hasDescription ? 'drop    ' : 'promote ';
    console.log(`  ${action} ${rel}`);
    if (!DRY) await fs.writeFile(abs, next, 'utf8');
}

console.log(`\nstrip-pitch: ${touched} file(s) ${DRY ? 'would change' : 'rewritten'}`);