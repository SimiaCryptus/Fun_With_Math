// Play mode: solve the generated wordsearch with timer + selection.

import { renderInteractiveGrid, cellAt } from './render.js';

let state = null;

function key(x, y) {
  return `${x},${y}`;
}

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function updateTimer(root) {
  if (!state) return;
  const el = root.querySelector('#play-timer');
  if (el) el.textContent = formatTime(Date.now() - state.startedAt);
}

function updateWordList(root) {
  const list = root.querySelector('#play-words');
  if (!list) return;
  list.innerHTML = '';
  for (const p of state.placements) {
    const li = document.createElement('li');
    li.textContent = p.word.toUpperCase();
    if (state.found.has(p.word)) li.classList.add('found');
    list.appendChild(li);
  }
}

function lineCells(a, b) {
  // Returns the straight-line set of cells from a to b if they form a
  // valid horizontal / vertical / diagonal line, else null.
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (!(dx === 0 || dy === 0 || adx === ady)) return null;
  const len = Math.max(adx, ady);
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const cells = [];
  for (let i = 0; i <= len; i++) {
    cells.push({ x: a.x + sx * i, y: a.y + sy * i });
  }
  return cells;
}

function readSelection(cells) {
  return cells.map((c) => state.grid.get(c.x, c.y) || '').join('');
}

function clearSelectionClasses() {
  for (const td of state.table.querySelectorAll('td.selecting')) {
    td.classList.remove('selecting');
  }
}
function flashWrong(cells) {
  for (const c of cells) {
    const td = cellAt(state.table, c.x, c.y);
    if (td) {
      td.classList.add('wrong-flash');
      setTimeout(() => td.classList.remove('wrong-flash'), 400);
    }
  }
}
function launchConfetti(root) {
  const host = root.querySelector('#grid') || document.body;
  const colors = ['#7c5cff', '#36d1ff', '#ff5cae', '#ff9d5c', '#38e8a0', '#ffd166'];
  const layer = document.createElement('div');
  layer.className = 'confetti-layer';
  for (let i = 0; i < 80; i++) {
    const bit = document.createElement('span');
    bit.className = 'confetti';
    bit.style.left = `${Math.random() * 100}%`;
    bit.style.background = colors[Math.floor(Math.random() * colors.length)];
    bit.style.animationDelay = `${Math.random() * 0.4}s`;
    bit.style.animationDuration = `${1.6 + Math.random() * 1.4}s`;
    bit.style.transform = `rotate(${Math.random() * 360}deg)`;
    layer.appendChild(bit);
  }
  host.appendChild(layer);
  setTimeout(() => layer.remove(), 3200);
}

function markFound(cells) {
  for (const c of cells) {
    const td = cellAt(state.table, c.x, c.y);
    if (td) td.classList.add('found-cell');
  }
}

function tryMatch(cells) {
  const word = readSelection(cells);
  const rev = [...word].reverse().join('');
  for (const p of state.placements) {
    if (state.found.has(p.word)) continue;
    if (p.word === word || p.word === rev) {
      state.found.add(p.word);
      markFound(cells);
      return p.word;
    }
  }
  return null;
}

function finishIfDone(root) {
  if (state.found.size === state.placements.length && state.placements.length) {
    clearInterval(state.tick);
    const status = root.querySelector('#play-status');
    if (status) {
      status.textContent = `🎉 Solved in ${formatTime(Date.now() - state.startedAt)}! 🎉`;
      status.classList.add('win');
    }
    launchConfetti(root);
  }
}

export function initPlay(root, grid, placement) {
  if (state && state.tick) clearInterval(state.tick);
  const container = root.querySelector('#grid');
  for (const c of container.querySelectorAll('.confetti-layer')) c.remove();
  const prevStatus = root.querySelector('#play-status');
  if (prevStatus) {
    prevStatus.classList.remove('win');
    prevStatus.textContent = '';
  }
  const table = renderInteractiveGrid(container, grid, {
    lattice: grid.lattice || 'square',
  });

  state = {
    grid,
    table,
    placements: placement.placed.slice(),
    found: new Set(),
    startedAt: Date.now(),
    anchor: null,
    tick: null,
  };

  state.tick = setInterval(() => updateTimer(root), 250);
  updateTimer(root);
  updateWordList(root);

  const onCell = (td) => {
    const x = parseInt(td.dataset.x, 10);
    const y = parseInt(td.dataset.y, 10);
    if (!state.anchor) {
      state.anchor = { x, y };
      clearSelectionClasses();
      td.classList.add('selecting');
      return;
    }
    const cells = lineCells(state.anchor, { x, y });
    state.anchor = null;
    clearSelectionClasses();
    if (!cells) return;
    const matched = tryMatch(cells);
    const status = root.querySelector('#play-status');
    if (matched) {
      if (status) status.textContent = `✨ Found ${matched.toUpperCase()}!`;
    } else {
      if (status) status.textContent = `Not quite — keep looking!`;
      flashWrong(cells);
    }
    updateWordList(root);
    finishIfDone(root);
  };

  table.addEventListener('click', (e) => {
    const td = e.target.closest('td');
    if (td) onCell(td);
  });
}

export function stopPlay() {
  if (state && state.tick) clearInterval(state.tick);
  state = null;
}
