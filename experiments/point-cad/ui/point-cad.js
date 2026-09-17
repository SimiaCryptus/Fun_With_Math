// <point-cad> custom element: viewport, toolbar and floating tool windows,
// public embedding API.
import {
  registry as defaultRegistry, createSketch, cloneDeep, buildProblem, resetSolution, adoptSolution,
  removeEntity, toJSON, fromJSON, sniffFormat, evaluateConstraints, validateSketch, alignSketchFrame,
} from "../core/index.js";
import { parse, emit } from "../lang/index.js";
import { Viewport } from "./viewport.js";
import { h, bringToFront } from "./dom.js";
import { createVariablesPanel } from "./panels/variables.js";
import { createPointsPanel } from "./panels/points.js";
import { createConstraintsPanel } from "./panels/constraints.js";
import { createScriptPanel } from "./panels/script.js";
import { createSolvePanel } from "./panels/solve.js";

const PANELS = {
  variables: createVariablesPanel,
  points: createPointsPanel,
  constraints: createConstraintsPanel,
  script: createScriptPanel,
  solve: createSolvePanel,
};
const TITLES = { variables: "Variables", points: "Points", constraints: "Constraints", script: "Script", solve: "Solve" };
const DEFAULT_PANELS = "variables,points,constraints,script,solve";
const DEFAULT_OPEN = "constraints,solve";

const splitList = (s) => String(s ?? "").split(",").map((x) => x.trim()).filter(Boolean);

export class PointCad extends HTMLElement {
  static get observedAttributes() {
    return ["src", "readonly", "panels", "open", "theme"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.registry = defaultRegistry;
    this._sketch = createSketch();
    this._result = null;
    this._selection = new Set();
    this._pick = null;
    this._windows = new Map(); // name -> { name, panel, btn, open, x, y, index }
    this._built = false;
  }

  // ---- lifecycle -------------------------------------------------------
  connectedCallback() {
    if (!this._built) this._build();
    if (this.hasAttribute("src") && this.getAttribute("src") !== this._loadedSrc) this._loadSrc(this.getAttribute("src"));
  }

  attributeChangedCallback(name, oldValue, value) {
    if (!this._built) return;
    if (name === "src" && value && value !== oldValue) this._loadSrc(value);
    else if (name === "panels") this._buildPanels();
    else if (name === "open") this._applyOpenAttribute();
    else if (name === "readonly") this._refresh();
  }

  // ---- public properties ------------------------------------------------
  get readonly() {
    const v = this.getAttribute("readonly");
    return v !== null && v !== "false";
  }
  set readonly(v) {
    if (v) this.setAttribute("readonly", "");
    else this.removeAttribute("readonly");
  }

  get sketch() {
    return this._sketch;
  }
  set sketch(value) {
    this._sketch = createSketch(value ?? {});
    this._result = null;
    this._selection.clear();
    this._commit("set");
  }

  get result() {
    return this._result;
  }

  get selection() {
    return [...this._selection];
  }

  get viewport() {
    return this._viewport;
  }

  /** Names of the tool windows that are currently open. */
  get windows() {
    return [...this._windows.values()].filter((w) => w.open).map((w) => w.name);
  }

  // ---- public methods ---------------------------------------------------
  /** Execute PCS statements against the current sketch (structural diff). */
  exec(text) {
    const res = parse(text, { sketch: this._sketch, registry: this.registry });
    if (!res.ok) {
      this._error("parse", res.errors);
      return res;
    }
    this._adopt(res, text, "exec");
    return res;
  }

  /** Replace the sketch from a full PCS script (keeps the camera unless the script sets one). */
  fromScript(text) {
    const base = createSketch({ view: cloneDeep(this._sketch.view), solver: cloneDeep(this._sketch.solver) });
    const res = parse(text, { sketch: base, registry: this.registry });
    if (!res.ok) {
      this._error("parse", res.errors);
      return res;
    }
    this._adopt(res, text, "script");
    return res;
  }

  toScript(options) {
    return emit(this._sketch, { registry: this.registry, ...options });
  }

  toJSON() {
    return toJSON(this._sketch);
  }

  fromJSON(doc) {
    this.sketch = fromJSON(doc);
    return this._sketch;
  }

  /** Load a `.pcad` script or `.json` document from text, sniffing the format. */
  load(text, hint) {
    const format = hint ?? sniffFormat(text);
    if (format === "json") return this.fromJSON(text);
    return this.fromScript(text);
  }

  solve(options = {}) {
    const sk = this._sketch;
    let result;
    try {
      const solver = this.registry.solvers.has(sk.solver.method)
        ? this.registry.getSolver(sk.solver.method)
        : [...this.registry.solvers.values()][0];
      if (!solver) throw new Error("No solver registered");
      const issues = validateSketch(sk, this.registry);
      if (issues.length) throw new Error(issues.map((i) => `${i.path}: ${i.message}`).join("; "));
      const problem = buildProblem(sk, this.registry);
      result = solver.solve(problem, { maxIterations: sk.solver.maxIterations, tolerance: sk.solver.tolerance, ...options });
    } catch (e) {
      this._error("solve", e.message);
      throw e;
    }
    this._result = result;
    this._dispatch("pointcad:solve", { result, sketch: sk });
    this._commit("solve");
    return result;
  }

  reset() {
    resetSolution(this._sketch);
    this._result = null;
    this._commit("reset");
  }

  adopt() {
    adoptSolution(this._sketch);
    this._result = null;
    this._commit("adopt");
  }

  /** Re-centre the sketch and align it to its principal axes (no-op when anchored by 2+ fixed points). */
  center() {
    const changed = alignSketchFrame(this._sketch, this.registry);
    if (changed) this._commit("center");
    return changed;
  }

  remove(ref) {
    const removed = removeEntity(this._sketch, ref);
    if (removed) {
      this._selection.delete(removed.item.id);
      this._commit("delete");
    }
    return removed;
  }

  select(ids, additive = false) {
    const next = additive ? new Set(this._selection) : new Set();
    for (const id of ids ?? []) {
      if (additive && next.has(id)) next.delete(id);
      else next.add(id);
    }
    this._selection = next;
    this._dispatch("pointcad:select", { ids: [...next] });
    this._refresh();
  }

  startPick(needed, onDone) {
    this._pick = { needed, ids: [], onDone };
    this._refresh();
  }

  cancelPick() {
    this._pick = null;
    this._refresh();
  }

  /** Show (or hide) a tool window by name: variables, points, constraints, script, solve. */
  showWindow(name, open = true) {
    const w = this._windows.get(name);
    if (!w) return false;
    w.open = !!open;
    if (w.open) bringToFront(w.panel.el);
    this._refresh();
    return true;
  }

  hideWindow(name) {
    return this.showWindow(name, false);
  }

  toggleWindow(name) {
    const w = this._windows.get(name);
    return w ? this.showWindow(name, !w.open) : false;
  }

  // ---- internals --------------------------------------------------------
  _pickPoint(id) {
    const pick = this._pick;
    if (!pick) return false;
    if (!pick.ids.includes(id)) pick.ids.push(id);
    if (pick.ids.length >= pick.needed) {
      this._pick = null;
      pick.onDone?.(pick.ids);
    }
    this._refresh();
    return true;
  }

  _adopt(res, source, reason) {
    this._sketch = res.sketch;
    const ids = new Set(this._sketch.points.map((p) => p.id));
    this._selection = new Set([...this._selection].filter((id) => ids.has(id)));
    if (res.ops.some((op) => op.op !== "view" && op.op !== "def")) this._result = null;
    this._dispatch("pointcad:exec", { source, ops: res.ops });
    this._commit(reason);
    for (const cmd of res.commands) if (cmd.op === "solve") this.solve();
  }

  async _loadSrc(url) {
    this._loadedSrc = url;
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
      const text = await resp.text();
      const hint = /\.json$/i.test(url) ? "json" : /\.pcad$/i.test(url) ? "pcad" : undefined;
      this.load(text, hint);
    } catch (e) {
      this._error("load", `Could not load '${url}': ${e.message}`);
    }
  }

  _dispatch(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  _error(kind, detail) {
    this._dispatch("pointcad:error", { kind, detail });
  }

  _commit(reason) {
    if (!this._built) return;
    const script = this.toScript();
    this._dispatch("pointcad:change", { sketch: this._sketch, script, reason });
    this._refresh();
  }

  _refresh() {
    if (!this._built) return;
    this._root.classList.toggle("pc-readonly", this.readonly);
    this._projBtn.textContent = this._sketch.view.camera.projection === "orthographic" ? "Ortho" : "Persp";
    this._viewport.render();
    for (const w of this._windows.values()) {
      w.panel.el.hidden = !w.open;
      w.btn.classList.toggle("pc-active", w.open);
      w.btn.setAttribute("aria-pressed", String(w.open));
      if (w.open) w.panel.update();
    }
  }

  _makeContext() {
    const self = this;
    return {
      registry: this.registry,
      get sketch() { return self._sketch; },
      get result() { return self._result; },
      get selection() { return self._selection; },
      get readonly() { return self.readonly; },
      get pick() { return self._pick; },
      getSpace: () => self.registry.getSpace(self._sketch.space),
      evaluate: () => evaluateConstraints(self._sketch, self.registry),
      commit: (reason) => self._commit(reason),
      refresh: () => self._refresh(),
      select: (ids, additive) => self.select(ids, additive),
      solve: (o) => { try { return self.solve(o); } catch { return null; } },
      reset: () => self.reset(),
      adopt: () => self.adopt(),
      center: () => self.center(),
      exec: (t) => self.exec(t),
      fromScript: (t) => self.fromScript(t),
      toScript: () => self.toScript(),
      startPick: (n, cb) => self.startPick(n, cb),
      cancelPick: () => self.cancelPick(),
      pickPoint: (id) => self._pickPoint(id),
      showWindow: (name, open) => self.showWindow(name, open),
      error: (kind, detail) => self._error(kind, detail),
    };
  }

  _build() {
    const root = this.shadowRoot;
    root.replaceChildren();
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = new URL("./styles.css", import.meta.url).href;

    this._root = h("div", { class: "pc-root" });
    this._viewHost = h("div", { class: "pc-view" });
    this._layer = h("div", { class: "pc-windows" });
    this._toolWindows = h("div", { class: "pc-toolbar-group", role: "toolbar", "aria-label": "Tool windows" });

    this._ctx = this._makeContext();
    this._viewport = new Viewport(this._ctx);
    this._viewHost.append(this._viewport.el);
    const vp = this._viewport;
    const tool = (label, title, onclick, cls = "") =>
      h("button", { class: `pc-btn pc-tool ${cls}`.trim(), type: "button", title, onclick }, label);
    this._projBtn = tool("Persp", "Toggle perspective / orthographic (5)", () => vp.toggleProjection());
    this._toolView = h("div", { class: "pc-toolbar-group", role: "toolbar", "aria-label": "View" },
      tool("Solve", "Solve the sketch", () => this._ctx.solve(), "pc-primary"),
      tool("Center", "Re-centre the sketch and align it to its principal axes", () => this.center()),
      h("span", { class: "pc-tool-sep" }),
      tool("Fit", "Fit view to all points (F / double-click)", () => vp.fitAll()),
      tool("Iso", "Isometric view (0)", () => vp.setView("iso")),
      tool("Top", "Top view (7 · shift: bottom)", () => vp.setView("top")),
      tool("Front", "Front view (1 · shift: back)", () => vp.setView("front")),
      tool("Right", "Right view (3 · shift: left)", () => vp.setView("right")),
      this._projBtn,
    );
    this._toolbar = h("div", { class: "pc-toolbar" }, this._toolWindows, this._toolView);
    this._root.append(this._viewHost, this._layer, this._toolbar);
    root.append(link, this._root);

    this._layer.addEventListener("pc-window-close", (e) => {
      const name = e.target instanceof HTMLElement ? e.target.dataset.window : null;
      if (name) this.showWindow(name, false);
    });
    this._layer.addEventListener("pc-window-move", (e) => {
      const name = e.target instanceof HTMLElement ? e.target.dataset.window : null;
      const w = name ? this._windows.get(name) : null;
      if (w) {
        w.x = e.detail.x;
        w.y = e.detail.y;
      }
    });
    root.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this._pick) this.cancelPick();
      if ((e.key === "Delete" || e.key === "Backspace") && e.target === this._viewport.el && this._selection.size && !this.readonly) {
        for (const id of [...this._selection]) removeEntity(this._sketch, id);
        this._selection.clear();
        this._commit("delete");
      }
    });
    this._built = true;
    this._buildPanels();
    this._commit("init");
  }

  _buildPanels() {
    const wanted = splitList(this.getAttribute("panels") ?? DEFAULT_PANELS);
    const initiallyOpen = new Set(splitList(this.getAttribute("open") ?? DEFAULT_OPEN));
    const prev = this._windows;
    this._windows = new Map();
    this._toolWindows.replaceChildren();
    this._layer.replaceChildren();
    let index = 0;
    for (const name of wanted) {
      const factory = PANELS[name];
      if (!factory) continue;
      const panel = factory(this._ctx);
      const old = prev.get(name);
      const w = { name, panel, index: index++, open: old ? old.open : initiallyOpen.has(name), x: old?.x ?? null, y: old?.y ?? null };
      panel.el.dataset.window = name;
      w.btn = h("button", {
        class: "pc-btn pc-tool pc-toggle", type: "button", title: `Show / hide the ${TITLES[name] ?? name} window`, "aria-pressed": "false",
        onclick: () => this.toggleWindow(name),
      }, TITLES[name] ?? name);
      this._toolWindows.append(w.btn);
      this._layer.append(panel.el);
      this._placeWindow(w);
      this._windows.set(name, w);
    }
    this._toolWindows.hidden = this._windows.size === 0;
    this._refresh();
  }

  _placeWindow(w) {
    const el = w.panel.el;
    if (w.x != null && w.y != null) {
      el.style.left = `${w.x}px`;
      el.style.top = `${w.y}px`;
      el.style.right = "auto";
    } else {
      // cascade new windows down the right-hand side, below the toolbar
      el.style.right = `${12 + 18 * w.index}px`;
      el.style.top = `${52 + 28 * w.index}px`;
    }
  }

  _applyOpenAttribute() {
    const list = new Set(splitList(this.getAttribute("open") ?? DEFAULT_OPEN));
    for (const w of this._windows.values()) w.open = list.has(w.name);
    this._refresh();
  }
}

if (typeof customElements !== "undefined" && !customElements.get("point-cad")) {
  customElements.define("point-cad", PointCad);
}