// Read configuration from the controls form.

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
  const debug = !!(root.querySelector('#cfg-debug') || {}).checked;
   const includeBackwards = !(root.querySelector('#cfg-no-backwards') || {}).checked;

  const words = val('cfg-words', '')
    .split(/[\n,]+/)
    .map((w) => w.trim())
    .filter(Boolean);

   return {
     width, height, order, combiner, sampling, lattice,
     referenceText, words, debug, includeBackwards,
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