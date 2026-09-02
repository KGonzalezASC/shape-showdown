import type { HazardKind, TimelineEntry, TimelineEvent, TimelineLoop } from './puzzleTypes.js';
import { CURTAIN_DURATION_TICKS, CURTAIN_TELEGRAPH_TICKS } from '../../src/constants.js';

export function isTimelineLoopEntry(
  entry: TimelineEntry,
): entry is { loop: TimelineLoop } {
  return typeof entry === 'object' && entry !== null && 'loop' in entry;
}

/**
 * Ticks from fire until a lasting hazard is fully clear (warn + active).
 * Instant hazards return 0 so loop periodTicks stays an absolute start-to-start stride.
 */
export function hazardOccupiedTicks(kind: HazardKind): number {
  switch (kind) {
    case 'curtain':
      // Telegraph pending/warn, then blackout duration — matches shop + engine.
      return CURTAIN_TELEGRAPH_TICKS + CURTAIN_DURATION_TICKS;
    default:
      return 0;
  }
}

/** How long a loop iteration occupies the board before the idle gap may begin. */
export function loopIterationOccupiedTicks(sequence: TimelineLoop['sequence']): number {
  let occupied = 0;
  for (const beat of sequence) {
    occupied = Math.max(occupied, beat.at + hazardOccupiedTicks(beat.kind));
  }
  return occupied;
}

/** True when any beat has a lasting (non-instant) hazard. */
export function loopHasLastingHazard(sequence: TimelineLoop['sequence']): boolean {
  return sequence.some((beat) => hazardOccupiedTicks(beat.kind) > 0);
}

/** Expand authored timeline entries (including loops) into absolute fire events up to untilTick inclusive. */
export function materializeTimeline(
  entries: readonly TimelineEntry[],
  untilTick: number,
): TimelineEvent[] {
  if (!Number.isInteger(untilTick) || untilTick < 0) {
    throw new Error(`materializeTimeline: untilTick must be a non-negative integer, got ${untilTick}`);
  }

  const out: TimelineEvent[] = [];

  for (const entry of entries) {
    if (isTimelineLoopEntry(entry)) {
      const { startTick, periodTicks, sequence } = entry.loop;
      const lasting = loopHasLastingHazard(sequence);
      if (lasting) {
        // periodTicks = idle gap after the lasting effect ends (not fire-to-fire).
        const occupied = loopIterationOccupiedTicks(sequence);
        let base = startTick;
        while (base <= untilTick) {
          for (const beat of sequence) {
            const tick = base + beat.at;
            if (tick > untilTick) continue;
            out.push({
              tick,
              kind: beat.kind,
              ...(beat.params !== undefined ? { params: beat.params } : {}),
            });
          }
          const stride = occupied + periodTicks;
          if (stride <= 0) {
            throw new Error(
              `materializeTimeline: lasting loop stride must be positive (occupied=${occupied}, period=${periodTicks})`,
            );
          }
          base += stride;
        }
      } else {
        // Instant hazards: periodTicks is the absolute start-to-start period.
        for (let iter = 0; ; iter += 1) {
          const base = startTick + iter * periodTicks;
          if (base > untilTick) break;
          for (const beat of sequence) {
            const tick = base + beat.at;
            if (tick > untilTick) continue;
            out.push({
              tick,
              kind: beat.kind,
              ...(beat.params !== undefined ? { params: beat.params } : {}),
            });
          }
        }
      }
    } else {
      if (entry.tick <= untilTick) {
        out.push({
          tick: entry.tick,
          kind: entry.kind,
          ...(entry.params !== undefined ? { params: entry.params } : {}),
        });
      }
    }
  }

  out.sort((a, b) => a.tick - b.tick || a.kind.localeCompare(b.kind));
  return out;
}

/** Offset absolute ticks / loop startTicks (used by the level generator). */
export function offsetTimelineEntries(
  entries: readonly TimelineEntry[],
  offsetTicks: number,
): TimelineEntry[] {
  const offset = Math.max(0, offsetTicks);
  return entries.map((entry) => {
    if (isTimelineLoopEntry(entry)) {
      return {
        loop: {
          ...entry.loop,
          startTick: entry.loop.startTick + offset,
          sequence: entry.loop.sequence.map((beat) => ({ ...beat })),
        },
      };
    }
    return { ...entry, tick: entry.tick + offset };
  });
}

export function assertValidTimelineLoop(
  loop: TimelineLoop,
  context: string,
): void {
  if (!Number.isInteger(loop.startTick) || loop.startTick < 0) {
    throw new Error(`${context}: loop.startTick must be a non-negative integer`);
  }
  if (!Number.isInteger(loop.periodTicks) || loop.periodTicks <= 0) {
    throw new Error(`${context}: loop.periodTicks must be a positive integer`);
  }
  if (!Array.isArray(loop.sequence) || loop.sequence.length === 0) {
    throw new Error(`${context}: loop.sequence must be a non-empty array`);
  }
  for (const beat of loop.sequence) {
    if (!Number.isInteger(beat.at) || beat.at < 0 || beat.at >= loop.periodTicks) {
      throw new Error(
        `${context}: loop beat.at must satisfy 0 <= at < periodTicks (got at=${beat.at}, period=${loop.periodTicks})`,
      );
    }
    if (typeof beat.kind !== 'string' || beat.kind.length === 0) {
      throw new Error(`${context}: loop beat.kind is required`);
    }
  }
}

/** Collect hazard kinds referenced by authored timeline entries (for allowlist checks). */
export function timelineEntryHazardKinds(entries: readonly TimelineEntry[]): HazardKind[] {
  const kinds: HazardKind[] = [];
  for (const entry of entries) {
    if (isTimelineLoopEntry(entry)) {
      for (const beat of entry.loop.sequence) {
        kinds.push(beat.kind);
      }
    } else {
      kinds.push(entry.kind);
    }
  }
  return kinds;
}
