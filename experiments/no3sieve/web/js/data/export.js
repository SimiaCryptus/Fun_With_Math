// export.js — boring, tool-agnostic formats (§5.6, §6). Every export embeds
// config_hash, version, the window origin in world coordinates, and the
// client-side verification result (S7).
import {linfIndex} from '../lattice.js';
import {verify} from '../verify.js';
import {configHash, pointsHash, canonicalJson} from '../util/sha256.js';
import {densityCurve} from '../sat.js';
import {createLogger} from '../util/log.js';

const log = createLogger('export');
const MAX_IMAGE_SIDE = 16384;   // browsers refuse canvases beyond this
function requirePairs(points, who) {
    if (!points || typeof points.length !== 'number')
        throw new TypeError(`${who}: \`points\` must be an array-like of interleaved x,y`);
    if (points.length % 2) throw new RangeError(`${who}: odd points length ${points.length}`);
    return points.length / 2;
}

export function download(name, mime, data) {
    if (typeof name !== 'string' || !name) throw new TypeError('download: file name is required');
    if (data == null) throw new TypeError(`download(${name}): no data to write`);
    if (typeof document === 'undefined') throw new Error('download: no DOM (not a browser context)');
    const blob = data instanceof Blob ? data : new Blob([data], {type: mime});
    if (blob.size === 0) log.warn(`download(${name}): the payload is empty`);
    const url = URL.createObjectURL(blob);
    try {
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        log.info(`downloaded ${name} (${blob.size} bytes)`);
    } catch (e) {
        URL.revokeObjectURL(url);
        log.error(`download(${name}) failed:`, e);
        throw e;
    }
    setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function toCSV(points, {origin = [0, 0], withMeta = true} = {}) {
    const k = requirePairs(points, 'toCSV');
    if (!Array.isArray(origin) || origin.length !== 2 || !origin.every(Number.isFinite))
        throw new TypeError('toCSV: origin must be [x, y]');
    const rows = [withMeta ? 'x,y,order_index,ring' : 'x,y'];
    for (let i = 0; i < k; i++) {
        const x = points[2 * i] - origin[0], y = points[2 * i + 1] - origin[1];
        rows.push(withMeta ? `${x},${y},${i},${linfIndex(points[2 * i], points[2 * i + 1])}` : `${x},${y}`);
    }
    return rows.join('\n') + '\n';
}

/** `#`/`.` grid — the de-facto format in the no-three-in-line literature. */
export function toTXTGrid(points, x0, y0, s) {
    const k0 = requirePairs(points, 'toTXTGrid');
    if (!Number.isInteger(x0) || !Number.isInteger(y0))
        throw new TypeError(`toTXTGrid: origin must be integral (got ${x0},${y0})`);
    if (!Number.isInteger(s) || s < 1) throw new RangeError(`toTXTGrid: s must be a positive integer (got ${s})`);
    if (s > 8192) throw new RangeError(`toTXTGrid: s=${s} would emit ${s * s} characters`);
    const set = new Set();
    const k = k0;
    for (let i = 0; i < k; i++) {
        const x = points[2 * i] - x0, y = points[2 * i + 1] - y0;
        if (x >= 0 && y >= 0 && x < s && y < s) set.add(y * s + x);
    }
    const lines = [];
    for (let y = s - 1; y >= 0; y--) {          // top row first
        let r = '';
        for (let x = 0; x < s; x++) r += set.has(y * s + x) ? '#' : '.';
        lines.push(r);
    }
    return lines.join('\n') + '\n';
}

export function toJSON(points, cfg, extra = {}) {
    const k = requirePairs(points, 'toJSON');
    if (!cfg || typeof cfg !== 'object') throw new TypeError('toJSON: cfg is required (it seeds config_hash)');
    const pts = [];
    for (let i = 0; i < k; i++) pts.push([points[2 * i], points[2 * i + 1]]);
    const report = verify(points);
    if (!report.ok) log.warn('toJSON: serialising a set that FAILED verification', report);
    return JSON.stringify({
        $schema: './schema/pointset.schema.json',
        version: cfg.version,
        config: cfg,
        config_hash: configHash(cfg),
        points_sha256: pointsHash(points),
        k,
        metric: 'linf',
        verification: report,
        ...extra,
        points: pts,
    }, null, 2) + '\n';
}

export function toNDJSON(ringReports) {
    if (!Array.isArray(ringReports)) throw new TypeError('toNDJSON: expected an array of ring reports');
    if (!ringReports.length) {
        log.warn('toNDJSON: no ring log recorded (was the run started before this page loaded?)');
        return '\n';
    }
    return ringReports.map((r) => JSON.stringify({
        r: r.r, k: r.k, new_points: Array.from(r.added),
    })).join('\n') + '\n';
}

export function toManifest(cfg, stats, curve) {
    if (!cfg || typeof cfg !== 'object') throw new TypeError('toManifest: cfg is required');
    if (!stats || typeof stats !== 'object') throw new TypeError('toManifest: stats is required');
    return canonicalJson({
        $schema: './schema/manifest.schema.json',
        version: cfg.version,
        config: cfg,
        config_hash: configHash(cfg),
        metric: 'linf',
        stats,
        // `undefined` is not canonicalisable (canonicalJson throws on purpose), so a
        // manifest without a curve has to say so explicitly. Same for a non-browser
        // context, where `navigator` may not exist at all.
        density_curve: curve === undefined ? null : curve,
        ua: (typeof navigator !== 'undefined' && navigator.userAgent) || 'unknown',
    }) + '\n';
}

export function toDensityCurveCSV(points, r, sizes) {
    requirePairs(points, 'toDensityCurveCSV');
    if (!Number.isInteger(r) || r < 0) throw new RangeError(`toDensityCurveCSV: bad r=${r}`);
    if (!Array.isArray(sizes) || !sizes.length)
        throw new TypeError('toDensityCurveCSV: `sizes` must be a non-empty array');
    const rows = ['s,max_pop,c(s),argmax_x,argmax_y'];
    for (const row of densityCurve(points, r, sizes)) {
        rows.push(`${row.s},${row.maxPop},${row.c.toFixed(6)},${row.argmaxX},${row.argmaxY}`);
    }
    if (rows.length === 1) log.warn('toDensityCurveCSV: every requested size was skipped');
    return rows.join('\n') + '\n';
}

/** 1 px per cell: black = point, white = free (§6). */
export function toPNGBlob(points, r) {
    requirePairs(points, 'toPNGBlob');
    if (!Number.isInteger(r) || r < 0) throw new RangeError(`toPNGBlob: bad r=${r}`);
    const N = 2 * r + 1;
    if (N > MAX_IMAGE_SIDE) throw new RangeError(`toPNGBlob: ${N}x${N} exceeds the ${MAX_IMAGE_SIDE} px canvas limit`);
    const cv = document.createElement('canvas');
    cv.width = N;
    cv.height = N;
    const ctx = cv.getContext('2d');
    if (!ctx) throw new Error('toPNGBlob: 2D context unavailable');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, N, N);
    const img = ctx.getImageData(0, 0, N, N);
    const d = img.data;
    const k = points.length / 2;
    for (let i = 0; i < k; i++) {
        const x = points[2 * i] + r, y = points[2 * i + 1] + r;
        if (x < 0 || y < 0 || x >= N || y >= N) continue;
        const o = ((N - 1 - y) * N + x) * 4;
        d[o] = d[o + 1] = d[o + 2] = 0;
        d[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('toPNGBlob: canvas.toBlob returned null'))), 'image/png'));
}

export function toSVG(points, r, cell = 4) {
    requirePairs(points, 'toSVG');
    if (!Number.isInteger(r) || r < 0) throw new RangeError(`toSVG: bad r=${r}`);
    if (!Number.isFinite(cell) || cell <= 0) throw new RangeError(`toSVG: cell must be positive (got ${cell})`);
    const N = 2 * r + 1, S = N * cell;
    const k = points.length / 2;
    const parts = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">`,
        `<rect width="${S}" height="${S}" fill="#fff"/>`,
    ];
    for (let i = 0; i < k; i++) {
        const x = points[2 * i] + r, y = points[2 * i + 1] + r;
        if (x < 0 || y < 0 || x >= N || y >= N) continue;
        parts.push(`<rect x="${x * cell}" y="${(N - 1 - y) * cell}" width="${cell}" height="${cell}" fill="#000"/>`);
    }
    parts.push('</svg>');
    return parts.join('\n');
}