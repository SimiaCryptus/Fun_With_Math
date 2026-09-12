import { WGSL } from './shaders.js';
import { log } from '../../core/Log.js';

const NOGPU = 'cg:nogpu'; // set when the backend fails so the reload lands on the CPU solver

/**
 * Owns the WebGPU adapter/device and the compiled solver shader module. `init()` is the capability
 * probe: it only reports `available: true` when a device was obtained *and* the kernels compiled, so
 * a WGSL regression degrades to the CPU path instead of a blank canvas.
 */
export class GpuContext {
  static current = null;

  static async init({ force = false } = {}) {
    const off = (reason) => ({ available: false, reason });
    if (typeof navigator === 'undefined' || !navigator.gpu) return off('navigator.gpu missing');
    let flag = null; try { flag = sessionStorage.getItem(NOGPU); } catch { /* no storage */ }
    if (flag && !force) return off(`disabled this session: ${flag}`);
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) return off('no adapter');
       let info = adapter.info || null; // older implementations only expose requestAdapterInfo()
       if (!info && typeof adapter.requestAdapterInfo === 'function') { try { info = await adapter.requestAdapterInfo(); } catch { /* optional */ } }
       info = info || {};
      const device = await adapter.requestDevice();
      const module = device.createShaderModule({ code: WGSL, label: 'cg-solver' });
      const ci = await module.getCompilationInfo();
      const errors = ci.messages.filter((m) => m.type === 'error').map((m) => `${m.lineNum}:${m.linePos} ${m.message}`);
      if (errors.length) { log.error('webgpu shader errors', errors); device.destroy(); return off('shader compile error'); }
      const ctx = new GpuContext(adapter, device, module, info);
      device.lost.then((e) => ctx.fail(`device lost (${e.reason}): ${e.message}`));
      device.addEventListener('uncapturederror', (e) => ctx.fail(e.error?.message || String(e.error)));
      try { sessionStorage.removeItem(NOGPU); } catch { /* ignore */ }
      GpuContext.current = ctx;
      return {
        available: true, vendor: info.vendor || '', architecture: info.architecture || '',
        f16: adapter.features.has('shader-f16'), timestamps: adapter.features.has('timestamp-query'),
        maxStorageBuffer: adapter.limits.maxStorageBufferBindingSize, maxInvocations: adapter.limits.maxComputeInvocationsPerWorkgroup,
      };
    } catch (err) { log.warn('webgpu init failed', String(err)); return off(String(err?.message || err)); }
  }

  constructor(adapter, device, module, info) {
    this.adapter = adapter; this.device = device; this.module = module; this.info = info;
    this.failed = false; this.onFail = null;
  }
  /** Vendor/architecture tag folded into the run hash (§5.6). */
  get label() { return [this.info.vendor, this.info.architecture].filter(Boolean).join('/') || 'webgpu'; }
  fail(reason) {
    if (this.failed) return; this.failed = true;
    log.error('webgpu backend failed', reason);
    try { sessionStorage.setItem(NOGPU, reason); } catch { /* ignore */ }
    if (GpuContext.current === this) GpuContext.current = null;
    this.onFail?.(reason);
  }
}