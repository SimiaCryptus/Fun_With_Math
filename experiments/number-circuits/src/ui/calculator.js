import { parse, ParseError } from '../expr/parser.js';
import { evaluate, cost } from '../expr/ast.js';
import { canonicalString } from '../expr/canonical.js';
import { print } from '../expr/printer.js';
import { getTable, minimalExpr } from '../engine/recurrence.js';
import { Aggregator } from '../engine/aggregator.js';
import { treesFor } from '../engine/reconstruct.js';
import { renderTree } from './tree-view.js';

const TABLE_CAP = 20000;
const REVERSE_ENUM_CAP = 5000;

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const kv = pairs => `<dl class="kv">${pairs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;

export function initCalculator(root, getOps = () => ({})) {
  const input = root.querySelector('#c-input');
  const mode = root.querySelector('#c-mode');
  const out = root.querySelector('#c-output');
  const update = () => {
    out.innerHTML = '';
    const src = input.value;
    if (!src.trim()) return;
     const ops = getOps();
     if (mode.value === 'expr') showExpr(src, out, ops);
     else showReverse(src, out, ops);
  };
  input.addEventListener('input', update);
  mode.addEventListener('change', update);
  update();
   return update;
}

function showExpr(src, out, ops) {
  let ast;
  try {
     ast = parse(src, ops);
  } catch (err) {
    if (!(err instanceof ParseError)) throw err;
    const p = err.pos;
    const hl = esc(src.slice(0, p)) + `<mark>${esc(src[p] ?? ' ')}</mark>` + esc(src.slice(p + 1));
    out.innerHTML = `<div class="error">${esc(err.message)} at position ${p}</div><pre class="src">${hl}</pre>`;
    return;
  }
  const v = evaluate(ast), c = cost(ast);
  let minimal;
  if (Number.isSafeInteger(v) && v <= TABLE_CAP) {
     const t = getTable(v, ops);
    const C = t.C[v];
    minimal = c === C
      ? 'yes'
      : `no — C(${v}) = ${C}, e.g. ${esc(print(minimalExpr(t, v)))}`;
  } else {
    minimal = `unknown (value > ${TABLE_CAP})`;
  }
  out.innerHTML = kv([
    ['Value', esc(v)],
    ['Cost', esc(c)],
    ['Canonical', esc(canonicalString(ast))],
    ['Fully parenthesized', esc(print(ast, { full: true }))],
    ['Minimal', minimal],
  ]);
  out.appendChild(renderTree(ast));
}

function showReverse(src, out, ops) {
  const n = Number(src.trim());
  if (!Number.isInteger(n) || n < 1) {
    out.innerHTML = `<div class="error">Enter a positive integer</div>`;
    return;
  }
  if (n > TABLE_CAP) {
    out.innerHTML = `<div class="error">n must be ≤ ${TABLE_CAP}</div>`;
    return;
  }
   const t = getTable(n, ops);
  const C = t.C[n];
  const example = minimalExpr(t, n);
  let html = kv([['n', esc(n)], ['C(n)', esc(C)], ['Example', esc(print(example))]]);
  if (n <= REVERSE_ENUM_CAP) {
     const agg = new Aggregator({ N: n, K: C, ops }).run();
    const reps = treesFor(agg.store, n, C, 100);
    html += `<h3>Minimal representations (${reps.length}${reps.length >= 100 ? '+' : ''})</h3>`;
    html += `<ul class="reps">${reps.map(r => `<li>${esc(print(r))}</li>`).join('')}</ul>`;
  }
  out.innerHTML = html;
  out.appendChild(renderTree(example));
}