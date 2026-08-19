import React, { createContext, useContext, useMemo, useState, useSyncExternalStore } from 'react';
import {
  ActionType,
  InputState,
  MatchConnectionDiagnostics,
  ServerHealthSnapshot,
} from '../types';
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
  resetClientSession: () => void;
}

const GameActionsContext = createContext<GameActions | null>(null);
const initialServerHealth: ServerHealthSnapshot = {
  databaseMode: 'unknown',
  databaseHealth: 'unknown',
  migrationsReady: false,
};
const ServerHealthContext = createContext<ServerHealthSnapshot>(initialServerHealth);
const initialMatchDiagnostics: MatchConnectionDiagnostics = {
  phase: 'idle',
  playerId: null,
  matchId: null,
  seat: null,
  protocolVersion: null,
  ticketState: 'none',
  ticketLength: null,
  error: null,
};
const MatchDiagnosticsContext = createContext<MatchConnectionDiagnostics>(initialMatchDiagnostics);

export function GameStateProvider({ children }: { children: React.ReactNode }) {
  const [serverHealth, setServerHealth] = useState<ServerHealthSnapshot>(initialServerHealth);
  const [matchDiagnostics, setMatchDiagnostics] = useState<MatchConnectionDiagnostics>(
    initialMatchDiagnostics,
  );
  const {
    sendInputState,
    sendAction,
    sendShopOpen,
    sendShopPurchase,
    resetClientSession,
  } = useGameSocket({
    onGameState: publishGameState,
    onMyId: publishMyId,
    onMatchEvent: publishMatchEvent,
    onServerHealth: setServerHealth,
    onMatchDiagnostics: setMatchDiagnostics,
  });

  const actions = useMemo(
    () => ({
      sendInputState,
      sendAction,
      sendShopOpen,
      sendShopPurchase,
      resetClientSession,
    }),
    [sendInputState, sendAction, sendShopOpen, sendShopPurchase, resetClientSession],
  );

  return (
    <GameActionsContext.Provider value={actions}>
      <ServerHealthContext.Provider value={serverHealth}>
        <MatchDiagnosticsContext.Provider value={matchDiagnostics}>
          {children}
        </MatchDiagnosticsContext.Provider>
      </ServerHealthContext.Provider>
    </GameActionsContext.Provider>
  );
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

export function useServerHealth(): ServerHealthSnapshot {
  return useContext(ServerHealthContext);
}

export function useMatchDiagnostics(): MatchConnectionDiagnostics {
  return useContext(MatchDiagnosticsContext);
}

export function useMyId() {
  return useSyncExternalStore(subscribeConnection, getStoredMyId, getStoredMyId);
}

/** Full game state — prefer narrow hooks when possible. */
export function useGameState() {
  return useSyncExternalStore(subscribePlayfield, getRawGameState, getRawGameState);
}
