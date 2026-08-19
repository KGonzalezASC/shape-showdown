import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  ActionType,
  GameState,
  InputState,
  MatchConnectionDiagnostics,
  MatchAssignment,
  MatchEvent,
  ServerHealthSnapshot,
} from '../types';
import { localDevelopmentGameServerUrl } from '../network/localGameServer';
import { pollForMatchRecoveryAssignment } from './matchRecovery';

type GameRuntimeConfig = {
  /** Full origin, e.g. https://api.example.com:10106 — highest priority when non-empty */
  gameServerUrl?: string;
  /** Same host as the page but different port (when gameServerUrl is empty) */
  gameServerPort?: number;
  /** Override hostname for port-based URL; empty = window.location.hostname */
  gameServerHost?: string;
};

type ClientSession = {
  playerId: string;
  token: string;
};

type GuestSessionResponse = {
  player: { id: string };
  session: { token: string };
};

type MatchBootstrapProgress = Extract<MatchConnectionDiagnostics['phase'], 'acquiring-session' | 'queued'>;

const CLIENT_SESSION_STORAGE_KEY = 'shape-showdown.session.v1';

function stripTrailingSlash(u: string) {
  return u.replace(/\/$/, '');
}

function originFromHostPort(host: string, port: number) {
  const proto = window.location.protocol === 'https:' ? 'https:' : 'http:';
  return stripTrailingSlash(`${proto}//${host}:${port}`);
}

function parseEnvPort(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return null;
  const n = Number(raw.trim());
  return Number.isFinite(n) && n > 0 && n < 65536 ? Math.trunc(n) : null;
}

/**
 * Resolves Socket.IO origin:
 * 1) game-config.json → gameServerUrl (non-empty)
 * 2) game-config.json → gameServerPort (+ optional gameServerHost) — same-site, different port
 * 3) VITE_GAME_SERVER_URL (build-time)
 * 4) VITE_GAME_SERVER_PORT (+ optional VITE_GAME_SERVER_HOST)
 * 5) window.location.origin
 */
async function resolveGameServerUrl(): Promise<string> {
  const localDevelopmentUrl = localDevelopmentGameServerUrl(
    window.location.origin,
    window.location.hostname,
    import.meta.env.DEV,
  );
  if (localDevelopmentUrl) {
    console.log('[Socket] Using local development origin:', localDevelopmentUrl);
    return localDevelopmentUrl;
  }

  const configPath = `${import.meta.env.BASE_URL}game-config.json`;
  try {
    const res = await fetch(configPath, { cache: 'no-store' });
    if (res.ok) {
      const json = (await res.json()) as GameRuntimeConfig;
      if (typeof json.gameServerUrl === 'string' && json.gameServerUrl.trim() !== '') {
        const url = stripTrailingSlash(json.gameServerUrl.trim());
        console.log('[Socket] Using gameServerUrl from game-config.json:', url);
        return url;
      }
      const p =
        typeof json.gameServerPort === 'number' && Number.isFinite(json.gameServerPort)
          ? Math.trunc(json.gameServerPort)
          : null;
      if (p !== null && p > 0 && p < 65536) {
        const h =
          typeof json.gameServerHost === 'string' && json.gameServerHost.trim() !== ''
            ? json.gameServerHost.trim()
            : window.location.hostname;
        const url = originFromHostPort(h, p);
        console.log('[Socket] Using port/host from game-config.json:', url);
        return url;
      }
    }
  } catch (err) {
    console.warn('[Socket] Failed to fetch or parse game-config.json:', err);
    /* fall through */
  }

  const envUrl = import.meta.env.VITE_GAME_SERVER_URL;
  if (typeof envUrl === 'string' && envUrl.trim() !== '') {
    const url = stripTrailingSlash(envUrl.trim());
    console.log('[Socket] Using VITE_GAME_SERVER_URL from env:', url);
    return url;
  }

  const envPort = parseEnvPort(import.meta.env.VITE_GAME_SERVER_PORT);
  if (envPort !== null) {
    const envHost =
      typeof import.meta.env.VITE_GAME_SERVER_HOST === 'string' &&
      import.meta.env.VITE_GAME_SERVER_HOST.trim() !== ''
        ? import.meta.env.VITE_GAME_SERVER_HOST.trim()
        : window.location.hostname;
    const url = originFromHostPort(envHost, envPort);
    console.log('[Socket] Using VITE_GAME_SERVER_PORT from env:', url);
    return url;
  }

  const defaultUrl = window.location.origin;
  console.log('[Socket] Using window.location.origin as fallback:', defaultUrl);
  return defaultUrl;
}

class ControlPlaneUnavailableError extends Error {}

async function resolveInitialMatchAssignment(
  gameServerUrl: string,
  signal: AbortSignal,
  onProgress: (phase: MatchBootstrapProgress) => void,
): Promise<MatchAssignment | null> {
  onProgress('acquiring-session');
  const session = await getOrCreateClientSession(gameServerUrl, signal);
  if (session === null) return null;

  const existingAssignment = await requestMatchAssignment(gameServerUrl, session, signal);
  if (existingAssignment !== null) return existingAssignment;

  const queueResponse = await fetch(`${stripTrailingSlash(gameServerUrl)}/api/queue`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${session.token}`,
      'content-type': 'application/json',
    },
    body: '{}',
    signal,
  });
  if (queueResponse.status === 404) {
    throw new ControlPlaneUnavailableError('Control-plane queue endpoint is unavailable');
  }
  if (!queueResponse.ok) {
    throw new Error(`Queue request failed with status ${queueResponse.status}`);
  }

  onProgress('queued');
  let lastHeartbeatAt = Date.now();
  while (true) {
    const assignment = await requestMatchAssignment(gameServerUrl, session, signal);
    if (assignment !== null) return assignment;

    if (Date.now() - lastHeartbeatAt >= 4_000) {
      const heartbeat = await fetch(`${stripTrailingSlash(gameServerUrl)}/api/queue/heartbeat`, {
        method: 'POST',
        headers: { authorization: `Bearer ${session.token}` },
        signal,
      });
      if (!heartbeat.ok) {
        throw new Error(`Queue heartbeat failed with status ${heartbeat.status}`);
      }
      lastHeartbeatAt = Date.now();
    }
    await waitFor(500, signal);
  }
}

async function getOrCreateClientSession(
  gameServerUrl: string,
  signal: AbortSignal,
): Promise<ClientSession | null> {
  const stored = readClientSession();
  if (stored !== null) return stored;

  const response = await fetch(`${stripTrailingSlash(gameServerUrl)}/api/players/guest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      displayName: `Guest ${Math.random().toString(36).slice(2, 8)}`,
    }),
    signal,
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Guest session request failed with status ${response.status}`);
  }

  const body: unknown = await response.json();
  if (!isGuestSessionResponse(body)) {
    throw new Error('Guest session response was malformed');
  }
  const session = {
    playerId: body.player.id,
    token: body.session.token,
  };
  writeClientSession(session);
  return session;
}

async function requestMatchAssignment(
  gameServerUrl: string,
  session: ClientSession,
  signal: AbortSignal,
): Promise<MatchAssignment | null> {
  const response = await fetch(`${stripTrailingSlash(gameServerUrl)}/api/match-assignment`, {
    headers: { authorization: `Bearer ${session.token}` },
    cache: 'no-store',
    signal,
  });
  if (response.status === 204) return null;
  if (response.status === 404) {
    throw new ControlPlaneUnavailableError('Control-plane assignment endpoint is unavailable');
  }
  if (!response.ok) {
    throw new Error(`Match assignment request failed with status ${response.status}`);
  }
  const body: unknown = await response.json();
  if (!isMatchAssignment(body)) {
    throw new Error('Match assignment response was malformed');
  }
  return body;
}

function readClientSession(): ClientSession | null {
  try {
    const raw = window.localStorage.getItem(CLIENT_SESSION_STORAGE_KEY);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    return isClientSession(value) ? value : null;
  } catch {
    return null;
  }
}

function writeClientSession(session: ClientSession): void {
  try {
    window.localStorage.setItem(CLIENT_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // The session remains usable for the current page even if storage is blocked.
  }
}

function waitFor(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const timeout = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      window.clearTimeout(timeout);
      reject(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

interface GameSocketCallbacks {
  onGameState?: (state: GameState | null) => void;
  onMyId?: (id: string | null) => void;
  onMatchEvent?: (event: MatchEvent | null) => void;
  onServerHealth?: (snapshot: ServerHealthSnapshot) => void;
  onMatchDiagnostics?: (diagnostics: MatchConnectionDiagnostics) => void;
}

export const useGameSocket = ({
  onGameState,
  onMyId,
  onMatchEvent,
  onServerHealth,
  onMatchDiagnostics,
}: GameSocketCallbacks = {}) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const callbacksRef = useRef<GameSocketCallbacks>({});

  useEffect(() => {
    callbacksRef.current = {
      onGameState,
      onMyId,
      onMatchEvent,
      onServerHealth,
      onMatchDiagnostics,
    };
  }, [onGameState, onMatchEvent, onMyId, onServerHealth, onMatchDiagnostics]);

  useEffect(() => {
    let cancelled = false;
    let activeSocket: Socket | null = null;
    let ticketRebound = false;
    let recoveryInFlight = false;
    let lastGameStatus: GameState['status'] | null = null;
    let bootstrapAbortController: AbortController | null = null;
    let healthAbortController: AbortController | null = null;
    let healthInterval: number | null = null;
    let matchDiagnostics: MatchConnectionDiagnostics = {
      phase: 'idle',
      playerId: null,
      matchId: null,
      seat: null,
      protocolVersion: null,
      ticketState: 'none',
      ticketLength: null,
      error: null,
    };
    const reportMatchDiagnostics = (
      patch: Partial<MatchConnectionDiagnostics>,
    ): void => {
      matchDiagnostics = { ...matchDiagnostics, ...patch };
      callbacksRef.current.onMatchDiagnostics?.(matchDiagnostics);
    };

    callbacksRef.current.onGameState?.(null);
    callbacksRef.current.onMyId?.(null);
    callbacksRef.current.onMatchEvent?.(null);
    callbacksRef.current.onServerHealth?.({
      databaseMode: 'unknown',
      databaseHealth: 'unknown',
      migrationsReady: false,
    });
    callbacksRef.current.onMatchDiagnostics?.(matchDiagnostics);

    (async () => {
      const url = await resolveGameServerUrl();
      if (cancelled) return;
      healthAbortController = new AbortController();
      const checkServerHealth = async () => {
        try {
          const response = await fetch(`${stripTrailingSlash(url)}/health/details`, {
            cache: 'no-store',
            signal: healthAbortController?.signal,
          });
          const body: unknown = await response.json();
          if (isServerHealthSnapshot(body)) {
            callbacksRef.current.onServerHealth?.(body);
          } else {
            callbacksRef.current.onServerHealth?.({
              databaseMode: 'unknown',
              databaseHealth: response.ok ? 'unknown' : 'unavailable',
              migrationsReady: false,
            });
          }
        } catch {
          if (healthAbortController?.signal.aborted !== true) {
            callbacksRef.current.onServerHealth?.({
              databaseMode: 'unknown',
              databaseHealth: 'unavailable',
              migrationsReady: false,
            });
          }
        }
      };
      void checkServerHealth();
      healthInterval = window.setInterval(checkServerHealth, 5000);
      bootstrapAbortController = new AbortController();
      let initialAssignment: MatchAssignment | null = null;
      try {
        initialAssignment = await resolveInitialMatchAssignment(
          url,
          bootstrapAbortController.signal,
          (phase) => reportMatchDiagnostics({ phase }),
        );
      } catch (error: unknown) {
        if (error instanceof ControlPlaneUnavailableError) {
          initialAssignment = null;
        } else if (!bootstrapAbortController.signal.aborted) {
          reportMatchDiagnostics({
            phase: 'error',
            error: error instanceof Error ? error.message : 'Match bootstrap failed',
          });
          console.error('[Socket] Failed to acquire a match assignment:', error);
          return;
        }
      }
      if (cancelled) return;
      if (initialAssignment !== null) {
        reportMatchDiagnostics({
          phase: 'assigned',
          playerId: initialAssignment.playerId,
          matchId: initialAssignment.matchId,
          seat: initialAssignment.seat,
          protocolVersion: initialAssignment.protocolVersion,
          ticketState: 'received',
          ticketLength: initialAssignment.ticket.length,
          error: null,
        });
      }

      const attachSocket = (
        nextSocket: Socket,
        isTicketSocket = false,
        assignment: MatchAssignment | null = null,
      ) => {
        const previousSocket = activeSocket;
        activeSocket = nextSocket;
        setSocket(nextSocket);
        if (assignment !== null) {
          reportMatchDiagnostics({
            phase: 'connecting',
            playerId: assignment.playerId,
            matchId: assignment.matchId,
            seat: assignment.seat,
            protocolVersion: assignment.protocolVersion,
            ticketState: 'presented',
            ticketLength: assignment.ticket.length,
            error: null,
          });
        } else {
          reportMatchDiagnostics({
            phase: 'connecting',
            ticketState: 'none',
            ticketLength: null,
            error: null,
          });
        }

        nextSocket.on('connect', () => {
          // Let the server bind the replacement ticket first. Closing the old
          // socket before that happens makes its disconnect handler look like
          // a real player departure and can reset the rematch lifecycle.
          if (previousSocket !== null && previousSocket !== nextSocket) {
            previousSocket.close();
          }
          if (isTicketSocket) {
            ticketRebound = false;
            if (assignment !== null) {
              reportMatchDiagnostics({
                phase: 'connected',
                ticketState: 'consumed',
                error: null,
              });
            }
          } else {
            reportMatchDiagnostics({
              phase: 'connected',
              error: null,
            });
          }
          console.log(`[Socket] Connected successfully with ID: ${nextSocket.id}`);
        });

        nextSocket.on('connect_error', (error) => {
          reportMatchDiagnostics({
            phase: 'error',
            error: error.message,
          });
          console.error('[Socket] Connection error:', error);
        });

        nextSocket.on('disconnect', () => {
          if (cancelled || activeSocket !== nextSocket || ticketRebound || lastGameStatus === 'ended') {
            return;
          }
          reportMatchDiagnostics({
            phase: 'reconnecting',
            error: null,
          });
          void recoverAfterDisconnect();
        });

        nextSocket.on('playerIdentity', (playerId: unknown) => {
          if (typeof playerId === 'string' && playerId.length > 0) {
            callbacksRef.current.onMyId?.(playerId);
            reportMatchDiagnostics({ playerId });
          }
        });

        nextSocket.on('matchAssignment', (assignment: unknown) => {
          if (ticketRebound || !isMatchAssignment(assignment)) return;
          ticketRebound = true;
          reportMatchDiagnostics({
            phase: 'assigned',
            playerId: assignment.playerId,
            matchId: assignment.matchId,
            seat: assignment.seat,
            protocolVersion: assignment.protocolVersion,
            ticketState: 'received',
            ticketLength: assignment.ticket.length,
            error: null,
          });
          attachSocket(
            io(url, {
              auth: assignment,
              transports: ['websocket', 'polling'],
            }),
            true,
            assignment,
          );
        });

        nextSocket.on('gameState', (state: GameState) => {
          // socket.io already hands us a freshly-deserialized object per message,
          // so structuredClone here is pure wasted CPU/GC — deep-cloning two
          // 10x20 boards on every network update would be wasteful on phones. Use directly.
          lastGameStatus = state.status;
          callbacksRef.current.onGameState?.(state);
        });
        nextSocket.on('matchEvent', (evt: MatchEvent) => {
          callbacksRef.current.onMatchEvent?.(evt);
        });
      };

      const recoverAfterDisconnect = async (): Promise<void> => {
        if (recoveryInFlight || cancelled) return;
        recoveryInFlight = true;
        const session = readClientSession();
        if (session === null) {
          reportMatchDiagnostics({
            phase: 'error',
            error: 'Client session is unavailable for reconnect',
          });
          recoveryInFlight = false;
          return;
        }

        try {
          const signal = bootstrapAbortController?.signal ?? new AbortController().signal;
          const assignment = await pollForMatchRecoveryAssignment({
            requestAssignment: () => requestMatchAssignment(url, session, signal),
            wait: (milliseconds) => waitFor(milliseconds, signal),
          });
          if (assignment !== null) {
            ticketRebound = true;
            reportMatchDiagnostics({
              phase: 'assigned',
              playerId: assignment.playerId,
              matchId: assignment.matchId,
              seat: assignment.seat,
              protocolVersion: assignment.protocolVersion,
              ticketState: 'received',
              ticketLength: assignment.ticket.length,
              error: null,
            });
            attachSocket(
              io(url, {
                auth: assignment,
                transports: ['websocket', 'polling'],
              }),
              true,
              assignment,
            );
            return;
          }
          if (!cancelled) {
            reportMatchDiagnostics({
              phase: 'error',
              error: 'Reconnect assignment timed out',
            });
          }
        } catch (error: unknown) {
          if (!cancelled && !(error instanceof DOMException && error.name === 'AbortError')) {
            reportMatchDiagnostics({
              phase: 'error',
              error: error instanceof Error ? error.message : 'Reconnect failed',
            });
          }
        } finally {
          recoveryInFlight = false;
        }
      };

      console.log(`[Socket] Initializing connection to resolved URL: ${url}`);
      attachSocket(io(url, {
        ...(initialAssignment === null ? {} : { auth: initialAssignment }),
        transports: ['websocket', 'polling'],
      }), initialAssignment !== null, initialAssignment);
    })();

    return () => {
      cancelled = true;
      activeSocket?.close();
      if (healthInterval !== null) window.clearInterval(healthInterval);
      bootstrapAbortController?.abort();
      healthAbortController?.abort();
    };
  }, []);

  const sendInputState = useCallback((input: InputState) => {
    socket?.emit('inputState', input);
  }, [socket]);

  const sendAction = useCallback((action: ActionType) => {
    socket?.emit('action', action);
  }, [socket]);

  const sendShopOpen = useCallback(() => {
    socket?.emit('shopOpen');
  }, [socket]);

  const sendShopPurchase = useCallback((itemId: string) => {
    socket?.emit('shopPurchase', itemId);
  }, [socket]);

  return {
    socket,
    sendInputState,
    sendAction,
    sendShopOpen,
    sendShopPurchase,
  };
};

function isServerHealthSnapshot(value: unknown): value is ServerHealthSnapshot {
  if (!isRecord(value)) return false;
  return (
    (value.databaseMode === 'unknown' ||
      value.databaseMode === 'postgres' ||
      value.databaseMode === 'in-memory') &&
    (value.databaseHealth === 'unknown' ||
      value.databaseHealth === 'healthy' ||
      value.databaseHealth === 'unavailable' ||
      value.databaseHealth === 'not-configured') &&
    typeof value.migrationsReady === 'boolean'
  );
}

function isMatchAssignment(value: unknown): value is MatchAssignment {
  if (!isRecord(value)) return false;
  return (
    typeof value.matchId === 'string' &&
    typeof value.playerId === 'string' &&
    (value.seat === 'A' || value.seat === 'B') &&
    typeof value.ticket === 'string' &&
    typeof value.matchSeed === 'number' &&
    typeof value.protocolVersion === 'number' &&
    Number.isInteger(value.protocolVersion)
  );
}

function isGuestSessionResponse(value: unknown): value is GuestSessionResponse {
  if (!isRecord(value) || !isRecord(value.player) || !isRecord(value.session)) return false;
  return (
    typeof value.player.id === 'string' &&
    typeof value.session.token === 'string' &&
    value.session.token.length > 0
  );
}

function isClientSession(value: unknown): value is ClientSession {
  return (
    isRecord(value) &&
    typeof value.playerId === 'string' &&
    typeof value.token === 'string' &&
    value.token.length > 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
