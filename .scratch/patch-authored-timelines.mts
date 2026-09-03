import fs from 'fs';

let content = fs.readFileSync('server/puzzle/catalog/authoredLevels.ts', 'utf-8');
content = content.replace(/\r\n/g, '\n');

// Level 1: Cheese Keyhole
content = content.replace(
  `  const queuePrefix: ShapeType[] = ['O', 'J', 'L', 'I', 'T', 'S', 'Z'];
  const timeline: TimelineEvent[] = [
    { tick: 300, kind: 'freeze', params: { durationTicks: 900 } },
  ];`,
  `  const queuePrefix: ShapeType[] = ['O', 'J', 'L', 'I', 'T', 'S', 'Z'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 2, kind: 'retrim' },
    { afterPieces: 4, kind: 'magnet' },
    { afterPieces: 6, kind: 'freeze', params: { durationTicks: 360 } },
  ];`
);

// Level 2: Frozen Well
content = content.replace(
  `  const queuePrefix: ShapeType[] = ['T', 'S', 'Z', 'L', 'J', 'I', 'O'];
  const timeline: TimelineEvent[] = [
    { tick: 360, kind: 'freeze', params: { durationTicks: 900 } },
  ];`,
  `  const queuePrefix: ShapeType[] = ['T', 'S', 'Z', 'L', 'J', 'I', 'O'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 2, kind: 'retrim' },
    { afterPieces: 4, kind: 'curtain' },
    { afterPieces: 5, kind: 'freeze', params: { durationTicks: 360 } },
  ];`
);

// Level 3: Skew Stairs
content = content.replace(
  `  const queuePrefix: ShapeType[] = ['J', 'L', 'O', 'I', 'T', 'S', 'Z'];
  const timeline: TimelineEvent[] = [
    { tick: 60, kind: 'retrim' },
    { tick: 180, kind: 'magnet' },
  ];`,
  `  const queuePrefix: ShapeType[] = ['J', 'L', 'O', 'I', 'T', 'S', 'Z'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 2, kind: 'retrim' },
    { afterPieces: 5, kind: 'magnet' },
    { afterPieces: 8, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
  ];`
);

// Level 4: Pulse Garbage
content = content.replace(
  `  const queuePrefix: ShapeType[] = ['T', 'S', 'Z', 'O', 'J', 'L', 'I'];
  const timeline: TimelineEvent[] = [
    // Retrim first so swap-line pressure is live before magnet speed.
    { tick: 60, kind: 'retrim' },
    { tick: 150, kind: 'magnet' },
    { tick: 240, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
  ];`,
  `  const queuePrefix: ShapeType[] = ['T', 'S', 'Z', 'O', 'J', 'L', 'I'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 3, kind: 'retrim' },
    { afterPieces: 7, kind: 'magnet' },
    { afterPieces: 11, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 16, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
  ];`
);

// Level 5: Cheese Ladder
content = content.replace(
  `  const queuePrefix: ShapeType[] = ['J', 'L', 'O', 'S', 'Z', 'I', 'T'];
  const timeline: TimelineEvent[] = [
    { tick: 200, kind: 'snag' },
  ];`,
  `  const queuePrefix: ShapeType[] = ['J', 'L', 'O', 'S', 'Z', 'I', 'T'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 3, kind: 'sticky' },
    { afterPieces: 7, kind: 'snag' },
    { afterPieces: 11, kind: 'magnet' },
  ];`
);

// Level 6: Dig Shaft
content = content.replace(
  `  const queuePrefix: ShapeType[] = ['T', 'S', 'Z', 'O', 'J', 'L', 'I'];
  const timeline: TimelineEvent[] = [
    { tick: 120, kind: 'garbage', params: { lines: 1, delayTicks: 18 } },
    { tick: 240, kind: 'freeze', params: { durationTicks: 900 } },
  ];`,
  `  const queuePrefix: ShapeType[] = ['T', 'S', 'Z', 'O', 'J', 'L', 'I'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 4, kind: 'retrim' },
    { afterPieces: 10, kind: 'curtain' },
    { afterPieces: 18, kind: 'garbage', params: { lines: 1, delayTicks: 18 } },
    { afterPieces: 26, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 34, kind: 'magnet' },
  ];`
);

// Level 7: T-Slot Setup
content = content.replace(
  `  const queuePrefix: ShapeType[] = ['T', 'S', 'Z', 'J', 'L', 'O', 'T'];
  const timeline: TimelineEvent[] = [
    { tick: 180, kind: 'sticky' },
  ];`,
  `  const queuePrefix: ShapeType[] = ['T', 'S', 'Z', 'J', 'L', 'O', 'T'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 4, kind: 'sticky' },
    { afterPieces: 9, kind: 'snag' },
    { afterPieces: 15, kind: 'magnet' },
    { afterPieces: 20, kind: 'freeze', params: { durationTicks: 360 } },
  ];`
);

// Level 8: Four Wide
content = content.replace(
  `  const queuePrefix: ShapeType[] = ['I', 'O', 'J', 'L', 'T', 'S', 'Z'];
  const timeline: TimelineEvent[] = [
    { tick: 60, kind: 'retrim' },
    { tick: 150, kind: 'magnet' },
  ];`,
  `  const queuePrefix: ShapeType[] = ['I', 'O', 'J', 'L', 'T', 'S', 'Z'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 4, kind: 'magnet' },
    { afterPieces: 10, kind: 'snag' },
    { afterPieces: 16, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
  ];`
);

// Level 9: Hold Discipline
content = content.replace(
  `  const queuePrefix: ShapeType[] = ['I', 'S', 'Z', 'O', 'J', 'L', 'T'];
  const timeline: TimelineEvent[] = [
    { tick: 360, kind: 'freeze', params: { durationTicks: 900 } },
  ];`,
  `  const queuePrefix: ShapeType[] = ['I', 'S', 'Z', 'O', 'J', 'L', 'T'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 4, kind: 'retrim' },
    { afterPieces: 8, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 14, kind: 'snag' },
    { afterPieces: 20, kind: 'freeze', params: { durationTicks: 360 } },
  ];`
);

// Level 10: Poison Beat (keep tick 90 and 170 for test lock, add mid/late beats)
content = content.replace(
  `  const timeline: TimelineEvent[] = [
    // ~1.5s: poison active piece (variant 2).
    { tick: 90, kind: 'poison', params: { variant: 2 } },
    // Earliest wildcard attempt after lock (~114). Session defers shape lock until
    // poisonSpread finishes (same gate as multiplayer canPurchase). Goal is 10
    // lines so baselines run past full spread + wildcard.
    { tick: 170, kind: 'wildcard', params: { variant: 2 } },
  ];`,
  `  const timeline: TimelineEntry[] = [
    // ~1.5s: poison active piece (variant 2).
    { tick: 90, kind: 'poison', params: { variant: 2 } },
    // Earliest wildcard attempt after lock (~114). Session defers shape lock until
    // poisonSpread finishes (same gate as multiplayer canPurchase). Goal is 10
    // lines so baselines run past full spread + wildcard.
    { tick: 170, kind: 'wildcard', params: { variant: 2 } },
    { afterPieces: 15, kind: 'poison', params: { variant: 2 } },
    { afterPieces: 22, kind: 'purge', params: { variant: 2 } },
    { afterPieces: 28, kind: 'magnet' },
  ];`
);

// Level 12: Late I Well
content = content.replace(
  `  const queuePrefix: ShapeType[] = ['S', 'Z', 'O', 'J', 'L', 'T', 'I'];
  const timeline: TimelineEvent[] = [
    { tick: 360, kind: 'freeze', params: { durationTicks: 900 } },
  ];`,
  `  const queuePrefix: ShapeType[] = ['S', 'Z', 'O', 'J', 'L', 'T', 'I'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 5, kind: 'retrim' },
    { afterPieces: 11, kind: 'magnet' },
    { afterPieces: 17, kind: 'snag' },
    { afterPieces: 23, kind: 'freeze', params: { durationTicks: 360 } },
  ];`
);

// Level 13: Jstris Checkboard
content = content.replace(
  `  const queuePrefix: ShapeType[] = ['I', 'T', 'L', 'J', 'O', 'S', 'Z'];
  const timeline: TimelineEvent[] = [
    // Thematic mid-solve freeze (no fake jstris powerups).
    { tick: 300, kind: 'freeze', params: { durationTicks: 900 } },
  ];`,
  `  const queuePrefix: ShapeType[] = ['I', 'T', 'L', 'J', 'O', 'S', 'Z'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 3, kind: 'sticky' },
    { afterPieces: 7, kind: 'snag' },
    { afterPieces: 11, kind: 'freeze', params: { durationTicks: 360 } },
  ];`
);

// Level 15: C4W 3-res
content = content.replace(
  `  const queuePrefix: ShapeType[] = ['I', 'T', 'L', 'J', 'S', 'Z', 'O', 'I', 'T', 'L', 'J', 'S', 'Z', 'O'];
  const timeline: TimelineEvent[] = [
    { tick: 300, kind: 'freeze', params: { durationTicks: 900 } },
  ];`,
  `  const queuePrefix: ShapeType[] = ['I', 'T', 'L', 'J', 'S', 'Z', 'O', 'I', 'T', 'L', 'J', 'S', 'Z', 'O'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 2, kind: 'snag' },
    { afterPieces: 5, kind: 'sticky' },
    { afterPieces: 7, kind: 'freeze', params: { durationTicks: 360 } },
  ];`
);

// Level 16: Perfect Clear How
content = content.replace(
  `  const queuePrefix: ShapeType[] = ['S', 'J', 'I', 'L', 'S', 'Z', 'Z'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 3, kind: 'curtain' },
    { afterPieces: 6, kind: 'snag' },
    { afterPieces: 9, kind: 'magnet' },
  ];`,
  `  const queuePrefix: ShapeType[] = ['S', 'J', 'I', 'L', 'S', 'Z', 'Z'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 2, kind: 'retrim' },
    { afterPieces: 5, kind: 'magnet' },
    { afterPieces: 8, kind: 'snag' },
  ];`
);

// Level 17: Clear the Rainbow
content = content.replace(
  `  const queuePrefix: ShapeType[] = ['L', 'O', 'J', 'J', 'Z', 'J', 'O', 'O', 'I'];
  const timeline: TimelineEntry[] = [
    { tick: 90, kind: 'retrim' },
    { tick: 180, kind: 'magnet' },
    { tick: 300, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
  ];`,
  `  const queuePrefix: ShapeType[] = ['L', 'O', 'J', 'J', 'Z', 'J', 'O', 'O', 'I'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 1, kind: 'retrim' },
    { afterPieces: 3, kind: 'magnet' },
    { afterPieces: 4, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
  ];`
);

fs.writeFileSync('server/puzzle/catalog/authoredLevels.ts', content, 'utf-8');
console.log('Successfully patched all levels in authoredLevels.ts');
