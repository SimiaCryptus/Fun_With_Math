import * as THREE from 'three';

const HOT = new THREE.Color(0xff5a1f);
const CHAR = new THREE.Color(0x101010);

/**
 * Visibility shading: VISIBLE = full colour, EXPLORED = desaturated blueprint (0.38), UNSEEN = near-black (0.05).
 * Floors below the viewed floor are dimmed; burnt tiles read as char; hot visible tiles tint toward infrared red.
 */
export class FogOfWarOverlay {
  constructor(map, state) {
    this.map = map;
    this.state = state;
  }

  update(viewFloor, revealAll = false) {
    const p = this.state.player;
    for (const [key, tile] of this.state.grid.tiles) {
      const seen = revealAll || p.visible.has(key);
      let f = seen ? 1 : p.explored.has(key) ? 0.38 : 0.05;
      if (tile.coord.z < viewFloor) f *= 0.45;
      this.map.shade(key, f, (c) => {
        if (tile.burnt) c.lerp(CHAR, 0.75);
        else if (seen && tile.temperature > 60) c.lerp(HOT, Math.min(0.7, (tile.temperature - 60) / 600));
        if (tile.type === 'WINDOW' && tile.shattered) c.multiplyScalar(0.45);
      });
    }
    this.map.commit();
  }
}