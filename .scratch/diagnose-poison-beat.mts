import { buildPoisonBeatLevel } from '../server/puzzle/catalog/authoredLevels.js';
import { PuzzleSession } from '../server/puzzle/puzzleSession.js';
import { RulesBot } from '../server/testHarness/rulesBot.js';

const level = buildPoisonBeatLevel();
level.timeline = [
  { tick: 90, kind: 'poison', params: { variant: 2 } },
  { tick: 170, kind: 'wildcard', params: { variant: 2 } },
  { afterPieces: 6, kind: 'sticky' },
  { afterPieces: 10, kind: 'snag' },
  { afterPieces: 15, kind: 'poison', params: { variant: 2 } },
  { afterPieces: 18, kind: 'sticky' },
  { afterPieces: 22, kind: 'purge', params: { variant: 2 } },
  { afterPieces: 25, kind: 'snag' },
  { afterPieces: 28, kind: 'magnet' },
  { afterPieces: 32, kind: 'curtain' },
];

const session = new PuzzleSession({
  level,
  driver: new RulesBot({ mode: 'omniscient' }),
  maxTicks: 60 * 60,
});

while (!session.isEnded) {
  session.advance(1);
}

const rep = session.getReport();
console.log('PoisonBeat with omniscient RulesBot: solved=', rep.solved, 'topOut=', rep.topOut, 'pieces=', rep.piecesUsed, 'ticks=', rep.ticksUsed);
