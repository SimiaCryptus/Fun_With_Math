// §B.1: src/sim/** is DOM-free, deterministic, and uses relative .js imports.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIM = fileURLToPath(new URL('../src/sim/', import.meta.url));

function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
}

const files = walk(SIM);
const FORBIDDEN_MATH = /\bMath\.(random|sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|exp|expm1|log|log1p|log2|log10|pow|cbrt|hypot)\b/g;
const FORBIDDEN_GLOBALS = /(?<![.\w$])(window|document|self|performance|Date|localStorage|requestAnimationFrame)\b/g;
const BROWSER_ONLY = new Set(['worker.js']);

test('src/sim contains modules', () => {
  assert.ok(files.length > 0, `no files under ${SIM}`);
});

test('no forbidden Math.* in src/sim', () => {
  const bad = [];
  for (const f of files) {
    const src = stripComments(readFileSync(f, 'utf8'));
    for (const m of src.matchAll(FORBIDDEN_MATH)) bad.push(`${relative(SIM, f)}: ${m[0]}`);
  }
  assert.deepEqual(bad, []);
});

test('no DOM / time globals in src/sim (worker.js exempt)', () => {
  const bad = [];
  for (const f of files) {
    if (BROWSER_ONLY.has(basename(f)) && dirname(f) === resolve(SIM)) continue;
    const src = stripComments(readFileSync(f, 'utf8'));
    for (const m of src.matchAll(FORBIDDEN_GLOBALS)) bad.push(`${relative(SIM, f)}: ${m[1]}`);
  }
  assert.deepEqual(bad, []);
});

test('math.js uses only Math.sqrt', () => {
  const src = stripComments(readFileSync(join(SIM, 'math.js'), 'utf8'));
  const used = new Set([...src.matchAll(/\bMath\.(\w+)/g)].map((m) => m[1]));
  assert.deepEqual([...used], ['sqrt']);
});

test('imports are relative .js paths inside src/sim (or vendored simplex-noise)', () => {
  const bad = [];
  const re = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g;
  for (const f of files) {
    const src = stripComments(readFileSync(f, 'utf8'));
    for (const m of src.matchAll(re)) {
      const spec = m[1];
      if (spec.includes('simplex-noise')) continue;
      const rel = relative(SIM, f);
      if (!(spec.startsWith('./') || spec.startsWith('../'))) { bad.push(`${rel}: bare import ${spec}`); continue; }
      if (!spec.endsWith('.js')) { bad.push(`${rel}: missing .js in ${spec}`); continue; }
      const target = resolve(dirname(f), spec);
      if (!target.startsWith(resolve(SIM))) bad.push(`${rel}: import escapes src/sim: ${spec}`);
    }
  }
  assert.deepEqual(bad, []);
});