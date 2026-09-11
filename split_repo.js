#!/usr/bin/env node
/**
 * split_repo.js
 * ---------------------------------------------------------------------------
 * Split this monorepo so that every directory containing an `entry.json`
 * becomes its own GitHub repository (under an org, default `Simiacryptus`)
 * and is re-attached here as a git submodule at the *same path*, so that
 * experiments.json / games.json / essays.json links keep resolving.
 *
 * History IS preserved: each module is extracted with `git filter-repo
 * --subdirectory-filter <dir>` (preferred) or `git subtree split` (fallback).
 *
 * Usage:
 *   node split_repo.js --list                 # show the plan, touch nothing
 *   node split_repo.js --dry-run              # full plan + every command
 *   node split_repo.js --only experiments/mesh --only essays/QQN
 *   node split_repo.js --prefix math-         # avoid name collisions in org
 *   node split_repo.js                        # do it
 *
 * Options:
 *   --org <name>        GitHub org/owner            (default: Simiacryptus)
 *   --prefix <str>      Prefix for every repo name  (default: "")
 *   --visibility <v>    public | private | internal (default: public)
 *   --branch <name>     Branch name in new repos    (default: main)
 *   --only <path>       Repeatable; substring/exact match on module path
 *   --skip <path>       Repeatable; substring/exact match on module path
 *   --tool <t>          filter-repo | subtree       (default: auto)
 *   --ssh               Use git@github.com: submodule URLs
 *   --no-create         Don't create GitHub repos
 *   --no-push           Don't push (implies --no-create, keeps temp dirs)
 *   --no-submodule      Extract/push only; leave this repo untouched
 *   --keep-temp         Don't delete the temporary working clones
 *   --resume            Skip modules recorded as done in the state file
 *   --dirty-ok          Proceed even if the working tree is dirty
 *   --list              Print the plan and exit
 *   --dry-run           Print every mutating command instead of running it
 *   -v, --verbose       Echo command output
 *   -h, --help
 *
 * Requirements: git >= 2.30, gh (authenticated), git-filter-repo (recommended).
 *   pipx install git-filter-repo   # or: pip install --user git-filter-repo
 * ---------------------------------------------------------------------------
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ---------------------------------------------------------------------------
// constants
// ---------------------------------------------------------------------------

const MARKER = 'entry.json';
const STATE_FILE = '.split-repo-state.json';
const REPORT_FILE = 'split-report.json';
const SKIP_DIRS = new Set([
  '.git',
  '.idea',
  '.lake',
  'node_modules',
  'dist',
  'build',
  'coverage',
  'lib',
  'companion',
  'assets',
  'terraform',
  'transcript',
  'videos',
]);

const C = process.stdout.isTTY
  ? {
      dim: (s) => `\x1b[2m${s}\x1b[0m`,
      red: (s) => `\x1b[31m${s}\x1b[0m`,
      green: (s) => `\x1b[32m${s}\x1b[0m`,
      yellow: (s) => `\x1b[33m${s}\x1b[0m`,
      blue: (s) => `\x1b[36m${s}\x1b[0m`,
      bold: (s) => `\x1b[1m${s}\x1b[0m`,
    }
  : new Proxy({}, { get: () => (s) => s });

// ---------------------------------------------------------------------------
// cli
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const o = {
    org: 'Simiacryptus',
    prefix: '',
    visibility: 'public',
    branch: 'main',
    only: [],
    skip: [],
    tool: 'auto',
    ssh: false,
    create: true,
    push: true,
    submodule: true,
    keepTemp: false,
    resume: false,
    dirtyOk: false,
    list: false,
    dryRun: false,
    verbose: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) fatal(`Missing value for ${a}`);
      return v;
    };
    switch (a) {
      case '--org':
        o.org = next();
        break;
      case '--prefix':
        o.prefix = next();
        break;
      case '--visibility':
        o.visibility = next();
        break;
      case '--branch':
        o.branch = next();
        break;
      case '--only':
        o.only.push(normPath(next()));
        break;
      case '--skip':
        o.skip.push(normPath(next()));
        break;
      case '--tool':
        o.tool = next();
        break;
      case '--ssh':
        o.ssh = true;
        break;
      case '--no-create':
        o.create = false;
        break;
      case '--no-push':
        o.push = false;
        o.create = false;
        o.keepTemp = true;
        break;
      case '--no-submodule':
        o.submodule = false;
        break;
      case '--keep-temp':
        o.keepTemp = true;
        break;
      case '--resume':
        o.resume = true;
        break;
      case '--dirty-ok':
        o.dirtyOk = true;
        break;
      case '--list':
        o.list = true;
        break;
      case '--dry-run':
      case '-n':
        o.dryRun = true;
        break;
      case '--verbose':
      case '-v':
        o.verbose = true;
        break;
      case '--help':
      case '-h':
        usage();
        process.exit(0);
        break;
      default:
        if (a.startsWith('-')) fatal(`Unknown option: ${a}`);
        o.only.push(normPath(a));
    }
  }
  if (!['public', 'private', 'internal'].includes(o.visibility)) {
    fatal(`--visibility must be public|private|internal`);
  }
  return o;
}

function usage() {
  const header = fs
    .readFileSync(new URL(import.meta.url), 'utf8')
    .split('\n')
    .slice(2)
    .filter((l) => l.startsWith(' *'))
    .map((l) => l.replace(/^ \*ary?/, '').replace(/^ \* ?/, ''))
    .join('\n');
  console.log(header);
}

// ---------------------------------------------------------------------------
// process helpers
// ---------------------------------------------------------------------------

let OPTS = /** @type {ReturnType<typeof parseArgs>} */ ({});

function fatal(msg) {
  console.error(`${C.red('✗')} ${msg}`);
  process.exit(1);
}
const log = {
  step: (s) => console.log(`\n${C.bold(C.blue('▶'))} ${C.bold(s)}`),
  info: (s) => console.log(`  ${s}`),
  ok: (s) => console.log(`  ${C.green('✓')} ${s}`),
  warn: (s) => console.log(`  ${C.yellow('!')} ${s}`),
  err: (s) => console.log(`  ${C.red('✗')} ${s}`),
  cmd: (cwd, cmd, args) =>
    console.log(C.dim(`  $ (${path.basename(cwd)}) ${cmd} ${args.join(' ')}`)),
};

/** Run a command. Always executes (use `mutate` for write operations). */
function run(cmd, args, opts = {}) {
  const { cwd = ROOT, check = true, stream = false, quiet = false, env } = opts;
  if (!quiet) log.cmd(cwd, cmd, args);
  const res = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    env: env ? { ...process.env, ...env } : process.env,
    stdio: stream ? ['ignore', 'inherit', 'inherit'] : ['ignore', 'pipe', 'pipe'],
    maxBuffer: 1024 * 1024 * 64,
  });
  const stdout = (res.stdout || '').toString();
  const stderr = (res.stderr || '').toString();
  if (OPTS.verbose && !stream) {
    if (stdout.trim()) console.log(C.dim(indent(stdout.trim())));
    if (stderr.trim()) console.log(C.dim(indent(stderr.trim())));
  }
  if (res.error && check) throw new Error(`${cmd}: ${res.error.message}`);
  if (check && res.status !== 0) {
    throw new Error(
      `${cmd} ${args.join(' ')} failed (exit ${res.status})\n${indent(stderr || stdout)}`
    );
  }
  return { status: res.status ?? 1, stdout: stdout.trim(), stderr: stderr.trim() };
}

/** Run a *mutating* command; becomes a no-op under --dry-run. */
function mutate(cmd, args, opts = {}) {
  if (OPTS.dryRun) {
    console.log(C.yellow(`  ~ (${path.basename(opts.cwd || ROOT)}) ${cmd} ${args.join(' ')}`));
    return { status: 0, stdout: '', stderr: '', dryRun: true };
  }
  return run(cmd, args, opts);
}

const git = (args, opts) => run('git', args, opts);
const gitM = (args, opts) => mutate('git', args, opts);
const indent = (s) =>
  s
    .split('\n')
    .map((l) => `      ${l}`)
    .join('\n');
const normPath = (p) => p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
const has = (bin, args = ['--version']) => spawnSync(bin, args, { stdio: 'ignore' }).status === 0;

// ---------------------------------------------------------------------------
// repo discovery
// ---------------------------------------------------------------------------

const ROOT = (() => {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (r.status !== 0) fatal('Not inside a git repository.');
  return r.stdout.trim();
})();

/** Topmost directories containing `entry.json` (never recurses into a module). */
function findModuleDirs(root) {
  const found = [];
  (function walk(dir) {
    let items;
    try {
      items = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (dir !== root && items.some((d) => d.isFile() && d.name === MARKER)) {
      found.push(normPath(path.relative(root, dir)));
      return; // a module is a leaf as far as splitting is concerned
    }
    for (const d of items) {
      if (!d.isDirectory()) continue;
      if (d.name.startsWith('.') || SKIP_DIRS.has(d.name)) continue;
      walk(path.join(dir, d.name));
    }
  })(root);
  return found.sort();
}

function slugify(s) {
  return String(s)
    .normalize('NFKD')
    .replace(/[_\s]+/g, '-')
    .replace(/[^A-Za-z0-9.\-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .toLowerCase();
}

function readEntry(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, dir, MARKER), 'utf8'));
  } catch {
    return {};
  }
}

/** Build {dir, name, url, description, entry} plan, resolving name collisions. */
function buildPlan(dirs) {
  const byName = new Map();
  const plan = dirs.map((dir) => {
    const entry = readEntry(dir);
    const explicit = entry.repo || entry.repoName || entry.slug;
    const base = slugify(explicit || path.basename(dir));
    return { dir, entry, base, explicit: Boolean(explicit) };
  });
  // collision resolution: qualify with the parent directory
  const counts = new Map();
  for (const p of plan) counts.set(p.base, (counts.get(p.base) || 0) + 1);
  for (const p of plan) {
    let name = p.base;
    if (!p.explicit && counts.get(p.base) > 1) {
      const parent = slugify(path.dirname(p.dir).split('/').pop() || '');
      name = parent ? `${parent}-${p.base}` : p.base;
    }
    name = `${OPTS.prefix}${name}`;
    if (byName.has(name)) fatal(`Repo name collision: "${name}" (${byName.get(name)} vs ${p.dir})`);
    byName.set(name, p.dir);
    p.name = name;
    p.full = `${OPTS.org}/${name}`;
    p.url = OPTS.ssh
      ? `git@github.com:${OPTS.org}/${name}.git`
      : `https://github.com/${OPTS.org}/${name}.git`;
    p.description = (p.entry.description || p.entry.blurb || p.entry.summary || p.entry.title || '')
      .toString()
      .replace(/\s+/g, ' ')
      .slice(0, 340);
  }
  return plan;
}

// ---------------------------------------------------------------------------
// preflight
// ---------------------------------------------------------------------------

function preflight() {
  log.step('Preflight');
  if (!has('git')) fatal('git not found on PATH.');
  log.ok(`git ${git(['--version'], { quiet: true }).stdout.replace('git version ', '')}`);

  const filterRepo = has('git', ['filter-repo', '--version']);
  let tool = OPTS.tool;
  if (tool === 'auto') tool = filterRepo ? 'filter-repo' : 'subtree';
  if (tool === 'filter-repo' && !filterRepo) {
    fatal('git-filter-repo not installed. `pipx install git-filter-repo` or use --tool subtree');
  }
  log.ok(`history rewrite tool: ${tool}${tool === 'subtree' ? C.yellow(' (fallback)') : ''}`);

  if (OPTS.create || OPTS.push) {
    if (!has('gh')) fatal('gh CLI not found. https://cli.github.com/');
    if (run('gh', ['auth', 'status'], { check: false, quiet: true }).status !== 0) {
      fatal('gh is not authenticated. Run: gh auth login');
    }
    log.ok(`gh authenticated (org: ${OPTS.org})`);
  }

  const dirty = git(['status', '--porcelain'], { quiet: true }).stdout;
  if (dirty && !OPTS.dirtyOk && !OPTS.dryRun && !OPTS.list) {
    console.log(indent(dirty));
    fatal('Working tree is dirty. Commit/stash first (or pass --dirty-ok).');
  }
  const head = git(['rev-parse', '--abbrev-ref', 'HEAD'], { quiet: true }).stdout;
  log.ok(`root: ${ROOT} @ ${head}`);
  return tool;
}

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------

const statePath = path.join(ROOT, STATE_FILE);
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return { done: {} };
  }
}
function saveState(state) {
  if (OPTS.dryRun) return;
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// per-module pipeline
// ---------------------------------------------------------------------------

/** Extract `dir` (with history) into a standalone repo at `work`. */
function extract(mod, work, tool) {
  fs.mkdirSync(path.dirname(work), { recursive: true });
  if (tool === 'filter-repo') {
    mutate('git', ['clone', '--no-hardlinks', '--no-tags', ROOT, work], {
      cwd: ROOT,
      stream: true,
    });
    mutate('git', ['filter-repo', '--force', '--subdirectory-filter', mod.dir], { cwd: work });
  } else {
    // git subtree split: replays the directory onto a synthetic branch
    const tmpBranch = `split/${mod.name}`;
    gitM(['branch', '-D', tmpBranch], { cwd: ROOT, check: false });
    gitM(['subtree', 'split', `--prefix=${mod.dir}`, '-b', tmpBranch], { cwd: ROOT, stream: true });
    mutate('git', ['init', '-b', OPTS.branch, work], { cwd: ROOT });
    mutate('git', ['-c', 'protocol.file.allow=always', 'fetch', ROOT, tmpBranch], { cwd: work });
    mutate('git', ['reset', '--hard', 'FETCH_HEAD'], { cwd: work });
    gitM(['branch', '-D', tmpBranch], { cwd: ROOT, check: false });
  }
  if (OPTS.dryRun) return { commits: '?', branch: OPTS.branch };
  // normalise branch name + drop any inherited remote
  mutate('git', ['branch', '-M', OPTS.branch], { cwd: work });
  mutate('git', ['remote', 'remove', 'origin'], { cwd: work, check: false });
  const commits = git(['rev-list', '--count', 'HEAD'], { cwd: work, quiet: true }).stdout;
  if (commits === '0') throw new Error(`No history extracted for ${mod.dir}`);
  return { commits, branch: OPTS.branch };
}

function ghRepoExists(full) {
  return (
    run('gh', ['repo', 'view', full, '--json', 'name'], { check: false, quiet: true }).status === 0
  );
}

function createAndPush(mod, work) {
  if (OPTS.create) {
    if (ghRepoExists(mod.full)) {
      log.warn(`GitHub repo ${mod.full} already exists — reusing`);
    } else {
      const args = ['repo', 'create', mod.full, `--${OPTS.visibility}`];
      if (mod.description) args.push('--description', mod.description);
      if (mod.entry.url) args.push('--homepage', String(mod.entry.url));
      mutate('gh', args, { cwd: work, stream: true });
      log.ok(`created ${mod.full} (${OPTS.visibility})`);
    }
  }
  if (OPTS.push) {
    mutate('git', ['remote', 'add', 'origin', mod.url], { cwd: work, check: false });
    mutate('git', ['remote', 'set-url', 'origin', mod.url], { cwd: work, check: false });
    mutate('git', ['push', '-u', 'origin', OPTS.branch], { cwd: work, stream: true });
    log.ok(`pushed ${OPTS.branch} → ${mod.url}`);
  } else {
    log.warn('--no-push: skipping remote push');
  }
}

function isGitlink(dir) {
  const out = git(['ls-files', '--stage', '--', dir], { check: false, quiet: true }).stdout;
  return /^160000 /.test(out);
}

function replaceWithSubmodule(mod, work) {
  // 1. remove the tracked directory
  gitM(['rm', '-r', '-q', '--', mod.dir]);
  if (!OPTS.dryRun && fs.existsSync(path.join(ROOT, mod.dir))) {
    fs.rmSync(path.join(ROOT, mod.dir), { recursive: true, force: true }); // untracked leftovers
  }
  gitM([
    'commit',
    '-m',
    `chore(split): extract ${mod.dir} into ${mod.full}`,
    '-m',
    `History preserved via git filter-repo. Re-added as a submodule in the next commit.`,
  ]);

  // 2. add it back as a submodule at the same path
  const url = OPTS.push ? mod.url : `file://${work}`;
  if (!OPTS.push) log.warn(`Submodule URL points at the temp clone: ${url}`);
  // stale .git/modules entries make `submodule add` refuse
  const modulesDir = path.join(ROOT, '.git', 'modules', mod.dir);
  if (!OPTS.dryRun && fs.existsSync(modulesDir))
    fs.rmSync(modulesDir, { recursive: true, force: true });
  gitM(
    [
      '-c',
      'protocol.file.allow=always',
      'submodule',
      'add',
      '--force',
      '-b',
      OPTS.branch,
      '--name',
      mod.dir,
      url,
      mod.dir,
    ],
    { stream: true }
  );
  gitM(['commit', '-m', `chore(split): add ${mod.dir} as submodule → ${mod.full}`]);
  log.ok(`submodule ${mod.dir} → ${url}`);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main() {
  OPTS = parseArgs(process.argv.slice(2));

  const allDirs = findModuleDirs(ROOT);
  const matches = (list, dir) => list.some((p) => dir === p || dir.includes(p));
  const dirs = allDirs
    .filter((d) => (OPTS.only.length ? matches(OPTS.only, d) : true))
    .filter((d) => !matches(OPTS.skip, d));

  if (dirs.length === 0) fatal(`No directories with ${MARKER} matched.`);
  const plan = buildPlan(dirs);

  log.step(`Plan — ${plan.length} module(s) of ${allDirs.length} found`);
  for (const m of plan) {
    const flag = isGitlink(m.dir) ? C.yellow('  [already a submodule]') : '';
    console.log(`  ${m.dir.padEnd(46)} → ${C.bold(m.full)}${flag}`);
  }
  if (OPTS.list) return;

  const tool = preflight();
  const state = loadState();
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'split-repo-'));
  const report = {
    org: OPTS.org,
    branch: OPTS.branch,
    tool,
    generated: new Date().toISOString(),
    modules: [],
  };
  const failures = [];

  for (const mod of plan) {
    log.step(`${mod.dir}  →  ${mod.full}`);
    try {
      if (OPTS.resume && state.done[mod.dir]) {
        log.warn('already done (--resume) — skipping');
        continue;
      }
      if (isGitlink(mod.dir)) {
        log.warn('path is already a gitlink/submodule — skipping');
        continue;
      }
      const work = path.join(tmpRoot, mod.name);
      const { commits } = extract(mod, work, tool);
      log.ok(`extracted ${commits} commit(s) → ${work}`);
      createAndPush(mod, work);
      if (OPTS.submodule) replaceWithSubmodule(mod, work);
      else log.warn('--no-submodule: this repo left untouched');

      state.done[mod.dir] = { repo: mod.full, url: mod.url, at: new Date().toISOString(), commits };
      saveState(state);
      report.modules.push({
        path: mod.dir,
        repo: mod.full,
        url: mod.url,
        commits,
        title: mod.entry.title || null,
      });

      if (!OPTS.keepTemp && !OPTS.dryRun) fs.rmSync(work, { recursive: true, force: true });
    } catch (err) {
      log.err(err.message);
      failures.push({ dir: mod.dir, error: err.message });
    }
  }

  if (!OPTS.dryRun && report.modules.length) {
    fs.writeFileSync(path.join(ROOT, REPORT_FILE), `${JSON.stringify(report, null, 2)}\n`);
  }
  if (!OPTS.keepTemp && !OPTS.dryRun) fs.rmSync(tmpRoot, { recursive: true, force: true });
  else log.warn(`temp clones kept in ${tmpRoot}`);

  log.step('Summary');
  log.ok(`${report.modules.length} module(s) split`);
  for (const f of failures) log.err(`${f.dir}: ${f.error.split('\n')[0]}`);
  if (report.modules.length && OPTS.submodule && !OPTS.dryRun) {
    log.info('');
    log.info('Next steps:');
    log.info('  git submodule update --init --recursive');
    log.info('  git push          # publish the submodule commits');
    log.info('  npm run validate  # manifests keep the same paths, so links still work');
  }
  if (failures.length) process.exit(1);
}

try {
  main();
} catch (err) {
  fatal(err instanceof Error ? err.stack || err.message : String(err));
}
