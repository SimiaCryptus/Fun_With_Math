import { el, clear, svg } from '../dom.js';
import { KIND_ORDER, filterNodes, neighborhood, inducedEdges } from '../graph-model.js';

/**
 * Force-directed neighbourhood map. Deliberately dependency-free:
 * O(n²) repulsion is fine for the few hundred nodes this graph holds.
 */
export function createMapView(root, idx, store) {
  clear(root);

  const scope = el(
    'select',
    { class: 'ctl', onchange: () => store.set({ mapScope: scope.value }) },
    [
      el('option', { value: 'neighborhood' }, 'neighbourhood of selection'),
      el('option', { value: 'cluster' }, 'cluster of selection'),
      el('option', { value: 'filtered' }, 'all filtered nodes'),
    ]
  );

  const depth = el('input', {
    type: 'range',
    min: '1',
    max: '4',
    step: '1',
    class: 'ctl',
    oninput: () => store.set({ mapDepth: Number(depth.value) }),
  });
  const depthLabel = el('span', { class: 'mono' }, '2');

  const recenter = el(
    'button',
    { class: 'btn', type: 'button', onclick: () => (fit(), draw()) },
    'fit'
  );
  const shake = el(
    'button',
    { class: 'btn', type: 'button', onclick: () => (seed(true), kick()) },
    're-layout'
  );
  const stats = el('span', { class: 'mono' }, '');

  const toolbar = el('div', { class: 'map-toolbar' }, [
    scope,
    'depth',
    depth,
    depthLabel,
    recenter,
    shake,
    stats,
  ]);

  const links = svg('g', { class: 'links' });
  const nodesG = svg('g', { class: 'nodes' });
  const viewport = svg('g', {}, [links, nodesG]);
  const canvas = svg('svg', { class: 'map-svg' }, [viewport]);
  const legend = el('div', { class: 'map-legend' });
  const hint = el(
    'div',
    { class: 'map-hint' },
    'drag to pan · wheel to zoom · click to select · double-click to open'
  );
  const stage = el('div', { class: 'map-stage' }, [canvas, legend, hint]);

  root.appendChild(el('div', { class: 'map-wrap' }, [toolbar, stage]));

  // ---- state ---------------------------------------------------------
  const pos = new Map(); // id -> {x,y,vx,vy}
  let data = { nodes: [], edges: [] };
  let view = { x: 0, y: 0, k: 1 };
  let alpha = 0;
  let raf = 0;
  let dirty = true;
  let lastKey = '';
  let current = null;

  // ---- interaction ---------------------------------------------------
  let dragNode = null;
  let panning = null;

  const toGraph = (evt) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: (evt.clientX - r.left - view.x) / view.k,
      y: (evt.clientY - r.top - view.y) / view.k,
    };
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (dragNode) return;
    panning = { x: e.clientX - view.x, y: e.clientY - view.y };
    canvas.classList.add('dragging');
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (dragNode) {
      const p = toGraph(e);
      const s = pos.get(dragNode);
      s.x = p.x;
      s.y = p.y;
      s.vx = s.vy = 0;
      alpha = Math.max(alpha, 0.25);
      kick();
    } else if (panning) {
      view.x = e.clientX - panning.x;
      view.y = e.clientY - panning.y;
      applyView();
    }
  });

  const endDrag = () => {
    dragNode = null;
    panning = null;
    canvas.classList.remove('dragging');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => (panning = null));

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const k = Math.min(4, Math.max(0.2, view.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      view.x = mx - ((mx - view.x) * k) / view.k;
      view.y = my - ((my - view.y) * k) / view.k;
      view.k = k;
      applyView();
    },
    { passive: false }
  );

  function applyView() {
    viewport.setAttribute('transform', `translate(${view.x},${view.y}) scale(${view.k})`);
  }

  // ---- data ----------------------------------------------------------
  function build(s) {
    if (s.mapScope === 'filtered' || !s.selected) {
      const list = filterNodes(idx, s).slice(0, 220);
      const ids = new Set(list.map((n) => n.id));
      return { nodes: list, edges: inducedEdges(idx, ids) };
    }
    if (s.mapScope === 'cluster') {
      const cl = (idx.clustersOf.get(s.selected) ?? [])[0];
      const ids = new Set(cl ? cl.members : [s.selected]);
      ids.add(s.selected);
      return {
        nodes: [...ids].map((i) => idx.nodes.get(i)).filter(Boolean),
        edges: inducedEdges(idx, ids),
      };
    }
    const { ids, edges } = neighborhood(idx, s.selected, s.mapDepth);
    return { nodes: [...ids].map((i) => idx.nodes.get(i)), edges };
  }

  function seed(force = false) {
    const r = canvas.getBoundingClientRect();
    const cx = r.width / 2 || 400;
    const cy = r.height / 2 || 300;
    data.nodes.forEach((n, i) => {
      if (!force && pos.has(n.id)) return;
      const a = (i / Math.max(1, data.nodes.length)) * Math.PI * 2;
      const rad = 60 + 140 * Math.sqrt((i + 1) / data.nodes.length);
      pos.set(n.id, { x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad, vx: 0, vy: 0 });
    });
  }

  // ---- rendering -----------------------------------------------------
  let linkEls = [];
  let nodeEls = [];

  function render(s) {
    clear(links);
    clear(nodesG);
    linkEls = data.edges.map((e) => {
      const line = svg('line', { class: `link r-${e.relation}` }, [
        svg('title', {}, `${e.from} —${e.relation}→ ${e.to}`),
      ]);
      links.appendChild(line);
      return { e, line };
    });

    nodeEls = data.nodes.map((n) => {
      const deg = idx.degree.get(n.id) ?? 0;
      const r = 5 + Math.min(9, Math.sqrt(deg) * 2.6);
      const g = svg('g', {
        class: `gnode k-${n.kind}`,
        onpointerdown: (ev) => {
          ev.stopPropagation();
          dragNode = n.id;
          canvas.setPointerCapture(ev.pointerId);
        },
        onclick: () => store.set({ selected: n.id }),
        ondblclick: () => store.set({ selected: n.id, view: 'node' }),
      });
      g.appendChild(svg('circle', { r }, [svg('title', {}, `${n.name}\n${n.kind} · ${n.status}`)]));
      g.appendChild(svg('text', { x: r + 4, y: 3.5 }, truncate(n.name, 34)));
      nodesG.appendChild(g);
      return { n, g, r };
    });

    renderLegend();
    draw();
  }

  function renderLegend() {
    clear(legend);
    const kinds = [...new Set(data.nodes.map((n) => n.kind))].sort(
      (a, b) => KIND_ORDER.indexOf(a) - KIND_ORDER.indexOf(b)
    );
    for (const k of kinds) legend.appendChild(el('span', { class: `k-${k}` }, [el('i'), k]));
  }

  function draw() {
    const sel = store.get().selected;
    for (const { n, g } of nodeEls) {
      const p = pos.get(n.id);
      if (!p) continue;
      g.setAttribute('transform', `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`);
      g.classList.toggle('selected', n.id === sel);
    }
    for (const { e, line } of linkEls) {
      const a = pos.get(e.from);
      const b = pos.get(e.to);
      if (!a || !b) continue;
      line.setAttribute('x1', a.x.toFixed(1));
      line.setAttribute('y1', a.y.toFixed(1));
      line.setAttribute('x2', b.x.toFixed(1));
      line.setAttribute('y2', b.y.toFixed(1));
      line.classList.toggle('dim', !!sel && e.from !== sel && e.to !== sel);
    }
  }

  // ---- simulation ----------------------------------------------------
  function step() {
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2 || 400;
    const cy = rect.height / 2 || 300;
    const list = data.nodes.map((n) => pos.get(n.id)).filter(Boolean);
    const K = 5200;

    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) {
          dx = (Math.random() - 0.5) * 2;
          dy = (Math.random() - 0.5) * 2;
          d2 = 1;
        }
        const f = K / d2;
        const d = Math.sqrt(d2);
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }

    const L = 110;
    for (const e of data.edges) {
      const a = pos.get(e.from);
      const b = pos.get(e.to);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      const f = (d - L) * 0.035;
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    for (const p of list) {
      p.vx += (cx - p.x) * 0.006;
      p.vy += (cy - p.y) * 0.006;
      p.vx *= 0.84;
      p.vy *= 0.84;
      p.x += p.vx * alpha;
      p.y += p.vy * alpha;
    }
  }

  function kick() {
    if (raf) return;
    const loop = () => {
      raf = 0;
      if (!root.offsetParent) return; // hidden view: pause
      step();
      draw();
      alpha *= 0.985;
      if (alpha > 0.02) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  function fit() {
    const rect = canvas.getBoundingClientRect();
    const pts = data.nodes.map((n) => pos.get(n.id)).filter(Boolean);
    if (!pts.length) return;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs) - 60;
    const maxX = Math.max(...xs) + 60;
    const minY = Math.min(...ys) - 40;
    const maxY = Math.max(...ys) + 40;
    const k = Math.min(rect.width / (maxX - minX), rect.height / (maxY - minY), 2);
    view.k = Number.isFinite(k) && k > 0 ? k : 1;
    view.x = rect.width / 2 - ((minX + maxX) / 2) * view.k;
    view.y = rect.height / 2 - ((minY + maxY) / 2) * view.k;
    applyView();
  }

  // ---- public --------------------------------------------------------
  function update(s, { activated } = {}) {
    scope.value = s.mapScope;
    depth.value = String(s.mapDepth);
    depthLabel.textContent = String(s.mapDepth);

    const key = [
      s.mapScope,
      s.mapDepth,
      s.mapScope === 'filtered'
        ? `${s.query}|${[...s.kinds]}|${[...s.statuses]}|${[...s.domains]}|${s.cluster}|${s.minConfidence}`
        : s.selected,
    ].join('¦');

    if (dirty || key !== lastKey) {
      lastKey = key;
      dirty = false;
      data = build(s);
      stats.textContent = `${data.nodes.length} nodes · ${data.edges.length} edges`;
      seed();
      render(s);
      alpha = 1;
      kick();
      setTimeout(() => (fit(), draw()), 500);
    } else {
      draw();
      if (activated) kick();
    }
    current = s.selected;
  }

  return { update, invalidate: () => (dirty = true) };
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
