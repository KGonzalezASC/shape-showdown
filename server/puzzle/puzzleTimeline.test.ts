import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertValidTimelineLoop,
  hazardOccupiedTicks,
  materializeTimeline,
  offsetTimelineEntries,
} from './puzzleTimeline.js';
import { assertSupportedPuzzleTimeline } from './puzzleHazards.js';
import { PuzzleSession } from './puzzleSession.js';
import { generatePuzzleLevel } from './puzzleGenerator.js';
import { RulesBot } from '../testHarness/rulesBot.js';
import { buildCurtainDropLevel } from './catalog/authoredLevels.js';
import type { TimelineEntry } from './puzzleTypes.js';
import { CURTAIN_DURATION_TICKS, CURTAIN_TELEGRAPH_TICKS } from '../../src/constants.js';

const CURTAIN_OCCUPIED = CURTAIN_TELEGRAPH_TICKS + CURTAIN_DURATION_TICKS; // 300
const CURTAIN_LOOP_IDLE = 200;
const CURTAIN_LOOP_STRIDE = CURTAIN_OCCUPIED + CURTAIN_LOOP_IDLE; // 500

describe('puzzle timeline loops', () => {
  it('materializes a lasting curtain loop with idle gap after effect ends', () => {
    assert.equal(hazardOccupiedTicks('curtain'), CURTAIN_OCCUPIED);
    const entries: TimelineEntry[] = [
      { tick: 60, kind: 'retrim' },
      {
        loop: {
          startTick: 180,
          periodTicks: CURTAIN_LOOP_IDLE,
          sequence: [{ at: 0, kind: 'curtain' }],
        },
      },
    ];
    const events = materializeTimeline(entries, 180 + CURTAIN_LOOP_STRIDE * 2);
    assert.deepEqual(
      events.map((e) => ({ tick: e.tick, kind: e.kind })),
      [
        { tick: 60, kind: 'retrim' },
        { tick: 180, kind: 'curtain' },
        { tick: 180 + CURTAIN_LOOP_STRIDE, kind: 'curtain' },
        { tick: 180 + CURTAIN_LOOP_STRIDE * 2, kind: 'curtain' },
      ],
    );
  });

  it('materializes multi-beat instant loop sequences with absolute period', () => {
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

  it('authored curtain-drop keeps sparse one-shot curtains (no dense loop)', () => {
    const level = buildCurtainDropLevel();
    assert.equal(level.goal.kind, 'survive-clear');
    if (level.goal.kind === 'survive-clear') {
      assert.equal(level.goal.ticks, 2250);
      assert.equal(level.goal.lines, 12);
    }
    const events = materializeTimeline(level.timeline, level.goal.kind === 'survive-clear' ? level.goal.ticks : 2250);
    assert.deepEqual(
      events.map((e) => ({ tick: e.tick, kind: e.kind })),
      [
        { tick: 60, kind: 'retrim' },
        { tick: 480, kind: 'curtain' },
        { tick: 1200, kind: 'curtain' },
        { tick: 1800, kind: 'magnet' },
      ],
    );
  });

  it('PuzzleSession does not fire next curtain while prior curtain is active', () => {
    const level = generatePuzzleLevel({
      id: 'loop-curtain-session',
      name: 'loop-curtain-session',
      seed: 3,
      garbageRows: 2,
      goal: { kind: 'survive', ticks: 1300 },
      timeline: [],
    });
    level.timeline = [
      { tick: 60, kind: 'retrim' },
      {
        loop: {
          startTick: 180,
          periodTicks: CURTAIN_LOOP_IDLE,
          sequence: [{ at: 0, kind: 'curtain' }],
        },
      },
    ];
    const session = new PuzzleSession({
      level,
      driver: new RulesBot({ mode: 'omniscient' }),
      maxTicks: 1300,
    });

    const fireTicks: number[] = [];
    let lastCurtainPending = 0;
    for (let t = 0; t < 1300; t += 1) {
      session.advance(1);
      const player = session.getPlayerState();
      const pending = player.pendingShopEffects.filter((e) => e.itemId === 'curtain').length;
      if (pending > lastCurtainPending) {
        const fireTick = session.tick - 1;
        fireTicks.push(fireTick);
        // Fresh warn is pushed on this fire; prior blackout must already be gone.
        if (fireTicks.length > 1) {
          assert.equal(
            (player.activeEffects ?? []).filter((e) => e.kind === 'curtain').length,
            0,
            `curtain still active at next fire tick ${fireTick}`,
          );
          assert.equal(
            pending,
            1,
            `curtains stacked at fire tick ${fireTick}`,
          );
        }
      }
      lastCurtainPending = pending;
      if (session.isEnded) break;
    }

    assert.deepEqual(fireTicks, [180, 180 + CURTAIN_LOOP_STRIDE, 180 + CURTAIN_LOOP_STRIDE * 2]);
    for (let i = 1; i < fireTicks.length; i += 1) {
      const prev = fireTicks[i - 1]!;
      const next = fireTicks[i]!;
      assert.equal(next, prev + CURTAIN_OCCUPIED + CURTAIN_LOOP_IDLE);
      assert.ok(next >= prev + CURTAIN_OCCUPIED + CURTAIN_LOOP_IDLE);
    }
  });
});
