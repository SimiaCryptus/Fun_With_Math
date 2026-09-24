import { resolveEPS, epsToJSON, epsDigest } from '../core/eps.js';
import { encodeVerified, decodeContainer } from '../dec/pipeline.js';
import { fileToImageData, rgbToImageData, errorImageData } from '../io/imageLoad.js';
import { startCamera, stopCamera, grabFrame } from '../io/camera.js';
import { downloadBytes, copyText } from '../io/download.js';
import { dct2Ref, dct2 } from '../dsp/dct.js';
import { FddpError } from '../core/errors.js';
import { DEV } from '../core/assert.js';
import { sha256, hex } from '../core/digest.js';

const $ = (id) => document.getElementById(id);
const state = { imageData: null, bytes: null, out: null, eps: null, sourceName: '' };
const maxEdge = () => parseInt($('maxedge').value, 10) || 512;

// ---- dev-mode boot assertion: V1 and V2 of §16.3 ------------------------
function bootSelfTest() {
  const v1 = dct2(new Float64Array(8).fill(1));
  if (Math.abs(v1[0] - 2.82842712) > 1e-6)
    throw new Error(`V1 FAILED: X[0]=${v1[0]} (expected 2√2). Scaling convention is wrong.`);
  const x = new Float64Array(8);
  for (let n = 0; n < 8; n++) x[n] = Math.cos((Math.PI / 8) * (n + 0.5) * 2);
  const v2 = dct2(x);
  if (Math.abs(v2[2] - 2.0) > 1e-6)
    throw new Error(`V2 FAILED: X[2]=${v2[2]} (expected 2.0). Half-sample offset is wrong.`);
  const r = dct2Ref(x);
  for (let k = 0; k < 8; k++) if (Math.abs(r[k] - v2[k]) > 1e-12)
    throw new Error('fast DCT diverges from the reference kernel');
  // Every preset must resolve: this is where the COLA/NaN and frozen-typed-array
  // regressions would have been caught before a user ever pressed Encode.
  for (const p of ['visual', 'analysis', 'analysis-tiny', 'faithful', 'bytes-a', 'bytes-faithful']) resolveEPS(p);
  return true;
}

function caps() {
  const c = [
    ['createImageBitmap', typeof createImageBitmap === 'function'],
    ['OffscreenCanvas', typeof OffscreenCanvas !== 'undefined'],
    ['crypto.subtle', !!globalThis.crypto?.subtle],
    ['Float16Array', typeof globalThis.Float16Array !== 'undefined'],
    ['camera', !!navigator.mediaDevices?.getUserMedia],
  ];
  $('caps').textContent = c.map(([n, ok]) => `${ok ? '✓' : '✗'}${n}`).join(' ');
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 9000);
}

function guard(fn) {
  return async (...a) => {
    try { await fn(...a); }
    catch (e) {
      // Every error carries a §19 code and a spec section. Nothing is swallowed.
      if (e instanceof FddpError) toast(`${e.code} — ${e.detail} — ${e.section}`);
      else { toast(`internal: ${e.message}`); console.error(e); }
    }
  };
}

function draw(canvasId, imageData) {
  const c = $(canvasId);
  c.width = imageData.width; c.height = imageData.height;
  c.getContext('2d').putImageData(imageData, 0, 0);
}

function clear(canvasId) {
  const c = $(canvasId);
  c.width = 1; c.height = 1;
}

function drawTokenGrid(result, eps) {
  const cols = result.meta.nGroups ?? 1;
  const rows = eps.L * eps.J;
  const c = $('c-tok');
  c.width = Math.min(cols, 512); c.height = rows;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(c.width, c.height);
  for (const p of result.patches) {
    const x = Math.floor(p.coord.g * c.width / cols);
    const y = p.coord.l * eps.J + p.coord.j;
    // cell colour = patch energy, read straight out of the mandatory
    // side-channel (§11.2). Without it every patch would look identical.
    const e = Math.max(0, Math.min(1, (p.side.logScale + 6) / 10));
    const o = (y * c.width + x) * 4;
    img.data[o] = 30 + e * 80; img.data[o + 1] = 40 + e * 190;
    img.data[o + 2] = 60 + e * 195; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

// A source is ALWAYS its raw bytes (Profile A) and, when decodable, also an
// image (Profile C). Failing to decode as an image must not disable Encode.
async function loadSource(file) {
  state.bytes = new Uint8Array(await file.arrayBuffer());
  state.sourceName = file.name || 'source';
  state.imageData = null;
  try {
    state.imageData = await fileToImageData(file, maxEdge());
    draw('c-src', state.imageData);
  } catch (e) {
    clear('c-src');
    toast(`"${state.sourceName}" is not decodable as an image (${e.message}). Profile A over its raw ${state.bytes.length} bytes is available.`);
  }
  $('btn-encode').disabled = false;
}

const doEncode = guard(async () => {
  const presetName = $('preset').value;
  const eps = resolveEPS(presetName);
  state.eps = eps;

  let input;
  if (eps.domain === 'bytes') {
    if (!state.bytes) { toast('Profile A needs raw file bytes: pick a file, not a camera frame.'); return; }
    input = { kind: 'bytes', bytes: state.bytes };
  } else {
    if (!state.imageData) { toast('no image loaded (this source is not an image; try a Profile A preset)'); return; }
    input = { kind: 'image', imageData: state.imageData };
  }

  const t0 = performance.now();
  const out = encodeVerified(input, eps);
  const ms = performance.now() - t0;
  state.out = out;

  const m = out.metrics;
  const L = ['L0', 'L1', 'L2', 'L3'];
  $('report').textContent = [
    `preset            ${presetName}   profile ${eps.profileName}   EPS ${epsDigest(eps).slice(0, 16)}`,
    `tiling            ${eps.resolution}  K_p=${eps.Kp || '-'}  bands J=${eps.J}  G=${eps.G}  C=${eps.C}  L=${eps.L}${eps.centered ? '  CENTERED' : ''}`,
    `band edges        [${Array.from(eps.bandEdges).join(', ')}]   (merged per §10.1)`,
    `channels          [${eps.channels.map(c => '0x' + c.toString(16).padStart(2, '0')).join(', ')}]`,
    `tokens            ${m.tokens.toLocaleString()}   latency ${out.latency} samples (§14.2)`,
    `DATA              ${(m.dataBytes / 1024).toFixed(1)} KiB   container ${(out.container.length / 1024).toFixed(1)} KiB`,
    `bits/source-octet ${m.bitsPerSourceOctet.toFixed(2)}   (§17.5; Profile A's ≤2.0 target is profile-specific)`,
    `source digest     ${out.sourceDigest.slice(0, 32)}…`,
    ``,
    `level REQUESTED   ${L[m.requestedLevel]}`,
    `level ACHIEVED    ${L[m.achievedLevel]}${m.downgraded ? '   ← DOWNGRADED: the encoder measured, it did not assert' : '   (verified)'}`,
    `relative RMS      ${m.relRMS.toExponential(3)}${m.byteExact ? '   (byte-exact; L3 not claimed, D-12)' : ''}`,
    m.psnr !== undefined ? `PSNR              ${m.psnr === Infinity ? '∞ (byte-exact)' : m.psnr.toFixed(2) + ' dB'}` : '',
    m.spectralConvergence !== undefined ? `spectral conv.    ${m.spectralConvergence.toFixed(4)} (${m.spectralConvergenceDb.toFixed(1)} dB)` : '',
    `clamped samples   ${m.clampCount ?? 0}   quantiser clamps ${out.result.stats.clamp_count}`,
    ``,
    `encode time       ${ms.toFixed(0)} ms`,
    eps.nonInterchange ? 'WARNING: private-use registry IDs present — NON-INTERCHANGE container (§20)' : '',
  ].filter(Boolean).join('\n');

  if (eps.domain === 'image' && out.recon) {
    const { width, height } = state.imageData;
    draw('c-rec', rgbToImageData(out.recon, width, height));
    draw('c-err', errorImageData(out.result.canonical, out.recon, width, height, 8));
  } else { clear('c-rec'); clear('c-err'); }
  drawTokenGrid(out.result, eps);
  $('btn-dl').disabled = false; $('btn-eps').disabled = false;
});

const doDecode = guard(async (file) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const d = decodeContainer(bytes);
  const L = ['L0', 'L1', 'L2', 'L3'];
  const lines = [
    `chunks: ${d.parsed.chunkList.map(c => `${c.type}(${c.length}${c.critical ? '' : ',anc'})`).join(' ')}`,
    `FHDR: ${JSON.stringify(d.parsed.fhdr)}`,
    `EPS reconstructed from descriptors (§16.2)${d.presetName ? `; matches preset "${d.presetName}"` : '; matches no shipped preset'}`,
    `BAND: [${Array.from(d.parsed.band.edges).join(', ')}]  J=${d.parsed.band.J}`,
    `CHAN: [${d.parsed.chan.map(c => '0x' + c.toString(16).padStart(2, '0')).join(', ')}]`,
    `declared level: ${L[d.declaredLevel]}`,
    `STAT: ${d.parsed.stat ? d.parsed.stat.encoderId + '  ' + JSON.stringify(d.parsed.stat.metrics) : '(absent)'}`,
    d.parsed.tokenCountMismatch ? `token_count MISMATCH (advisory per §18.1): ${JSON.stringify(d.parsed.tokenCountMismatch)}` : 'token_count reconciled against DATA length ✓',
    d.note || '',
  ];
  if (d.bytes) {
    const digest = hex(sha256(d.bytes));
    const statDigest = d.parsed.stat ? hex(d.parsed.stat.digest) : null;
    lines.push(`bytes: ${d.bytes.length} octets decoded, ${d.clampCount} clamped`);
    lines.push(statDigest
      ? `source digest ${digest === statDigest ? 'MATCHES' : 'DIFFERS from'} STAT (${digest.slice(0, 16)}…)`
      : `source digest ${digest.slice(0, 16)}… (no STAT to compare against)`);
    state.decodedBytes = d.bytes;
    $('btn-dl-dec').disabled = false;
  } else {
    $('btn-dl-dec').disabled = true;
  }
  $('report-dec').textContent = lines.filter(Boolean).join('\n');
  $('tree').textContent = lines.filter(Boolean).join('\n');
  if (d.rgb) draw('c-dec', rgbToImageData(d.rgb, d.width, d.height)); else clear('c-dec');
});

// ---- wiring -------------------------------------------------------------
function init() {
  caps();
  try { bootSelfTest(); }
  catch (e) { toast('BOOT SELF-TEST FAILED — ' + e.message); throw e; }
  if (DEV) console.info('FDDP dev mode: V1/V2 asserted at boot.');

  for (const b of document.querySelectorAll('.tab')) {
    b.onclick = () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === b));
      for (const id of ['encode', 'decode', 'inspect'])
        $('tab-' + id).hidden = (id !== b.dataset.tab);
    };
  }

  $('file').onchange = guard(async (e) => {
    const f = e.target.files[0]; if (!f) return;
    await loadSource(f);
  });

  $('btn-cam').onclick = guard(async () => {
    await startCamera($('cam'));
    $('btn-shot').disabled = false;
  });
  $('btn-shot').onclick = guard(async () => {
    state.imageData = grabFrame($('cam'), maxEdge());
    state.bytes = null;                              // a frame has no file bytes: Profile A says so
    state.sourceName = 'camera frame';
    draw('c-src', state.imageData);
    $('btn-encode').disabled = false;
  });
  window.addEventListener('pagehide', stopCamera);

  $('btn-encode').onclick = doEncode;
  $('btn-dl').onclick = () => downloadBytes(state.out.container, 'capture.fddp');
  $('btn-eps').onclick = () => copyText(epsToJSON(state.eps));
  $('btn-dl-dec').onclick = () => downloadBytes(state.decodedBytes, 'decoded.bin');

  const drop = $('drop');
  drop.onclick = () => $('file-dec').click();
  $('file-dec').onchange = (e) => e.target.files[0] && doDecode(e.target.files[0]);
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = (e) => {
    e.preventDefault(); drop.classList.remove('over');
    if (e.dataTransfer.files[0]) doDecode(e.dataTransfer.files[0]);
  };
  document.addEventListener('paste', guard(async (e) => {
    const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
    if (!item) return;
    await loadSource(item.getAsFile());
  }));
}

init();