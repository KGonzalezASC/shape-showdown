import React, { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { ActionType, InputState } from '../types';
import { useGameSocket } from '../hooks/useGameSocket';
import {
  getChromeSnapshot,
  getIsConnected,
  getMyId,
  getPlayfieldSnapshot,
  getRawGameState,
  setGameStateStore,
  setLastMatchEventStore,
  subscribeChrome,
  subscribeConnection,
  subscribePlayfield,
} from './gameStateStore';

export interface GameActions {
  sendInputState: (input: InputState) => void;
  sendAction: (action: ActionType) => void;
  sendShopOpen: () => void;
  sendShopPurchase: (itemId: string) => void;
}

const GameActionsContext = createContext<GameActions | null>(null);

export function GameStateProvider({ children }: { children: React.ReactNode }) {
  const {
    gameState,
    myId,
    lastMatchEvent,
    sendInputState,
    sendAction,
    sendShopOpen,
    sendShopPurchase,
  } = useGameSocket();

  useEffect(() => {
    setGameStateStore(gameState, myId);
  }, [gameState, myId]);

  useEffect(() => {
    setLastMatchEventStore(lastMatchEvent);
  }, [lastMatchEvent]);

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
  return useSyncExternalStore(subscribeConnection, getMyId, getMyId);
}

/** Full game state — prefer narrow hooks when possible. */
export function useGameState() {
  return useSyncExternalStore(subscribePlayfield, getRawGameState, getRawGameState);
}
