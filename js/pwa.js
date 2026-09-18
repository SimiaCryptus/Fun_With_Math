/* ─────────────────────────────────────────────────────────────
   PWA glue: service-worker registration, update prompt,
   install button, and an offline indicator.
   Loaded with `defer`; safe to include on every page.
   ───────────────────────────────────────────────────────────── */

(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const DISMISS_KEY = 'pwa:install-dismissed';

  /* ── Standalone / installed detection ─────────────────────── */

  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    window.navigator.standalone === true;
  if (standalone) document.documentElement.classList.add('pwa-standalone');

  /* ── Install prompt ───────────────────────────────────────── */

  let deferredPrompt = null;
  const installBtn = $('#pwaInstall');

  window.addEventListener('beforeinstallprompt', (ev) => {
    ev.preventDefault();
    deferredPrompt = ev;
    if (installBtn && !standalone && localStorage.getItem(DISMISS_KEY) !== '1') {
      installBtn.hidden = false;
    }
  });

  installBtn?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    installBtn.disabled = true;
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'dismissed') localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* prompt can only be used once */
    } finally {
      deferredPrompt = null;
      installBtn.hidden = true;
      installBtn.disabled = false;
    }
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    if (installBtn) installBtn.hidden = true;
    localStorage.removeItem(DISMISS_KEY);
  });

  /* ── Offline indicator ────────────────────────────────────── */

  const offlineBar = $('#pwaOffline');
  const syncOnline = () => {
    if (!offlineBar) return;
    offlineBar.hidden = navigator.onLine;
  };
  window.addEventListener('online', syncOnline);
  window.addEventListener('offline', syncOnline);
  syncOnline();

  /* ── Service worker ───────────────────────────────────────── */

  if (!('serviceWorker' in navigator)) return;
  // file:// previews can't host a worker.
  if (location.protocol === 'file:') return;

  const toast = $('#pwaUpdateToast');
  const reloadBtn = $('#pwaReload');
  const dismissBtn = $('#pwaUpdateDismiss');
  let waitingWorker = null;
  let reloading = false;

  function showUpdate(worker) {
    waitingWorker = worker;
    if (toast) toast.hidden = false;
  }

  reloadBtn?.addEventListener('click', () => {
    if (!waitingWorker) {
      location.reload();
      return;
    }
    reloadBtn.disabled = true;
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  });

  dismissBtn?.addEventListener('click', () => {
    if (toast) toast.hidden = true;
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

      if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);

      reg.addEventListener('updatefound', () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdate(installing);
          }
        });
      });

      // Re-check for a new deploy when the tab regains focus (max 1/hour).
      let lastCheck = 0;
      const check = () => {
        const now = Date.now();
        if (document.visibilityState !== 'visible' || now - lastCheck < 36e5) return;
        lastCheck = now;
        reg.update().catch(() => {});
      };
      document.addEventListener('visibilitychange', check);
      check();
    } catch (err) {
      console.warn('[pwa] service worker registration failed:', err);
    }
  });
})();
