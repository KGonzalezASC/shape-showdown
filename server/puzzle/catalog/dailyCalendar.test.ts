import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DAILY_SCHEDULE,
  PUZZLE_DAILY_TIMEZONE,
  calendarDateKey,
  getDailyChallenge,
  resolveDailyPuzzleId,
} from './dailyCalendar.js';
import { loadPuzzleCatalog } from './index.js';

describe('dailyCalendar', () => {
  it('exports America/New_York timezone constant', () => {
    assert.equal(PUZZLE_DAILY_TIMEZONE, 'America/New_York');
  });

  it('calendarDateKey is stable YYYY-MM-DD in America/New_York', () => {
    // 2026-09-01 23:30 ET = 2026-09-02 03:30 UTC → still Sep 1 in ET (UTC-4)
    const lateUtcSameEtDay = new Date('2026-09-02T03:30:00.000Z');
    assert.equal(calendarDateKey(lateUtcSameEtDay), '2026-09-01');

    // 2026-09-02 00:00 ET = 2026-09-02 04:00 UTC
    const etMidnight = new Date('2026-09-02T04:00:00.000Z');
    assert.equal(calendarDateKey(etMidnight), '2026-09-02');

    const fixed = new Date('2026-09-01T16:00:00.000Z');
    assert.equal(calendarDateKey(fixed), calendarDateKey(fixed));
    assert.match(calendarDateKey(fixed), /^\d{4}-\d{2}-\d{2}$/);
  });

  it('resolveDailyPuzzleId uses DAILY_SCHEDULE override when present', () => {
    const scheduledKey = Object.keys(DAILY_SCHEDULE)[0];
    assert.ok(scheduledKey);
    const scheduledId = DAILY_SCHEDULE[scheduledKey]!;
    assert.equal(resolveDailyPuzzleId(scheduledKey, [scheduledId, 'other-id']), scheduledId);
    assert.equal(resolveDailyPuzzleId(scheduledKey, ['a', 'b', 'c']), scheduledId);
  });

  it('resolveDailyPuzzleId rotates deterministically when unscheduled', () => {
    const ids = ['alpha', 'beta', 'gamma'] as const;
    const key = '2099-01-15';
    assert.equal(DAILY_SCHEDULE[key], undefined);
    const first = resolveDailyPuzzleId(key, ids);
    assert.equal(first, resolveDailyPuzzleId(key, ids));
    assert.ok((ids as readonly string[]).includes(first));
    const other = resolveDailyPuzzleId('2099-06-01', ids);
    assert.ok((ids as readonly string[]).includes(other));
  });

  it('resolveDailyPuzzleId throws on empty catalog', () => {
    assert.throws(() => resolveDailyPuzzleId('2026-09-01', []), /empty/i);
  });

  it('getDailyChallenge returns catalog entry for scheduled dates', () => {
    const catalog = loadPuzzleCatalog();
    assert.ok(catalog.length >= 2);

    const day1 = getDailyChallenge(new Date('2026-09-01T16:00:00.000Z'));
    assert.equal(day1.dateKey, '2026-09-01');
    assert.equal(day1.puzzleId, 'authored-cheese-keyhole');
    assert.equal(day1.entry.level.id, 'authored-cheese-keyhole');

    const day2 = getDailyChallenge(new Date('2026-09-02T16:00:00.000Z'));
    assert.equal(day2.puzzleId, 'authored-well-freeze');
    assert.equal(day2.entry.level.id, 'authored-well-freeze');
  });

  it('getDailyChallenge throws when scheduled id is absent from catalog', () => {
    const original = DAILY_SCHEDULE['2099-12-31'];
    DAILY_SCHEDULE['2099-12-31'] = 'does-not-exist-in-catalog';
    try {
      assert.throws(
        () => getDailyChallenge(new Date('2099-12-31T17:00:00.000Z')),
        /missing from catalog/i,
      );
    } finally {
      if (original === undefined) {
        delete DAILY_SCHEDULE['2099-12-31'];
      } else {
        DAILY_SCHEDULE['2099-12-31'] = original;
      }
    }
  });
});
