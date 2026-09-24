// M5 — the camera as an IMAGE SOURCE. (The camera as a CONTAINER READER is the
// visual carrier of plan §7; it is not built in this drop and the UI says so
// rather than offering a button that does nothing.)
let stream = null;

export async function startCamera(videoEl) {
  stopCamera();
  stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1920 }, facingMode: { ideal: 'environment' } }, audio: false,
  });
  videoEl.srcObject = stream;
  videoEl.hidden = false;
  await videoEl.play();
  return stream;
}

export function stopCamera() {
  if (stream) { for (const t of stream.getTracks()) t.stop(); stream = null; }
}

export function grabFrame(videoEl, maxEdge = 512) {
  let w = videoEl.videoWidth, h = videoEl.videoHeight;
  const s = Math.min(1, maxEdge / Math.max(w, h));
  w = Math.max(1, Math.round(w * s)); h = Math.max(1, Math.round(h * s));
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(w, h)
    : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(videoEl, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}