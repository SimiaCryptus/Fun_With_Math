/** Time-series buffers with CSV/JSON export. */
export class Recorder {
  constructor(cap = 4000) { this.cap = cap; this.rows = []; this.keys = new Set(['t']); }
  reset() { this.rows = []; }
  push(row) { for (const k in row) this.keys.add(k); this.rows.push(row); if (this.rows.length > this.cap) this.rows.shift(); }
  series(key) { return { x: this.rows.map((r) => r.t), y: this.rows.map((r) => r[key] ?? NaN) }; }
  toCSV() { const keys = [...this.keys]; return [keys.join(','), ...this.rows.map((r) => keys.map((k) => (r[k] == null ? '' : typeof r[k] === 'number' ? r[k].toPrecision(7) : r[k])).join(','))].join('\n'); }
  toJSON() { return JSON.stringify({ keys: [...this.keys], rows: this.rows }); }
}