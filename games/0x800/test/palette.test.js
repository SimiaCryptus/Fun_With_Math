// Every tile fg/bg pair in every theme block of styles.css must reach
// WCAG AA contrast (≥ 4.5:1).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from './harness.js';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

function luminance(hexColor) {
  const n = parseInt(hexColor.slice(1), 16);
  const chan = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan((n >> 16) & 255) + 0.7152 * chan((n >> 8) & 255) + 0.0722 * chan(n & 255);
}

function contrast(a, b) {
  const la = luminance(a),
    lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

test('every tile fg/bg pair has contrast ≥ 4.5:1 in every theme', () => {
  const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1].trim().split('\n').pop().trim(),
    body: m[2],
  }));
  const varsOf = (body) =>
    Object.fromEntries(
      [...body.matchAll(/--(tile-[0-9a-fA-F]+(?:-fg)?)\s*:\s*(#[0-9a-fA-F]{6})/g)].map((m) => [
        m[1],
        m[2],
      ])
    );
  const root = varsOf(blocks.find((b) => b.selector === ':root').body);
  assert.equal(
    Object.keys(root).filter((k) => !k.endsWith('-fg')).length,
    16,
    'sixteen tile colours in :root'
  );

  let checked = 0;
  for (const { selector, body } of blocks) {
    const vars = varsOf(body);
    for (const name of Object.keys(vars)) {
      if (name.endsWith('-fg')) continue;
      const bg = vars[name];
      const fg = vars[`${name}-fg`] ?? root[`${name}-fg`];
      assert.ok(fg, `${selector}: ${name} has no fg`);
      const ratio = contrast(bg, fg);
      assert.ok(ratio >= 4.5, `${selector}: --${name} ${bg} on ${fg} is ${ratio.toFixed(2)}:1`);
      checked++;
    }
  }
  assert.ok(checked >= 16 + 2 + 16, `checked ${checked} pairs`);
});
