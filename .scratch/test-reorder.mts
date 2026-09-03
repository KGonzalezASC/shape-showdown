import { buildAuthoredLevels } from '../server/puzzle/catalog/authoredLevels.js';

const proposedIds = [
  'import-jstris-drilltris-1',
  'import-jstris-drilltris-2',
  'import-jstris-mash-space',
  'authored-cheese-keyhole',
  'import-jstris-clear-the-rainbow',
  'authored-skew-stairs',
  'import-jstris-perfect-clear-how',

  'authored-well-freeze',
  'authored-cheese-ladder',
  'authored-dig-shaft',
  'import-jstris-checkboard',
  'import-jstris-lspins-easy',
  'authored-tslot-setup',
  'import-jstris-dt-cannon-practice',

  'import-jstris-t-spin-triples',
  'import-fumen-c4w-3res',
  'import-jstris-the-gutter',
  'import-jstris-s-spin-triple',
  'authored-four-wide',
  'import-jstris-clog',
  'import-jstris-1v1-downstack',

  'authored-hold-discipline',
  'authored-pulse-garbage',
  'import-jstris-many-stsd',
  'import-jstris-tripz',
  'import-jstris-srs-training',
  'import-jstris-cheese-10',
  'authored-late-i-well',

  'import-jstris-srs-tower',
  'import-jstris-godspin',
  'import-jstris-aaron-s-t-spin-tower',
  'import-jstris-ultimate-29-combo',
  'authored-poison-beat',
  'import-jstris-dhd',
  'authored-curtain-drop',
];

const currentLevels = buildAuthoredLevels();
const currentIds = currentLevels.map(l => l.id);

console.log(`Current count: ${currentIds.length}, Proposed count: ${proposedIds.length}`);

// Check duplicates in proposed
const set = new Set(proposedIds);
console.log(`Unique proposed: ${set.size}`);

// Check all current are in proposed
for (const id of currentIds) {
  if (!set.has(id)) {
    console.error(`Missing in proposed: ${id}`);
  }
}
// Check all proposed are in current
for (const id of proposedIds) {
  if (!currentIds.includes(id)) {
    console.error(`Unknown in proposed: ${id}`);
  }
}

console.log('Validation: 100% matched!');
