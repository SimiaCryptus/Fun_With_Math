export class Notify {
  constructor(el) { this.el = el; this._lastLive = 0; }
  show(msg, { kind = 'info', timeout = 3500 } = {}) {
    const t = document.createElement('div'); t.className = `toast ${kind}`; t.textContent = msg; this.el.appendChild(t);
    if (timeout) setTimeout(() => t.remove(), timeout); return t;
  }
  /** Persistent definition popover; click to dismiss. */
  popover(title, body) {
    const t = document.createElement('div'); t.className = 'toast pop';
    t.innerHTML = `<h4></h4><pre></pre>`; t.querySelector('h4').textContent = title; t.querySelector('pre').textContent = body;
    t.addEventListener('click', () => t.remove()); this.el.appendChild(t); return t;
  }
}