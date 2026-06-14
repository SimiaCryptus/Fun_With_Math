// ---- App state ----
    const state = {
      typeId: null,
      name: "",
      face: null,
    };

    // ---- Element refs ----
    const el = {
      heroTypes: document.getElementById("heroTypes"),
      trickText: document.getElementById("trickText"),
      statsList: document.getElementById("statsList"),
      heroName: document.getElementById("heroName"),
      facePicker: document.getElementById("facePicker"),
      finishBtn: document.getElementById("finishBtn"),
      resetBtn: document.getElementById("resetBtn"),
      // sheet
      sheetFace: document.getElementById("sheetFace"),
      sheetName: document.getElementById("sheetName"),
      sheetType: document.getElementById("sheetType"),
      sheetStats: document.getElementById("sheetStats"),
      sheetTrick: document.getElementById("sheetTrick"),
      sheetHearts: document.getElementById("sheetHearts"),
      sheet: document.getElementById("sheet"),
    };

    // ---- Helpers ----
    function selectedType() {
      return HERO_TYPES.find((t) => t.id === state.typeId) || null;
    }

    function bonusFor(statId) {
      const t = selectedType();
      return t && t.strong === statId ? 2 : 0;
    }

    function fmtBonus(n) {
      return (n >= 0 ? "+" : "") + n;
    }

    // ---- Render: Step 1 hero types ----
    function renderHeroTypes() {
      el.heroTypes.innerHTML = "";
      HERO_TYPES.forEach((t) => {
        const btn = document.createElement("button");
        btn.className = "hero-btn" + (state.typeId === t.id ? " selected" : "");
        btn.innerHTML =
          `<span class="emoji">${t.emoji}</span>` +
          `<span class="label">${t.name}</span>` +
          `<span class="strong">Strong: ${t.strong}</span>`;
        btn.addEventListener("click", () => {
          state.typeId = t.id;
          el.trickText.textContent = "✨ Cool Trick: " + t.trick;
          renderAll();
        });
        el.heroTypes.appendChild(btn);
      });
    }

    // ---- Render: Step 2 stats ----
    function renderStats() {
      el.statsList.innerHTML = "";
      STATS.forEach((s) => {
        const bonus = bonusFor(s.id);
        const row = document.createElement("div");
        row.className = "stat-row";
        row.innerHTML =
          `<div>` +
            `<div class="stat-name">${s.id}</div>` +
            `<div class="stat-desc">${s.desc}</div>` +
          `</div>` +
          `<div class="stat-bonus ${bonus > 0 ? "boosted" : ""}">${fmtBonus(bonus)}</div>`;
        el.statsList.appendChild(row);
      });
    }

    // ---- Render: Step 3 faces ----
    function renderFaces() {
      el.facePicker.innerHTML = "";
      FACES.forEach((f) => {
        const btn = document.createElement("button");
        btn.className = "face-btn" + (state.face === f ? " selected" : "");
        btn.textContent = f;
        btn.addEventListener("click", () => {
          state.face = f;
          renderAll();
        });
        el.facePicker.appendChild(btn);
      });
    }

    // ---- Render: the character sheet preview ----
    function renderSheet() {
      const t = selectedType();
      el.sheetFace.textContent = state.face || "❓";
      el.sheetName.textContent = state.name.trim() || "Your Hero";
      el.sheetType.textContent = t ? t.name : "Pick a type…";
      el.sheetTrick.textContent = t ? t.trick : "—";
      el.sheetHearts.textContent = "❤️".repeat(START_HEARTS);

      el.sheetStats.innerHTML = "";
      STATS.forEach((s) => {
        const bonus = bonusFor(s.id);
        const cell = document.createElement("div");
        cell.className = "sheet-stat";
        cell.innerHTML = `<b>${fmtBonus(bonus)}</b>${s.id}`;
        el.sheetStats.appendChild(cell);
      });
    }

    function renderAll() {
      renderHeroTypes();
      renderStats();
      renderFaces();
      renderSheet();
    }

    // ---- Finish: validate & celebrate ----
    function finish() {
      const problems = [];
      if (!state.typeId) problems.push("pick a Hero Type");
      if (!state.name.trim()) problems.push("give your hero a name");
      if (!state.face) problems.push("pick a face");

      if (problems.length) {
        alert("Almost there! Please " + problems.join(", ") + ".");
        return;
      }

      el.sheet.classList.remove("celebrate");
      // restart animation
      void el.sheet.offsetWidth;
      el.sheet.classList.add("celebrate");

      const t = selectedType();
      setTimeout(() => {
        alert(
          `🎉 Hooray! ${state.name.trim()} the ${t.name} is ready for adventure!`
        );
      }, 200);
    }

    function reset() {
      state.typeId = null;
      state.name = "";
      state.face = null;
      el.heroName.value = "";
      el.trickText.textContent = "Tap a hero to see their cool trick!";
      renderAll();
    }

    // ---- Wire up events ----
    el.heroName.addEventListener("input", (e) => {
      state.name = e.target.value;
      renderSheet();
    });
    el.finishBtn.addEventListener("click", finish);
    el.resetBtn.addEventListener("click", reset);

    // ---- Go! ----
    renderAll();