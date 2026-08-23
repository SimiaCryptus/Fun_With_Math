/**
 * graph.js — SVG lane renderer for a theory graph.
 * Lanes = layers (cognitive axis left→right, contextual lanes at the edges).
 * Layout = barycentric ordering inside each lane (Sugiyama-lite).
 */
import { LANE_ORDER, LAYER_COLOR, layerOf } from './schema.js';

const SVG = 'http://www.w3.org/2000/svg';
const LANE_W = 300;
const ROW_H = 34;
const NODE_R = 7;

const svgEl = (tag, attrs = {}) => {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, String(v));
  return n;
};

function shapePath(layer, r) {
  switch (layer) {
    case 'inspiration': // triangle
      return `M 0 ${-r * 1.15} L ${r} ${r * 0.8} L ${-r} ${r * 0.8} Z`;
    case 'fuzzy': {
      // circle
      const k = r * 0.5523;
      return (
        `M ${-r} 0 C ${-r} ${-k} ${-k} ${-r} 0 ${-r} C ${k} ${-r} ${r} ${-k} ${r} 0` +
        ` C ${r} ${k} ${k} ${r} 0 ${r} C ${-k} ${r} ${-r} ${k} ${-r} 0 Z`
      );
    }
    case 'symbolic': {
      // rounded square
      const a = r * 0.95,
        c = r * 0.45;
      return (
        `M ${-a + c} ${-a} H ${a - c} Q ${a} ${-a} ${a} ${-a + c} V ${a - c}` +
        ` Q ${a} ${a} ${a - c} ${a} H ${-a + c} Q ${-a} ${a} ${-a} ${a - c} V ${-a + c}` +
        ` Q ${-a} ${-a} ${-a + c} ${-a} Z`
      );
    }
    case 'deductive': {
      // square
      const a = r * 0.92;
      return `M ${-a} ${-a} H ${a} V ${a} H ${-a} Z`;
    }
    case 'numeric': {
      // diamond
      const a = r * 1.2;
      return `M 0 ${-a} L ${a} 0 L 0 ${a} L ${-a} 0 Z`;
    }
    default: {
      // hexagon (social / ecological)
      const a = r * 1.05,
        h = a * 0.87;
      return `M ${-a / 2} ${-h} L ${a / 2} ${-h} L ${a} 0 L ${a / 2} ${h} L ${-a / 2} ${h} L ${-a} 0 Z`;
    }
  }
}

export class GraphView {
  constructor(host) {
    this.host = host;
    this.onSelect = () => {};
    this.onHover = () => {};
    this.nodes = new Map(); // id -> {id, data, lane, x, y, el}
    this.links = []; // rendered links
    this.allLinks = []; // links used for layout
    this.transform = { x: 0, y: 0, k: 1 };
    this.selection = null;
    this.showLabels = true;
    this._buildSvg();
  }

  /* ---------------- scaffolding ---------------- */

  _buildSvg() {
    this.svg = svgEl('svg', { xmlns: SVG });
    const defs = svgEl('defs');
    for (const [cls, color] of Object.entries({
      'rel-logic': '#7f8ea3',
      'rel-evidence': '#fbbf24',
      'rel-conflict': '#ff6b6b',
      'rel-cross': '#a78bfa',
      'rel-context': '#2dd4bf',
      morphism: '#38bdf8',
      coherence: '#f472b6',
    })) {
      const m = svgEl('marker', {
        id: `arrow-${cls}`,
        viewBox: '0 0 10 10',
        refX: 9,
        refY: 5,
        markerWidth: 6,
        markerHeight: 6,
        orient: 'auto-start-reverse',
      });
      m.append(svgEl('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: color, opacity: 0.9 }));
      defs.append(m);
    }
    this.svg.append(defs);

    this.root = svgEl('g');
    this.gLanes = svgEl('g', { class: 'lanes' });
    this.gLinks = svgEl('g', { class: 'links' });
    this.gNodes = svgEl('g', { class: 'nodes' });
    this.root.append(this.gLanes, this.gLinks, this.gNodes);
    this.svg.append(this.root);
    this.host.append(this.svg);

    this._wirePanZoom();
    this.svg.addEventListener('click', (e) => {
      if (e.target === this.svg || e.target.classList.contains('lane-rect'))
        this.select(null, true);
    });
  }

  _wirePanZoom() {
    let panning = false,
      sx = 0,
      sy = 0,
      ox = 0,
      oy = 0;
    this.svg.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.node')) return;
      panning = true;
      sx = e.clientX;
      sy = e.clientY;
      ox = this.transform.x;
      oy = this.transform.y;
      this.svg.classList.add('panning');
      this.svg.setPointerCapture(e.pointerId);
    });
    this.svg.addEventListener('pointermove', (e) => {
      if (!panning) return;
      this.transform.x = ox + (e.clientX - sx);
      this.transform.y = oy + (e.clientY - sy);
      this._applyTransform();
    });
    const stop = (e) => {
      panning = false;
      this.svg.classList.remove('panning');
      try {
        this.svg.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    this.svg.addEventListener('pointerup', stop);
    this.svg.addEventListener('pointercancel', stop);

    this.svg.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const r = this.svg.getBoundingClientRect();
        const mx = e.clientX - r.left,
          my = e.clientY - r.top;
        const f = Math.exp(-e.deltaY * 0.0016);
        const k = Math.min(4, Math.max(0.08, this.transform.k * f));
        const ratio = k / this.transform.k;
        this.transform.x = mx - (mx - this.transform.x) * ratio;
        this.transform.y = my - (my - this.transform.y) * ratio;
        this.transform.k = k;
        this._applyTransform();
      },
      { passive: false }
    );
  }

  _applyTransform() {
    const { x, y, k } = this.transform;
    this.root.setAttribute('transform', `translate(${x} ${y}) scale(${k})`);
  }

  /* ---------------- data + layout ---------------- */

  setData(graph) {
    this.graph = graph;
    this.nodes.clear();

    const lanesPresent = LANE_ORDER.filter((l) => graph.nodes.some((n) => layerOf(n) === l));
    this.lanes = lanesPresent.length ? lanesPresent : LANE_ORDER.slice();

    for (const n of graph.nodes) {
      const lane = layerOf(n);
      this.nodes.set(n.id, {
        id: n.id,
        data: n,
        lane,
        x: this.lanes.indexOf(lane) * LANE_W,
        y: 0,
        pinned: false,
      });
    }

    this.allLinks = [
      ...(graph.edges || []).map((e) => ({ from: e.from, to: e.to })),
      ...(graph.morphisms || []).map((m) => ({ from: m.from, to: m.to })),
    ].filter((l) => this.nodes.has(l.from) && this.nodes.has(l.to));

    this.layout();
  }

  layout() {
    const byLane = new Map(this.lanes.map((l) => [l, []]));
    for (const n of this.nodes.values()) (byLane.get(n.lane) || []).push(n);

    // Seed order: kind, then name — deterministic starting point.
    for (const [, arr] of byLane) {
      arr.sort(
        (a, b) =>
          a.data.kind.localeCompare(b.data.kind) ||
          (a.data.name || a.id).localeCompare(b.data.name || b.id)
      );
      arr.forEach((n, i) => {
        n.y = (i - (arr.length - 1) / 2) * ROW_H;
      });
    }

    const nbrs = new Map([...this.nodes.keys()].map((id) => [id, []]));
    for (const l of this.allLinks) {
      nbrs.get(l.from).push(l.to);
      nbrs.get(l.to).push(l.from);
    }

    for (let pass = 0; pass < 40; pass++) {
      const order = pass % 2 ? [...this.lanes].reverse() : this.lanes;
      for (const lane of order) {
        const arr = byLane.get(lane) || [];
        for (const n of arr) {
          const ys = nbrs
            .get(n.id)
            .map((id) => this.nodes.get(id))
            .filter((m) => m && m.lane !== lane)
            .map((m) => m.y);
          n._bary = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : n.y;
        }
        arr.sort((a, b) => a._bary - b._bary);
        arr.forEach((n, i) => {
          n.y = (i - (arr.length - 1) / 2) * ROW_H;
        });
      }
    }

    for (const [lane, arr] of byLane) {
      const x = this.lanes.indexOf(lane) * LANE_W;
      arr.forEach((n) => {
        n.x = x;
      });
    }
    this.laneBuckets = byLane;
  }

  /* ---------------- rendering ---------------- */

  /**
   * @param {Set<string>} visibleNodeIds
   * @param {Array} links  [{id, from, to, cls, kind, title, kindTag}]
   * @param {Set<string>} matchIds  ids highlighted by the search box
   */
  render(visibleNodeIds, links, matchIds = new Set()) {
    this.gLanes.replaceChildren();
    this.gLinks.replaceChildren();
    this.gNodes.replaceChildren();
    this.links = links;
    this.visible = visibleNodeIds;

    const visNodes = [...this.nodes.values()].filter((n) => visibleNodeIds.has(n.id));
    if (!visNodes.length) return;

    const minY = Math.min(...visNodes.map((n) => n.y));
    const maxY = Math.max(...visNodes.map((n) => n.y));

    // lanes
    for (const lane of this.lanes) {
      const count = visNodes.filter((n) => n.lane === lane).length;
      const x = this.lanes.indexOf(lane) * LANE_W;
      const g = svgEl('g');
      g.append(
        svgEl('rect', {
          class: 'lane-rect',
          x: x - 30,
          y: minY - 56,
          width: LANE_W - 30,
          height: maxY - minY + 100,
          rx: 8,
        })
      );
      const lbl = svgEl('text', {
        class: 'lane-label',
        x: x - 18,
        y: minY - 34,
        fill: LAYER_COLOR[lane],
      });
      lbl.textContent = lane;
      const sub = svgEl('text', { class: 'lane-sub', x: x - 18, y: minY - 20 });
      sub.textContent = `${count} node${count === 1 ? '' : 's'}`;
      g.append(lbl, sub);
      this.gLanes.append(g);
    }

    // links
    this.linkEls = new Map();
    for (const l of links) {
      const a = this.nodes.get(l.from),
        b = this.nodes.get(l.to);
      if (!a || !b || !visibleNodeIds.has(a.id) || !visibleNodeIds.has(b.id)) continue;
      const p = svgEl('path', {
        class: `link ${l.cls}`,
        d: this._linkPath(a, b),
        'marker-end': `url(#arrow-${l.cls.split(' ').pop()})`,
      });
      const t = svgEl('title');
      t.textContent = l.title || `${l.from} → ${l.to}`;
      p.append(t);
      p.dataset.id = l.id;
      p.dataset.from = l.from;
      p.dataset.to = l.to;
      p.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onSelect(l.id, l.kind);
      });
      this.gLinks.append(p);
      this.linkEls.set(l.id, p);
    }

    // nodes
    for (const n of visNodes) {
      const conf = typeof n.data.confidence === 'number' ? n.data.confidence : 0.6;
      const r = NODE_R * (0.75 + conf * 0.55);
      const color = LAYER_COLOR[n.lane] || '#888';
      const g = svgEl('g', { class: 'node', transform: `translate(${n.x} ${n.y})` });
      g.dataset.id = n.id;
      g.dataset.status = n.data.status || 'unknown';
      if (matchIds.has(n.id)) g.classList.add('match');

      g.append(
        svgEl('path', {
          class: 'shape',
          d: shapePath(n.lane, r),
          fill: `${color}33`,
          stroke: color,
        })
      );

      const label = svgEl('text', { class: 'label', x: r + 6, y: 0 });
      label.textContent = truncate(n.data.name || n.id, 30);
      const sub = svgEl('text', { class: 'sub', x: r + 6, y: 11 });
      sub.textContent = `${n.data.kind}${n.data.status ? ' · ' + n.data.status : ''}`;
      g.append(label, sub);

      const title = svgEl('title');
      title.textContent = `${n.data.name || n.id}\n${n.id}\n[${n.lane} · ${n.data.kind} · ${n.data.status}]\n\n${n.data.statement || ''}`;
      g.append(title);

      g.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onSelect(n.id, 'node');
      });
      g.addEventListener('pointerenter', () => this.highlight(n.id));
      g.addEventListener('pointerleave', () => this.highlight(this.selection));
      this._makeDraggable(g, n);

      this.gNodes.append(g);
      n.el = g;
    }

    this.svg.classList.toggle('no-labels', !this.showLabels);
    this.highlight(this.selection);
    if (this.selection) this._markSelection();
  }

  _makeDraggable(g, n) {
    let dragging = false,
      sx = 0,
      sy = 0,
      ox = 0,
      oy = 0,
      moved = false;
    g.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      dragging = true;
      moved = false;
      sx = e.clientX;
      sy = e.clientY;
      ox = n.x;
      oy = n.y;
      g.setPointerCapture(e.pointerId);
    });
    g.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = (e.clientX - sx) / this.transform.k;
      const dy = (e.clientY - sy) / this.transform.k;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      n.x = ox + dx;
      n.y = oy + dy;
      n.pinned = true;
      this.updatePositions();
    });
    const end = (e) => {
      if (!dragging) return;
      dragging = false;
      try {
        g.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (moved) e.stopPropagation();
    };
    g.addEventListener('pointerup', end);
    g.addEventListener('pointercancel', end);
  }

  updatePositions() {
    for (const n of this.nodes.values()) {
      if (n.el) n.el.setAttribute('transform', `translate(${n.x} ${n.y})`);
    }
    for (const [id, p] of this.linkEls || []) {
      const a = this.nodes.get(p.dataset.from),
        b = this.nodes.get(p.dataset.to);
      if (a && b) p.setAttribute('d', this._linkPath(a, b));
      void id;
    }
  }

  _linkPath(a, b) {
    if (a.lane === b.lane) {
      const bow = 70 + Math.min(90, Math.abs(b.y - a.y) * 0.25);
      const x = a.x + 16;
      return `M ${x} ${a.y} C ${x + bow} ${a.y}, ${x + bow} ${b.y}, ${x + 14} ${b.y}`;
    }
    const sign = Math.sign(b.x - a.x) || 1;
    const ax = a.x + sign * 12,
      bx = b.x - sign * 14;
    const dx = (bx - ax) * 0.45;
    return `M ${ax} ${a.y} C ${ax + dx} ${a.y}, ${bx - dx} ${b.y}, ${bx} ${b.y}`;
  }

  /* ---------------- selection / highlight ---------------- */

  select(id, silent = false) {
    this.selection = id;
    this._markSelection();
    this.highlight(id);
    if (!silent) this.onSelect(id, id ? 'node' : null);
  }

  _markSelection() {
    for (const n of this.nodes.values()) {
      if (n.el) n.el.classList.toggle('sel', n.id === this.selection);
    }
  }

  /** Dim everything not adjacent to `id`. */
  highlight(id) {
    const nodesOn = new Set();
    const linksOn = new Set();
    if (id && this.nodes.has(id)) {
      nodesOn.add(id);
      for (const l of this.links) {
        if (l.from === id || l.to === id) {
          linksOn.add(l.id);
          nodesOn.add(l.from);
          nodesOn.add(l.to);
        }
      }
    }
    const active = nodesOn.size > 0;
    for (const n of this.nodes.values()) {
      if (!n.el) continue;
      n.el.classList.toggle('dim', active && !nodesOn.has(n.id));
      n.el.classList.toggle('hi', active && nodesOn.has(n.id));
    }
    for (const [lid, p] of this.linkEls || []) {
      p.classList.toggle('dim', active && !linksOn.has(lid));
      p.classList.toggle('hi', active && linksOn.has(lid));
    }
  }

  setLabels(on) {
    this.showLabels = on;
    this.svg.classList.toggle('no-labels', !on);
  }

  /* ---------------- viewport ---------------- */

  fit(padding = 60) {
    const vis = [...this.nodes.values()].filter((n) => !this.visible || this.visible.has(n.id));
    if (!vis.length) return;
    const xs = vis.map((n) => n.x),
      ys = vis.map((n) => n.y);
    const minX = Math.min(...xs) - 60,
      maxX = Math.max(...xs) + 230;
    const minY = Math.min(...ys) - 80,
      maxY = Math.max(...ys) + 40;
    const r = this.svg.getBoundingClientRect();
    const k = Math.min(
      (r.width - padding * 2) / Math.max(1, maxX - minX),
      (r.height - padding * 2) / Math.max(1, maxY - minY),
      1.6
    );
    this.transform.k = Math.max(0.08, k);
    this.transform.x =
      padding -
      minX * this.transform.k +
      (r.width - padding * 2 - (maxX - minX) * this.transform.k) / 2;
    this.transform.y =
      padding -
      minY * this.transform.k +
      (r.height - padding * 2 - (maxY - minY) * this.transform.k) / 2;
    this._applyTransform();
  }

  centerOn(id) {
    const n = this.nodes.get(id);
    if (!n) return;
    const r = this.svg.getBoundingClientRect();
    this.transform.x = r.width / 2 - n.x * this.transform.k;
    this.transform.y = r.height / 2 - n.y * this.transform.k;
    this._applyTransform();
  }
}

function truncate(s, n) {
  s = String(s ?? '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
