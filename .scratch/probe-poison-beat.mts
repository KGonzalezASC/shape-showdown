import { buildPoisonBeatLevel } from '../server/puzzle/catalog/authoredLevels.ts';
import { PuzzleSession } from '../server/puzzle/puzzleSession.ts';
import { RulesBot } from '../server/testHarness/rulesBot.ts';
import { applyScriptedShopAttack, opponentHasPoison as _ } from '../server/shop.ts';

const level = buildPoisonBeatLevel();
const session = new PuzzleSession({
  level,
  driver: new RulesBot({ mode: 'omniscient' }),
  maxTicks: 60 * 60,
});

let poisonedActiveAt: number | null = null;
let poisonBoardAt: number | null = null;
let wildcardAppliedAt: number | null = null;
let customOffsetsAtWildcard: unknown = null;

for (let i = 0; i < 800; i++) {
  const before = session.getPlayerState();
  const beforeCustom = before.customNextPieceOffsets;
  session.advance(1);
  const p = session.getPlayerState();
  const tick = session.tick;
  if (poisonedActiveAt === null && p.activePiece?.poisoned) poisonedActiveAt = tick;
  if (poisonBoardAt === null && p.poisonBoard?.some((row) => row.some((c) => c > 0))) poisonBoardAt = tick;
  if (beforeCustom == null && p.customNextPieceOffsets != null) {
    wildcardAppliedAt = tick;
    customOffsetsAtWildcard = p.customNextPieceOffsets;
  }
  if (session.isEnded) break;
}

const report = session.getReport();
console.log(JSON.stringify({
  poisonedActiveAt,
  poisonBoardAt,
  wildcardAppliedAt,
  customOffsetsAtWildcard,
  timeline: level.timeline,
  solved: report.solved,
  ticksUsed: report.ticksUsed,
  topOut: report.topOut,
  linesCleared: report.linesCleared,
  finalPoisonCells: report.gameState.players.puzzle.poisonBoard?.flat().filter((c) => c > 0).length,
  finalCustom: report.gameState.players.puzzle.customNextPieceOffsets ?? null,
}, null, 2));
