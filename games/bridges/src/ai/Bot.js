import { chooseMove } from './search.js';

const BUDGET_MS = { easy: 0, medium: 250, hard: 1500 };

/**
 * Main-thread facade over the bot worker.  If module workers are unavailable
 * (e.g. some `file://` setups) it thinks on the main thread with a smaller budget.
 */
export class Bot {
  constructor() {
    this.worker = null;
    this.pending = new Map();
    this.nextId = 1;
    this._spawn();
  }

  _spawn() {
    try {
      const w = new Worker(new URL('./bot.worker.js', import.meta.url), { type: 'module' });
      w.onmessage = ({ data }) => {
        const p = this.pending.get(data.id);
        if (!p) return;
        this.pending.delete(data.id);
        data.error ? p.reject(new Error(data.error)) : p.resolve(data.move);
      };
      w.onerror = err => {
        console.warn('[bridges] bot worker unavailable, thinking on the main thread', err?.message ?? err);
        this.worker = null;
        for (const p of this.pending.values()) p.reject(new Error('worker failed'));
        this.pending.clear();
      };
      this.worker = w;
    } catch {
      this.worker = null;
    }
  }

  /** Resolves to a cell id, `SWAP`, or `null`. */
  async choose(game, config, level) {
    const budgetMs = BUDGET_MS[level] ?? 250;
    const seed = (Math.random() * 2 ** 31) | 0;
    if (this.worker) {
      try {
        return await this._remote({ config, moves: [...game.moves], level, budgetMs, seed });
      } catch { /* fall back below */ }
    }
    await new Promise(r => setTimeout(r, 20)); // let the UI paint the "thinking" state first
    return chooseMove(game, { level, budgetMs: Math.min(budgetMs, 600), seed });
  }

  _remote(msg) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, ...msg });
    });
  }
}