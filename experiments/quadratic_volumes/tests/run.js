// Minimal assert/describe harness. Works in the browser (renders into #out)
// and prints the numbers each check relies on.

const suites = [];
let current = null;

export function describe(name, fn) {
  current = { name, cases: [] };
  suites.push(current);
  fn();
  current = null;
}

export function it(name, fn) {
  current.cases.push({ name, fn });
}

const notes = [];
export function note(msg) {
  notes.push(String(msg));
}

export function assert(cond, msg = 'assertion failed') {
  if (!cond) throw new Error(msg);
}

export function assertClose(a, b, tol = 1e-9, label = '') {
  const d = Math.abs(a - b);
  if (!(d <= tol)) {
    throw new Error(`${label} ${a} != ${b} (|Δ| = ${d} > ${tol})`);
  }
  note(`${label} ${a.toPrecision(10)} ≈ ${b.toPrecision(10)} (|Δ|=${d.toExponential(2)})`);
}

export async function run(target) {
  let pass = 0;
  let fail = 0;
  const lines = [];
  for (const s of suites) {
    lines.push(`\n## ${s.name}`);
    for (const c of s.cases) {
      notes.length = 0;
      try {
        await c.fn();
        pass++;
        lines.push(`  PASS  ${c.name}`);
      } catch (e) {
        fail++;
        lines.push(`  FAIL  ${c.name}\n        ${e.message}`);
      }
      for (const n of notes) lines.push(`          · ${n}`);
    }
  }
  lines.unshift(`${pass} passed, ${fail} failed`);
  const text = lines.join('\n');
  if (target) {
    target.textContent = text;
    target.className = fail ? 'fail' : 'pass';
  }
  if (typeof console !== 'undefined') console.log(text);
  return { pass, fail };
}