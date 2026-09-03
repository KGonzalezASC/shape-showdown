import fs from 'node:fs';

const filePath = 'server/puzzle/catalog/authoredLevels.ts';
let content = fs.readFileSync(filePath, 'utf8');

const descriptions: Record<string, string> = {
  'authored-well-freeze': 'Navigate an icy well with a frozen hold chamber and persistent magnetic pulls.',
  'authored-skew-stairs': 'Climb the staggered stair stack while dodging snags and swap line re-trims.',
  'authored-pulse-garbage': 'Survive successive single-line garbage pulses and hold freezes in a tense downstack scramble.',
  'authored-tslot-setup': 'Build and execute precise T-spin clears to reach the line-clear target.',
  'authored-four-wide': 'Maintain a sustained 4-wide center combo under sticky lock pressure and rising tension.',
  'authored-hold-discipline': 'Endure heavy hold freezes while maintaining downstack momentum and stack balance.',
  'authored-poison-beat': 'Survive spreading poison minos, then cleanse the board with well-timed wildcards.',
  'authored-curtain-drop': 'Survive 2250 ticks of dense hazard loops while managing line clears under intermittent curtain blindness.',
  'authored-late-i-well': 'Keep the stack clean and survive without hold until the late I-piece well arrives.',
  'import-jstris-checkboard': 'Clear alternating checkerboard garbage lines while balancing sticky and magnet interference.',
  'import-jstris-ultimate-29-combo': 'Unleash a massive 29-combo chain down the central corridor under speed pressure.',
  'import-fumen-c4w-3res': 'Execute high-level Hard Drop 4-wide combo downstacking against incoming garbage.',
  'import-jstris-lspins-easy': 'Execute clean L-spin twists into snug overhangs to clear lines under pressure.',
  'import-jstris-clog': 'Unclog a tricky garbage bottleneck under swap line shifts and lateral snags.',
  'import-jstris-s-spin-triple': 'Thread S-pieces into complex overhang pockets for triple line clears.',
  'import-jstris-srs-tower': 'Use Super Rotation System wall kicks to navigate pieces through the high tower.',
  'import-jstris-srs-training': 'Master SRS kicks and spins through tight, technical geometric gaps.',
  'import-jstris-dt-cannon-practice': 'Construct and fire a classic DT Cannon setup for massive line clearing.',
  'import-jstris-godspin': 'Perform the legendary Godspin T-piece twist through impossible-looking overhangs.',
  'import-jstris-many-stsd': 'Chain multiple Super T-Spin Double setups in rapid succession.',
  'import-jstris-tripz': 'Execute triple T-spin setups back-to-back under escalating hazard tempo.',
  'import-jstris-the-gutter': 'Dig through deep gutter garbage wells with precise lateral piece placements.',
  'import-jstris-aaron-s-t-spin-tower': 'Scale the towering T-spin fortress while avoiding snag traps and freeze locks.',
  'import-jstris-dhd': 'Double Hard Drop downstacking challenge: clear high-density obstacles under poison threat.',
  'import-jstris-t-spin-triples': 'Execute pristine T-Spin Triples into pre-slotted overhang geometry.',
};

for (const [id, desc] of Object.entries(descriptions)) {
  const pattern = new RegExp(`(id:\\s*'${id}',\\s*\\n\\s*name:\\s*[^,\\n]+,)`);
  if (pattern.test(content) && !content.includes(`id: '${id}',\n    name:`) && !content.includes(`description:`)) {
    // check if it already has description
  }
  content = content.replace(
    pattern,
    `$1\n    description: '${desc}',`
  );
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Added descriptions to all remaining levels!');
