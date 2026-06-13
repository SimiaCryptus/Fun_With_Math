// Entry point: wires UI controls to the field generator and renderer.

    import { computeField } from "./field.js";
    import { renderField } from "./render.js";

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
      seed: document.getElementById("seed"),
    };

    const outputs = {
      K: document.getElementById("kOut"),
      alpha: document.getElementById("alphaOut"),
      eps: document.getElementById("epsOut"),
      size: document.getElementById("sizeOut"),
      seed: document.getElementById("seedOut"),
    };

    function readOpts() {
      return {
        D: parseInt(controls.D.value, 10),
        mode: controls.mode.value,
        K: parseInt(controls.K.value, 10),
        alphaScale: parseFloat(controls.alpha.value),
        epsilon: parseFloat(controls.eps.value),
        size: parseInt(controls.size.value, 10),
        cmap: controls.cmap.value,
        seed: parseInt(controls.seed.value, 10),
      };
    }

    function updateOutputs(o) {
      outputs.K.textContent = o.K;
      outputs.alpha.textContent = o.alphaScale.toFixed(3);
      outputs.eps.textContent = o.epsilon.toFixed(2);
      outputs.size.textContent = o.size;
      outputs.seed.textContent = o.seed;
    }

    function updateStats(o, result, elapsed) {
      statsEl.innerHTML = `
        <div><span>D</span><span>${o.D}</span></div>
        <div><span>&radic;D</span><span>${Math.sqrt(o.D).toFixed(6)}</span></div>
        <div><span>min</span><span>${result.min.toFixed(4)}</span></div>
        <div><span>max</span><span>${result.max.toFixed(4)}</span></div>
        <div><span>irr RMS</span><span>${result.irrRMS.toFixed(4)}</span></div>
        <div><span>sites</span><span>${o.size * o.size}</span></div>
        <div><span>compute</span><span>${elapsed.toFixed(1)} ms</span></div>
      `;
    }

    let pending = null;
    function regenerate() {
      const opts = readOpts();
      updateOutputs(opts);

      // Defer to next frame to keep slider drag responsive.
      if (pending) cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => {
        const t0 = performance.now();
        const result = computeField(opts);
        renderField(canvas, result, opts);
        const t1 = performance.now();
        updateStats(opts, result, t1 - t0);
        pending = null;
      });
    }

    // Wire up listeners.
    for (const key of Object.keys(controls)) {
      controls[key].addEventListener("input", regenerate);
      controls[key].addEventListener("change", regenerate);
    }
    document.getElementById("regen").addEventListener("click", regenerate);

    // Initial render.
    regenerate();