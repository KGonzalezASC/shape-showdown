import {
  GameState,
  MatchEndReason,
  MatchEvent,
  MatchStatus,
  PlayerShopState,
  ShopPhase,
} from '../types';
import type { ClientMatchModel } from '../protocol/wireTypes';
import {
  PublicPlayerState,
  publicPlayersEqual,
  toPublicPlayerState,
} from './publicSnapshots';

export interface MatchChromeSnapshot {
  status: MatchStatus;
  countdown: number;
  tick: number;
  myId: string | null;
  myScore: number;
  oppScore: number;
  myFunds: number;
  oppFunds: number;
  availableFunds: number;
  shopOfferIds: string[];
  shopPhase: ShopPhase;
  shopCycleIndex: number;
  shopLastPurchasedItemId: string | null;
  shopPricing: PlayerShopState['pricing'];
  playerCount: number;
  lastMatchEvent: MatchEvent | null;
  winnerId: string | null;
  endReason?: MatchEndReason;
  pausePlayerId: string | null;
  pauseStartedAt: number | null;
  technicalVictory?: boolean;
  restartTimer?: number;
}

export interface PlayfieldSnapshot {
  status: MatchStatus;
  myId: string | null;
  myPlayer: PublicPlayerState | null;
  opponentPlayer: PublicPlayerState | null;
}

type Listener = () => void;

let clientMatchModel: ClientMatchModel | null = null;
let myId: string | null = null;
let lastMatchEvent: MatchEvent | null = null;
let rawGameStateSnapshot: GameState | null = null;

let chromeSnapshot: MatchChromeSnapshot = emptyChromeSnapshot();
let playfieldSnapshot: PlayfieldSnapshot = emptyPlayfieldSnapshot();

const chromeListeners = new Set<Listener>();
const playfieldListeners = new Set<Listener>();
const connectionListeners = new Set<Listener>();

function emptyChromeSnapshot(): MatchChromeSnapshot {
  return {
    status: 'waiting',
    countdown: 0,
    tick: 0,
    myId: null,
    myScore: 0,
    oppScore: 0,
    myFunds: 0,
    oppFunds: 0,
    availableFunds: 0,
    shopOfferIds: [],
    shopPhase: 'waiting',
    shopCycleIndex: -1,
    shopLastPurchasedItemId: null,
    shopPricing: {},
    playerCount: 0,
    lastMatchEvent: null,
    winnerId: null,
    pausePlayerId: null,
    pauseStartedAt: null,
  };
}

function emptyPlayfieldSnapshot(): PlayfieldSnapshot {
  return {
    status: 'waiting',
    myId: null,
    myPlayer: null,
    opponentPlayer: null,
  };
}

function buildChromeSnapshot(): MatchChromeSnapshot {
  if (!clientMatchModel) return emptyChromeSnapshot();

  const me = clientMatchModel.myPlayer;
  const opponent = clientMatchModel.opponentPlayer;
  const shop = me?.shop;

  return {
    status: clientMatchModel.chrome.status,
    countdown: clientMatchModel.chrome.countdown,
    tick: clientMatchModel.tick,
    myId,
    myScore: me?.score ?? 0,
    oppScore: opponent?.score ?? 0,
    myFunds: me?.funds ?? 0,
    oppFunds: opponent?.funds ?? 0,
    availableFunds: me?.funds ?? 0,
    shopOfferIds: shop?.offerIds ?? [],
    shopPhase: shop?.phase ?? 'waiting',
    shopCycleIndex: shop?.cycleIndex ?? -1,
    shopLastPurchasedItemId: shop?.lastPurchasedItemId ?? null,
    shopPricing: shop?.pricing ?? {},
    playerCount: (me ? 1 : 0) + (opponent ? 1 : 0),
    lastMatchEvent,
    winnerId: clientMatchModel.chrome.winnerId,
    endReason: clientMatchModel.chrome.endReason,
    pausePlayerId: clientMatchModel.chrome.pausePlayerId,
    pauseStartedAt: clientMatchModel.chrome.pauseStartedAt,
    technicalVictory: clientMatchModel.chrome.technicalVictory,
    restartTimer: clientMatchModel.chrome.restartTimer,
  };
}

function buildPlayfieldSnapshot(): PlayfieldSnapshot {
  if (!clientMatchModel) return emptyPlayfieldSnapshot();

  return {
    status: clientMatchModel.chrome.status,
    myId,
    myPlayer: clientMatchModel.myPlayer,
    opponentPlayer: clientMatchModel.opponentPlayer,
  };
}

function chromeSnapshotsEqual(a: MatchChromeSnapshot, b: MatchChromeSnapshot): boolean {
  if (a.status !== b.status) return false;
  if (a.countdown !== b.countdown) return false;
  if (a.tick !== b.tick) return false;
  if (a.myId !== b.myId) return false;
  if (a.myScore !== b.myScore) return false;
  if (a.oppScore !== b.oppScore) return false;
  if (a.myFunds !== b.myFunds) return false;
  if (a.oppFunds !== b.oppFunds) return false;
  if (a.availableFunds !== b.availableFunds) return false;
  if (a.shopPhase !== b.shopPhase) return false;
  if (a.shopCycleIndex !== b.shopCycleIndex) return false;
  if (a.shopLastPurchasedItemId !== b.shopLastPurchasedItemId) return false;
  const aPricing = a.shopPricing;
  const bPricing = b.shopPricing;
  const pricingIds = new Set([...Object.keys(aPricing), ...Object.keys(bPricing)]);
  for (const itemId of pricingIds) {
    const left = aPricing[itemId];
    const right = bPricing[itemId];
    if (!left || !right) return false;
    if (
      left.level !== right.level ||
      left.purchasesInWindow !== right.purchasesInWindow ||
      left.windowStartedAtTick !== right.windowStartedAtTick ||
      left.lastWindowClosedBy !== right.lastWindowClosedBy
    ) return false;
  }
  if (a.playerCount !== b.playerCount) return false;
  if (a.winnerId !== b.winnerId) return false;
  if (a.endReason !== b.endReason) return false;
  if (a.pausePlayerId !== b.pausePlayerId) return false;
  if (a.pauseStartedAt !== b.pauseStartedAt) return false;
  if (a.technicalVictory !== b.technicalVictory) return false;
  if (a.restartTimer !== b.restartTimer) return false;
  if (a.shopOfferIds.length !== b.shopOfferIds.length) return false;
  for (let i = 0; i < a.shopOfferIds.length; i += 1) {
    if (a.shopOfferIds[i] !== b.shopOfferIds[i]) return false;
  }
  const aEvt = a.lastMatchEvent;
  const bEvt = b.lastMatchEvent;
  if (aEvt === bEvt) return true;
  if (!aEvt || !bEvt) return false;
  return (
    aEvt.type === bEvt.type &&
    aEvt.playerId === bEvt.playerId &&
    aEvt.tick === bEvt.tick &&
    ('lines' in aEvt ? aEvt.lines : undefined) === ('lines' in bEvt ? bEvt.lines : undefined)
  );
}

function playfieldSnapshotsEqual(a: PlayfieldSnapshot, b: PlayfieldSnapshot): boolean {
  if (a.status !== b.status) return false;
  if (a.myId !== b.myId) return false;
  return (
    publicPlayersEqual(a.myPlayer, b.myPlayer) &&
    publicPlayersEqual(a.opponentPlayer, b.opponentPlayer)
  );
}

function buildRawGameStateSnapshot(): GameState | null {
  if (!clientMatchModel) return null;

  const players: GameState['players'] = {};
  if (clientMatchModel.myPlayer && clientMatchModel.myId) {
    players[clientMatchModel.myId] = clientMatchModel.myPlayer as GameState['players'][string];
  }
  if (clientMatchModel.opponentPlayer) {
    players[clientMatchModel.opponentPlayer.id] =
      clientMatchModel.opponentPlayer as GameState['players'][string];
  }
  return {
    players,
    status: clientMatchModel.chrome.status,
    countdown: clientMatchModel.chrome.countdown,
    winnerId: clientMatchModel.chrome.winnerId,
    endReason: clientMatchModel.chrome.endReason,
    technicalVictory: clientMatchModel.chrome.technicalVictory,
    restartTimer: clientMatchModel.chrome.restartTimer,
    pause: clientMatchModel.chrome.pausePlayerId
      ? {
          playerId: clientMatchModel.chrome.pausePlayerId,
          startedAt: clientMatchModel.chrome.pauseStartedAt ?? Date.now(),
        }
      : undefined,
    tick: clientMatchModel.tick,
    seed: clientMatchModel.seed,
  };
}

function publishSnapshots() {
  rawGameStateSnapshot = buildRawGameStateSnapshot();
  const nextChrome = buildChromeSnapshot();
  if (!chromeSnapshotsEqual(chromeSnapshot, nextChrome)) {
    chromeSnapshot = nextChrome;
    chromeListeners.forEach((listener) => listener());
  }

  const nextPlayfield = buildPlayfieldSnapshot();
  if (!playfieldSnapshotsEqual(playfieldSnapshot, nextPlayfield)) {
    playfieldSnapshot = nextPlayfield;
    playfieldListeners.forEach((listener) => listener());
  }
}

export function setMyIdStore(id: string | null): void {
  myId = id;
  publishSnapshots();
}

export function setClientMatchModelStore(model: ClientMatchModel | null, id: string | null) {
  const wasConnected = clientMatchModel !== null;
  clientMatchModel = model;
  myId = id;
  publishSnapshots();
  const isConnected = clientMatchModel !== null;
  if (wasConnected !== isConnected) {
    connectionListeners.forEach((listener) => listener());
  }
}

/** @deprecated Legacy JSON gameState path — use setClientMatchModelStore. */
export function setGameStateStore(state: GameState | null, id: string | null) {
  if (state === null) {
    setClientMatchModelStore(null, id);
    return;
  }
  const runtimeId = id ?? Object.keys(state.players)[0] ?? null;
  const opponentId = runtimeId
    ? Object.keys(state.players).find((playerId) => playerId !== runtimeId) ?? null
    : null;
  const me = runtimeId ? state.players[runtimeId] : null;
  const opponent = opponentId ? state.players[opponentId] : null;
  if (!me) {
    setClientMatchModelStore(null, id);
    return;
  }
  setClientMatchModelStore({
    tick: state.tick,
    seed: state.seed,
    chrome: {
      status: state.status,
      countdown: state.countdown,
      seed: state.seed,
      winnerId: state.winnerId,
      endReason: state.endReason,
      technicalVictory: state.technicalVictory,
      restartTimer: state.restartTimer,
      pausePlayerId: state.pause?.playerId ?? null,
      pauseStartedAt: state.pause?.startedAt ?? null,
    },
    myId: runtimeId,
    myPlayer: toPublicPlayerState(me),
    opponentPlayer: opponent ? toPublicPlayerState(opponent) : null,
  }, runtimeId);
  rawGameStateSnapshot = state;
}

export function setLastMatchEventStore(event: MatchEvent | null) {
  lastMatchEvent = event;
  const nextChrome = buildChromeSnapshot();
  if (!chromeSnapshotsEqual(chromeSnapshot, nextChrome)) {
    chromeSnapshot = nextChrome;
    chromeListeners.forEach((listener) => listener());
  }
}

export function subscribeChrome(listener: Listener): () => void {
  chromeListeners.add(listener);
  return () => chromeListeners.delete(listener);
}

export function subscribePlayfield(listener: Listener): () => void {
  playfieldListeners.add(listener);
  return () => playfieldListeners.delete(listener);
}

export function subscribeConnection(listener: Listener): () => void {
  connectionListeners.add(listener);
  return () => connectionListeners.delete(listener);
}

export function getChromeSnapshot(): MatchChromeSnapshot {
  return chromeSnapshot;
}

export function getPlayfieldSnapshot(): PlayfieldSnapshot {
  return playfieldSnapshot;
}

export function getIsConnected(): boolean {
  return clientMatchModel !== null;
}

/** Minimal shim for components that still read seed/tick/pause from GameState. */
export function getRawGameState(): GameState | null {
  return rawGameStateSnapshot;
}

export function getMyId(): string | null {
  return myId;
}
