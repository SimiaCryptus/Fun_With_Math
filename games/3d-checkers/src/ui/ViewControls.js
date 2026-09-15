import { LEVELS } from '../engine/geometry.js';
import { getLevelGap } from '../core/constants.js';

/** Attach a listener only when the element actually exists. */
function on(el, type, fn) { if (el) el.addEventListener(type, fn); }
/**
  * The Gap slider is optional in the markup — build it on demand so the control
  * is always available (and so a mangled/duplicated `#level-gap` can't break it).
  */
function ensureGapSlider() {
   const existing = document.getElementById('level-gap');
   if (existing) return existing;
   const explode = document.getElementById('explode');
   const host = document.getElementById('view-controls') || explode?.closest('label')?.parentElement;
   if (!host) return null;
   const label = document.createElement('label');
   label.textContent = 'Gap ';
   const input = document.createElement('input');
   input.type = 'range';
   input.id = 'level-gap';
   input.min = '0';
   input.max = '4';
   input.step = '0.05';
   input.value = String(getLevelGap());
   label.appendChild(input);
   const anchor = explode?.closest('label');
   if (anchor && anchor.parentElement === host) host.insertBefore(label, anchor.nextSibling);
   else host.insertBefore(label, host.firstChild);
   return input;
}


export function initViewControls({ view, scene, setExplode, setFocusLevel, setXray, setGap }) {
  const slider = document.getElementById('explode');
   const gapEl = ensureGapSlider();
  const modes = document.getElementById('view-modes');
  const level = document.getElementById('level');
  const presets = document.getElementById('camera-presets');

  if (!slider || !gapEl || !modes || !level || !presets) {
    console.warn('[ViewControls] missing element(s):', {
      explode: !!slider, 'level-gap': !!gapEl, 'view-modes': !!modes,
      level: !!level, 'camera-presets': !!presets,
    });
  }

  on(slider, 'input', () => setExplode(+slider.value, false));
  on(gapEl, 'input', () => setGap(+gapEl.value));
  on(modes, 'click', (e) => {
    const mode = e.target.dataset.mode;
    if (!mode) return;
    if (mode === 'compact') setExplode(0);
    else if (mode === 'exploded') setExplode(1);
    else if (mode === 'slice') setFocusLevel(view.focusLevel >= 0 ? -1 : Math.max(0, level ? +level.value : 0));
    else if (mode === 'xray') setXray(!view.xrayOn);
  });
  on(level, 'change', () => setFocusLevel(+level.value));
  on(presets, 'click', (e) => { if (e.target.dataset.preset) scene.setPreset(e.target.dataset.preset); });

  /** Keep the level picker in step with the configured number of levels. */
  function rebuildLevels() {
    if (!level || level.options.length === LEVELS + 1) return;
    level.innerHTML = '';
    level.add(new Option('All', '-1'));
    for (let z = 0; z < LEVELS; z++) level.add(new Option(String(z + 1), String(z)));
  }

  function sync() {
    rebuildLevels();
    if (slider) slider.value = view.explode;
    if (gapEl) gapEl.value = getLevelGap();
    if (modes) {
      for (const b of modes.children) {
        const m = b.dataset.mode;
        b.classList.toggle('active',
          (m === 'compact' && view.explode < 0.05) || (m === 'exploded' && view.explode >= 0.05) ||
          (m === 'slice' && view.focusLevel >= 0) || (m === 'xray' && view.xrayOn));
      }
    }
    if (level) level.value = String(view.focusLevel < LEVELS ? view.focusLevel : -1);
  }
  sync();
  return { sync };
}