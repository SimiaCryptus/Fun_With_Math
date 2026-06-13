// Simple perceptual colormaps. Each function takes t in [0,1] and returns
    // [r, g, b] in 0..255.

    function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }

    function lerp(a, b, t) { return a + (b - a) * t; }

    function sampleStops(stops, t) {
      t = clamp01(t);
      const n = stops.length - 1;
      const idx = t * n;
      const i0 = Math.floor(idx);
      const i1 = Math.min(i0 + 1, n);
      const f = idx - i0;
      const a = stops[i0], b = stops[i1];
      return [
        Math.round(lerp(a[0], b[0], f)),
        Math.round(lerp(a[1], b[1], f)),
        Math.round(lerp(a[2], b[2], f)),
      ];
    }

    const VIRIDIS = [
      [68, 1, 84], [72, 40, 120], [62, 74, 137],
      [49, 104, 142], [38, 130, 142], [31, 158, 137],
      [53, 183, 121], [109, 205, 89], [180, 222, 44], [253, 231, 37],
    ];

    const MAGMA = [
      [0, 0, 4], [28, 16, 68], [79, 18, 123],
      [129, 37, 129], [181, 54, 122], [229, 80, 100],
      [251, 135, 97], [254, 194, 135], [252, 253, 191],
    ];

    const TWILIGHT = [
      [226, 217, 226], [196, 175, 208], [149, 137, 191],
      [97, 104, 165], [60, 78, 122], [40, 52, 79],
      [60, 78, 122], [97, 104, 165], [149, 137, 191],
      [196, 175, 208], [226, 217, 226],
    ];

    export const colormaps = {
      viridis: (t) => sampleStops(VIRIDIS, t),
      magma: (t) => sampleStops(MAGMA, t),
      twilight: (t) => sampleStops(TWILIGHT, t),
      grayscale: (t) => {
        const v = Math.round(clamp01(t) * 255);
        return [v, v, v];
      },
    };