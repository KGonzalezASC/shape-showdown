import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  actionForCode,
  DEFAULT_KEY_BINDINGS,
  formatKeyCode,
  parseKeyBindings,
  rebindKey,
  resetKeyBindings,
} from './keyBindings';

describe('keyBindings', () => {
  it('parseKeyBindings falls back to defaults for invalid input', () => {
    assert.deepEqual(parseKeyBindings(null), DEFAULT_KEY_BINDINGS);
    assert.deepEqual(parseKeyBindings(42), DEFAULT_KEY_BINDINGS);
    assert.deepEqual(parseKeyBindings('nope'), DEFAULT_KEY_BINDINGS);
    assert.deepEqual(parseKeyBindings([]), DEFAULT_KEY_BINDINGS);
  });

  it('parseKeyBindings keeps valid strings and defaults missing or non-string keys', () => {
    const parsed = parseKeyBindings({
      moveLeft: 'KeyA',
      moveRight: 7,
      softDrop: '',
      hardDrop: 'Space',
      unknown: 'KeyQ',
    });
    assert.equal(parsed.moveLeft, 'KeyA');
    assert.equal(parsed.moveRight, DEFAULT_KEY_BINDINGS.moveRight);
    assert.equal(parsed.softDrop, DEFAULT_KEY_BINDINGS.softDrop);
    assert.equal(parsed.hardDrop, 'Space');
    assert.equal(parsed.rotateCW, DEFAULT_KEY_BINDINGS.rotateCW);
  });

  it('rebindKey swaps when the code is already bound', () => {
    const swapped = rebindKey(DEFAULT_KEY_BINDINGS, 'hardDrop', 'KeyX');
    assert.equal(swapped.hardDrop, 'KeyX');
    assert.equal(swapped.rotateCW, 'ArrowUp');
    assert.equal(swapped.moveLeft, DEFAULT_KEY_BINDINGS.moveLeft);
  });

  it('rebindKey is idempotent when the action already owns the code', () => {
    const same = rebindKey(DEFAULT_KEY_BINDINGS, 'moveLeft', 'ArrowLeft');
    assert.equal(same, DEFAULT_KEY_BINDINGS);
  });

  it('formatKeyCode covers Arrow, Key, Space, and ShiftLeft', () => {
    assert.equal(formatKeyCode('ArrowLeft'), '←');
    assert.equal(formatKeyCode('ArrowRight'), '→');
    assert.equal(formatKeyCode('ArrowUp'), '↑');
    assert.equal(formatKeyCode('ArrowDown'), '↓');
    assert.equal(formatKeyCode('KeyX'), 'X');
    assert.equal(formatKeyCode('Space'), 'Space');
    assert.equal(formatKeyCode('ShiftLeft'), 'Shift');
    assert.equal(formatKeyCode('Digit1'), '1');
  });

  it('actionForCode returns the bound action or null', () => {
    assert.equal(actionForCode(DEFAULT_KEY_BINDINGS, 'KeyZ'), 'rotateCCW');
    assert.equal(actionForCode(DEFAULT_KEY_BINDINGS, 'KeyQ'), null);
  });

  it('actionForCode treats unbound modifier siblings as the same binding', () => {
    assert.equal(actionForCode(DEFAULT_KEY_BINDINGS, 'ShiftRight'), 'hold');
    const bothShifts = rebindKey(DEFAULT_KEY_BINDINGS, 'shop', 'ShiftRight');
    assert.equal(actionForCode(bothShifts, 'ShiftRight'), 'shop');
    assert.equal(actionForCode(bothShifts, 'ShiftLeft'), 'hold');
  });

  it('resetKeyBindings returns a fresh defaults copy', () => {
    const reset = resetKeyBindings();
    assert.deepEqual(reset, DEFAULT_KEY_BINDINGS);
    assert.notEqual(reset, DEFAULT_KEY_BINDINGS);
  });

  it('round-trips defaults through parse after JSON', () => {
    const roundTrip = parseKeyBindings(
      JSON.parse(JSON.stringify(DEFAULT_KEY_BINDINGS)) as unknown,
    );
    assert.deepEqual(roundTrip, DEFAULT_KEY_BINDINGS);
  });
});
