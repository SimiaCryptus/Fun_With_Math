// colormap.js — perceptually-uniform, colorblind-safe (viridis anchors, lerped).
const ANCHORS = [
    [68, 1, 84], [72, 40, 120], [62, 74, 137], [49, 104, 142], [38, 130, 142],
    [31, 158, 137], [53, 183, 121], [109, 205, 89], [180, 222, 44], [253, 231, 37],
];

export function viridis(t) {
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const f = t * (ANCHORS.length - 1);
    const i = Math.min(ANCHORS.length - 2, Math.floor(f));
    const u = f - i, a = ANCHORS[i], b = ANCHORS[i + 1];
    return [
        (a[0] + (b[0] - a[0]) * u) | 0,
        (a[1] + (b[1] - a[1]) * u) | 0,
        (a[2] + (b[2] - a[2]) * u) | 0,
    ];
}

export function legendCss(steps = 24) {
    const stops = [];
    for (let i = 0; i < steps; i++) {
        const c = viridis(i / (steps - 1));
        stops.push(`rgb(${c[0]},${c[1]},${c[2]}) ${(100 * i / (steps - 1)).toFixed(1)}%`);
    }
    return `linear-gradient(to right, ${stops.join(',')})`;
}