import { App } from './core/App.js';

const canvas = document.getElementById('scene');
const uiRoot = document.getElementById('ui');

// Exposed for debugging in the console: window.mineminer.board, .grid, etc.
window.mineminer = new App({ canvas, uiRoot });