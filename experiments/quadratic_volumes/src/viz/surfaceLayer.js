// Split surfaces: level sets f(x) = t drawn by marching tetrahedra over
// the reference box. Slabs show both faces.

import * as THREE from 'three';
import { marchingTets } from '../geometry/tetmesh.js';
import { fieldFromJSON } from '../geometry/predicates/serialize.js';
import { unitBox } from '../geometry/box.js';

export function createSurfaceLayer(scene) {
  const group = new THREE.Group();
  scene.add(group);

  function clear() {
    for (const c of [...group.children]) {
      group.remove(c);
      c.geometry.dispose();
      c.material.dispose();
    }
  }

  return {
    /** splits: output of collectSplits(); only field-bearing ones render. */
    set(splits, { res = 28, maxSurfaces = 12, box = unitBox(3) } = {}) {
      clear();
      let drawn = 0;
      for (const s of splits) {
        if (drawn >= maxSurfaces) break;
        const f = s.field && fieldFromJSON(s.field);
        if (!f) continue;
        const levels = s.kind === 'slabIn' || s.kind === 'slabOut'
          ? [s.t, s.t2] : [s.t];
        for (const t of levels) {
          const pos = marchingTets(f, box, t, res);
          if (!pos.length) continue;
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
          g.computeVertexNormals();
          const hue = (s.depth * 0.13) % 1;
          const mat = new THREE.MeshBasicMaterial({
            color: new THREE.Color().setHSL(hue, 0.6, 0.6),
            transparent: true, opacity: 0.35, side: THREE.DoubleSide,
            depthWrite: false,
          });
          group.add(new THREE.Mesh(g, mat));
        }
        drawn++;
      }
    },
    setVisible(v) { group.visible = v; },
    clear,
  };
}