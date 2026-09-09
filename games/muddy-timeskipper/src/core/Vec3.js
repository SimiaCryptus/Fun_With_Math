// Engine-free vector helpers. Mutating-with-out-param style: zero allocation in hot loops.
export const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });

export const set  = (a, x, y, z) => { a.x = x; a.y = y; a.z = z; return a; };
export const copy = (a, b) => { a.x = b.x; a.y = b.y; a.z = b.z; return a; };
export const add  = (o, a, b) => set(o, a.x + b.x, a.y + b.y, a.z + b.z);
export const sub  = (o, a, b) => set(o, a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (o, a, s) => set(o, a.x * s, a.y * s, a.z * s);
export const addScaled = (o, a, b, s) => set(o, a.x + b.x * s, a.y + b.y * s, a.z + b.z * s);
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const lenSq = (a) => a.x * a.x + a.y * a.y + a.z * a.z;
export const len = (a) => Math.sqrt(lenSq(a));
export const horizLen = (a) => Math.hypot(a.x, a.z);

export const clampLen = (a, max) => {
  const l = len(a);
  if (l > max && l > 1e-9) scale(a, a, max / l);
  return a;
};

/** Rotate the XZ part of `a` by `rad` around +Y. */
export const rotateY = (o, a, rad) => {
  const c = Math.cos(rad), s = Math.sin(rad);
  return set(o, a.x * c + a.z * s, a.y, -a.x * s + a.z * c);
};

/** Forward basis from yaw (yaw=0 => +Z). */
export const forwardFromYaw = (o, yaw) => set(o, Math.sin(yaw), 0, Math.cos(yaw));
export const rightFromYaw   = (o, yaw) => set(o, Math.cos(yaw), 0, -Math.sin(yaw));