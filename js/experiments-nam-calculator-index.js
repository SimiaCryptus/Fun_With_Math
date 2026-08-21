import createNam from './nam_wasm.js';
import loadNam from './nam.js';

const $ = (id) => document.getElementById(id);
const out = $('out');
const varsBox = $('vars');
const precPill = $('precPill');
const dispValue = $('dispValue');
const dispSub = $('dispSub');
const targetLabel = $('targetLabel');

// ---- module + register state ------------------------------------
let nam = null;
const regs = Object.create(null); // name -> wrapped Number
let targetReg = '_'; // register the keypad acts on

function setLast(num) {
  regs['_'] = num;
  updateDisplay();
  return num;
}

function setTarget(name) {
  targetReg = name;
  targetLabel.textContent = name;
  $('tReg').value = name;
  updateDisplay();
  refreshVars();
}

function updateDisplay() {
  const t = regs[targetReg] || regs['_'];
  if (!t) {
    dispValue.textContent = '—';
    dispSub.textContent = 'build a number to begin';
    return;
  }
  dispValue.textContent = t.toString();
  try {
    dispSub.textContent = `base ${t.base()} · fork cost ${t.fork_cost()}`;
  } catch (_) {
    dispSub.textContent = '';
  }
}

function lookup(name) {
  const n = regs[name];
  if (!n) throw new Error(`unknown register "${name}" (see Registers)`);
  return n;
}

function triStr(v) {
  return v === null ? 'pending (null)' : String(v);
}

// ---- logging ----------------------------------------------------
function log(html, cls) {
  const div = document.createElement('div');
  div.className = 'log-line' + (cls ? ' ' + cls : '');
  div.innerHTML = html;
  out.appendChild(div);
  out.scrollTop = out.scrollHeight;
}

function logCmd(text) {
  log(`<span class="log-cmd">nam&gt; ${escapeHtml(text)}</span>`);
}

function logOk(text) {
  log(escapeHtml(text));
}

function logErr(text) {
  log(`error: ${escapeHtml(text)}`, 'log-err');
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function refreshPrecision() {
  precPill.textContent = `${nam.current_precision()} digits`;
}

function refreshVars() {
  const names = Object.keys(regs).sort();
  if (names.length === 0) {
    varsBox.textContent = '(no registers)';
    return;
  }
  varsBox.innerHTML = '';
  for (const k of names) {
    const item = document.createElement('div');
    item.className = 'reg-item';
    if (k === targetReg) item.classList.add('target-active');
    item.title = `click to target "${k}"`;
    item.innerHTML =
      `<span class="reg">${escapeHtml(k)}</span>` +
      `<span class="reg-val">${escapeHtml(regs[k].toString())}</span>` +
      `<span class="reg-drop" title="drop">✕</span>`;
    item.addEventListener('click', (ev) => {
      if (ev.target.classList.contains('reg-drop')) {
        if (k !== '_') runCommand(`drop ${k}`);
        return;
      }
      setTarget(k);
    });
    varsBox.appendChild(item);
  }
}

// ---- constructor dispatch (shared by GUI + console) -------------
const CONSTRUCTORS = new Set([
  'rational',
  'sqrt',
  'padic',
  'e',
  'ln2',
  'one_over_e',
  'pi_quarter',
  'catalan',
]);

function isInt(tok) {
  return /^-?\d+$/.test(tok);
}

function asInt(tok, what) {
  if (!isInt(tok)) throw new Error(`expected integer for ${what}, got "${tok}"`);
  return parseInt(tok, 10);
}

function construct(cmd, args) {
  switch (cmd) {
    case 'rational': {
      const p = asInt(args[0], 'P');
      const q = asInt(args[1], 'Q');
      const base = args[2] !== undefined ? asInt(args[2], 'BASE') : 10;
      return nam.rational(p, q, base);
    }
    case 'sqrt': {
      const d = asInt(args[0], 'D');
      const base = args[1] !== undefined ? asInt(args[1], 'BASE') : 10;
      return nam.sqrt(d, base);
    }
    case 'padic': {
      const a = asInt(args[0], 'A');
      const b = asInt(args[1], 'B');
      const p = asInt(args[2], 'P');
      return nam.padic(a, b, p);
    }
    case 'e':
    case 'ln2':
    case 'one_over_e':
    case 'pi_quarter':
    case 'catalan': {
      const base = args[0] !== undefined ? asInt(args[0], 'BASE') : 10;
      return nam[cmd](base);
    }
    default:
      return null;
  }
}

function extractStore(tokens) {
  const rest = [];
  let store = null;
  for (const t of tokens) {
    if (t.startsWith('>')) {
      store = t.slice(1);
      if (!store) throw new Error('empty store target after ">"');
    } else {
      rest.push(t);
    }
  }
  return { store, rest };
}

// ---- shared console-grammar evaluator ---------------------------
// Returns a human-readable string (or '' for silence).
function evaluate(tokens) {
  if (tokens.length === 0) return '';

  if (tokens[0] === 'let') {
    const eq = tokens.indexOf('=');
    if (eq !== 2) throw new Error('usage: let NAME = CONSTRUCTOR...');
    const name = tokens[1];
    const cmd = tokens[3];
    if (!CONSTRUCTORS.has(cmd)) throw new Error(`"${cmd}" is not a constructor`);
    const { rest } = extractStore(tokens.slice(4));
    const num = setLast(construct(cmd, rest));
    regs[name] = num;
    return `${name} := ${num.toString()}`;
  }

  if (tokens[0] === 'precision') {
    if (tokens.length === 1) return `current precision: ${nam.current_precision()}`;
    const n = asInt(tokens[1], 'N');
    let inner = '';
    nam.precision_context(n, () => {
      inner = evaluate(tokens.slice(2));
    });
    refreshPrecision();
    return `[at precision ${n}] ${inner}\n` + `precision restored: ${nam.current_precision()}`;
  }

  const cmd = tokens[0];
  const rawArgs = tokens.slice(1);

  if (CONSTRUCTORS.has(cmd)) {
    const { store, rest } = extractStore(rawArgs);
    const num = setLast(construct(cmd, rest));
    if (store) regs[store] = num;
    return (store ? `${store} := ` : '') + num.toString();
  }

  switch (cmd) {
    case 'vars': {
      const names = Object.keys(regs).sort();
      if (names.length === 0) return '(no registers)';
      return names.map((k) => `  ${k} = ${regs[k].toString()}`).join('\n');
    }
    case 'drop': {
      const name = rawArgs[0];
      if (!(name in regs)) throw new Error(`no such register "${name}"`);
      delete regs[name];
      return `dropped ${name}`;
    }
    case 'digits': {
      const num = lookup(rawArgs[0]);
      const n = rawArgs[1] !== undefined ? asInt(rawArgs[1], 'N') : undefined;
      const arr = n === undefined ? num.digits() : num.digits(n);
      return `[${arr.join(', ')}]`;
    }
    case 'string': {
      const num = lookup(rawArgs[0]);
      const n = rawArgs[1] !== undefined ? asInt(rawArgs[1], 'N') : 6;
      return num.to_string(n);
    }
    case 'base': {
      const num = lookup(rawArgs[0]);
      return `base ${num.base()}`;
    }
    case 'tier': {
      const num = lookup(rawArgs[0]);
      return `tier: ${num.tier()}`;
    }
    case 'gen': {
      const num = lookup(rawArgs[0]);
      return `generator: ${num.gen()}`;
    }
    case 'bitwidth': {
      const num = lookup(rawArgs[0]);
      return `accumulator bit-width: ${num.accumulator_bitwidth()}`;
    }
    case 'histogram': {
      const num = lookup(rawArgs[0]);
      const n = rawArgs[1] !== undefined ? asInt(rawArgs[1], 'N') : 30;
      const hist = num.digit_histogram(n);
      return hist.map((c, d) => `${d}:${c}`).join('  ');
    }
    case 'tojson': {
      const num = lookup(rawArgs[0]);
      return num.to_json();
    }
    case 'fromjson': {
      const { store, rest } = extractStore(rawArgs);
      // Re-join the remaining tokens: JSON has no spaces from
      // dump(), but be defensive in case of manual paste.
      const payload = rest.join(' ');
      const o = setLast(nam.from_json(payload));
      if (store) regs[store] = o;
      return (store ? `${store} := ` : '') + o.toString();
    }
    case 'in_base': {
      const { store, rest } = extractStore(rawArgs);
      const num = lookup(rest[0]);
      const b = asInt(rest[1], 'B');
      const o = setLast(num.in_base(b));
      if (store) regs[store] = o;
      return (store ? `${store} := ` : '') + o.toString();
    }
    case 'fork': {
      const num = lookup(rawArgs[0]);
      const [a, b] = num.fork();
      regs['a'] = a;
      regs['b'] = b;
      setLast(a);
      return (
        `forked (cost ${num.fork_cost()}) into a, b\n` +
        `  a = ${a.toString()}\n  b = ${b.toString()}`
      );
    }
    case 'fork_cost': {
      const num = lookup(rawArgs[0]);
      return `fork cost: ${num.fork_cost()}`;
    }
    case 'skip': {
      const { store, rest } = extractStore(rawArgs);
      const num = lookup(rest[0]);
      const k = asInt(rest[1], 'K');
      const o = num.skip(k);
      if (o === null) return 'skip pending (null) — no fast-forward path ' + '(non-periodic tier)';
      setLast(o);
      if (store) regs[store] = o;
      return (store ? `${store} := ` : '') + o.toString();
    }
    case 'streaming': {
      const { store, rest } = extractStore(rawArgs);
      const num = lookup(rest[0]);
      const o = setLast(num.streaming());
      if (store) regs[store] = o;
      return (store ? `${store} := ` : '') + o.toString();
    }
    case 'cached': {
      const { store, rest } = extractStore(rawArgs);
      const num = lookup(rest[0]);
      const n = asInt(rest[1], 'N');
      const o = setLast(num.cached(n));
      if (store) regs[store] = o;
      return (store ? `${store} := ` : '') + o.toString();
    }
    case 'compare': {
      const a = lookup(rawArgs[0]);
      const b = lookup(rawArgs[1]);
      const maxd = rawArgs[2] !== undefined ? asInt(rawArgs[2], 'MAXD') : 30;
      return `compare: ${triStr(a.compare(b, maxd))}`;
    }
    case 'less': {
      const a = lookup(rawArgs[0]);
      const b = lookup(rawArgs[1]);
      const maxd = rawArgs[2] !== undefined ? asInt(rawArgs[2], 'MAXD') : 30;
      return `less: ${triStr(a.definitely_less_than(b, maxd))}`;
    }
    case 'agrees': {
      const a = lookup(rawArgs[0]);
      const b = lookup(rawArgs[1]);
      const maxd = rawArgs[2] !== undefined ? asInt(rawArgs[2], 'MAXD') : 30;
      return `agrees: ${a.agrees_with(b, maxd)}`;
    }
    case 'add':
    case 'sub':
    case 'mul':
    case 'div': {
      const { store, rest } = extractStore(rawArgs);
      const a = lookup(rest[0]);
      const b = lookup(rest[1]);
      // Honesty guard (mirrors the Node REPL): interval-honest
      // arithmetic consumes only the FRACTIONAL digit stream of
      // each operand (values in [0,1)). Integer / improper values
      // (e.g. rational 4 1) stream as 0.000..., so a combination
      // involving them is NOT meaningful. Surface this honestly.
      log(
        escapeHtml(
          'note: arithmetic is fractional-only ' +
            '(operands in [0,1)); integer/improper operands stream ' +
            'as 0.000... and yield meaningless results.'
        ),
        'log-pending'
      );
      const o = setLast(a[cmd](b));
      if (store) regs[store] = o;
      return (store ? `${store} := ` : '') + o.toString();
    }
    case 'ipart': {
      const num = lookup(rawArgs[0]);
      return `integer part: ${triStr(num.integer_part())}`;
    }
    default:
      throw new Error(`unknown command "${cmd}"`);
  }
}

// Run a console-grammar command string, logging command + result.
function runCommand(text, { echo = true } = {}) {
  const trimmed = text.trim();
  if (trimmed === '') return;
  if (echo) logCmd(trimmed);
  try {
    const tokens = trimmed.split(/\s+/);
    const result = evaluate(tokens);
    if (result) {
      if (/pending \(null\)/.test(result)) log(escapeHtml(result), 'log-pending');
      else logOk(result);
    }
  } catch (exc) {
    logErr(exc.message);
  }
  refreshVars();
  refreshPrecision();
  updateDisplay();
}

// ---- GUI button wiring (translated to console grammar) ----------
function storeSuffix(id) {
  const v = $(id).value.trim();
  return v ? ` >${v}` : '';
}

function wireConstructors() {
  for (const btn of document.querySelectorAll('[data-make]')) {
    btn.addEventListener('click', () => {
      const kind = btn.dataset.make;
      let cmd;
      if (kind === 'rational') {
        cmd =
          `rational ${$('rP').value} ${$('rQ').value} ` +
          `${$('rBase').value}${storeSuffix('rStore')}`;
      } else if (kind === 'sqrt') {
        cmd = `sqrt ${$('sD').value} ${$('sBase').value}` + storeSuffix('sStore');
      } else if (kind === 'padic') {
        cmd =
          `padic ${$('pA').value} ${$('pB').value} ` + `${$('pP').value}${storeSuffix('pStore')}`;
      } else if (kind === 'const') {
        cmd = `${$('kConst').value} ${$('kBase').value}` + storeSuffix('kStore');
      }
      runCommand(cmd);
    });
  }
}

function wireOps() {
  for (const btn of document.querySelectorAll('[data-op]')) {
    btn.addEventListener('click', () => {
      const op = btn.dataset.op;
      const reg = $('tReg').value.trim() || '_';
      const n = $('tN').value.trim();
      const store = storeSuffix('tStore');
      let cmd;
      switch (op) {
        case 'digits':
          cmd = `digits ${reg} ${n}`;
          break;
        case 'string':
          cmd = `string ${reg} ${n}`;
          break;
        case 'base':
          cmd = `base ${reg}`;
          break;
        case 'in_base':
          cmd = `in_base ${reg} ${n}${store}`;
          break;
        case 'fork':
          cmd = `fork ${reg}`;
          break;
        case 'fork_cost':
          cmd = `fork_cost ${reg}`;
          break;
        case 'skip':
          cmd = `skip ${reg} ${n}${store}`;
          break;
        case 'streaming':
          cmd = `streaming ${reg}${store}`;
          break;
        case 'cached':
          cmd = `cached ${reg} ${n}${store}`;
          break;
        case 'tier':
          cmd = `tier ${reg}`;
          break;
        case 'gen':
          cmd = `gen ${reg}`;
          break;
        case 'bitwidth':
          cmd = `bitwidth ${reg}`;
          break;
        case 'histogram':
          cmd = `histogram ${reg} ${n}`;
          break;
        case 'tojson':
          cmd = `tojson ${reg}`;
          break;
      }
      runCommand(cmd);
    });
  }
}

function wireComparisons() {
  for (const btn of document.querySelectorAll('[data-cmp]')) {
    btn.addEventListener('click', () => {
      const op = btn.dataset.cmp;
      const a = $('cA').value.trim();
      const b = $('cB').value.trim();
      const maxd = $('cMaxd').value.trim();
      runCommand(`${op} ${a} ${b} ${maxd}`);
    });
  }
}

// ---- keypad: standard-calculator-style mouse interactions -------
function wireKeypad() {
  // digit keys append to the N field
  for (const btn of document.querySelectorAll('[data-key]')) {
    btn.addEventListener('click', () => {
      const cur = $('keyN').value === '0' ? '' : $('keyN').value;
      $('keyN').value = cur + btn.dataset.key;
    });
  }
  // clear-entry
  for (const btn of document.querySelectorAll('[data-keyclear]')) {
    btn.addEventListener('click', () => {
      $('keyN').value = '0';
    });
  }
  // operation keys act on the current target register
  for (const btn of document.querySelectorAll('[data-keyop]')) {
    btn.addEventListener('click', () => {
      const op = btn.dataset.keyop;
      const reg = targetReg;
      const n = $('keyN').value.trim();
      const sv = $('keyStore').value.trim();
      const store = sv ? ` >${sv}` : '';
      let cmd;
      switch (op) {
        case 'digits':
        case 'string':
          cmd = `${op} ${reg} ${n}`;
          break;
        case 'skip':
        case 'cached':
          cmd = `${op} ${reg} ${n}${store}`;
          break;
        case 'in_base':
          cmd = `in_base ${reg} ${n}${store}`;
          break;
        case 'fork':
          cmd = `fork ${reg}`;
          break;
        case 'fork_cost':
          cmd = `fork_cost ${reg}`;
          break;
        case 'streaming':
          cmd = `streaming ${reg}${store}`;
          break;
      }
      runCommand(cmd);
    });
  }
  // keep keypad target in sync if user edits tReg directly
  $('tReg').addEventListener('change', () => {
    const v = $('tReg').value.trim() || '_';
    setTarget(v);
  });
}

function wireArithmetic() {
  for (const btn of document.querySelectorAll('[data-arith]')) {
    btn.addEventListener('click', () => {
      const op = btn.dataset.arith;
      const a = $('aA').value.trim() || '_';
      const b = $('aB').value.trim() || '_';
      const store = storeSuffix('aStore');
      const cmd = op === 'ipart' ? `ipart ${a}` : `${op} ${a} ${b}${store}`;
      runCommand(cmd);
    });
  }
}

// ---- static control wiring --------------------------------------
$('consoleRun').addEventListener('click', () => {
  runCommand($('console').value);
  $('console').value = '';
});
$('console').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') {
    runCommand($('console').value);
    $('console').value = '';
  }
});
$('precRun').addEventListener('click', () => {
  const n = $('precN').value.trim();
  const inner = $('precCmd').value.trim();
  runCommand(`precision ${n} ${inner}`);
});
$('refreshVars').addEventListener('click', refreshVars);
$('dropBtn').addEventListener('click', () => {
  const name = $('dropName').value.trim();
  if (name) {
    runCommand(`drop ${name}`);
    $('dropName').value = '';
  }
});
$('clearLog').addEventListener('click', () => {
  out.innerHTML = '';
});

// ---- boot -------------------------------------------------------
nam = await loadNam(createNam);
refreshPrecision();
refreshVars();
updateDisplay();
logOk(
  'module ready — build a number or type a command. ' + 'The last result is always in register "_".'
);

wireConstructors();
wireOps();
wireComparisons();
wireArithmetic();
wireKeypad();
