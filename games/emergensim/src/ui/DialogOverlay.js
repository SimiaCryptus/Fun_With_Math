/** Speech bubbles anchored to NPC tokens; only NPCs in the player's line of sight on the viewed floor are shown. */
export class DialogOverlay {
  constructor(el, state, bus) {
    this.el = el;
    this.state = state;
    this.bus = bus;
    this.bubbles = new Map(); // npcId -> { el, expires }
    this.ttl = 5200;
    this._offs = [
      bus.on('NPC_DIALOG', (e) => this.show(e)),
      bus.on('REWOUND', () => this.clear()),
      bus.on('SCENARIO_ENDED', () => { for (const b of this.bubbles.values()) b.expires += 4000; }),
    ];
  }

  show(entry) {
    let b = this.bubbles.get(entry.npcId);
    if (!b) {
      const div = document.createElement('div');
      div.className = 'speech-bubble';
      this.el.appendChild(div);
      b = { el: div, expires: 0 };
      this.bubbles.set(entry.npcId, b);
    }
    b.el.textContent = entry.text;
    b.el.className = `speech-bubble ${entry.tone || ''}`;
    b.expires = performance.now() + this.ttl;
  }

  /** @param {(pos) => ({x, y, visible} | null)} project */
  update(project) {
    const now = performance.now();
    for (const [id, b] of this.bubbles) {
      const npc = this.state.npcs.get(id);
      if (now > b.expires || !npc || npc.status === 'EVACUATED' || npc.status === 'TAGGED') {
        b.el.remove();
        this.bubbles.delete(id);
        continue;
      }
      const pos = npc.carriedBy ? this.state.player.position : npc.position;
      const p = project(pos);
      if (!p || !p.visible) { b.el.style.display = 'none'; continue; }
      const remaining = b.expires - now;
      b.el.style.display = '';
      b.el.style.left = `${p.x}px`;
      b.el.style.top = `${p.y - 8}px`;
      b.el.style.opacity = remaining < 700 ? String(remaining / 700) : '1';
    }
  }

  clear() {
    for (const b of this.bubbles.values()) b.el.remove();
    this.bubbles.clear();
  }

  dispose() {
    for (const off of this._offs) off();
    this.clear();
  }
}