import test from 'node:test';
import assert from 'node:assert/strict';
import {viridis, legendCss} from '../js/renderer/colormap.js';

test('viridis clamps its domain and hits the anchor endpoints', () => {
    assert.deepEqual(viridis(0), [68, 1, 84]);
    assert.deepEqual(viridis(1), [253, 231, 37]);
    assert.deepEqual(viridis(-5), viridis(0));
    assert.deepEqual(viridis(5), viridis(1));
});

test('viridis returns integral 8-bit channels across the ramp', () => {
    for (let i = 0; i <= 100; i++) {
        const c = viridis(i / 100);
        assert.equal(c.length, 3);
        for (const v of c) {
            assert.ok(Number.isInteger(v), `non-integer channel ${v}`);
            assert.ok(v >= 0 && v <= 255, `channel out of range: ${v}`);
        }
    }
});

test('viridis is monotone in luminance (colourblind-safe ordering)', () => {
    let prev = -1;
    for (let i = 0; i <= 60; i++) {
        const [r, g, b] = viridis(i / 60);
        const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        assert.ok(y >= prev - 1e-9, `luminance dipped at t=${i / 60}`);
        prev = y;
    }
});

test('legendCss produces one stop per step, 0%..100%', () => {
    const css = legendCss(5);
    assert.ok(css.startsWith('linear-gradient(to right, '));
     // stops are separated by "%,", and every stop begins with "rgb(" — counting
     // those is delimiter-independent.
     assert.equal((css.match(/rgb\(/g) || []).length, 5);
     assert.equal(css.slice(css.indexOf(',') + 1, -1).split('%,').length, 5);
    assert.match(css, /rgb\(68,1,84\) 0\.0%/);
    assert.match(css, /rgb\(253,231,37\) 100\.0%/);
    assert.equal((legendCss().match(/rgb\(/g) || []).length, 24, 'default is 24 steps');
});