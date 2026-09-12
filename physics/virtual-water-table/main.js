import { bus } from './src/core/EventBus.js';
import { Params } from './src/core/Params.js';
import { probeCapabilities, benchmark, selectTier } from './src/core/Tiers.js';
import { log } from './src/core/Log.js';
import { App } from './src/core/App.js';

async function boot() {
  const caps = probeCapabilities();
  const bench = benchmark(120);
  const tierInfo = { ...selectTier(caps, bench), caps, bench };
  log.info('boot', tierInfo);
  const params = new Params(bus);
  const $ = (id) => document.getElementById(id);
  const app = new App({
    bus, params, tierInfo,
    dom: { toolbar: $('toolbar'), tools: $('tools'), canvas: $('gl'), hud: $('hud'), side: $('side'), depth: $('depth'), notify: $('notify') },
  });
  window.cg = app; // debugging handle; not used by any module
  await app.init();
}

boot().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<pre class="fatal">Chaos Garden failed to start:\n${err?.stack || err}</pre>`);
});