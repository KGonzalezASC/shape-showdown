/** Seeded mutable RNG shared by simulation and shop rolls. */
export type MutableRng = { seed: number };

export function makeRng(seed: number): MutableRng {
  return { seed };
}

/** xorshift32 → [0, 1). Mutates `rng.seed`. */
export function rngNext(rng: MutableRng): number {
  let x = rng.seed | 0;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  rng.seed = x | 0;
  return (x >>> 0) / 0xffffffff;
}

/** Inclusive integer in [0, maxExclusive). */
export function rngInt(rng: MutableRng, maxExclusive: number): number {
  if (maxExclusive <= 0) return 0;
  return Math.floor(rngNext(rng) * maxExclusive);
}
