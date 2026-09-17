// Minimal DOM helpers shared by the panels.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "value") el.value = v;
    else if (k === "checked") el.checked = !!v;
    else if (k === "disabled") el.disabled = !!v;
    else if (k === "dataset") Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

export function fmt(n, digits = 3) {
  if (n == null || !Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a !== 0 && (a < 1e-4 || a >= 1e7)) return n.toExponential(2);
  return String(Math.round(n * 10 ** digits) / 10 ** digits);
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
let zTop = 20;

/** Raise a floating window above its siblings. */
export function bringToFront(el) {
  el.style.zIndex = String(++zTop);
}

/**
 * Floating tool window: draggable title bar, close button, resizable body.
 * Closing dispatches a bubbling `pc-window-close` event (or calls `onClose`);
 * the end of a drag dispatches `pc-window-move` with `{ x, y }`.
 */
export function panelShell(title, body, { onClose = null } = {}) {
  const win = h("section", { class: "pc-window", role: "dialog", "aria-label": title });
  const closeBtn = h("button", {
    class: "pc-window-close", type: "button", title: `Close ${title}`,
    onclick: () => {
      if (onClose) onClose();
      else win.dispatchEvent(new CustomEvent("pc-window-close", { bubbles: true }));
    },
  }, "✕");
  const head = h("div", { class: "pc-window-head" }, h("span", { class: "pc-panel-title" }, title), closeBtn);
  win.append(head, h("div", { class: "pc-panel-body" }, body));

  win.addEventListener("pointerdown", () => bringToFront(win));
  head.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || (e.target instanceof Element && e.target.closest("button"))) return;
    const parent = win.offsetParent ?? win.parentElement;
    if (!parent) return;
    const x0 = win.offsetLeft;
    const y0 = win.offsetTop;
    const sx = e.clientX;
    const sy = e.clientY;
    win.style.left = `${x0}px`;
    win.style.top = `${y0}px`;
    win.style.right = "auto";
    const move = (ev) => {
      win.style.left = `${clamp(x0 + ev.clientX - sx, 0, Math.max(0, parent.clientWidth - 80))}px`;
      win.style.top = `${clamp(y0 + ev.clientY - sy, 0, Math.max(0, parent.clientHeight - 32))}px`;
    };
    const stop = () => {
      head.removeEventListener("pointermove", move);
      head.removeEventListener("pointerup", stop);
      head.removeEventListener("pointercancel", stop);
      win.dispatchEvent(new CustomEvent("pc-window-move", { bubbles: true, detail: { x: win.offsetLeft, y: win.offsetTop } }));
    };
    head.addEventListener("pointermove", move);
    head.addEventListener("pointerup", stop);
    head.addEventListener("pointercancel", stop);
    try { head.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    e.preventDefault();
  });
  return win;
}

export function statusDot(status, title) {
  return h("span", { class: `pc-dot pc-status-${status}`, title: title ?? status });
}