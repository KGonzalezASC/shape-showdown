import { PuzzleSession } from '../server/puzzle/puzzleSession.ts';
import { RulesBot } from '../server/testHarness/rulesBot.ts';
import { generatePuzzleLevel } from '../server/puzzle/puzzleGenerator.ts';
import { buildPoisonBeatLevel } from '../server/puzzle/catalog/authoredLevels.ts';
import { BOARD_COLS, BOARD_ROWS } from '../src/constants.ts';

function run(level, label) {
  const session = new PuzzleSession({
    level,
    driver: new RulesBot({ mode: 'omniscient', profileId: 'player-limited-default' }),
    maxTicks: 60 * 60,
  });
  let poisonBoardAt = null;
  let wildcardAt = null;
  let poisonedActive = null;
  for (let i = 0; i < 2000; i++) {
    const before = structuredClone({
      custom: session.getPlayerState().customNextPieceOffsets ?? null,
      poisonCells: session.getPlayerState().poisonBoard?.flat().filter(c => c>0).length ?? 0,
    });
    session.advance(1);
    const p = session.getPlayerState();
    if (poisonedActive === null && p.activePiece?.poisoned) poisonedActive = session.tick;
    if (poisonBoardAt === null && (p.poisonBoard?.flat().filter(c => c>0).length ?? 0) > 0) poisonBoardAt = session.tick;
    if (wildcardAt === null && before.custom == null && p.customNextPieceOffsets != null) wildcardAt = session.tick;
    if (session.isEnded) break;
  }
  const r = session.getReport();
  console.log(label, JSON.stringify({
    poisonedActive, poisonBoardAt, wildcardAt,
    solved: r.solved, ticks: r.ticksUsed, lines: r.linesCleared, pieces: r.piecesUsed,
    finalPoison: r.gameState.players.puzzle.poisonBoard?.flat().filter(c=>c>0).length,
    hadWildcard: !!r.gameState.players.puzzle.customNextPieceOffsets || !!r.gameState.players.puzzle.customNextPieceSourceCells,
  }));
}

const base = buildPoisonBeatLevel();
run(base, 'baseline-authored');

// try earlier wildcard
const early = structuredClone(base);
early.id = 'early';
early.timeline = [
  { tick: 90, kind: 'poison', params: { variant: 2 } },
  { tick: 130, kind: 'wildcard', params: { variant: 2 } },
];
run(early, 'wildcard@130');

// harder goal + earlier wildcard
const hard = structuredClone(base);
hard.id = 'hard';
hard.goal = { kind: 'clear-lines', lines: 4 };
hard.timeline = [
  { tick: 90, kind: 'poison', params: { variant: 2 } },
  { tick: 200, kind: 'wildcard', params: { variant: 2 } },
];
run(hard, 'lines4-wc@200');

const hard2 = structuredClone(base);
hard2.id = 'hard2';
hard2.goal = { kind: 'clear-lines', lines: 3 };
hard2.timeline = [
  { tick: 90, kind: 'poison', params: { variant: 2 } },
  { tick: 150, kind: 'wildcard', params: { variant: 2 } },
];
run(hard2, 'lines3-wc@150');
