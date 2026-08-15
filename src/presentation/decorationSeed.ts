/** Canvas-compatible deterministic sample in [0, 1). */
export function seededDecorationUnit(seed: number, salt: number): number {
  const value = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

/** Keep presentation variation isolated from authoritative match RNG channels. */
export function mixDecorationSeed(matchSeed: number, variation: number): number {
  let mixed = Math.imul(matchSeed | 0, 0x9e3779b1) ^ Math.imul((variation + 1) | 0, 0x85ebca6b);
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb352d);
  mixed ^= mixed >>> 15;
  return mixed | 0;
}

export function createDecorationRandom(seed: number, firstSalt = 1000): () => number {
  let salt = firstSalt;
  return () => {
    const value = seededDecorationUnit(seed, salt);
    salt += 1;
    return value;
  };
}
