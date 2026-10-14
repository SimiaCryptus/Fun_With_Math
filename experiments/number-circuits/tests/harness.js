const results = [];

export function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); }
  catch (e) { results.push({ name, ok: false, msg: e.message }); }
}

export function eq(actual, expected, msg = '') {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg} expected ${b}, got ${a}`);
}

export function ok(cond, msg = 'assertion failed') {
  if (!cond) throw new Error(msg);
}

export function report(el) {
  const failed = results.filter(r => !r.ok).length;
  el.innerHTML = `<h2>${results.length - failed}/${results.length} passed</h2>` +
    results.map(r => `<div style="color:${r.ok ? 'green' : 'red'}">${r.ok ? '✔' : '✘'} ${r.name}${r.ok ? '' : ' — ' + r.msg}</div>`).join('');
}