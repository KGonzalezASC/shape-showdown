import { useMemo, useSyncExternalStore } from 'react';

export type OnScreenControlsPreference = 'auto' | 'shown' | 'hidden';

export interface OnScreenControlsCapabilities {
  primaryPointerCoarse: boolean;
  primaryPointerCannotHover: boolean;
  touchPointsReported: boolean;
}

export interface OnScreenControlsPolicyState {
  preference: OnScreenControlsPreference;
  touchOrPenObserved: boolean;
  visible: boolean;
}

export interface OnScreenControlsPolicy extends OnScreenControlsPolicyState {
  capabilities: OnScreenControlsCapabilities;
  setPreference: (preference: OnScreenControlsPreference) => void;
}

export const ON_SCREEN_CONTROLS_STORAGE_KEY = 'shape-showdown.onScreenControlsPreference';
const LEGACY_PUZZLE_CONTROLS_STORAGE_KEY = 'puzzleTouchControls';
const COARSE_POINTER_QUERY = '(pointer: coarse)';
const NO_HOVER_QUERY = '(hover: none)';

const serverCapabilities: OnScreenControlsCapabilities = {
  primaryPointerCoarse: false,
  primaryPointerCannotHover: false,
  touchPointsReported: false,
};

const serverSnapshot: OnScreenControlsPolicyState = {
  preference: 'auto',
  touchOrPenObserved: false,
  visible: false,
};

let initialized = false;
let capabilities = serverCapabilities;
let preference: OnScreenControlsPreference = 'auto';
let touchOrPenObserved = false;
let snapshot = serverSnapshot;
const listeners = new Set<() => void>();

function isPreference(value: string | null): value is OnScreenControlsPreference {
  return value === 'auto' || value === 'shown' || value === 'hidden';
}

function readInitialPreference(): OnScreenControlsPreference {
  if (typeof window === 'undefined') return 'auto';

  try {
    const stored = window.localStorage.getItem(ON_SCREEN_CONTROLS_STORAGE_KEY);
    if (isPreference(stored)) return stored;

    const legacy = window.localStorage.getItem(LEGACY_PUZZLE_CONTROLS_STORAGE_KEY);
    if (legacy === 'true' || legacy === 'false') {
      const migrated: OnScreenControlsPreference = legacy === 'true' ? 'shown' : 'hidden';
      window.localStorage.setItem(ON_SCREEN_CONTROLS_STORAGE_KEY, migrated);
      try {
        window.localStorage.removeItem(LEGACY_PUZZLE_CONTROLS_STORAGE_KEY);
      } catch {
        // A readable storage area may still reject deletes.
      }
      return migrated;
    }

    if (legacy !== null) {
      try {
        window.localStorage.removeItem(LEGACY_PUZZLE_CONTROLS_STORAGE_KEY);
      } catch {
        // Invalid legacy data has no effect on this session.
      }
    }
    return 'auto';
  } catch {
    return 'auto';
  }
}

function deriveVisible(): boolean {
  if (preference === 'shown') return true;
  if (preference === 'hidden') return false;
  return (
    capabilities.primaryPointerCoarse ||
    capabilities.primaryPointerCannotHover ||
    capabilities.touchPointsReported ||
    touchOrPenObserved
  );
}

function publish(): void {
  snapshot = {
    preference,
    touchOrPenObserved,
    visible: deriveVisible(),
  };
  listeners.forEach((listener) => listener());
}

function readCapabilities(): OnScreenControlsCapabilities {
  return {
    primaryPointerCoarse: window.matchMedia(COARSE_POINTER_QUERY).matches,
    primaryPointerCannotHover: window.matchMedia(NO_HOVER_QUERY).matches,
    touchPointsReported: typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0,
  };
}

function handleCapabilityChange(): void {
  capabilities = readCapabilities();
  publish();
}

function handleObservedPointer(event: PointerEvent): void {
  if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
  if (touchOrPenObserved) return;
  touchOrPenObserved = true;
  publish();
}

function handleStorageChange(event: StorageEvent): void {
  if (event.key !== ON_SCREEN_CONTROLS_STORAGE_KEY) return;
  preference = isPreference(event.newValue) ? event.newValue : 'auto';
  publish();
}

function initialize(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  preference = readInitialPreference();
  capabilities = readCapabilities();
  snapshot = {
    preference,
    touchOrPenObserved,
    visible: deriveVisible(),
  };

  const coarsePointer = window.matchMedia(COARSE_POINTER_QUERY);
  const noHover = window.matchMedia(NO_HOVER_QUERY);
  coarsePointer.addEventListener('change', handleCapabilityChange);
  noHover.addEventListener('change', handleCapabilityChange);
  window.addEventListener('pointerdown', handleObservedPointer, { passive: true });
  window.addEventListener('storage', handleStorageChange);
}

function subscribe(listener: () => void): () => void {
  initialize();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): OnScreenControlsPolicyState {
  initialize();
  return snapshot;
}

function getServerSnapshot(): OnScreenControlsPolicyState {
  return serverSnapshot;
}

export function setOnScreenControlsPreference(next: OnScreenControlsPreference): void {
  initialize();
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(ON_SCREEN_CONTROLS_STORAGE_KEY, next);
    preference = next;
  } catch {
    // A blocked storage area cannot honor a persistent choice. Stay automatic
    // for this session rather than presenting a preference that cannot stick.
    preference = 'auto';
  }
  publish();
}

export function useOnScreenControlsPolicy(): OnScreenControlsPolicy {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return useMemo(
    () => ({
      ...state,
      capabilities,
      setPreference: setOnScreenControlsPreference,
    }),
    [state],
  );
}
