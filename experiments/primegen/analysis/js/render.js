/**
 * Markdown + MathJax rendering.
 *
 * Markdown escaping would eat `\(`, `\[` and friends, so every math span is
 * lifted out before `marked` runs and spliced back in afterwards.
 */

const MATH_PATTERNS = [
  /\$\$[\s\S]*?\$\$/g, // $$ display $$
  /\\\[[\s\S]*?\\\]/g, // \[ display \]
  /\\\([\s\S]*?\\\)/g, // \( inline \)
  /\$(?![\s$])[^$\n]*?\$/g, // $ inline $
];

const PLACEHOLDER = (i) => `@@MATH${i}@@`;

export function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

function parser() {
  const m = window.marked;
  if (!m) return null;
  if (typeof m.parse === 'function') return m.parse.bind(m);
  if (typeof m === 'function') return m;
  return null;
}

function inlineParser() {
  const m = window.marked;
  return m && typeof m.parseInline === 'function' ? m.parseInline.bind(m) : null;
}

/** Render markdown to an HTML string with math spans preserved verbatim. */
export function renderMarkdown(text, { inline = false } = {}) {
  if (text == null || text === '') return '';
  const math = [];
  let src = String(text);
  for (const re of MATH_PATTERNS) {
    src = src.replace(re, (m) => {
      math.push(m);
      return PLACEHOLDER(math.length - 1);
    });
  }

  let html;
  const parse = (inline && inlineParser()) || parser();
  try {
    html = parse ? parse(src) : `<p>${escapeHtml(src)}</p>`;
  } catch (err) {
    console.warn('marked failed', err);
    html = `<p>${escapeHtml(src)}</p>`;
  }

  return html.replace(/@@MATH(\d+)@@/g, (_, i) => escapeHtml(math[Number(i)]));
}

/** Build a detached element whose innerHTML is rendered markdown. */
export function mdEl(tag, className, text, opts) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.innerHTML = renderMarkdown(text, opts);
  return node;
}

/** Wrap a LaTeX string as a display equation MathJax will pick up. */
export function displayMath(latex) {
  const node = document.createElement('div');
  node.className = 'formal';
  node.textContent = `\\[ ${latex} \\]`;
  return node;
}

let queue = Promise.resolve();

/** Serialised MathJax typesetting; safe to call after every render. */
export function typeset(target) {
  const mj = window.MathJax;
  if (!mj?.typesetPromise) return queue;
  queue = queue
    .then(() => {
      if (mj.typesetClear && target) mj.typesetClear([target]);
      return mj.typesetPromise(target ? [target] : undefined);
    })
    .catch((err) => console.warn('MathJax typeset failed', err));
  return queue;
}

/** Resolve once `marked` is on the page (or the timeout expires). */
export function waitForMarked(timeout = 3000) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    (function poll() {
      if (window.marked || Date.now() - t0 > timeout) return resolve(!!window.marked);
      setTimeout(poll, 40);
    })();
  });
}
