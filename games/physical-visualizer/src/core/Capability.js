/** Feature detection + device tier scoring (low | mid | high). */
export async function detect() {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2');
  const info = {
    webgl2: !!gl,
    float: false,
    renderer: 'unknown',
    memory: navigator.deviceMemory ?? 4,
    cores: navigator.hardwareConcurrency ?? 4,
    motion: 'DeviceMotionEvent' in window,
    touch: (navigator.maxTouchPoints ?? 0) > 0,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    standalone: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
  };
  if (gl) {
    info.float = !!gl.getExtension('EXT_color_buffer_float');
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    info.renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  let score = 0;
  score += info.memory >= 8 ? 2 : info.memory >= 4 ? 1 : 0;
  score += info.cores >= 8 ? 2 : info.cores >= 4 ? 1 : 0;
  if (/Apple|NVIDIA|RTX|GTX|Radeon|Adreno \(TM\) [67]\d\d|Mali-G7|Mali-G9|Immortalis/i.test(info.renderer)) score += 2;
  else if (/Adreno \(TM\) 5\d\d|Mali-G5|PowerVR|Intel/i.test(info.renderer)) score += 1;
  if (!info.float) score -= 1;

  info.tier = score >= 5 ? 'high' : score >= 3 ? 'mid' : 'low';
  info.particleTexSize = info.tier === 'high' ? 256 : info.tier === 'mid' ? 128 : 64;
  info.fftSize = info.tier === 'low' ? 1024 : 2048;
  return info;
}