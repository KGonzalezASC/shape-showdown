import type { GamePiece } from './types';

/**
 * Sparse replay snapshots cannot identify which cleared cells came from a
 * Bomber blast versus ordinary line clears. Keep the live transition effect,
 * but do not synthesize a Bomber explosion from a multi-tick replay gap.
 */
export function shouldAnimateBomberExplosion(
  suppressSparseReplayAnimation: boolean,
  previousActivePiece: Pick<GamePiece, 'bomber'> | null,
): boolean {
  return !suppressSparseReplayAnimation && !!previousActivePiece?.bomber;
}
