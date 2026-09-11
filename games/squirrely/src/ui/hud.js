const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const $ = (id) => document.getElementById(id);

/** DOM HUD: score, multiplier, lives, timer, hollows, driver legend, dossier / cause-of-death cards (SPEC §17.1). */
export class Hud {
  constructor(profiles, rules, tuning) {
    this.profiles = profiles; this.rules = rules; this.tuning = tuning;
    this.el = {
      score: $('score'), mult: $('mult'), lives: $('lives'), timer: $('timer'), level: $('level'),
       hollows: $('hollows'), legend: $('legend'), card: $('card'), mouth: $('mouth'), hint: $('hint'),
    };
     this.el.hint.innerHTML = '💣 Carrying a smoke bomb — press <kbd>E</kbd> (long‑press on touch) to drop and light it. It can\'t be banked.';
    this.chips = {};
    for (const id in profiles) {
      const p = profiles[id];
      const chip = document.createElement('div');
      chip.className = 'chip';
      chip.style.setProperty('--c', hex(p.colorHex));
      chip.innerHTML = `<span class="swatch">${p.icon}</span><span>${id.toUpperCase()} — ${p.rule}</span>`;
      this.el.legend.appendChild(chip);
      this.chips[id] = chip;
    }
    this.hollowEls = tuning.hollowXs.map(() => {
      const d = document.createElement('div');
      d.className = 'hollow';
      this.el.hollows.appendChild(d);
      return d;
    });
    this.cardTimer = 0; this.multHot = 0; this.debug = false; this.label = '';
    this.onScreen = new Set();
    try { this.seen = new Set(JSON.parse(localStorage.getItem('squirrely.seen') || '[]')); } catch { this.seen = new Set(); }
  }

  bind(world, events, label) {
    this.world = world; this.label = label;
    for (const id in this.chips) this.chips[id].classList.toggle('locked', !world.level.mix[id]);
    this.el.card.classList.add('hidden'); this.cardTimer = 0;
    events.on('player:death', ({ driverId, cause }) => {
      if (cause === 'timer') this.card('Out of time.', 'The clock is a driver too. Keep moving.', 0xf2c724, 2.5);
      else if (driverId) { const p = this.profiles[driverId]; this.card(`${p.icon} ${p.label} got you.`, this.rules[driverId], p.colorHex, 3); }
    });
    events.on('nearmiss', () => { this.multHot = 0.35; });
    events.on('item:pickup', ({ kind }) => {
      if (kind === 'smoke' && this.markSeen('tip:smoke')) {
         this.card('Smoke bomb!', 'Press E to drop it — it lights itself. Drivers slow down to gawk and Red loses sight of you. It cannot be banked.', 0x9aa0a8, 4);
      } else if (kind === 'acorn' && this.markSeen('tip:acorn')) {
        this.card('Acorn!', 'Carry up to two. Bring them to the far side to bank the points.', 0xc97a3a, 3);
      }
    });
     events.on('acorn:bank', ({ acorns, points }) => {
       this.card(`Banked ${acorns} acorn${acorns > 1 ? 's' : ''}!`, `+${points}`, 0xc97a3a, 1.5);
    });
    events.on('hollow', ({ remaining }) => {
      if (remaining > 0) this.card('Hollow filled!', `${remaining} to go — back to the start.`, 0xc97a3a, 1.5);
    });
  }
  /** Records a first-time tip; returns true if it had not been seen before. */
  markSeen(key) {
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    try { localStorage.setItem('squirrely.seen', JSON.stringify([...this.seen])); } catch { /* ignore */ }
    return true;
  }


  card(title, sub, colorHex, seconds) {
    const c = this.el.card;
    c.innerHTML = `${title}<small>${sub}</small>`;
    c.style.setProperty('--c', hex(colorHex));
    c.classList.remove('hidden');
    this.cardTimer = seconds;
  }

  update(world, dt) {
    const s = world.scoring, p = world.player, el = this.el;
    el.score.textContent = String(s.score);
    el.mult.textContent = `×${s.multiplier.toFixed(1)}`;
    this.multHot = Math.max(0, this.multHot - dt);
    el.mult.classList.toggle('hot', this.multHot > 0);
    el.lives.textContent = '🐿️'.repeat(Math.max(0, world.lives));
    const cap = this.tuning.mouthCapacity;
    el.mouth.textContent = p.mouth.map((k) => (k === 'smoke' ? '💣' : '🌰')).join('') + '◌'.repeat(Math.max(0, cap - p.mouth.length));
     el.hint.classList.toggle('hidden', !(p.alive && p.mouth.includes('smoke')));   // how to use the smoke bomb
    el.timer.textContent = String(Math.ceil(world.timer));
    el.timer.classList.toggle('low', world.timer < 10);
    el.level.textContent = this.debug
      ? `${this.label} · ${world.vehicles.length} veh · crashes ${world.stats.crashes} · swerves ${world.stats.swerves} · locks ${world.stats.locks} · seed ${world.seed}`
      : this.label;
    for (let i = 0; i < this.hollowEls.length; i++) this.hollowEls[i].classList.toggle('filled', !!world.hollows[i]?.filled);

    const on = this.onScreen;
    on.clear();
    let pulse = null;
    const hw = this.tuning.visibleHalfWidth;
    for (const v of world.vehicles) {
      if (Math.abs(v.x - p.x) > hw) continue;
      on.add(v.driverId);
      if (v.driverId === 'red' && (v.mode === 'LOCKED' || v.mode === 'COMMIT')) pulse = 'red';
    }
    for (const id in this.chips) {
      const c = this.chips[id];
      c.classList.toggle('active', on.has(id));
      c.classList.toggle('pulse', pulse === id);
    }

    // dossier card on a driver type's first on-screen appearance (§13.3)
    if (world.status === 'playing' && p.alive && this.cardTimer <= 0) {
      for (const id of on) {
        if (!this.markSeen(id)) continue;
        const pr = this.profiles[id];
        this.card(`${pr.icon} ${pr.label} — ${pr.rule}`, this.rules[id], pr.colorHex, 3.5);
        break;
      }
    }
    if (this.cardTimer > 0) {
      this.cardTimer -= dt;
      if (this.cardTimer <= 0) el.card.classList.add('hidden');
    }
  }
}