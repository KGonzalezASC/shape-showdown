import React, { createContext, useContext, useMemo, useSyncExternalStore } from 'react';
import { ActionType, InputState } from '../types';
import { useGameSocket } from '../hooks/useGameSocket';
import {
  getChromeSnapshot,
  getIsConnected,
  getMyId as getStoredMyId,
  getPlayfieldSnapshot,
  getRawGameState,
  setGameStateStore,
  setLastMatchEventStore,
  subscribeChrome,
  subscribeConnection,
  subscribePlayfield,
} from './gameStateStore';

function publishGameState(state: ReturnType<typeof getRawGameState>): void {
  setGameStateStore(state, getStoredMyId());
}

function publishMyId(id: string | null): void {
  setGameStateStore(getRawGameState(), id);
}

function publishMatchEvent(event: Parameters<typeof setLastMatchEventStore>[0]): void {
  setLastMatchEventStore(event);
}

export interface GameActions {
  sendInputState: (input: InputState) => void;
  sendAction: (action: ActionType) => void;
  sendShopOpen: () => void;
  sendShopPurchase: (itemId: string) => void;
}

const GameActionsContext = createContext<GameActions | null>(null);

export function GameStateProvider({ children }: { children: React.ReactNode }) {
  const {
    sendInputState,
    sendAction,
    sendShopOpen,
    sendShopPurchase,
  } = useGameSocket({
    onGameState: publishGameState,
    onMyId: publishMyId,
    onMatchEvent: publishMatchEvent,
  });

  const actions = useMemo(
    () => ({ sendInputState, sendAction, sendShopOpen, sendShopPurchase }),
    [sendInputState, sendAction, sendShopOpen, sendShopPurchase],
  );

  return <GameActionsContext.Provider value={actions}>{children}</GameActionsContext.Provider>;
}

export function useGameActions(): GameActions {
  const actions = useContext(GameActionsContext);
  if (!actions) throw new Error('useGameActions must be used within GameStateProvider');
  return actions;
}

export function useMatchChromeSnapshot() {
  return useSyncExternalStore(subscribeChrome, getChromeSnapshot, getChromeSnapshot);
}

export function usePlayfieldSnapshot() {
  return useSyncExternalStore(subscribePlayfield, getPlayfieldSnapshot, getPlayfieldSnapshot);
}

export function useIsConnected() {
  return useSyncExternalStore(subscribeConnection, getIsConnected, getIsConnected);
}

export function useMyId() {
  return useSyncExternalStore(subscribeConnection, getStoredMyId, getStoredMyId);
}

/** Full game state — prefer narrow hooks when possible. */
export function useGameState() {
  return useSyncExternalStore(subscribePlayfield, getRawGameState, getRawGameState);
}
