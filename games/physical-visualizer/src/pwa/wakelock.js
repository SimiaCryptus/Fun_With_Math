/** Screen Wake Lock with automatic re-acquire after tab switch. */
export class WakeLock {
  constructor() {
    this.lock = null; this.wanted = false;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.wanted) this.request();
    });
  }

  async request() {
    this.wanted = true;
    if (!('wakeLock' in navigator) || this.lock) return;
    try {
      this.lock = await navigator.wakeLock.request('screen');
      this.lock.addEventListener('release', () => { this.lock = null; });
    } catch { /* low battery or unsupported — just warn silently */ }
  }

  async release() {
    this.wanted = false;
    try { await this.lock?.release(); } catch { /* ignore */ }
    this.lock = null;
  }
}