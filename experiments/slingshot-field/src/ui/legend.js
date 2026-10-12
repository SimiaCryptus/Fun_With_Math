import {LABEL} from '../core/conventions.js';
import {dimColor, diverging, gray, LABEL_COLORS, SCALAR_LAYERS, SIG_COLORS, viridis} from '../render/colormaps.js';
import {LABEL_DESC, LABEL_SHORT, SIG_DESC} from './descriptions.js';

const css = (c) => `rgb(${c.map((v) => Math.round(v)).join(',')})`;
const fmt = (v) => (Math.abs(v) >= 1e4 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(2) : v.toPrecision(3));

function span(text, tip) {
    const s = document.createElement('span');
    s.textContent = text;
    if (tip) s.dataset.tip = tip;
    return s;
}

function chip(color, text, tip) {
    const s = span('', tip), c = document.createElement('span');
    c.className = 'chip';
    c.style.background = css(color);
    s.append(c, text);
    return s;
}

/** Fill the legend element for the current layer. */
export function renderLegend(el, key, range, labels = {short: LABEL_SHORT, desc: LABEL_DESC}) {
    el.replaceChildren();
    const L = SCALAR_LAYERS[key];
    if (key === 'outcome') {
        for (const v of Object.values(LABEL)) el.append(chip(LABEL_COLORS[v], labels.short[v], labels.desc[v]));
        return;
    }
    if (key === 'sig') {
        SIG_DESC.forEach((d, s) => el.append(chip(SIG_COLORS[s], d.short, d.long)));
        el.append(span('brightness ∝ log|det H|', 'Brighter pixels have larger |det H|, i.e. stronger curvature of the ΔE landscape.'));
        return;
    }
    if (!range) return;
    const tr = L.log ? 'log₁₀|v|' : L.symlog ? 'sign(v)·log₁₀(1+|v|)' : 'v';
    const div = L.map === 'div';
    el.append(span(fmt(range[0]), `Lower end of the colour scale (${div ? 'symmetric about zero' : '2nd percentile'}), in units of ${tr}.`));
    const cv = document.createElement('canvas');
    cv.id = 'cbar';
    cv.width = 256;
    cv.height = 1;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(256, 1);
    for (let x = 0; x < 256; x++) {
        const t = x / 255, c = div ? diverging(2 * t - 1) : L.map === 'gray' ? gray(t) : viridis(t);
        img.data.set([c[0], c[1], c[2], 255], 4 * x);
    }
    ctx.putImageData(img, 0, 0);
    cv.dataset.tip = `${L.name}\n${L.desc}\n\nColour ↦ ${tr}` +
        (div ? '; symmetric range set by the 98th percentile of |v|, white = 0.' : '; clipped at the 2nd–98th percentiles.') +
        ' Non-exit samples are drawn dimmed in their outcome colour.';
    el.append(cv, span(fmt(range[1]), `Upper end of the colour scale (98th percentile), in units of ${tr}.`));
    el.append(chip(dimColor(LABEL.COLLISION), 'dim = no exit',
        'Samples without an exit (forbidden, collision, captured) have no value and are drawn in a darkened outcome colour.'));
}