import { parseKey } from '../spatial/Tile.js';
import { Grid3D } from '../spatial/Grid3D.js';

const esc = (v) => String(v).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

const TAKEAWAYS = {
  door: 'Fire doors contain oxygen flow and isolate thermal energy: a closed door cuts boundary permeability from 100% to 12% and removes the +35% burn-rate bonus every opening within two tiles gives the fire. Closing doors buys turns even while actively evacuating.',
  alarm: 'An authoritative broadcast raises group cohesion, damps rumour distortion, and lets high-cohesion agents execute drill protocol instead of fleeing blindly or following distorted "exit blocked" claims.',
  barricade: 'A locked or barricaded door costs the intruder turns of forcing (20 strength per turn; a barricade adds 50) and the forcing noise is itself a signal. In a lockdown, doors are time.',
};

/** Post-incident causal breakdown, deterministic counterfactual branches, rewind and restart controls. */
export class AutopsyView {
  constructor(el, state, bus, { simulate = null } = {}) {
    this.el = el;
    this.state = state;
    this.bus = bus;
    this.simulate = simulate;
    this._timers = [];
    this._offs = [
      bus.on('SCENARIO_ENDED', () => { const t = setTimeout(() => this.open(), 900); this._timers.push(t); }),
      bus.on('AUTOPSY_REQUESTED', () => this.toggle()),
      bus.on('REWOUND', () => this.close()),
    ];
    this._onClick = (e) => this._click(e);
    el.addEventListener('click', this._onClick);
  }

  get isOpen() { return !this.el.classList.contains('modal-hidden'); }
  open() { this._clearTimers(); this.render(); this.el.classList.remove('modal-hidden'); }
  close() { this._clearTimers(); this.el.classList.add('modal-hidden'); }
  toggle() { this.isOpen ? this.close() : this.open(); }
  _clearTimers() { for (const t of this._timers) clearTimeout(t); this._timers = []; }

  _lbl(key) {
    if (!key) return '?';
    const t = this.state.grid.getByKey(key);
    return t && t.label ? t.label : `${t ? t.type.toLowerCase() : 'tile'} (${key})`;
  }

  _name(id) {
    if (id === 'PLAYER') return 'You';
    if (id === 'THREAT') return 'The threat';
    const n = this.state.npcs.get(id);
    return n ? n.name : id;
  }

  // ------------------------------------------------------------------ causal graph
  /** Maps a telemetry record to a causal node { text, kind } or null when it is noise. */
  describe(r) {
    const L = (k) => this._lbl(k), N = (id) => this._name(id);
    switch (r.type) {
      case 'FIRE_SPREAD':
        if (r.source === 'EVENT') return { text: `Fire breaks out at ${L(r.key)}`, kind: 'bad' };
        return r.viaDoor ? { text: `Fire spreads into ${L(r.key)} through the open ${L(r.viaDoor)}`, kind: 'bad' } : null;
      case 'DOOR_OPENED': return { text: `${N(r.actor)} opened ${L(r.key)}${r.hot ? ' — the surface was hot' : ''}`, kind: r.actor === 'PLAYER' ? 'warn' : '' };
      case 'DOOR_CLOSED': return { text: `${N(r.actor)} closed ${L(r.key)}`, kind: 'good' };
      case 'DOOR_CHECKED': return { text: `You checked ${L(r.key)}: ${r.temperature}°C ${r.hot ? 'HOT' : 'cool'}`, kind: r.hot ? 'warn' : 'good' };
      case 'BARRICADE': return { text: `You barricaded ${L(r.key)} (strength ${r.strength})`, kind: 'good' };
      case 'BARRICADE_BREACHED': return { text: `${L(r.key)} was breached by the threat`, kind: 'bad' };
      case 'ALARM': return { text: `You sounded the alarm${r.first ? '' : ' again'} — cohesion ${r.cohesion.toFixed(2)}`, kind: 'good' };
      case 'RUMORS_CORRECTED': return { text: `Broadcast corrected ${r.count} false belief(s)`, kind: 'good' };
      case 'SCHEDULED_EVENT': return { text: r.message || r.eventType, kind: 'warn' };
      case 'COLLAPSE': return { text: `${L(r.key)} collapsed — ${r.reason}`, kind: 'bad' };
      case 'NPC_INCAPACITATED': return { text: `${r.name} incapacitated — ${r.reason}`, kind: 'bad' };
      case 'PLAYER_INCAPACITATED': return { text: `You were incapacitated — ${r.reason}`, kind: 'bad' };
      case 'PLAYER_INJURED': return { text: `You were injured — ${r.reason}`, kind: 'bad' };
      case 'NPC_TAGGED': return { text: `${r.name} was tagged by the threat`, kind: 'bad' };
      case 'PLAYER_TAGGED': return { text: 'You were tagged by the threat', kind: 'bad' };
      case 'NPC_EVACUATED': return { text: `${r.name} evacuated (${r.reason})`, kind: 'good' };
      case 'CONFLICT': return { text: `${r.npcName} ${r.kind === 'FIGHT' ? 'fought with' : 'intimidated'} ${r.targetName}`, kind: 'warn' };
      case 'DEESCALATE': return { text: `You de-escalated ${r.name}`, kind: 'good' };
      case 'ASSIST': return { text: `You started assisting ${r.name}`, kind: 'good' };
      case 'NPC_FROZE': return { text: `${r.name} froze — ${r.reason}`, kind: 'warn' };
      case 'RUMOR_ORIGINATED': return { text: `${N(r.npcId)} saw ${r.claimType === 'EXIT_BLOCKED' ? `hazard near ${L(r.exitKey)} and reports it blocked` : 'the threat'}`, kind: '' };
      case 'RUMOR_DISTORTED': return { text: `${N(r.listenerId)} distorted a rumour from ${N(r.speakerId)}: now "${r.claimType === 'EXIT_BLOCKED' ? `${L(r.toExit)} is blocked` : 'the threat is on the other side'}"${r.veracity ? '' : ' — FALSE'}`, kind: 'warn' };
      case 'THREAT_STATE': return { text: `Threat → ${r.state}${r.targetId ? ' pursuing ' + N(r.targetId) : ''}${r.key ? ' investigating noise at ' + L(r.key) : ''}`, kind: 'warn' };
      case 'NPC_SECURED_DOOR': return { text: `${r.name} closed ${L(r.key)} to shelter`, kind: 'good' };
      case 'REWIND': return { text: `Rewound to turn ${r.toTurn}`, kind: '' };
      default: return null;
    }
  }

  buildCausalGraph() {
    const log = this.state.telemetryLog;
    const byId = new Map(log.map((r) => [r.id, r]));
    const nodes = [];
    const spreadByTurn = new Map();
    const greedSeen = new Set();
    for (const r of log) {
      if (r.type === 'FIRE_SPREAD' && !r.viaDoor && r.source !== 'EVENT') { spreadByTurn.set(r.turn, (spreadByTurn.get(r.turn) || 0) + 1); continue; }
      if (r.type === 'GREED_DELAY') {
        if (greedSeen.has(r.npcId)) continue;
        greedSeen.add(r.npcId);
        nodes.push({ id: r.id, turn: r.turn, text: `${r.name} delayed to gather belongings`, kind: 'warn', causes: [] });
        continue;
      }
      const d = this.describe(r);
      if (!d) continue;
      const causes = (r.causes || []).map((cid) => byId.get(cid)).filter(Boolean).map((c) => { const cd = this.describe(c); return cd ? `Turn ${c.turn}: ${cd.text}` : null; }).filter(Boolean);
      nodes.push({ id: r.id, turn: r.turn, text: d.text, kind: d.kind, causes });
    }
    for (const [turn, n] of spreadByTurn) nodes.push({ id: turn * 1e6, turn, text: `Fire spread to ${n} more tile${n > 1 ? 's' : ''}`, kind: 'bad', causes: [] });
    nodes.sort((a, b) => a.turn - b.turn || a.id - b.id);
    if (nodes.length > 90) {
      const important = nodes.filter((n) => n.kind);
      return (important.length > 90 ? important.slice(-90) : important);
    }
    return nodes;
  }

  // ------------------------------------------------------------------ counterfactuals
  _turnsFrom(i) { return (this.state.outcome ? this.state.meta.turnNumber : this.state.meta.turnNumber - 1) - i; }

  buildCounterfactuals() {
    const s = this.state;
    const snaps = s.snapshots;
    const log = s.telemetryLog;
    const out = [];
    if (!this.simulate || snaps.length < 1) return out;
    const snap0 = snaps[0];

    // A) Doors that acted as fire conduits (or an open door near the initial fire)
    const conduits = new Map();
    for (const r of log) if (r.type === 'FIRE_SPREAD' && r.viaDoor) conduits.set(r.viaDoor, (conduits.get(r.viaDoor) || 0) + 1);
    let doorKeys = [...conduits.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]).slice(0, 2);
    if (!doorKeys.length && snap0.hazards.fireCells.size) {
      const fires = [...snap0.hazards.fireCells.keys()].map(parseKey);
      doorKeys = [...snap0.tiles.values()]
        .filter((t) => t.type === 'DOOR' && t.doorState.isOpen && fires.some((f) => f.z === t.coord.z && Grid3D.distance(f, t.coord) <= 6))
        .map((t) => t.key).slice(0, 1);
    }
    for (const dk of doorKeys) {
      const idx = snaps.findIndex((sn) => { const t = sn.tiles.get(dk); return t && t.doorState && t.doorState.isOpen; });
      if (idx < 0) continue;
      out.push({
        title: `Close ${this._lbl(dk)} at the start of turn ${idx + 1} (1 AP)`, fromIndex: idx, takeaway: TAKEAWAYS.door,
        mutate: (st) => { const t = st.grid.getByKey(dk); if (t && t.doorState) t.doorState.isOpen = false; },
      });
    }

    // B) Early alarm
    if (!snap0.social.alarmActive) {
      const first = log.find((r) => r.type === 'ALARM' || (r.type === 'SCHEDULED_EVENT' && r.eventType === 'ALARM'));
      if (!first || first.turn > 1) {
        out.push({
          title: 'Sound the alarm on turn 1 (1 AP)', fromIndex: 0, takeaway: TAKEAWAYS.alarm,
          mutate: (st) => { st.social.alarmActive = true; st.social.groupCohesion = Math.min(1, st.social.groupCohesion + 0.15); },
        });
      }
    }

    // C) Lockdown: barricade the door nearest the player's start
    if (s.meta.mode === 'LOCKDOWN') {
      const p0 = snap0.player.position;
      let best = null, bestD = Infinity;
      for (const t of snap0.tiles.values()) {
        if (t.type !== 'DOOR' || t.coord.z !== p0.z) continue;
        const d = Grid3D.distance(t.coord, p0);
        if (d < bestD) { bestD = d; best = t; }
      }
      if (best) {
        const dk = best.key;
        out.push({
          title: `Close and barricade ${this._lbl(dk)} on turn 1 (3 AP)`, fromIndex: 0, takeaway: TAKEAWAYS.barricade,
          mutate: (st) => { const t = st.grid.getByKey(dk); if (t && t.doorState) { t.doorState.isOpen = false; t.doorState.isBarricaded = true; t.doorState.barricadeStrength += 50; } },
        });
      }
    }
    return out.slice(0, 4);
  }

  _metrics(st) {
    const c = st.counts();
    return { evacuated: c.evacuated, incapacitated: c.incapacitated, tagged: c.tagged, fire: st.hazards.fireCells.size, smoke: st.hazards.smokeCells.size, result: st.outcome ? st.outcome.result : 'ongoing' };
  }

  _cfHtml(cf, turns, idle, branch) {
    const actual = this._metrics(this.state), a = this._metrics(idle), b = this._metrics(branch);
    const rows = [
      ['Evacuated', 'evacuated', +1], ['Incapacitated', 'incapacitated', -1],
      ...(this.state.hazards.threatEntities.length ? [['Tagged', 'tagged', -1]] : []),
      ['Fire cells', 'fire', -1], ['Smoke cells', 'smoke', -1],
    ].map(([label, k, goodDir]) => {
      const delta = b[k] - a[k];
      const cls = delta === 0 ? '' : Math.sign(delta) === goodDir ? 'good' : 'bad';
      return `<tr><td>${label}</td><td>${actual[k]}</td><td>${a[k]}</td><td>${b[k]}</td><td class="delta ${cls}">${delta > 0 ? '+' : ''}${delta}</td></tr>`;
    }).join('');
    return `<h4>What if: ${esc(cf.title)}</h4>
      <div class="note">Deterministic re-simulation from the turn ${cf.fromIndex + 1} snapshot over ${turns} turn${turns > 1 ? 's' : ''}. "Idle" = same start with no further player actions; "Branch" = idle plus only the change above. Compare Branch against Idle to isolate the mechanism.</div>
      <table><tr><th>Metric</th><th>Actual</th><th>Idle</th><th>Branch</th><th>Δ vs idle</th></tr>${rows}
      <tr><td>Result</td><td>${esc(actual.result)}</td><td>${esc(a.result)}</td><td>${esc(b.result)}</td><td></td></tr></table>
      <div class="takeaway">${esc(cf.takeaway)}</div>`;
  }

  _scheduleCounterfactuals(cfs) {
    const baselines = new Map();
    cfs.forEach((cf, n) => {
      const t = setTimeout(() => {
        const card = this.el.querySelector(`[data-cf="${n}"]`);
        if (!card) return;
        card.classList.remove('pending');
        try {
          const turns = this._turnsFrom(cf.fromIndex);
          if (turns < 1) { card.innerHTML = `<h4>What if: ${esc(cf.title)}</h4><div class="note">No completed turns after this point to re-simulate yet.</div>`; return; }
          const snap = this.state.snapshots[cf.fromIndex];
          if (!baselines.has(cf.fromIndex)) baselines.set(cf.fromIndex, this.simulate(snap, turns, null));
          const branch = this.simulate(snap, turns, cf.mutate);
          card.innerHTML = this._cfHtml(cf, turns, baselines.get(cf.fromIndex), branch);
        } catch (err) {
          console.error('[Autopsy] counterfactual failed', err);
          card.innerHTML = `<h4>What if: ${esc(cf.title)}</h4><div class="note">Sub-simulation failed: ${esc(err.message)}</div>`;
        }
      }, 40 + n * 60);
      this._timers.push(t);
    });
  }

  _mechanisms() {
    const log = this.state.telemetryLog;
    const has = (type, pred = () => true) => log.some((r) => r.type === type && pred(r));
    const out = [];
    if (has('FIRE_SPREAD', (r) => !!r.viaDoor)) out.push('Open doors are conduits: boundary permeability 1.0 (open) vs 0.12 (closed); each opening within 2 tiles adds +35% to the fire\'s oxygen-driven burn rate.');
    if (has('NPC_INCAPACITATED', (r) => /smoke/.test(r.reason))) out.push('Smoke inhalation is cumulative: +2 lung irritation per turn in dense smoke (D > 0.5), +1 in mild (D ≥ 0.2); an agent is incapacitated at 8. Heavy smoke also doubles movement cost and disorients pathing.');
    if (has('RUMOR_DISTORTED')) out.push('Rumour distortion chance = clamp(Listener.Stress·0.6 + (1 − Speaker.Trust)·0.4) · (1 − Cohesion·0.5). Distorted "exit blocked" claims steer agents toward hazards or away from safe routes.');
    if (has('NPC_FROZE')) out.push('Freeze threshold: Stress > 0.85 and Confidence < 0.2 removes agency for a turn. Stress = 0.7·Fear + 0.3·Rage + hazard proximity; proximity to a trusted leader lowers fear.');
    if (has('CONFLICT')) out.push('Social friction emerges when Aggression (0.6·Rage + 0.4·Greed − 0.3·Trust) exceeds 0.75 in low immediate danger. De-escalation lowers Rage by 0.35 and raises Trust by 0.2.');
    if (has('BARRICADE_STRESSED') || has('BARRICADE_BREACHED')) out.push('Forcing a door removes 20 strength per turn; a barricade adds 50 and a lock is worth 40. Noise (running, doors, fights) is heard within loudness + 2 tiles and pulls the threat into INVESTIGATE.');
    if (has('COLLAPSE')) out.push('Aftershock damage = M·(1.25 − integrity)·0.5 per tile; tiles collapse below 0.3 integrity and weaken their orthogonal neighbours by 0.12. Heat above 300°C also erodes integrity.');
    if (has('PLAYER_INJURED') || has('NPC_INCAPACITATED', (r) => /window/.test(r.reason))) out.push('Glass is the main storm injury vector: agents adjacent to a window when the gust hits are incapacitated or injured. Interior rooms without windows are shelter.');
    if (!out.length) out.push('No failure mechanisms triggered yet. Use rewind to branch from an earlier turn and explore non-ideal decisions safely.');
    return out;
  }

  // ------------------------------------------------------------------ render
  render() {
    const s = this.state;
    const c = s.counts();
    const outcome = s.outcome;
    const result = outcome ? outcome.result : 'ONGOING';
    const nodes = this.buildCausalGraph();
    const cfs = this.buildCounterfactuals();
    const doorsOpen = [...s.grid.tiles.values()].filter((t) => t.type === 'DOOR' && t.doorState.isOpen).length;

    const summary = [
      ['Turn', s.meta.turnNumber], ['Evacuated', `${c.evacuated} / ${c.total}`], ['Incapacitated', c.incapacitated],
      ...(s.hazards.threatEntities.length ? [['Tagged', c.tagged]] : []),
      ['Fire cells', s.hazards.fireCells.size], ['Smoke cells', s.hazards.smokeCells.size], ['Doors open', doorsOpen], ['Cohesion', s.social.groupCohesion.toFixed(2)],
    ].map(([k, v]) => `<div><span>${esc(k)}</span>${esc(v)}</div>`).join('');

    const nodesHtml = nodes.length
      ? nodes.map((n) => `<div class="causal-node ${n.kind}"><span class="turn">T${String(n.turn).padStart(2, '0')}</span>${esc(n.text)}${n.causes.map((cz) => `<span class="cause">${esc(cz)}</span>`).join('')}</div>`).join('')
      : '<div class="causal-node">No turning points recorded yet.</div>';

    const cfHtml = cfs.length
      ? cfs.map((cf, i) => `<div class="cf-card pending" data-cf="${i}"><h4>What if: ${esc(cf.title)}</h4><div class="note">Running deterministic sub-simulation…</div></div>`).join('')
      : '<div class="cf-card"><div class="note">Counterfactuals appear once at least one turn has been completed.</div></div>';

    const maxTurn = s.snapshots.length;
    const defaultTurn = Math.min(maxTurn, Math.max(1, s.meta.turnNumber));
    const options = Array.from({ length: maxTurn }, (_, i) => i + 1).map((t) => `<option value="${t}"${t === defaultTurn ? ' selected' : ''}>${t}</option>`).join('');

    this.el.innerHTML = `
      <div class="autopsy-header">
        <div><h2>PEDAGOGICAL AUTOPSY</h2><div class="subtitle">${esc(s.meta.title)} · turn ${s.meta.turnNumber} · ${esc(s.meta.mode)}</div></div>
        <span class="result ${result}">${result}${outcome ? ' — ' + esc(outcome.reason) : ''}</span>
      </div>
      <div class="autopsy-body">
        <div class="autopsy-col">
          <h3>SUMMARY</h3><div class="summary-grid">${summary}</div>
          <h3>CAUSAL CHAIN</h3>${nodesHtml}
        </div>
        <div class="autopsy-col">
          <h3>WHAT IF — COUNTERFACTUAL BRANCHES</h3>${cfHtml}
          <h3>MECHANISMS</h3><ul class="mech-list">${this._mechanisms().map((m) => `<li>${esc(m)}</li>`).join('')}</ul>
        </div>
      </div>
      <div class="autopsy-footer">
        <label>Rewind to start of turn <select id="autopsy-rewind">${options}</select></label>
        <button class="action-btn" data-act="rewind">⟲ Rewind</button>
        <button class="action-btn" data-act="restart">Restart scenario</button>
        <button class="action-btn primary" data-act="close">Close</button>
      </div>`;
    this._scheduleCounterfactuals(cfs);
  }

  _click(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'close') this.close();
    else if (act === 'restart') this.bus.emit('RELOAD_SCENARIO', { scenarioId: this.state.meta.scenarioId });
    else if (act === 'rewind') {
      const sel = this.el.querySelector('#autopsy-rewind');
      const turn = Number(sel && sel.value) || 1;
      this.close();
      this.bus.emit('REWIND_REQUESTED', { turn });
    }
  }

  dispose() {
    this._clearTimers();
    for (const off of this._offs) off();
    this.el.removeEventListener('click', this._onClick);
    this.el.innerHTML = '';
    this.el.classList.add('modal-hidden');
  }
}