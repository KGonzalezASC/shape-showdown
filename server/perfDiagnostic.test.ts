import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  exposePerfDebugInterface,
  createPerformanceSnapshot,
  areCanvasOverlaysDisabled,
} from '../src/performance/perfDiagnostic';

describe('perfDiagnostic testing harness', () => {
  let perf: ReturnType<typeof exposePerfDebugInterface>;

  beforeEach(() => {
    perf = exposePerfDebugInterface();
    perf.reset();
  });

  test('initializes with default flags disabled (normal rendering active)', () => {
    const flags = perf.getFlags();
    assert.strictEqual(flags.disableAnimations, false);
    assert.strictEqual(flags.disableTransitions, false);
    assert.strictEqual(flags.disableBlurs, false);
    assert.strictEqual(flags.disableGlows, false);
    assert.strictEqual(flags.disableCanvasOverlays, false);
    assert.strictEqual(flags.simulateReducedMotion, false);
    assert.strictEqual(areCanvasOverlaysDisabled(), false);
  });

  test('allows toggling individual performance feature flags', () => {
    perf.toggleAnimations(true);
    assert.strictEqual(perf.getFlags().disableAnimations, true);

    perf.toggleBlurs(true);
    assert.strictEqual(perf.getFlags().disableBlurs, true);

    perf.toggleCanvasOverlays(true);
    assert.strictEqual(perf.getFlags().disableCanvasOverlays, true);
    assert.strictEqual(areCanvasOverlaysDisabled(), true);

    perf.reset();
    assert.strictEqual(perf.getFlags().disableAnimations, false);
    assert.strictEqual(perf.getFlags().disableCanvasOverlays, false);
    assert.strictEqual(areCanvasOverlaysDisabled(), false);
  });

  test('applies all disabled override at once', () => {
    perf.applyAllDisabled();
    const flags = perf.getFlags();
    assert.strictEqual(flags.disableAnimations, true);
    assert.strictEqual(flags.disableTransitions, true);
    assert.strictEqual(flags.disableBlurs, true);
    assert.strictEqual(flags.disableGlows, true);
    assert.strictEqual(flags.disableCanvasOverlays, true);
    assert.strictEqual(flags.simulateReducedMotion, true);
    assert.strictEqual(areCanvasOverlaysDisabled(), true);
  });

  test('generates a valid performance snapshot with metrics & recommendations', () => {
    const snapshot = createPerformanceSnapshot();
    assert.ok(snapshot.timestamp);
    assert.ok(snapshot.flags);
    assert.ok(snapshot.fps);
    assert.ok(Array.isArray(snapshot.recommendations));
    assert.ok(snapshot.recommendations.length > 0);
  });
});
