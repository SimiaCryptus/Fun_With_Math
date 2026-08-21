/* =====================================================================
Prime Sieve Lab — hub controller
1. asset cards + inline iframe viewer
2. markdown readout (marked) with MathJax-safe math protection
3. hero canvas: miniature orthogonal sieve stack
===================================================================== */
const $ = (id) => document.getElementById(id);

/* ------------------------------------------------------------------ */
/* 1. assets                                                          */
/* ------------------------------------------------------------------ */
const APPS = [
  {
    id: 'spectrum',
    file: 'spectrum.html',
    glyph: '∿',
    cls: '',
    title: 'Spectrum explorer',
    blurb:
      'The full interactive essay: position-space sieve stack, disjoint prime harmonic combs, ' +
      'the interference field collapsing into composites, density/entropy flows, CRT lattice and survivor gaps.',
    bullets: [
      'orthogonal components, prime by prime',
      'frequency space: amplitude 1/p at m/p',
      'Mertens ρₖ vs. additive Hjoint',
    ],
  },
  {
    id: 'generator',
    file: 'generator.html',
    glyph: '∑',
    cls: 'b',
    title: 'Generator demo',
    blurb:
      'A live prime generator built on the wheel/orthogonal-stream representation, with ' +
      'copy-pasteable reference code for the sieve.',
    bullets: ['streaming output', 'reference implementation to copy', 'wheel-compact state'],
  },
  {
    id: 'algorithm',
    file: 'algorithm.html',
    glyph: '⚙',
    cls: 'y',
    title: 'Algorithm test bench',
    blurb:
      'Executable reference for the specification: wheel tables, the ownership theorem, ' +
      'Algorithm A (exact one-touch) vs. Algorithm B (wheeled streaming), bucketed segments, ' +
      'a validation suite and an S(N) log–log fit.',
    bullets: [
      'every numbered claim is checked',
      'A vs B vs Eratosthenes timings',
      'no network access',
    ],
  },
];

function buildCards() {
  $('cards').innerHTML = APPS.map(
    (a) => `
 <article class="card ${a.cls}">
   <div class="glyph">${a.glyph}</div>
   <h3>${a.title}</h3>
   <p>${a.blurb}</p>
   <ul>${a.bullets.map((b) => `<li>${b}</li>`).join('')}</ul>
   <div class="actions">
     <a class="btn primary" href="${a.file}">open ↗</a>
     <button class="ghost" data-embed="${a.id}">preview inline</button>
   </div>
 </article>`
  ).join('');
  $('cards')
    .querySelectorAll('[data-embed]')
    .forEach((b) => {
      b.onclick = () => embed(b.dataset.embed);
    });
}

function embed(id) {
  const a = APPS.find((x) => x.id === id);
  if (!a) return;
  $('vName').textContent = a.title;
  $('vPath').textContent = '— ' + a.file;
  $('vOpen').href = a.file;
  $('frame').src = a.file;
  $('viewer').classList.remove('hidden');
  $('viewer').scrollIntoView({ behavior: 'smooth', block: 'start' });
  setHash({ app: id });
}
function closeEmbed() {
  $('viewer').classList.add('hidden');
  $('frame').src = 'about:blank';
  setHash({ app: null });
}
$('vClose').onclick = closeEmbed;

/* ------------------------------------------------------------------ */
/* 2. markdown readout                                                */
/* ------------------------------------------------------------------ */
const DOCS = [
  { id: 'readme', file: 'README.md', label: 'README' },
  { id: 'paper', file: 'paper.md', label: 'paper' },
  { id: 'theory', file: 'theory.md', label: 'theory' },
  { id: 'fractal', file: 'fractal.md', label: 'fractal' },
  { id: 'algorithm', file: 'algorithm.md', label: 'algorithm' },
  { id: 'observation', file: 'observation.md', label: 'observation' },
  { id: 'generator', file: 'generator.md', label: 'generator' },
  { id: 'twin_prime', file: 'twin_prime.md', label: 'twin_prime' },
  { id: 'idea', file: 'idea.md', label: 'idea' },
];

const MARKED_PATHS = ['/lib/marked.min.js', 'https://cdn.jsdelivr.net/npm/marked/marked.min.js'];

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.onload = () => res(src);
    s.onerror = () => rej(new Error('failed ' + src));
    document.head.appendChild(s);
  });
}

let markedReady = null;
function ensureMarked() {
  if (window.marked) return Promise.resolve(true);
  if (markedReady) return markedReady;
  markedReady = (async () => {
    for (const p of MARKED_PATHS) {
      try {
        await loadScript(p);
        if (window.marked) return true;
      } catch (e) {
        /* next */
      }
    }
    return false;
  })();
  return markedReady;
}

/* --- protect TeX from the markdown parser -------------------------- */
const MATH_RE = new RegExp(
  [
    '(```[\\s\\S]*?```|~~~[\\s\\S]*?~~~|`[^`\\n]*`)', // code — leave alone
    '(\\$\\$[\\s\\S]*?\\$\\$)', // $$ ... $$
    '(\\\\\\[[\\s\\S]*?\\\\\\])', // \[ ... \]
    '(\\\\\\([\\s\\S]*?\\\\\\))', // \( ... \)
    '(\\$(?!\\s)(?:\\\\.|[^\\$\\\\\\n])+?\\$)', // $ ... $
  ].join('|'),
  'g'
);

const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function protectMath(src) {
  const store = [];
  const text = src.replace(MATH_RE, (m, code) => {
    if (code) return code;
    store.push(m);
    return '@@MJX' + (store.length - 1) + '@@';
  });
  return { text, store };
}
function restoreMath(html, store) {
  return html.replace(/@@MJX(\d+)@@/g, (m, i) => escHtml(store[+i] ?? m));
}

const slug = (s) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

function buildToc(root) {
  const list = $('tocList');
  list.innerHTML = '';
  const used = new Set();
  root.querySelectorAll('h1,h2,h3').forEach((h) => {
    let id = slug(h.textContent) || 'section';
    let n = 2;
    while (used.has(id)) id = slug(h.textContent) + '-' + n++;
    used.add(id);
    h.id = id;
    const a = document.createElement('a');
    a.className = h.tagName === 'H3' ? 'h3' : '';
    a.href = '#' + id;
    a.textContent = h.textContent;
    list.appendChild(a);
    const anc = document.createElement('a');
    anc.className = 'anchor';
    anc.href = '#' + id;
    anc.textContent = '#';
    h.appendChild(anc);
  });
  $('toc').classList.toggle('hidden', list.children.length === 0);
}

let currentDoc = null,
  currentRaw = '';

function buildDocTabs() {
  const bar = $('docBar');
  DOCS.slice()
    .reverse()
    .forEach((d) => {
      const b = document.createElement('button');
      b.className = 'ghost';
      b.textContent = d.label;
      b.dataset.doc = d.id;
      b.setAttribute('aria-selected', 'false');
      b.onclick = () => showDoc(d.id);
      bar.insertBefore(b, bar.firstChild);
    });
}

function markTab(id) {
  $('docBar')
    .querySelectorAll('[data-doc]')
    .forEach((b) => {
      b.setAttribute('aria-selected', String(b.dataset.doc === id));
    });
}

function statusMsg(html) {
  $('readout').innerHTML = '<div class="status">' + html + '</div>';
  $('tocList').innerHTML = '';
}

async function showDoc(id, opts = {}) {
  const doc = DOCS.find((d) => d.id === id) || DOCS[0];
  currentDoc = doc;
  markTab(doc.id);
  $('btnSource').href = doc.file;
  setHash({ doc: doc.id });
  statusMsg('loading <b>' + doc.file + '</b> …');

  let src;
  try {
    const r = await fetch(doc.file, { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status + ' ' + r.statusText);
    src = await r.text();
  } catch (e) {
    statusMsg(
      'could not load <b>' +
        doc.file +
        '</b> — ' +
        escHtml(String(e.message)) +
        '<br><br>' +
        (location.protocol === 'file:'
          ? 'This page is open over <b>file://</b>. Serve the directory over HTTP:<br>' +
            '<code>python3 -m http.server</code>'
          : 'The file may not exist yet in this directory.')
    );
    return;
  }

  currentRaw = src;
  $('rawView').textContent = src;

  const ok = await ensureMarked();
  if (!ok) {
    statusMsg(
      '<b>marked.min.js</b> not found (tried /lib, ../lib, ../../lib, ./lib, CDN).<br>' +
        'Showing raw markdown instead.'
    );
    setRawMode(true, true);
    return;
  }

  const { text, store } = protectMath(src);
  let html;
  try {
    html = window.marked.parse
      ? window.marked.parse(text, {
          gfm: true,
          breaks: false,
          mangle: false,
          headerIds: false,
        })
      : window.marked(text);
  } catch (e) {
    statusMsg('markdown parse failed: ' + escHtml(e.message));
    return;
  }
  $('readout').innerHTML = restoreMath(html, store);
  buildToc($('readout'));
  setRawMode(false);

  if (window.MathJax && window.MathJax.typesetPromise) {
    try {
      await window.MathJax.typesetPromise([$('readout')]);
    } catch (e) {
      /* non-fatal */
    }
  }
  if (!opts.silent) $('docs').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

let rawMode = false;
function setRawMode(on, force) {
  rawMode = !!on;
  $('rawView').classList.toggle('hidden', !rawMode);
  $('readout').classList.toggle('hidden', rawMode && !force ? true : rawMode);
  $('btnRaw').setAttribute('aria-selected', String(rawMode));
  $('btnRaw').textContent = rawMode ? 'rendered' : 'raw';
}
$('btnRaw').onclick = () => {
  if (!currentRaw) return;
  setRawMode(!rawMode);
};
/* ------------------------------------------------------------------ */
/* 2b. algorithm sources — monaco viewer (graceful fallback)          */
/* ------------------------------------------------------------------ */
const SOURCES = [
  {
    id: 'core',
    file: 'primegen-core.js',
    label: 'core',
    lang: 'javascript',
    note: 'primegen-core.js — MinHeap, wheel tables (buildWheel), exactness guards, shared formatting.',
  },
  {
    id: 'algo-a',
    file: 'algorithm-a.js',
    label: 'A',
    lang: 'javascript',
    note: 'algorithm-a.js — Algorithm A, exact one-touch orthogonal generator (algorithm.md §3). Σ_b = { b·q : q prime, q ≥ P(b) }.',
  },
  {
    id: 'algo-b',
    file: 'algorithm-b.js',
    label: 'B',
    lang: 'javascript',
    note: 'algorithm-b.js — Algorithm B, wheeled streaming generator (§4). O(1) state per prime, π(√n) records, O(1) restart.',
  },
  {
    id: 'algo-c',
    file: 'algorithm-c.js',
    label: 'C',
    lang: 'javascript',
    note: 'algorithm-c.js — Algorithm C, min-factor exponent spine (§4C · min_factor.md). Emits (spf, v_p, cofactor).',
  },
  {
    id: 'bench',
    file: 'algorithm.html',
    label: 'bench',
    lang: 'html',
    note: 'algorithm.html — the test bench UI that drives A / B / C and the validation suite.',
  },
];
const MONACO_VS = '/lib/monaco/vs';
const srcCache = new Map();
const srcModels = new Map();
let monacoPromise = null,
  editor = null,
  currentSrc = null,
  srcWrap = false,
  srcTouched = false;
function flushBootErrors() {
  const host = $('bootErr');
  const errs = window.__RR_bootErrors || [];
  if (!host) return;
  if (!errs.length) {
    host.classList.add('hidden');
    return;
  }
  host.classList.remove('hidden');
  host.innerHTML = errs
    .map(([m, d]) => '<b>' + escHtml(m) + '</b>' + (d ? ' — ' + escHtml(d) : ''))
    .join('<br>');
}
window.__RR_flushBootErrors = flushBootErrors;
function ensureMonaco() {
  if (window.monaco && window.monaco.editor) return Promise.resolve(true);
  if (monacoPromise) return monacoPromise;
  monacoPromise = new Promise((res) => {
    const req = window.require;
    if (!req || typeof req.config !== 'function') {
      window.__RR_showBootError(
        'monaco AMD loader unavailable',
        'showing a plain read-only listing instead'
      );
      return res(false);
    }
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      res(ok);
    };
    try {
      req.config({ paths: { vs: MONACO_VS } });
      req(
        ['vs/editor/editor.main'],
        () => finish(!!(window.monaco && window.monaco.editor)),
        () => {
          window.__RR_showBootError('monaco editor.main failed to load', MONACO_VS);
          finish(false);
        }
      );
    } catch (e) {
      window.__RR_showBootError('monaco init threw', String(e && e.message));
      finish(false);
    }
    setTimeout(() => {
      if (!done) window.__RR_showBootError('monaco timed out', 'after 12 s');
      finish(!!(window.monaco && window.monaco.editor));
    }, 12000);
  });
  return monacoPromise;
}
function createEditor() {
  monaco.editor.defineTheme('primegen-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '7ee0c0', fontStyle: 'italic' },
      { token: 'keyword', foreground: '8ab4ff' },
      { token: 'number', foreground: 'ffcc66' },
      { token: 'string', foreground: '7ee787' },
    ],
    colors: {
      'editor.background': '#0b0f15',
      'editor.foreground': '#d8e0ea',
      'editor.lineHighlightBackground': '#131a22',
      'editor.selectionBackground': '#20304a',
      'editorLineNumber.foreground': '#3a4655',
      'editorLineNumber.activeForeground': '#8b97a8',
      'editorGutter.background': '#0b0f15',
      'editorWidget.background': '#161b22',
    },
  });
  try {
    /* it is a viewer: no squiggles for bare-module imports */
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: true,
    });
  } catch (e) {
    /* language service absent in a slim build — fine */
  }
  return monaco.editor.create($('monacoHost'), {
    value: '',
    language: 'javascript',
    theme: 'primegen-dark',
    readOnly: true,
    domReadOnly: true,
    automaticLayout: true,
    fontSize: 12.5,
    fontFamily: "ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, Consolas, monospace",
    lineHeight: 19,
    minimap: { enabled: true, maxColumn: 80 },
    scrollBeyondLastLine: false,
    renderLineHighlight: 'none',
    wordWrap: srcWrap ? 'on' : 'off',
    smoothScrolling: true,
    padding: { top: 10, bottom: 10 },
  });
}
function buildSrcTabs() {
  const bar = $('srcBar');
  SOURCES.slice()
    .reverse()
    .forEach((s) => {
      const b = document.createElement('button');
      b.className = 'ghost';
      b.textContent = s.label;
      b.title = s.file;
      b.dataset.src = s.id;
      b.setAttribute('aria-selected', 'false');
      b.onclick = () => showSrc(s.id);
      bar.insertBefore(b, bar.firstChild);
    });
}
function markSrcTab(id) {
  $('srcBar')
    .querySelectorAll('[data-src]')
    .forEach((b) => b.setAttribute('aria-selected', String(b.dataset.src === id)));
}
function showSrcFallback(text) {
  $('monacoHost').classList.add('hidden');
  $('srcFallback').classList.remove('hidden');
  $('srcFallback').classList.toggle('wrap', srcWrap);
  $('srcFallback').textContent = text;
}
async function showSrc(id, opts = {}) {
  const s = SOURCES.find((x) => x.id === id) || SOURCES[0];
  srcTouched = true;
  currentSrc = s;
  markSrcTab(s.id);
  $('srcOpen').href = s.file;
  $('srcNote').textContent = s.note;
  setHash({ src: s.id });
  let text = srcCache.get(s.file);
  if (text === undefined) {
    $('srcStatus').textContent = 'loading ' + s.file + ' …';
    try {
      const r = await fetch(s.file, { cache: 'no-cache' });
      if (!r.ok) throw new Error(r.status + ' ' + r.statusText);
      text = await r.text();
      srcCache.set(s.file, text);
    } catch (e) {
      $('srcStatus').textContent = 'load failed';
      showSrcFallback(
        '/* could not load ' +
          s.file +
          ' — ' +
          String(e.message) +
          '\n   serve the directory over HTTP: python3 -m http.server */'
      );
      return;
    }
  }
  $('srcStatus').textContent =
    s.file +
    ' · ' +
    text.split('\n').length +
    ' lines · ' +
    (text.length / 1024).toFixed(1) +
    ' kB';
  const ok = await ensureMonaco();
  if (!ok) {
    showSrcFallback(text);
    return;
  }
  $('srcFallback').classList.add('hidden');
  $('monacoHost').classList.remove('hidden');
  if (!editor) editor = createEditor();
  let model = srcModels.get(s.file);
  if (!model) {
    model = monaco.editor.createModel(text, s.lang, monaco.Uri.parse('primegen://' + s.file));
    srcModels.set(s.file, model);
  }
  editor.setModel(model);
  editor.setScrollTop(0);
  editor.layout();
  if (!opts.silent) $('source').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
$('btnWrap').onclick = () => {
  srcWrap = !srcWrap;
  $('btnWrap').setAttribute('aria-selected', String(srcWrap));
  if (editor) editor.updateOptions({ wordWrap: srcWrap ? 'on' : 'off' });
  $('srcFallback').classList.toggle('wrap', srcWrap);
};
$('btnCopy').onclick = async () => {
  const t = currentSrc ? srcCache.get(currentSrc.file) : null;
  if (!t) return;
  try {
    await navigator.clipboard.writeText(t);
    $('btnCopy').textContent = 'copied ✓';
  } catch (e) {
    $('btnCopy').textContent = 'copy blocked';
  }
  setTimeout(() => ($('btnCopy').textContent = 'copy'), 1200);
};
/* monaco is heavy: only fetch it when the panel is actually reached */
function observeSource() {
  const el = $('source');
  if (!('IntersectionObserver' in window)) {
    showSrc('algo-a', { silent: true });
    return;
  }
  const io = new IntersectionObserver(
    (ents) => {
      if (!ents.some((e) => e.isIntersecting)) return;
      io.disconnect();
      if (!srcTouched) showSrc('algo-a', { silent: true });
    },
    { rootMargin: '300px' }
  );
  io.observe(el);
}

/* ------------------------------------------------------------------ */
/* 3. hash routing                                                    */
/* ------------------------------------------------------------------ */
function parseHash() {
  const out = {};
  location.hash
    .replace(/^#/, '')
    .split('&')
    .forEach((kv) => {
      const [k, v] = kv.split('=');
      if (k && v) out[k] = decodeURIComponent(v);
    });
  return out;
}
function setHash(patch) {
  const cur = parseHash();
  Object.entries(patch).forEach(([k, v]) => {
    if (v === null) delete cur[k];
    else cur[k] = v;
  });
  const s = Object.entries(cur)
    .map(([k, v]) => k + '=' + encodeURIComponent(v))
    .join('&');
  const url = location.pathname + (s ? '#' + s : '');
  history.replaceState(null, '', url);
}

/* ------------------------------------------------------------------ */
/* 4. hero canvas — miniature orthogonal stack                        */
/* ------------------------------------------------------------------ */
const HERO_PRIMES = [2, 3, 5, 7, 11, 13];
function hue(i) {
  return (168 + i * 34) % 360;
}

function drawHero() {
  const c = $('hero');
  if (!c) return;
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth || 400,
    h = c.clientHeight || 170;
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);

  const N = Math.max(48, Math.min(160, Math.floor(w / 5)));
  const cell = w / N;
  const rows = HERO_PRIMES.length + 1;
  const pad = 6;
  const rowH = (h - pad * 2) / rows;
  const dead = new Uint8Array(N + 2);

  HERO_PRIMES.forEach((p, i) => {
    const y = pad + i * rowH;
    for (let n = 2; n <= N; n++) {
      if (n % p) continue;
      const x = (n - 1) * cell;
      const own = !dead[n]; // first kill ⇒ belongs to C_k
      g.fillStyle = own ? `hsla(${hue(i)},62%,62%,.95)` : 'rgba(125,145,175,.16)';
      g.fillRect(x, y + 1, Math.max(1, cell - 0.8), rowH - 3);
    }
    for (let n = 2; n <= N; n++) if (n % p === 0) dead[n] = 1;
    g.fillStyle = 'rgba(139,151,168,.75)';
    g.font = '9px ui-monospace, monospace';
    g.fillText(String(p), 2, y + rowH - 4);
  });

  // survivors of the stack
  const y = pad + HERO_PRIMES.length * rowH;
  g.fillStyle = 'rgba(255,255,255,.06)';
  g.fillRect(0, y, w, rowH);
  for (let n = 2; n <= N; n++) {
    if (dead[n]) continue;
    g.fillStyle = 'rgba(255,255,255,.92)';
    g.fillRect((n - 1) * cell, y + 1, Math.max(1, cell - 0.8), rowH - 3);
  }
  g.strokeStyle = 'rgba(35,43,54,.9)';
  g.beginPath();
  g.moveTo(0, y + 0.5);
  g.lineTo(w, y + 0.5);
  g.stroke();
}

let heroTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(heroTimer);
  heroTimer = setTimeout(drawHero, 120);
});

/* ------------------------------------------------------------------ */
/* 5. keyboard + boot                                                 */
/* ------------------------------------------------------------------ */
window.addEventListener('keydown', (e) => {
  if (e.target.matches('input,textarea,select')) return;
  if (e.key === 'Escape') {
    closeEmbed();
    return;
  }
  const k = e.key.toLowerCase();
  if (k === 'a' || k === 'b' || k === 'c') {
    showSrc('algo-' + k);
    return;
  }
  const i = '123'.indexOf(e.key);
  if (i >= 0 && APPS[i]) embed(APPS[i].id);
});

buildCards();
buildDocTabs();
buildSrcTabs();
flushBootErrors();
drawHero();

(function boot() {
  const h = parseHash();
  if (h.app) embed(h.app);
  if (h.src) showSrc(h.src);
  else observeSource();
  showDoc(h.doc || 'readme', { silent: !h.doc });
})();
