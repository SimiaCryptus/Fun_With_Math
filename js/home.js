/* ─────────────────────────────────────────────────────────────
       Mathematical Explorations — Home page interactivity
       - Background particle/constellation canvas
       - Markdown rendering with Mermaid + MathJax + relative-link fix
       - README cache and expand-into-modal behavior
       ───────────────────────────────────────────────────────────── */

    /* ── Background canvas: drifting particles + constellation ── */

    (function initBackgroundCanvas() {
      const canvas = document.getElementById("bgCanvas");
      if (!canvas) return;
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }
      const ctx = canvas.getContext("2d");
      let width = 0;
      let height = 0;
      let dpr = Math.min(window.devicePixelRatio || 1, 2);
      let particles = [];
      const mouse = { x: -9999, y: -9999, active: false };

      function resize() {
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = width + "px";
        canvas.style.height = height + "px";
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const targetCount = Math.min(
          120,
          Math.floor((width * height) / 14000)
        );
        if (particles.length !== targetCount) {
          particles = new Array(targetCount).fill(0).map(() => spawn());
        }
      }

      function spawn() {
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.25,
          vy: (Math.random() - 0.5) * 0.25,
          r: Math.random() * 1.4 + 0.4,
          hue: Math.random() < 0.5 ? 212 : 268, // blue or purple-ish
          alpha: Math.random() * 0.5 + 0.25,
        };
      }

      function step() {
        ctx.clearRect(0, 0, width, height);
        // Update
        for (const p of particles) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < -10) p.x = width + 10;
          if (p.x > width + 10) p.x = -10;
          if (p.y < -10) p.y = height + 10;
          if (p.y > height + 10) p.y = -10;
        }
        // Connections
        const maxDist = 130;
        for (let i = 0; i < particles.length; i++) {
          const a = particles[i];
          for (let j = i + 1; j < particles.length; j++) {
            const b = particles[j];
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < maxDist * maxDist) {
              const d = Math.sqrt(d2);
              const t = 1 - d / maxDist;
              ctx.strokeStyle = `hsla(${(a.hue + b.hue) / 2}, 70%, 70%, ${t * 0.14})`;
              ctx.lineWidth = 0.6;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
          }
          // Mouse repulsion / attraction
          if (mouse.active) {
            const dx = a.x - mouse.x;
            const dy = a.y - mouse.y;
            const d2 = dx * dx + dy * dy;
            const R = 160;
            if (d2 < R * R) {
              const d = Math.sqrt(d2) || 1;
              const force = (1 - d / R) * 0.4;
              a.vx += (dx / d) * force * 0.15;
              a.vy += (dy / d) * force * 0.15;
              // Cap velocity
              const sp = Math.hypot(a.vx, a.vy);
              const maxSp = 1.2;
              if (sp > maxSp) {
                a.vx = (a.vx / sp) * maxSp;
                a.vy = (a.vy / sp) * maxSp;
              }
            } else {
              // Drift back toward gentle baseline
              a.vx *= 0.995;
              a.vy *= 0.995;
            }
          }
          // Particle dot
          ctx.fillStyle = `hsla(${a.hue}, 80%, 75%, ${a.alpha})`;
          ctx.beginPath();
          ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
          ctx.fill();
        }
        requestAnimationFrame(step);
      }

      window.addEventListener("resize", resize);
      window.addEventListener("mousemove", (e) => {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
        mouse.active = true;
      });
      window.addEventListener("mouseleave", () => {
        mouse.active = false;
      });
      resize();
      step();
    })();

    /* ── Marked configuration with Mermaid passthrough ──────────── */

    if (window.marked) {
      marked.setOptions({
        gfm: true,
        breaks: false,
        headerIds: false,
        mangle: false,
      });
      const mermaidRenderer = new marked.Renderer();
      const defaultCodeRenderer = mermaidRenderer.code.bind(mermaidRenderer);
      mermaidRenderer.code = function (code, infostring, escaped) {
        const lang = (infostring || "").trim().split(/\s+/)[0];
        if (lang === "mermaid") {
          return '<div class="mermaid tex2jax_ignore">' + code + "</div>";
        }
        return defaultCodeRenderer(code, infostring, escaped);
      };
      marked.use({ renderer: mermaidRenderer });
    }

    if (window.mermaid) {
      mermaid.initialize({
        startOnLoad: false,
        theme: "dark",
        securityLevel: "loose",
      });
    }

    let mermaidCounter = 0;

    async function renderMathAndDiagrams(rootEl) {
      if (!rootEl) return;
      if (window.mermaid) {
        const blocks = rootEl.querySelectorAll(
          ".mermaid:not([data-processed='true'])"
        );
        for (const el of blocks) {
          const src = el.textContent;
          const id = "mermaid-svg-" + ++mermaidCounter;
          try {
            const { svg, bindFunctions } = await mermaid.render(id, src);
            el.innerHTML = svg;
            if (bindFunctions) bindFunctions(el);
            el.setAttribute("data-processed", "true");
          } catch (err) {
            el.innerHTML =
              '<pre style="color:#f97583">Mermaid render error: ' +
              (err && err.message ? err.message : String(err)) +
              "</pre>";
            console.warn("Mermaid render failed:", err);
          }
        }
      }
      if (window.MathJax && window.MathJax.typesetPromise) {
        try {
          await window.MathJax.typesetPromise([rootEl]);
        } catch (err) {
          console.warn("MathJax typeset failed:", err);
        }
      }
    }

    /* ── Relative-link rewriting for embedded READMEs ──────────── */

    function rewriteRelative(html, baseDir) {
      const tmp = document.createElement("div");
      tmp.innerHTML = html;
      tmp.querySelectorAll("img[src]").forEach((img) => {
        const src = img.getAttribute("src");
        if (
          !/^([a-z]+:)?\/\//i.test(src) &&
          !src.startsWith("/") &&
          !src.startsWith("data:")
        ) {
          img.setAttribute("src", baseDir + src);
        }
        img.setAttribute("loading", "lazy");
      });
      tmp.querySelectorAll("a[href]").forEach((a) => {
        const href = a.getAttribute("href");
        if (
          !/^([a-z]+:)?\/\//i.test(href) &&
          !href.startsWith("#") &&
          !href.startsWith("/")
        ) {
          a.setAttribute("href", baseDir + href);
        }
        a.addEventListener("click", (e) => e.stopPropagation());
      });
      return tmp.innerHTML;
    }

    /* ── README loading + modal ────────────────────────────────── */

    const readmeCache = new Map();

    async function loadReadmes() {
      const cards = document.querySelectorAll(".featured-card[data-readme]");
      for (const card of cards) {
        const path = card.dataset.readme;
        const baseDir = path.substring(0, path.lastIndexOf("/") + 1);
        const target = card.querySelector(".readme-preview");
        try {
          const res = await fetch(path);
          if (!res.ok) throw new Error("HTTP " + res.status);
          const md = await res.text();
          const html = marked.parse(md);
          const rendered = rewriteRelative(html, baseDir);
          target.innerHTML = rendered;
          readmeCache.set(path, rendered);
          renderMathAndDiagrams(target);
        } catch (err) {
          target.innerHTML =
            '<p class="readme-loading">Description unavailable. Click to launch the lab.</p>';
          console.warn("Failed to load README:", path, err);
        }
      }
    }

    loadReadmes();

    const overlay = document.getElementById("modalOverlay");
    const modalIcon = document.getElementById("modalIcon");
    const modalTitle = document.getElementById("modalTitle");
    const modalLaunch = document.getElementById("modalLaunch");
    const modalBody = document.getElementById("modalBody");
    const modalClose = document.getElementById("modalClose");

    function openModal(card) {
      const href = card.dataset.href;
      const path = card.dataset.readme;
      const baseDir = path.substring(0, path.lastIndexOf("/") + 1);
      const icon =
        card.querySelector(".featured-card-icon")?.textContent || "";
      const title =
        card.querySelector(".featured-card-title")?.textContent || "";
      modalIcon.textContent = icon;
      modalTitle.textContent = title;
      modalLaunch.href = href;
      if (readmeCache.has(path)) {
        modalBody.innerHTML = readmeCache.get(path);
        renderMathAndDiagrams(modalBody);
      } else {
        modalBody.innerHTML =
          '<p class="readme-loading">Loading description…</p>';
        fetch(path)
          .then((r) => {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.text();
          })
          .then((md) => {
            const rendered = rewriteRelative(marked.parse(md), baseDir);
            readmeCache.set(path, rendered);
            modalBody.innerHTML = rendered;
            renderMathAndDiagrams(modalBody);
          })
          .catch((err) => {
            modalBody.innerHTML =
              '<p class="readme-loading">Description unavailable.</p>';
            console.warn("Failed to load README:", path, err);
          });
      }
      overlay.classList.add("open");
      overlay.setAttribute("aria-hidden", "false");
      document.body.classList.add("modal-open");
      overlay.scrollTop = 0;
    }

    function closeModal() {
      overlay.classList.remove("open");
      overlay.setAttribute("aria-hidden", "true");
      document.body.classList.remove("modal-open");
    }

    document
      .querySelectorAll(".featured-card[data-readme]")
      .forEach((card) => {
        card.addEventListener("click", (e) => {
          if (e.target.closest(".featured-card-launch")) return;
          if (
            e.target.closest("a") &&
            !e.target.closest(".featured-card-launch")
          )
            return;
          e.preventDefault();
          openModal(card);
        });
        card.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openModal(card);
          }
        });
      });

    modalClose.addEventListener("click", closeModal);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && overlay.classList.contains("open"))
        closeModal();
    });