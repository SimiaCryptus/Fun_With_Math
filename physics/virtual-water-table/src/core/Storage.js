const PREFIX = 'cg:slot:';
export function listSlots() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(PREFIX)) { try { const v = JSON.parse(localStorage.getItem(k)); out.push({ name: k.slice(PREFIX.length), savedAt: v.savedAt, score: v.score }); } catch { /* skip */ } } }
  return out.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}
export function saveSlot(name, state) { localStorage.setItem(PREFIX + name, JSON.stringify({ ...state, savedAt: Date.now() })); }
export function loadSlot(name) { const v = localStorage.getItem(PREFIX + name); return v ? JSON.parse(v) : null; }
export function deleteSlot(name) { localStorage.removeItem(PREFIX + name); }
export function exportJSON(state) { return JSON.stringify({ format: 'cg-design-1', ...state }, null, 1); }
export function importJSON(text) { const o = JSON.parse(text); if (o.format !== 'cg-design-1') throw new Error('not a Chaos Garden design'); return o; }
export function download(filename, text, mime = 'text/plain') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}