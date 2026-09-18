#!/usr/bin/env node
/**
 * scripts/sync-entries.ts
 *
 * Inverse of `build-manifest`: takes the compiled unified `manifest.json`
 * and pushes every entry back down into its per-directory `entry.json`
 * sidecar. Use this whenever an automated process (bulk edit, CMS export,
 * LLM pass, …) rewrites the central manifest and the sidecars — which are
 * the real source of truth — must be brought back in line.
 *
 *   npx tsx scripts/sync-entries.ts
 *   npx tsx scripts/sync-entries.ts --dry-run
 *   npx tsx scripts/sync-entries.ts --check     # CI: fail on drift
 *
 * Flags:
 *   --root=<path>     repository root (default: parent of scripts/)
 *   --in=<file>       manifest to read (default: manifest.json)
 *   --only=<a,b,c>    restrict to these entry ids
 *   --prune           delete sidecars that the manifest no longer lists
 *   --keep-repo       keep the autodiscovered `repo` block in the sidecar
 *                     (default: strip it — it is rediscovered on build)
 *   --dry-run         print what would change, touch nothing
 *   --check           write nothing; exit 1 if any sidecar would change
 *   --quiet           only print the summary
 *   --help            print this banner
 *
 * Round-trip contract:
 *   build-manifest → manifest.json → sync-entries → entry.json
 *   must be a fixed point. `--check` in CI guarantees it.
 */

import {promises as fs} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {
    ENTRY_FILENAME,
    ENTRY_KEY_ORDER,
    type EntryFile,
    joinPosix,
    MANIFEST_FILENAME,
    type ManifestEntry,
    orderKeys,
    resolvePathRef,
    serializeJson,
    toPathRef,
    type UnifiedManifest,
    validateEntryFile,
} from './manifest_schema.ts';

/* ---------------------------------------------------------------- args */

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const opt = (name: string, fallback: string) => {
    const prefix = `--${name}=`;
    const hit = argv.find((a) => a.startsWith(prefix));
    return hit ? hit.slice(prefix.length) : fallback;
};
const listOpt = (name: string): string[] | null => {
    const raw = opt(name, '\u0000');
    if (raw === '\u0000') return null;
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
};

if (flag('help')) {
    console.log(
        [
            'usage: sync-entries [--in=manifest.json] [--only=id,id] [--prune]',
            '                    [--keep-repo] [--dry-run] [--check] [--quiet]',
            '',
            'Pushes the compiled manifest back into the per-directory entry.json files.',
        ].join('\n'),
    );
    process.exit(0);
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(opt('root', path.join(HERE, '..')));
const IN = opt('in', MANIFEST_FILENAME);
const ONLY = listOpt('only');
const PRUNE = flag('prune');
const KEEP_REPO = flag('keep-repo');
const DRY_RUN = flag('dry-run');
const CHECK = flag('check');
const QUIET = flag('quiet');

const log = (...a: unknown[]) => {
    if (!QUIET) console.log(...a);
};

/* --------------------------------------------------------------- utils */

/** Guard against a crafted `source`/`dir` escaping the repository. */
function safeResolve(rel: string): string | null {
    const absolute = path.resolve(ROOT, rel);
    if (absolute !== ROOT && !absolute.startsWith(ROOT + path.sep)) return null;
    return absolute;
}

async function exists(absolute: string): Promise<boolean> {
    try {
        await fs.access(absolute);
        return true;
    } catch {
        return false;
    }
}

/**
 * Strip the manifest-only bookkeeping fields and re-anchor every path
 * reference to the entry's own directory, producing the exact bytes that
 * `build-manifest` would read back.
 */
function toSidecar(entry: ManifestEntry): EntryFile {
    const dir = entry.dir ?? '';
    const rebase = (value?: string) =>
        value === undefined ? undefined : toPathRef(dir, resolvePathRef(dir, value));

    const out: Record<string, unknown> = {
        ...entry,
        href: rebase(entry.href),
        readme: rebase(entry.readme),
        video: rebase(entry.video),
    };
    // Derived on every build — never persisted unless explicitly asked for.
    delete out.dir;
    delete out.source;
    if (!KEEP_REPO) delete out.repo;
    // `order` defaults to MAX_SAFE_INTEGER in the manifest; that is a
    // sentinel for "unset", not a real value worth writing back.
    if (out.order === Number.MAX_SAFE_INTEGER) delete out.order;
    for (const key of Object.keys(out)) if (out[key] === undefined) delete out[key];

    return orderKeys(out, ENTRY_KEY_ORDER) as unknown as EntryFile;
}

/** Where the sidecar for this entry belongs. */
function sidecarPath(entry: ManifestEntry): string {
    if (entry.source) return entry.source;
    return joinPosix(entry.dir ?? '', ENTRY_FILENAME);
}

/* ---------------------------------------------------------------- main */

interface Stats {
    written: number;
    unchanged: number;
    skipped: number;
    removed: number;
}

async function main(): Promise<void> {
    let manifest: UnifiedManifest;
    try {
        manifest = JSON.parse(await fs.readFile(path.join(ROOT, IN), 'utf8')) as UnifiedManifest;
    } catch (err) {
        const e = err as NodeJS.ErrnoException;
        throw new Error(
            e.code === 'ENOENT'
                ? `${IN} not found — run \`npm run manifest:build\` first`
                : `${IN}: ${e.message}`,
        );
    }
    if (!manifest || !Array.isArray(manifest.entries)) {
        throw new Error(`${IN}: expected an object with an "entries" array`);
    }

    const warnings: string[] = [];
    const stats: Stats = {written: 0, unchanged: 0, skipped: 0, removed: 0};
    const touched = new Set<string>();
    let drift = false;

    for (const entry of manifest.entries) {
        if (ONLY && !ONLY.includes(entry.id)) continue;

        const target = sidecarPath(entry);
        const absolute = safeResolve(target);
        if (!absolute) {
            warnings.push(`refusing to write outside root: ${target}`);
            stats.skipped++;
            continue;
        }

        const sidecar = toSidecar(entry);
        const problems = validateEntryFile(sidecar, target);
        if (problems.length) {
            warnings.push(...problems);
            stats.skipped++;
            continue;
        }

        touched.add(path.posix.normalize(target));
        const payload = serializeJson(sidecar);
        const current = await fs.readFile(absolute, 'utf8').catch(() => null);

        if (current === payload) {
            stats.unchanged++;
            log(`  ok       ${target}`);
            continue;
        }

        drift = true;
        const verb = current === null ? 'create' : 'update';
        if (CHECK) {
            console.error(`  DRIFT    ${target}`);
            continue;
        }
        if (DRY_RUN) {
            stats.written++;
            log(`  ${verb}   ${target} (dry run)`);
            continue;
        }
        await fs.mkdir(path.dirname(absolute), {recursive: true});
        await fs.writeFile(absolute, payload, 'utf8');
        stats.written++;
        log(`  ${verb}   ${target}`);
    }

    if (PRUNE && !ONLY) {
        for (const stale of await findStaleSidecars(touched)) {
            drift = true;
            if (CHECK) {
                console.error(`  STALE    ${stale}`);
                continue;
            }
            if (DRY_RUN) {
                stats.removed++;
                log(`  delete   ${stale} (dry run)`);
                continue;
            }
            await fs.rm(path.join(ROOT, stale));
            stats.removed++;
            log(`  delete   ${stale}`);
        }
    }

    if (warnings.length) {
        console.warn('\nwarnings:');
        for (const w of warnings) console.warn(`  ! ${w}`);
    }

    console.log(
        `\nsync-entries: ${stats.written} written, ${stats.unchanged} unchanged, ` +
        `${stats.skipped} skipped, ${stats.removed} removed` +
        `${DRY_RUN ? ' (dry run)' : ''}`,
    );

    if (CHECK && drift) {
        console.error('sync-entries --check: sidecars are stale, re-run without --check');
        process.exitCode = 1;
    }
}

/* Only used by --prune; kept out of the hot path. */
const IGNORED_DIRS = new Set([
    'node_modules', '.git', '.idea', 'dist', 'build', 'out', 'target',
    'vendor', 'coverage', '__pycache__', 'venv', 'site-packages',
]);

async function findStaleSidecars(touched: ReadonlySet<string>): Promise<string[]> {
    const stale: string[] = [];
    const walk = async (relDir: string, depth: number): Promise<void> => {
        if (depth > 6) return;
        let dirents;
        try {
            dirents = await fs.readdir(path.join(ROOT, relDir), {withFileTypes: true});
        } catch {
            return;
        }
        for (const d of dirents) {
            if (d.name.startsWith('.') && d.name !== ENTRY_FILENAME) continue;
            const rel = relDir ? joinPosix(relDir, d.name) : d.name;
            if (d.isDirectory()) {
                if (IGNORED_DIRS.has(d.name)) continue;
                await walk(rel, depth + 1);
            } else if (d.isFile() && d.name === ENTRY_FILENAME && !touched.has(rel)) {
                stale.push(rel);
            }
        }
    };
    await walk('', 0);
    return stale.sort();
}

void exists; // reserved for future --backup support

main().catch((err) => {
    console.error(`sync-entries failed: ${(err as Error).message}`);
    process.exitCode = 1;
});