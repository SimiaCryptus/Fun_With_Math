function el(tag, className, id) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (id) e.id = id;
  return e;
}

function button(label, onClick, className = 'btn') {
  const b = el('button', className);
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Budgets, counters, role/crate palette and end-of-level overlay. */
export class Hud {
  constructor(root, handlers) {
     this.root = root;
    this.handlers = handlers;
    this.tools = handlers.tools;
    this.toolButtons = new Map();
    root.innerHTML = '';

    // Stats
    this.top = el('div', 'panel', 'hud-top');
    this.title = el('h1');
    this.top.append(this.title);
    this.stats = {};
    for (const [key, label] of [
      ['pool', 'Reinforcements'],
      ['out', 'Marching'],
      ['saved', 'Saved'],
      ['lost', 'Lost'],
      ['time', 'Time'],
    ]) {
      const row = el('div', 'stat');
      const l = el('span');
      l.textContent = label;
      const v = el('span');
      row.append(l, v);
      this.top.append(row);
      this.stats[key] = v;
    }
    root.append(this.top);

    // Controls
    this.controls = el('div', 'panel', 'hud-controls');
    this.pauseBtn = button('Pause [Space]', handlers.onTogglePause);
    this.speedBtn = button('Speed 1× [F]', handlers.onCycleSpeed);
    this.isoBtn = button('Isometric [I]', handlers.onToggleIso);
    this.restartBtn = button('Restart [R]', handlers.onRestart);
     this.editorBtn = button('Editor [E]', handlers.onOpenEditor);
     this.controls.append(this.pauseBtn, this.speedBtn, this.isoBtn, this.restartBtn, this.editorBtn);
    root.append(this.controls);

    // Palette
    this.palette = el('div', 'panel', 'hud-palette');
    let lastKind = null;
    for (const tool of this.tools) {
      if (lastKind && lastKind !== tool.kind) this.palette.append(el('div', 'divider'));
      lastKind = tool.kind;
      const btn = el('button', 'tool');
      const swatch = el('span', 'swatch');
      swatch.style.background = `#${tool.color.toString(16).padStart(6, '0')}`;
      const name = el('span');
      name.textContent = tool.label;
      const count = el('span', 'count');
      const key = el('span', 'count');
      key.textContent = `[${tool.hotkey}]`;
      btn.append(swatch, name, count, key);
      btn.addEventListener('click', () => handlers.onSelectTool(tool.id));
      btn.dataset.count = '';
      this.toolButtons.set(tool.id, { btn, count });
      this.palette.append(btn);
    }
    root.append(this.palette);

    // Hint / toast
    this.hint = el('div', 'panel', 'hud-hint');
    root.append(this.hint);
    this.toast = el('div', 'panel hidden', 'hud-toast');
    root.append(this.toast);
    this.toastTimer = 0;

    // End overlay
    this.overlay = el('div', 'hidden', 'hud-overlay');
    const card = el('div', 'card');
    this.overlayTitle = el('h2');
    this.overlayText = el('p');
    card.append(this.overlayTitle, this.overlayText, button('Play again', handlers.onRestart));
    this.overlay.append(card);
    root.append(this.overlay);
  }

  setTool(id) {
    for (const [tid, { btn }] of this.toolButtons) btn.classList.toggle('active', tid === id);
  }

  setHint(text) {
    if (this.hint.textContent !== text) this.hint.textContent = text;
  }

  setPaused(paused) {
    this.pauseBtn.textContent = paused ? 'Resume [Space]' : 'Pause [Space]';
    this.pauseBtn.classList.toggle('active', paused);
  }

  setSpeed(speed) {
    this.speedBtn.textContent = `Speed ${speed}× [F]`;
  }

  setIso(on) {
    this.isoBtn.classList.toggle('active', on);
  }
   /** Hide the whole HUD (used while the level designer is open). */
   setVisible(on) {
     this.root.classList.toggle('hidden', !on);
   }

  showToast(text, ms = 2000) {
    this.toast.textContent = text;
    this.toast.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.classList.add('hidden'), ms);
  }

  update(sim, budgetFor) {
    this.title.textContent = sim.level.name;
    this.stats.pool.textContent = String(sim.pool);
    this.stats.out.textContent = String(sim.troops.length);
    this.stats.saved.textContent = `${sim.saved} / ${sim.objective.required}`;
    this.stats.lost.textContent = String(sim.lost);
    this.stats.time.textContent = sim.timeLimit > 0
      ? `${formatTime(sim.time)} / ${formatTime(sim.timeLimit)}`
      : formatTime(sim.time);

    for (const tool of this.tools) {
      const n = budgetFor(tool);
      const { btn, count } = this.toolButtons.get(tool.id);
      const text = `×${n}`;
      if (count.textContent !== text) count.textContent = text;
      btn.disabled = n <= 0;
    }
  }

  showEnd(status, sim) {
    const won = status === 'won';
    this.overlayTitle.textContent = won ? 'Objective Secured' : 'Assault Failed';
    this.overlayText.textContent =
      `${won ? '' : `${sim.loseReason}. `}Saved ${sim.saved}/${sim.objective.required} · Lost ${sim.lost} · Time ${formatTime(sim.time)}`;
    this.overlay.classList.remove('hidden');
  }

  hideEnd() {
    this.overlay.classList.add('hidden');
  }
}