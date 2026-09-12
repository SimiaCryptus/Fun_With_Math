/**
 * Equipment granted by weapon crates. `apply` permanently mutates a troop's stats.
* A troop has a single equipment slot in the MVP; consumable kits (pickaxe, ladder) free the
* slot again once they are used up.
 */
export const EQUIPMENT = Object.freeze({
  rifle: {
    name: 'Rifle',
    label: 'Rifle Crate',
    color: 0x4aa3ff,
    capacity: 5,
    apply(troop) {
      troop.range = 8;
      troop.attack = 3;
      troop.attackCooldown = 1.0;
    },
  },
  pickaxe: {
    name: 'Pickaxe',
    label: 'Pickaxe Crate',
    color: 0xff9a3c,
    capacity: 5,
    apply(troop) {
      troop.canDig = true;
      troop.digUses = 10;
    },
  },
   ladder: {
     name: 'Ladder Kit',
     label: 'Ladder Crate',
     color: 0xd9c47a,
     capacity: 5,
     apply(troop) {
       // Builds up to 3 permanent ladder segments when a wall too tall to step over blocks the way.
       troop.ladders = 3;
     },
   },
});