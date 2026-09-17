import { h, fmt, panelShell, statusDot } from "../dom.js";
import { addConstraint, removeEntity, findVariable, findPoint } from "../../core/model.js";

function targetText(c, sk) {
  const t = c.target;
  if (t.kind === "value") return `= ${fmt(t.value)}`;
  if (t.kind === "variable") {
    const v = findVariable(sk, t.ref);
    return `= ${v ? v.name : t.ref}`;
  }
  return t.kind === "minimize" ? "→ min" : "→ max";
}

export function createConstraintsPanel(ctx) {
  const list = h("div", { class: "pc-list" });
  let chosen = [];

  // ---- add form (persistent) -------------------------------------------
  const kindSel = h("select", { class: "pc-in" });
  const ptsBox = h("div", { class: "pc-pts" });
  const targetSel = h("select", { class: "pc-in" }, ...["value", "variable", "minimize", "maximize"].map((k) => h("option", { value: k }, k)));
  const valueIn = h("input", { type: "number", step: "any", class: "pc-in pc-in-num", value: "0" });
  const varSel = h("select", { class: "pc-in" });
  const weightIn = h("input", { type: "number", step: "any", min: "0", class: "pc-in pc-in-num", value: "1" });
  const msg = h("div", { class: "pc-msg" });
  const pickBtn = h("button", { class: "pc-btn", type: "button", onclick: () => {
    const kind = currentKind();
    if (!kind) return;
    ctx.startPick(kind.arity.points, (ids) => { chosen = ids; renderPts(); });
  } }, "Pick in viewport");
  const addBtn = h("button", { class: "pc-btn pc-primary", type: "button", onclick: add }, "+ Add constraint");
  const form = h("div", { class: "pc-form" },
    h("div", { class: "pc-row" }, h("label", {}, "Kind"), kindSel),
    h("div", { class: "pc-row" }, h("label", {}, "Points"), ptsBox, pickBtn),
    h("div", { class: "pc-row" }, h("label", {}, "Target"), targetSel, valueIn, varSel),
    h("div", { class: "pc-row" }, h("label", {}, "Weight"), weightIn, addBtn),
    msg,
  );
  kindSel.addEventListener("change", () => { chosen = []; renderPts(); });
  targetSel.addEventListener("change", syncTarget);

  const body = h("div", {}, list, form);
  const el = panelShell("Constraints", body);

  function currentKind() {
    return ctx.registry.hasConstraintKind(kindSel.value) ? ctx.registry.getConstraintKind(kindSel.value) : null;
  }

  function syncTarget() {
    valueIn.style.display = targetSel.value === "value" ? "" : "none";
    varSel.style.display = targetSel.value === "variable" ? "" : "none";
  }

  function renderPts() {
    const kind = currentKind();
    ptsBox.replaceChildren();
    if (!kind) return;
    const sk = ctx.sketch;
    for (let i = 0; i < kind.arity.points; i++) {
      const sel = h("select", { class: "pc-in pc-in-pt", onchange: (e) => { chosen[i] = e.target.value; } },
        h("option", { value: "" }, `P${i + 1}`),
        ...sk.points.map((p) => h("option", { value: p.id }, p.label)));
      if (chosen[i]) sel.value = chosen[i];
      ptsBox.append(sel);
    }
  }

  function add() {
    const sk = ctx.sketch;
    const kind = currentKind();
    if (!kind) return;
    const points = Array.from({ length: kind.arity.points }, (_, i) => chosen[i]);
    if (points.some((id) => !id || !findPoint(sk, id))) { msg.textContent = `Select ${kind.arity.points} points.`; return; }
    let target;
    switch (targetSel.value) {
      case "value": target = { kind: "value", value: Number(valueIn.value) || 0 }; break;
      case "variable":
        if (!varSel.value) { msg.textContent = "Choose a variable (or create one first)."; return; }
        target = { kind: "variable", ref: varSel.value };
        break;
      default: target = { kind: targetSel.value };
    }
    addConstraint(sk, { type: kind.id, points: points.map((id) => findPoint(sk, id).id), target, weight: Number(weightIn.value) || 1 });
    msg.textContent = "";
    ctx.commit("constraint");
  }

  // ---- list --------------------------------------------------------------
  function update() {
    const sk = ctx.sketch;
    const ro = ctx.readonly;
    const evals = new Map(ctx.evaluate().map((e) => [e.id, e]));
    list.replaceChildren();
    for (const c of sk.constraints) {
      const ev = evals.get(c.id);
      const pts = c.points.map((id) => findPoint(sk, id)?.label ?? id).join(" ");
      const detail = ev?.error ? ev.error : ev?.residual != null ? `${fmt(ev.measure)} (Δ ${fmt(ev.residual)})` : ev?.measure != null ? fmt(ev.measure) : "";
      list.append(
        h("div", { class: `pc-item${c.enabled === false ? " pc-disabled" : ""}${c.macro ? " pc-macro" : ""}`,
          onclick: (e) => { if (!(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLButtonElement)) ctx.select(c.points, false); } },
          statusDot(ev?.status ?? "none", detail),
          h("span", { class: "pc-item-main" }, h("b", {}, c.type), ` ${pts} `, h("span", { class: "pc-target" }, targetText(c, sk))),
          h("span", { class: "pc-muted pc-item-detail", title: c.note ?? "" }, detail),
          h("input", { type: "number", step: "any", min: "0", class: "pc-in pc-in-tiny", value: c.weight ?? 1, title: "weight", disabled: ro,
            onchange: (e) => { c.weight = Number(e.target.value) || 0; ctx.commit("constraint"); } }),
          h("input", { type: "checkbox", checked: c.enabled !== false, title: "enabled", disabled: ro,
            onchange: (e) => { c.enabled = e.target.checked; ctx.commit("constraint"); } }),
          ro ? null : h("button", { class: "pc-icon", title: "Delete constraint", onclick: () => { removeEntity(sk, c.id); ctx.commit("constraint"); } }, "✕"),
        ),
      );
    }
    if (!sk.constraints.length) list.append(h("div", { class: "pc-muted pc-empty" }, "No constraints yet."));

    // refresh form option lists, preserving choices
    const kinds = ctx.registry.constraintKindsFor(sk.space);
    const prevKind = kindSel.value;
    kindSel.replaceChildren(...kinds.map((k) => h("option", { value: k.id, title: k.syntax }, k.id)));
    if (kinds.some((k) => k.id === prevKind)) kindSel.value = prevKind;
    const prevVar = varSel.value;
    varSel.replaceChildren(...sk.variables.map((v) => h("option", { value: v.id }, `${v.name}${v.locked ? " 🔒" : ""}`)));
    if (sk.variables.some((v) => v.id === prevVar)) varSel.value = prevVar;
    chosen = chosen.filter(Boolean).map((id) => (findPoint(sk, id) ? findPoint(sk, id).id : ""));
    renderPts();
    syncTarget();
    form.style.display = ro ? "none" : "";
    pickBtn.disabled = !!ctx.pick;
  }

  return { el, update };
}