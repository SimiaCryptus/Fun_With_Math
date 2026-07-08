// Game orchestrates the model, rules, input, scoring and rendering.
//
// For Milestones 0-3 this covers:
//  - static board render
//  - selection & input
//  - rule evaluation (sum equals) with clear-on-success feedback
//
// Gravity/refill (Milestone 4) is not yet wired; cleared tiles are simply
// removed and re-filled in place with fresh values so play can continue.

import { Board } from '../model/Board.js';
import { Tile } from '../model/Tile.js';
import { RuleEngine } from '../rules/RuleEngine.js';
import { sumEquals } from '../rules/rules/sumEquals.js';
import { Selection } from '../input/Selection.js';
import { InputController } from '../input/InputController.js';
import { ScoreManager } from './ScoreManager.js';
import { Renderer } from '../render/Renderer.js';
import { keyOf, coordKey } from '../model/coords.js';

export class Game {
  constructor(canvas, config = {}) {
    console.log('[Game] Initializing with config:', config);
    this.canvas = canvas;

    const {
      cols = 8,
      rows = 9,
      size = 28,
      valueRange = [1, 9],
      rule = sumEquals(10),
      minSelection = 2,
      maxSelection = 4,
    } = config;

    this.board = new Board({ cols, rows, size, valueRange });

    // Size the canvas to comfortably fit the configured grid.
    const bounds = this.board.grid.pixelBounds ? this.board.grid.pixelBounds() : null;
    if (bounds) {
      canvas.width = Math.ceil(bounds.width);
      canvas.height = Math.ceil(bounds.height);
    }
    this.board.grid.layout(canvas.width, canvas.height);

    this.rules = new RuleEngine(rule);
    this.selection = new Selection({
      minLength: minSelection,
      maxLength: maxSelection,
    });
    this.score = new ScoreManager();
    this.renderer = new Renderer(canvas, this.board);

    this.input = new InputController(canvas, this.board, {
      onStart: (coord) => this._onStart(coord),
      onMove: (coord) => this._onMove(coord),
      onEnd: () => this._onEnd(),
    });

    // DOM hooks (optional).
    this.scoreEl = document.getElementById('score');
    this.ruleDescEl = document.getElementById('rule-desc');
    this.indicatorEl = document.getElementById('indicator');

    if (this.ruleDescEl) this.ruleDescEl.textContent = this.rules.description;

    this._flashUntil = 0;
    this._flashCoords = [];

    this._draw();
  }

  _selectionTiles() {
    return this.selection.coords.map((c) => this.board.getTile(c)).filter(Boolean);
  }

  _onStart(coord) {
    console.log('[Game] Selection start at coord:', coord);
    this.selection.clear();
    this.selection.add(coord);
    this._updateIndicator();
    this._draw();
  }

  _onMove(coord) {
    // Allow drag-back to remove the last tile.
    if (this.selection.tryBacktrack(coord)) {
      console.log('[Game] Backtracked to coord:', coord);
      this._updateIndicator();
      this._draw();
      return;
    }
    if (this.selection.add(coord)) {
      console.log('[Game] Added coord to selection:', coord, '- length:', this.selection.length);
      this._updateIndicator();
      this._draw();
    }
  }

  _onEnd() {
    const tiles = this._selectionTiles();
    const longEnough = this.selection.hasValidLength();
    const result = longEnough ? this.rules.evaluate(tiles) : { valid: false };
    console.log(
      '[Game] Selection end - coords:',
      this.selection.coords,
      'longEnough:',
      longEnough,
      'valid:',
      result.valid
    );

    if (result.valid) {
      this._resolveClear(this.selection.coords.slice());
    } else if (!this.selection.isEmpty()) {
      this._rejectFeedback();
    }

    this.selection.clear();
    this._updateIndicator();
    this._draw();
  }

  _resolveClear(coords) {
    const gained = this.score.scoreClear(coords.length);
    console.log(
      '[Game] Clear resolved - cleared',
      coords.length,
      'tiles, gained',
      gained,
      'points, total score:',
      this.score.score
    );
    // Milestone 3 behavior: replace cleared tiles in place with new
    // values (gravity & refill arrive in Milestone 4).
    for (const coord of coords) {
      const key = coordKey(coord);
      const value = this._randomValue();
      this.board.tiles.set(key, new Tile(value, coord));
    }
    if (this.scoreEl) this.scoreEl.textContent = String(this.score.score);
    this._showIndicator(`+${gained}`, 'valid');
  }

  _randomValue() {
    const [min, max] = this.board.valueRange;
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  _rejectFeedback() {
    console.log('[Game] Selection rejected - no match');
    this._showIndicator('No match', 'invalid');
  }

  _updateIndicator() {
    const tiles = this._selectionTiles();
    if (tiles.length === 0) {
      this._showIndicator('\u00a0', '');
      return;
    }
    const sum = tiles.reduce((a, t) => a + t.value, 0);
    this._showIndicator(`Sum: ${sum}`, '');
  }

  _showIndicator(text, cls) {
    if (!this.indicatorEl) return;
    this.indicatorEl.textContent = text;
    this.indicatorEl.className = cls || '';
  }

  _draw() {
    this.renderer.render(this.selection.coords);
  }

  destroy() {
    this.input.destroy();
  }
}
