import { initApp } from './ui/app.js';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./src/pwa/sw.js')
      .catch((e) => console.warn('SW registration failed', e));
  });
}

document.addEventListener('DOMContentLoaded', () => initApp(document));