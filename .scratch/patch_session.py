from pathlib import Path
root = Path(r"C:\Users\Keithythefrog\source\BubbleBlitzers")
path = root / "server/puzzle/puzzleSession.ts"
text = path.read_text(encoding="utf-8")

text = text.replace(
"import type { HazardKind, PuzzleGoal, PuzzleLevel, PuzzleAttempt, TimelineEvent } from './puzzleTypes.js';\nimport { assertSupportedPuzzleTimeline } from './puzzleHazards.js';\nimport { materializeTimeline } from './puzzleTimeline.js';\n",
"import type { HazardKind, PuzzleGoal, PuzzleLevel, PuzzleAttempt, TimelineEvent, TimelinePieceEvent } from './puzzleTypes.js';\nimport { assertSupportedPuzzleTimeline } from './puzzleHazards.js';\nimport { extractPieceTimeline, materializeTimeline } from './puzzleTimeline.js';\n",
)

old_fields = '''  private readonly timeline: TimelineEvent[];
  private timelineIndex = 0;
  private pieceLocks = 0;
'''
new_fields = '''  private readonly timeline: TimelineEvent[];
  private timelineIndex = 0;
  /** Piece-scheduled beats; applied when piecesPlaced reaches afterPieces. */
  private readonly pieceTimeline: TimelinePieceEvent[];
  private pieceTimelineIndex = 0;
  private pieceLocks = 0;
'''
if old_fields not in text:
    raise SystemExit('fields not found')
text = text.replace(old_fields, new_fields)

old_ctor = '''    assertSupportedPuzzleTimeline(config.level.timeline, `PuzzleSession(${config.level.id})`);
    this.timeline = materializeTimeline(config.level.timeline, this.maxTicks);
'''
new_ctor = '''    assertSupportedPuzzleTimeline(config.level.timeline, `PuzzleSession(${config.level.id})`);
    this.timeline = materializeTimeline(config.level.timeline, this.maxTicks);
    this.pieceTimeline = extractPieceTimeline(config.level.timeline);
'''
if old_ctor not in text:
    raise SystemExit('ctor not found')
text = text.replace(old_ctor, new_ctor)

# Insert fireHazard helper before checkGoal, and applyDuePieceHazards
old_check = '''  /** Goal check per tick. Returns true when the goal is reached. */
  private checkGoal(): boolean {
'''
helper = '''  /** Apply one timeline beat (tick- or piece-scheduled). */
  private fireHazard(kind: HazardKind, params: Record<string, unknown> | undefined): void {
    if (kind === 'garbage') {
      applyHazard(this.getPlayerState(), 'garbage', params, this.gameState.tick);
      return;
    }
    if (kind === 'wildcard') {
      const player = this.getPlayerState();
      const applied = applyHazard(player, 'wildcard', params, this.gameState.tick);
      if (!applied) {
        this.deferredWildcards.push(params ?? {});
        ensureWildcardIncomingEffect(player, this.gameState.tick);
      }
      return;
    }
    applyHazard(this.getPlayerState(), kind, params, this.gameState.tick);
  }

  /** Fire any piece-scheduled beats whose afterPieces threshold is now met. */
  private applyDuePieceHazards(): void {
    while (
      this.pieceTimelineIndex < this.pieceTimeline.length
      && this.pieceTimeline[this.pieceTimelineIndex]!.afterPieces <= this.pieceLocks
    ) {
      const event = this.pieceTimeline[this.pieceTimelineIndex]!;
      this.pieceTimelineIndex += 1;
      this.fireHazard(event.kind, event.params);
    }
  }

  /** Goal check per tick. Returns true when the goal is reached. */
  private checkGoal(): boolean {
'''
if old_check not in text:
    raise SystemExit('checkGoal not found')
text = text.replace(old_check, helper)

# Replace tick-event apply block to use fireHazard
old_tick_fire = '''      // Fire due timeline events (the scripted "opponent").
      while (this.timelineIndex < this.timeline.length && this.timeline[this.timelineIndex].tick <= this.gameState.tick) {
        const event = this.timeline[this.timelineIndex];
        this.timelineIndex += 1;
        if (event.kind === 'garbage') {
          applyHazard(this.getPlayerState(), 'garbage', event.params, this.gameState.tick);
        } else if (event.kind === 'wildcard') {
          const player = this.getPlayerState();
          const applied = applyHazard(player, 'wildcard', event.params, this.gameState.tick);
          if (!applied) {
            this.deferredWildcards.push(event.params ?? {});
            // Keep telegraph visible until shape actually locks (gate may delay apply).
            ensureWildcardIncomingEffect(player, this.gameState.tick);
          }
        } else {
          applyHazard(this.getPlayerState(), event.kind, event.params, this.gameState.tick);
        }
      }
'''
new_tick_fire = '''      // Fire due tick-scheduled timeline events (the scripted "opponent").
      while (this.timelineIndex < this.timeline.length && this.timeline[this.timelineIndex]!.tick <= this.gameState.tick) {
        const event = this.timeline[this.timelineIndex]!;
        this.timelineIndex += 1;
        this.fireHazard(event.kind, event.params);
      }
'''
if old_tick_fire not in text:
    raise SystemExit('tick fire block not found')
text = text.replace(old_tick_fire, new_tick_fire)

# After piece lock, apply piece hazards
old_lock = '''      // Track piece locks for perfect-clear / clear-lines goals.
      if (stepRes.stepResults.puzzle?.locked) {
        this.pieceLocks += 1;
        if (this.level.allowHold === false) {
          rawPlayer.canHold = false;
          rawPlayer.swapCutoffRow = 0;
        }
      }
'''
new_lock = '''      // Track piece locks for perfect-clear / clear-lines / piece-timeline goals.
      if (stepRes.stepResults.puzzle?.locked) {
        this.pieceLocks += 1;
        if (this.level.allowHold === false) {
          rawPlayer.canHold = false;
          rawPlayer.swapCutoffRow = 0;
        }
        this.applyDuePieceHazards();
      }
'''
if old_lock not in text:
    raise SystemExit('lock block not found')
text = text.replace(old_lock, new_lock)

path.write_text(text, encoding='utf-8')
print('puzzleSession.ts ok')
