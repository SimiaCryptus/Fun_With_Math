// The in-browser self-test (§7) is pure JS — run it in CI too, so a regression is
// caught before somebody has to notice a wrong picture.
import test from 'node:test';
import assert from 'node:assert/strict';
import {setLevel} from '../js/util/log.js';
import {runSelfTest} from '../js/selftest.js';

setLevel('silent');

test('runSelfTest passes end to end', {timeout: 300000}, () => {
    const lines = [];
    const r = runSelfTest((s) => lines.push(s));
    assert.equal(r.ok, true, `\n${r.log}`);
    assert.ok(!/^FAIL/m.test(r.log), `\n${r.log}`);
    assert.match(r.log, /ALL PASS/);
    assert.ok(lines.length >= 6, 'every case should report');
});

test('runSelfTest insists on a callable logger', () => {
    assert.throws(() => runSelfTest('nope'), TypeError);
});