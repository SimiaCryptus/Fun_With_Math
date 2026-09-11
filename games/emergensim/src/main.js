import { Engine } from './core/Engine.js';
import { normalizeScenario } from './scenarios/ScenarioSchema.js';
import { FireEvacuation } from './scenarios/FireEvacuation.js';
import { ActiveThreat } from './scenarios/ActiveThreat.js';
import { EarthquakeTornado } from './scenarios/EarthquakeTornado.js';

const REGISTRY = new Map([FireEvacuation, ActiveThreat, EarthquakeTornado].map((s) => [s.id, s]));
let engine = null;

async function boot(scenarioId) {
  const def = REGISTRY.get(scenarioId) || FireEvacuation;
  if (engine) { engine.destroy(); engine = null; }
  const scenario = normalizeScenario(def);
  engine = new Engine(document.getElementById('viewport-container'), scenario);
  engine.eventBus.on('RELOAD_SCENARIO', ({ scenarioId: id }) => {
    queueMicrotask(() => boot(id || scenario.id));
  });
  await engine.init();
  const url = new URL(location.href);
  url.searchParams.set('scenario', scenario.id);
  history.replaceState(null, '', url);
  window.PROTOCOL = { engine, state: engine.state };
}

const select = document.getElementById('scenario-select');
for (const s of REGISTRY.values()) {
  const opt = document.createElement('option');
  opt.value = s.id; opt.textContent = s.title;
  select.appendChild(opt);
}
select.addEventListener('change', () => {
   select.blur(); // release focus so WASD / hotkeys reach the game again
   boot(select.value).catch((err) => {
     console.error(err);
     document.getElementById('hud-toast').innerHTML = `<div class="toast bad">Boot failed: ${err.message}</div>`;
   });
});

const initial = new URL(location.href).searchParams.get('scenario') || FireEvacuation.id;
select.value = REGISTRY.has(initial) ? initial : FireEvacuation.id;
boot(select.value).catch((err) => {
  console.error(err);
  const toast = document.getElementById('hud-toast');
  toast.innerHTML = `<div class="toast bad">Boot failed: ${err.message}</div>`;
});