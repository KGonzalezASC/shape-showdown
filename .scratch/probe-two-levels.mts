import { buildCurtainDropLevel, buildImportJstrisUltimate29ComboLevel } from '../server/puzzle/catalog/authoredLevels.js';
import { derivePuzzleSolution } from '../server/puzzle/puzzleSolution.js';
import { runPuzzleBaselineBatch } from '../server/puzzle/puzzleBaselineBatch.js';
import { DEFAULT_PUZZLE_VALIDATION_CANDIDATES } from '../server/puzzle/puzzleValidationArtifact.js';
import type { PuzzleLevel, TimelineEntry } from '../server/puzzle/puzzleTypes.js';
import { PuzzleSession } from '../server/puzzle/puzzleSession.js';
import { RulesBot } from '../server/testHarness/rulesBot.js';

function cloneLevel(level: PuzzleLevel, patch: Partial<PuzzleLevel>): PuzzleLevel {
  return {
    ...level,
    ...patch,
    initialBoard: level.initialBoard.map((r) => [...r]),
    queuePrefix: [...(patch.queuePrefix ?? level.queuePrefix)],
    timeline: patch.timeline ? [...patch.timeline] : level.timeline.map((e) => JSON.parse(JSON.stringify(e))),
    goal: patch.goal ?? level.goal,
  };
}

function probe(label: string, level: PuzzleLevel, maxTicks = 90 * 60) {
  console.log('\n===', label, '===');
  console.log('goal', JSON.stringify(level.goal));
  console.log('timeline', JSON.stringify(level.timeline));
  const omni = derivePuzzleSolution(level, maxTicks);
  console.log('omniscient', { solved: omni.solved, ticks: omni.ticksUsed, pieces: omni.piecesUsed, score: omni.score });
  const batch = runPuzzleBaselineBatch(level, [...DEFAULT_PUZZLE_VALIDATION_CANDIDATES], maxTicks);
  console.log('selected', batch.selected ? {
    id: batch.selected.profile.id,
    ticks: batch.selected.report.ticksUsed,
    pieces: batch.selected.report.piecesUsed,
    lines: batch.selected.report.linesCleared,
    score: batch.selected.report.score,
    pc: batch.selected.report.perfectClear,
    solved: batch.selected.report.solved,
  } : null);
  for (const c of batch.candidates) {
    console.log('  cand', c.profile.id, {
      q: c.qualifies, solved: c.report.solved, top: c.report.topOut,
      ticks: c.report.ticksUsed, pieces: c.report.piecesUsed,
      lines: c.report.linesCleared, pc: c.report.perfectClear, score: c.report.score,
    });
  }
}

const curtain = buildCurtainDropLevel();
const ultimate = buildImportJstrisUltimate29ComboLevel();

// Curtain: measure clear speed with NO timeline (pure board dig)
for (const lines of [8, 10, 12, 14]) {
  probe(`curtain clear-lines:${lines} no-timeline`, cloneLevel(curtain, {
    goal: { kind: 'clear-lines', lines },
    timeline: [],
  }));
}

// Curtain: sparse timeline draft (retrim + 2 curtains + late magnet) with clear-lines only
{
  const draftTimeline: TimelineEntry[] = [
    { tick: 60, kind: 'retrim' },
    { tick: 420, kind: 'curtain' },
    { tick: 1200, kind: 'curtain' },
    { tick: 1800, kind: 'magnet' },
  ];
  probe('curtain clear-lines:12 sparse draft', cloneLevel(curtain, {
    goal: { kind: 'clear-lines', lines: 12 },
    timeline: draftTimeline,
  }));
}

// Ultimate: PC with no timeline
probe('ultimate PC no-timeline', cloneLevel(ultimate, {
  goal: { kind: 'perfect-clear', maxPieces: 40 },
  timeline: [],
}));

// Ultimate: PC with light early freeze only (current-ish)
probe('ultimate PC freeze@360', cloneLevel(ultimate, {
  goal: { kind: 'perfect-clear', maxPieces: 40 },
  timeline: [{ tick: 360, kind: 'freeze', params: { durationTicks: 900 } }],
}));
