// State model: the single source of truth. The UI edits only this.

export const DEFAULT = { n: 3, word: '(s1 s2^-1)^2', m: 0, cuts: '', sliced: false };

export const PRESETS = [
  { name: 'Möbius bisection (m=1)', state: { n: 2, word: '', m: 1, cuts: '' } },
  { name: 'Trefoil (σ1³ / 3 half-twists)', state: { n: 2, word: '', m: 3, cuts: '' } },
  { name: 'Hopf link', state: { n: 2, word: '', m: 2, cuts: '' } },
  { name: 'Möbius trisection (n=3, m=3)', state: { n: 3, word: '', m: 3, cuts: '' } },
  { name: 'Borromean rings', state: { n: 3, word: '(s1 s2^-1)^3', m: 0, cuts: '' } },
  { name: 'Figure-eight', state: { n: 3, word: '(s1 s2^-1)^2', m: 0, cuts: '' } },
  { name: 'Twisted hyperbolic', state: { n: 3, word: '(s1 s2^-1)^2', m: 1, cuts: '' } },
  { name: 'Cascade: trefoil → bisect', state: { n: 2, word: '', m: 3, cuts: '2:' } },
  { name: 'Cascade: 3-cycle engine', state: { n: 3, word: '(s1 s2^-1)^2', m: 0, cuts: '3: s1 s2' } },
];

export function sanitize(s) {
  if (!s || typeof s !== 'object') return null;
  const n = Math.min(12, Math.max(1, Math.trunc(Number(s.n)) || DEFAULT.n));
  return {
    n,
    word: typeof s.word === 'string' ? s.word.slice(0, 2000) : '',
    m: Math.trunc(Number(s.m)) || 0,
    cuts: typeof s.cuts === 'string' ? s.cuts.slice(0, 500) : '',
    sliced: !!s.sliced,
  };
}

export class Store {
  constructor(init) {
    this.state = { ...init };
    this.past = [];
    this.future = [];
    this.subs = [];
  }
  subscribe(f) { this.subs.push(f); }
  emit() { for (const f of this.subs) f(this.state); }
  set(patch, { record = true } = {}) {
    const next = sanitize({ ...this.state, ...patch });
    if (JSON.stringify(next) === JSON.stringify(this.state)) return;
    if (record) {
      this.past.push(this.state);
      if (this.past.length > 200) this.past.shift();
      this.future = [];
    }
    this.state = next;
    this.emit();
  }
  undo() {
    if (!this.past.length) return;
    this.future.push(this.state);
    this.state = this.past.pop();
    this.emit();
  }
  redo() {
    if (!this.future.length) return;
    this.past.push(this.state);
    this.state = this.future.pop();
    this.emit();
  }
}