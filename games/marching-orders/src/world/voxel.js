/** Voxel type ids. Stored as Uint8 in the world grid. */
export const VOXEL = Object.freeze({
  AIR: 0,
  BEDROCK: 1,
  DIRT: 2,
  STONE: 3,
  PLANK: 4,
  OBJECTIVE: 5,
  SPIKES: 6,
   LADDER: 7,
});

/**
 * Gameplay data per voxel type.
 * hardness: 1 = soft (pickaxe), 3 = hard (needs explosives), Infinity = indestructible.
  * climbable: non-solid voxel a unit can stand in and climb through (ladders).
 */
export const VOXEL_TYPES = [
  { id: 0, name: 'air',       solid: false, hardness: 0,        color: 0x000000 },
  { id: 1, name: 'bedrock',   solid: true,  hardness: Infinity, color: 0x3c3c48 },
  { id: 2, name: 'dirt',      solid: true,  hardness: 1,        color: 0x8a5a2b, top: 0x5c9c3a },
  { id: 3, name: 'stone',     solid: true,  hardness: 3,        color: 0x7c8494 },
  { id: 4, name: 'plank',     solid: true,  hardness: 1,        color: 0xc79a55 },
  { id: 5, name: 'objective', solid: true,  hardness: Infinity, color: 0xb8902a, top: 0xffdd55 },
  { id: 6, name: 'spikes',    solid: true,  hardness: Infinity, color: 0x8c2a2a, lethal: true },
   { id: 7, name: 'ladder',    solid: false, hardness: 1,        color: 0xb98a4e, climbable: true },
];

export const VOXEL_BY_NAME = Object.fromEntries(VOXEL_TYPES.map((t) => [t.name, t.id]));

export function voxelInfo(id) {
  return VOXEL_TYPES[id] || VOXEL_TYPES[0];
}

export function isSolid(id) {
  return voxelInfo(id).solid;
}

export function isDiggable(id) {
  return voxelInfo(id).hardness === 1;
}

export function isLethal(id) {
  return !!voxelInfo(id).lethal;
}
export function isClimbable(id) {
   return !!voxelInfo(id).climbable;
}