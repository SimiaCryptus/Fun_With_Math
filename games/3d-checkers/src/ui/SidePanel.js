import { RED, BLACK } from '../engine/Board.js';

/**
* Buttons that only the 0-player mode needs may be missing from the markup —
* create them next to Undo on demand so autoplay is always controllable.
*/
function ensureButton(id, text) {
  let btn = document.getElementById(id);
  if (btn) return btn;
  const undo = document.getElementById('btn-undo');
  const host = undo?.parentElement;
  if (!host) return null;
  btn = document.createElement('button');
  btn.id = id;
  btn.type = 'button';
  btn.textContent = text;
  btn.classList.add('hidden');
  host.insertBefore(btn, undo);
  return btn;
}

export function initSidePanel({
  bus, game, store, onPreview, onLive, onUndo, onResign, onDraw, onMenu, onToggleAuto, onStep,
}) {
  const cards = [document.getElementById('card-red'), document.getElementById('card-black')];
  const list = document.getElementById('move-list');
  const turnEl = document.getElementById('turn-indicator');
  const liveBtn = document.getElementById('btn-live');
  const autoBtn = ensureButton('btn-auto', '⏸ Pause');
  const stepBtn = ensureButton('btn-step', '⏭ Step');
  let previewIndex = -1;

  for (const card of cards) {
    const input = card.querySelector('input.name');
    input.addEventListener('change', () => store.set(input.dataset.key, input.value));
  }

  function update() {
    if (!game.state) return;
    const counts = game.counts();
    const sides = [counts.red, counts.black];
    cards.forEach((card, side) => {
      card.classList.toggle('active', game.status === 'playing' && game.state.turn === side);
      card.querySelector('.men').textContent = `men ${sides[side].men}`;
      card.querySelector('.kings').textContent = `kings ${sides[side].kings}`;
      card.querySelector('.captured').textContent = `captured ${sides[side].captured}`;
    });
    cards[RED].querySelector('input.name').value = store.get('redName') || 'Red';
    cards[BLACK].querySelector('input.name').value = store.get('blackName') || 'Black';
    const name = game.state.turn === RED ? store.get('redName') : store.get('blackName');
    const auto = game.config?.mode === 'auto';
    const suffix = auto && !game.autoPlay ? ' · paused' : '';
    turnEl.textContent = game.status === 'playing'
      ? `${name} to move · move ${Math.floor(game.history.length / 2) + 1}${suffix}`
      : 'Game over';
    if (autoBtn) {
      autoBtn.classList.toggle('hidden', !auto);
      autoBtn.textContent = game.autoPlay ? '⏸ Pause' : '▶ Play';
      autoBtn.disabled = game.status !== 'playing';
    }
    if (stepBtn) {
      stepBtn.classList.toggle('hidden', !auto || game.autoPlay);
      stepBtn.disabled = game.status !== 'playing';
    }
    // Resigning / agreeing a draw is meaningless with no human at the board.
    for (const id of ['btn-resign', 'btn-draw']) document.getElementById(id)?.classList.toggle('hidden', auto);
    renderMoves();
  }

  function renderMoves() {
    list.innerHTML = '';
    const h = game.history;
    for (let i = 0; i < h.length; i += 2) {
      const li = document.createElement('li');
      for (let j = i; j < Math.min(i + 2, h.length); j++) {
        const span = document.createElement('span');
        span.textContent = h[j].notation;
        span.title = 'Click to preview this position';
        if (j === previewIndex || (previewIndex < 0 && j === h.length - 1)) span.classList.add('current');
        span.addEventListener('click', () => {
          previewIndex = j === h.length - 1 ? -1 : j;
          liveBtn.classList.toggle('hidden', previewIndex < 0);
          if (previewIndex < 0) onLive(); else onPreview(j);
          renderMoves();
        });
        li.appendChild(span);
      }
      list.appendChild(li);
    }
    list.scrollTop = list.scrollHeight;
  }

  liveBtn.addEventListener('click', () => { previewIndex = -1; liveBtn.classList.add('hidden'); onLive(); renderMoves(); });
  autoBtn?.addEventListener('click', () => { onToggleAuto?.(); update(); });
  stepBtn?.addEventListener('click', () => { onStep?.(); update(); });
  document.getElementById('btn-undo').addEventListener('click', onUndo);
  document.getElementById('btn-resign').addEventListener('click', onResign);
  document.getElementById('btn-draw').addEventListener('click', onDraw);
  document.getElementById('btn-menu').addEventListener('click', onMenu);

  const resetPreview = () => { previewIndex = -1; liveBtn.classList.add('hidden'); };
  bus.on('newGame', () => { resetPreview(); update(); });
  bus.on('turnChanged', update);
  bus.on('undone', () => { resetPreview(); update(); });
  bus.on('gameOver', update);
  bus.on('autoplay', update);
  bus.on('aiThinking', ({ player }) => { cards[player].classList.add('thinking'); cards[player].querySelector('.depth').textContent = ''; });
  bus.on('aiProgress', ({ depth, nodes }) => {
    const el = document.querySelector('.card.thinking .depth');
    if (el) el.textContent = `depth ${depth} · ${(nodes / 1000).toFixed(0)}k nodes`;
  });
  bus.on('aiDone', () => cards.forEach((c) => c.classList.remove('thinking')));
  return { update };
}