#!/usr/bin/env node
/**
 * scripts/build-manifest.ts
 *
 * Walks the content roots, reads every `entry.json` sidecar, validates it, and
 * reassembles a single unified `manifest.json`.
 *
 *   node --experimental-strip-types scripts/build-manifest.ts
 *   npx tsx scripts/build-manifest.ts --legacy
 *   npx tsx scripts/build-manifest.ts --check      # CI: fail on drift
 *
 * Flags:
 *   --root=<path>   repository root (default: parent of scripts/)
 *   --out=<file>    output path (default: manifest.json)
 *   --legacy        also regenerate labs.json / games.json / essays.json
 *   --include-hidden  keep entries marked `"hidden": true`
 *   --no-verify     skip on-disk existence checks for href/readme/video
 *   --check         write nothing; exit 1 if any output would change
 *   --quiet         only print the summary
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  ENTRY_FILENAME,
  ENTRY_KEY_ORDER,
  LEGACY_SOURCES,
  MANIFEST_FILENAME,
  MANIFEST_VERSION,
  SCAN_IGNORE,
  SCAN_MAX_DEPTH,
  SCAN_ROOTS,
  type Category,
  type EntryFile,
  type ManifestEntry,
  type UnifiedManifest,
  isExternal,
  joinPosix,
  orderKeys,
  resolveEntryPaths,
  serializeJson,
  toLegacyEntry,
  compareEntries,
  validateEntryFile,
} from '../manifest/schema.ts';

/* ---------------------------------------------------------------- args */

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const opt = (name: string, fallback: string) =>
  argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(opt('root', path.join(HERE, '..')));
const OUT = opt('out', MANIFEST_FILENAME);
const WRITE_LEGACY = flag('legacy');
const INCLUDE_HIDDEN = flag('include-hidden');
const VERIFY = !flag('no-verify');
const CHECK = flag('check');
const QUIET = flag('quiet');

const log = (...a: unknown[]) => { if (!QUIET) console.log(...a); };

/* --------------------------------------------------------------- walk */

async function* findEntryFiles(relDir: string, depth = 0): AsyncGenerator<string> {
  if (depth > SCAN_MAX_DEPTH) return;
  let dirents;
  try {
    dirents = await fs.readdir(path.join(ROOT, relDir), { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw err;
  }
  for (const dirent of dirents) {
    if (dirent.name.startsWith('.') && dirent.name !== ENTRY_FILENAME) continue;
    const rel = joinPosix(relDir, dirent.name);
    if (dirent.isDirectory()) {
      if (SCAN_IGNORE.includes(dirent.name)) continue;
      yield* findEntryFiles(rel, depth + 1);
    } else if (dirent.isFile() && dirent.name === ENTRY_FILENAME) {
      yield rel;
    }
  }
}

async function exists(rel: string): Promise<boolean> {
  try { await fs.access(path.join(ROOT, rel)); return true; } catch { return false; }
}

/* --------------------------------------------------------------- load */

interface LoadResult {
  entries: ManifestEntry[];
  errors: string[];
  warnings: string[];
}

async function loadEntries(): Promise<LoadResult> {
  const entries: ManifestEntry[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const seenIds = new Map<string, string>();

  const sources: string[] = [];
  for (const root of SCAN_ROOTS) for await (const rel of findEntryFiles(root)) sources.push(rel);
  sources.sort();

  for (const source of sources) {
    let raw: unknown;
    try {
      raw = JSON.parse(await fs.readFile(path.join(ROOT, source), 'utf8'));
    } catch (err) {
      errors.push(`${source}: invalid JSON — ${(err as Error).message}`);
      continue;
    }

    const problems = validateEntryFile(raw, source);
    if (problems.length) { errors.push(...problems); continue; }

    const file = raw as EntryFile;
    const dir = path.posix.dirname(source);
    const category = file.category as Category;
    const legacy = LEGACY_SOURCES.find((s) => s.category === category);

    const previous = seenIds.get(file.id);
    if (previous) { errors.push(`${source}: duplicate id "${file.id}" (also in ${previous})`); continue; }
    seenIds.set(file.id, source);

    if (file.hidden && !INCLUDE_HIDDEN) { log(`  hidden   ${source}`); continue; }

    const entry: ManifestEntry = orderKeys(
      {
        ...file,
        section: file.section ?? legacy?.defaultSection ?? category,
        order: file.order ?? Number.MAX_SAFE_INTEGER,
        dir,
        source,
      } as unknown as Record<string, unknown>,
      [...ENTRY_KEY_ORDER, 'dir', 'source'],
    ) as unknown as ManifestEntry;

    if (VERIFY) {
      const resolved = resolveEntryPaths(entry, dir);
      for (const [field, value] of Object.entries({
        href: resolved.href,
        readme: resolved.readme,
        video: resolved.video,
      })) {
        if (!value || isExternal(value)) continue;
        const [clean] = value.split(/[?#]/);
        if (!(await exists(clean))) warnings.push(`${source}: ${field} points at missing file "${clean}"`);
      }
    }

    entries.push(entry);
  }

  entries.sort(compareEntries);
  return { entries, errors, warnings };
}

/* -------------------------------------------------------------- write */

const outputs = new Map<string, string>();

function queue(rel: string, contents: string): void {
  outputs.set(rel, contents);
}

async function flush(): Promise<boolean> {
  let drift = false;
  for (const [rel, contents] of outputs) {
    const absolute = path.join(ROOT, rel);
    let current: string | null = null;
    try { current = await fs.readFile(absolute, 'utf8'); } catch { /* new file */ }

    if (current === contents) { log(`  ok       ${rel}`); continue; }
    drift = true;
    if (CHECK) { console.error(`  DRIFT    ${rel}`); continue; }

    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, contents, 'utf8');
    log(`  ${current === null ? 'create' : 'update'}   ${rel}`);
  }
  return drift;
}

/* ---------------------------------------------------------------- main */

async function main(): Promise<void> {
  const { entries, errors, warnings } = await loadEntries();

  if (errors.length) {
    console.error('build-manifest: validation failed\n');
    for (const e of errors) console.error(`  x ${e}`);
    process.exitCode = 1;
    return;
  }

  const counts: Record<string, number> = {};
  for (const e of entries) counts[e.category] = (counts[e.category] ?? 0) + 1;

  const manifest: UnifiedManifest = {
    version: MANIFEST_VERSION,
    // Deterministic output: reuse the previous timestamp when nothing else moved.
    generatedAt: new Date().toISOString(),
    counts,
    entries,
  };

  // Keep `generatedAt` stable unless the payload actually changed, so `--check`
  // and repeated builds do not create noisy diffs.
  const previous = await fs.readFile(path.join(ROOT, OUT), 'utf8').catch(() => null);
  if (previous) {
    try {
      const old = JSON.parse(previous) as UnifiedManifest;
      const sameBody =
        JSON.stringify({ ...old, generatedAt: '' }) === JSON.stringify({ ...manifest, generatedAt: '' });
      if (sameBody && typeof old.generatedAt === 'string') manifest.generatedAt = old.generatedAt;
    } catch { /* regenerate wholesale */ }
  }

  queue(OUT, serializeJson(manifest));

  if (WRITE_LEGACY) {
    for (const source of LEGACY_SOURCES) {
      const doc: Record<string, unknown[]> = {};
      for (const section of source.sections) doc[section] = [];
      for (const entry of entries.filter((e) => e.category === source.category)) {
        (doc[entry.section] ??= []).push(toLegacyEntry(entry));
      }
      queue(source.file, serializeJson(doc));
    }
  }

  const drift = await flush();

  if (warnings.length) {
    console.warn('\nwarnings:');
    for (const w of warnings) console.warn(`  ! ${w}`);
  }

  const summary = Object.entries(counts).map(([k, v]) => `${v} ${k}${v === 1 ? '' : 's'}`).join(', ');
  console.log(`\nbuild-manifest: ${entries.length} entries (${summary}) → ${OUT}`);

  if (CHECK && drift) {
    console.error('build-manifest --check: output is stale, re-run without --check');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`build-manifest failed: ${(err as Error).message}`);
  process.exitCode = 1;
});