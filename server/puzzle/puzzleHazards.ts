import type { HazardKind, TimelineEntry } from './puzzleTypes.js';
import {
  assertValidTimelineLoop,
  isTimelineLoopEntry,
  timelineEntryHazardKinds,
} from './puzzleTimeline.js';

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
  timeline: TimelineEntry[],
  context = 'puzzle timeline',
): void {
  for (const entry of timeline) {
    if (isTimelineLoopEntry(entry)) {
      assertValidTimelineLoop(entry.loop, context);
    } else if (!Number.isInteger(entry.tick) || entry.tick < 0) {
      throw new Error(`${context}: event.tick must be a non-negative integer`);
    }
  }
  for (const kind of timelineEntryHazardKinds(timeline)) {
    if (!isSupportedPuzzleHazard(kind)) {
      throw new Error(
        `${context}: unsupported hazard "${kind}" (supported: ${SUPPORTED_PUZZLE_HAZARDS.join(', ')})`,
      );
    }
  }
}
