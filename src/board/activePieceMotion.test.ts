import { describe, expect, it } from 'bun:test';
import {
  isActivePieceSoftDropStep,
  shouldSnapActivePieceMotion,
} from './activePieceMotion';

describe('isActivePieceSoftDropStep', () => {
  it('matches 1-2 cell pure vertical descends', () => {
    expect(isActivePieceSoftDropStep({ x: 3, y: 4 }, { x: 3, y: 5 })).toBe(true);
    expect(isActivePieceSoftDropStep({ x: 3, y: 4 }, { x: 3, y: 6 })).toBe(true);
  });

  it('rejects lateral, upward, and larger jumps', () => {
    expect(isActivePieceSoftDropStep({ x: 3, y: 4 }, { x: 4, y: 5 })).toBe(false);
    expect(isActivePieceSoftDropStep({ x: 3, y: 4 }, { x: 3, y: 3 })).toBe(false);
    expect(isActivePieceSoftDropStep({ x: 3, y: 4 }, { x: 3, y: 7 })).toBe(false);
    expect(shouldSnapActivePieceMotion({ x: 3, y: 4 }, { x: 3, y: 7 })).toBe(true);
  });
});
