#!/usr/bin/env node
/**
 * scripts/split-manifest.ts
 *
 * Explodes the legacy manifests (labs.json, games.json, essays.json) into one
 * `entry.json` sidecar per project directory.
 *
 *   node --experimental-strip-types scripts/split-manifest.ts
 *   npx tsx scripts/split-manifest.ts --dry-run
 *
 * Flags:
 *   --root=<path>    repository root (default: parent of scripts/)
 *   --dry-run        print what would be written, touch nothing
 *   --keep-existing  never overwrite an existing entry.json
 *   --quiet          only print the summary
 *   --strict         exit non-zero if any warning was emitted
 *   --help           print this banner
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  ENTRY_FILENAME,
  ENTRY_KEY_ORDER,
  LEGACY_SOURCES,
  type Category,
  type EntryFile,
  entryDirFor,
  entryIdFromDir,
  isExternal,
  isMetaKey,
  joinPosix,
  orderKeys,
  serializeJson,
  splitPathSuffix,
  toPathRef,
  uniqueId,
  validateEntryFile,
} from '../manifest/schema.ts';

/* ---------------------------------------------------------------- args */

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const opt = (name: string, fallback: string) => {
  const prefix = `--${name}=`;
  const hit = argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
};

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(opt('root', path.join(HERE, '..')));
const DRY_RUN = flag('dry-run');
const KEEP_EXISTING = flag('keep-existing');
const QUIET = flag('quiet');
const STRICT = flag('strict');

const log = (...a: unknown[]) => {
  if (!QUIET) console.log(...a);
};

if (flag('help')) {
  console.log(
    [
      'usage: split-manifest [--root=<path>] [--dry-run] [--keep-existing] [--quiet] [--strict]',
      '',
      '  --root=<path>    repository root (default: parent of scripts/)',
      '  --dry-run        print what would be written, touch nothing',
      '  --keep-existing  never overwrite an existing entry.json',
      '  --quiet          only print the summary',
      '  --strict         exit non-zero if any warning was emitted',
    ].join('\n'),
  );
  process.exit(0);
}

/* --------------------------------------------------------------- utils */

/** Legacy fields we know how to carry across; anything else is reported. */
const KNOWN_LEGACY_KEYS = new Set([
  'icon',
  'title',
  'href',
  'readme',
  'video',
  'subtitle',
  'launchLabel',
  'pitch',
  'tags',
  'hidden',
  'section',
  'order',
  'id',
]);

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(path.join(ROOT, file), 'utf8'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error(`${file}: ${(err as Error).message}`);
  }
}

async function exists(absolute: string): Promise<boolean> {
  try {
    await fs.access(absolute);
    return true;
  } catch {
    return false;
  }
}

/** Trimmed string, or `undefined` when absent/blank/not-a-string. */
function str(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/** Root-relative form of a legacy reference, or `''` when not checkable. */
function localRef(ref: string): string {
  if (isExternal(ref)) return '';
  const [clean] = splitPathSuffix(ref);
  return clean.replace(/^\/+/, '');
}

/* ---------------------------------------------------------------- main */

interface Pending {
  dir: string;
  entry: EntryFile;
  /** Root-relative paths referenced by this entry, for existence warnings. */
  refs: string[];
  /** Where this row came from, for diagnostics. */
  origin: string;
}

async function collect(): Promise<{ pending: Pending[]; warnings: string[] }> {
  const pending: Pending[] = [];
  const warnings: string[] = [];
  const usedIds = new Set<string>();
  /** dir -> origin of the row that already claimed it. */
  const dirOwners = new Map<string, string>();

  for (const source of LEGACY_SOURCES) {
    const doc = (await readJson(source.file)) as Record<string, unknown> | null;
    if (!doc) {
      warnings.push(`skipped missing legacy manifest ${source.file}`);
      continue;
    }
    if (typeof doc !== 'object' || Array.isArray(doc)) {
      warnings.push(`${source.file}: expected a JSON object at the top level — ignored`);
      continue;
    }

    // Declared sections first (publication order), then any extras the file
    // happens to carry. `$schema` / `//` style keys are metadata, not sections.
    const sections = [...new Set([...source.sections, ...Object.keys(doc)])].filter((k) => !isMetaKey(k));

    for (const section of sections) {
      const bucket = doc[section];
      if (bucket === undefined) continue;
      if (!Array.isArray(bucket)) {
        warnings.push(`${source.file}: key "${section}" is not an array — ignored`);
        continue;
      }

      for (let index = 0; index < bucket.length; index += 1) {
        const raw: unknown = bucket[index];
        const origin = `${source.file}#${section}[${index}]`;

        if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
          warnings.push(`${origin}: expected an object — skipped`);
          continue;
        }
        const item = raw as Record<string, unknown>;
        const category = source.category as Category;

        const title = str(item.title);
        if (!title) {
          warnings.push(`${origin}: entry has no title — skipped`);
          continue;
        }

        // An entry with nowhere to go is not an entry.
        const href = str(item.href);
        const readme = str(item.readme);
        const video = str(item.video);
        if (!href) {
          warnings.push(`${origin}: "${title}" has no href — skipped`);
          continue;
        }

        const dropped = Object.keys(item).filter((k) => !KNOWN_LEGACY_KEYS.has(k) && !isMetaKey(k));
        if (dropped.length) {
          warnings.push(`${origin}: dropped unsupported field(s): ${dropped.join(', ')}`);
        }

        const dir = entryDirFor({ category, href, readme, title });

        // One directory can hold exactly one entry.json — first row wins.
        const owner = dirOwners.get(dir);
        if (owner) {
          warnings.push(`${origin}: "${title}" also maps to ${dir}, already claimed by ${owner} — skipped`);
          continue;
        }

        // Unique, stable id derived from the owning directory.
        const base = entryIdFromDir(dir, title);
        const id = uniqueId(base, usedIds);
        if (id !== base) warnings.push(`id collision on "${base}" → using "${id}" for ${dir}`);

        const entry = orderKeys(
          {
            id,
            category,
            section: section || source.defaultSection,
            order: index,
            icon: str(item.icon) ?? '??',
            title,
            subtitle: str(item.subtitle),
            href: toPathRef(dir, href),
            readme: readme ? toPathRef(dir, readme) : undefined,
            video: video ? toPathRef(dir, video) : undefined,
            launchLabel: str(item.launchLabel),
            pitch: typeof item.pitch === 'string' ? item.pitch : undefined,
            tags: Array.isArray(item.tags)
              ? item.tags.filter((t): t is string => typeof t === 'string')
              : undefined,
            hidden: typeof item.hidden === 'boolean' ? item.hidden : undefined,
          },
          ENTRY_KEY_ORDER,
        ) as unknown as EntryFile;

        const errors = validateEntryFile(entry, origin);
        if (errors.length) {
          warnings.push(...errors);
          continue; // id/dir intentionally left unclaimed
        }

        usedIds.add(id);
        dirOwners.set(dir, origin);

        const refs = [href, readme, video].filter((v): v is string => Boolean(v));
        pending.push({ dir, entry, refs, origin });
      }
    }
  }

  return { pending, warnings };
}

async function main(): Promise<void> {
  const { pending, warnings } = await collect();

  let written = 0;
  let unchanged = 0;
  let skipped = 0;

  /** Cache so a shared asset referenced ten times warns once. */
  const refChecked = new Map<string, boolean>();

  for (const { dir, entry, refs } of pending) {
    const target = joinPosix(dir, ENTRY_FILENAME);
    const absolute = path.resolve(ROOT, target);

    // Never let a crafted legacy path walk us out of the repository.
    if (absolute !== ROOT && !absolute.startsWith(ROOT + path.sep)) {
      warnings.push(`refusing to write outside root: ${target}`);
      skipped++;
      continue;
    }

    // Warn about references that do not exist on disk (broken manifest rows).
    for (const ref of refs) {
      const clean = localRef(ref);
      if (!clean) continue;
      let ok = refChecked.get(clean);
      if (ok === undefined) {
        ok = await exists(path.join(ROOT, clean));
        refChecked.set(clean, ok);
      }
      if (!ok) warnings.push(`missing file referenced by ${entry.id}: ${clean}`);
    }

    const payload = serializeJson(entry);
    const already = await exists(absolute);

    if (already && KEEP_EXISTING) {
      skipped++;
      log(`  skip     ${target} (exists)`);
      continue;
    }
    if (already && (await fs.readFile(absolute, 'utf8')) === payload) {
      unchanged++;
      log(`  ok       ${target}`);
      continue;
    }

    const verb = already ? 'update' : 'create';
    if (DRY_RUN) {
      written++;
      log(`  ${verb}   ${target} (dry run)`);
      continue;
    }

    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, payload, 'utf8');
    written++;
    log(`  ${verb}   ${target}`);
  }

  if (warnings.length) {
    console.warn('\nwarnings:');
    for (const w of warnings) console.warn(`  ! ${w}`);
  }

  console.log(
    `\nsplit-manifest: ${pending.length} entries — ` +
      `${written} written, ${unchanged} unchanged, ${skipped} skipped${DRY_RUN ? ' (dry run)' : ''}`,
  );
  console.log('next: node --experimental-strip-types scripts/build-manifest.ts');

  if (STRICT && warnings.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`split-manifest failed: ${(err as Error).message}`);
  process.exitCode = 1;
});