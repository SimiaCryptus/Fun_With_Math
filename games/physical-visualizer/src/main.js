import { Clock } from './core/Clock.js';
import { EventBus } from './core/EventBus.js';
import { SignalBus } from './core/SignalBus.js';
import { Store } from './core/Store.js';
import { detect } from './core/Capability.js';
import { AudioEngine } from './audio/AudioEngine.js';
import { FileSource } from './audio/sources/FileSource.js';
import { MicSource } from './audio/sources/MicSource.js';
import { MotionEngine } from './motion/MotionEngine.js';
import { Renderer } from './gfx/Renderer.js';
import { PresetManager } from './presets/PresetManager.js';
import { Controls } from './ui/Controls.js';
import { Hud } from './ui/Hud.js';
import { Gestures } from './ui/Gestures.js';
import { setupInstall } from './pwa/install.js';
import { WakeLock } from './pwa/wakelock.js';

const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

async function boot() {
  const events = new EventBus();
  const signals = new SignalBus(256);
  const store = new Store();
  const cap = await detect();
  console.info('[physviz] capability', cap);

  // ---- toasts / live region -------------------------------------------------
  const toastEl = $('#toast');
  let toastTimer = 0;
  events.on('toast', (msg) => {
    const { text, action, onAction } = typeof msg === 'string' ? { text: msg } : msg;
    toastEl.hidden = false;
    toastEl.textContent = text;
    if (action) {
      const b = document.createElement('button');
      b.textContent = action;
      b.onclick = () => { toastEl.hidden = true; onAction?.(); };
      toastEl.append(b);
    }
    clearTimeout(toastTimer);
    if (!action) toastTimer = setTimeout(() => (toastEl.hidden = true), 4000);
  });
  events.on('live', (t) => { $('#live').textContent = t; });

  // ---- graphics ---------------------------------------------------------------
  const canvas = $('#vis');
  const renderer = new Renderer(canvas, signals, cap);
  try {
    await renderer.init();
  } catch (e) {
    fatal(`This browser cannot run the visualizer: ${e.message}`);
    return;
  }
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); events.emit('toast', 'GPU context lost — reload to continue.'); });

  const presets = new PresetManager(renderer, signals, events, store);
  await presets.loadBuiltins();

  // ---- audio / motion / input -------------------------------------------------
  const audio = new AudioEngine(signals, events, cap);
  const motion = new MotionEngine(signals, events, canvas, cap);
  const gestures = new Gestures(canvas, signals, events);
  const hud = new Hud($('#hud'), signals);
  const wakeLock = new WakeLock();
  const controls = new Controls({ root: $('#chrome'), events, audio, presets, hud });
  setupInstall($('#btn-install'));

  // ---- initial preset ---------------------------------------------------------
  const query = new URLSearchParams(location.search);
  const wanted = query.get('preset') || (await store.get('prefs', 'preset').catch(() => null)) ||
    (cap.reducedMotion ? 'oscilloscope' : 'plasma-storm');
  if (wanted === 'random') await presets.random(); else await presets.select(wanted);
  if (!presets.current) await presets.select(0);

  // ---- sources ----------------------------------------------------------------
  let fileSource = null;
  let micSource = null;

  const useFiles = async (files) => {
    if (!files?.length) return;
    await audio.wake();
    fileSource ??= new FileSource(audio.ctx, events);
    audio.setSource(fileSource);
    fileSource.addFiles(files);
  };
  const useMic = async () => {
    await audio.wake();
    try {
      micSource ??= await MicSource.create(audio.ctx);
      fileSource?.pause();
      audio.setSource(micSource);
      events.emit('track', { title: 'Microphone' });
      wakeLock.request();
    } catch (e) {
      events.emit('toast', `Microphone unavailable: ${e.message}`);
    }
  };
  const loadDemo = async () => {
    try {
      const res = await fetch(new URL('../assets/demo/loop.ogg', import.meta.url));
      if (!res.ok) throw new Error(res.status);
      const blob = await res.blob();
      await useFiles([new File([blob], 'demo-loop.ogg', { type: blob.type || 'audio/ogg' })]);
    } catch {
      events.emit('toast', 'Open an audio file (📂) or use the mic (🎤) to begin.');
    }
  };

  events.on('ui:open', useFiles);
  events.on('ui:mic', useMic);
  events.on('track', (t) => {
    events.emit('live', `Now playing: ${t.title}`);
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: 'Physical Visualizer' });
      const ms = navigator.mediaSession;
      ms.setActionHandler('play', () => fileSource?.play());
      ms.setActionHandler('pause', () => fileSource?.pause());
      ms.setActionHandler('previoustrack', () => fileSource?.prev());
      ms.setActionHandler('nexttrack', () => fileSource?.next());
    }
  });
  events.on('track:play', () => wakeLock.request());
  events.on('track:pause', () => { if (audio.source !== micSource) wakeLock.release(); });

  // Drag & drop / OS file handlers
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    const files = [...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('audio/') || /\.(mp3|ogg|flac|m4a|wav)$/i.test(f.name));
    if (files.length) useFiles(files);
  });
  window.launchQueue?.setConsumer(async (params) => {
    const files = await Promise.all((params.files ?? []).map((h) => h.getFile()));
    if (files.length) useFiles(files);
  });

  // ---- physical interactions -------------------------------------------------
  events.on('shake', () => { presets.random(); navigator.vibrate?.([12, 40, 18]); });
  events.on('gesture:swipe', (dir) => {
    if (dir === 'left') presets.next();
    else if (dir === 'right') presets.prev();
    else if (dir === 'up') Controls.toggleFullscreen();
  });
  events.on('gesture:doubletap', () => presets.random());
  events.on('gesture:longpress', () => {
    const d = presets.current?.def;
    if (d) events.emit('toast', `${d.name} — by ${d.author ?? 'unknown'} · warp ${d.warp.shader} · comp ${d.comp.shader}`);
  });
  events.on('gesture:pinch', (scale) => { renderer.feedbackBias = clamp(renderer.feedbackBias + (scale - 1) * 0.02, -0.08, 0.035); });
  events.on('preset:change', (def) => events.emit('live', `Preset: ${def.name}`));
  events.on('motion:mode', (m) => events.emit('toast', m.mode === 'virtual' ? `No motion sensors (${m.reason}) — drag the canvas to tilt.` : 'Motion sensors live. Tilt, shake, spin.'));
  events.on('motion:table', (flat) => $('#chrome').classList.toggle('hidden', flat));

  // ---- wake plate: the one trusted gesture -----------------------------------
  const plate = $('#wake');
  const wakeUp = async () => {
    plate.remove();
    const motionPromise = motion.start();          // must be kicked off synchronously inside the gesture
    await audio.wake();
    await motionPromise;
    if (query.get('src') === 'mic') useMic();
    else if (!fileSource) loadDemo();
  };
  plate.addEventListener('click', wakeUp, { once: true });
  plate.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') wakeUp(); }, { once: true });

  // ---- main loop --------------------------------------------------------------
  const root = document.documentElement.style;
  const clock = new Clock();
  const tick = ({ dt }) => {
    audio.update(dt);
    motion.update(dt);
    gestures.update(dt);
    signals.update(dt);
    if (audio.analyser) renderer.textures.upload(audio.analyser.spectrum, audio.analyser.waveform, audio.analyser.history);
    const frame = presets.frame(dt);
    if (frame) renderer.render(presets.current, dt, frame);
    controls.update(dt);
    hud.draw();
    root.setProperty('--tilt-x', signals.get('tiltX').toFixed(3));
    root.setProperty('--tilt-y', signals.get('tiltY').toFixed(3));
    signals.endFrame();
  };
  clock.start(tick);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clock.stop();
      if (!fileSource?.playing && audio.source !== micSource) audio.suspend();
    } else {
      audio.resume();
      clock.start(tick);
    }
  });

  // ---- service worker ---------------------------------------------------------
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    try {
      const reg = await navigator.serviceWorker.register(new URL('../sw.js', import.meta.url));
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) {
            events.emit('toast', { text: 'New version available.', action: 'Reload', onAction: () => w.postMessage({ type: 'SKIP_WAITING' }) });
          }
        });
      });
      navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
    } catch (e) {
      console.warn('[sw] register failed', e);
    }
  }
}

function fatal(msg) {
  const p = document.getElementById('wake');
  if (p) { p.innerHTML = `<div class="plate-title">✖</div><p class="plate-warn">${msg}</p>`; p.onclick = null; }
  else alert(msg);
}

boot().catch((e) => { console.error(e); fatal(e.message); });