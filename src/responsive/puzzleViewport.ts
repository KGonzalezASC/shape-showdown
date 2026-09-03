import { useSyncExternalStore } from 'react';

const SHORT_WINDOW_QUERY = '(max-height: 680px)';
const LANDSCAPE_WINDOW_QUERY = '(orientation: landscape) and (max-height: 600px)';

export interface PuzzleViewportConstraints {
  short: boolean;
  landscape: boolean;
}

const SERVER_SNAPSHOT: PuzzleViewportConstraints = { short: false, landscape: false };
let clientSnapshot = SERVER_SNAPSHOT;

function getSnapshot(): PuzzleViewportConstraints {
  const next: PuzzleViewportConstraints = {
    short: window.matchMedia(SHORT_WINDOW_QUERY).matches,
    landscape: window.matchMedia(LANDSCAPE_WINDOW_QUERY).matches,
  };
  if (next.short === clientSnapshot.short && next.landscape === clientSnapshot.landscape) {
    return clientSnapshot;
  }
  clientSnapshot = next;
  return clientSnapshot;
}

function subscribe(onStoreChange: () => void): () => void {
  const shortWindow = window.matchMedia(SHORT_WINDOW_QUERY);
  const landscapeWindow = window.matchMedia(LANDSCAPE_WINDOW_QUERY);
  shortWindow.addEventListener('change', onStoreChange);
  landscapeWindow.addEventListener('change', onStoreChange);
  return () => {
    shortWindow.removeEventListener('change', onStoreChange);
    landscapeWindow.removeEventListener('change', onStoreChange);
  };
}

export function usePuzzleViewportConstraints(): PuzzleViewportConstraints {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
}
