import { buildAuthoredLevels } from '../server/puzzle/catalog/authoredLevels.js';
import { RulesBot } from '../server/testHarness/rulesBot.js';
import { PuzzleSession } from '../server/puzzle/puzzleSession.js';

const levels = buildAuthoredLevels();

// List of levels with <= 8 events
const targetIds = [
  'authored-skew-stairs',
  'authored-well-freeze',
  'authored-tslot-setup',
  'import-jstris-checkboard',
  'import-jstris-lspins-easy',
  'import-jstris-dt-cannon-practice',
  'import-jstris-t-spin-triples',
  'import-fumen-c4w-3res',
  'import-jstris-the-gutter',
  'import-jstris-s-spin-triple',
  'authored-four-wide',
  'import-jstris-clog',
  'authored-hold-discipline',
  'authored-pulse-garbage',
  'import-jstris-tripz',
  'import-jstris-srs-training',
  'authored-late-i-well',
  'import-jstris-srs-tower',
  'import-jstris-godspin',
  'authored-curtain-drop',
];

console.log(`Targeting ${targetIds.length} puzzles for item timeline expansion.`);
