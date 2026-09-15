export function showGameOver({ title, text }, { onNew, onClose }) {
  const el = document.getElementById('gameover');
  el.querySelector('#gameover-title').textContent = title;
  el.querySelector('#gameover-text').textContent = text;
  el.classList.remove('hidden');
  el.querySelector('#gameover-new').onclick = () => { el.classList.add('hidden'); onNew?.(); };
  el.querySelector('#gameover-close').onclick = () => { el.classList.add('hidden'); onClose?.(); };
}

export function confirmDialog(text) {
  return new Promise((resolve) => {
    const el = document.getElementById('confirm');
    el.querySelector('#confirm-text').textContent = text;
    el.classList.remove('hidden');
    const done = (v) => { el.classList.add('hidden'); resolve(v); };
    el.querySelector('#confirm-ok').onclick = () => done(true);
    el.querySelector('#confirm-cancel').onclick = () => done(false);
  });
}