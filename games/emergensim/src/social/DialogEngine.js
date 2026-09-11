export const PHRASES = {
  PANIC_FREEZE: ["I can't move... I can't...", "We're trapped! The stairs are gone!", "Where do we go?! WHERE?!"],
  BULLY_AGGRESSION: ['Move! Stop blocking the exit!', 'Out of my way. Now.', "You're too slow — get lost."],
  LEADERSHIP_CALM: ["Stay low. I've got your back.", "Everyone with me. Walk, don't run.", 'Doors closed behind us. Keep moving.'],
  WARN_HAZARD: ["Smoke! It's coming from the lab!", 'Fire — that way! Go the other way!', "Don't go down there, it's bad!"],
  GREED_BELONGINGS: ['Wait, my bag is still in there!', "I'm not leaving without my phone.", 'Just one second, my stuff—'],
  STATUS_IDLE: ['Is this a drill?', 'Did anyone hear that?', "What's going on?"],
  FLEE: ['Go go go!', 'Run!', 'This way — I think!'],
  FOLLOW: ['Right behind you.', "Okay, I'm following you.", 'Lead the way.'],
  DRILL: ['Drill protocol. Nearest exit.', 'Line up, standard route.', 'Like we practiced.'],
  SHELTER: ['Lights off. Stay quiet.', 'Away from the door. Shh.', "Get down. Don't make a sound."],
  RUMOR: ['I heard the exit is blocked!', 'Someone said the whole wing is on fire!', "They said don't go that way!"],
  RUMOR_THREAT: ["They're right over there — I heard it!", 'Someone saw them by the other hall!'],
  NEED_ASSIST: ["...can't breathe..."],
};

const TONE = { PANIC_FREEZE: 'panic', WARN_HAZARD: 'panic', FLEE: 'panic', RUMOR: 'panic', RUMOR_THREAT: 'panic', BULLY_AGGRESSION: 'aggro', LEADERSHIP_CALM: 'calm', DRILL: 'calm', SHELTER: 'calm', FOLLOW: 'calm' };

/** State-driven diagnostic utterance generator. */
export class DialogEngine {
  constructor(state, bus) { this.state = state; this.bus = bus; }

  utter(npc, key) {
    const lines = PHRASES[key] || PHRASES.STATUS_IDLE;
    const text = lines[Math.floor(this.state.random() * lines.length)];
    const entry = { turn: this.state.meta.turnNumber, npcId: npc.id, name: npc.name, key, text, tone: TONE[key] || 'neutral', position: { ...npc.position } };
    const log = this.state.social.socialLog;
    log.push(entry);
    if (log.length > 120) log.splice(0, log.length - 120);
    this.bus.emit('NPC_DIALOG', entry);
    return entry;
  }
}