/**
 * Hover readouts.
 *
 * - Any element with a data-tip attribute (or inside one) shows its text after a short delay.
 * - showTip / hideTip let canvases display live readouts at the cursor.
 */
let el = null, cur = null, timer = 0, lx = 0, ly = 0;

function tipEl() {
    if (!el) {
        el = document.getElementById('tip') || document.createElement('div');
        el.id = 'tip';
        if (!el.isConnected) document.body.appendChild(el);
    }
    return el;
}

function place(t, x, y) {
    const pad = 14, w = t.offsetWidth, h = t.offsetHeight;
    let px = x + pad, py = y + pad + 4;
    if (px + w > window.innerWidth - 4) px = x - pad - w;
    if (py + h > window.innerHeight - 4) py = y - pad - h;
    t.style.left = `${Math.max(4, px)}px`;
    t.style.top = `${Math.max(4, py)}px`;
}

export function showTip(x, y, text, {wrap = false} = {}) {
    const t = tipEl();
    t.textContent = text;
    t.classList.toggle('wrap', wrap);
    t.style.display = 'block';
    place(t, x, y);
}

export function hideTip() {
    clearTimeout(timer);
    if (el) el.style.display = 'none';
}

export function installTips() {
    tipEl();
    // Capture phase, so canvas readouts (bubbling listeners) can override in the same event.
    document.addEventListener('pointermove', (e) => {
        lx = e.clientX;
        ly = e.clientY;
        const t = e.target instanceof Element ? e.target.closest('[data-tip]') : null;
        if (t !== cur) {
            hideTip();
            cur = t;
            if (t) timer = setTimeout(() => {
                if (cur === t && t.isConnected && t.dataset.tip) showTip(lx, ly, t.dataset.tip, {wrap: true});
            }, 350);
        } else if (t && el.style.display === 'block') place(el, lx, ly);
    }, true);
    document.addEventListener('pointerdown', () => {
        if (cur) hideTip();
    }, true);
    window.addEventListener('blur', hideTip);
}