/**
 * speech.js — SpeechRecognition wrapper + normalisation (§4.3).
 *
 * Events: 'state' {state}, 'interim' {text}, 'final' {tokens}
 * Never auto-starts (browsers require a gesture, and hot mics are hostile).
 */

const SR = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;

/** Common ASR slips worth trying as alternatives. */
const HOMOPHONES = new Map(Object.entries({
  to: ['too', 'two'], too: ['to', 'two'], two: ['to', 'too'],
  for: ['four', 'fore'], four: ['for', 'fore'], fore: ['for', 'four'],
  ate: ['eight'], eight: ['ate'],
  won: ['one'], one: ['won'],
  sea: ['see'], see: ['sea'],
  bear: ['bare'], bare: ['bear'],
  their: ['there'], there: ['their'],
  knight: ['night'], night: ['knight'],
  right: ['write', 'rite'], write: ['right', 'rite'],
  hour: ['our'], our: ['hour'],
  new: ['knew'], knew: ['new'],
  sun: ['son'], son: ['sun'],
  week: ['weak'], weak: ['week'],
}));

const DIGITS = new Map(Object.entries({
  0: 'zero', 1: 'one', 2: 'two', 3: 'three', 4: 'four',
  5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine',
}));

/** lowercase, fold accents, expand digits, strip everything else. */
export function normalise(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[0-9]/g, (d) => ` ${DIGITS.get(d) ?? ''} `)
    .replace(/[^a-z\s]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function tokenise(text) {
  const n = normalise(text);
  return n ? n.split(' ') : [];
}

/** The token plus its homophone alternatives, in try-order. */
export function variantsFor(token) {
  const t = normalise(token).replace(/\s/g, '');
  return t ? [t, ...(HOMOPHONES.get(t) ?? [])] : [];
}

export class Speech extends EventTarget {
  static get supported() { return !!SR; }

  constructor({ lang = 'en-US' } = {}) {
    super();
    this.lang = lang;
    this.state = 'off';
    this.rec = null;
    this._wantOn = false;
  }

  toggle() {
    return this.state === 'listening' ? this.stop() : this.start();
  }

  start() {
    if (!SR) return this._setState('error');
    if (this.state === 'listening') return;
    const rec = new SR();
    rec.lang = this.lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 3;

    rec.onstart = () => this._setState('listening');
    rec.onerror = (e) => {
      this._setState(e.error === 'no-speech' ? 'listening' : 'error');
    };
    rec.onend = () => {
      if (this._wantOn) {
        try { rec.start(); return; } catch { /* fall through */ }
      }
      this._setState('off');
    };
    rec.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        const text = r[0]?.transcript ?? '';
        if (r.isFinal) {
          const tokens = tokenise(text);
          if (tokens.length) this._emit('final', { tokens, text });
        } else {
          this._emit('interim', { text: normalise(text).split(' ').pop() ?? '' });
        }
      }
    };

    this.rec = rec;
    this._wantOn = true;
    try { rec.start(); } catch { this._setState('error'); }
  }

  stop() {
    this._wantOn = false;
    try { this.rec?.stop(); } catch { /* ignore */ }
    this._setState('off');
  }

  _setState(state) {
    if (this.state === state) return;
    this.state = state;
    this._emit('state', { state });
  }

  _emit(type, detail) {
    const e = new Event(type);
    e.detail = detail;
    this.dispatchEvent(e);
  }
}

export default Speech;