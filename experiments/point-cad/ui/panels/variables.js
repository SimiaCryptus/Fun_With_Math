import { h, fmt, panelShell } from "../dom.js";
import { addVariable, removeEntity, uniqueName, IDENT_RE } from "../../core/model.js";

export function createVariablesPanel(ctx) {
  const body = h("div");
  const el = panelShell("Variables", body);

  function update() {
    const sk = ctx.sketch;
    const ro = ctx.readonly;
    body.replaceChildren();
    const tbody = h("tbody");
    for (const v of sk.variables) {
      tbody.append(
        h("tr", { class: v.macro ? "pc-macro" : "" },
          h("td", {}, h("input", { type: "text", class: "pc-in pc-in-name", value: v.name, disabled: ro,
            onchange: (e) => {
              const name = e.target.value.trim();
              if (!IDENT_RE.test(name)) { ctx.error("validation", `'${name}' is not a valid identifier`); e.target.value = v.name; return; }
              v.name = name;
              ctx.commit("variable");
            } })),
          h("td", {}, h("input", { type: "number", step: "any", class: "pc-in pc-in-num", value: v.value, disabled: ro,
            onchange: (e) => { v.value = Number(e.target.value) || 0; delete v.solved; ctx.commit("variable"); } })),
          h("td", { class: "pc-muted" }, v.solved != null ? fmt(v.solved) : "—"),
          h("td", {}, h("input", { type: "checkbox", checked: v.locked, disabled: ro, title: "Locked (solver may not change it)",
            onchange: (e) => { v.locked = e.target.checked; ctx.commit("variable"); } })),
          h("td", {}, ro ? null : h("button", { class: "pc-icon", title: "Delete variable", onclick: () => { removeEntity(sk, v.id); ctx.commit("variable"); } }, "✕")),
        ),
      );
    }
    body.append(
      h("table", { class: "pc-table" },
        h("thead", {}, h("tr", {}, h("th", {}, "Name"), h("th", {}, "Value"), h("th", {}, "Solved"), h("th", {}, "Lock"), h("th"))),
        tbody,
      ),
    );
    if (!ro) {
      body.append(h("button", { class: "pc-btn", onclick: () => { addVariable(sk, { name: uniqueName(sk, "v"), value: 0, locked: true }); ctx.commit("variable"); } }, "+ Variable"));
    }
  }

  return { el, update };
}