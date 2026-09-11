import { BASE_AP } from '../core/ActionEconomy.js';

const esc = (v) => String(v).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const pad = (n) => String(n).padStart(2, '0');
const row = (label, val, cls = '') => `<div class="status-row"><span>${esc(label)}</span><span class="val ${cls}">${esc(val)}</span></div>`;

/** DOM HUD bindings: header telemetry, AP ledger, status cards, social log, banners and toasts. */
export class HUDController {
  constructor(root, state, bus) {
    this.root = root;
    this.state = state;
    this.bus = bus;
    const $ = (id) => root.querySelector('#' + id) || document.getElementById(id);
    this.el = {
      turn: $('hud-turn-counter'), phase: $('hud-phase'), alarm: $('hud-alarm-status'), eta: $('hud-responder-eta'),
      pips: $('ap-pips'), player: $('status-player'), pop: $('status-population'), haz: $('status-hazards'),
      obj: $('status-objectives'), log: $('social-log-list'), banner: $('turn-banner'), toast: $('hud-toast'),
    };
    this._offs = [];
    this._timers = new Set();
    this._bannerTimer = null;
    this._bind();
    this.refresh();
  }

  _lbl(key) {
    const t = this.state.grid.getByKey(key);
    return t && t.label ? t.label : `door ${key}`;
  }

  _name(id) {
    if (id === 'PLAYER') return 'You';
    const n = this.state.npcs.get(id);
    return n ? n.name : id;
  }

  _bind() {
    const on = (type, fn) => this._offs.push(this.bus.on(type, fn));
    on('STATE_CHANGED', () => this.refresh());
    on('PHASE_CHANGED', ({ phase }) => { if (this.el.phase) this.el.phase.textContent = phase.replace(/_/g, ' '); });
    on('TURN_STARTED', ({ turn }) => { if (turn > 1) this.banner(`TURN ${pad(turn)}`); });
    on('ACTION_REJECTED', ({ reason }) => this.toast(reason, 'warn'));
    on('HUD_HINT', ({ text, kind }) => this.toast(text, kind || ''));
    on('DOOR_CHECKED', ({ key, temperature, hot }) => this.toast(`${this._lbl(key)}: ${hot ? `HOT surface (${temperature}°C) — fire likely behind it` : `cool (${temperature}°C)`}`, hot ? 'bad' : 'good'));
    on('EVENT_BANNER', ({ message }) => this.banner(message, 'event', 2800));
    on('NPC_EVACUATED', ({ name, reason }) => this.toast(`${name} evacuated (${reason})`, 'good'));
    on('NPC_INCAPACITATED', ({ name, reason }) => this.toast(`${name} incapacitated — ${reason}`, 'bad'));
    on('ENTITY_TAGGED', ({ name }) => this.toast(`${name} tagged by the threat`, 'bad'));
    on('PLAYER_INCAPACITATED', ({ reason }) => this.toast(`You are incapacitated — ${reason}`, 'bad'));
    on('ALARM_SOUNDED', ({ first }) => this.toast(first ? 'Alarm broadcasting — cohesion up, false rumours corrected' : 'Intercom repeat — cohesion up', 'good'));
    on('BARRICADE_BUILT', ({ key, strength }) => this.toast(`Barricaded ${this._lbl(key)} (strength ${strength})`, 'good'));
    on('BARRICADE_STRESSED', ({ key, remaining }) => this.toast(`${this._lbl(key)} is being forced — ${remaining} strength left`, 'warn'));
    on('BARRICADE_BREACHED', ({ key }) => this.toast(`${this._lbl(key)} breached!`, 'bad'));
    on('DEESCALATED', ({ name }) => this.toast(`${name} calmed down (rage −0.35, trust +0.2)`, 'good'));
    on('ASSIST_CHANGED', ({ npcId, carrying }) => this.toast(carrying ? `Assisting ${this._name(npcId)} — movement costs +1 AP` : `Released ${this._name(npcId)}`));
    on('RUMOR_DISTORTED', ({ speaker, listener, claimType }) => this.toast(`Rumour distorted: ${speaker} → ${listener} (${claimType})`, 'warn'));
    on('SOCIAL_CONFLICT', ({ kind, npcName, targetName }) => this.toast(`${npcName} ${kind === 'FIGHT' ? 'fights with' : 'intimidates'} ${targetName}`, 'warn'));
    on('HAZARD_SPAWNED', ({ type, key, viaDoor }) => {
      const seen = !!this.state.outcome || this.state.player.visible.has(key);
      if (type === 'FIRE' && viaDoor && seen) this.toast(`Fire spread through the open ${this._lbl(viaDoor)}`, 'bad');
      if (type === 'DEBRIS' && seen) this.toast(`Collapse at ${key}`, 'bad');
    });
    on('VIEW_FLOOR_CHANGED', ({ floor }) => this.toast(`Viewing floor ${floor + 1}`));
    on('REWOUND', ({ turn }) => this.toast(`Rewound to turn ${turn}`));
    on('SCENARIO_ENDED', ({ outcome }) => this.banner(outcome.result === 'WIN' ? 'OBJECTIVES MET' : 'SCENARIO FAILED', outcome.result === 'WIN' ? '' : 'event', 3000));
  }

  refresh() {
    const s = this.state;
    const m = s.meta;
    const c = s.counts();
    const el = this.el;
    if (el.turn) el.turn.textContent = `TURN: ${pad(m.turnNumber)} / ${pad(m.maxTurns)}`;
    if (el.phase) el.phase.textContent = m.activePhase.replace(/_/g, ' ');
    if (el.alarm) { el.alarm.textContent = s.social.alarmActive ? 'BROADCASTING' : 'SILENT'; el.alarm.classList.toggle('active', s.social.alarmActive); }
    if (el.eta) el.eta.textContent = `ETA ${s.social.responderEtaTurns} TURNS`;
    if (el.pips) {
      const ap = s.player.actionPoints;
      let html = '';
      for (let i = 0; i < BASE_AP; i++) html += `<div class="ap-pip${i < ap.current ? ' active' : i >= ap.max ? ' lost' : ''}"></div>`;
      el.pips.innerHTML = html;
    }
    if (el.player) el.player.innerHTML = this._playerCard();
    if (el.pop) el.pop.innerHTML = this._populationCard(c);
    if (el.haz) el.haz.innerHTML = this._hazardCard();
    if (el.obj) el.obj.innerHTML = this._objectiveCard(c);
    if (el.log) this._renderSocialLog();
  }

  _playerCard() {
    const s = this.state;
    const p = s.player, ps = p.physicalState;
    const carrying = ps.carrying ? s.npcs.get(ps.carrying) : null;
    const expCls = ps.exposure === 'HEAVY' ? 'bad' : ps.exposure === 'MILD' ? 'warn' : 'good';
    return `<h4>YOU</h4>` +
      row('Position', `${p.position.x},${p.position.y} · floor ${p.position.z + 1}`) +
      row('Status', ps.status, ps.status === 'ACTIVE' ? 'good' : 'bad') +
      row('Smoke exposure', ps.exposure, expCls) +
      row('Lung irritation', `${ps.lungIrritation} / 8`, ps.lungIrritation >= 6 ? 'bad' : ps.lungIrritation >= 3 ? 'warn' : '') +
      (ps.injured ? row('Injury', 'INJURED (−1 AP)', 'bad') : '') +
      row('Carrying', carrying ? carrying.name : '—') +
      row('Kit', p.inventory.join(', ') || '—');
  }

  _populationCard(c) {
    return `<h4>POPULATION</h4>` +
      row('Active', c.active) +
      row('Evacuated', c.evacuated, c.evacuated ? 'good' : '') +
      row('Incapacitated', c.incapacitated, c.incapacitated ? 'bad' : '') +
      (this.state.hazards.threatEntities.length ? row('Tagged', c.tagged, c.tagged ? 'bad' : '') : '') +
      row('Group cohesion', this.state.social.groupCohesion.toFixed(2));
  }

  _hazardCard() {
    const s = this.state;
    const seen = (k) => !!s.outcome || s.player.visible.has(k);
    const known = (k) => seen(k) || s.player.explored.has(k);
    let fire = 0, smoke = 0, debris = 0;
    for (const k of s.hazards.fireCells.keys()) if (seen(k)) fire++;
    for (const [k, c] of s.hazards.smokeCells) if (seen(k) && c.density >= 0.2) smoke++;
    for (const [k, t] of s.grid.tiles) if (t.debris && known(t.key)) debris++;
    let html = `<h4>HAZARDS IN VIEW</h4>` + row('Fire cells', fire, fire ? 'bad' : '') + row('Smoke cells', smoke, smoke ? 'warn' : '');
    if (s.meta.mode === 'SHELTER' || debris) html += row('Debris', debris, debris ? 'warn' : '');
    for (const t of s.hazards.threatEntities) {
      const k = `${t.position.x},${t.position.y},${t.position.z}`;
      html += row(t.id, seen(k) ? `${t.state} @ ${t.position.x},${t.position.y}` : 'position unknown', seen(k) ? 'bad' : 'warn');
    }
    return html;
  }

  _objectiveCard(c) {
    const s = this.state;
    let html = '<h4>OBJECTIVES</h4>';
    for (const g of s.meta.scenarioGoal || []) {
      switch (g.type) {
        case 'EVACUATE_MINIMUM_PERCENT': {
          const pct = c.total ? c.evacuated / c.total : 1;
          html += row(`Evacuate ≥ ${Math.round(g.targetValue * 100)}%`, `${Math.round(pct * 100)}%`, pct >= g.targetValue ? 'good' : '');
          break;
        }
        case 'PREVENT_CASUALTIES':
          html += row(`Casualties ≤ ${g.targetValue}`, c.casualties, c.casualties > g.targetValue ? 'bad' : c.casualties === g.targetValue ? 'warn' : 'good');
          break;
        case 'SURVIVE_TURNS':
          html += row(`Hold ${g.targetValue} turns`, `${Math.min(s.meta.turnNumber, g.targetValue)} / ${g.targetValue}`, s.meta.turnNumber >= g.targetValue ? 'good' : '');
          break;
        case 'CONTAIN_HAZARD':
          html += row(`Fire cells ≤ ${g.targetValue}`, s.hazards.fireCells.size, s.hazards.fireCells.size <= g.targetValue ? 'good' : 'bad');
          break;
        default: break;
      }
    }
    if (s.outcome) html += row('Result', s.outcome.result, s.outcome.result === 'WIN' ? 'good' : 'bad');
    return html;
  }

  _socialText(r) {
    const n = (id) => esc(this._name(id));
    switch (r.type) {
      case 'CONFLICT': return `<b>${esc(r.npcName)}</b> ${r.kind === 'FIGHT' ? 'fights with' : 'intimidates'} <b>${esc(r.targetName)}</b>`;
      case 'RUMOR_DISTORTED': return `Rumour distorted by <b>${n(r.listenerId)}</b>: ${r.claimType === 'EXIT_BLOCKED' ? `"${esc(this._lbl(r.toExit))} is blocked"` : '"threat is on the other side"'}${r.veracity ? '' : ' (false)'}`;
      case 'RUMOR_ORIGINATED': return `<b>${n(r.npcId)}</b> reports ${r.claimType === 'EXIT_BLOCKED' ? `hazard near ${esc(this._lbl(r.exitKey))}` : 'the threat\'s position'}`;
      case 'RUMORS_CORRECTED': return `Alarm broadcast corrected ${r.count} false belief(s)`;
      case 'DEESCALATE': return `You de-escalated <b>${esc(r.name)}</b>`;
      case 'ASSIST': return `You are assisting <b>${esc(r.name)}</b>`;
      case 'NPC_EVACUATED': return `<b>${esc(r.name)}</b> evacuated (${esc(r.reason)})`;
      case 'NPC_INCAPACITATED': return `<b>${esc(r.name)}</b> incapacitated — ${esc(r.reason)}`;
      case 'NPC_TAGGED': return `<b>${esc(r.name)}</b> tagged`;
      case 'NPC_FROZE': return `<b>${esc(r.name)}</b> froze — ${esc(r.reason)}`;
      default: return null;
    }
  }

  _renderSocialLog() {
    const s = this.state;
    const items = [];
    for (const d of s.social.socialLog) items.push({ turn: d.turn, html: `<b>${esc(d.name)}</b>: “${esc(d.text)}”` });
    for (const r of s.telemetryLog) { const t = this._socialText(r); if (t) items.push({ turn: r.turn, html: t }); }
    items.sort((a, b) => a.turn - b.turn);
    const tail = items.slice(-60);
    this.el.log.innerHTML = tail.map((i) => `<li><span class="turn">T${pad(i.turn)}</span>${i.html}</li>`).join('');
    this.el.log.scrollTop = this.el.log.scrollHeight;
  }

  toast(text, kind = '') {
    if (!this.el.toast) return;
    const div = document.createElement('div');
    div.className = `toast ${kind}`;
    div.textContent = text;
    this.el.toast.appendChild(div);
    while (this.el.toast.children.length > 4) this.el.toast.firstChild.remove();
    const t = setTimeout(() => { div.remove(); this._timers.delete(t); }, 3600);
    this._timers.add(t);
  }

  banner(text, cls = '', ms = 1300) {
    const b = this.el.banner;
    if (!b) return;
    clearTimeout(this._bannerTimer);
    b.textContent = text;
    b.className = cls;
    this._bannerTimer = setTimeout(() => { b.classList.add('banner-hidden'); }, ms);
  }

  dispose() {
    for (const off of this._offs) off();
    for (const t of this._timers) clearTimeout(t);
    clearTimeout(this._bannerTimer);
    if (this.el.banner) this.el.banner.className = 'banner-hidden';
    if (this.el.toast) this.el.toast.innerHTML = '';
  }
}