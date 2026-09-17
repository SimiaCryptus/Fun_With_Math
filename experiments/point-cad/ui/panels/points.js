import { h, fmt, panelShell } from "../dom.js";
import { addPoint, removeEntity, uniqueName } from "../../core/model.js";

const AXIS = ["x", "y", "z", "w"];

export function createPointsPanel(ctx) {
  const body = h("div");
  const el = panelShell("Points", body);

  function update() {
    const sk = ctx.sketch;
    const ro = ctx.readonly;
    const dim = ctx.getSpace().dim;
    body.replaceChildren();
    const tbody = h("tbody");
    for (const p of sk.points) {
      const selected = ctx.selection.has(p.id);
      const row = h("tr", { class: `${selected ? "pc-row-selected" : ""}${p.macro ? " pc-macro" : ""}`,
        onclick: (e) => { if (!(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLButtonElement)) ctx.select([p.id], e.shiftKey); } },
        h("td", {}, h("input", { type: "text", class: "pc-in pc-in-name", value: p.label, disabled: ro,
          onchange: (e) => { p.label = e.target.value.trim() || p.label; ctx.commit("point"); } })),
        ...Array.from({ length: dim }, (_, k) =>
          h("td", {}, h("input", { type: "number", step: "any", class: "pc-in pc-in-num", value: p.seed[k] ?? 0, disabled: ro, title: `seed ${AXIS[k] ?? k}`,
            onchange: (e) => { p.seed[k] = Number(e.target.value) || 0; delete p.solved; ctx.commit("point"); } }))),
        h("td", {}, h("input", { type: "checkbox", checked: p.fixed, disabled: ro, title: "Fixed (anchor)",
          onchange: (e) => { p.fixed = e.target.checked; ctx.commit("point"); } })),
        h("td", {}, ro ? null : h("button", { class: "pc-icon", title: "Delete point", onclick: () => { removeEntity(sk, p.id); ctx.commit("point"); } }, "✕")),
      );
      tbody.append(row);
      if (p.solved) {
        tbody.append(h("tr", { class: "pc-subrow" }, h("td", { colspan: dim + 3, class: "pc-muted" }, `solved: (${p.solved.map((v) => fmt(v)).join(", ")})`)));
      }
    }
    body.append(
      h("table", { class: "pc-table" },
        h("thead", {}, h("tr", {}, h("th", {}, "Label"), ...Array.from({ length: dim }, (_, k) => h("th", {}, AXIS[k] ?? String(k))), h("th", {}, "Fix"), h("th"))),
        tbody,
      ),
    );
    if (!ro) {
      body.append(h("button", { class: "pc-btn", onclick: () => {
        const p = addPoint(sk, { label: uniqueName(sk, nextLetter(sk)), seed: Array.from({ length: dim }, () => 0) });
        ctx.select([p.id]);
        ctx.commit("point");
      } }, "+ Point"));
    }
  }

  return { el, update };
}

function nextLetter(sk) {
  const used = new Set(sk.points.map((p) => p.label));
  for (let i = 0; i < 26; i++) {
    const c = String.fromCharCode(65 + i);
    if (!used.has(c)) return c;
  }
  return "P";
}