// harness.js — a tiny zero-dependency test runner.

const tests = [];

export function test(name, fn) {
  tests.push({ name, fn });
}

export async function run() {
  let pass = 0;
  let fail = 0;
  for (const t of tests) {
    try {
      await t.fn();
      pass++;
      console.log(`  ✓ ${t.name}`);
    } catch (err) {
      fail++;
      const msg = String(err && err.stack ? err.stack : err)
        .split('\n')
        .join('\n      ');
      console.log(`  ✗ ${t.name}\n      ${msg}`);
    }
  }
  console.log(`\n${pass} passed, ${fail} failed, ${tests.length} total`);
  return fail === 0;
}
