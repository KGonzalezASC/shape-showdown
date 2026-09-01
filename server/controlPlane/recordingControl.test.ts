import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import {
  isRecordingActive,
  onRecordingToggleChange,
  resetRecordingControlForTests,
  setRecordingActive,
} from './recordingControl.js';

describe('recordingControl', () => {
  beforeEach(() => {
    resetRecordingControlForTests(true);
  });

  afterEach(() => {
    resetRecordingControlForTests(true);
  });

  it('tracks recording active status and toggles', () => {
    assert.equal(isRecordingActive(), true);
    setRecordingActive(false);
    assert.equal(isRecordingActive(), false);
    setRecordingActive(true);
    assert.equal(isRecordingActive(), true);
  });

  it('emits change events when recording state transitions', () => {
    const events: boolean[] = [];
    const unsubscribe = onRecordingToggleChange((active) => {
      events.push(active);
    });

    setRecordingActive(false);
    setRecordingActive(false); // No duplicate event
    setRecordingActive(true);

    assert.deepEqual(events, [false, true]);

    unsubscribe();
    setRecordingActive(false);
    assert.deepEqual(events, [false, true]);
  });
});
