import { GameState, MatchEvent, MatchStatus, PlayerState, ShopPhase } from '../types';

export interface MatchChromeSnapshot {
  status: MatchStatus;
  countdown: number;
  remainingTime: number;
  myId: string | null;
  myScore: number;
  oppScore: number;
  myPendingGarbage: number;
  oppPendingGarbage: number;
  availableShopScore: number;
  shopOfferIds: string[];
  shopPhase: ShopPhase;
  shopCycleIndex: number;
  shopLastPurchasedItemId: string | null;
  playerCount: number;
  lastMatchEvent: MatchEvent | null;
  winnerId: string | null;
  technicalVictory?: boolean;
  restartTimer?: number;
}

export interface PlayfieldSnapshot {
  status: MatchStatus;
  myId: string | null;
  myPlayer: PlayerState | null;
  opponentPlayer: PlayerState | null;
}

type Listener = () => void;

let gameState: GameState | null = null;
let myId: string | null = null;
let lastMatchEvent: MatchEvent | null = null;

let chromeSnapshot: MatchChromeSnapshot = emptyChromeSnapshot();
let playfieldSnapshot: PlayfieldSnapshot = emptyPlayfieldSnapshot();

const chromeListeners = new Set<Listener>();
const playfieldListeners = new Set<Listener>();
const connectionListeners = new Set<Listener>();

function emptyChromeSnapshot(): MatchChromeSnapshot {
  return {
    status: 'waiting',
    countdown: 0,
    remainingTime: 0,
    myId: null,
    myScore: 0,
    oppScore: 0,
    myPendingGarbage: 0,
    oppPendingGarbage: 0,
    availableShopScore: 0,
    shopOfferIds: [],
    shopPhase: 'waiting',
    shopCycleIndex: -1,
    shopLastPurchasedItemId: null,
    playerCount: 0,
    lastMatchEvent: null,
    winnerId: null,
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

function pendingGarbageTotal(player: PlayerState | null | undefined): number {
  if (!player) return 0;
  return player.pendingGarbage.reduce((sum, packet) => sum + packet.lines, 0);
}

function buildChromeSnapshot(): MatchChromeSnapshot {
  if (!gameState) return emptyChromeSnapshot();

  const me = myId ? gameState.players[myId] : null;
  const opponentId = myId ? Object.keys(gameState.players).find((id) => id !== myId) : null;
  const opponent = opponentId ? gameState.players[opponentId] : null;
  const shop = me?.shop;

  return {
    status: gameState.status,
    countdown: gameState.countdown,
    remainingTime: gameState.remainingTime,
    myId,
    myScore: me?.score ?? 0,
    oppScore: opponent?.score ?? 0,
    myPendingGarbage: pendingGarbageTotal(me),
    oppPendingGarbage: pendingGarbageTotal(opponent),
    availableShopScore: me?.score ?? 0,
    shopOfferIds: shop?.offerIds ?? [],
    shopPhase: shop?.phase ?? 'waiting',
    shopCycleIndex: shop?.cycleIndex ?? -1,
    shopLastPurchasedItemId: shop?.lastPurchasedItemId ?? null,
    playerCount: Object.keys(gameState.players).length,
    lastMatchEvent,
    winnerId: gameState.winnerId,
    technicalVictory: gameState.technicalVictory,
    restartTimer: gameState.restartTimer,
  };
}

function buildPlayfieldSnapshot(): PlayfieldSnapshot {
  if (!gameState) return emptyPlayfieldSnapshot();

  const opponentId = myId ? Object.keys(gameState.players).find((id) => id !== myId) : null;

  return {
    status: gameState.status,
    myId,
    myPlayer: myId ? gameState.players[myId] ?? null : null,
    opponentPlayer: opponentId ? gameState.players[opponentId] ?? null : null,
  };
}

function chromeSnapshotsEqual(a: MatchChromeSnapshot, b: MatchChromeSnapshot): boolean {
  if (a.status !== b.status) return false;
  if (a.countdown !== b.countdown) return false;
  if (a.remainingTime !== b.remainingTime) return false;
  if (a.myId !== b.myId) return false;
  if (a.myScore !== b.myScore) return false;
  if (a.oppScore !== b.oppScore) return false;
  if (a.myPendingGarbage !== b.myPendingGarbage) return false;
  if (a.oppPendingGarbage !== b.oppPendingGarbage) return false;
  if (a.availableShopScore !== b.availableShopScore) return false;
  if (a.shopPhase !== b.shopPhase) return false;
  if (a.shopCycleIndex !== b.shopCycleIndex) return false;
  if (a.shopLastPurchasedItemId !== b.shopLastPurchasedItemId) return false;
  if (a.playerCount !== b.playerCount) return false;
  if (a.winnerId !== b.winnerId) return false;
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

function publishSnapshots() {
  const nextChrome = buildChromeSnapshot();
  if (!chromeSnapshotsEqual(chromeSnapshot, nextChrome)) {
    chromeSnapshot = nextChrome;
    chromeListeners.forEach((listener) => listener());
  }

  playfieldSnapshot = buildPlayfieldSnapshot();
  playfieldListeners.forEach((listener) => listener());
}

export function setGameStateStore(state: GameState | null, id: string | null) {
  const wasConnected = gameState !== null;
  gameState = state;
  myId = id;
  publishSnapshots();
  const isConnected = gameState !== null;
  if (wasConnected !== isConnected) {
    connectionListeners.forEach((listener) => listener());
  }
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
  return gameState !== null;
}

export function getRawGameState(): GameState | null {
  return gameState;
}

export function getMyId(): string | null {
  return myId;
}
