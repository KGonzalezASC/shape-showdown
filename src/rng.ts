/** Seeded mutable RNG used by one deterministic simulation concern. */
export type MutableRng = { seed: number };

export function makeRng(seed: number): MutableRng {
  return { seed: seed === 0 ? 0x6d2b79f5 : seed };
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

/** Isolated RNG channels per subsystem to prevent inter-system RNG stream drift. */
export interface RngChannels {
  pieces: MutableRng;
  garbage: MutableRng;
  shop: MutableRng;
  effects: MutableRng;
}

function createRngChannels(baseSeed: number): RngChannels {
  return {
    pieces: makeRng((baseSeed ^ 0x11111111) | 0),
    garbage: makeRng((baseSeed ^ 0x22222222) | 0),
    shop: makeRng((baseSeed ^ 0x33333333) | 0),
    effects: makeRng((baseSeed ^ 0x44444444) | 0),
  };
}

function hashSlot(slot: string | number): number {
  const text = String(slot);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash | 0;
}

/**
 * Create channels owned by one stable match slot. Do not use a socket id as the
 * slot key when the result must be reproducible across recorded/replayed matches.
 */
export function createPlayerRngChannels(baseSeed: number, playerSlot: string | number): RngChannels {
  let seed = Math.imul(baseSeed | 0, 0x9e3779b1) ^ hashSlot(playerSlot);
  seed ^= seed >>> 16;
  seed = Math.imul(seed, 0x85ebca6b);
  seed ^= seed >>> 13;
  seed = Math.imul(seed, 0xc2b2ae35);
  seed ^= seed >>> 16;
  return createRngChannels(seed | 0);
}

/**
 * @deprecated Legacy compatibility for isolated unit fixtures. Authoritative
 * match code should pass RngChannels created with createPlayerRngChannels().
 */
export function ensureRngChannels(rng: RngChannels | MutableRng): RngChannels {
  if ('pieces' in rng && 'garbage' in rng && 'shop' in rng && 'effects' in rng) {
    return rng as RngChannels;
  }
  const single = rng as MutableRng;
  return {
    pieces: single,
    garbage: single,
    shop: single,
    effects: single,
  };
}
