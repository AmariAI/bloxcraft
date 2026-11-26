/* Bloxcraft world expansion configuration */
export const WORLD_CHUNK_SIZE = 16;
export const WORLD_RADIUS_CHUNKS = 50;
export const WORLD_SIZE_BLOCKS = WORLD_CHUNK_SIZE * WORLD_RADIUS_CHUNKS * 2;
export const WORLD_SEED = 20261126;

export const worldFeatures = {
  seed: WORLD_SEED,
  biomeScale: 0.035,
  caveScale: 0.11,
  desertTempleSpacing: 18,
  trialChamberSpacing: 24,
  caves: true,
  desertTemples: true,
  trialChambers: true
};

export function biomeForPosition(x, z) {
  const desert = Math.sin((x + WORLD_SEED) * 0.018) + Math.cos(z * 0.014) > 1.45;
  const snow = z < -WORLD_SIZE_BLOCKS * 0.12 || (Math.abs(x) > WORLD_SIZE_BLOCKS * 0.4);
  const forest = !desert && !snow && Math.sin(x * 0.025) * Math.cos(z * 0.021) > 0.15;
  return desert ? 'desert' : snow ? 'snowy_mountains' : forest ? 'forest' : 'plains';
}

export function caveOpeningAt(x, y, z) {
  const a = Math.sin(x * 0.11 + WORLD_SEED) + Math.cos(z * 0.09 - WORLD_SEED * 0.2);
  const b = Math.sin((x + z) * 0.075 + y * 0.13);
  return y > -16 && y < 12 && a + b > 1.42;
}

export function generateWorldBlock(x, y, z) {
  const biome = biomeForPosition(x, z);
  const rolling = Math.sin(x * 0.035) * 2.1 + Math.cos(z * 0.031) * 1.8;
  const detail = Math.sin((x + z) * 0.11) * 0.7;
  let surface = Math.floor(4 + rolling + detail);
  if (biome === 'snowy_mountains') surface += 4;
  if (biome === 'desert') surface = Math.floor(3 + Math.sin(x * .09) + Math.cos(z * .08));

  if (caveOpeningAt(x, y, z)) return null;
  if (y > surface) return null;
  if (y === surface) return biome === 'desert' ? 'sand' : biome === 'snowy_mountains' ? 'snow' : 'grass';
  if (y > surface - 3) return biome === 'desert' ? 'sandstone' : 'dirt';
  return 'stone';
}

export function structureAt(x, z) {
  const templeCellX = Math.floor(x / (WORLD_CHUNK_SIZE * worldFeatures.desertTempleSpacing));
  const templeCellZ = Math.floor(z / (WORLD_CHUNK_SIZE * worldFeatures.desertTempleSpacing));
  const templeHash = Math.abs((templeCellX * 73856093) ^ (templeCellZ * 19349663) ^ WORLD_SEED);
  if (templeHash % 11 === 0 && biomeForPosition(x, z) === 'desert') return 'desert_temple';

  const chamberCellX = Math.floor(x / (WORLD_CHUNK_SIZE * worldFeatures.trialChamberSpacing));
  const chamberCellZ = Math.floor(z / (WORLD_CHUNK_SIZE * worldFeatures.trialChamberSpacing));
  const chamberHash = Math.abs((chamberCellX * 83492791) ^ (chamberCellZ * 2654435761) ^ WORLD_SEED);
  if (chamberHash % 13 === 0) return 'trial_chamber';
  return null;
}
