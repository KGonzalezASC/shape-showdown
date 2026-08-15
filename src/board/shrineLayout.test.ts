import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildShrineLayout } from './shrineLayout';
import { shrineGrowthAnimationDelayMs } from './shrineFaceGrowth';

describe('buildShrineLayout', () => {
  test('is deterministic for a given seed', () => {
    const a = buildShrineLayout(4207);
    const b = buildShrineLayout(4207);
    assert.deepEqual(a, b);
    assert.ok(a.faceCount >= 1);
    assert.ok(a.faceCount <= 3);
    assert.equal(a.faces.length, a.faceCount);
    assert.equal(a.sparks.length, 3);
    assert.deepEqual(a.sparks.map((spark) => spark.side), ['right', 'left', 'right']);
    assert.ok(a.sparks.every((spark) => spark.offsetPx > 0));
    assert.equal(a.lineExtLeft.length, 19);
    assert.equal(a.lineExtTop.length, 11);
  });

  test('different seeds change face placement', () => {
    const a = buildShrineLayout(4207);
    const b = buildShrineLayout(9001);
    assert.notDeepEqual(a.faces, b.faces);
  });

  test('ports the canvas face arrangement for the reference decoration seed', () => {
    const layout = buildShrineLayout(4207);

    assert.equal(layout.faceCount, 2);
    assert.equal(layout.faces[0]?.side, 'top');
    assert.ok(Math.abs((layout.faces[0]?.centerPercent ?? 0) - 25.99) < 0.01);
    assert.equal(layout.faces[1]?.side, 'right');
    assert.ok(Math.abs((layout.faces[1]?.centerPercent ?? 0) - 24.24) < 0.01);
  });
});

describe('shrineGrowthAnimationDelayMs', () => {
  test('resumes the original entrance timeline after a responsive remount', () => {
    assert.equal(shrineGrowthAnimationDelayMs(0, 1_000, 1_400), -400);
    assert.equal(shrineGrowthAnimationDelayMs(140, 1_000, 1_400), -260);
  });
});
