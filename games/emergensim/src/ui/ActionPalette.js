import { findPath } from '../spatial/Pathfinding.js';
import { smokeDensityAt } from '../spatial/LineOfSight.js';
import { ACTION_COSTS } from '../core/ActionEconomy.js';
import { keyOf } from '../spatial/Tile.js';
import { Grid3D } from '../spatial/Grid3D.js';

const TOOLS = [
  { type: 'MOVE', label: 'Move', key: 'M', hint: 'Click a tile to walk there — closed doors on the route are opened (1 AP each)' },
  { type: 'TOGGLE_DOOR', label: 'Open/Close Door', key: 'O', targets: 'door' },
  { type: 'CHECK_DOOR', label: 'Check Door', key: 'C', targets: 'door' },
  { type: 'BARRICADE', label: 'Barricade', key: 'B', targets: 'door' },
  { type: 'CLEAR_DEBRIS', label: 'Clear Debris', key: 'R', targets: 'debris' },
  { type: 'DEESCALATE', label: 'Talk Down', key: 'T', targets: 'npc', range: 2.5 },
  { type: 'ASSIST', label: 'Assist / Carry', key: 'F', targets: 'npc', range: 1.5 },
  { type: 'SOUND_ALARM', label: 'Sound Alarm', key: 'L' },
];

const MOVE_KEYS = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0], q: [-1, -1], e: [1, -1], z: [-1, 1], x: [1, 1],
};

/**
 * Contextual action bar + keyboard/mouse input. Emits PLAYER_ACTION_REQUESTED, STEP_TURN_REQUESTED,
 * REWIND_REQUESTED, AUTOPSY_REQUESTED, VIEW_FLOOR_REQUESTED, PATH_PREVIEW and HUD_HINT.
 */
export class ActionPalette {
  constructor(el, state, bus) {
    this.el = el;
    this.state = state;
    this.bus = bus;
    this.tool = null;
    this.queue = [];
    this._awaiting = false;
    this._timer = null;
    this._offs = [];
    this._dom = [];
    this._bind();
    this.render();
  }

  // ------------------------------------------------------------------ wiring
  _bind() {
    const on = (type, fn) => this._offs.push(this.bus.on(type, fn));
    on('STATE_CHANGED', () => this.render());
    on('TILE_CLICKED', (p) => this._onTileClicked(p));
    on('TILE_HOVERED', (p) => this._onTileHovered(p));
    on('PLAYER_ACTION_APPLIED', () => {
      if (!this._awaiting) return;
      this._awaiting = false;
      if (this.queue.length) this._timer = setTimeout(() => this._advance(), 140);
    });
    on('ACTION_REJECTED', () => { this._awaiting = false; this._clearPath(); });
    on('TURN_STARTED', () => this._clearPath());
    on('REWOUND', () => { this.tool = null; this._clearPath(); });
    on('SCENARIO_ENDED', () => { this.tool = null; this._clearPath(); this.render(); });

    const add = (target, type, fn) => { if (!target) return; target.addEventListener(type, fn); this._dom.push(() => target.removeEventListener(type, fn)); };
    add(window, 'keydown', (e) => this._onKey(e));
    add(document.getElementById('btn-undo'), 'click', () => this.undo());
    add(document.getElementById('btn-autopsy'), 'click', () => this.bus.emit('AUTOPSY_REQUESTED', {}));
  }

  inputOk() {
    const s = this.state;
    return s.meta.activePhase === 'PLAYER_INPUT' && !s.outcome && s.player.physicalState.status === 'ACTIVE';
  }

  dispatch(action) { this.bus.emit('PLAYER_ACTION_REQUESTED', action); }
  hint(text, kind = '') { this.bus.emit('HUD_HINT', { text, kind }); }

  // ------------------------------------------------------------------ rendering
  render() {
    const s = this.state;
    const ap = s.player.actionPoints.current;
    const ok = this.inputOk();
    const carrying = !!s.player.physicalState.carrying;
    this.el.innerHTML = '';
    for (const t of TOOLS) {
      const btn = document.createElement('button');
      btn.className = 'action-btn' + (this.tool === t.type ? ' selected' : '');
      btn.dataset.action = t.type;
      let label = t.label;
      let cost = t.type === 'MOVE' ? '1+' : ACTION_COSTS[t.type];
      if (t.type === 'ASSIST' && carrying) { label = 'Release'; cost = 0; }
      btn.innerHTML = `<span class="key">${t.key}</span> ${label} <span class="cost">(${cost} AP)</span>`;
      btn.title = t.hint || (t.targets ? `Select, then click a ${t.targets}` : '');
      btn.disabled = !ok || (typeof cost === 'number' && cost > ap);
      btn.addEventListener('click', () => this.pick(t.type));
      this.el.appendChild(btn);
    }
    const end = document.createElement('button');
    end.className = 'action-btn primary';
    end.id = 'btn-end-turn';
    end.innerHTML = 'End Turn <span class="key">⏎</span>';
    end.disabled = !ok;
    end.addEventListener('click', () => { this._clearPath(); this.bus.emit('STEP_TURN_REQUESTED', {}); });
    this.el.appendChild(end);
  }

  // ------------------------------------------------------------------ tool selection
  pick(type) {
    if (!this.inputOk()) return;
    this._clearPath();
    const tool = TOOLS.find((t) => t.type === type);
    if (!tool) return;
    if (type === 'MOVE') { this.tool = null; this.render(); this.hint(tool.hint); return; }
    if (type === 'SOUND_ALARM') { this.tool = null; this.dispatch({ type }); return; }
    if (type === 'ASSIST' && this.state.player.physicalState.carrying) { this.tool = null; this.dispatch({ type: 'ASSIST' }); return; }
    const cands = this._candidates(tool);
    if (cands.length === 1) { this.tool = null; this.render(); this.dispatch({ type, target: cands[0] }); return; }
    if (!cands.length) { this.tool = null; this.render(); this.hint(`No ${tool.targets} in range for ${tool.label}`, 'warn'); return; }
    this.tool = type;
    this.render();
    this.hint(`${tool.label}: click a ${tool.targets} (Esc to cancel)`);
  }

  _candidates(tool) {
    const s = this.state;
    const p = s.player.position;
    if (tool.targets === 'door') {
      return s.grid.neighbors(p, { vertical: false }).map((n) => n.tile)
        .filter((t) => t.type === 'DOOR' && (tool.type !== 'BARRICADE' || (!t.doorState.isOpen && !t.doorState.isBarricaded)))
        .map((t) => t.key);
    }
    if (tool.targets === 'debris') return s.grid.neighbors(p, { vertical: false }).map((n) => n.tile).filter((t) => t.debris).map((t) => t.key);
    if (tool.targets === 'npc') {
      const out = [];
      for (const npc of s.npcs.values()) {
        if (npc.carriedBy || npc.position.z !== p.z) continue;
        if (npc.status !== 'ACTIVE' && !(tool.type === 'ASSIST' && npc.status === 'INCAPACITATED')) continue;
        if (Grid3D.distance(npc.position, p) <= tool.range) out.push(keyOf(npc.position));
      }
      return out;
    }
    return [];
  }

  // ------------------------------------------------------------------ mouse
  _onTileClicked({ key, tile }) {
    if (!tile || !this.inputOk()) return;
    if (this.tool) { const type = this.tool; this.tool = null; this.render(); this.dispatch({ type, target: key }); return; }
    const s = this.state;
    const p = s.player.position;
    if (key === keyOf(p)) return;
    const adjacent = s.grid.neighbors(p).some((n) => n.tile.key === key);
    if (adjacent && tile.type === 'DOOR' && !tile.doorState.isOpen && !tile.doorState.isBarricaded && !tile.doorState.isLocked) { this.dispatch({ type: 'TOGGLE_DOOR', target: key }); return; }
    if (adjacent && tile.debris) { this.dispatch({ type: 'CLEAR_DEBRIS', target: key }); return; }
    const npc = s.npcAt(key);
    if (npc && tile.type !== 'EXIT') {
      if (adjacent && npc.status === 'INCAPACITATED') { this.dispatch({ type: 'ASSIST', target: key }); return; }
      this.hint(`${npc.name}: use Talk Down (T) or Assist (F)`, 'warn');
      return;
    }
    this._startPath(tile);
  }

  _onTileHovered({ tile }) {
    if (!tile || this.tool || !this.inputOk() || tile.coord.z !== this.state.player.position.z) { this.bus.emit('PATH_PREVIEW', { keys: [] }); return; }
    const path = this._pathTo(tile);
    this.bus.emit('PATH_PREVIEW', { keys: path ? path.map((t) => t.key) : [] });
  }

  _pathTo(tile) {
    const s = this.state;
    const known = (k) => !!s.outcome || s.player.explored.has(k) || s.player.visible.has(k);
    const master = s.player.inventory.includes('MASTER_KEY');
    return findPath(s.grid, s.player.position, tile.coord, {
      agent: { canOpenDoors: true },
      maxNodes: 3000,
      costFn: (t) => {
        if (!known(t.key) || s.hazards.fireCells.has(t.key) || t.debris) return Infinity;
        if (t.type === 'DOOR' && !t.doorState.isOpen && (t.doorState.isBarricaded || (t.doorState.isLocked && !master))) return Infinity;
        if (t.type !== 'EXIT' && (s.npcAt(t.key) || s.threatAt(t.key))) return Infinity;
        let c = smokeDensityAt(s, t.key) * 3;
        if (t.type === 'DOOR' && !t.doorState.isOpen) c += 1; // opening costs 1 AP
        if (t.temperature > 100) c += 2;
        return c;
      },
    });
  }

  _startPath(tile) {
    const path = this._pathTo(tile);
    if (!path || !path.length) { this.hint('No known route there', 'warn'); return; }
    this.queue = path.map((t) => t.key);
    this._advance();
  }

  _advance() {
    this._timer = null;
    if (!this.queue.length) return;
    const s = this.state;
    if (!this.inputOk() || s.player.actionPoints.current <= 0) { this._clearPath(); return; }
    const key = this.queue[0];
    const tile = s.grid.getByKey(key);
    if (!tile) { this._clearPath(); return; }
    this._awaiting = true;
    if (tile.type === 'DOOR' && !tile.doorState.isOpen) { this.dispatch({ type: 'OPEN_DOOR', target: key }); return; }
    this.queue.shift();
    this.dispatch({ type: 'MOVE', target: key });
  }

  _clearPath() {
    this.queue = [];
    this._awaiting = false;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
  }

  // ------------------------------------------------------------------ keyboard
  _onKey(e) {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === 'Escape') { this.tool = null; this._clearPath(); this.render(); this.bus.emit('PATH_PREVIEW', { keys: [] }); return; }
    if (k === '[' || k === ']') { e.preventDefault(); this.bus.emit('VIEW_FLOOR_REQUESTED', { delta: k === '[' ? -1 : 1 }); return; }
    if (k === 'u') { this.undo(); return; }
    if (k === 'i') { this.bus.emit('AUTOPSY_REQUESTED', {}); return; }
    if (!this.inputOk()) return;
    if (k === ' ' || k === 'Enter') { e.preventDefault(); this._clearPath(); this.bus.emit('STEP_TURN_REQUESTED', {}); return; }
    if (k === 'PageUp' || k === 'PageDown') { e.preventDefault(); this._clearPath(); this.dispatch({ type: 'MOVE', dz: k === 'PageUp' ? 1 : -1 }); return; }
    const mv = MOVE_KEYS[k] || MOVE_KEYS[e.key];
    if (mv) { e.preventDefault(); this._clearPath(); this.tool = null; this.dispatch({ type: 'MOVE', dx: mv[0], dy: mv[1] }); return; }
    const tool = TOOLS.find((t) => t.key.toLowerCase() === k);
    if (tool) { e.preventDefault(); this.pick(tool.type); }
  }

  /** Undo: rewinds to the start of this turn if actions were taken, else to the start of the previous turn. */
  undo() {
    const s = this.state;
    const ap = s.player.actionPoints;
    const spent = ap.current < ap.max || s.meta.activePhase === 'AUTOPSY';
    const target = spent ? s.meta.turnNumber : s.meta.turnNumber - 1;
    if (target < 1) { this.hint('Nothing to undo', 'warn'); return; }
    this.tool = null;
    this._clearPath();
    this.bus.emit('REWIND_REQUESTED', { turn: target });
  }

  dispose() {
    this._clearPath();
    for (const off of this._offs) off();
    for (const off of this._dom) off();
    this._offs = []; this._dom = [];
    this.el.innerHTML = '';
  }
}