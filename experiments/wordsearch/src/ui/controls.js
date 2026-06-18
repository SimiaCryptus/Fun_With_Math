// Read configuration from the controls form.
import { updateGridFont } from './render.js';

/**
 * Collect config values from form elements.
 * @param {Document|HTMLElement} root
 */
export function readConfig(root = document) {
  const val = (id, def) => {
    const el = root.querySelector(`#${id}`);
    return el ? el.value : def;
  };
  const width = parseInt(val('cfg-width', '15'), 10) || 15;
  const height = parseInt(val('cfg-height', '15'), 10) || 15;
  const order = parseInt(val('cfg-order', '3'), 10) || 3;
  const combiner = val('cfg-combiner', 'product');
  const sampling = val('cfg-sampling', 'weighted');
  const lattice = val('cfg-lattice', 'square');
  const referenceText = val('cfg-reftext', '');
  // Optional text rendering controls. fontScale multiplies the auto-computed
  // font size (default 1.0 = 50% of cell). fontFamily is a CSS font stack.
  const fontScaleRaw = parseFloat(val('cfg-fontscale', '1'));
  const fontScale = Number.isFinite(fontScaleRaw) && fontScaleRaw > 0 ? fontScaleRaw : 1;
  const fontFamily = val('cfg-fontfamily', "'JetBrains Mono', monospace");
  const debug = !!(root.querySelector('#cfg-debug') || {}).checked;
  const includeBackwards = !(root.querySelector('#cfg-no-backwards') || {}).checked;
  // Optional cap on how many words to randomly select from the (possibly
  // large) target list. 0 / blank means "use all".
  const wordCountRaw = val('cfg-wordcount', '');
  const wordCount = parseInt(wordCountRaw, 10);

  const words = val('cfg-words', '')
    .split(/[\n,]+/)
    .map((w) => w.trim())
    .filter(Boolean);

  return {
    width,
    height,
    order,
    combiner,
    sampling,
    lattice,
    referenceText,
    words,
    fontScale,
    fontFamily,
    debug,
    includeBackwards,
    wordCount: Number.isFinite(wordCount) && wordCount > 0 ? wordCount : 0,
  };
}

/**
 * Wire a file input to populate the reference text area.
 */
export function wireFileUpload(root = document) {
  const fileEl = root.querySelector('#cfg-reffile');
  const textEl = root.querySelector('#cfg-reftext');
  if (!fileEl || !textEl) return;
  fileEl.addEventListener('change', async () => {
    const file = fileEl.files && fileEl.files[0];
    if (!file) return;
    textEl.value = await file.text();
  });
}
/**
 * Wire the text-size (font scale) and font-family controls so they update
 * the rendered grid in realtime, without regenerating the puzzle.
 * @param {HTMLElement} container the #grid host element
 * @param {Document|HTMLElement} root the form root
 */
export function wireLiveFontControls(container, root = document) {
  const scaleEl = root.querySelector('#cfg-fontscale');
  const familyEl = root.querySelector('#cfg-fontfamily');
  const apply = () => {
    const scaleRaw = parseFloat(scaleEl ? scaleEl.value : '1');
    const fontScale = Number.isFinite(scaleRaw) && scaleRaw > 0 ? scaleRaw : 1;
    const fontFamily = familyEl ? familyEl.value : undefined;
    updateGridFont(container, { fontScale, fontFamily });
  };
  if (scaleEl) scaleEl.addEventListener('input', apply);
  if (familyEl) familyEl.addEventListener('change', apply);
}
