export const TILE_SIZE_M = 1.5;
export const FLOOR_HEIGHT_M = 3.0;
export const AMBIENT_TEMP = 20;

export function coordKey(x, y, z) { return `${x},${y},${z}`; }
export function parseKey(key) { const [x, y, z] = key.split(',').map(Number); return { x, y, z }; }
export function keyOf(c) { return coordKey(c.x, c.y, c.z); }

export const MATERIALS = {
  CONCRETE: { flammability: 0.0, fuelCapacity: 0, structuralMax: 1000, soundTransmission: 0.2 },
  STANDARD: { flammability: 0.25, fuelCapacity: 60, structuralMax: 600, soundTransmission: 0.8 },
  CARPET:   { flammability: 0.45, fuelCapacity: 80, structuralMax: 600, soundTransmission: 0.7 },
  WOOD:     { flammability: 0.4, fuelCapacity: 80, structuralMax: 300, soundTransmission: 0.5 },
  GLASS:    { flammability: 0.0, fuelCapacity: 0, structuralMax: 80, soundTransmission: 0.6 },
  SOLVENT:  { flammability: 0.95, fuelCapacity: 140, structuralMax: 600, soundTransmission: 0.8 },
};

export const TILE_DEFAULTS = {
  FLOOR:       { walkable: true,  occludesVision: false, material: 'STANDARD' },
  WALL:        { walkable: false, occludesVision: true,  material: 'CONCRETE' },
  DOOR:        { walkable: true,  occludesVision: true,  material: 'WOOD' },
  WINDOW:      { walkable: false, occludesVision: false, material: 'GLASS' },
  STAIR:       { walkable: true,  occludesVision: false, material: 'CONCRETE' },
  EXIT:        { walkable: true,  occludesVision: false, material: 'CONCRETE' },
  CONTAINMENT: { walkable: true,  occludesVision: false, material: 'SOLVENT' },
};

export function createTile(def) {
  const type = TILE_DEFAULTS[def.type] ? def.type : 'FLOOR';
  const base = TILE_DEFAULTS[type];
  const material = { ...MATERIALS[def.material || base.material] };
  if (typeof def.flammability === 'number') material.flammability = def.flammability;
  if (typeof def.fuelCapacity === 'number') material.fuelCapacity = def.fuelCapacity;
  const tile = {
    coord: { x: def.x, y: def.y, z: def.z },
    key: coordKey(def.x, def.y, def.z),
    type,
    walkable: base.walkable,
    occludesVision: base.occludesVision,
    material,
    elevation: def.z * FLOOR_HEIGHT_M,
    temperature: AMBIENT_TEMP,
    debris: false,
    burnt: false,
    shattered: false,
    label: def.label || null,
  };
  if (type === 'DOOR') {
    tile.doorState = { isOpen: false, isLocked: false, isBarricaded: false, barricadeStrength: 0, temperature: AMBIENT_TEMP, lastChecked: -99, ...(def.doorState || {}) };
    if (tile.doorState.isLocked) tile.doorState.barricadeStrength = Math.max(tile.doorState.barricadeStrength, 40);
  }
  return tile;
}

export function tileOccludes(tile) {
  if (!tile) return true;
  if (tile.type === 'DOOR') return !tile.doorState.isOpen;
  return tile.occludesVision;
}

/** @param {Object} opts - { canOpenDoors, canForce } */
export function isTilePassable(tile, opts = {}) {
  if (!tile || tile.debris) return false;
  if (tile.type === 'WALL' || tile.type === 'WINDOW') return false;
  if (tile.type === 'DOOR') {
    const ds = tile.doorState;
    if (ds.isOpen) return true;
    if (ds.isBarricaded || ds.isLocked) return !!opts.canForce;
    return !!opts.canOpenDoors;
  }
  return tile.walkable;
}

/** Thermal / gas permeability of a tile boundary. */
export function permeability(tile) {
  if (!tile) return 0;
  switch (tile.type) {
    case 'WALL': return 0.03;
    case 'WINDOW': return tile.shattered ? 0.6 : 0.08;
    case 'DOOR': return tile.doorState.isOpen ? 1.0 : 0.12;
    default: return 1.0;
  }
}

export function ignitionTemp(flammability) { return 400 - 300 * flammability; }