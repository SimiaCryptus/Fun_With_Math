import { h, panelShell } from "../dom.js";

export function createScriptPanel(ctx) {
  let dirty = false;
  const history = [];
  let hIdx = 0;

  const ta = h("textarea", { class: "pc-script", spellcheck: "false", rows: 18 });
  const errBox = h("div", { class: "pc-errors" });
  const applyBtn = h("button", { class: "pc-btn pc-primary", type: "button", onclick: apply }, "Apply script");
  const revertBtn = h("button", { class: "pc-btn", type: "button", onclick: () => { dirty = false; update(); showErrors([]); } }, "Revert");
  const consoleIn = h("input", { type: "text", class: "pc-in pc-console", placeholder: "console › point E at (10, 20, 30) · solve · set theta = 45" });

  ta.addEventListener("input", () => { dirty = true; el.classList.add("pc-dirty"); });
  consoleIn.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const line = consoleIn.value.trim();
      if (!line) return;
      const res = ctx.exec(line);
      if (res.ok) {
        history.push(line);
        hIdx = history.length;
        consoleIn.value = "";
        showErrors([]);
      } else showErrors(res.errors, "console");
    } else if (e.key === "ArrowUp" && history.length) {
      hIdx = Math.max(0, hIdx - 1);
      consoleIn.value = history[hIdx];
      e.preventDefault();
    } else if (e.key === "ArrowDown" && history.length) {
      hIdx = Math.min(history.length, hIdx + 1);
      consoleIn.value = history[hIdx] ?? "";
      e.preventDefault();
    }
  });

  const body = h("div", {}, ta, h("div", { class: "pc-row" }, applyBtn, revertBtn), errBox, consoleIn);
  const el = panelShell("Script", body);

  function apply() {
    const res = ctx.fromScript(ta.value);
    if (res.ok) {
      dirty = false;
      el.classList.remove("pc-dirty");
      showErrors([]);
    } else showErrors(res.errors);
  }

  function showErrors(errors, where) {
    errBox.replaceChildren(...errors.map((e) => h("div", { class: "pc-error" }, where === "console" ? `console: ${e.message}` : `line ${e.line}: ${e.message}`)));
  }

  function update() {
    const ro = ctx.readonly;
    ta.disabled = ro;
    consoleIn.disabled = ro;
    applyBtn.disabled = ro;
    if (dirty || ta.matches(":focus")) return;
    const text = ctx.toScript();
    if (ta.value !== text) ta.value = text;
  }

  return { el, update, showErrors };
}