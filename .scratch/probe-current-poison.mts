import { buildPoisonBeatLevel } from '../server/puzzle/catalog/authoredLevels.ts';
import { PuzzleSession } from '../server/puzzle/puzzleSession.ts';
import { RulesBot } from '../server/testHarness/rulesBot.ts';
import { runPuzzleBaselineBatch } from '../server/puzzle/puzzleBaselineBatch.ts';
import { DEFAULT_PUZZLE_BENCHMARK } from '../server/puzzle/puzzleTypes.ts';

const level = buildPoisonBeatLevel();
console.log('timeline', level.timeline, 'goal', level.goal);

const batch = runPuzzleBaselineBatch({
  level,
  profiles: undefined, // default
});
console.log(JSON.stringify(batch, null, 2).slice(0, 2000));
