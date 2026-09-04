import { registerServiceWorker, initInstallPrompt, initNetworkIndicator } from './src/pwa.js';
registerServiceWorker();
initInstallPrompt();
initNetworkIndicator();
