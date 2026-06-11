// ui.js
// Side-panel rendering of selected tile info and walk history.

// ── Docs panel ────────────────────────────────────────────────────────────────
let _docCache = {};   // filename → rendered HTML
let _activeDoc = "README.md";

// ── MathJax helpers ──────────────────────────────────────────────────────────
/**
 * Render markdown while preserving LaTeX math blocks.
 * marked will mangle $...$ and $$...$$ if we let it see them raw,
 * so we extract all math spans first, replace with placeholders,
 * run marked, then restore the originals.
 */
function markedWithMath(src) {
    const stash = [];
    // Order matters: match display math ($$) before inline ($).
    const escaped = src
        // Display math: $$...$$  (possibly multi-line)
        .replace(/\$\$([\s\S]+?)\$\$/g, (_, inner) => {
            stash.push(`\\[${inner}\\]`);
            return `@@MATH${stash.length - 1}@@`;
        })
        // Inline math: $...$  (single line only)
        .replace(/\$([^\n$]+?)\$/g, (_, inner) => {
            stash.push(`\\(${inner}\\)`);
            return `@@MATH${stash.length - 1}@@`;
        });
    let html = marked.parse(escaped);
    // Restore math, but make sure the placeholder wasn't HTML-escaped.
    html = html.replace(/@@MATH(\d+)@@/g, (_, i) => stash[Number(i)]);
    // marked sometimes wraps a lone placeholder in <p>; that's fine for MathJax.
    return html;
}

/**
 * Ask MathJax to typeset a DOM element.
 * Safe to call even before MathJax has finished loading.
 */
function typesetMath(el) {
    if (!el) return;
    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([el]).catch(err =>
            console.warn("MathJax typeset error:", err));
    } else {
        // MathJax not yet loaded; retry once it signals readiness.
        window.addEventListener("load", () => {
            if (window.MathJax && window.MathJax.typesetPromise) {
                window.MathJax.typesetPromise([el]).catch(err =>
                    console.warn("MathJax typeset error:", err));
            }
        }, {once: true});
    }
}

async function loadDoc(filename) {
    if (_docCache[filename] !== undefined) return _docCache[filename];
    try {
        const resp = await fetch(filename);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const text = await resp.text();
        // marked is loaded as a plain <script> tag (global), not an ES module.
        // We protect LaTeX delimiters from marked's escape processing by
        // temporarily replacing them before parsing, then restoring them.
        const html = (typeof marked !== "undefined")
            ? markedWithMath(text)
            : `<pre>${text.replace(/[&<>]/g, c =>
                ({"&": "&amp;", "<": "&lt;", ">": "&gt;"}[c]))}</pre>`;
        _docCache[filename] = html;
        return html;
    } catch (err) {
        const msg = `<em style="color:#f38ba8">Could not load ${filename}: ${err.message}</em>`;
        _docCache[filename] = msg;
        return msg;
    }
}

async function showDoc(filename) {
    _activeDoc = filename;
    const contentEl = document.getElementById("doc-content");
    if (!contentEl) return;
    contentEl.innerHTML = "<em>Loading…</em>";
    contentEl.innerHTML = await loadDoc(filename);
    typesetMath(contentEl);
}

export function initDocs() {
    const tabs = document.querySelectorAll(".doc-tab");
    tabs.forEach(btn => {
        if (btn.id === "docMaximize") return;   // handled separately
        btn.addEventListener("click", () => {
            tabs.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            showDoc(btn.dataset.doc);
        });
    });
    // Load the default tab immediately when the section is first opened.
    const section = document.getElementById("docs-section");
    if (section) {
        // Lazy-load on first open of the <details> element.
        let loaded = false;
        section.addEventListener("toggle", () => {
            if (section.open && !loaded) {

                loaded = true;
                showDoc(_activeDoc);
            }
        });
    }
    // ── Maximize button ──────────────────────────────────────────────────────
    const maximizeBtn = document.getElementById("docMaximize");
    const modal = document.getElementById("doc-modal");
    const modalClose = document.getElementById("docModalClose");
    const modalBody = document.getElementById("doc-modal-content");
    const modalTabs = document.getElementById("docModalTabs");
    if (!maximizeBtn || !modal) return;
    // Build tab buttons inside the modal that mirror the sidebar tabs.
    const DOC_TABS = [
        {label: "Overview", doc: "README.md"},
        {label: "Concept", doc: "idea.md"},
        {label: "Erdos", doc: "erdos.md"},
        {label: "Irregular", doc: "affine.md"},
        {label: "Polyhedra", doc: "polyhedra.md"},
    ];

    function syncModalTabs() {
        modalTabs.querySelectorAll(".doc-tab").forEach(b => {
            b.classList.toggle("active", b.dataset.doc === _activeDoc);
        });
    }

    DOC_TABS.forEach(({label, doc}) => {
        const btn = document.createElement("button");
        btn.className = "doc-tab";
        btn.dataset.doc = doc;
        btn.textContent = label;
        btn.addEventListener("click", async () => {
            _activeDoc = doc;
            syncModalTabs();
            // Also sync the sidebar tabs.
            document.querySelectorAll(".doc-tab:not(.doc-maximize)").forEach(b => {
                b.classList.toggle("active", b.dataset.doc === doc);
            });
            modalBody.innerHTML = "<em>Loading…</em>";
            modalBody.innerHTML = await loadDoc(doc);
            typesetMath(modalBody);
        });
        modalTabs.appendChild(btn);
    });

    async function openModal() {
        modal.style.display = "flex";
        document.body.style.overflow = "hidden";
        syncModalTabs();
        modalBody.innerHTML = "<em>Loading…</em>";
        modalBody.innerHTML = await loadDoc(_activeDoc);
        typesetMath(modalBody);
    }

    function closeModal() {
        modal.style.display = "none";
        document.body.style.overflow = "";
    }

    maximizeBtn.addEventListener("click", openModal);
    modalClose.addEventListener("click", closeModal);
    // Close on backdrop click.
    modal.addEventListener("click", (e) => {
        if (e.target === modal) closeModal();
    });
    // Close on Escape key.
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && modal.style.display !== "none") {
            e.stopPropagation();
            closeModal();
        }
    });
}

export function renderTileInfo(el, tile, lattice) {
    if (!tile) {
        el.innerHTML = "<em>No tile selected.</em>";
        return;
    }
    const [cxF, cyF] = tile.centroidF;
    const html = [];

    // --- Summary section ---
    html.push(`<div class="section">Identity</div>`);
    html.push(kv("Index", `<code>#${tile.index}</code>`));
    html.push(kv("Depth", `${tile.depth} hop${tile.depth === 1 ? "" : "s"} from origin`));
    html.push(kv("Sheet",
        `<span class="pill sheet">s${tile.sheet}</span>
       <span style="color:var(--muted);font-size:11px">mod ${lattice.groupOrder}</span>`));
    const n = tile.n || (tile.vertsF ? tile.vertsF.length : 5);
    if (tile.isSierpinski) {
        html.push(kv("Type", `<span class="pill">Sierpiński triangle</span>`));
        html.push(kv("Scale", `<span class="pill">1/${Math.pow(2, tile.depth)}</span>`));
    } else {
        const isOdd = n % 2 === 1;
        if (isOdd) {
            html.push(kv("Orientation σ",
                `<span class="pill">${tile.sigma === 0 ? "↑" : "↓"}</span>
           <span style="color:var(--muted);font-size:11px">Z₂ bipartition (odd n-gon)</span>`));
        }
        html.push(kv("Edge frame",
            `<span class="pill">f${tile.orient}</span>
         <span style="color:var(--muted);font-size:11px">vertex-labeling ∈ Z${n}</span>`));
        html.push(kv("n-gon", `<span class="pill">${n}-gon</span>`));
    }

    // --- Centroid ---
    html.push(`<div class="section">Centroid</div>`);
    html.push(floatBlock(cxF, cyF));

    // --- Vertices ---
    html.push(`<div class="section">Vertices</div>`);
    for (let i = 0; i < tile.verts.length; i++) {
        const [fx, fy] = tile.vertsF[i];
        html.push(`<div class="vertex-row">
        <span class="pill">v${i}</span>
       ${floatBlock(fx, fy)}
      </div>`);
    }

    // --- Neighbors ---
    html.push(`<div class="section">Neighbors</div>`);
    for (let k = 0; k < tile.neighbors.length; k++) {
        const nIdx = tile.neighbors[k];
        if (nIdx === null) {
            html.push(`<div class="neighbor-row missing">
          <span class="pill edge">edge ${k + 1}</span>
          <span>out of lattice</span>
          <span></span>
        </div>`);
            continue;
        }
        const nb = lattice.tiles[nIdx];
        html.push(`<div class="neighbor-row">
        <span class="pill edge">edge ${k + 1}</span>
      <span>→ #${nb.index} · <span style="color:var(--accent3)">s${nb.sheet}</span> · <span style="color:var(--accent2)">o${nb.orient}</span></span>
        <span class="delta">Δs = +${tile.neighborSheetDeltas[k]}</span>
      </div>`);
    }

    el.innerHTML = html.join("");
}

function kv(label, content) {
    return `<div class="kv">
      <span class="k">${label}</span>
      <span class="v">${content}</span>
    </div>`;
}

function floatBlock(fx, fy) {
    return `<div class="alg-block">
     <div><span class="axis">x</span>= ${fx.toFixed(8)}</div>
     <div><span class="axis">y</span>= ${fy.toFixed(8)}</div>
   </div>`;
}

function escapeHtml(s) {
    return s.replace(/[&<>]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;"}[c]));
}

export function appendWalkStep(listEl, tile, edgeK, reason) {
    const li = document.createElement("li");
    const r = reason ? ` <span style="color:var(--muted)">(${reason})</span>` : "";
    const n = tile.n || (tile.vertsF ? tile.vertsF.length : 5);
    li.innerHTML = edgeK !== null
        ? `<span class="pill edge">e${edgeK + 1}</span> → #${tile.index}
         <span class="pill sheet">s${tile.sheet}</span>
         <span class="pill">o${tile.orient}</span>${r}`
        : `<span style="color:var(--accent)">●</span> start #${tile.index}
         <span class="pill sheet">s${tile.sheet}</span>${r}`;
    listEl.appendChild(li);
    listEl.scrollTop = listEl.scrollHeight;
}

export function clearWalk(listEl) {
    listEl.innerHTML = "";
}