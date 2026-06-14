// ---- App state ----
const state = {
  heroes: [],   // { id, name, face, typeId, hearts, knockedOut }
  log: [],      // { time, text }
};

let nextId = 1;
let editingId = null; // hero id being edited in dialog (null = new)

// ---- Element refs ----
const el = {
  heroList:    document.getElementById("heroList"),
  emptyHint:   document.getElementById("emptyHint"),
  addHeroBtn:  document.getElementById("addHeroBtn"),

  // dice
  diceDisplay: document.getElementById("diceDisplay"),
  rollHero:    document.getElementById("rollHero"),
  rollStat:    document.getElementById("rollStat"),
  rollHelp:    document.getElementById("rollHelp"),
  rollTN:      document.getElementById("rollTN"),
   rollValue:   document.getElementById("rollValue"),
  rollBtn:     document.getElementById("rollBtn"),
  rollResult:  document.getElementById("rollResult"),
   // guide tools
   encounterBox:  document.getElementById("encounterBox"),
   encounterBtn:  document.getElementById("encounterBtn"),
   choiceBox:     document.getElementById("choiceBox"),
   choiceBtn:     document.getElementById("choiceBtn"),
   mapDisplay:    document.getElementById("mapDisplay"),
   mapAdvanceBtn: document.getElementById("mapAdvanceBtn"),

  // log
  logList:     document.getElementById("logList"),
  clearLogBtn: document.getElementById("clearLogBtn"),

  // game
  saveBtn:     document.getElementById("saveBtn"),
  loadBtn:     document.getElementById("loadBtn"),
  resetBtn:    document.getElementById("resetBtn"),
  saveStatus:  document.getElementById("saveStatus"),

  // dialog
  dialog:       document.getElementById("heroDialog"),
  dialogTitle:  document.getElementById("dialogTitle"),
  heroForm:     document.getElementById("heroForm"),
  formName:     document.getElementById("formName"),
  formFaces:    document.getElementById("formFaces"),
  formFace:     document.getElementById("formFace"),
  formType:     document.getElementById("formType"),
  cancelHeroBtn:document.getElementById("cancelHeroBtn"),
};

// ---- Helpers ----
function typeById(id) {
  return HERO_TYPES.find((t) => t.id === id) || null;
}

function bonusFor(hero, statId) {
  const t = typeById(hero.typeId);
  return t && t.strong === statId ? STAT_BONUS : 0;
}

function fmtBonus(n) {
  return (n >= 0 ? "+" : "") + n;
}

function nowStr() {
  const d = new Date();
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function addLog(text) {
  state.log.unshift({ time: nowStr(), text });
  if (state.log.length > 100) state.log.length = 100;
  renderLog();
}

// ---- Render: hero scoreboard ----
function renderHeroes() {
  el.heroList.innerHTML = "";
  el.emptyHint.style.display = state.heroes.length ? "none" : "block";

  state.heroes.forEach((hero) => {
    const t = typeById(hero.typeId);
    const card = document.createElement("div");
    card.className = "hero-card" + (hero.knockedOut ? " ko" : "");

    // header
    const head = document.createElement("div");
    head.className = "hero-card-head";
    head.innerHTML =
      `<span class="hero-face">${hero.face}</span>` +
      `<span class="hero-meta">` +
        `<span class="hero-name">${escapeHtml(hero.name)}</span>` +
        `<span class="hero-type">${t ? t.emoji + " " + t.name : "—"}</span>` +
      `</span>`;
    card.appendChild(head);

    // hearts
    const hearts = document.createElement("div");
    hearts.className = "hero-hearts";
    let heartsHtml = "";
    for (let i = 0; i < MAX_HEARTS; i++) {
      heartsHtml += i < hero.hearts ? "❤️" : "🤍";
    }
    hearts.innerHTML =
      `<button class="heart-btn" data-act="hurt" data-id="${hero.id}" title="Lose a heart">➖</button>` +
      `<span class="hearts-icons">${heartsHtml}</span>` +
      `<button class="heart-btn" data-act="heal" data-id="${hero.id}" title="Heal a heart">➕</button>`;
    card.appendChild(hearts);

    if (hero.knockedOut) {
      const ko = document.createElement("div");
      ko.className = "ko-badge";
      ko.textContent = "😵 Knocked out — needs a friend's help!";
      card.appendChild(ko);
    }

    // mini stat grid
    const stats = document.createElement("div");
    stats.className = "hero-stats";
    STATS.forEach((s) => {
      const b = bonusFor(hero, s.id);
      const cell = document.createElement("div");
      cell.className = "hero-stat" + (b > 0 ? " boosted" : "");
      cell.innerHTML = `<b>${fmtBonus(b)}</b>${s.id}`;
      stats.appendChild(cell);
    });
    card.appendChild(stats);

    // trick + actions
    const foot = document.createElement("div");
    foot.className = "hero-card-foot";
    foot.innerHTML = `<span class="hero-trick">✨ ${t ? escapeHtml(t.trick) : "—"}</span>`;
    const actions = document.createElement("div");
    actions.className = "hero-actions";
    actions.innerHTML =
      `<button class="mini-btn" data-act="edit" data-id="${hero.id}">✏️ Edit</button>` +
      `<button class="mini-btn danger" data-act="remove" data-id="${hero.id}">🗑️</button>`;
    foot.appendChild(actions);
    card.appendChild(foot);

    el.heroList.appendChild(card);
  });
}

// event delegation for hero card buttons
el.heroList.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const hero = state.heroes.find((h) => h.id === id);
  if (!hero) return;

  switch (btn.dataset.act) {
    case "hurt": hurtHero(hero); break;
    case "heal": healHero(hero); break;
    case "edit": openHeroDialog(hero); break;
    case "remove": removeHero(hero); break;
  }
});

function hurtHero(hero) {
  if (hero.hearts <= 0) return;
  hero.hearts--;
  if (hero.hearts === 0 && !hero.knockedOut) {
    hero.knockedOut = true;
    addLog(`💔 ${hero.name} lost a heart and is knocked out!`);
  } else {
    addLog(`💔 ${hero.name} lost a heart (${hero.hearts} left).`);
  }
  renderHeroes();
}

function healHero(hero) {
  if (hero.hearts >= MAX_HEARTS) return;
  hero.hearts++;
  if (hero.knockedOut && hero.hearts > 0) {
    hero.knockedOut = false;
    addLog(`💖 ${hero.name} was helped back up!`);
  } else {
    addLog(`💖 ${hero.name} healed a heart (${hero.hearts} now).`);
  }
  renderHeroes();
}

function removeHero(hero) {
  if (!confirm(`Remove ${hero.name} from the game?`)) return;
  state.heroes = state.heroes.filter((h) => h.id !== hero.id);
  addLog(`👋 ${hero.name} left the adventure.`);
  renderHeroes();
  renderRollHeroes();
}

// ---- Hero dialog (add / edit) ----
function renderFormFaces(selected) {
  el.formFaces.innerHTML = "";
  FACES.forEach((f) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "face-btn" + (selected === f ? " selected" : "");
    btn.textContent = f;
    btn.addEventListener("click", () => {
      el.formFace.value = f;
      renderFormFaces(f);
    });
    el.formFaces.appendChild(btn);
  });
}

function renderFormTypes() {
  el.formType.innerHTML = "";
  HERO_TYPES.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = `${t.emoji} ${t.name} (strong: ${t.strong})`;
    el.formType.appendChild(opt);
  });
}

function openHeroDialog(hero) {
  editingId = hero ? hero.id : null;
  el.dialogTitle.textContent = hero ? "Edit Hero" : "Add a Hero";
  el.formName.value = hero ? hero.name : "";
  el.formType.value = hero ? hero.typeId : HERO_TYPES[0].id;
  const face = hero ? hero.face : FACES[0];
  el.formFace.value = face;
  renderFormFaces(face);
  el.dialog.showModal();
  el.formName.focus();
}

el.addHeroBtn.addEventListener("click", () => openHeroDialog(null));
el.cancelHeroBtn.addEventListener("click", () => el.dialog.close());

el.heroForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = el.formName.value.trim();
  if (!name) return;
  const face = el.formFace.value || FACES[0];
  const typeId = el.formType.value;

  if (editingId != null) {
    const hero = state.heroes.find((h) => h.id === editingId);
    if (hero) {
      hero.name = name;
      hero.face = face;
      hero.typeId = typeId;
      addLog(`✏️ Updated ${hero.name}.`);
    }
  } else {
    const hero = {
      id: nextId++,
      name, face, typeId,
      hearts: START_HEARTS,
      knockedOut: false,
       pos: 0,
    };
    state.heroes.push(hero);
    addLog(`🎉 ${name} the ${typeById(typeId).name} joined the party!`);
  }
  el.dialog.close();
  renderHeroes();
  renderRollHeroes();
});

// ---- Dice roller ----
function renderRollHeroes() {
  const prev = el.rollHero.value;
  el.rollHero.innerHTML = "";
  if (!state.heroes.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "— add a hero first —";
    el.rollHero.appendChild(opt);
    el.rollBtn.disabled = true;
    return;
  }
  el.rollBtn.disabled = false;
  state.heroes.forEach((h) => {
    const opt = document.createElement("option");
    opt.value = String(h.id);
    opt.textContent = `${h.face} ${h.name}`;
    el.rollHero.appendChild(opt);
  });
  if ([...el.rollHero.options].some((o) => o.value === prev)) {
    el.rollHero.value = prev;
  }
}


el.rollBtn.addEventListener("click", () => {
  const hero = state.heroes.find((h) => h.id === Number(el.rollHero.value));
  if (!hero) return;

  const statId = el.rollStat.value;
  const tn = Number(el.rollTN.value);
  const help = el.rollHelp.checked;

   // The Guide never rolls — the Hero rolls the real foam die and tells us (§11).
   const die = Number(el.rollValue.value);
   if (!Number.isInteger(die) || die < 1 || die > 20) {
     el.rollResult.className = "roll-result fail";
     el.rollResult.innerHTML =
       `<div class="roll-outcome">🎲 Roll the foam die, then type a number from 1 to 20!</div>`;
     el.rollValue.focus();
     return;
   }
  const statBonus = bonusFor(hero, statId);
  const helpBonus = help ? STAT_BONUS : 0;
  const total = die + statBonus + helpBonus;

   // show the die the Hero reported
  el.diceDisplay.textContent = die;
  el.diceDisplay.classList.remove("rolling");
  void el.diceDisplay.offsetWidth;
  el.diceDisplay.classList.add("rolling");

  // outcome (§2)
  let outcome, cssClass;
  if (die === 20) {
    outcome = "🌟 NATURAL 20 — Amazing success! Something extra-cool happens!";
    cssClass = "crit";
  } else if (die === 1) {
    outcome = "😅 Natural 1 — A funny stumble! (Keep it light.)";
    cssClass = "fumble";
  } else if (total >= tn) {
    outcome = "✅ Success!";
    cssClass = "success";
  } else {
    outcome = "❌ Not quite — try again, or a friend can Help!";
    cssClass = "fail";
  }

  const parts = [`d20 = ${die}`];
  if (statBonus) parts.push(`${statId} ${fmtBonus(statBonus)}`);
  if (helpBonus) parts.push(`Help ${fmtBonus(helpBonus)}`);
  const math = parts.join(" + ") + ` = ${total}  vs  TN ${tn}`;

  el.rollResult.className = "roll-result " + cssClass;
  el.rollResult.innerHTML =
    `<div class="roll-math">${math}</div>` +
    `<div class="roll-outcome">${outcome}</div>`;

  addLog(`🎲 ${hero.name} rolled ${total} (${statId}) vs TN ${tn} — ${
    die === 20 ? "natural 20!" :
    die === 1 ? "natural 1!" :
    total >= tn ? "success" : "fail"
  }`);
   el.rollValue.value = "";
});
// ---- Guide tools: encounters, choices, map (§6, §11) ----
function pick(arr) {
   return arr[Math.floor(Math.random() * arr.length)];
}
function renderEncounter(enc) {
   if (!enc) {
     el.encounterBox.innerHTML = `<p class="empty-hint">No encounter yet. Spin one up!</p>`;
     return;
   }
   el.encounterBox.innerHTML =
     `<div class="encounter-card">` +
       `<div class="encounter-head"><span class="encounter-emoji">${enc.emoji}</span>` +
       `<b>${escapeHtml(enc.name)}</b></div>` +
       `<div class="encounter-tn">TN ${enc.tn} — beat with ${enc.stats.join(" or ")}</div>` +
       `<div class="encounter-text">"${escapeHtml(enc.text)}"</div>` +
     `</div>`;
}
el.encounterBtn.addEventListener("click", () => {
   const enc = pick(ENCOUNTERS);
   renderEncounter(enc);
   // Pre-fill the roll panel so kids know what to roll.
   el.rollStat.value = enc.stats[0];
   const tnOpt = [...el.rollTN.options].find((o) => Number(o.value) === enc.tn);
   if (tnOpt) el.rollTN.value = String(enc.tn);
   addLog(`🐉 Encounter: ${enc.name} (TN ${enc.tn}, ${enc.stats.join("/")}).`);
});
function renderChoice(choice) {
   if (!choice) {
     el.choiceBox.innerHTML = `<p class="empty-hint">No choice yet. Give the Heroes options!</p>`;
     return;
   }
   const opts = choice.options
     .map((o, i) => `<li><b>${String.fromCharCode(65 + i)}.</b> ${escapeHtml(o)}</li>`)
     .join("");
   el.choiceBox.innerHTML =
     `<div class="choice-prompt">${escapeHtml(choice.prompt)}</div>` +
     `<ul class="choice-options">${opts}</ul>`;
}
el.choiceBtn.addEventListener("click", () => {
   const choice = pick(CHOICES);
   renderChoice(choice);
   addLog(`🔀 Offered a choice: ${choice.prompt}`);
});
// Basic text map with hero tokens under their current space (§11)
function renderMap() {
   const lastIndex = MAP_SPACES.length - 1;
   const spacer = "    "; // width roughly matching an emoji + " -- "
   const row = MAP_SPACES.join(" -- ");
   // Build a token line under each space.
   const lines = [row];
   if (state.heroes.length) {
     // group heroes by position
     const byPos = {};
     state.heroes.forEach((h) => {
       const p = Math.min(Math.max(h.pos || 0, 0), lastIndex);
       (byPos[p] = byPos[p] || []).push(h);
     });
     let tokenLine = "";
     for (let i = 0; i <= lastIndex; i++) {
       const here = byPos[i];
       tokenLine += here ? "^" + here.map((h) => h.name).join(",") : " ";
       if (i < lastIndex) tokenLine += spacer;
     }
     lines.push(tokenLine);
   }
   el.mapDisplay.textContent = lines.join("\n");
}
// "Advance" nudges every (conscious) hero forward up to 1 space (§5 Move).
el.mapAdvanceBtn.addEventListener("click", () => {
   if (!state.heroes.length) return;
   const lastIndex = MAP_SPACES.length - 1;
   let moved = false;
   state.heroes.forEach((h) => {
     if (h.knockedOut) return;
     const p = Math.min((h.pos || 0) + 1, lastIndex);
     if (p !== (h.pos || 0)) { h.pos = p; moved = true; }
   });
   if (moved) addLog("🗺️ The Heroes move forward along the path!");
   renderMap();
});

// ---- Adventure log ----
function renderLog() {
  el.logList.innerHTML = "";
  if (!state.log.length) {
    const li = document.createElement("li");
    li.className = "log-empty";
    li.textContent = "Nothing has happened yet…";
    el.logList.appendChild(li);
    return;
  }
  state.log.forEach((entry) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="log-time">${entry.time}</span> ${escapeHtml(entry.text)}`;
    el.logList.appendChild(li);
  });
}

el.clearLogBtn.addEventListener("click", () => {
  if (!state.log.length) return;
  if (!confirm("Clear the adventure log?")) return;
  state.log = [];
  renderLog();
});

// ---- Save / Load / Reset ----
function flashStatus(text) {
  el.saveStatus.textContent = text;
  setTimeout(() => { el.saveStatus.textContent = ""; }, 2500);
}

el.saveBtn.addEventListener("click", () => {
  try {
    const payload = JSON.stringify({ heroes: state.heroes, log: state.log, nextId });
    localStorage.setItem(SAVE_KEY, payload);
    flashStatus("💾 Game saved!");
  } catch (err) {
    flashStatus("⚠️ Could not save.");
  }
});

el.loadBtn.addEventListener("click", () => {
  loadGame(true);
});

function loadGame(showMsg) {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) { if (showMsg) flashStatus("No saved game found."); return; }
    const data = JSON.parse(raw);
    state.heroes = Array.isArray(data.heroes) ? data.heroes : [];
     state.heroes.forEach((h) => { if (typeof h.pos !== "number") h.pos = 0; });
    state.log = Array.isArray(data.log) ? data.log : [];
    nextId = data.nextId || (Math.max(0, ...state.heroes.map((h) => h.id)) + 1);
    renderAll();
    if (showMsg) flashStatus("📂 Game loaded!");
  } catch (err) {
    if (showMsg) flashStatus("⚠️ Could not load.");
  }
}

el.resetBtn.addEventListener("click", () => {
  if (!confirm("Start a brand new game? This clears heroes and log.")) return;
  state.heroes = [];
  state.log = [];
  nextId = 1;
  el.rollResult.className = "roll-result";
  el.rollResult.innerHTML = "";
  el.diceDisplay.textContent = "—";
   el.rollValue.value = "";
   renderEncounter(null);
   renderChoice(null);
  renderAll();
  flashStatus("♻️ New game started.");
});

// ---- Utilities ----
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---- Render everything ----
function renderAll() {
  renderHeroes();
  renderRollHeroes();
  renderLog();
   renderMap();
}

// ---- Go! ----
renderFormTypes();
loadGame(false);   // auto-load if a save exists
renderAll();