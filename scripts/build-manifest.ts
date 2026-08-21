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
  *   --no-git        skip git/submodule repository discovery
  *   --git-remote=<name>       remote used for repo URLs (default: origin)
  *   --submodule-status=<file> fallback for `git submodule status` output
  *                             (default: submodules.txt)
  *   --pin-head      also record the outer repo's HEAD commit/branch
 *   --check         write nothing; exit 1 if any output would change
 *   --quiet         only print the summary
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

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
   type RepoInfo,
   type SubmoduleStatus,
  type UnifiedManifest,
  isExternal,
  joinPosix,
   makeRepoInfo,
   matchRepoPath,
   mergeRepoInfo,
   normalizeRepoRef,
  orderKeys,
   parseGitmodules,
   parseSubmoduleStatus,
   relativeUnder,
  resolveEntryPaths,
  serializeJson,
  toLegacyEntry,
  compareEntries,
  validateEntryFile,
} from './manifest_schema.ts';

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
const GIT = !flag('no-git');
const GIT_REMOTE = opt('git-remote', 'origin');
const STATUS_FILE = opt('submodule-status', 'submodules.txt');
const PIN_HEAD = flag('pin-head');
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
/* ---------------------------------------------------------------- git */
const execFileAsync = promisify(execFile);
interface DiscoveredRepo {
   path: string;
   state: SubmoduleStatus['state'];
   info: RepoInfo;
}
interface GitContext {
   root?: RepoInfo;
   submodules: DiscoveredRepo[];
}
async function git(...args: string[]): Promise<string | null> {
   try {
     const { stdout } = await execFileAsync('git', args, { cwd: ROOT, maxBuffer: 32 * 1024 * 1024 });
     return stdout;
   } catch {
     return null; // git missing, not a repo, or command unsupported
   }
}
async function readIfPresent(rel: string): Promise<string | null> {
   try { return await fs.readFile(path.join(ROOT, rel), 'utf8'); } catch { return null; }
}
/**
  * Discover the outer repository plus every submodule checkout.
  *
  * Only *stable* facts are recorded — remote URL, checkout path, and the pinned
  * submodule gitlink. The outer repo's own HEAD is deliberately omitted because
  * it changes on every commit, which would leave `--check` permanently stale;
  * pass `--pin-head` when you really want it.
  *
  * Works without git installed too: `.gitmodules` plus a committed
  * `submodules.txt` (`--submodule-status=`) is enough.
  */
async function loadGitContext(): Promise<GitContext> {
   if (!GIT) return { submodules: [] };
   const remote = (await git('config', '--get', `remote.${GIT_REMOTE}.url`))?.trim() ?? '';
   const headCommit = PIN_HEAD ? ((await git('rev-parse', 'HEAD'))?.trim() ?? '') : '';
   const rawBranch = PIN_HEAD ? ((await git('rev-parse', '--abbrev-ref', 'HEAD'))?.trim() ?? '') : '';
   const headBranch = rawBranch === 'HEAD' ? '' : rawBranch;
   const root =
     remote || headCommit
       ? makeRepoInfo({ remote, commit: headCommit, branch: headBranch })
       : undefined;
   const modules = parseGitmodules((await readIfPresent('.gitmodules')) ?? '');
   const statusText =
     (await git('submodule', 'status', '--recursive')) ?? (await readIfPresent(STATUS_FILE)) ?? '';
   const status = new Map(parseSubmoduleStatus(statusText).map((s) => [s.path, s]));
   const submodules: DiscoveredRepo[] = [];
   for (const mod of modules) {
     const st = status.get(mod.path);
     status.delete(mod.path);
     submodules.push({
       path: mod.path,
       // Without any status source we cannot judge initialization: assume fine.
       state: st?.state ?? (statusText ? '-' : ' '),
       info: makeRepoInfo({
         remote: mod.url,
         base: remote,
         path: mod.path,
         commit: st?.commit,
         // `branch = .` means "track the superproject's branch".
         branch: mod.branch === '.' ? headBranch : mod.branch,
         submodule: true,
       }),
     });
   }
   // Checkouts git knows about that `.gitmodules` does not (nested or stale).
   for (const st of status.values()) {
     submodules.push({
       path: st.path,
       state: st.state,
       info: makeRepoInfo({ path: st.path, commit: st.commit, submodule: true }),
     });
   }
   submodules.sort((a, b) => a.path.localeCompare(b.path));
   if (!root && !submodules.length) log('  note     no git metadata found; entries will have no repo');
   else log(`  git      ${submodules.length} submodule(s)${root?.url ? ` under ${root.url}` : ''}`);
   return { root, submodules };
}
/** Which repository owns `dir`? Longest matching submodule wins, else the root. */
function repoForDir(
   dir: string,
   ctx: GitContext,
   source: string,
   warnings: string[],
   warned: Set<string>,
): RepoInfo | undefined {
   const match = matchRepoPath(dir, ctx.submodules.map((s) => s.path));
   if (match) {
     const sub = ctx.submodules.find((s) => s.path === match)!;
     if (sub.state === '-' && !warned.has(sub.path)) {
       warned.add(sub.path);
       warnings.push(`${source}: submodule "${sub.path}" is not initialized — commit pin may be stale`);
     }
     const rel = relativeUnder(sub.path, dir);
     return mergeRepoInfo(rel ? { subpath: rel } : undefined, sub.info);
   }
   if (!ctx.root) return undefined;
   return mergeRepoInfo(dir ? { subpath: dir } : undefined, ctx.root);
}

/* --------------------------------------------------------------- load */

interface LoadResult {
  entries: ManifestEntry[];
  errors: string[];
  warnings: string[];
}

async function loadEntries(gitContext: GitContext): Promise<LoadResult> {
  const entries: ManifestEntry[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const seenIds = new Map<string, string>();
   const warnedRepos = new Set<string>();

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
     // Autodiscovered provenance; anything hand-written in the sidecar wins.
     const repo = mergeRepoInfo(
       normalizeRepoRef(file.repo),
       repoForDir(dir, gitContext, source, warnings, warnedRepos),
     );


    const entry: ManifestEntry = orderKeys(
      {
        ...file,
        section: file.section ?? legacy?.defaultSection ?? category,
        order: file.order ?? Number.MAX_SAFE_INTEGER,
         repo,
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
   const gitContext = await loadGitContext();
   const { entries, errors, warnings } = await loadEntries(gitContext);

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
   const repos = new Set(entries.map((e) => e.repo?.url || e.repo?.path).filter(Boolean));
   const repoNote = GIT ? ` across ${repos.size} repo${repos.size === 1 ? '' : 's'}` : '';
   console.log(`\nbuild-manifest: ${entries.length} entries (${summary})${repoNote} → ${OUT}`);

  if (CHECK && drift) {
    console.error('build-manifest --check: output is stale, re-run without --check');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`build-manifest failed: ${(err as Error).message}`);
  process.exitCode = 1;
});