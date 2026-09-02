import type { HazardKind, TimelineEntry, TimelineEvent, TimelineLoop } from './puzzleTypes.js';

export function isTimelineLoopEntry(
  entry: TimelineEntry,
): entry is { loop: TimelineLoop } {
  return typeof entry === 'object' && entry !== null && 'loop' in entry;
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
