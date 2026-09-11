import { smokeDensityAt } from '../spatial/LineOfSight.js';

export const BASE_AP = 4;
export const ACTION_COSTS = {
  MOVE: 1, TOGGLE_DOOR: 1, OPEN_DOOR: 1, CLOSE_DOOR: 1, CHECK_DOOR: 1, BARRICADE: 2,
  CLEAR_DEBRIS: 2, DEESCALATE: 1, ASSIST: 2, SOUND_ALARM: 1, WAIT: 0,
};

/** Action Point ledger: base 4 AP, reduced by inhalation/injury debuffs; movement cost rises in smoke or when carrying. */
export class ActionEconomy {
  constructor(state) { this.state = state; }

  computeMaxAP() {
    const ps = this.state.player.physicalState;
    let max = BASE_AP;
    if (ps.exposure === 'MILD' || ps.exposure === 'HEAVY') max -= 1;
    if (ps.injured) max -= 1;
    return Math.max(1, max);
  }

  moveCost({ diagonal = false, destKey = null } = {}) {
    const ps = this.state.player.physicalState;
    let cost = diagonal ? 2 : 1;
    if (destKey && smokeDensityAt(this.state, destKey) > 0.2) cost = Math.max(cost, 2);
    if (ps.exposure === 'HEAVY') cost *= 2;
    if (ps.carrying) cost += 1;
    return cost;
  }

  cost(type, ctx = {}) {
    if (type === 'MOVE') return this.moveCost(ctx);
    return ACTION_COSTS[type] ?? 1;
  }

  canAfford(cost) { return this.state.player.actionPoints.current >= cost; }

  spend(cost) { this.state.player.actionPoints.current -= cost; }

  resetForTurn() {
    const ap = this.state.player.actionPoints;
    ap.max = this.computeMaxAP();
    ap.current = ap.max;
  }
}