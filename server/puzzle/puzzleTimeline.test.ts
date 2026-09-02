import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertValidTimelineLoop,
  materializeTimeline,
  offsetTimelineEntries,
} from './puzzleTimeline.js';
import { assertSupportedPuzzleTimeline } from './puzzleHazards.js';
import { PuzzleSession } from './puzzleSession.js';
import { generatePuzzleLevel } from './puzzleGenerator.js';
import { RulesBot } from '../testHarness/rulesBot.js';
import { buildCurtainDropLevel } from './catalog/authoredLevels.js';
import type { TimelineEntry } from './puzzleTypes.js';

describe('puzzle timeline loops', () => {
  it('materializes a looping sequence at period boundaries', () => {
    const entries: TimelineEntry[] = [
      { tick: 60, kind: 'retrim' },
      {
        loop: {
          startTick: 180,
          periodTicks: 200,
          sequence: [{ at: 0, kind: 'curtain' }],
        },
      },
    ];
    const events = materializeTimeline(entries, 980);
    assert.deepEqual(
      events.map((e) => ({ tick: e.tick, kind: e.kind })),
      [
        { tick: 60, kind: 'retrim' },
        { tick: 180, kind: 'curtain' },
        { tick: 380, kind: 'curtain' },
        { tick: 580, kind: 'curtain' },
        { tick: 780, kind: 'curtain' },
        { tick: 980, kind: 'curtain' },
      ],
    );
  });

  it('materializes multi-beat loop sequences', () => {
    const events = materializeTimeline(
      [
        {
          loop: {
            startTick: 10,
            periodTicks: 100,
            sequence: [
              { at: 0, kind: 'poison' },
              { at: 40, kind: 'garbage', params: { lines: 1 } },
            ],
          },
        },
      ],
      150,
    );
    assert.deepEqual(
      events.map((e) => ({ tick: e.tick, kind: e.kind })),
      [
        { tick: 10, kind: 'poison' },
        { tick: 50, kind: 'garbage' },
        { tick: 110, kind: 'poison' },
        { tick: 150, kind: 'garbage' },
      ],
    );
  });

  it('rejects invalid loop descriptors at the allowlist boundary', () => {
    assert.throws(
      () =>
        assertSupportedPuzzleTimeline([
          { loop: { startTick: 0, periodTicks: 0, sequence: [{ at: 0, kind: 'curtain' }] } },
        ]),
      /periodTicks/,
    );
    assert.throws(
      () =>
        assertSupportedPuzzleTimeline([
          { loop: { startTick: 0, periodTicks: 10, sequence: [{ at: 10, kind: 'curtain' }] } },
        ]),
      /beat\.at/,
    );
    assert.throws(
      () =>
        assertSupportedPuzzleTimeline([
          { loop: { startTick: 0, periodTicks: 50, sequence: [{ at: 0, kind: 'tectonic' }] } },
        ]),
      /unsupported hazard/i,
    );
    assert.throws(
      () =>
        assertValidTimelineLoop(
          { startTick: -1, periodTicks: 10, sequence: [{ at: 0, kind: 'curtain' }] },
          'test',
        ),
      /startTick/,
    );
  });

  it('offsets loop startTick with generator-style timeline offset', () => {
    const offset = offsetTimelineEntries(
      [
        { tick: 0, kind: 'retrim' },
        { loop: { startTick: 120, periodTicks: 200, sequence: [{ at: 0, kind: 'curtain' }] } },
      ],
      60,
    );
    assert.deepEqual(offset[0], { tick: 60, kind: 'retrim' });
    assert.equal('loop' in offset[1] && offset[1].loop.startTick, 180);
  });

  it('authored curtain-drop loops curtain every 200 ticks after first fire', () => {
    const level = buildCurtainDropLevel();
    const events = materializeTimeline(level.timeline, 980);
    assert.deepEqual(
      events.filter((e) => e.kind === 'curtain').map((e) => e.tick),
      [180, 380, 580, 780, 980],
    );
    assert.deepEqual(
      events.filter((e) => e.kind === 'retrim').map((e) => e.tick),
      [60],
    );
  });

  it('PuzzleSession fires looping curtains at expected ticks', () => {
    const level = generatePuzzleLevel({
      id: 'loop-curtain-session',
      name: 'loop-curtain-session',
      seed: 3,
      garbageRows: 2,
      goal: { kind: 'survive', ticks: 700 },
      timeline: [],
    });
    level.timeline = [
      { tick: 60, kind: 'retrim' },
      {
        loop: {
          startTick: 180,
          periodTicks: 200,
          sequence: [{ at: 0, kind: 'curtain' }],
        },
      },
    ];
    const session = new PuzzleSession({
      level,
      driver: new RulesBot({ mode: 'omniscient' }),
      maxTicks: 700,
    });

    const fireTicks: number[] = [];
    let lastCurtainPending = 0;
    for (let t = 0; t < 700; t += 1) {
      session.advance(1);
      const pending = session
        .getPlayerState()
        .pendingShopEffects.filter((e) => e.itemId === 'curtain').length;
      if (pending > lastCurtainPending) {
        fireTicks.push(session.tick - 1);
      }
      lastCurtainPending = pending;
      if (session.isEnded) break;
    }
    assert.deepEqual(fireTicks, [180, 380, 580]);
  });
});
