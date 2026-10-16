import { PRESETS } from '../state.js';

export function bindPanel(store, h) {
  const $ = (id) => document.getElementById(id);
  const word = $('word'), n = $('n'), m = $('m'), cuts = $('cuts'), preset = $('preset');
  const debounce = (f, ms) => { let t; return () => { clearTimeout(t); t = setTimeout(f, ms); }; };

  preset.innerHTML = '<option value="">— choose —</option>' +
    PRESETS.map((p, i) => `<option value="${i}">${p.name}</option>`).join('');
  preset.addEventListener('change', () => {
    if (preset.value !== '') store.set({ ...PRESETS[+preset.value].state, sliced: false });
    preset.value = '';
  });
  word.addEventListener('input', debounce(() => store.set({ word: word.value }), 250));
  cuts.addEventListener('input', debounce(() => store.set({ cuts: cuts.value }), 300));
  n.addEventListener('change', () => store.set({ n: +n.value }));
  m.addEventListener('change', () => store.set({ m: +m.value }));
  $('slice').onclick = h.onSlice;
  $('explode').addEventListener('input', (e) => h.onExplode(+e.target.value));
  $('xray').addEventListener('change', (e) => h.onXray(e.target.checked));
  $('advanced').addEventListener('change', (e) => h.onAdvanced(e.target.checked));
  $('undo').onclick = () => store.undo();
  $('redo').onclick = () => store.redo();
  $('share').onclick = h.onShare;
  document.querySelectorAll('[data-export]').forEach((b) => { b.onclick = () => h.onExport(b.dataset.export); });

  return {
    sync(st) {
      if (document.activeElement !== word) word.value = st.word;
      if (document.activeElement !== cuts) cuts.value = st.cuts;
      n.value = st.n;
      m.value = st.m;
      $('slice').textContent = st.sliced ? 'Unslice ↺' : 'Slice ✂';
      $('orient').textContent = st.m % 2 === 0 ? 'Carrier: orientable cylinder' : 'Carrier: Möbius (non-orientable)';
    },
    setError(msg) { $('error').textContent = msg || ''; },
    setExplode(v) { $('explode').value = v; },
  };
}