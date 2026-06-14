// Entry point: wires UI controls to the field generator and renderer.

    import { computeField } from "./field.js";
    import { renderField } from "./render.js";
   import { computeFFT2D, renderFFT3D } from "./fft.js";

    const canvas = document.getElementById("field");
    const statsEl = document.getElementById("stats");

    const controls = {
      D: document.getElementById("D"),
      mode: document.getElementById("mode"),
      K: document.getElementById("K"),
      alpha: document.getElementById("alpha"),
      eps: document.getElementById("eps"),
      size: document.getElementById("size"),
      cmap: document.getElementById("cmap"),
      cmap2d: document.getElementById("cmap2d"),
      cycle: document.getElementById("cycle"),
      seed: document.getElementById("seed"),
    };

    const outputs = {
      K: document.getElementById("kOut"),
      alpha: document.getElementById("alphaOut"),
      eps: document.getElementById("epsOut"),
      size: document.getElementById("sizeOut"),
      seed: document.getElementById("seedOut"),
      cycle: document.getElementById("cycleOut"),
      offset: document.getElementById("offsetOut"),
    };
   // Viewport state for pan & zoom (rational lattice coordinates).
   const view = {
     panX: 0,
     panY: 0,
     zoom: 1, // lattice units per pixel
   };

   // Integer offset state (paged through with buttons).
   const offset = { x: 0, y: 0 };

   // Color cycling phase, advanced by an animation loop when cycle > 0.
   let colorPhase = 0;
   // --- URL hash persistence (for sharable links) ---
   // Serialize all control + view state into the location hash so the exact
   // view can be restored or shared by copying the URL.
   let restoringFromHash = false;
   function stateToHash() {
     if (restoringFromHash) return;
     const params = new URLSearchParams();
     for (const key of Object.keys(controls)) {
       params.set(key, controls[key].value);
     }
     params.set("cycleSpeed", controls.cycle.value);
     params.set("panX", view.panX.toFixed(3));
     params.set("panY", view.panY.toFixed(3));
     params.set("zoom", view.zoom.toFixed(5));
     params.set("offsetX", offset.x);
     params.set("offsetY", offset.y);
     // Replace (not push) so we don't spam browser history during drags.
     history.replaceState(null, "", "#" + params.toString());
   }
   function hashToState() {
     const hash = window.location.hash.replace(/^#/, "");
     if (!hash) return false;
     const params = new URLSearchParams(hash);
     restoringFromHash = true;
     for (const key of Object.keys(controls)) {
       if (params.has(key)) controls[key].value = params.get(key);
     }
     if (params.has("panX")) view.panX = parseFloat(params.get("panX"));
     if (params.has("panY")) view.panY = parseFloat(params.get("panY"));
     if (params.has("zoom")) view.zoom = parseFloat(params.get("zoom"));
     if (params.has("offsetX")) offset.x = parseInt(params.get("offsetX"), 10);
     if (params.has("offsetY")) offset.y = parseInt(params.get("offsetY"), 10);
     restoringFromHash = false;
     return true;
   }


    function readOpts() {
      return {
        D: parseInt(controls.D.value, 10),
        mode: controls.mode.value,
        K: parseInt(controls.K.value, 10),
        alphaScale: parseFloat(controls.alpha.value),
        epsilon: parseFloat(controls.eps.value),
        size: parseInt(controls.size.value, 10),
        cmap: controls.cmap.value,
        cmap2d: controls.cmap2d.value,
        seed: parseInt(controls.seed.value, 10),
       panX: view.panX,
       panY: view.panY,
       zoom: view.zoom,
       offsetX: offset.x,
       offsetY: offset.y,
       colorPhase,
      };
    }

    function updateOutputs(o) {
      outputs.K.textContent = o.K;
      outputs.alpha.textContent = o.alphaScale.toFixed(3);
      outputs.eps.textContent = o.epsilon.toFixed(2);
      outputs.size.textContent = o.size;
      outputs.seed.textContent = o.seed;
      outputs.cycle.textContent = parseFloat(controls.cycle.value).toFixed(2);
      outputs.offset.textContent = `${offset.x}, ${offset.y}`;
    }

    function updateStats(o, result, elapsed) {
      statsEl.innerHTML = `
        <div><span>D</span><span>${o.D}</span></div>
        <div><span>&radic;D</span><span>${Math.sqrt(o.D).toFixed(6)}</span></div>
        <div><span>min</span><span>${result.min.toFixed(4)}</span></div>
        <div><span>max</span><span>${result.max.toFixed(4)}</span></div>
        <div><span>irr RMS</span><span>${result.irrRMS.toFixed(4)}</span></div>
        <div><span>sites</span><span>${o.size * o.size}</span></div>
       <div><span>zoom</span><span>${o.zoom.toFixed(3)}</span></div>
       <div><span>pan</span><span>${o.panX.toFixed(1)}, ${o.panY.toFixed(1)}</span></div>
       <div><span>offset</span><span>${offset.x}, ${offset.y}</span></div>
        <div><span>compute</span><span>${elapsed.toFixed(1)} ms</span></div>
      `;
    }

    // Cache the last computed result so color cycling can re-render cheaply
    // without recomputing the (expensive) field.
    let lastResult = null;
    let lastOpts = null;

    let pending = null;
    function regenerate() {
      const opts = readOpts();
      updateOutputs(opts);
     // Persist the current state to the URL hash for sharing.
     stateToHash();


      // Defer to next frame to keep slider drag responsive.
      if (pending) cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => {
        const t0 = performance.now();
        const result = computeField(opts);
        renderField(canvas, result, opts);
        const t1 = performance.now();
        updateStats(opts, result, t1 - t0);
        lastResult = result;
        lastOpts = opts;
        pending = null;
       updateFFT();
      });
    }

    // Re-render only (no recompute) using the cached field. Used for color
    // cycling, which only changes the colormap phase.
    function rerenderColor() {
      if (!lastResult) return;
      lastOpts = { ...lastOpts, colorPhase, cmap: controls.cmap.value, cmap2d: controls.cmap2d.value };
      renderField(canvas, lastResult, lastOpts);
    }

    // Wire up listeners.
    for (const key of Object.keys(controls)) {
      controls[key].addEventListener("input", regenerate);
      controls[key].addEventListener("change", regenerate);
    }
    document.getElementById("regen").addEventListener("click", regenerate);
   document.getElementById("resetView").addEventListener("click", () => {
     view.panX = 0;
     view.panY = 0;
     view.zoom = 1;
     regenerate();
   });

   // Reset the viewport when the grid size changes (keeps things sane).
   controls.size.addEventListener("change", () => {
     view.panX = 0;
     view.panY = 0;
     view.zoom = 1;
     regenerate();
   });

   // --- Export to PNG ---
   document.getElementById("exportPng").addEventListener("click", () => {
     const url = canvas.toDataURL("image/png");
     const a = document.createElement("a");
     const o = lastOpts || readOpts();
     a.href = url;
     a.download = `irrational_lattice_D${o.D}_K${o.K}_seed${o.seed}.png`;
     document.body.appendChild(a);
     a.click();
     document.body.removeChild(a);
   });

   // --- Integer offset paging ---
   function bumpOffset(dx, dy) {
     offset.x += dx;
     offset.y += dy;
     regenerate();
   }
   document.getElementById("offsetXMinus").addEventListener("click", () => bumpOffset(-1, 0));
   document.getElementById("offsetXPlus").addEventListener("click", () => bumpOffset(1, 0));
   document.getElementById("offsetYMinus").addEventListener("click", () => bumpOffset(0, -1));
   document.getElementById("offsetYPlus").addEventListener("click", () => bumpOffset(0, 1));

   // --- Parameter sweep buttons ---
   // Each sweep slowly animates a range slider back and forth.
   const sweeping = {}; // target -> { dir }
   function stepSweeps() {
     let any = false;
     for (const target of Object.keys(sweeping)) {
       if (!sweeping[target]) continue;
       any = true;
       const input = controls[target];
       const min = parseFloat(input.min);
       const max = parseFloat(input.max);
       const step = parseFloat(input.step) || (max - min) / 200;
       let val = parseFloat(input.value);
       const dir = sweeping[target].dir;
       // Advance by ~ (range / 200) per frame for a smooth sweep.
       const delta = Math.max(step, (max - min) / 400) * dir;
       val += delta;
       if (val >= max) { val = max; sweeping[target].dir = -1; }
       if (val <= min) { val = min; sweeping[target].dir = 1; }
       input.value = val;
     }
     if (any) regenerate();
   }
   document.querySelectorAll(".sweep-btn").forEach((btn) => {
     btn.addEventListener("click", () => {
       const target = btn.dataset.target;
       if (sweeping[target]) {
         delete sweeping[target];
         btn.classList.remove("active");
       } else {
         sweeping[target] = { dir: 1 };
         btn.classList.add("active");
       }
     });
   });

   // --- Animation loop: color cycling + parameter sweeps ---
   let lastT = performance.now();
   function animate(now) {
     const dt = (now - lastT) / 1000;
     lastT = now;

     const cycleSpeed = parseFloat(controls.cycle.value);
     const anySweep = Object.values(sweeping).some(Boolean);

     if (anySweep) {
       // Sweeps recompute the field; color phase advances along with it.
       if (cycleSpeed > 0) colorPhase = (colorPhase + cycleSpeed * dt) % 1;
       stepSweeps();
     } else if (cycleSpeed > 0) {
       // Only the colormap phase changes: cheap re-render without recompute.
       colorPhase = (colorPhase + cycleSpeed * dt) % 1;
       rerenderColor();
     }
     requestAnimationFrame(animate);
   }
   requestAnimationFrame(animate);

   // --- Fit canvas display size to available space ---
   function fitCanvas() {
     const wrap = canvas.parentElement;
     // Available width inside the wrap (minus its padding).
     const style = getComputedStyle(wrap);
     const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
     const avail = wrap.clientWidth - padX;
     // Keep it square; cap by viewport height too.
     const maxH = window.innerHeight * 0.9;
     const dim = Math.max(64, Math.min(avail, maxH));
     canvas.style.width = dim + "px";
     canvas.style.height = dim + "px";
   }
   window.addEventListener("resize", fitCanvas);

   // --- Pan & zoom interaction on the canvas ---
   // The canvas is displayed scaled (CSS) relative to its pixel resolution
   // (size x size). Convert client pixels to field pixels accordingly.
   function clientToFieldPixel(ev) {
     const rect = canvas.getBoundingClientRect();
     const fx = ((ev.clientX - rect.left) / rect.width) * canvas.width;
     const fy = ((ev.clientY - rect.top) / rect.height) * canvas.height;
     return { fx, fy };
   }
   // Convert a field pixel coordinate to lattice coordinates given the view.
   function pixelToLattice(fx, fy) {
     const size = canvas.width;
     return {
       x: (fx - size / 2) * view.zoom + view.panX,
       y: (fy - size / 2) * view.zoom + view.panY,
     };
   }
   let dragging = false;
   let dragStart = null;
   let panStart = null;
   canvas.addEventListener("mousedown", (ev) => {
     dragging = true;
     dragStart = clientToFieldPixel(ev);
     panStart = { x: view.panX, y: view.panY };
     canvas.style.cursor = "grabbing";
   });
   window.addEventListener("mousemove", (ev) => {
     if (!dragging) return;
     const cur = clientToFieldPixel(ev);
     // Drag moves the view: dragging right pulls content right => pan left.
     const dxPx = cur.fx - dragStart.fx;
     const dyPx = cur.fy - dragStart.fy;
     view.panX = panStart.x - dxPx * view.zoom;
     view.panY = panStart.y - dyPx * view.zoom;
     regenerate();
   });
   window.addEventListener("mouseup", () => {
     if (!dragging) return;
     dragging = false;
     canvas.style.cursor = "grab";
   });
   // Wheel to zoom, keeping the lattice point under the cursor fixed.
   canvas.addEventListener("wheel", (ev) => {
     ev.preventDefault();
     const { fx, fy } = clientToFieldPixel(ev);
     const before = pixelToLattice(fx, fy);
     const factor = ev.deltaY < 0 ? 1 / 1.1 : 1.1;
     view.zoom *= factor;
     // Clamp zoom to a reasonable range.
     view.zoom = Math.min(Math.max(view.zoom, 0.001), 1000);
     // Recompute pan so the cursor stays over the same lattice point.
     const size = canvas.width;
     view.panX = before.x - (fx - size / 2) * view.zoom;
     view.panY = before.y - (fy - size / 2) * view.zoom;
     regenerate();
   }, { passive: false });
   canvas.style.cursor = "grab";
   // --- 3D FFT floating subwindow ---
   const fftWindow = document.getElementById("fftWindow");
   const fftTitlebar = document.getElementById("fftTitlebar");
   const fftBody = document.getElementById("fftBody");
   const fftCanvas = document.getElementById("fftCanvas");
   const fftCollapse = document.getElementById("fftCollapse");
   const fftRefresh = document.getElementById("fftRefresh");
   const fftRot = document.getElementById("fftRot");
   const fftTilt = document.getElementById("fftTilt");
   const fftScale = document.getElementById("fftScale");
   let lastFFT = null;
   function updateFFT() {
     if (fftWindow.classList.contains("collapsed")) return;
     if (!lastResult) return;
     lastFFT = computeFFT2D(lastResult.data, lastOpts.size, 64);
     drawFFT();
   }
   function drawFFT() {
     if (!lastFFT) return;
     renderFFT3D(fftCanvas, lastFFT, {
       rot: parseFloat(fftRot.value),
       tilt: parseFloat(fftTilt.value),
       heightScale: parseFloat(fftScale.value),
     });
   }
   for (const el of [fftRot, fftTilt, fftScale]) {
     el.addEventListener("input", drawFFT);
   }
   fftRefresh.addEventListener("click", updateFFT);
   fftCollapse.addEventListener("click", () => {
     fftWindow.classList.toggle("collapsed");
     fftCollapse.textContent = fftWindow.classList.contains("collapsed") ? "▸" : "▾";
     updateFFT();
   });
   // Dragging the subwindow by its titlebar.
   let fwDragging = false;
   let fwStart = null;
   let fwOrigin = null;
   fftTitlebar.addEventListener("mousedown", (ev) => {
     // Ignore drags that start on a button.
     if (ev.target.closest("button")) return;
     fwDragging = true;
     const rect = fftWindow.getBoundingClientRect();
     fwStart = { x: ev.clientX, y: ev.clientY };
     fwOrigin = { x: rect.left, y: rect.top };
     // Switch from right-anchored to left/top positioning.
     fftWindow.style.left = rect.left + "px";
     fftWindow.style.top = rect.top + "px";
     fftWindow.style.right = "auto";
     ev.preventDefault();
   });
   window.addEventListener("mousemove", (ev) => {
     if (!fwDragging) return;
     const dx = ev.clientX - fwStart.x;
     const dy = ev.clientY - fwStart.y;
     fftWindow.style.left = Math.max(0, fwOrigin.x + dx) + "px";
     fftWindow.style.top = Math.max(0, fwOrigin.y + dy) + "px";
   });
   window.addEventListener("mouseup", () => { fwDragging = false; });


    // Initial render.
    fitCanvas();
   hashToState();
    regenerate();
   // Respond to external hash changes (shared link pasted, back/forward nav).
   window.addEventListener("hashchange", () => {
     if (restoringFromHash) return;
     if (hashToState()) regenerate();
   });