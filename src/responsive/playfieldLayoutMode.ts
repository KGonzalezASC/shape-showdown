import { useSyncExternalStore } from 'react';

export const PLAYFIELD_TABLET_MIN_WIDTH_PX = 661;
export const PLAYFIELD_DESKTOP_MIN_WIDTH_PX = 901;

export type PlayfieldLayoutMode = 'phone' | 'tablet' | 'desktop';

const DESKTOP_QUERY = `(min-width: ${PLAYFIELD_DESKTOP_MIN_WIDTH_PX}px)`;
const TABLET_QUERY = `(min-width: ${PLAYFIELD_TABLET_MIN_WIDTH_PX}px)`;

export function resolvePlayfieldLayoutMode(viewportWidth: number): PlayfieldLayoutMode {
  if (viewportWidth >= PLAYFIELD_DESKTOP_MIN_WIDTH_PX) return 'desktop';
  if (viewportWidth >= PLAYFIELD_TABLET_MIN_WIDTH_PX) return 'tablet';
  return 'phone';
}

function subscribePlayfieldLayoutMode(onStoreChange: () => void): () => void {
  const desktopQuery = window.matchMedia(DESKTOP_QUERY);
  const tabletQuery = window.matchMedia(TABLET_QUERY);
  desktopQuery.addEventListener('change', onStoreChange);
  tabletQuery.addEventListener('change', onStoreChange);
  return () => {
    desktopQuery.removeEventListener('change', onStoreChange);
    tabletQuery.removeEventListener('change', onStoreChange);
  };
}

function getPlayfieldLayoutModeSnapshot(): PlayfieldLayoutMode {
  if (window.matchMedia(DESKTOP_QUERY).matches) return 'desktop';
  if (window.matchMedia(TABLET_QUERY).matches) return 'tablet';
  return 'phone';
}

function getPlayfieldLayoutModeServerSnapshot(): PlayfieldLayoutMode {
  return 'desktop';
}

export function usePlayfieldLayoutMode(): PlayfieldLayoutMode {
  return useSyncExternalStore(
    subscribePlayfieldLayoutMode,
    getPlayfieldLayoutModeSnapshot,
    getPlayfieldLayoutModeServerSnapshot,
  );
}

export function playfieldViewportPaddingClass(mode: PlayfieldLayoutMode): string {
  return mode === 'phone' ? 'p-[5px]' : 'p-3';
}

export function playfieldScreenClass(mode: PlayfieldLayoutMode): string {
  const heightAndPadding = mode === 'phone'
    ? 'h-[min(820px,calc(100dvh-10px))] p-1.5'
    : 'h-[min(820px,calc(100dvh-24px))] p-2.5';
  const maxWidth = mode === 'desktop'
    ? 'max-w-[1180px]'
    : mode === 'tablet'
      ? 'max-w-[820px]'
      : 'max-w-[430px]';
  return `shape-showdown-screen relative z-10 flex ${heightAndPadding} min-h-[500px] w-full ${maxWidth} flex-col overflow-hidden border-0 bg-transparent shadow-none`;
}

export function playfieldGridClass(mode: PlayfieldLayoutMode): string {
  if (mode === 'desktop') {
    return 'mx-auto grid h-full w-full min-h-0 min-w-0 max-w-[1180px] grid-cols-[8.875rem_minmax(0,1fr)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] items-start gap-3 overflow-visible px-2 py-2 [grid-template-areas:"shop_board_opponent"]';
  }
  if (mode === 'tablet') {
    return 'mx-auto grid h-full w-full min-h-0 min-w-0 max-w-[820px] grid-cols-[minmax(0,1fr)_13.125rem] grid-rows-[auto_minmax(0,1fr)] items-stretch gap-3 overflow-visible pb-2 [grid-template-areas:"board_opponent"_"board_shop"]';
  }
  return 'mx-auto grid h-full w-full min-h-0 min-w-0 max-w-[430px] grid-cols-[minmax(0,1fr)_6rem] grid-rows-[auto_minmax(0,1fr)] items-stretch gap-1.5 overflow-visible pb-2 [grid-template-areas:"board_opponent"_"board_shop"]';
}
