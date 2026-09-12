const MODES = ['paint', 'run', 'sweep', 'rewind', 'evolve', 'scope'];
export class Toolbar {
  constructor(el, bus) {
    this.el = el; this.bus = bus;
    el.innerHTML = `<div class="modes">${MODES.map((m, i) => `<button data-mode="${m}" title="${i + 1}">${m[0].toUpperCase() + m.slice(1)}</button>`).join('')}</div>
      <div class="transport"><button data-act="toggle" title="Space">▶</button><button data-act="step" title=". single step">⏭</button><button data-act="reset" title="R reset flow">↺</button></div>
      <div class="spacer"></div>
      <div class="actions"><button data-act="share" title="Copy shareable URL">Share</button><button data-act="save" title="Save to a local slot">Save</button><button data-act="load" title="Load a local slot">Load</button><button data-act="export" title="Download design as JSON">Export</button><button data-act="import" title="Import a design JSON">Import</button><button data-act="csv" title="Download metric time series">CSV</button><button data-act="about" title="?">?</button></div>
      <div class="score" id="scoreBadge" title="composite score">—</div>`;
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      b.blur(); // keep Space/Enter hotkeys from re-triggering the last clicked button
      if (b.dataset.mode) bus.emit('ui:mode', b.dataset.mode); else if (b.dataset.act) bus.emit('ui:action', b.dataset.act);
    });
    this.badge = el.querySelector('#scoreBadge');
  }
  setMode(m) { for (const b of this.el.querySelectorAll('[data-mode]')) b.classList.toggle('active', b.dataset.mode === m); }
  setRunning(r) { this.el.querySelector('[data-act=toggle]').textContent = r ? '❚❚' : '▶'; }
  setScore(res, label) {
    this.badge.textContent = `S ${res.score.toFixed(1)}`;
    const small = document.createElement('small'); small.textContent = res.flags.length ? res.flags.join(' ') : 'valid'; this.badge.appendChild(small);
    this.badge.classList.toggle('invalid', res.flags.includes('diverged'));
    this.badge.classList.toggle('settling', res.flags.includes('settling'));
    this.badge.title = label;
  }
}