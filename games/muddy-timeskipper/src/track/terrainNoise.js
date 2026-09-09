// Base terrain undulation shared by the sim (MudField.bake) and the renderer
// (outer ground displacement, prop placement). Keep the JS and GLSL in lockstep.
export const terrainNoise = (x, z) => Math.sin(x * 0.05) * 0.25 + Math.cos(z * 0.043) * 0.2;

export const TERRAIN_NOISE_GLSL = /* glsl */`
  float mtTerrainHeight(vec2 p){ return sin(p.x * 0.05) * 0.25 + cos(p.y * 0.043) * 0.2; }
`;