import { PuzzleSession } from '../server/puzzle/puzzleSession.ts';
import { RulesBot, DEFAULT_RULES_BOT_PROFILE } from '../server/testHarness/rulesBot.ts';
import { buildPoisonBeatLevel } from '../server/puzzle/catalog/authoredLevels.ts';
import { runPuzzleBaselineBatch } from '../server/puzzle/puzzleBaselineBatch.ts';

const base = buildPoisonBeatLevel();

const variants = [
  { label: 'wc120-l2', goal: { kind: 'clear-lines', lines: 2 }, timeline: [
    { tick: 60, kind: 'poison', params: { variant: 2 } },
    { tick: 120, kind: 'wildcard', params: { variant: 2 } },
  ]},
  { label: 'wc150-l3', goal: { kind: 'clear-lines', lines: 3 }, timeline: [
    { tick: 90, kind: 'poison', params: { variant: 2 } },
    { tick: 150, kind: 'wildcard', params: { variant: 2 } },
  ]},
  { label: 'wc180-l4', goal: { kind: 'clear-lines', lines: 4 }, timeline: [
    { tick: 90, kind: 'poison', params: { variant: 2 } },
    { tick: 180, kind: 'wildcard', params: { variant: 2 } },
  ]},
  { label: 'wc200-l3', goal: { kind: 'clear-lines', lines: 3 }, timeline: [
    { tick: 90, kind: 'poison', params: { variant: 2 } },
    { tick: 200, kind: 'wildcard', params: { variant: 2 } },
  ]},
];

for (const v of variants) {
  const level = structuredClone(base);
  level.id = v.label;
  level.goal = v.goal;
  level.timeline = v.timeline;
  for (const profileId of ['player-limited-default', 'player-limited-surface']) {
    const session = new PuzzleSession({
      level,
      driver: new RulesBot({ mode: 'omniscient', profileId }),
      maxTicks: 60 * 40,
    });
    let poisonAt = null, wcAt = null, poisonBeforeWc = false;
    for (let i = 0; i < 2500; i++) {
      const before = session.getPlayerState();
      const cells = before.poisonBoard?.flat().filter(c => c > 0).length ?? 0;
      const had = before.customNextPieceOffsets != null;
      session.advance(1);
      const after = session.getPlayerState();
      if (poisonAt == null && cells === 0 && (after.poisonBoard?.flat().filter(c => c > 0).length ?? 0) > 0) poisonAt = session.tick;
      if (!had && after.customNextPieceOffsets != null) { wcAt = session.tick; poisonBeforeWc = cells > 0; }
      if (session.isEnded) break;
    }
    const r = session.getReport();
    console.log(v.label, profileId, { poisonAt, wcAt, poisonBeforeWc, solved: r.solved, ticks: r.ticksUsed, pieces: r.piecesUsed, score: r.score });
  }
}
