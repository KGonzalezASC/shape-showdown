from pathlib import Path

root = Path(r"C:\Users\Keithythefrog\source\BubbleBlitzers")

# --- puzzleTypes.ts: extend timeline model ---
types_path = root / "server/puzzle/puzzleTypes.ts"
types = types_path.read_text(encoding="utf-8")
old_timeline = '''/** One scripted event in the level timeline (the "opponent"). */
/** One absolute scripted fire in the level timeline (the "opponent"). */
export interface TimelineEvent {
  /** Absolute game tick at which the event fires. */
  tick: number;
  /** Free-form hazard descriptor resolved by the session runner. */
  kind: HazardKind;
  /** Hazard parameters (poison variant, curtain rows, magnet step, ...). */
  params?: Record<string, unknown>;
}

/** Relative beat inside a looped timeline segment. */
export interface TimelineLoopBeat {
  /** Offset from each iteration's startTick; must satisfy 0 <= at < periodTicks. */
  at: number;
  kind: HazardKind;
  params?: Record<string, unknown>;
}

/**
 * Repeat `sequence` starting at `startTick` (first iteration included).
 * Materialized to TimelineEvent[] up to a session horizon before application.
 *
 * `periodTicks` meaning:
 * - Instant hazards only: absolute start-to-start stride (legacy).
 * - Lasting hazards (e.g. curtain): idle clear gap *after* the prior iteration's
 *   effect ends (telegraph + active), then the sequence fires again.
 */
export interface TimelineLoop {
  startTick: number;
  /** Idle gap (lasting) or start-to-start period (instant-only). See interface doc. */
  periodTicks: number;
  sequence: TimelineLoopBeat[];
}

/** Authored timeline entry: one-shot event or a looping sequence segment. */
export type TimelineEntry = TimelineEvent | { loop: TimelineLoop };
'''

new_timeline = '''/** One absolute tick-scheduled fire (authored one-shot or materialized from a loop). */
export interface TimelineEvent {
  /** Absolute game tick at which the event fires. */
  tick: number;
  /** Free-form hazard descriptor resolved by the session runner. */
  kind: HazardKind;
  /** Hazard parameters (poison variant, curtain rows, magnet step, ...). */
  params?: Record<string, unknown>;
}

/**
 * Fire once when piecesPlaced (locks) reaches `afterPieces`.
 * Not materializable to ticks ahead of time — session applies on each lock.
 */
export interface TimelinePieceEvent {
  /** Inclusive lock count at which the event fires (1 = after first lock). */
  afterPieces: number;
  kind: HazardKind;
  params?: Record<string, unknown>;
}

/** Relative beat inside a looped timeline segment (tick-based; v1). */
export interface TimelineLoopBeat {
  /** Offset from each iteration's startTick; must satisfy 0 <= at < periodTicks. */
  at: number;
  kind: HazardKind;
  params?: Record<string, unknown>;
}

/**
 * Repeat `sequence` starting at `startTick` (first iteration included).
 * Materialized to TimelineEvent[] up to a session horizon before application.
 *
 * `periodTicks` meaning:
 * - Instant hazards only: absolute start-to-start stride (legacy).
 * - Lasting hazards (e.g. curtain): idle clear gap *after* the prior iteration's
 *   effect ends (telegraph + active), then the sequence fires again.
 *
 * Loops stay tick-based in v1 (no piece-loops).
 */
export interface TimelineLoop {
  startTick: number;
  /** Idle gap (lasting) or start-to-start period (instant-only). See interface doc. */
  periodTicks: number;
  sequence: TimelineLoopBeat[];
}

/** Authored timeline entry: tick one-shot, piece one-shot, or tick loop. */
export type TimelineEntry = TimelineEvent | TimelinePieceEvent | { loop: TimelineLoop };
'''

if old_timeline not in types:
    raise SystemExit('timeline block not found in puzzleTypes.ts')
types_path.write_text(types.replace(old_timeline, new_timeline), encoding='utf-8')
print('puzzleTypes.ts updated')
