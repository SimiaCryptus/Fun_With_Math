/** Ring-buffer diagnostics, exportable as JSON. */
export class Log {
  constructor(cap = 500) { this.cap = cap; this.buf = []; this.i = 0; }
  push(level, msg, data) {
    const e = { t: Date.now(), level, msg, data: data === undefined ? undefined : safe(data) };
    if (this.buf.length < this.cap) this.buf.push(e); else { this.buf[this.i] = e; this.i = (this.i + 1) % this.cap; }
    if (level === 'error') console.error(msg, data); else if (level === 'warn') console.warn(msg, data);
  }
  info(m, d) { this.push('info', m, d); }
  warn(m, d) { this.push('warn', m, d); }
  error(m, d) { this.push('error', m, d); }
  entries() { return this.buf.slice(this.i).concat(this.buf.slice(0, this.i)); }
  export() { return JSON.stringify(this.entries(), null, 1); }
}
function safe(d) { try { return JSON.parse(JSON.stringify(d)); } catch { return String(d); } }
export const log = new Log();