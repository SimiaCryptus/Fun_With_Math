import { EventBus } from './EventBus.js';
import { GameState } from './GameState.js';
import { TurnManager } from './TurnManager.js';
import { HazardManager } from '../hazards/HazardManager.js';
import { NPCManager } from '../social/NPCManager.js';
import { SceneRenderer } from '../render/SceneRenderer.js';
import { HUDController } from '../ui/HUDController.js';
import { ActionPalette } from '../ui/ActionPalette.js';
import { DialogOverlay } from '../ui/DialogOverlay.js';
import { AutopsyView } from '../ui/AutopsyView.js';

export class Engine {
  /**
   * @param {HTMLElement} container - Canvas mounting target
   * @param {Object} scenarioData - Validated + normalized scenario
   */
  constructor(container, scenarioData) {
    this.container = container;
    this.scenario = scenarioData;
    this.eventBus = new EventBus();
    this.state = new GameState(scenarioData);
    this.hazardManager = new HazardManager(this.state, this.eventBus);
    this.npcManager = new NPCManager(this.state, this.eventBus);
    this.turnManager = new TurnManager(this.state, this.eventBus, { hazardManager: this.hazardManager, npcManager: this.npcManager });
    this.renderer = new SceneRenderer(container, this.state, this.eventBus);
    this.hud = new HUDController(document.getElementById('sim-app'), this.state, this.eventBus);
    this.actionPalette = new ActionPalette(document.getElementById('action-palette'), this.state, this.eventBus);
    this.dialogOverlay = new DialogOverlay(document.getElementById('dialog-overlay-layer'), this.state, this.eventBus);
    this.autopsy = new AutopsyView(document.getElementById('autopsy-modal'), this.state, this.eventBus, {
      simulate: (snapshot, turns, mutate) => TurnManager.simulateFrom(this.scenario, snapshot, turns, mutate),
    });
    this._bindEvents();
  }

  async init() {
    await this.renderer.init();
    this.renderer.buildMapFromState();
    this.turnManager.startScenario();
    this._startRenderLoop();
    this.eventBus.emit('ENGINE_INITIALIZED', { scenarioId: this.state.meta.scenarioId });
  }

  _startRenderLoop() {
    let last = performance.now();
    const loop = (ts) => {
      const dt = Math.min(0.1, (ts - last) / 1000);
      last = ts;
      this.renderer.render(ts, dt);
      this.dialogOverlay.update((pos) => this.renderer.projectToScreen(pos));
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  dispatchPlayerAction(actionDescriptor) {
    if (this.state.meta.activePhase !== 'PLAYER_INPUT') {
      this.eventBus.emit('ACTION_REJECTED', { action: actionDescriptor, reason: 'Not in PLAYER_INPUT phase' });
      return false;
    }
    return this.turnManager.processPlayerAction(actionDescriptor);
  }

  _bindEvents() {
    const bus = this.eventBus;
    bus.on('PLAYER_ACTION_REQUESTED', (a) => this.dispatchPlayerAction(a));
    bus.on('STEP_TURN_REQUESTED', () => this.turnManager.commitTurn());
    bus.on('REWIND_REQUESTED', ({ turn }) => this.turnManager.rewindTo(turn));
    bus.on('STATE_CHANGED', () => this.renderer.syncFromState());
    bus.on('VIEW_FLOOR_REQUESTED', ({ delta }) => this.renderer.changeViewFloor(delta));
  }

  destroy() {
    cancelAnimationFrame(this.animFrameId);
    this.actionPalette.dispose();
    this.dialogOverlay.dispose();
    this.autopsy.dispose();
    this.hud.dispose();
    this.renderer.dispose();
    this.eventBus.clear();
  }
}