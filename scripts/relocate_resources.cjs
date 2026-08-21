#!/usr/bin/env node
'use strict';

/*
 * relocate_resources.cjs
 *
 * extract_resources.cjs hoisted every inline <script>/<style> into the root
 * js/ + css/ folders.  Afterwards the repo was split into git submodules, so
 * those files now live in the *wrong* repository: a submodule checked out on
 * its own would come up with no styling and no behaviour.
 *
 * This script pushes each asset back down into the submodule that references
 * it, rewrites the href/src, and then reports (or deletes) whatever is left
 * unreferenced in the outer repo.
 *
 * Assets used by more than one module are COPIED into each of them - never
 * symlinked, never shared - because a standalone submodule beats deduplication.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const {
  parseAttrs,
  getAttr,
  discoverModules,
  moduleRootFor
} = require('./extract_resources.cjs');

const VERSION = '1.0.0';

const DEFAULTS = {
  jsDir: 'js',
  cssDir: 'css',
  extensions: ['.html', '.htm', '.xhtml'],
  ignore: ['node_modules', '.git', '.hg', '.svn', 'bower_components'],
  moduleRoots: [],
  followDeps: true,
  prune: false,
  dryRun: false,
  verbose: false,
  quiet: false
};

const HELP = `relocate_resources v${VERSION}
Copy extracted js/css into the submodule that uses them, rewrite the
references, and clean up the leftovers in the outer repo.

Usage:
  relocate_resources.cjs [options] [root]        (default: ".")

Options:
      --js-dir <dir>     where scripts land inside a module   (default: js)
      --css-dir <dir>    where stylesheets land               (default: css)
      --module-root <d>  treat <d> as a module too (repeatable)
      --ext <list>       html extensions   (default: .html,.htm,.xhtml)
      --ignore <list>    extra directory names to skip
      --no-follow-deps   do not pull in files the moved asset imports
      --prune            delete outer-repo assets nobody references any more
  -n, --dry-run          report only, write nothing
  -v, --verbose          list every copy
  -q, --quiet            only print errors
  -V, --version          print version
  -h, --help             this text

Typical run after a repo split:
  node scripts/extract_resources.cjs --per-module .
  node scripts/relocate_resources.cjs -v .          # dry inspection
  node scripts/relocate_resources.cjs --prune .     # do it
`;

/* ------------------------------------------------------------------ *
 * tiny helpers
 * ------------------------------------------------------------------ */

function fail(msg) {
  const err = new Error(msg);
  err.userError = true;
  throw err;
}

function splitList(value) {
  return String(value).split(',').map(s => s.trim()).filter(Boolean);
}

function hash(buf) {
  return crypto.createHash('sha1').update(buf).digest('hex');
}

function posix(p) {
  return p.split(path.sep).join('/');
}

function show(root, file) {
  return posix(path.relative(root, file)) || path.basename(file);
}

function isInside(child, parent) {
  const c = path.resolve(child);
  const p = path.resolve(parent);
  return c === p || c.startsWith(p + path.sep);
}

function escapeAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

const TEXT_ASSET = new Set(['.js', '.mjs', '.cjs', '.css']);
function isTextAsset(file) {
  return TEXT_ASSET.has(path.extname(file).toLowerCase());
}

/** Local, resolvable spec?  (skips http:, data:, //cdn, /abs, #frag) */
function isLocalSpec(spec) {
  const s = String(spec).trim();
  if (!s || s.startsWith('#')) return false;
  if (s.startsWith('//') || s.startsWith('/')) return false;
  return !/^[a-z][a-z0-9+.-]*:/i.test(s);
}

/* ------------------------------------------------------------------ *
 * arguments
 * ------------------------------------------------------------------ */

function parseArgs(argv) {
  const opts = Object.assign({}, DEFAULTS, {
    extensions: DEFAULTS.extensions.slice(),
    ignore: DEFAULTS.ignore.slice(),
    moduleRoots: DEFAULTS.moduleRoots.slice()
  });
  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i];
    let inlineValue = null;

    if (arg.startsWith('--') && arg.includes('=')) {
      const eq = arg.indexOf('=');
      inlineValue = arg.slice(eq + 1);
      arg = arg.slice(0, eq);
    }
    const value = () => {
      if (inlineValue !== null) return inlineValue;
      if (i + 1 >= argv.length) fail(`Missing value for ${arg}`);
      return argv[++i];
    };

    switch (arg) {
      case '-h': case '--help':     opts.help = true; break;
      case '-V': case '--version':  opts.version = true; break;
      case '-n': case '--dry-run':  opts.dryRun = true; break;
      case '-v': case '--verbose':  opts.verbose = true; break;
      case '-q': case '--quiet':    opts.quiet = true; break;
      case '--prune':               opts.prune = true; break;
      case '--no-prune':            opts.prune = false; break;
      case '--no-follow-deps':      opts.followDeps = false; break;
      case '--js-dir':              opts.jsDir = value(); break;
      case '--css-dir':             opts.cssDir = value(); break;
      case '--module-root':         opts.moduleRoots.push(value()); break;
      case '--ext':
        opts.extensions = splitList(value()).map(e => (e.startsWith('.') ? e : '.' + e).toLowerCase());
        break;
      case '--ignore':
        opts.ignore = opts.ignore.concat(splitList(value()));
        break;
      case '--':
        positional.push(...argv.slice(i + 1));
        i = argv.length;
        break;
      default:
        if (arg.startsWith('-') && arg !== '-') fail(`Unknown option: ${arg}`);
        positional.push(arg);
    }
  }

  opts.inputs = positional.length ? positional : ['.'];
  return opts;
}

/* ------------------------------------------------------------------ *
 * html scanning
 * ------------------------------------------------------------------ */

const TAG_RE = /<(script|link)\b((?:"[^"]*"|'[^']*'|[^>"'])*)>/gi;

/** Every <script src> / <link rel=stylesheet href> with its byte range. */
function findRefs(html) {
  const refs = [];
  TAG_RE.lastIndex = 0;
  let m;
  while ((m = TAG_RE.exec(html))) {
    const tag = m[1].toLowerCase();
    const attrs = parseAttrs(m[2] || '');
    const push = (kind, attr, value) => refs.push({
      kind, attr, value,
      text: m[0],
      start: m.index,
      end: m.index + m[0].length
    });

    if (tag === 'script') {
      const src = getAttr(attrs, 'src');
      if (src) push('js', 'src', src);
      continue;
    }

    const href = getAttr(attrs, 'href');
    if (!href) continue;
    const rel = String(getAttr(attrs, 'rel') || '').toLowerCase();
    const as = String(getAttr(attrs, 'as') || '').toLowerCase();
    if (/\bstylesheet\b/.test(rel) || (/\bpreload\b/.test(rel) && as === 'style')) push('css', 'href', href);
    else if (/\bmodulepreload\b/.test(rel) || (/\bpreload\b/.test(rel) && as === 'script')) push('js', 'href', href);
  }
  return refs;
}

/** "js/foo.js" or "/js/foo.js" -> absolute path on disk (null if remote). */
function resolveRef(htmlFile, value, root) {
  const raw = String(value).split('#')[0].split('?')[0].trim();
  if (!raw) return null;
  if (raw.startsWith('//')) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return null;
  let decoded;
  try {
    decoded = decodeURI(raw);
  } catch (e) {
    decoded = raw;
  }
  return raw.startsWith('/')
    ? path.resolve(root, '.' + decoded)
    : path.resolve(path.dirname(htmlFile), decoded);
}

function replaceAttr(tagText, attrName, newValue) {
  const re = new RegExp(`(\\b${attrName}\\s*=\\s*)(?:"[^"]*"|'[^']*'|[^\\s"'\`=<>]+)`, 'i');
  return tagText.replace(re, (m, head) => `${head}"${escapeAttr(newValue)}"`);
}

function toHref(htmlFile, target) {
  const rel = posix(path.relative(path.dirname(htmlFile), target));
  return encodeURI(rel.startsWith('.') ? rel : './' + rel);
}

/* ------------------------------------------------------------------ *
 * copying
 * ------------------------------------------------------------------ */

/** Pick a free name inside `dir`; reuse it when the bytes already match. */
function reserve(target, content, ctx) {
  const digest = hash(content);
  const ext = path.extname(target);
  const stem = target.slice(0, target.length - ext.length);

  for (let n = 1; n < 1000; n++) {
    const candidate = n === 1 ? target : `${stem}-${n}${ext}`;
    const known = ctx.written.get(candidate);
    if (known !== undefined) {
      if (known === digest) return { path: candidate, fresh: false };
      continue;
    }
    if (fs.existsSync(candidate)) {
      if (hash(fs.readFileSync(candidate)) === digest) {
        ctx.written.set(candidate, digest);
        return { path: candidate, fresh: false };
      }
      continue;
    }
    return { path: candidate, fresh: true };
  }
  throw new Error('no free filename for ' + target);
}

function writeAsset(dest, content, opts, ctx) {
  ctx.written.set(dest, hash(content));
  if (opts.dryRun) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content);
}

/**
 * Copy `source` into `destDir`, pulling its relative dependencies along so
 * the result works without the outer repo.  Returns the written path.
 */
function importAsset(source, destDir, opts, ctx, depth) {
  const key = destDir + '|' + hash(fs.readFileSync(source));
  if (ctx.copies.has(key)) return ctx.copies.get(key);

  let content = fs.readFileSync(source);
  const slot = reserve(path.join(destDir, path.basename(source)), content, ctx);
  ctx.copies.set(key, slot.path);
  if (!slot.fresh) return slot.path;

  if (opts.followDeps && depth < 8 && isTextAsset(source)) {
    content = Buffer.from(
      rewriteDeps(content.toString('utf8'), path.dirname(source), destDir, opts, ctx, depth),
      'utf8'
    );
  }

  writeAsset(slot.path, content, opts, ctx);
  ctx.stats.copied++;
  if (opts.verbose && !opts.quiet) {
    console.log(`    + ${show(opts.root, slot.path)}   <- ${show(opts.root, source)}`);
  }
  return slot.path;
}

/** Rewrite @import / url() / import-from so they point at the local copy. */
function rewriteDeps(text, sourceDir, destDir, opts, ctx, depth) {
  const move = (spec) => {
    if (!isLocalSpec(spec)) return null;
    const clean = String(spec).split('#')[0].split('?')[0];
    if (!clean) return null;
    let abs;
    try {
      abs = path.resolve(sourceDir, decodeURI(clean));
    } catch (e) {
      return null;
    }
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
    const dest = importAsset(abs, destDir, opts, ctx, depth + 1);
    return './' + posix(path.basename(dest));
  };

  return text
    .replace(/@import\s+(["'])([^"']+)\1/g, (m, q, spec) => {
      const moved = move(spec);
      return moved ? `@import ${q}${moved}${q}` : m;
    })
    .replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (m, q, spec) => {
      const moved = move(spec);
      return moved ? `url(${q}${moved}${q})` : m;
    })
    .replace(/(\bfrom\s*|(?:^|[^\w$.])\bimport\s*\(?\s*)(["'])([^"']+)\2/g, (m, head, q, spec) => {
      const moved = move(spec);
      return moved ? `${head}${q}${moved}${q}` : m;
    });
}

/** Every relative spec a text asset mentions (used for the keep-alive pass). */
function collectSpecs(text) {
  const specs = [];
  const patterns = [
    /@import\s+(["'])([^"']+)\1/g,
    /url\(\s*(["']?)([^"')]+)\1\s*\)/g,
    /(?:\bfrom\s*|(?:^|[^\w$.])\bimport\s*\(?\s*)(["'])([^"']+)\1/g
  ];
  for (const re of patterns) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(text))) specs.push(m[2]);
  }
  return specs;
}

/* ------------------------------------------------------------------ *
 * per file work
 * ------------------------------------------------------------------ */

function processHtml(file, opts, ctx) {
  const original = fs.readFileSync(file, 'utf8');
  const owner = moduleRootFor(file, opts.modules, opts.root);
  const refs = findRefs(original);

  let out = '';
  let last = 0;
  const moved = [];

  for (const ref of refs) {
    const target = resolveRef(file, ref.value, opts.root);
    if (!target || !isInside(target, opts.root)) continue;

    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      ctx.stats.missing++;
      if (opts.verbose && !opts.quiet) {
        console.log(`    ? ${show(opts.root, file)} -> ${ref.value} (missing)`);
      }
      continue;
    }

    const assetOwner = moduleRootFor(target, opts.modules, opts.root);
    if (assetOwner === owner) {          // already inside the same checkout
      ctx.referenced.add(path.resolve(target));
      continue;
    }

    const destDir = path.join(owner, path.extname(target).toLowerCase() === '.css' || ref.kind === 'css'
      ? opts.cssDir
      : opts.jsDir);
    const dest = importAsset(target, destDir, opts, ctx, 0);
    ctx.referenced.add(path.resolve(dest));
    ctx.touched.add(owner);

    out += original.slice(last, ref.start) + replaceAttr(ref.text, ref.attr, toHref(file, dest));
    last = ref.end;
    moved.push({ from: target, to: dest });
    ctx.stats.rewritten++;
  }

  if (!moved.length) return;
  out += original.slice(last);

  ctx.stats.files++;
  if (!opts.quiet) {
    console.log(`${opts.dryRun ? '~' : '*'} ${show(opts.root, file)}  (${moved.length} ref${moved.length > 1 ? 's' : ''} -> ${show(opts.root, owner) || '.'})`);
  }
  if (!opts.dryRun) fs.writeFileSync(file, out, 'utf8');
}

/* ------------------------------------------------------------------ *
 * clean up
 * ------------------------------------------------------------------ */

/** An asset kept alive by html may itself @import something: keep that too. */
function expandReferences(ctx) {
  const queue = [...ctx.referenced];
  const seen = new Set();
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    if (!isTextAsset(file) || !fs.existsSync(file)) continue;
    const dir = path.dirname(file);
    for (const spec of collectSpecs(fs.readFileSync(file, 'utf8'))) {
      if (!isLocalSpec(spec)) continue;
      const abs = path.resolve(dir, spec.split('#')[0].split('?')[0]);
      if (!fs.existsSync(abs)) continue;
      if (ctx.referenced.has(abs)) continue;
      ctx.referenced.add(abs);
      queue.push(abs);
    }
  }
}

function listFiles(dir, acc) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return acc;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) listFiles(full, acc);
    else if (entry.isFile()) acc.push(path.resolve(full));
  }
  return acc;
}

function removeEmptyDirs(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch (e) {
    return;
  }
  for (const name of entries) {
    const full = path.join(dir, name);
    try {
      if (fs.statSync(full).isDirectory()) removeEmptyDirs(full);
    } catch (e) { /* ignore */ }
  }
  try {
    if (!fs.readdirSync(dir).length) fs.rmdirSync(dir);
  } catch (e) { /* ignore */ }
}

function pruneOrphans(opts, ctx) {
  const roots = [path.join(opts.root, opts.jsDir), path.join(opts.root, opts.cssDir)];
  const orphans = [];

  for (const dir of roots) {
    for (const file of listFiles(dir, [])) {
      if (ctx.referenced.has(file)) continue;
      if (moduleRootFor(file, opts.modules, opts.root) !== opts.root) continue;   // belongs to a module
      orphans.push(file);
    }
  }
  if (!orphans.length) return 0;

  if (!opts.prune) {
    if (!opts.quiet) {
      console.log(`\n${orphans.length} outer-repo asset(s) are no longer referenced:`);
      for (const file of orphans) console.log(`  - ${show(opts.root, file)}`);
      console.log('Re-run with --prune to delete them.');
    }
    return 0;
  }

  for (const file of orphans) {
    if (!opts.quiet) console.log(`${opts.dryRun ? '~' : '-'} ${show(opts.root, file)}`);
    if (!opts.dryRun) fs.unlinkSync(file);
  }
  if (!opts.dryRun) for (const dir of roots) removeEmptyDirs(dir);
  return orphans.length;
}

/* ------------------------------------------------------------------ *
 * entry point
 * ------------------------------------------------------------------ */

function collectHtml(root, opts) {
  const files = [];
  const stack = [path.resolve(root)];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      console.error(`! cannot read ${dir}: ${e.message}`);
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (opts.ignore.includes(entry.name)) continue;
        stack.push(full);
      } else if (entry.isFile() && opts.extensions.includes(path.extname(entry.name).toLowerCase())) {
        files.push(path.resolve(full));
      }
    }
  }
  return files.sort();
}

function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    if (!e.userError) throw e;
    console.error(e.message + '\nTry --help.');
    return 2;
  }

  if (opts.help) { console.log(HELP); return 0; }
  if (opts.version) { console.log(VERSION); return 0; }

  opts.root = path.resolve(opts.inputs[0] || '.');
  if (!fs.existsSync(opts.root) || !fs.statSync(opts.root).isDirectory()) {
    console.error(`${opts.root} is not a directory.`);
    return 2;
  }

  opts.modules = discoverModules(opts.root, opts);
  if (!opts.modules.length && !opts.quiet) {
    console.log('No submodules found - nothing to relocate.');
  }
  if (opts.verbose && !opts.quiet) {
    for (const mod of opts.modules) console.log(`  module: ${show(opts.root, mod)}`);
  }

  const ctx = {
    copies: new Map(),      // destDir|sha1(source) -> written path
    written: new Map(),     // path -> sha1 (name collision bookkeeping)
    referenced: new Set(),  // assets still needed by somebody
    touched: new Set(),     // modules that gained files
    stats: { files: 0, rewritten: 0, copied: 0, missing: 0, errors: 0 }
  };

  for (const file of collectHtml(opts.root, opts)) {
    try {
      processHtml(file, opts, ctx);
    } catch (e) {
      ctx.stats.errors++;
      console.error(`! ${show(opts.root, file)}: ${e.message}`);
    }
  }

  expandReferences(ctx);
  const removed = pruneOrphans(opts, ctx);

  if (!opts.quiet) {
    const s = ctx.stats;
    console.log(
      `\n${opts.dryRun ? '[dry-run] ' : ''}${s.rewritten} reference(s) in ${s.files} page(s) rewritten, ` +
      `${s.copied} file(s) copied into ${ctx.touched.size} module(s)` +
      (removed ? `, ${removed} orphan(s) removed` : '') +
      (s.missing ? `, ${s.missing} broken link(s)` : '') +
      (s.errors ? `, ${s.errors} error(s)` : '')
    );
    if (ctx.touched.size && !opts.dryRun) {
      console.log('\nCommit inside each submodule, then bump the pointers here:');
      for (const mod of [...ctx.touched].sort()) {
        console.log(`  git -C ${show(opts.root, mod)} add -A && git -C ${show(opts.root, mod)} commit -m "vendor page assets"`);
      }
    }
  }
  return ctx.stats.errors ? 1 : 0;
}

module.exports = {
  VERSION, DEFAULTS, HELP,
  main, parseArgs, findRefs, resolveRef, replaceAttr, toHref,
  rewriteDeps, collectSpecs, collectHtml, processHtml, pruneOrphans
};

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}