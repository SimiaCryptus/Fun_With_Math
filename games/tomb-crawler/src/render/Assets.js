import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { PICKUP } from '../world/Chunk.js';

const R = CONFIG.HEX_SIZE;

function makeCanvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return c;
}
function toTexture(canvas, repeatX = 1) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, 1);
  t.anisotropy = 4;
  return t;
}
function speckle(g, w, h, n, colors, rMin, rMax) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[(Math.random() * colors.length) | 0];
    g.globalAlpha = 0.15 + Math.random() * 0.35;
    g.beginPath();
    g.arc(Math.random() * w, Math.random() * h, rMin + Math.random() * (rMax - rMin), 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}
function drawWall(g, w, h) {
  g.fillStyle = '#8b6a42';
  g.fillRect(0, 0, w, h);
  speckle(g, w, h, 400, ['#6e5231', '#a4804f', '#5a4228'], 0.5, 2);
  g.strokeStyle = 'rgba(40,25,10,0.6)';
  g.lineWidth = 2;
  const rows = 6, rh = h / rows;
  for (let r = 0; r < rows; r++) {
    const y = r * rh;
    g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
    const off = (r % 2) * 16;
    for (let x = off; x < w; x += 32) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + rh); g.stroke(); }
  }
  g.fillStyle = 'rgba(40,25,10,0.45)';
  for (let k = 0; k < 3; k++) {
    const x = 10 + Math.random() * (w - 30), y = rh * (1 + ((Math.random() * (rows - 2)) | 0)) + 4;
    g.fillRect(x, y, 4, rh - 8);
    g.beginPath(); g.arc(x + 12, y + rh / 2 - 4, 4, 0, Math.PI * 2); g.fill();
  }
}

export class Assets {
  constructor() {
    this._geos = new Map();
    this._mats = new Map();
    this.timeUniform = { value: 0 };

    const floorTex = toTexture(makeCanvas(128, 128, (g, w, h) => {
      g.fillStyle = '#b99463';
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, 500, ['#8f6d43', '#d2b07a', '#a07c4c', '#e0c28e'], 0.5, 2.5);
      g.strokeStyle = 'rgba(70,45,20,0.35)';
      g.lineWidth = 2;
      g.beginPath();
      for (let k = 0; k < 3; k++) {
        const y = 20 + k * 40 + Math.random() * 10;
        g.moveTo(0, y); g.lineTo(w, y + Math.random() * 6 - 3);
      }
      g.stroke();
    }));
    const wallTex = toTexture(makeCanvas(128, 128, drawWall), 3);
    const crackTex = toTexture(makeCanvas(128, 128, (g, w, h) => {
      drawWall(g, w, h);
      g.strokeStyle = '#1a0d04';
      g.lineWidth = 2.5;
      for (let b = 0; b < 5; b++) {
        let x = w / 2, y = h / 2;
        g.beginPath(); g.moveTo(x, y);
        const a0 = Math.random() * Math.PI * 2;
        for (let s = 0; s < 7; s++) {
          const a = a0 + (Math.random() - 0.5) * 1.2;
          x += Math.cos(a) * 10; y += Math.sin(a) * 10;
          g.lineTo(x, y);
        }
        g.stroke();
      }
    }), 3);

    this.floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.95, metalness: 0 });
    this.wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9, metalness: 0 });
    this.crackedMat = new THREE.MeshStandardMaterial({
      map: crackTex, roughness: 0.85, color: 0xffe6c0, emissive: 0x331a08, emissiveIntensity: 0.6,
    });

    this.coinMat = new THREE.MeshStandardMaterial({
      color: 0xffc83d, metalness: 0.35, roughness: 0.35, emissive: 0x6a4300, emissiveIntensity: 0.7,
    });
    const tu = this.timeUniform;
    this.coinMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = tu;
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
          float spinA = uTime * 2.4 + float(gl_InstanceID) * 0.9;
          mat3 spinM = mat3(cos(spinA), 0.0, -sin(spinA), 0.0, 1.0, 0.0, sin(spinA), 0.0, cos(spinA));
          objectNormal = spinM * objectNormal;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          transformed = spinM * transformed;
          transformed.y += sin(uTime * 2.0 + float(gl_InstanceID)) * 0.04;`);
    };
    this.coinMat.customProgramCacheKey = () => 'spinning-coin';

    this.floorGeo = new THREE.CylinderGeometry(R * 0.97, R * 0.97, 0.2, 6).translate(0, -0.1, 0);
    this.wallGeo = new THREE.CylinderGeometry(R * 0.95, R * 1.0, 1.4, 6).translate(0, 0.7, 0);
    this.coinGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.06, 16).rotateX(Math.PI / 2);
    this.pileGeo = new THREE.CylinderGeometry(0.18, 0.46, 0.34, 10).translate(0, -0.28, 0);

    const flameTex = new THREE.CanvasTexture(makeCanvas(64, 128, (g, w, h) => {
      const grd = g.createRadialGradient(w / 2, h * 0.75, 2, w / 2, h * 0.6, h * 0.55);
      grd.addColorStop(0, 'rgba(255,245,190,1)');
      grd.addColorStop(0.25, 'rgba(255,170,50,0.9)');
      grd.addColorStop(0.6, 'rgba(210,50,0,0.45)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
    }));
    flameTex.colorSpace = THREE.SRGBColorSpace;
    this.fireMat = new THREE.MeshBasicMaterial({
      map: flameTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.houndEyeMat = this._std('houndEye', { color: 0xffb030, emissive: 0xff9020, emissiveIntensity: 1.5 });
    this.houndHuntMat = this._std('houndHunt', { color: 0xff2010, emissive: 0xff1000, emissiveIntensity: 3 });
  }

  update(t) { this.timeUniform.value = t; }

  _geo(name, f) {
    let g = this._geos.get(name);
    if (!g) { g = f(); this._geos.set(name, g); }
    return g;
  }
  _std(name, params) {
    let m = this._mats.get(name);
    if (!m) { m = new THREE.MeshStandardMaterial(params); this._mats.set(name, m); }
    return m;
  }
  _basic(name, params) {
    let m = this._mats.get(name);
    if (!m) { m = new THREE.MeshBasicMaterial(params); this._mats.set(name, m); }
    return m;
  }
  _mesh(geo, mat, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    return m;
  }
  _label(text, color) {
    const name = 'label' + text;
    let m = this._mats.get(name);
    if (!m) {
      const tex = new THREE.CanvasTexture(makeCanvas(128, 64, (g, w, h) => {
        g.font = 'bold 46px sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineWidth = 6;
        g.strokeStyle = '#1a0d04';
        g.strokeText(text, w / 2, h / 2);
        g.fillStyle = color;
        g.fillText(text, w / 2, h / 2);
      }));
      tex.colorSpace = THREE.SRGBColorSpace;
      m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
      this._mats.set(name, m);
    }
    const s = new THREE.Sprite(m);
    s.scale.set(0.9, 0.45, 1);
    return s;
  }

  _spark() {
    const mat = this._basic('spark', { color: 0xffee88 });
    return this._mesh(this._geo('spark', () => new THREE.SphereGeometry(0.06, 8, 6)), mat);
  }

  // ---------- player ----------
  makePlayer() {
    const g = new THREE.Group();
    const cloth = this._std('cloth', { color: 0xc8a46a, roughness: 0.8 });
    const skin = this._std('skin', { color: 0xe2b48c, roughness: 0.7 });
    const leather = this._std('leather', { color: 0x6b4423, roughness: 0.8 });
    const glow = this._std('lantern', { color: 0xffd27a, emissive: 0xffa640, emissiveIntensity: 2.4 });
    g.add(this._mesh(this._geo('pBody', () => new THREE.CylinderGeometry(0.2, 0.3, 0.62, 10)), cloth, 0, 0.31, 0));
    g.add(this._mesh(this._geo('pHead', () => new THREE.SphereGeometry(0.17, 14, 10)), skin, 0, 0.76, 0));
    g.add(this._mesh(this._geo('pBrim', () => new THREE.CylinderGeometry(0.32, 0.32, 0.03, 18)), leather, 0, 0.88, 0));
    g.add(this._mesh(this._geo('pCrown', () => new THREE.CylinderGeometry(0.15, 0.18, 0.16, 14)), leather, 0, 0.96, 0));
    g.add(this._mesh(this._geo('pPack', () => new THREE.BoxGeometry(0.2, 0.3, 0.3)), leather, -0.24, 0.42, 0));
    g.add(this._mesh(this._geo('pLantern', () => new THREE.SphereGeometry(0.09, 10, 8)), glow, 0.3, 0.42, 0.14));
    return g;
  }

  // ---------- enemies ----------
  makeEnemy(type, small = false) {
    const g = new THREE.Group();
    switch (type) {
      case 'scarab': {
        const bronze = this._std('bronze', { color: 0xa9702c, metalness: 0.6, roughness: 0.35, emissive: 0x2a1405 });
        const dark = this._std('beetleDark', { color: 0x3a2410, roughness: 0.6 });
        const body = this._mesh(this._geo('scBody', () => new THREE.SphereGeometry(0.28, 14, 10)), bronze, 0, 0.2, 0);
        body.scale.set(1.25, 0.55, 0.95);
        g.add(body);
        g.add(this._mesh(this._geo('scHead', () => new THREE.SphereGeometry(0.12, 10, 8)), dark, 0.32, 0.18, 0));
        const legGeo = this._geo('scLeg', () => new THREE.BoxGeometry(0.04, 0.04, 0.66));
        for (const x of [-0.14, 0.02, 0.18]) g.add(this._mesh(legGeo, dark, x, 0.1, 0));
        break;
      }
      case 'sentinel': {
        const stone = this._std('stone', { color: 0x8e877a, roughness: 0.95 });
        const eye = this._std('sentEye', { color: 0x60e0ff, emissive: 0x30c0ff, emissiveIntensity: 2.5 });
        g.add(this._mesh(this._geo('stPlinth', () => new THREE.BoxGeometry(0.7, 0.22, 0.7)), stone, 0, 0.11, 0));
        g.add(this._mesh(this._geo('stBody', () => new THREE.CylinderGeometry(0.18, 0.26, 0.62, 8)), stone, 0, 0.53, 0));
        g.add(this._mesh(this._geo('stHead', () => new THREE.BoxGeometry(0.32, 0.3, 0.3)), stone, 0, 1.0, 0));
        const eg = this._geo('stEye', () => new THREE.BoxGeometry(0.03, 0.05, 0.06));
        g.add(this._mesh(eg, eye, 0.165, 1.03, 0.07));
        g.add(this._mesh(eg, eye, 0.165, 1.03, -0.07));
        break;
      }
      case 'cobra': {
        const scales = this._std('cobraScale', { color: 0x4c8a3c, roughness: 0.5 });
        const belly = this._std('cobraBelly', { color: 0xd9c27a, roughness: 0.6 });
        const eye = this._std('cobraEye', { color: 0xff3020, emissive: 0xff2010, emissiveIntensity: 2.5 });
        const coil = this._mesh(this._geo('cbCoil', () => new THREE.TorusGeometry(0.22, 0.08, 8, 18)), scales, 0, 0.09, 0);
        coil.rotation.x = Math.PI / 2;
        g.add(coil);
        const neck = new THREE.Group();
        neck.position.set(0.05, 0.1, 0);
        neck.add(this._mesh(this._geo('cbNeck', () => new THREE.CylinderGeometry(0.06, 0.09, 0.5, 8)), scales, 0, 0.28, 0));
        const hood = new THREE.Group();
        hood.position.y = 0.56;
        const hoodMesh = this._mesh(this._geo('cbHood', () => new THREE.SphereGeometry(0.2, 12, 10)), scales);
        hoodMesh.scale.set(0.3, 1, 0.9);
        hood.add(hoodMesh);
        hood.add(this._mesh(this._geo('cbBelly', () => new THREE.SphereGeometry(0.12, 10, 8)), belly, 0.04, -0.02, 0));
        const eg = this._geo('cbEye', () => new THREE.SphereGeometry(0.025, 6, 4));
        hood.add(this._mesh(eg, eye, 0.1, 0.1, 0.05));
        hood.add(this._mesh(eg, eye, 0.1, 0.1, -0.05));
        neck.add(hood);
        g.add(neck);
        g.userData.hood = hood;
        g.userData.neck = neck;
        break;
      }
      case 'hound': {
        const dark = this._std('houndDark', { color: 0x1d1b24, roughness: 0.6 });
        const gold = this._std('gold', { color: 0xd6a63a, metalness: 0.6, roughness: 0.3, emissive: 0x3a2500 });
        g.add(this._mesh(this._geo('hdBody', () => new THREE.BoxGeometry(0.56, 0.26, 0.26)), dark, 0, 0.45, 0));
        const legGeo = this._geo('hdLeg', () => new THREE.BoxGeometry(0.07, 0.34, 0.07));
        for (const [x, z] of [[0.2, 0.09], [0.2, -0.09], [-0.2, 0.09], [-0.2, -0.09]]) g.add(this._mesh(legGeo, dark, x, 0.17, z));
        g.add(this._mesh(this._geo('hdHead', () => new THREE.BoxGeometry(0.24, 0.2, 0.2)), dark, 0.38, 0.66, 0));
        g.add(this._mesh(this._geo('hdSnout', () => new THREE.BoxGeometry(0.16, 0.1, 0.12)), dark, 0.54, 0.62, 0));
        const earGeo = this._geo('hdEar', () => new THREE.ConeGeometry(0.05, 0.2, 4));
        g.add(this._mesh(earGeo, gold, 0.36, 0.84, 0.06));
        g.add(this._mesh(earGeo, gold, 0.36, 0.84, -0.06));
        const tail = this._mesh(this._geo('hdTail', () => new THREE.BoxGeometry(0.25, 0.05, 0.05)), gold, -0.38, 0.52, 0);
        tail.rotation.z = 0.5;
        g.add(tail);
        const eg = this._geo('hdEye', () => new THREE.BoxGeometry(0.03, 0.03, 0.03));
        const e1 = this._mesh(eg, this.houndEyeMat, 0.5, 0.69, 0.06);
        const e2 = this._mesh(eg, this.houndEyeMat, 0.5, 0.69, -0.06);
        g.add(e1, e2);
        g.userData.eyes = [e1, e2];
        break;
      }
      case 'swarm': {
        const loc = this._std('locust', { color: 0x6a6230, roughness: 0.6, emissive: 0x151300 });
        const pg = this._geo('swPart', () => new THREE.SphereGeometry(0.06, 6, 4));
        const parts = [];
        for (let i = 0; i < 14; i++) {
          const m = this._mesh(pg, loc);
          const p = { m, bx: (Math.random() - 0.5) * 0.6, by: 0.2 + Math.random() * 0.45, bz: (Math.random() - 0.5) * 0.6, ph: Math.random() * 10 };
          m.scale.set(1.4, 0.7, 0.7);
          parts.push(p);
          g.add(m);
        }
        g.userData.parts = parts;
        break;
      }
    }
    if (small) g.scale.setScalar(0.7);
    return g;
  }

  // ---------- devices ----------
  _bombBody(parent, s = 1) {
    const black = this._std('bombBlack', { color: 0x1a1a1a, metalness: 0.5, roughness: 0.4 });
    const fuse = this._std('fuse', { color: 0x8b6a3a, roughness: 0.9 });
    parent.add(this._mesh(this._geo('bombBody', () => new THREE.SphereGeometry(0.26, 16, 12)), black, 0, 0.27 * s, 0));
    parent.add(this._mesh(this._geo('bombFuse', () => new THREE.CylinderGeometry(0.03, 0.03, 0.14, 6)), fuse, 0, 0.56 * s, 0));
    const spark = this._spark();
    spark.position.y = 0.64 * s;
    parent.add(spark);
    return spark;
  }

  makeDevice(type) {
    const g = new THREE.Group();
    let spark;
    if (type === 'bomb') {
      spark = this._bombBody(g);
    } else if (type === 'incendiary') {
      const red = this._std('incRed', { color: 0xb3261a, roughness: 0.5, emissive: 0x300400 });
      const cap = this._std('incCap', { color: 0x333333, metalness: 0.6, roughness: 0.4 });
      g.add(this._mesh(this._geo('incBody', () => new THREE.CylinderGeometry(0.15, 0.15, 0.4, 12)), red, 0, 0.2, 0));
      g.add(this._mesh(this._geo('incCap', () => new THREE.CylinderGeometry(0.16, 0.16, 0.06, 12)), cap, 0, 0.42, 0));
      spark = this._spark();
      spark.position.y = 0.5;
      g.add(spark);
    } else {
      const olive = this._std('shapedOlive', { color: 0x5c6632, roughness: 0.6, metalness: 0.3 });
      const arrowMat = this._basic('arrow', { color: 0x7dff8a, transparent: true, opacity: 0.85, depthWrite: false });
      g.add(this._mesh(this._geo('shBase', () => new THREE.CylinderGeometry(0.3, 0.34, 0.2, 6)), olive, 0, 0.1, 0));
      g.add(this._mesh(this._geo('shCone', () => new THREE.ConeGeometry(0.2, 0.25, 6)), olive, 0, 0.32, 0));
      const arrow = this._mesh(this._geo('shArrow', () => {
        const s = new THREE.Shape();
        s.moveTo(0.75, 0); s.lineTo(0.38, 0.22); s.lineTo(0.38, 0.08); s.lineTo(0.2, 0.08);
        s.lineTo(0.2, -0.08); s.lineTo(0.38, -0.08); s.lineTo(0.38, -0.22); s.lineTo(0.75, 0);
        return new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2);
      }), arrowMat, 0, 0.03, 0);
      g.add(arrow);
      spark = this._spark();
      spark.position.y = 0.5;
      g.add(spark);
    }
    g.userData.spark = spark;
    return g;
  }

  // ---------- pickups ----------
  makePickup(type) {
    const g = new THREE.Group();
    const inner = new THREE.Group();
    inner.position.y = 0.45;
    g.add(inner);
    g.userData.inner = inner;
    const colors = {
      [PICKUP.BOMB]: 0xff9a3c, [PICKUP.INCENDIARY]: 0xff4a1c, [PICKUP.SHAPED]: 0x9aff5a,
      [PICKUP.MULT2]: 0x7dff8a, [PICKUP.MULT3]: 0xd78bff, [PICKUP.ANKH]: 0xffd24a,
    };
    const glow = this._basic('glow' + type, {
      color: colors[type], transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    g.add(this._mesh(this._geo('glowDisc', () => new THREE.CircleGeometry(0.55, 24).rotateX(-Math.PI / 2)), glow, 0, 0.02, 0));

    switch (type) {
      case PICKUP.BOMB: {
        const b = new THREE.Group(); b.position.y = -0.3; b.scale.setScalar(0.85);
        this._bombBody(b); inner.add(b); break;
      }
      case PICKUP.INCENDIARY:
      case PICKUP.SHAPED: {
        const d = this.makeDevice(type === PICKUP.INCENDIARY ? 'incendiary' : 'shapedCharge');
        d.position.y = -0.3; d.scale.setScalar(0.85);
        inner.add(d); break;
      }
      case PICKUP.MULT2:
      case PICKUP.MULT3: {
        const c = colors[type];
        const mat = this._std('mult' + type, { color: c, emissive: c, emissiveIntensity: 0.8, metalness: 0.3, roughness: 0.4 });
        inner.add(this._mesh(this._geo('multRing', () => new THREE.TorusGeometry(0.24, 0.06, 8, 24)), mat));
        const label = this._label(type === PICKUP.MULT2 ? '×2' : '×3', type === PICKUP.MULT2 ? '#7dff8a' : '#d78bff');
        label.position.y = 0.45;
        g.add(label);
        break;
      }
      case PICKUP.ANKH: {
        const gold = this._std('ankhGold', { color: 0xffcf4a, metalness: 0.7, roughness: 0.25, emissive: 0x5a3a00 });
        inner.add(this._mesh(this._geo('ankhLoop', () => new THREE.TorusGeometry(0.12, 0.045, 8, 16)), gold, 0, 0.18, 0));
        inner.add(this._mesh(this._geo('ankhStem', () => new THREE.BoxGeometry(0.08, 0.36, 0.08)), gold, 0, -0.1, 0));
        inner.add(this._mesh(this._geo('ankhBar', () => new THREE.BoxGeometry(0.34, 0.08, 0.08)), gold, 0, 0.03, 0));
        break;
      }
    }
    return g;
  }

  makeFire() {
    const g = new THREE.Group();
    const geo = this._geo('flame', () => new THREE.PlaneGeometry(1.3, 1.5).translate(0, 0.75, 0));
    const a = new THREE.Mesh(geo, this.fireMat);
    const b = new THREE.Mesh(geo, this.fireMat);
    b.rotation.y = Math.PI / 2;
    g.add(a, b);
    return g;
  }
}