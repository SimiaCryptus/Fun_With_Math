// Bootstrap: wire up controls, generate puzzle, render, export.

import { generatePuzzle } from '../generator.js';
import { renderGrid, gridToPNG, gridToText } from './render.js';
import { readConfig, wireFileUpload, wireConfigPersistence } from './controls.js';
import { loadExternalWordList } from '../grid/wordlist.js';
import { initWatch, watchStep, watchPlay, watchPause, watchFinish } from './watchMode.js';
import { initPlay, stopPlay, togglePausePlay } from './playMode.js';
import { populatePresetSelect, applyPreset, DEFAULT_PRESET } from './presets.js';
import {
  applyConfigFromUrl,
  hasUrlConfig,
  persistConfigToUrl,
  getModeFromUrl,
  persistModeToUrl,
} from './urlState.js';

let lastGrid = null;
let lastPlacement = null;
let mode = 'design';

function downloadDataURL(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function regenerate(root) {
  const cfg = readConfig(root);
  const status = root.querySelector('#status');
  try {
    const { grid, placement } = generatePuzzle(cfg);
    lastGrid = grid;
    lastPlacement = placement;
    renderGrid(root.querySelector('#grid'), grid, {
      debug: cfg.debug,
      lattice: cfg.lattice,
      fontScale: cfg.fontScale,
      fontFamily: cfg.fontFamily,
    });
    if (status) {
      const failed = placement.failed.length
        ? ` (couldn't place: ${placement.failed.join(', ')})`
        : '';
      status.textContent = `Placed ${placement.placed.length} word(s)${failed}.`;
    }
  } catch (err) {
    if (status) status.textContent = `Error: ${err.message}`;
    // eslint-disable-next-line no-console
    console.error(err);
  }
}
function setMode(root, next) {
  // Tear down previous mode.
  if (mode === 'watch') watchPause();
  if (mode === 'play') stopPlay();
  mode = next;
  // Persist the active mode to the URL so the link is shareable in-mode.
  persistModeToUrl(mode);
  const panels = {
    design: root.querySelector('#panel-design'),
    watch: root.querySelector('#panel-watch'),
    play: root.querySelector('#panel-play'),
  };
  for (const [name, el] of Object.entries(panels)) {
    if (el) el.hidden = name !== mode;
  }
  // Hide configuration controls in play mode for a streamlined UI.
  const configControls = root.querySelector('#config-controls');
  if (configControls) configControls.hidden = mode === 'play';
  root.querySelectorAll('.mode-tab').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  const cfg = readConfig(root);
  if (mode === 'design') {
    regenerate(root);
  } else if (mode === 'watch') {
    initWatch(root, cfg);
  } else if (mode === 'play') {
    // Ensure we have a fully-generated puzzle to play.
    if (!lastGrid || !lastPlacement) regenerate(root);
    initPlay(root, lastGrid, lastPlacement, cfg);
  }
}

export async function initApp(root = document) {
  // Load the project-level dictionary (wordlist.txt) up front so the grid
  // filler can avoid accidentally forming any of those real words. Failures
  // are non-fatal: generation simply proceeds without the extra filter.
  await loadExternalWordList();
  wireFileUpload(root);
  // Presets: populate dropdown, apply default, and re-apply on change.
  const presetEl = root.querySelector('#cfg-preset');
  if (presetEl) {
    populatePresetSelect(presetEl);
    // Apply the URL preset (if any) before applying its text/words so the
    // dropdown reflects the shared configuration.
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('preset') && urlParams.get('preset')) {
      presetEl.value = urlParams.get('preset');
    }
    applyPreset(root, presetEl.value || DEFAULT_PRESET);
    presetEl.addEventListener('change', () => {
      applyPreset(root, presetEl.value);
      persistConfigToUrl(root);
      regenerate(root);
    });
  }
  // Restore any saved configuration from the URL. This must run *after* the
  // preset has populated its default text/words so URL values win.
  if (hasUrlConfig()) {
    applyConfigFromUrl(root);
  }
  // Persist all config changes to the URL for shareable links. A change to a
  // value that affects the puzzle regenerates it in design mode.
  wireConfigPersistence(root, () => {
    if (mode === 'design') regenerate(root);
  });

  const regenBtn = root.querySelector('#btn-regen');
  if (regenBtn) regenBtn.addEventListener('click', () => regenerate(root));
  // Mode tabs.
  root.querySelectorAll('.mode-tab').forEach((btn) => {
    btn.addEventListener('click', () => setMode(root, btn.dataset.mode));
  });
  // Watch-mode controls.
  const wStep = root.querySelector('#btn-watch-step');
  if (wStep) wStep.addEventListener('click', () => watchStep(root));
  const wPlay = root.querySelector('#btn-watch-play');
  if (wPlay) {
    wPlay.addEventListener('click', () => {
      const speed = parseInt((root.querySelector('#watch-speed') || {}).value || '120', 10) || 120;
      watchPlay(root, speed);
    });
  }
  const wPause = root.querySelector('#btn-watch-pause');
  if (wPause) wPause.addEventListener('click', () => watchPause());
  const wFinish = root.querySelector('#btn-watch-finish');
  if (wFinish) wFinish.addEventListener('click', () => watchFinish(root));
  const wReset = root.querySelector('#btn-watch-reset');
  if (wReset) {
    wReset.addEventListener('click', () => initWatch(root, readConfig(root)));
  }
  // Play-mode controls.
  const pNew = root.querySelector('#btn-play-new');
  if (pNew) {
    pNew.addEventListener('click', () => {
      regenerate(root);
      initPlay(root, lastGrid, lastPlacement, readConfig(root));
    });
  }
  const pPause = root.querySelector('#btn-play-pause');
  if (pPause) {
    pPause.addEventListener('click', () => {
      const paused = togglePausePlay();
      pPause.textContent = paused ? 'Resume' : 'Pause';
    });
  }

  const pngBtn = root.querySelector('#btn-png');
  if (pngBtn) {
    pngBtn.addEventListener('click', () => {
      if (lastGrid) {
        const cfg = readConfig(root);
        downloadDataURL(
          gridToPNG(lastGrid, 32, {
            fontScale: cfg.fontScale,
            fontFamily: cfg.fontFamily,
          }),
          'wordsearch.png'
        );
      }
    });
  }

  const txtBtn = root.querySelector('#btn-txt');
  if (txtBtn) {
    txtBtn.addEventListener('click', () => {
      if (!lastGrid) return;
      const blob = new Blob([gridToText(lastGrid)], { type: 'text/plain' });
      downloadDataURL(URL.createObjectURL(blob), 'wordsearch.txt');
    });
  }
  // Re-fit the grid when the viewport changes size (debounced).
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (mode === 'design' && lastGrid) {
        const cfg = readConfig(root);
        renderGrid(root.querySelector('#grid'), lastGrid, {
          debug: cfg.debug,
          lattice: cfg.lattice,
          fontScale: cfg.fontScale,
          fontFamily: cfg.fontFamily,
        });
      } else if (mode === 'play' && lastGrid && lastPlacement) {
        // Re-render the interactive grid (resets selection but preserves found
        // state via re-init).
        initPlay(root, lastGrid, lastPlacement, readConfig(root));
      }
    }, 150);
  });

  // Generate an initial puzzle.
  regenerate(root);
  // Write the current (possibly default) configuration to the URL so the
  // page is immediately shareable.
  persistConfigToUrl(root);
  // If the URL requested a specific mode, switch to it now that the puzzle
  // has been generated. Otherwise persist the default mode.
  const urlMode = getModeFromUrl();
  if (urlMode && urlMode !== mode) {
    setMode(root, urlMode);
  } else {
    persistModeToUrl(mode);
  }
}
