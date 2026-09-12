import { bus } from './src/core/EventBus.js';
import { Params } from './src/core/Params.js';
import { probeCapabilities, benchmark, selectTier } from './src/core/Tiers.js';
import { decodeState } from './src/core/HashCodec.js';
import { log } from './src/core/Log.js';
import { GpuContext } from './src/sim/gpu/GpuContext.js';
import { App } from './src/core/App.js';

async function boot() {
  const caps = probeCapabilities();
  // WebGPU is auto-enabled when a device exists and the solver kernels compile. An explicit
  // `backend=webgpu` in the URL overrides the "disabled after failure" session flag.
  const wanted = decodeState(location.hash)?.params?.backend;
  caps.webgpu = wanted === 'cpu' ? { available: false, reason: 'backend=cpu' } : await GpuContext.init({ force: wanted === 'webgpu' });
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