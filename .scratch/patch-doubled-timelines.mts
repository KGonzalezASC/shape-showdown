import fs from 'fs';
import { DOUBLED_TIMELINES } from './test-doubled-timelines.mts';

let content = fs.readFileSync('server/puzzle/catalog/authoredLevels.ts', 'utf-8');
content = content.replace(/\r\n/g, '\n');

// Function names mapped to IDs:
const LEVEL_MAPPING: Record<string, string> = {
  'buildCheeseKeyholeLevel': 'authored-cheese-keyhole',
  'buildFrozenWellLevel': 'authored-well-freeze',
  'buildSkewStairsLevel': 'authored-skew-stairs',
  'buildPulseGarbageLevel': 'authored-pulse-garbage',
  'buildCheeseLadderLevel': 'authored-cheese-ladder',
  'buildDigShaftLevel': 'authored-dig-shaft',
  'buildTSlotSetupLevel': 'authored-tslot-setup',
  'buildFourWideLevel': 'authored-four-wide',
  'buildHoldDisciplineLevel': 'authored-hold-discipline',
  'buildPoisonBeatLevel': 'authored-poison-beat',
  'buildCurtainDropLevel': 'authored-curtain-drop',
  'buildLateIWellLevel': 'authored-late-i-well',
  'buildImportJstrisCheckboardLevel': 'import-jstris-checkboard',
  'buildImportJstrisUltimate29ComboLevel': 'import-jstris-ultimate-29-combo',
  'buildImportFumenC4w3resLevel': 'import-fumen-c4w-3res',
  'buildImportJstrisPerfectClearHowLevel': 'import-jstris-perfect-clear-how',
  'buildImportJstrisClearTheRainbowLevel': 'import-jstris-clear-the-rainbow',
  'buildImportJstrisLspinsEasyLevel': 'import-jstris-lspins-easy',
  'buildImportJstrisCheese10Level': 'import-jstris-cheese-10',
  'buildImportJstrisClogLevel': 'import-jstris-clog',
  'buildImportJstrisSSpinTripleLevel': 'import-jstris-s-spin-triple',
  'buildImportJstrisDrilltris1Level': 'import-jstris-drilltris-1',
  'buildImportJstrisDrilltris2Level': 'import-jstris-drilltris-2',
  'buildImportJstrisSrsTowerLevel': 'import-jstris-srs-tower',
  'buildImportJstrisMashSpaceLevel': 'import-jstris-mash-space',
  'buildImportJstrisSrsTrainingLevel': 'import-jstris-srs-training',
  'buildImportJstrisDtCannonPracticeLevel': 'import-jstris-dt-cannon-practice',
  'buildImportJstrisGodspinLevel': 'import-jstris-godspin',
  'buildImportJstrisManyStsdLevel': 'import-jstris-many-stsd',
  'buildImportJstrisTripzLevel': 'import-jstris-tripz',
  'buildImportJstrisTheGutterLevel': 'import-jstris-the-gutter',
  'buildImportJstris1v1DownstackLevel': 'import-jstris-1v1-downstack',
  'buildImportJstrisAaronSTSpinTowerLevel': 'import-jstris-aaron-s-t-spin-tower',
  'buildImportJstrisDhdLevel': 'import-jstris-dhd',
  'buildImportJstrisTSpinTriplesLevel': 'import-jstris-t-spin-triples',
};

for (const [funcName, levelId] of Object.entries(LEVEL_MAPPING)) {
  const events = DOUBLED_TIMELINES[levelId];
  if (!events) {
    console.error(`Missing timeline for ${levelId}`);
    continue;
  }

  // Find the function definition
  const funcIndex = content.indexOf(`export function ${funcName}(`);
  if (funcIndex === -1) {
    console.error(`Could not find function ${funcName}`);
    continue;
  }

  // Find timeline declaration in that function
  const timelineDecl = '  const timeline: Timeline';
  const timelineIndex = content.indexOf(timelineDecl, funcIndex);
  if (timelineIndex === -1) {
    console.error(`Could not find timeline declaration in ${funcName}`);
    continue;
  }

  // Find the end of timeline declaration (closing '];')
  const timelineEnd = content.indexOf('];', timelineIndex);
  if (timelineEnd === -1) {
    console.error(`Could not find end of timeline in ${funcName}`);
    continue;
  }

  // Format new timeline
  const formattedEvents = events.map(e => `    ${JSON.stringify(e)},`).join('\n');
  const newTimelineStr = `  const timeline: TimelineEntry[] = [\n${formattedEvents}\n  ];`;

  content = content.slice(0, timelineIndex) + newTimelineStr + content.slice(timelineEnd + 2);
  console.log(`Updated ${funcName} (${levelId}) with ${events.length} events`);
}

fs.writeFileSync('server/puzzle/catalog/authoredLevels.ts', content, 'utf-8');
console.log('Successfully patched all doubled timelines in authoredLevels.ts');
