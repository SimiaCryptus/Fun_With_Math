import { fmtCredits, fmtDate, fmtNum } from '../core/units.js';

export function initHUD(game) {
  const $ = (id) => document.getElementById(id);
  const el = {
    date: $('hud-date'), credits: $('hud-credits'), dv: $('hud-dv'),
    fuel: $('hud-fuel'), cargo: $('hud-cargo'), status: $('hud-status'),
    log: $('log'),
  };

  document.getElementById('time-controls').addEventListener('click', (e) => {
    const b = e.target.closest('.tbtn');
    if (!b) return;
    game.setRate(Number(b.dataset.rate));
  });
  $('btn-save').onclick = () => game.save();
  $('btn-load').onclick = () => game.load();

  let logLen = -1;

  function syncRateButtons() {
    for (const b of document.querySelectorAll('#time-controls .tbtn')) {
      b.classList.toggle('active', Number(b.dataset.rate) === game.rate);
    }
  }

  function renderLog() {
    if (game.logLines.length === logLen) return;
    logLen = game.logLines.length;
    el.log.innerHTML = game.logLines
      .slice(-40)
      .map((l) => `<li class="${l.hi ? 'hi' : ''}"><b>${fmtDate(l.t)}</b> ${l.msg}</li>`)
      .join('');
    el.log.parentElement.scrollTop = el.log.parentElement.scrollHeight;
  }

  return function renderHUD() {
    const s = game.ship;
    el.date.textContent = fmtDate(game.t);
    el.credits.textContent = fmtCredits(game.credits);
    const dv = s.deltaV / 1000;
    el.dv.textContent = `${dv.toFixed(2)} km/s`;
    el.dv.className = 'val ' + (dv < 3 ? 'neg' : dv < 8 ? 'warn' : 'pos');
    el.fuel.textContent = `${fmtNum(s.prop, 0)}/${s.propCapacity} t`;
    el.cargo.textContent = `${fmtNum(s.cargoMass, 0)}/${s.cargoCapacity} t`;
    el.status.textContent = game.status;
    syncRateButtons();
    renderLog();
  };
}