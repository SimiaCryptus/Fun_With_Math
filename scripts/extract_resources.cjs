#! /usr/bin/env node
'use strict';

//Find all html files, and extract all inline js and css into seperate files.
//
//  usage: extract_resources.js [options] [dir|file ...]
//
//  * <script>…</script>  ->  <script src="/js/<page>.js"></script>
//  * <style>…</style>    ->  <link rel="stylesheet" href="/css/<page>.css">
//
//  Blocks that must stay inline (external src, JSON-LD, templates,
//  data-no-extract, …) are left untouched.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VERSION = '1.0.0';

const DEFAULTS = {
  outDir: '',        // root folder for the generated files
  jsDir: 'js',             // <outDir>/js
  cssDir: 'css',           // <outDir>/css
  extensions: ['.html', '.htm', '.xhtml'],
  ignore: ['node_modules', '.git', '.hg', '.svn', 'bower_components'],
  minSize: 0,              // don't extract snippets smaller than N chars
  dryRun: false,
  backup: false,
  verbose: false,
  quiet: false,
  dedupe: true,            // identical blocks share one file
  jsEnabled: true,
  cssEnabled: true,
  urlPrefix: null          // e.g. "/static" -> href="/static/css/page.css"
};

const HELP = `extract_resources v${VERSION}
Find all html files, and extract all inline js and css into separate files.

Usage:
  extract_resources.js [options] [dir|file ...]      (default: ".")

Options:
  -o, --out <dir>        output root, relative to the scanned root  (default: )
      --js-dir <dir>     sub folder for scripts      (default: js)
      --css-dir <dir>    sub folder for stylesheets  (default: css)
      --url-prefix <p>   emit "<p>/js/file.js" instead of a relative path
      --ext <list>       html extensions   (default: .html,.htm,.xhtml)
      --ignore <list>    extra directory names to skip
      --min-size <n>     skip blocks shorter than n characters
      --js-only          only extract <script> blocks
      --css-only         only extract <style> blocks
      --no-dedupe        write one file per block, even if identical
      --backup           keep the original html as <file>.bak
  -n, --dry-run          show what would happen, write nothing
  -v, --verbose          list every extracted block
  -q, --quiet            only print errors
  -V, --version          print version
  -h, --help             this text

Opt out of a single block with the data-no-extract attribute:
  <script data-no-extract>/* stays inline */</script>
`;

/* ------------------------------------------------------------------ *
 * argument parsing
 * ------------------------------------------------------------------ */

function fail(msg) {
  const err = new Error(msg);
  err.userError = true;
  throw err;
}

function splitList(value) {
  return String(value).split(',').map(s => s.trim()).filter(Boolean);
}

function parseArgs(argv) {
  const opts = Object.assign({}, DEFAULTS, {
    extensions: DEFAULTS.extensions.slice(),
    ignore: DEFAULTS.ignore.slice()
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
      case '-h': case '--help':      opts.help = true; break;
      case '-V': case '--version':   opts.version = true; break;
      case '-n': case '--dry-run':   opts.dryRun = true; break;
      case '-v': case '--verbose':   opts.verbose = true; break;
      case '-q': case '--quiet':     opts.quiet = true; break;
      case '--backup':               opts.backup = true; break;
      case '--no-dedupe':            opts.dedupe = false; break;
      case '--js-only':              opts.cssEnabled = false; break;
      case '--css-only':             opts.jsEnabled = false; break;
      case '-o': case '--out':       opts.outDir = value(); break;
      case '--js-dir':               opts.jsDir = value(); break;
      case '--css-dir':              opts.cssDir = value(); break;
      case '--url-prefix':           opts.urlPrefix = value(); break;
      case '--min-size':             opts.minSize = parseInt(value(), 10) || 0; break;
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

// <script …> / <style …> openers, html comments are consumed (and ignored)
// so that commented out blocks are never touched.
const TAG_RE = /<!--[\s\S]*?-->|<(script|style)((?:"[^"]*"|'[^']*'|[^>"'])*)>/gi;
const ATTR_RE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/g;

// script types that really contain javascript
const JS_TYPES = new Set([
  '', 'module',
  'text/javascript', 'application/javascript', 'application/x-javascript',
  'text/ecmascript', 'application/ecmascript'
]);

function parseAttrs(raw) {
  const attrs = [];
  if (!raw) return attrs;
  ATTR_RE.lastIndex = 0;
  let m;
  while ((m = ATTR_RE.exec(raw))) {
    const name = m[1];
    if (name === '/') continue;
    const value = m[2] !== undefined ? m[2]
      : m[3] !== undefined ? m[3]
        : m[4] !== undefined ? m[4]
          : null;                       // boolean attribute
    attrs.push({ name, value });
  }
  return attrs;
}

function getAttr(attrs, name) {
  const lower = name.toLowerCase();
  for (const a of attrs) if (a.name.toLowerCase() === lower) return a.value === null ? '' : a.value;
  return undefined;
}

/** Returns every <script>/<style> element of `html` with its raw content. */
function findBlocks(html) {
  const blocks = [];
  TAG_RE.lastIndex = 0;
  let m;
  while ((m = TAG_RE.exec(html))) {
    if (!m[1]) continue;                                  // it was a comment
    const tag = m[1].toLowerCase();
    const attrsRaw = m[2] || '';
    const contentStart = m.index + m[0].length;

    const closeRe = new RegExp('<\\/' + tag + '\\s*>', 'i');
    const rest = html.slice(contentStart);
    const close = rest.match(closeRe);
    if (!close) continue;                                 // unterminated - leave alone

    const contentEnd = contentStart + close.index;
    const end = contentEnd + close[0].length;

    blocks.push({
      tag,
      attrsRaw,
      attrs: parseAttrs(attrsRaw),
      content: html.slice(contentStart, contentEnd),
      start: m.index,
      end
    });
    TAG_RE.lastIndex = end;                               // never scan inside the block
  }
  return blocks;
}

/** Why (or whether) a block can be moved into its own file. */
function shouldExtract(block, opts) {
  const attrs = block.attrs;
  if (getAttr(attrs, 'data-no-extract') !== undefined) return { ok: false, reason: 'data-no-extract' };

  if (block.tag === 'script') {
    if (!opts.jsEnabled) return { ok: false, reason: 'js disabled' };
    if (getAttr(attrs, 'src') !== undefined) return { ok: false, reason: 'external src' };
    const type = String(getAttr(attrs, 'type') || '').trim().toLowerCase().split(';')[0];
    if (!JS_TYPES.has(type)) return { ok: false, reason: `type="${type}"` };
    return { ok: true };
  }

  if (!opts.cssEnabled) return { ok: false, reason: 'css disabled' };
  if (getAttr(attrs, 'scoped') !== undefined) return { ok: false, reason: 'scoped style' };
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * content clean up
 * ------------------------------------------------------------------ */

function dedent(text) {
  const lines = text.split('\n');
  let indent = null;
  for (const line of lines) {
    if (!line.trim()) continue;
    const m = line.match(/^[ \t]*/)[0];
    if (indent === null || m.length < indent.length) indent = m;
    if (indent === '') break;
  }
  if (!indent) return text;
  return lines.map(l => (l.startsWith(indent) ? l.slice(indent.length) : l.replace(/^[ \t]+/, ''))).join('\n');
}

/** Unwrap legacy `<!-- -->` / CDATA guards, dedent, normalise whitespace. */
function cleanContent(raw) {
  let s = String(raw).replace(/\r\n?/g, '\n');

  const trimmed = s.trim();
  if (trimmed.startsWith('<!--') && trimmed.endsWith('-->')) {
    s = trimmed.slice(4, -3).replace(/(^|\n)[ \t]*(\/\/|\/\*)?[ \t]*$/, '$1');
  }
  s = s.replace(/^\s*(?:\/\/|\/\*)?\s*<!\[CDATA\[/, '')
       .replace(/\]\]>\s*(?:\/\/|\*\/)?\s*$/, '');

  s = dedent(s).replace(/^\s*\n/, '').replace(/\s+$/, '');
  return s ? s + '\n' : '';
}

/* ------------------------------------------------------------------ *
 * tag rebuilding
 * ------------------------------------------------------------------ */

const DROP_JS = new Set(['src', 'type', 'integrity', 'nonce']);
const DROP_CSS = new Set(['type', 'scoped', 'nonce', 'rel', 'href']);

function escapeAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function renderAttr(a) {
  return a.value === null ? ` ${a.name}` : ` ${a.name}="${escapeAttr(a.value)}"`;
}

/** `<script src=…>` / `<link rel=stylesheet href=…>` keeping the useful attributes. */
function buildTag(kind, href, block) {
  const keep = [];
  for (const a of block.attrs) {
    const n = a.name.toLowerCase();
    if (kind === 'js') {
      if (n === 'type') {
        if (String(a.value || '').trim().toLowerCase() === 'module') keep.push(a);
        continue;
      }
      if (DROP_JS.has(n)) continue;
    } else if (DROP_CSS.has(n)) {
      continue;
    }
    keep.push(a);
  }
  const extra = keep.map(renderAttr).join('');
  return kind === 'js'
    ? `<script src="${escapeAttr(href)}"${extra}></script>`
    : `<link rel="stylesheet" href="${escapeAttr(href)}"${extra}>`;
}

/* ------------------------------------------------------------------ *
 * the actual transformation (pure - easy to unit test)
 * ------------------------------------------------------------------ */

/**
 * @param {string} html
 * @param {object} opts
 * @param {function(kind, content, hint, block): (string|null)} assign
 *        must return the href for the new file (or null to keep the block).
 */
function extract(html, opts, assign) {
  const blocks = findBlocks(html);
  const extracted = [];
  const skipped = [];
  let out = '';
  let last = 0;

  for (const block of blocks) {
    const kind = block.tag === 'script' ? 'js' : 'css';
    const verdict = shouldExtract(block, opts);
    if (!verdict.ok) { skipped.push({ kind, reason: verdict.reason }); continue; }

    const content = cleanContent(block.content);
    if (!content.trim()) { skipped.push({ kind, reason: 'empty' }); continue; }
    if (content.length < (opts.minSize || 0)) { skipped.push({ kind, reason: 'too small' }); continue; }

    const hint = getAttr(block.attrs, 'data-name') || getAttr(block.attrs, 'id') || null;
    const href = assign(kind, content, hint, block);
    if (!href) { skipped.push({ kind, reason: 'not assigned' }); continue; }

    out += html.slice(last, block.start) + buildTag(kind, href, block);
    last = block.end;
    extracted.push({ kind, href, size: content.length, content });
  }
  out += html.slice(last);
  return { html: out, extracted, skipped, changed: extracted.length > 0 };
}

/* ------------------------------------------------------------------ *
 * file system helpers
 * ------------------------------------------------------------------ */

function slug(value) {
  return String(value)
    .replace(/\\/g, '/')
    .replace(/\.[^./]+$/, '')
    .replace(/[^A-Za-z0-9._/-]+/g, '-')
    .replace(/\//g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .toLowerCase() || 'index';
}

function sha1(text) {
  return crypto.createHash('sha1').update(text).digest('hex');
}

function isHtml(file, opts) {
  return opts.extensions.includes(path.extname(file).toLowerCase());
}

function walk(dir, opts, acc) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    console.error(`! cannot read ${dir}: ${e.message}`);
    return acc;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (opts.ignore.includes(entry.name)) continue;
      if (path.resolve(full) === opts.outRoot) continue;      // never rescan our output
      walk(full, opts, acc);
    } else if (entry.isFile() && isHtml(entry.name, opts)) {
      acc.push(full);
    }
  }
  return acc;
}

function collectFiles(inputs, opts) {
  const files = [];
  for (const input of inputs) {
    let stat;
    try {
      stat = fs.statSync(input);
    } catch (e) {
      console.error(`! ${input}: ${e.message}`);
      continue;
    }
    if (stat.isDirectory()) walk(input, opts, files);
    else files.push(input);
  }
  return [...new Set(files.map(f => path.resolve(f)))].sort();
}

function toHref(htmlFile, target, opts) {
  let rel;
  if (opts.urlPrefix) {
    const inside = path.relative(opts.outRoot, target).split(path.sep).join('/');
    rel = opts.urlPrefix.replace(/\/+$/, '') + '/' + inside;
  } else {
    rel = path.relative(path.dirname(htmlFile), target).split(path.sep).join('/');
  }
  return encodeURI(rel);
}

function uniquePath(target, ctx) {
  if (!ctx.taken.has(target)) { ctx.taken.add(target); return target; }
  const dir = path.dirname(target);
  const ext = path.extname(target);
  const base = path.basename(target, ext);
  for (let n = 2; ; n++) {
    const candidate = path.join(dir, `${base}-${n}${ext}`);
    if (!ctx.taken.has(candidate)) { ctx.taken.add(candidate); return candidate; }
  }
}

/* ------------------------------------------------------------------ *
 * per file processing
 * ------------------------------------------------------------------ */

function processFile(file, opts, ctx) {
  const original = fs.readFileSync(file, 'utf8');
  const rel = path.relative(opts.root, file) || path.basename(file);
  const base = slug(rel);
  const counters = { js: 0, css: 0 };
  const pending = [];

  const result = extract(original, opts, (kind, content, hint) => {
    const key = kind + ':' + sha1(content);
    if (opts.dedupe && ctx.byHash.has(key)) return toHref(file, ctx.byHash.get(key), opts);

    const n = ++counters[kind];
    const ext = kind === 'js' ? '.js' : '.css';
    const sub = kind === 'js' ? opts.jsDir : opts.cssDir;
    const name = hint ? `${base}-${slug(hint)}` : (n > 1 ? `${base}-${n}` : base);

    const target = uniquePath(path.join(opts.outRoot, sub, name + ext), ctx);
    ctx.byHash.set(key, target);
    pending.push({ target, content });
    return toHref(file, target, opts);
  });

  if (!result.changed) {
    if (opts.verbose) console.log(`  = ${rel} (nothing to extract)`);
    return;
  }

  ctx.stats.changed++;
  for (const item of result.extracted) {
    ctx.stats[item.kind]++;
    ctx.stats.bytes += Buffer.byteLength(item.content);
  }

  if (!opts.quiet) console.log(`${opts.dryRun ? '~' : '*'} ${rel}`);
  if (opts.verbose) {
    for (const item of result.extracted) console.log(`    -> ${item.href} (${item.size} bytes)`);
    for (const item of result.skipped) console.log(`    .. kept inline ${item.kind}: ${item.reason}`);
  }

  if (opts.dryRun) return;

  for (const item of pending) {
    fs.mkdirSync(path.dirname(item.target), { recursive: true });
    fs.writeFileSync(item.target, item.content, 'utf8');
  }
  if (opts.backup) fs.writeFileSync(file + '.bak', original, 'utf8');
  fs.writeFileSync(file, result.html, 'utf8');
}

/* ------------------------------------------------------------------ *
 * entry point
 * ------------------------------------------------------------------ */

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

  const first = opts.inputs[0];
  const firstIsDir = fs.existsSync(first) && fs.statSync(first).isDirectory();
  opts.root = path.resolve(opts.inputs.length === 1 && firstIsDir ? first : '.');
  opts.outRoot = path.resolve(opts.root, opts.outDir);

  const files = collectFiles(opts.inputs, opts);
  if (!files.length) {
    console.error('No HTML files found.');
    return 1;
  }

  const ctx = {
    byHash: new Map(),
    taken: new Set(),
    stats: { files: files.length, changed: 0, js: 0, css: 0, bytes: 0, errors: 0 }
  };

  for (const file of files) {
    try {
      processFile(file, opts, ctx);
    } catch (e) {
      ctx.stats.errors++;
      console.error(`! ${path.relative(opts.root, file)}: ${e.message}`);
    }
  }

  if (!opts.quiet) {
    const s = ctx.stats;
    console.log(
      `\n${opts.dryRun ? '[dry-run] ' : ''}${s.files} html file(s) scanned, ${s.changed} rewritten, ` +
      `${s.js} script(s) + ${s.css} stylesheet(s) extracted (${(s.bytes / 1024).toFixed(1)} KB)` +
      (s.errors ? `, ${s.errors} error(s)` : '')
    );
  }
  return ctx.stats.errors ? 1 : 0;
}

module.exports = {
  VERSION, DEFAULTS, HELP,
  main, parseArgs, findBlocks, parseAttrs, getAttr,
  shouldExtract, cleanContent, dedent, buildTag, extract,
  slug, collectFiles, processFile
};

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}