import type { PuzzleLevel, PuzzleSolution } from './puzzleTypes.js';
import { PuzzleSession } from './puzzleSession.js';
import { RulesBot } from '../testHarness/rulesBot.js';

/**
 * Derive the reference solution for a puzzle level by letting the RulesBot play
 * it. The bot IS the oracle: no off-the-shelf solver is used, because Shape
 * Showdown's items (poison, curtain, magnet, wildcard, tectonic) are game-
 * specific mechanics no external Tetris solver understands.
 *
 * The derived commands are the "correct solution" indicator shown to the
 * player: reveal step-by-step, or replay the whole reference run.
 */
export function derivePuzzleSolution(
  level: PuzzleLevel,
  maxTicks = 90 * 60,
): PuzzleSolution {
  const bot = new RulesBot({ mode: 'omniscient' });
  const session = new PuzzleSession({ level, driver: bot, maxTicks });
  session.advance(maxTicks);
  const report = session.getReport();

  return {
    levelId: level.id,
    commands: report.commandRecords.map((record) => ({
      tick: record.tick,
      command: record.detail,
    })),
    solved: report.solved,
    ticksUsed: report.ticksUsed,
    piecesUsed: report.piecesUsed,
    score: report.score,
  };
}
