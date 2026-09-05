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
  getMatchTick,
  getMyId as getStoredMyId,
  getPlayfieldSnapshot,
  getRawGameState,
  getShopPricingTick,
  setClientMatchModelStore,
  setLastMatchEventStore,
  setMyIdStore,
  subscribeChrome,
  subscribeConnection,
  subscribeMatchTick,
  subscribePlayfield,
} from './gameStateStore';
import type { ClientMatchModel } from '../protocol/wireTypes';
import type { SearchScope } from '../matchmaking/searchScope';

function publishClientMatchModel(model: ClientMatchModel | null): void {
  setClientMatchModelStore(model, getStoredMyId());
}

function publishMyId(id: string | null): void {
  setMyIdStore(id);
}

function publishMatchEvent(event: Parameters<typeof setLastMatchEventStore>[0]): void {
  setLastMatchEventStore(event);
}

export interface GameActions {
  sendInputState: (input: InputState) => void;
  sendAction: (action: ActionType) => void;
  sendShopOpen: () => void;
  sendShopPurchase: (itemId: string) => void;
  cancelQueueSearch: () => Promise<boolean>;
  abandonMatch: () => Promise<boolean>;
  changeQueueScope: (scope: SearchScope) => Promise<SearchScope | null>;
  findNewOpponent: () => Promise<void>;
  resetClientSession: () => void;
  retryConnection: () => void;
}

const GameActionsContext = createContext<GameActions | null>(null);

export function GameActionsProvider({ actions, children }: { actions: GameActions; children: React.ReactNode }) {
  return <GameActionsContext.Provider value={actions}>{children}</GameActionsContext.Provider>;
}
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
  repeatPairing: false,
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
    cancelQueueSearch,
    abandonMatch,
    changeQueueScope,
    findNewOpponent,
    resetClientSession,
    retryConnection,
  } = useGameSocket({
    onClientMatchModel: publishClientMatchModel,
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
      cancelQueueSearch,
      abandonMatch,
      changeQueueScope,
      findNewOpponent,
      resetClientSession,
      retryConnection,
    }),
    [
      sendInputState,
      sendAction,
      sendShopOpen,
      sendShopPurchase,
      cancelQueueSearch,
      abandonMatch,
      changeQueueScope,
      findNewOpponent,
      resetClientSession,
      retryConnection,
    ],
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

/** Full 60Hz match tick — avoid in layout/shop shells; prefer useShopPricingTick / coarse clocks. */
export function useMatchTick() {
  return useSyncExternalStore(subscribeMatchTick, getMatchTick, getMatchTick);
}

/** Quantized shop pricing tick (1Hz while a price window is active). */
export function useShopPricingTick() {
  return useSyncExternalStore(subscribeMatchTick, getShopPricingTick, getShopPricingTick);
}

const subscribeNever = (): (() => void) => () => {};

/** Coarse tick for hold-freeze / effect countdowns. Pass null to disable subscription. */
export function useCoarseMatchTick(quantum: number | null) {
  const q = quantum && quantum > 0 ? quantum : null;
  return useSyncExternalStore(
    q ? subscribeMatchTick : subscribeNever,
    () => (q ? Math.floor(getMatchTick() / q) * q : 0),
    () => 0,
  );
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
