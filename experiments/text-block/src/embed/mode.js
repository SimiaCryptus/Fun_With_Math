import { Embedder } from './embedder.js';
import { buildGraph, topEdges, mergeGraphs, reversePermutation } from './graph.js';
import { pca, procrustes } from './linalg.js';
import { effectiveRank, knnPurity, ringSmoothness, boundarySignal, knn } from './metrics.js';
import { createScatter } from './scatter.js';
import { createPanel, drawSparkline } from './panel.js';
import { embeddingColors } from './colorize.js';
import { GRAPH_KEYS, EMBED_LIMIT } from './params.js';
import { TSNE, MDS, rawAxes, LAYOUT_LABELS } from './layout.js';
import { computeLCP, ringCodes } from '../sort.js';
import { reducedMotion } from '../glyphfx.js';
import { glyphOf } from '../render.js';
import { textOf } from '../ring.js';

/**
 * Glue between the store, the block renderer, the embedder, the scatter view and the panel.
 * Data flow follows embeddings.md §5.4.
 */
export function createEmbedMode({ store, renderer, blocks, ringFor, select, clear, els }) {
   const allBlocks = blocks ?? [renderer]; // every block view that mirrors colours / neighbours
  const S = () => store.get();
  const P = () => S().embed.params;
  const isActive = () => S().mode !== 'block';
  const setEmbed = (patch, events = []) => store.set({ embed: { ...S().embed, ...patch } }, events);

  const init = P();
  const embedder = new Embedder({ dim: init.dim, seed: init.seed });
  embedder.setParams(init);

  let ring = [];
  let graph = null;
  let edges = null;
  let coords = null;
  let prev = new Map();
  let lossHist = [];
  let raf = 0;
  let lastMetrics = 0;
  let lastColors = 0;
  let force = true;
  let dirty = true;
  let followTimer = 0;
  let showEdges = false;
  let hoverNN = { id: null, ids: [] };
  let blocked = '';
   // 2-D layouts: iterative ones keep state (warm start by id).
   const iterative = { tsne: new TSNE({ perplexity: init.perplexity }), mds: new MDS() };
   let layoutStale = true;
   let lastLayoutInput = 0;
   let layoutRaf = 0;
   const resetLayouts = () => {
     for (const l of Object.values(iterative)) l.reset();
     layoutStale = true;
   };

  const label = (p) => (ring[p] ? `pos ${p} '${glyphOf(ring[p].ch)}'` : '');

  function tooltipFor(id) {
    const p = embedder.index.get(id);
    if (p === undefined || !ring[p] || !coords) return '';
    const ids = hoverNN.id === id
      ? hoverNN.ids
      : knn(embedder.matrix(), embedder.n, embedder.dim, p, 5).map((q) => embedder.ids[q]);
    return `${label(p)} · nearest: ${ids.map((i) => label(embedder.index.get(i))).join(', ')}`;
  }

  const scatter = createScatter(els.scatter, {
    tip: els.tip,
    onHover(id) {
      if (id !== S().hover) store.set({ hover: id }, ['hover']);
    },
    onSelect(id, mods) { select(id, mods); },
    onClear() { clear(); },
    onLasso(ids) {
      if (!ids.length) return;
      const s = S();
      const selection = new Set(s.selection);
      for (const id of ids) selection.add(id);
      store.set({ selection, anchor: s.anchor ?? ids[ids.length - 1] }, ['selection']);
    },
    tooltip: tooltipFor,
  });

  const panel = createPanel(els.panel, {
    params: init,
    canRun: !reducedMotion(),
    onChange: onParams,
    onAction,
  });

  // ------------------------------------------------------------ graph

  function followWindow(s) {
    const cols = renderer.cols;
    if (!cols || cols < 2) return null;
    return [-s.shift, cols - 1 - s.shift];
  }

  function rebuild() {
    dirty = false;
    clearTimeout(followTimer);
    const s = S();
    ring = ringFor(s);
    const n = s.chars.length ? ring.length : 0;
    blocked = n === 0
      ? 'The ring is empty.'
      : s.chars.length > EMBED_LIMIT
        ? `The ring has ${s.chars.length} characters; the embedding runs on at most ${EMBED_LIMIT}.`
        : '';
    if (blocked) {
      graph = null;
      edges = null;
      scatter.setEdges(null);
      panel.setStatus(blocked);
      force = true;
      publish();
      return;
    }

    const t0 = performance.now();
    const codes = ringCodes(s.chars, s.sentinel);
    const lcp = computeLCP(codes, s.sa);
    const params = P();
     const window = params.followView ? followWindow(s) : null;
    graph = buildGraph({
      sa: s.sa, lcp, n, shift: s.shift, params, codes,
       window,
    });
     // Optional: add the adjacency of the reversed block (left-context sort).
     if (params.includeReverse && params.reverseWeight > 0 && s.rsa && s.rsa.length === n) {
       const rcodes = ringCodes(s.chars.slice().reverse(), s.sentinel);
       const rlcp = computeLCP(rcodes, s.rsa);
       const rgraph = buildGraph({
         sa: s.rsa, lcp: rlcp, n, shift: s.shift, params, codes: rcodes, window,
       });
       graph = mergeGraphs(graph, rgraph, reversePermutation(s.chars.length, n), params.reverseWeight);
     }
    embedder.sync(ring.map((c) => c.id), codes, ring.map((c) => c.ch));
    embedder.setGraph(graph);
    edges = topEdges(graph, 3);
    scatter.setEdges(showEdges ? edges : null);
    const ms = (performance.now() - t0).toFixed(1);
     const rev = graph.reversed ? ` (+ reversed ×${params.reverseWeight})` : '';
     panel.setStatus(`graph: n = ${n}, ${graph.edgeCount} edges${rev}, window [${graph.window.join(', ')}], built in ${ms} ms`);
    force = true;
    publish();
    kick();
  }

  // ------------------------------------------------------------ publishing

   /** 2-D projection of the current embedding according to params.layout. */
   function project(n, d) {
     const X = embedder.matrix();
     const mode = P().layout;
     if (mode === 'raw') return rawAxes(X, n, d);
     const lay = iterative[mode];
     if (!lay) return pca(X, n, d, 2);
     const now = performance.now();
     if (
       lay.n !== n
       || (layoutStale && (force || !S().embed.running || now - lastLayoutInput > 200))
     ) {
       lay.setInput(X, n, d, embedder.ids);
       layoutStale = false;
       lastLayoutInput = now;
     }
     lay.step(reducedMotion() ? lay.remaining : Math.max(1, P().layoutSteps | 0));
     if (!lay.n) return pca(X, n, d, 2); // layout diverged and reset itself
     return lay.coords();
   }

   function layoutText() {
     const m = P().layout;
     const lay = iterative[m];
     if (!lay) return LAYOUT_LABELS[m] ?? m;
     const v = Number.isFinite(lay.value) ? Number(lay.value.toPrecision(3)) : '—';
     const what = m === 'tsne' ? 'KL' : 'stress';
     return `${LAYOUT_LABELS[m]} ${what} ${v} · ${lay.iter}${lay.remaining > 0 ? '…' : ''}`;
   }

   /** Animate the iterative layout while the optimizer is paused. */
   function kickLayout() {
     if (layoutRaf || S().embed.running || !isActive() || !graph || reducedMotion()) return;
     const lay = iterative[P().layout];
     if (!lay || !(lay.remaining > 0 || layoutStale)) return;
     layoutRaf = requestAnimationFrame(() => {
       layoutRaf = 0;
       if (S().embed.running || !isActive() || !graph) return;
       publish(false);
     });
   }

   function publish(xChanged = true) {
     if (xChanged) layoutStale = true;
    const n = embedder.n;
    const d = embedder.dim;
    if (!graph || !n) {
      coords = null;
    } else {
       const Y = project(n, d);
      let ss = 0;
      for (let i = 0; i < Y.length; i++) ss += Y[i] * Y[i];
      const rms = Math.sqrt(ss / n);
      if (rms > 1e-12) for (let i = 0; i < Y.length; i++) Y[i] /= rms;

      const ids = embedder.ids;
      const A = [];
      const B = [];
      for (let p = 0; p < n; p++) {
        const q = prev.get(ids[p]);
        if (q) {
          A.push(Y[2 * p], Y[2 * p + 1]);
          B.push(q[0], q[1]);
        }
      }
      const m = A.length / 2;
      if (m >= 2) {
        const R = procrustes(A, B, m, 2);
        for (let p = 0; p < n; p++) {
          const x = Y[2 * p];
          const y = Y[2 * p + 1];
          Y[2 * p] = x * R[0] + y * R[2];
          Y[2 * p + 1] = x * R[1] + y * R[3];
        }
      }
      prev = new Map(ids.map((id, p) => [id, [Y[2 * p], Y[2 * p + 1]]]));
      coords = Y;
    }
    setEmbed({ version: S().embed.version + 1 }, ['embedding']);
     kickLayout();
  }

  function updateMetrics() {
    const X = embedder.matrix();
    const n = embedder.n;
    const d = embedder.dim;
    panel.setReadouts({
      loss: embedder.loss,
      hist: lossHist,
      rank: effectiveRank(X, n, d),
      purity: knnPurity(X, n, d, embedder.codes, 5),
      smooth: ringSmoothness(X, n, d).ratio,
      edges: graph.edgeCount,
      iter: embedder.iter,
       layout: layoutText(),
    });
    drawSparkline(els.boundary, boundarySignal(X, n, d));
  }

  function applyColors() {
    if (!coords || !isActive() || !S().embed.colorBlock) return;
    const map = embeddingColors(coords, embedder.ids);
     for (const b of allBlocks) b.setColors(map);
    scatter.setColors(map);
  }

  function clearColors() {
     for (const b of allBlocks) b.setColors(null);
    scatter.setColors(null);
  }

  function updateNeighbors() {
    const h = S().hover;
    const p = h == null ? undefined : embedder.index.get(h);
    if (!isActive() || p === undefined || !coords) {
      hoverNN = { id: null, ids: [] };
       for (const b of allBlocks) b.setNeighbors(null);
      scatter.setNeighbors(null);
      return;
    }
    const ids = knn(embedder.matrix(), embedder.n, embedder.dim, p, 5).map((q) => embedder.ids[q]);
    hoverNN = { id: h, ids };
    const set = new Set(ids);
     for (const b of allBlocks) b.setNeighbors(set);
    scatter.setNeighbors(set);
  }

  store.subscribe('embedding', (s) => {
    scatter.setSelection(s.selection);
    scatter.setHover(s.hover);
    if (!coords) {
      scatter.setData(null, blocked || 'no embedding');
      panel.setReadouts(null);
      drawSparkline(els.boundary, null);
      force = false;
      return;
    }
    scatter.setData({
      n: embedder.n,
      ids: embedder.ids,
      glyphs: ring.map((c) => glyphOf(c.ch)),
      sentinel: ring.map((c) => !!c.sentinel),
      xy: coords,
    });
    const now = performance.now();
    if (force || now - lastMetrics > 250) {
      lastMetrics = now;
      updateMetrics();
      if (s.hover != null) updateNeighbors();
    }
    if (s.embed.colorBlock && (force || now - lastColors > 200)) {
      lastColors = now;
      applyColors();
    }
    force = false;
  });

  // ------------------------------------------------------------ run loop

  function pushLoss(loss) {
    if (!Number.isFinite(loss)) return;
    lossHist.push(loss);
    if (lossHist.length > 240) lossHist.shift();
  }

  function kick() {
    if (!raf && S().embed.running && isActive() && graph) raf = requestAnimationFrame(loop);
  }

  function loop() {
    raf = 0;
    if (!S().embed.running || !isActive() || !graph) return;
    const r = embedder.step(P().stepsPerFrame);
    pushLoss(r.loss);
    publish();
    kick();
  }

  function setRunning(v) {
    if (v && reducedMotion()) v = false;
    if (v === S().embed.running) return;
    setEmbed({ running: v }, ['embedRun']);
  }

  store.subscribe('embedRun', (s) => {
    panel.setRunning(s.embed.running, !reducedMotion());
    kick();
     kickLayout();
  });

  // ------------------------------------------------------------ actions

  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function exportJSON() {
    if (!graph) return;
    const data = embedder.export();
    const n = graph.n;
    const list = [];
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const w = graph.W[p * n + q];
        if (w > 0) list.push([p, q, Number(w.toPrecision(6))]);
      }
    }
    const s = S();
    const out = {
      format: 'text-block-embedding/1',
      text: textOf(s.chars),
      sentinel: s.sentinel,
      positions: ring.map((c, p) => ({ pos: p, id: c.id, char: c.ch, sentinel: !!c.sentinel })),
      params: data.params,
      dim: data.dim,
      iter: embedder.iter,
      loss: embedder.loss,
      X: data.X,
      graph: { n, window: graph.window, totalWeight: graph.totalWeight, edgeCount: graph.edgeCount, edges: list },
       layout: coords
         ? { method: P().layout, xy: ring.map((_, p) => [coords[2 * p], coords[2 * p + 1]]) }
         : null,
    };
    download('text-block-embedding.json', JSON.stringify(out, null, 1), 'application/json');
  }

  function exportCSV() {
    if (!graph) return;
    const d = embedder.dim;
    const X = embedder.matrix();
    const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const header = ['id', 'pos', 'char', ...Array.from({ length: d }, (_, i) => `x_${i + 1}`)];
    const lines = [header.join(',')];
    ring.forEach((c, p) => {
      const xs = Array.from(X.subarray(p * d, (p + 1) * d), (v) => v.toPrecision(7));
      lines.push([c.id, p, q(c.ch), ...xs].join(','));
    });
    download('text-block-embedding.csv', `${lines.join('\n')}\n`, 'text/csv');
  }

  function onAction(name, value) {
    switch (name) {
      case 'run':
        if (!graph && !S().embed.running) {
          panel.setStatus(blocked || 'Nothing to run.');
          return;
        }
        setRunning(!S().embed.running);
        break;
      case 'step': {
        if (!graph) return;
        pushLoss(embedder.step(P().stepsPerFrame).loss);
        force = true;
        publish();
        break;
      }
      case 'solve': {
        if (!graph) return;
        panel.setStatus('solving…');
        setTimeout(() => {
          if (!graph) return;
          const t0 = performance.now();
          const r = embedder.solve({ tol: 1e-6, maxIter: 5000 });
          const ms = (performance.now() - t0).toFixed(0);
          pushLoss(r.loss);
          const res = Number.isFinite(r.residual) ? r.residual.toExponential(1) : 'n/a';
          panel.setStatus(r.converged
            ? `solved (diffuse): ${r.iter} iterations, residual ${res}, ${ms} ms`
            : `stopped after ${r.iter} iterations (residual ${res}, ${ms} ms)`);
          force = true;
          publish();
        }, 20);
        break;
      }
      case 'reseed':
        embedder.reseed();
         resetLayouts();
        lossHist = [];
        prev.clear();
        force = true;
        publish();
        break;
      case 'export-json':
        exportJSON();
        break;
      case 'export-csv':
        exportCSV();
        break;
      case 'resetView':
        scatter.resetView();
        break;
      case 'colorBlock':
        setEmbed({ colorBlock: !!value }, ['embedColor']);
        break;
      case 'edges':
        showEdges = !!value;
        scatter.setEdges(showEdges ? edges : null);
        break;
      default:
    }
  }

  store.subscribe('embedColor', (s) => {
    if (s.embed.colorBlock) applyColors();
    else clearColors();
  });

  function onParams(patch) {
    const next = { ...P(), ...patch };
    setEmbed({ params: next }, ['embedParams']);
    embedder.setParams(patch);
    if ('dim' in patch || 'seed' in patch) {
      lossHist = [];
      prev.clear();
       resetLayouts();
     }
     if ('perplexity' in patch) {
       iterative.tsne.setPerplexity(next.perplexity);
       layoutStale = true;
     }
     if ('layout' in patch) {
       iterative[next.layout]?.reset(); // fresh start from PCA
       layoutStale = true;
    }
    if (Object.keys(patch).some((k) => GRAPH_KEYS.includes(k))) {
      if (isActive()) rebuild();
      else dirty = true;
    } else {
      force = true;
      if (graph) publish();
    }
    panel.update(next);
  }

  // ------------------------------------------------------------ store wiring

  for (const b of els.modeButtons) {
    b.addEventListener('click', () => {
      if (S().mode !== b.dataset.mode) store.set({ mode: b.dataset.mode }, ['mode']);
    });
  }

  store.subscribe('mode', (s) => {
    document.body.dataset.mode = s.mode;
    for (const b of els.modeButtons) b.setAttribute('aria-pressed', String(b.dataset.mode === s.mode));
    if (isActive()) {
      if (dirty) rebuild();
      else if (s.embed.colorBlock) applyColors();
      kick();
       kickLayout();
    } else {
      clearColors();
       for (const b of allBlocks) b.setNeighbors(null);
    }
  });

  store.subscribe('text', () => {
    if (isActive()) rebuild();
    else dirty = true;
  });

  store.subscribe('shift', () => {
    if (!P().followView) return;
    if (!isActive()) {
      dirty = true;
      return;
    }
    clearTimeout(followTimer);
    followTimer = setTimeout(rebuild, 150);
  });

  store.subscribe('selection', (s) => scatter.setSelection(s.selection));
  store.subscribe('hover', (s) => {
    scatter.setHover(s.hover);
    updateNeighbors();
  });

  return { rebuild, embedder };
}