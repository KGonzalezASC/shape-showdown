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
  SocketAuthErrorCode,
} from '../types';
import { localDevelopmentGameServerUrl } from '../network/localGameServer';
import { pollForMatchRecoveryAssignment } from './matchRecovery';
import {
  isDiscordActivityContext,
  requestDiscordActivitySession,
} from '../discordActivity';
import { ClientPacketDecoder } from '../protocol/ClientPacketDecoder';
import type { ClientMatchModel } from '../protocol/wireTypes';
import { GAME_PROTOCOL_VERSION } from '../protocol/version';
import { toArrayBuffer } from '../protocol/binary';

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
  expiresAt: string | null;
  provider: 'guest' | 'discord';
};

type GuestSessionResponse = {
  player: { id: string };
  session: { token: string; expiresAt?: unknown };
};

type MatchOutcomeResponse = {
  outcomeReason: string;
};

type MatchBootstrapProgress = Extract<MatchConnectionDiagnostics['phase'], 'acquiring-session' | 'queued'>;
type ReliabilityEventName =
  | 'disconnect_start'
  | 'reconnect_success'
  | 'match_end'
  | 'match_voided'
  | 'protocol_mismatch';

const CLIENT_SESSION_STORAGE_KEY = 'shape-showdown.session.v1';
const CLIENT_GUEST_BOOTSTRAP_KEY = 'shape-showdown.guest-bootstrap.v1';
const INITIAL_QUEUE_DEADLINE_MS = 60_000;
let inMemoryGuestBootstrapKey: string | null = null;

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

  if (isDiscordActivityContext()) {
    console.log('[Socket] Using Discord mapped origin:', window.location.origin);
    return window.location.origin;
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

class SessionInvalidError extends Error {
  public constructor(
    public readonly playerId: string,
    public readonly provider: ClientSession['provider'] = 'guest',
  ) {
    super('Client session is expired or no longer valid');
  }
}

const SOCKET_AUTH_ERROR_CODES: SocketAuthErrorCode[] = [
  'MATCH_TICKET_REQUIRED',
  'MATCH_TICKET_REJECTED',
  'MATCH_TICKET_CONSUMED',
  'MATCH_SEAT_REJECTED',
  'MATCH_THIRD_SOCKET',
  'PROTOCOL_VERSION_MISMATCH',
  'MATCH_RUNTIME_UNAVAILABLE',
  'MATCH_VOIDED',
];

type InitialMatchBootstrap = {
  session: ClientSession;
  assignment: MatchAssignment;
};

async function resolveInitialMatchAssignment(
  gameServerUrl: string,
  signal: AbortSignal,
  onProgress: (phase: MatchBootstrapProgress) => void,
): Promise<InitialMatchBootstrap> {
  onProgress('acquiring-session');
  const session = await getOrCreateClientSession(gameServerUrl, signal);

  const existingAssignment = await requestMatchAssignment(gameServerUrl, session, signal);
  if (existingAssignment !== null) {
    return { session, assignment: existingAssignment };
  }

  const queueResponse = await fetch(`${stripTrailingSlash(gameServerUrl)}/api/queue`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${session.token}`,
      'content-type': 'application/json',
    },
    body: '{}',
    cache: 'no-store',
    signal,
  });
  if (queueResponse.status === 404) {
    throw new ControlPlaneUnavailableError('Control-plane queue endpoint is unavailable');
  }
  if (queueResponse.status === 401) {
    throw new SessionInvalidError(session.playerId, session.provider);
  }
  if (queueResponse.status !== 200 && queueResponse.status !== 409) {
    throw new Error(`Queue request failed with status ${queueResponse.status}`);
  }

  onProgress('queued');
  let lastHeartbeatAt = Date.now();
  const queueDeadline = Date.now() + INITIAL_QUEUE_DEADLINE_MS;
  while (Date.now() < queueDeadline) {
    const assignment = await requestMatchAssignment(gameServerUrl, session, signal);
    if (assignment !== null) return { session, assignment };

    if (Date.now() - lastHeartbeatAt >= 4_000) {
      const heartbeat = await fetch(`${stripTrailingSlash(gameServerUrl)}/api/queue/heartbeat`, {
        method: 'POST',
        headers: { authorization: `Bearer ${session.token}` },
        cache: 'no-store',
        signal,
      });
      if (heartbeat.status === 401) {
        throw new SessionInvalidError(session.playerId, session.provider);
      }
      if (!heartbeat.ok) {
        throw new Error(`Queue heartbeat failed with status ${heartbeat.status}`);
      }
      lastHeartbeatAt = Date.now();
    }
    await waitFor(500, signal);
  }
  throw new Error('Search timed out before an opponent was found');
}

async function getOrCreateClientSession(
  gameServerUrl: string,
  signal: AbortSignal,
): Promise<ClientSession> {
  const stored = readClientSession();
  if (isDiscordActivityContext()) {
    const body = await requestDiscordActivitySession(gameServerUrl, signal);
    if (typeof body.player.id !== 'string' || body.player.id.length === 0) {
      throw new Error('Discord Activity session response was malformed');
    }
    const session: ClientSession = {
      playerId: body.player.id,
      token: body.session.token,
      expiresAt: typeof body.session.expiresAt === 'string' ? body.session.expiresAt : null,
      provider: 'discord',
    };
    writeClientSession(session);
    return session;
  }
  if (stored !== null && stored.provider === 'guest') {
    if (stored.expiresAt !== null && Date.parse(stored.expiresAt) <= Date.now()) {
      throw new SessionInvalidError(stored.playerId, stored.provider);
    }
    return stored;
  }

  const idempotencyKey = readOrCreateGuestBootstrapKey();
  const response = await fetch(`${stripTrailingSlash(gameServerUrl)}/api/players/guest`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      displayName: `Guest ${Math.random().toString(36).slice(2, 8)}`,
    }),
    cache: 'no-store',
    signal,
  });
  if (response.status === 404) {
    throw new ControlPlaneUnavailableError('Control-plane guest session endpoint is unavailable');
  }
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
    expiresAt: typeof body.session.expiresAt === 'string' ? body.session.expiresAt : null,
    provider: 'guest' as const,
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
  if (response.status === 401) {
    throw new SessionInvalidError(session.playerId, session.provider);
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

async function requestMatchOutcome(
  gameServerUrl: string,
  session: ClientSession,
  matchId: string,
  signal: AbortSignal,
): Promise<'server-void' | 'disconnect-forfeit' | null> {
  const response = await fetch(
    `${stripTrailingSlash(gameServerUrl)}/api/matches/${encodeURIComponent(matchId)}/outcome`,
    {
      headers: { authorization: `Bearer ${session.token}` },
      cache: 'no-store',
      signal,
    },
  );
  if (response.status === 404) return null;
  if (response.status === 401) {
    throw new SessionInvalidError(session.playerId, session.provider);
  }
  if (!response.ok) return null;
  const body: unknown = await response.json();
  if (!isMatchOutcomeResponse(body)) return null;
  if (body.outcomeReason === 'void_server_crash' || body.outcomeReason === 'void_dual_disconnect') {
    return 'server-void';
  }
  return body.outcomeReason === 'forfeit_disconnect' ? 'disconnect-forfeit' : null;
}

function readClientSession(): ClientSession | null {
  try {
    const raw = window.localStorage.getItem(CLIENT_SESSION_STORAGE_KEY);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    if (!isClientSession(value)) return null;
    return {
      playerId: value.playerId,
      token: value.token,
      expiresAt: typeof value.expiresAt === 'string' ? value.expiresAt : null,
      provider: value.provider === 'discord' ? 'discord' : 'guest',
    };
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

function readOrCreateGuestBootstrapKey(): string {
  try {
    const stored = window.localStorage.getItem(CLIENT_GUEST_BOOTSTRAP_KEY);
    if (stored !== null && stored.length > 0) return stored;
    const created = createGuestBootstrapKey();
    window.localStorage.setItem(CLIENT_GUEST_BOOTSTRAP_KEY, created);
    inMemoryGuestBootstrapKey = created;
    return created;
  } catch {
    if (inMemoryGuestBootstrapKey === null) {
      inMemoryGuestBootstrapKey = createGuestBootstrapKey();
    }
    return inMemoryGuestBootstrapKey;
  }
}

function createGuestBootstrapKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 18)}`;
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
  onClientMatchModel?: (model: ClientMatchModel | null) => void;
  onMyId?: (id: string | null) => void;
  onMatchEvent?: (event: MatchEvent | null) => void;
  onServerHealth?: (snapshot: ServerHealthSnapshot) => void;
  onMatchDiagnostics?: (diagnostics: MatchConnectionDiagnostics) => void;
}

export const useGameSocket = ({
  onClientMatchModel,
  onMyId,
  onMatchEvent,
  onServerHealth,
  onMatchDiagnostics,
}: GameSocketCallbacks = {}) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const callbacksRef = useRef<GameSocketCallbacks>({});

  useEffect(() => {
    callbacksRef.current = {
      onClientMatchModel,
      onMyId,
      onMatchEvent,
      onServerHealth,
      onMatchDiagnostics,
    };
  }, [onClientMatchModel, onMatchEvent, onMyId, onServerHealth, onMatchDiagnostics]);

  useEffect(() => {
    let cancelled = false;
    let activeSocket: Socket | null = null;
    let ticketRebound = false;
    let recoveryInFlight = false;
    let lastGameStatus: GameState['status'] | null = null;
    const packetDecoder = new ClientPacketDecoder();
    let bootstrapAbortController: AbortController | null = null;
    let healthAbortController: AbortController | null = null;
    let healthInterval: number | null = null;
    let clientSession: ClientSession | null = null;
    let useLegacySocket = false;
    let expectedMatchId: string | null = null;
    let expectedPlayerId: string | null = null;
    let expectedSeat: MatchAssignment['seat'] | null = null;
    let recoveryDeadlineAt: number | null = null;
    let recoveryAttempts = 0;
    let disconnectStartedAt: number | null = null;
    let disconnectEpisodeCount = 0;
    let lastReportedEndReason: GameState['endReason'] | undefined;
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

    callbacksRef.current.onClientMatchModel?.(null);
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
      const socketPath = isDiscordActivityContext() ? '/socketio' : '/socket.io';
      const reportReliability = (
        eventName: ReliabilityEventName,
        properties: Record<string, string | number | boolean> = {},
      ): void => {
        const session = clientSession;
        if (session === null) return;
        void fetch(`${stripTrailingSlash(url)}/api/analytics`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${session.token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            eventName,
            ...(matchDiagnostics.matchId === null ? {} : { matchId: matchDiagnostics.matchId }),
            properties,
          }),
          keepalive: true,
        }).catch(() => {
          // Analytics is best-effort and never gates rendering or recovery.
        });
      };
      const reportDisconnectStart = (): void => {
        if (disconnectStartedAt !== null) return;
        disconnectStartedAt = Date.now();
        disconnectEpisodeCount += 1;
        reportReliability('disconnect_start', {
          pause_count: disconnectEpisodeCount,
        });
      };
      const reportTerminalSocketError = (code: SocketAuthErrorCode): void => {
        void (async () => {
          if (code === 'MATCH_VOIDED') {
            reportMatchDiagnostics({
              phase: 'server-void',
              error: protocolRecoveryMessage(code),
            });
            reportReliability('match_voided', { reason: 'runtime_unavailable' });
            return;
          }
          if (
            code === 'MATCH_RUNTIME_UNAVAILABLE'
            && clientSession !== null
            && expectedMatchId !== null
          ) {
            try {
              const outcome = await requestMatchOutcome(
                url,
                clientSession,
                expectedMatchId,
                bootstrapAbortController?.signal ?? new AbortController().signal,
              );
              if (outcome === 'server-void') {
                reportMatchDiagnostics({
                  phase: 'server-void',
                  error: 'Match voided — no winner.',
                });
                reportReliability('match_voided', { reason: 'runtime_unavailable' });
                return;
              }
            } catch {
              // Fall through to the stable runtime error below.
            }
          }
          reportMatchDiagnostics({
            phase: 'error',
            error: protocolRecoveryMessage(code),
          });
        })();
      };
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
      const allowLegacySocketBootstrap =
        import.meta.env.DEV
        && localDevelopmentGameServerUrl(
          window.location.origin,
          window.location.hostname,
          true,
        ) !== null;
      let initialBootstrap: InitialMatchBootstrap | null = null;
      try {
        initialBootstrap = await resolveInitialMatchAssignment(
          url,
          bootstrapAbortController.signal,
          (phase) => reportMatchDiagnostics({ phase }),
        );
      } catch (error: unknown) {
        if (error instanceof ControlPlaneUnavailableError) {
          if (allowLegacySocketBootstrap) {
            useLegacySocket = true;
          } else if (!bootstrapAbortController.signal.aborted) {
            reportMatchDiagnostics({
              phase: 'service-unavailable',
              error: 'The game service is unavailable. Retry when it is back online.',
            });
            console.error('[Socket] Control plane is unavailable:', error);
            return;
          }
        } else if (error instanceof SessionInvalidError) {
          if (!bootstrapAbortController.signal.aborted) {
            reportMatchDiagnostics({
              phase: 'session-invalid',
              playerId: error.playerId,
              error: sessionInvalidMessage(error.provider),
            });
          }
          return;
        } else if (!bootstrapAbortController.signal.aborted) {
          reportMatchDiagnostics({
            phase: 'service-unavailable',
            error: 'The game service is unavailable. Retry when it is back online.',
          });
          console.error('[Socket] Failed to acquire a match assignment:', error);
          return;
        }
      }
      if (cancelled) return;
      if (initialBootstrap !== null) {
        clientSession = initialBootstrap.session;
        expectedMatchId = initialBootstrap.assignment.matchId;
        expectedPlayerId = initialBootstrap.assignment.playerId;
        expectedSeat = initialBootstrap.assignment.seat;
        reportMatchDiagnostics({
          phase: 'assigned',
          playerId: initialBootstrap.assignment.playerId,
          matchId: initialBootstrap.assignment.matchId,
          seat: initialBootstrap.assignment.seat,
          protocolVersion: initialBootstrap.assignment.protocolVersion,
          ticketState: 'received',
          ticketLength: initialBootstrap.assignment.ticket.length,
          error: null,
        });
      }

      const attachSocket = (
        nextSocket: Socket,
        isTicketSocket = false,
        assignment: MatchAssignment | null = null,
      ) => {
        const previousSocket = activeSocket;
        let terminalError = false;
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
            recoveryDeadlineAt = null;
            recoveryAttempts = 0;
            if (assignment !== null) {
              reportMatchDiagnostics({
                phase: 'connected',
                ticketState: 'consumed',
                error: null,
              });
            }
            if (previousSocket !== null && previousSocket !== nextSocket) {
              reportReliability('reconnect_success', {
                disconnected_seconds: disconnectStartedAt === null
                  ? 0
                  : Math.max(0, Math.floor((Date.now() - disconnectStartedAt) / 1000)),
              });
              disconnectStartedAt = null;
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
          const code = socketAuthErrorCode(error);
          if (
            !cancelled
            && activeSocket === nextSocket
            && isTicketSocket
            && (
              isRetryableTicketConnectError(error)
              || code === 'MATCH_RUNTIME_UNAVAILABLE'
            )
          ) {
            // Never hand a rejected ticket back to Socket.IO's automatic
            // retry loop. Rebind through the bounded recovery flow.
            ticketRebound = false;
            reportMatchDiagnostics({
              phase: 'reconnecting',
              error: null,
            });
            nextSocket.disconnect();
            void recoverAfterDisconnect(
              code === 'MATCH_RUNTIME_UNAVAILABLE' ? 'runtime' : 'ticket',
            );
            return;
          }
          if (isTerminalSocketAuthCode(code)) {
            terminalError = true;
            nextSocket.disconnect();
            if (code === 'PROTOCOL_VERSION_MISMATCH') {
              reportMatchDiagnostics({
                phase: 'protocol-mismatch',
                error: protocolRecoveryMessage(code),
              });
              reportReliability('protocol_mismatch', { code });
            } else {
              reportTerminalSocketError(code);
            }
            return;
          }
          nextSocket.disconnect();
          if (!cancelled) {
            reportMatchDiagnostics({
              phase: 'reconnecting',
              error: null,
            });
            reportDisconnectStart();
            void recoverAfterDisconnect();
          }
          return;
        });

        nextSocket.on('error', (error: unknown) => {
          const code = socketAuthErrorCode(error);
          if (code === null || cancelled || activeSocket !== nextSocket) return;
          if (
            code === 'MATCH_TICKET_REJECTED'
            || code === 'MATCH_TICKET_CONSUMED'
            || code === 'MATCH_RUNTIME_UNAVAILABLE'
          ) {
            nextSocket.disconnect();
            reportMatchDiagnostics({ phase: 'reconnecting', error: null });
            void recoverAfterDisconnect(
              code === 'MATCH_RUNTIME_UNAVAILABLE' ? 'runtime' : 'ticket',
            );
            return;
          }
          terminalError = true;
          nextSocket.disconnect();
          if (code === 'PROTOCOL_VERSION_MISMATCH') {
            reportMatchDiagnostics({
              phase: 'protocol-mismatch',
              error: protocolRecoveryMessage(code),
            });
            reportReliability('protocol_mismatch', { code });
          } else {
            reportTerminalSocketError(code);
          }
        });

        nextSocket.on('disconnect', () => {
          if (
            cancelled
            || terminalError
            || activeSocket !== nextSocket
            || ticketRebound
            || lastGameStatus === 'ended'
          ) {
            return;
          }
          if (useLegacySocket && clientSession === null) return;
          reportMatchDiagnostics({
            phase: 'reconnecting',
            error: null,
          });
          reportDisconnectStart();
          void recoverAfterDisconnect();
        });

        nextSocket.on('playerIdentity', (playerId: unknown) => {
          if (typeof playerId === 'string' && playerId.length > 0) {
            packetDecoder.setMyId(playerId);
            callbacksRef.current.onMyId?.(playerId);
            reportMatchDiagnostics({ playerId });
          }
        });

        const handlePacket = (payload: unknown) => {
          const model = packetDecoder.decode(toArrayBuffer(payload));
          if (model !== null) {
            lastGameStatus = model.chrome.status;
            if (model.chrome.endReason === undefined) lastReportedEndReason = undefined;
            if (
              model.chrome.endReason !== undefined
              && model.chrome.endReason !== lastReportedEndReason
            ) {
              lastReportedEndReason = model.chrome.endReason;
              reportReliability(
                model.chrome.endReason === 'server-void' ? 'match_voided' : 'match_end',
                {
                  ...(model.chrome.winnerId === null ? {} : { winner_id: model.chrome.winnerId }),
                  reason: model.chrome.endReason,
                  duration_s: Math.floor(model.tick / 60),
                },
              );
            }
            callbacksRef.current.onClientMatchModel?.(model);
          }
          if (packetDecoder.shouldRequestKeyframe()) {
            packetDecoder.consumeKeyframeRequest();
            nextSocket.emit('requestKeyframe');
          }
        };

        nextSocket.on('gamePacket', (payload: ArrayBuffer) => {
          handlePacket(payload);
        });

        nextSocket.on('matchAssignment', (assignment: unknown) => {
          if (ticketRebound || !isMatchAssignment(assignment)) return;
          ticketRebound = true;
          expectedMatchId = assignment.matchId;
          expectedPlayerId = assignment.playerId;
          expectedSeat = assignment.seat;
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
              auth: {
                ...assignment,
                clientProtocolVersion: GAME_PROTOCOL_VERSION,
              },
              path: socketPath,
              transports: ['websocket', 'polling'],
            }),
            true,
            assignment,
          );
        });

        nextSocket.on('matchEvent', (evt: MatchEvent) => {
          callbacksRef.current.onMatchEvent?.(evt);
        });
      };

      const recoverAfterDisconnect = async (
        reason: 'transport' | 'ticket' | 'runtime' = 'transport',
      ): Promise<void> => {
        if (recoveryInFlight || cancelled) return;
        const now = Date.now();
        if (recoveryDeadlineAt === null) {
          recoveryDeadlineAt = now + 60_000;
          recoveryAttempts = 0;
        }
        const maxAttempts = reason === 'runtime' ? 3 : 1;
        if (recoveryAttempts >= maxAttempts || now >= recoveryDeadlineAt) {
          reportMatchDiagnostics({
            phase: 'error',
            error: reason === 'runtime'
              ? 'The match runtime is unavailable. Try again shortly.'
              : 'The match ticket could not be refreshed.',
          });
          return;
        }
        recoveryInFlight = true;
        const session = clientSession ?? readClientSession();
        if (session === null) {
          reportMatchDiagnostics({
            phase: 'error',
            error: 'Client session is unavailable for reconnect',
          });
          recoveryInFlight = false;
          return;
        }
        clientSession = session;

        try {
          const signal = bootstrapAbortController?.signal ?? new AbortController().signal;
          const assignment = await pollForMatchRecoveryAssignment({
            requestAssignment: () => requestMatchAssignment(url, session, signal),
            wait: (milliseconds) => waitFor(milliseconds, signal),
            deadlineMs: Math.max(0, recoveryDeadlineAt - Date.now()),
          });
          if (assignment !== null) {
            if (
              (expectedMatchId !== null && assignment.matchId !== expectedMatchId)
              || (expectedSeat !== null && assignment.seat !== expectedSeat)
              || (expectedPlayerId !== null && assignment.playerId !== expectedPlayerId)
              || assignment.playerId !== session.playerId
            ) {
              reportMatchDiagnostics({
                phase: 'error',
                error: 'Reconnect assignment does not match this player seat.',
              });
              return;
            }
            expectedMatchId = assignment.matchId;
            expectedPlayerId = assignment.playerId;
            expectedSeat = assignment.seat;
            recoveryAttempts += 1;
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
                auth: {
                  ...assignment,
                  clientProtocolVersion: GAME_PROTOCOL_VERSION,
                },
                path: socketPath,
                transports: ['websocket', 'polling'],
              }),
              true,
              assignment,
            );
            return;
          }
          if (!cancelled) {
            if (expectedMatchId !== null) {
              const outcome = await requestMatchOutcome(
                url,
                session,
                expectedMatchId,
                signal,
              );
              if (outcome === 'server-void') {
                reportMatchDiagnostics({
                  phase: 'server-void',
                  error: 'Match voided — no winner.',
                });
                reportReliability('match_voided', { reason: 'assignment_expired' });
                return;
              }
            }
            reportMatchDiagnostics({
              phase: 'error',
              error: reason === 'runtime'
                ? 'The match runtime is unavailable. Try again shortly.'
                : 'Reconnect assignment timed out',
            });
          }
        } catch (error: unknown) {
          if (!cancelled && error instanceof SessionInvalidError) {
            clientSession = null;
            reportMatchDiagnostics({
              phase: 'session-invalid',
              playerId: error.playerId,
              error: sessionInvalidMessage(error.provider),
            });
          } else if (!cancelled && !(error instanceof DOMException && error.name === 'AbortError')) {
            reportMatchDiagnostics({
              phase: 'service-unavailable',
              error: 'The game service is unavailable. Retry when it is back online.',
            });
          }
        } finally {
          recoveryInFlight = false;
        }
      };

      console.log(`[Socket] Initializing connection to resolved URL: ${url}`);
      if (useLegacySocket) {
        attachSocket(io(url, {
          path: socketPath,
          transports: ['websocket', 'polling'],
        }));
        return;
      }
      if (initialBootstrap === null) return;
      attachSocket(io(url, {
        auth: {
          ...initialBootstrap.assignment,
          clientProtocolVersion: GAME_PROTOCOL_VERSION,
        },
        path: socketPath,
        transports: ['websocket', 'polling'],
      }), true, initialBootstrap.assignment);
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

  const resetClientSession = useCallback(() => {
    try {
      window.localStorage.removeItem(CLIENT_SESSION_STORAGE_KEY);
      window.localStorage.removeItem(CLIENT_GUEST_BOOTSTRAP_KEY);
    } catch {
      // A blocked store must not prevent starting a new page session.
    }
    inMemoryGuestBootstrapKey = null;
    window.location.reload();
  }, []);

  return {
    socket,
    sendInputState,
    sendAction,
    sendShopOpen,
    sendShopPurchase,
    resetClientSession,
  };
};

export function isRetryableTicketConnectError(error: Error): boolean {
  const code = socketAuthErrorCode(error);
  if (code === 'MATCH_TICKET_REJECTED' || code === 'MATCH_TICKET_CONSUMED') return true;
  const message = error.message.toLowerCase();
  return (
    message.includes('match ticket rejected')
    || message.includes('match ticket already consumed')
    || message.includes('match ticket is expired')
  );
}

export function isProtocolMismatchError(error: unknown): boolean {
  return socketAuthErrorCode(error) === 'PROTOCOL_VERSION_MISMATCH'
    || (error instanceof Error && error.message.toLowerCase().includes('protocol'));
}

function socketAuthErrorCode(value: unknown): SocketAuthErrorCode | null {
  if (typeof value === 'string') {
    const prefix = value.split(':', 1)[0];
    return isSocketAuthErrorCode(prefix) ? prefix : null;
  }
  if (!isRecord(value)) return null;
  const data = isRecord(value.data) ? value.data : value;
  if (isRecord(data) && isSocketAuthErrorCode(data.code)) return data.code;
  if (typeof value.message === 'string') {
    const prefix = value.message.split(':', 1)[0];
    return isSocketAuthErrorCode(prefix) ? prefix : null;
  }
  return null;
}

function isSocketAuthErrorCode(value: unknown): value is SocketAuthErrorCode {
  return typeof value === 'string'
    && SOCKET_AUTH_ERROR_CODES.some((code) => code === value);
}

function isTerminalSocketAuthCode(
  code: SocketAuthErrorCode | null,
): code is Exclude<
  SocketAuthErrorCode,
  'MATCH_TICKET_REJECTED' | 'MATCH_TICKET_CONSUMED' | 'MATCH_RUNTIME_UNAVAILABLE'
> {
  return code !== null
    && code !== 'MATCH_TICKET_REJECTED'
    && code !== 'MATCH_TICKET_CONSUMED'
    && code !== 'MATCH_RUNTIME_UNAVAILABLE';
}

function protocolRecoveryMessage(code: SocketAuthErrorCode): string {
  switch (code) {
    case 'PROTOCOL_VERSION_MISMATCH':
      return 'This client is out of date. Reload the page to receive the current game protocol.';
    case 'MATCH_TICKET_REJECTED':
      return 'This match ticket is no longer valid. Requesting a fresh ticket.';
    case 'MATCH_TICKET_CONSUMED':
      return 'This match ticket was already used. Requesting a fresh ticket.';
    case 'MATCH_SEAT_REJECTED':
      return 'This match seat cannot be claimed.';
    case 'MATCH_THIRD_SOCKET':
      return 'This match already has two active seats.';
    case 'MATCH_TICKET_REQUIRED':
      return 'The match ticket is incomplete. Reload the page and try again.';
    case 'MATCH_RUNTIME_UNAVAILABLE':
      return 'The match runtime is unavailable. Try again shortly.';
    case 'MATCH_VOIDED':
      return 'The server voided this match. No player won.';
    default: {
      const exhaustive: never = code;
      return exhaustive;
    }
  }
}

function sessionInvalidMessage(provider: ClientSession['provider']): string {
  return provider === 'discord'
    ? 'Discord Activity session expired or is no longer valid. Re-authenticate in Discord.'
    : 'Guest session expired or is no longer valid. Start a new guest session.';
}

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

function isMatchOutcomeResponse(value: unknown): value is MatchOutcomeResponse {
  return isRecord(value) && typeof value.outcomeReason === 'string';
}

function isGuestSessionResponse(value: unknown): value is GuestSessionResponse {
  if (!isRecord(value) || !isRecord(value.player) || !isRecord(value.session)) return false;
  return (
    typeof value.player.id === 'string' &&
    typeof value.session.token === 'string' &&
    value.session.token.length > 0 &&
    (value.session.expiresAt === undefined
      || typeof value.session.expiresAt === 'string')
  );
}

function isClientSession(value: unknown): value is ClientSession {
  return (
    isRecord(value) &&
    typeof value.playerId === 'string' &&
    typeof value.token === 'string' &&
    value.token.length > 0 &&
    (value.provider === undefined || value.provider === 'guest' || value.provider === 'discord') &&
    (value.expiresAt === undefined
      || value.expiresAt === null
      || typeof value.expiresAt === 'string')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
