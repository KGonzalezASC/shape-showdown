import type { HazardKind, TimelineEvent } from './puzzleTypes.js';

/** Hazards the puzzle session runner actually applies today. */
export const SUPPORTED_PUZZLE_HAZARDS = [
  'poison',
  'storage-poison',
  'retrim',
  'curtain',
  'freeze',
  'magnet',
  'snag',
  'sticky',
  'bomber',
  'garbage',
  'purge',
  'wildcard',
] as const satisfies readonly HazardKind[];

export type SupportedPuzzleHazard = (typeof SUPPORTED_PUZZLE_HAZARDS)[number];

const SUPPORTED_SET = new Set<string>(SUPPORTED_PUZZLE_HAZARDS);

/** Hazards that exist in the type union but are not implemented for solo timelines. */
export const UNSUPPORTED_PUZZLE_HAZARDS = [
  'satellite',
  'tectonic',
] as const satisfies readonly HazardKind[];

export function isSupportedPuzzleHazard(kind: HazardKind): kind is SupportedPuzzleHazard {
  return SUPPORTED_SET.has(kind);
}

export function assertSupportedPuzzleTimeline(
  timeline: TimelineEvent[],
  context = 'puzzle timeline',
): void {
  for (const event of timeline) {
    if (!isSupportedPuzzleHazard(event.kind)) {
      throw new Error(
        `${context}: unsupported hazard "${event.kind}" (supported: ${SUPPORTED_PUZZLE_HAZARDS.join(', ')})`,
      );
    }
  }
}
