// ScoreManager: base points + length bonus.
// (Combo multiplier arrives in a later milestone.)

export class ScoreManager {
  constructor({ basePerTile = 10 } = {}) {
    this.basePerTile = basePerTile;
    this.score = 0;
  }

  // Score a cleared selection of length n.
  // Length bonus grows disproportionately with longer selections.
  scoreClear(n) {
    const base = n * this.basePerTile;
    const lengthBonus = base * (n - 1) * 0.5; // 0 for 1, scales up
    const gained = Math.round(base + lengthBonus);
    this.score += gained;
    return gained;
  }

  reset() {
    this.score = 0;
  }
}
