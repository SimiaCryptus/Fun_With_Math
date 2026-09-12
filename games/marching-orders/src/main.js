import { Renderer } from './engine/renderer.js';
import { Input } from './engine/input.js';
import { loadLevel, buildWorld, decodeLevelHash } from './world/level-loader.js';
import { Simulation, GAME_STATUS } from './simulation.js';
import { Hud } from './ui/hud.js';
import { Editor } from './ui/editor.js';
import { EQUIPMENT } from './items/equipment.js';
import { SIGNS } from './items/sign.js';
import { ROLES } from './units/roles/index.js';
import { DIR_LABELS, turnRight } from './units/pathing.js';

// Fixed-timestep simulation decoupled from the render frame rate (idea.md §6).
const FIXED_DT = 1 / 60;
const MAX_STEPS_PER_FRAME = 8;
const SPEEDS = [1, 2, 4];
const DEFAULT_LEVEL_URL = new URL('./levels/tutorial-outpost.json', import.meta.url);

const MODE = Object.freeze({ PLAY: 'play', EDIT: 'edit' });

/** Player palette: crates, then signs, then roles — hotkeys 1..9 in that order. */
const TOOLS = [
  ...Object.entries(EQUIPMENT).map(([key, def]) => ({ id: `crate:${key}`, kind: 'crate', key, label: def.label, color: def.color })),
  ...Object.entries(SIGNS).map(([key, def]) => ({ id: `sign:${key}`, kind: 'sign', key, label: def.label, color: def.color })),
  ...Object.entries(ROLES).map(([key, role]) => ({ id: `role:${key}`, kind: 'role', key, label: role.label, color: role.color })),
].map((t, i) => ({ ...t, hotkey: String((i + 1) % 10) }));

const DEFAULT_HINT =
  'Pick a tool (1-9), then click the map. Q rotates sign facing; right-click or shift-click a placed sign to pick it up. E opens the level designer.';

/**
 * Startup options from the page URL:
 *   ?level=<url>     fetch a level JSON file (relative or absolute URL)
 *   #level=<data>    play a level embedded in the URL (created by the designer's "Copy play link")
 *   ?edit  /  #edit  open the level designer instead of playing
 */
function readStartupOptions() {
  const query = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  return {
    levelUrl: query.get('level'),
    levelData: hash.get('level'),
    edit: query.has('edit') || hash.has('edit'),
  };
}

class Game {
  constructor(appRoot, hudRoot, editorRoot) {
    this.renderer = new Renderer(appRoot);
    this.hud = new Hud(hudRoot, {
      tools: TOOLS,
      onSelectTool: (id) => this.selectTool(this.tool && this.tool.id === id ? null : id),
      onRestart: () => this.reset({ keepCamera: true }),
      onTogglePause: () => this.togglePause(),
      onToggleIso: () => this.toggleIso(),
      onCycleSpeed: () => this.cycleSpeed(),
      onOpenEditor: () => this.openEditor(),
    });
    this.editor = new Editor(editorRoot, this.renderer, {
      onPlay: (level) => this.playLevel(level, { keepCamera: true }),
    });
    this.input = new Input(this.renderer, {
      onClick: (hit, e) => this.onClick(hit, e),
      onRightClick: (hit, e) => this.onRightClick(hit, e),
      onHover: (hit) => this.onHover(hit),
      onKey: (e) => this.onKey(e),
    });

    this.mode = MODE.PLAY;
    this.level = null;
    this.world = null;
    this.sim = null;
    this.tool = null;
    this.hover = null;
    this.paused = false;
    this.speedIndex = 0;
    this.iso = false;
    this.accumulator = 0;
    this.lastTime = performance.now();
    this.ended = false;
    this.signDir = 0; // facing given to the next sign placed (DIRS index)

    this.hud.setHint(DEFAULT_HINT);
  }

  async start() {
    const opts = readStartupOptions();
    let level = null;
    let warning = null;
    try {
      if (opts.levelData) level = decodeLevelHash(opts.levelData);
      else if (opts.levelUrl) level = await loadLevel(new URL(opts.levelUrl, location.href));
    } catch (err) {
      console.error(err);
      warning = `Could not load the requested level: ${err.message}. Loaded the tutorial instead.`;
    }
    this.level = level || (await loadLevel(DEFAULT_LEVEL_URL));

    if (opts.edit) this.openEditor();
    else this.reset();
    if (warning) this.notify(warning, 8000);
    requestAnimationFrame((t) => this.loop(t));
  }

  notify(text, ms = 3000) {
    if (this.mode === MODE.EDIT) this.editor.setStatus(text);
    else this.hud.showToast(text, ms);
  }

  reset({ keepCamera = false } = {}) {
    this.world = buildWorld(this.level);
    this.sim = new Simulation(this.world, this.level);
    this.renderer.setWorld(this.world, { resetCamera: !keepCamera });
    this.renderer.setupLevel(this.sim);
    this.accumulator = 0;
    this.ended = false;
    this.paused = false;
    this.signDir = this.sim.spawn.dir;
    this.hud.hideEnd();
    this.hud.setPaused(false);
    this.hud.showToast(this.level.description || `Level: ${this.level.name}`, 6000);
  }

  // ---- modes ----------------------------------------------------------------------

  /** Play any (validated) level object — used by the designer's Play button. */
  playLevel(level, { keepCamera = false } = {}) {
    this.level = level;
    this.mode = MODE.PLAY;
    this.editor.close();
    this.hud.setVisible(true);
    this.hud.setHint(DEFAULT_HINT);
    this.reset({ keepCamera });
  }

  openEditor() {
    if (this.mode === MODE.EDIT) return;
    this.mode = MODE.EDIT;
    this.selectTool(null);
    this.renderer.setCursor(null);
    this.hud.setVisible(false);
    this.editor.open(this.level, { keepCamera: !!this.sim });
  }

  // ---- frame ----------------------------------------------------------------------

  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const frameDt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;

    const editing = this.mode === MODE.EDIT;
    const sim = editing ? this.editor.sim : this.sim;
    const world = editing ? this.editor.world : this.world;

    if (!editing) {
      if (!this.paused) this.accumulator += frameDt * SPEEDS[this.speedIndex];
      let steps = 0;
      while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
        sim.step(FIXED_DT);
        this.accumulator -= FIXED_DT;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0; // drop backlog instead of spiralling
    }

    if (world) this.renderer.syncWorld(world);
    if (sim) {
      this.renderer.syncUnits(sim);
      this.renderer.consumeEvents(sim.events);
      sim.events.length = 0;
    }
    this.renderer.update(frameDt);
    this.renderer.render();

    if (editing || !sim) return;
    this.hud.update(sim, (tool) => sim.budgetFor(tool.kind, tool.key));
    if (sim.status !== GAME_STATUS.PLAYING && !this.ended) {
      this.ended = true;
      this.selectTool(null);
      this.hud.showEnd(sim.status, sim);
    }
  }

  // ---- player interaction -------------------------------------------------

  selectTool(id) {
    this.tool = id ? TOOLS.find((t) => t.id === id) || null : null;
    this.hud.setTool(this.tool ? this.tool.id : null);
    if (this.mode === MODE.PLAY) this.onHover(this.hover);
  }

  rotateSignDir() {
    this.signDir = turnRight(this.signDir);
    this.hud.showToast(`Next sign faces ${DIR_LABELS[this.signDir]}.`, 1200);
    this.onHover(this.hover);
  }

  findTroopFromHit(hit) {
    if (!hit || !this.sim) return null;
    if (hit.type === 'unit') return hit.batch === 'troops' && hit.unit && hit.unit.alive ? hit.unit : null;
    if (hit.type === 'voxel') return this.sim.troopAt(hit.adjacent) || this.sim.troopAt(hit.cell);
    return null;
  }

  /** The placed sign under the cursor: hit directly, or standing on the floor cell that was hit. */
  signFromHit(hit) {
    if (!hit || !this.sim) return null;
    if (hit.type === 'sign') return this.sim.signById(hit.id);
    if (hit.type === 'voxel') return this.sim.signAt(hit.adjacent);
    return null;
  }

  onHover(hit) {
    if (this.mode === MODE.EDIT) { this.editor.onHover(hit); return; }
    this.hover = hit;
    const sim = this.sim;
    if (!hit || !sim || sim.status !== GAME_STATUS.PLAYING) {
      this.renderer.setCursor(null);
      this.hud.setHint(DEFAULT_HINT);
      return;
    }
    const sign = this.signFromHit(hit);
    const top = hit.type === 'voxel' && hit.normal.y > 0.5;

    if (!this.tool) {
      if (sign) {
        this.renderer.setCursor(sign.cell, 0xffd75a);
        const facing = sign.def.directional ? ` facing ${DIR_LABELS[sign.dir]}` : '';
        this.hud.setHint(`${sign.def.label}${facing} — right-click or shift-click to pick it up`);
      } else {
        this.renderer.setCursor(null);
        this.hud.setHint(DEFAULT_HINT);
      }
      return;
    }

    const label = this.tool.label;
    if (this.tool.kind === 'crate') {
      if (top) {
        const ok = sim.canPlaceCrate(this.tool.key, hit.adjacent);
        this.renderer.setCursor(hit.adjacent, ok ? 0x7cff7c : 0xff6a6a);
        this.hud.setHint(ok ? `Place ${label} here` : `Can't place ${label} here`);
      } else {
        this.renderer.setCursor(null);
        this.hud.setHint(`Click the top of a floor voxel to drop a ${label}`);
      }
    } else if (this.tool.kind === 'sign') {
      if (sign) {
        const rotatable = sign.kind === this.tool.key && sign.def.directional;
        this.renderer.setCursor(sign.cell, rotatable ? 0xffd75a : 0xff6a6a);
        this.hud.setHint(rotatable
          ? `Click to rotate this ${label} (facing ${DIR_LABELS[sign.dir]}); right-click or shift-click picks it up`
          : `${sign.def.label} here — right-click or shift-click to pick it up`);
      } else if (top) {
        const ok = sim.canPlaceSign(this.tool.key, hit.adjacent);
        this.renderer.setCursor(hit.adjacent, ok ? 0x7cff7c : 0xff6a6a);
        const facing = SIGNS[this.tool.key].directional ? ` facing ${DIR_LABELS[this.signDir]} (Q rotates)` : '';
        this.hud.setHint(ok ? `Place ${label} here${facing} — ${SIGNS[this.tool.key].describe}` : `Can't place ${label} here`);
      } else {
        this.renderer.setCursor(null);
        this.hud.setHint(`Click the top of a floor voxel to plant a ${label}`);
      }
    } else {
      const troop = this.findTroopFromHit(hit);
      if (troop) {
        this.renderer.setCursor(troop.cell, 0xffd75a);
        this.hud.setHint(`Assign ${label} to troop #${troop.id}`);
      } else {
        this.renderer.setCursor(null);
        this.hud.setHint(`Click a troop (or the voxel it stands on) to make it a ${label}`);
      }
    }
  }

  onClick(hit, e) {
    if (this.mode === MODE.EDIT) { this.editor.onClick(hit, e); return; }
    const sim = this.sim;
    if (!hit || !sim || sim.status !== GAME_STATUS.PLAYING) return;
    if (e && e.shiftKey) { this.pickUpSign(hit); return; }
    if (!this.tool) {
      this.hud.showToast('Select a tool first (keys 1-9). Right-click or shift-click a sign to pick it up.', 2000);
      return;
    }
    const top = hit.type === 'voxel' && hit.normal.y > 0.5;
    let placed = false;
    if (this.tool.kind === 'crate') {
      if (top) placed = sim.placeCrate(this.tool.key, hit.adjacent);
      if (!placed) this.hud.showToast(`Can't place a ${this.tool.label} there.`, 1500);
    } else if (this.tool.kind === 'sign') {
      const sign = this.signFromHit(hit);
      if (sign) {
        if (sign.kind === this.tool.key && sign.def.directional) sim.rotateSign(sign);
        else this.hud.showToast(`There is already a ${sign.def.label} here — right-click or shift-click to pick it up.`, 2000);
      } else if (top) {
        placed = sim.placeSign(this.tool.key, hit.adjacent, this.signDir);
        if (!placed) this.hud.showToast(`Can't plant a ${this.tool.label} there.`, 1500);
      } else {
        this.hud.showToast('Click the top of a floor voxel to plant a sign.', 1500);
      }
    } else {
      const troop = this.findTroopFromHit(hit);
      placed = troop ? sim.assignRole(troop, this.tool.key) : false;
      if (!placed) this.hud.showToast(troop ? `Can't assign ${this.tool.label} right now.` : 'No troop there.', 1500);
    }
    if (placed && sim.budgetFor(this.tool.kind, this.tool.key) <= 0) this.selectTool(null);
    this.onHover(hit);
  }

  onRightClick(hit) {
    if (this.mode === MODE.EDIT) return;
    this.pickUpSign(hit);
  }

  /** Signs go back to the inventory at no cost. */
  pickUpSign(hit) {
    const sim = this.sim;
    if (!hit || !sim || sim.status !== GAME_STATUS.PLAYING) return;
    const sign = this.signFromHit(hit);
    if (!sign) { this.hud.showToast('No sign there to pick up.', 1500); return; }
    sim.pickUpSign(sign);
    this.signDir = sign.dir; // re-placing it keeps the facing unless you rotate
    this.hud.showToast(`${sign.def.label} returned to inventory.`, 1500);
    this.onHover(hit);
  }

  onKey(e) {
    if (this.mode === MODE.EDIT) {
      if (this.editor.onKey(e)) return;
      if (e.code === 'KeyI') this.toggleIso();
      return;
    }
    const tool = TOOLS.find((t) => t.hotkey === e.key);
    if (tool) { this.selectTool(this.tool && this.tool.id === tool.id ? null : tool.id); return; }
    switch (e.code) {
      case 'Escape': this.selectTool(null); break;
      case 'Space': e.preventDefault(); this.togglePause(); break;
      case 'KeyF': this.cycleSpeed(); break;
      case 'KeyI': this.toggleIso(); break;
      case 'KeyR': this.reset({ keepCamera: true }); break;
      case 'KeyE': this.openEditor(); break;
      case 'KeyQ': this.rotateSignDir(); break;
      default: break;
    }
  }

  togglePause() {
    this.paused = !this.paused;
    this.hud.setPaused(this.paused);
  }

  cycleSpeed() {
    this.speedIndex = (this.speedIndex + 1) % SPEEDS.length;
    this.hud.setSpeed(SPEEDS[this.speedIndex]);
  }

  toggleIso() {
    this.iso = !this.iso;
    this.renderer.setIsometric(this.iso);
    this.hud.setIso(this.iso);
  }
}

const game = new Game(
  document.getElementById('app'),
  document.getElementById('hud'),
  document.getElementById('editor'),
);
game.start().catch((err) => {
  console.error(err);
  document.getElementById('hud').innerHTML =
    `<div class="panel" style="top:12px;left:12px">Failed to start: ${err.message}<br>` +
    'Serve this folder over HTTP (e.g. <code>npx serve .</code>) — ES modules and level fetching do not work from file://.</div>';
});