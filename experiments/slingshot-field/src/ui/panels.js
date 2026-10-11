/**
 * Floating tool windows.
 *
 * Every element with class "panel" becomes a draggable, collapsible window.
 * Markup: <div class="panel" id="..." data-title="Title" [data-help="tooltip"]> ...content... </div>
 * The header and .body wrapper are created automatically if they are missing.
 *
 * - drag the header to move
 * - click ▾/▸ or double-click the header to collapse / expand
 * - shift + double-click any header to reset the layout
 * - positions, sizes and collapsed states persist in localStorage
  * - data-width / data-height set default sizes; data-dock="right" docks a panel to the right edge
 */
const KEY = 'slingshot-field.panels.v3';
const MARGIN = 8;
let panels = [];
let zTop = 10;

export function installPanels() {
    panels = [...document.querySelectorAll('.panel')];
    if (panels.length && getComputedStyle(panels[0]).position !== 'absolute') {
        console.error('panels.js: .panel is not position:absolute — css/style.css was not loaded ' +
            '(check the <link href> path relative to index.html). Panels cannot float, move or collapse.');
    }
    panels.forEach(build);
    defaultLayout();
    const saved = load();
    if (saved) apply(saved);
    panels.forEach(clamp);
    window.addEventListener('resize', () => panels.forEach(clamp));
}

function build(p) {
    let header = p.querySelector(':scope > header');
    let body = p.querySelector(':scope > .body');
    if (!body) {
        body = document.createElement('div');
        body.className = 'body';
        while (p.firstChild && p.firstChild !== header) body.appendChild(p.firstChild);
        p.appendChild(body);
    }
    if (!header) {
        header = document.createElement('header');
        const ttl = document.createElement('span');
        ttl.className = 'ttl';
        ttl.textContent = p.dataset.title || p.id || 'Panel';
        header.appendChild(ttl);
        if (p.dataset.help) {
            const h = document.createElement('span');
            h.className = 'help';
            h.textContent = '?';
             h.dataset.tip = p.dataset.help;
            header.appendChild(h);
        }
        const tog = document.createElement('button');
        tog.className = 'tog';
        tog.type = 'button';
        header.appendChild(tog);
        p.insertBefore(header, p.firstChild);
    }
    const tog = header.querySelector('.tog');
    updateToggle(p);

    p.addEventListener('pointerdown', () => front(p));
    tog.addEventListener('pointerdown', (e) => e.stopPropagation());
    tog.addEventListener('click', (e) => {
        e.stopPropagation();
        setCollapsed(p, !p.classList.contains('collapsed'));
        save();
    });
    header.addEventListener('dblclick', (e) => {
        if (e.target.closest('.tog')) return;
        if (e.shiftKey) {
            resetLayout();
            return;
        }
        setCollapsed(p, !p.classList.contains('collapsed'));
        save();
    });

    let drag = null;
    header.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || e.target.closest('.tog, .help')) return;
        front(p);
        drag = {dx: e.clientX - p.offsetLeft, dy: e.clientY - p.offsetTop, id: e.pointerId};
        header.setPointerCapture(e.pointerId);
        header.classList.add('dragging');
        e.preventDefault();
    });
    header.addEventListener('pointermove', (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        p.style.left = `${e.clientX - drag.dx}px`;
        p.style.top = `${e.clientY - drag.dy}px`;
        clamp(p);
    });
    const end = (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        drag = null;
        header.classList.remove('dragging');
        save();
    };
    header.addEventListener('pointerup', end);
    header.addEventListener('pointercancel', end);

    // Persist manual resizes (CSS resize handle) of resizable panels.
    if (p.classList.contains('resizable') || p.classList.contains('plot')) {
        p.addEventListener('pointerup', () => save());
    }
}

function updateToggle(p) {
    const tog = p.querySelector(':scope > header .tog');
    if (!tog) return;
    const c = p.classList.contains('collapsed');
    tog.textContent = c ? '▸' : '▾';
    tog.title = c ? 'expand' : 'collapse';
}

function setCollapsed(p, c) {
    p.classList.toggle('collapsed', c);
    updateToggle(p);
    clamp(p);
}

function front(p) {
    p.style.zIndex = String(++zTop);
}

/** Keep at least part of the header on screen. */
function clamp(p) {
    const W = window.innerWidth, H = window.innerHeight, w = p.offsetWidth;
    let x = p.offsetLeft, y = p.offsetTop;
    x = Math.min(Math.max(x, 60 - w), W - 60);
    y = Math.min(Math.max(y, 0), H - 24);
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
}

/** Stack the panels top-to-bottom in columns along the left edge. */
function defaultLayout() {
    let x = MARGIN, y = MARGIN, colW = 0;
    for (const p of panels) {
         const dock = p.dataset.dock === 'right';
         let w0 = p.dataset.width ? +p.dataset.width : 0, h0 = p.dataset.height ? +p.dataset.height : 0;
         if (dock && w0) w0 = Math.min(w0, Math.max(260, window.innerWidth * 0.55));
         if (h0) h0 = Math.min(h0, window.innerHeight - 2 * MARGIN);
         p.style.width = w0 ? `${w0}px` : '';
         p.style.height = h0 ? `${h0}px` : '';
        setCollapsed(p, p.dataset.collapsed === 'true');
        p.style.left = '0px';
        p.style.top = '0px';
        const w = p.offsetWidth, h = p.offsetHeight;
         if (dock) {
             p.style.left = `${Math.max(MARGIN, window.innerWidth - w - MARGIN)}px`;
             p.style.top = `${MARGIN}px`;
             continue;
         }
        if (y > MARGIN && y + h > window.innerHeight - MARGIN) {
            x += colW + MARGIN;
            y = MARGIN;
            colW = 0;
        }
        p.style.left = `${x}px`;
        p.style.top = `${y}px`;
        y += h + MARGIN;
        colW = Math.max(colW, w);
    }
}

function resetLayout() {
    try {
        localStorage.removeItem(KEY);
    } catch { /* ignore */ }
    defaultLayout();
    panels.forEach(clamp);
}

function save() {
    const s = {};
    for (const p of panels) {
        if (!p.id) continue;
        const e = {x: p.offsetLeft, y: p.offsetTop, collapsed: p.classList.contains('collapsed')};
        if ((p.classList.contains('resizable') || p.classList.contains('plot')) && !e.collapsed) {
            e.w = p.offsetWidth;
            e.h = p.offsetHeight;
        }
        s[p.id] = e;
    }
    try {
        localStorage.setItem(KEY, JSON.stringify(s));
    } catch { /* storage unavailable */ }
}

function load() {
    try {
        const s = JSON.parse(localStorage.getItem(KEY) || 'null');
        return s && typeof s === 'object' ? s : null;
    } catch {
        return null;
    }
}

function apply(s) {
    for (const p of panels) {
        const e = p.id && s[p.id];
        if (!e) continue;
        if (Number.isFinite(e.x)) p.style.left = `${e.x}px`;
        if (Number.isFinite(e.y)) p.style.top = `${e.y}px`;
        if (Number.isFinite(e.w)) p.style.width = `${e.w}px`;
        if (Number.isFinite(e.h)) p.style.height = `${e.h}px`;
        setCollapsed(p, !!e.collapsed);
    }
}