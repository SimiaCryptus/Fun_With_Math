import { h, fmt, panelShell, statusDot } from "../dom.js";
import { findPoint } from "../../core/model.js";

export function createSolvePanel(ctx) {
  const methodSel = h("select", { class: "pc-in", onchange: (e) => { ctx.sketch.solver.method = e.target.value; ctx.commit("solver"); } });
  const iterIn = h("input", { type: "number", min: "1", step: "1", class: "pc-in pc-in-num", onchange: (e) => { ctx.sketch.solver.maxIterations = Math.max(1, Number(e.target.value) || 1); ctx.commit("solver"); } });
  const tolIn = h("input", { type: "number", step: "any", class: "pc-in pc-in-num", onchange: (e) => { ctx.sketch.solver.tolerance = Number(e.target.value) || 1e-6; ctx.commit("solver"); } });
  const objIn = h("input", { type: "number", step: "any", min: "0", class: "pc-in pc-in-num", title: "Global weight scale for minimize/maximize terms",
    onchange: (e) => { ctx.sketch.solver.objectiveScale = Number(e.target.value) || 0; ctx.commit("solver"); } });
  const frameChk = h("input", { type: "checkbox",
    title: "When at most one point is fixed, re-centre the solved sketch and align it to its principal axes so the free rigid-body frame is pinned instead of reported as slack",
    onchange: (e) => { ctx.sketch.solver.frame = e.target.checked ? "auto" : "none"; ctx.commit("solver"); } });
  const centerBtn = h("button", { class: "pc-btn", type: "button", title: "Re-centre the sketch now and align it to its principal axes (seeds and solution move together)",
    onclick: () => ctx.center() }, "Center now");
  const solveBtn = h("button", { class: "pc-btn pc-primary", type: "button", onclick: () => ctx.solve() }, "Solve");
  const resetBtn = h("button", { class: "pc-btn", type: "button", onclick: () => ctx.reset() }, "Reset to seeds");
  const adoptBtn = h("button", { class: "pc-btn", type: "button", onclick: () => ctx.adopt() }, "Adopt solution");
  const summary = h("div", { class: "pc-summary" });
  const list = h("div", { class: "pc-list" });

  const body = h("div", {},
    h("div", { class: "pc-row" }, solveBtn, resetBtn, adoptBtn),
    h("div", { class: "pc-row" }, h("label", {}, "Method"), methodSel),
    h("div", { class: "pc-row" }, h("label", {}, "Iterations"), iterIn, h("label", {}, "Tolerance"), tolIn),
    h("div", { class: "pc-row" }, h("label", {}, "Objective scale"), objIn),
    h("div", { class: "pc-row" }, h("label", {}, "Frame"), h("label", { class: "pc-check" }, frameChk, "auto-center & align"), centerBtn),
    summary,
    list,
  );
  const el = panelShell("Solve", body);

  function update() {
    const sk = ctx.sketch;
    const ro = ctx.readonly;
    const solvers = [...ctx.registry.solvers.values()];
    methodSel.replaceChildren(...solvers.map((s) => h("option", { value: s.id }, s.name ?? s.id)));
    methodSel.value = sk.solver.method;
    iterIn.value = sk.solver.maxIterations;
    tolIn.value = sk.solver.tolerance;
    objIn.value = sk.solver.objectiveScale ?? 0.001;
    frameChk.checked = (sk.solver.frame ?? "auto") !== "none";
    for (const i of [methodSel, iterIn, tolIn, objIn, frameChk, centerBtn, resetBtn, adoptBtn]) i.disabled = ro;
    adoptBtn.disabled = ro || !sk.points.some((p) => p.solved);
    centerBtn.disabled = ro || sk.points.filter((p) => p.fixed).length > 1 || !sk.points.length;

    const r = ctx.result;
    summary.replaceChildren();
    list.replaceChildren();
    if (!r) {
      summary.append(h("div", { class: "pc-muted" }, "Not solved yet."));
      return;
    }
    const flags = [];
    if (r.overConstrained) flags.push(h("div", { class: "pc-flag pc-flag-bad" }, "Over-constrained or stuck: some equalities cannot be met."));
    if (r.underConstrained) flags.push(h("div", { class: "pc-flag pc-flag-warn" }, `Under-constrained: ${r.dof.real} free degree${r.dof.real === 1 ? "" : "s"} of freedom (nearest solution to the seeds was chosen).`));
    if (r.dof.rigid > 0) {
      flags.push(h("div", { class: "pc-flag pc-flag-info" }, r.gaugeFixed
        ? `${r.dof.rigid} rigid-body DOF gauge-fixed: the sketch was re-centred and aligned to its principal axes (not counted as under-constrained).`
        : `${r.dof.rigid} rigid-body DOF: the sketch floats freely — enable frame auto-alignment or fix a point.`));
    }
    summary.append(
      h("div", { class: `pc-result ${r.converged ? "pc-status-ok" : "pc-status-bad"}` },
        statusDot(r.converged ? "ok" : "bad"),
        h("b", {}, r.converged ? "Converged" : "Did not converge"),
        ` · ${r.iterations} iter · residual ${fmt(r.residualNorm, 6)} · unknowns ${r.unknowns} · rank ${r.rank} · DOF ${r.dof.total} (${r.dof.rigid} rigid + ${r.dof.real} real)`),
      ...flags,
    );
    for (const pc of r.perConstraint) {
      const c = sk.constraints.find((x) => x.id === pc.id);
      const pts = c ? c.points.map((id) => findPoint(sk, id)?.label ?? id).join(" ") : "";
      const text = pc.status === "objective" ? `${fmt(pc.measure)} (objective)` : `${fmt(pc.measure)} vs ${fmt(pc.target)} · Δ ${fmt(pc.residual, 5)}`;
      list.append(h("div", { class: "pc-item", onclick: () => c && ctx.select(c.points) }, statusDot(pc.status), h("span", { class: "pc-item-main" }, h("b", {}, pc.type), ` ${pts}`), h("span", { class: "pc-muted" }, text)));
    }
  }

  return { el, update };
}