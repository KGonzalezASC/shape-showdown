import express from 'express';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Server, type Socket } from 'socket.io';
import { createControlPlaneRouter } from './controlPlane/routes.js';
import {
  createHttpCorsMiddleware,
  createNoStoreMiddleware,
  resolveCorsOrigins,
} from './controlPlane/cors.js';
import { createDatabase, healthPing } from './controlPlane/database.js';
import { MatchAllocationService } from './controlPlane/matchAllocation.js';
import { AnalyticsStore } from './controlPlane/analyticsStore.js';
import { MatchStore } from './controlPlane/matchStore.js';
import { PostgresMatchPersistence } from './controlPlane/matchPersistence.js';
import { runMigrations } from './controlPlane/migrations.js';
import { PlayerStore } from './controlPlane/playerStore.js';
import { QueueStore } from './controlPlane/queueLobbyStore.js';
import type { SocketSeatBinding } from './GameManager.js';
import { loadServerConfig, type ServerConfig } from './loadConfig.js';
import { MatchRegistry } from './matchRuntime/MatchRegistry.js';
import { PuzzleHost } from './puzzle/puzzleHost.js';
import { logError, logInfo } from './observability/logger.js';
import { initialSeed } from './puzzleEngine/engine.js';
import { GAME_PROTOCOL_VERSION } from '../src/protocol/version.js';
import type {
  SocketAuthErrorCode,
  SocketAuthErrorPayload,
} from '../src/types.js';
import {
  resolveRuntimePolicy,
  type RuntimePolicy,
  type ServerMode,
} from './runtimePolicy.js';

type StartGameServerOptions = {
  config?: ServerConfig;
  cwd?: string;
  mode?: ServerMode;
};

/** How long a match may sit active with zero consumed tickets before the rendezvous sweep cancels it. */
const NEVER_JOINED_MATCH_GRACE_SECONDS = 60;

export type RunningGameServer = {
  config: ServerConfig;
  mode: ServerMode;
  origin: string;
  stop: () => Promise<void>;
};

export async function startGameServer(
  options: StartGameServerOptions = {},
): Promise<RunningGameServer> {
  const cwd = options.cwd ?? process.cwd();
  const config = options.config ?? loadServerConfig(cwd);
  const mode = options.mode ?? (process.env.NODE_ENV === 'production' ? 'production' : 'development');
  const database = createDatabase();
  let policy: RuntimePolicy;
  try {
    policy = resolveRuntimePolicy({
      mode,
      hasDatabase: database !== null,
      env: process.env,
    });
    if (policy.requirePostgres && database === null) {
      throw new Error('DATABASE_URL is required in production');
    }
  } catch (error) {
    await database?.end({ timeout: 1 });
    throw error;
  }

  const playerStore = database === null ? null : new PlayerStore(database);
  const allocator = database === null ? null : new MatchAllocationService(database);
  const queueJanitor = database === null ? null : new QueueStore(database);
  const matchJanitor = database === null ? null : new MatchStore(database);
  const analyticsJanitor = database === null ? null : new AnalyticsStore(database);
  const gameServerUrl = process.env.GAME_SERVER_URL?.trim() || `http://localhost:${config.port}`;

  if (database !== null) {
    try {
      const migrationsDirectory =
        mode === 'production'
          ? path.join(cwd, 'dist-server', 'migrations')
          : path.join(cwd, 'db', 'migrations');
      await runMigrations(database, migrationsDirectory);
    } catch (error) {
      await database.end({ timeout: 1 });
      throw error;
    }
  }

  const app = express();
  const httpServer = createServer(app);
  httpServer.keepAliveTimeout = 65_000;
  httpServer.headersTimeout = 66_000;
  const corsOrigins = resolveCorsOrigins(mode);
  app.use(express.json({ limit: '32kb' }));
  app.use(['/health', '/health/details'], createNoStoreMiddleware());
  app.use(createHttpCorsMiddleware(mode));
  if (database !== null) {
    app.use('/api', createControlPlaneRouter(database));
  }

  const io = new Server(httpServer, {
    // Vite HMR shares this HTTP server in development. Leave upgrades on
    // other paths alone instead of destroying Vite's WebSocket after 1 second.
    destroyUpgrade: false,
    cors: {
      origin: corsOrigins,
      methods: ['GET', 'POST'],
    },
    perMessageDeflate: {
      threshold: 1024,
    },
  });

  if (database !== null) {
    const matchStore = new MatchStore(database);
    io.use((socket, next) => {
      void authorizeSocket(socket, matchStore, policy.requireMatchTickets)
        .then(() => next())
        .catch((error: unknown) => {
          if (
            error instanceof SocketAuthorizationError
            && error.data.code === 'PROTOCOL_VERSION_MISMATCH'
          ) {
            logInfo('protocol_mismatch', { reason: error.data.code });
          }
          next(error instanceof Error ? error : new Error(String(error)));
        });
    });
  }

  app.get('/health', async (_req, res) => {
    if (database === null) {
      res.status(200).type('text/plain').send('ok');
      return;
    }

    try {
      await healthPing(database);
      res.status(200).type('text/plain').send('ok');
    } catch {
      res.status(503).type('text/plain').send('database unavailable');
    }
  });

  app.get('/health/details', async (_req, res) => {
    if (database === null) {
      res.status(200).json({
        databaseMode: 'in-memory',
        databaseHealth: 'not-configured',
        migrationsReady: false,
      });
      return;
    }

    try {
      await healthPing(database);
      res.status(200).json({
        databaseMode: 'postgres',
        databaseHealth: 'healthy',
        migrationsReady: true,
      });
    } catch {
      res.status(503).json({
        databaseMode: 'postgres',
        databaseHealth: 'unavailable',
        migrationsReady: true,
      });
    }
  });

  let closeDevelopmentServer: (() => Promise<void>) | null = null;
  if (mode === 'development') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          server: httpServer,
          path: '/vite-hmr',
        },
      },
      appType: 'spa',
    });
    closeDevelopmentServer = () => vite.close();
    app.use(vite.middlewares);
  } else if (config.serveClient) {
    const distPath = path.join(cwd, 'dist', 'client');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const persistence = database === null
    ? undefined
    : new PostgresMatchPersistence(
      database,
      gameServerUrl,
    );
  const matchRegistry = new MatchRegistry(
    io,
    config.replayKeyframeIntervalTicks,
    persistence,
    config.recoveryVoidTimeoutMs,
  );
  io.on('connection', (socket) => {
    // Single-player puzzle sessions: one host per socket, lazily created.
    const puzzleHost = new PuzzleHost(socket);
      socket.on('puzzle:list', () => {
    try {
      puzzleHost.listCatalog();
    } catch (error) {
      console.error('Failed to list puzzle catalog:', error);
      socket.emit('puzzle:error', { message: 'failed to list puzzle catalog' });
    }
  });
  socket.on('puzzle:start', (payload?: { puzzleId?: string; mode?: 'catalog' | 'random' | 'generated'; seed?: number; level?: string }) => {
      try {
        puzzleHost.start(payload);
      } catch (error) {
        logError('puzzle_start_failed', error);
        socket.emit('puzzle:error', { message: 'failed to start puzzle session' });
      }
    });
    socket.on('puzzle:input', (input: { left?: boolean; right?: boolean; softDrop?: boolean }) => {
      puzzleHost.setInput(input ?? {});
    });
    socket.on('puzzle:action', (action: string) => {
      if (['rotateCW', 'rotateCCW', 'hardDrop', 'hold'].includes(action)) {
        puzzleHost.pushAction(action as never);
      }
    });
    socket.on('puzzle:stop', () => puzzleHost.stop());
    socket.on('disconnect', () => puzzleHost.stop());

    const purpose = readAuthString(socket.handshake.auth, 'purpose');
    if (purpose === 'puzzle') {
      return;
    }

    void resolveDurablePlayerId(socket, playerStore)
      .then((durablePlayerId) => {
        if (!socket.connected) return;
        const binding = readSocketSeatBinding(socket);
        logInfo('socket_bound', {
          connection: binding === undefined ? 'legacy' : 'ticket',
          matchId: binding?.matchId,
          playerId: durablePlayerId ?? null,
          seat: binding?.seat,
        });
        matchRegistry.handleConnection(socket, durablePlayerId, binding);
      })
      .catch((error: unknown) => {
        logError('durable_player_prepare_failed', error, {
          connection: 'ticket',
        });
        socket.disconnect(true);
      });
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => reject(error);
      httpServer.once('error', onError);
      httpServer.listen(config.port, config.host, () => {
        httpServer.off('error', onError);
        resolve();
      });
    });
  } catch (error) {
    await matchRegistry.stop();
    await closeDevelopmentServer?.();
    io.close();
    await database?.end({ timeout: 1 });
    throw error;
  }

  const address = httpServer.address();
  if (address === null || typeof address === 'string') {
    await matchRegistry.stop();
    await closeDevelopmentServer?.();
    io.close();
    await database?.end({ timeout: 1 });
    throw new Error('Game server did not expose a TCP address');
  }
  logInfo('server_started', {
    database: database === null ? 'in_memory' : 'postgres',
    mode,
    origin: `http://${config.host}:${address.port}`,
  });

  let allocationInFlight = false;
  let analyticsPruneInFlight = false;
  let lastAnalyticsPruneDate: string | null = null;
  const allocationHandle = allocator === null
    ? null
    : setInterval(() => {
      if (allocationInFlight) return;
      allocationInFlight = true;
      void allocator.allocateNextMatches({
        correlationId: randomUUID(),
        matchSeed: initialSeed(),
        gameServerUrl,
        protocolVersion: GAME_PROTOCOL_VERSION,
      })
        .then(async (allocations) => {
          for (const allocation of allocations) {
            matchRegistry.prepareMatch(
              allocation.match.id,
              allocation.match.matchSeed,
            );
            logInfo('queue_match_allocated', {
              correlationId: allocation.match.correlationId,
              matchId: allocation.match.id,
              playerAId: allocation.match.playerAId,
              playerBId: allocation.match.playerBId,
            });
          }
          await queueJanitor?.purgeExpiredEntries();
          await queueJanitor?.purgeOldAvoidances();
          await matchJanitor?.cancelNeverJoinedMatches(NEVER_JOINED_MATCH_GRACE_SECONDS);
          const analyticsDate = new Date().toISOString().slice(0, 10);
          if (
            analyticsJanitor !== null
            && !analyticsPruneInFlight
            && lastAnalyticsPruneDate !== analyticsDate
          ) {
            analyticsPruneInFlight = true;
            lastAnalyticsPruneDate = analyticsDate;
            void analyticsJanitor.purgeExpiredEvents()
              .catch((error: unknown) => {
                lastAnalyticsPruneDate = null;
                logError('analytics_prune_failed', error);
              })
              .finally(() => {
                analyticsPruneInFlight = false;
              });
          }
        })
        .catch((error: unknown) => {
          logError('match_allocation_cycle_failed', error, {
            operation: 'queue_allocation',
          });
        })
        .finally(() => {
          allocationInFlight = false;
        });
    }, 500);

  let stopped = false;
  return {
    config,
    mode,
    origin: `http://${config.host}:${address.port}`,
    stop: async () => {
      if (stopped) return;
      stopped = true;
      matchRegistry.beginDrain();
      if (allocationHandle !== null) clearInterval(allocationHandle);
      await matchRegistry.stop();
      await closeDevelopmentServer?.();
      io.disconnectSockets(true);
      if (typeof httpServer.closeAllConnections === 'function') {
        httpServer.closeAllConnections();
      }
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await database?.end({ timeout: 1 });
    },
  };
}

async function authorizeSocket(
  socket: Socket,
  matches: MatchStore,
  requireMatchTickets: boolean,
): Promise<void> {
  const purpose = readAuthString(socket.handshake.auth, 'purpose');
  if (purpose === 'puzzle') {
    return;
  }

  const ticket = readAuthString(socket.handshake.auth, 'ticket');
  if (ticket === null) {
    if (requireMatchTickets) {
      throw new SocketAuthorizationError(
        'MATCH_TICKET_REQUIRED',
        'A match ticket is required',
      );
    }
    return;
  }

  const matchId = readAuthString(socket.handshake.auth, 'matchId');
  const playerId = readAuthString(socket.handshake.auth, 'playerId');
  const seat = readAuthSeat(socket.handshake.auth);
  const protocolVersion = readAuthNumber(socket.handshake.auth, 'protocolVersion');
  const clientProtocolVersion = readAuthNumber(socket.handshake.auth, 'clientProtocolVersion');
  if (seat === 'invalid') {
    throw new SocketAuthorizationError(
      'MATCH_SEAT_REJECTED',
      'The requested match seat is invalid',
    );
  }
  if (
    matchId === null
    || playerId === null
    || protocolVersion === null
    || clientProtocolVersion === null
    || clientProtocolVersion !== GAME_PROTOCOL_VERSION
  ) {
    throw new SocketAuthorizationError(
      clientProtocolVersion !== null && clientProtocolVersion !== GAME_PROTOCOL_VERSION
        ? 'PROTOCOL_VERSION_MISMATCH'
        : 'MATCH_TICKET_REJECTED',
      clientProtocolVersion !== null && clientProtocolVersion !== GAME_PROTOCOL_VERSION
        ? 'Match protocol version is not supported'
        : 'The match ticket could not be accepted',
    );
  }

  const validated = await matches.validateJoinTicket(ticket);
  if (validated === null) {
    const rejection = await matches.classifyJoinTicketRejection(ticket);
    throw new SocketAuthorizationError(
      rejection === 'consumed' ? 'MATCH_TICKET_CONSUMED' : 'MATCH_TICKET_REJECTED',
      rejection === 'consumed'
        ? 'The match ticket was already used. Request a fresh ticket.'
        : 'The match ticket is expired or no longer valid',
    );
  }
  if (validated.matchId !== matchId || validated.playerId !== playerId) {
    throw new SocketAuthorizationError(
      'MATCH_TICKET_REJECTED',
      'The match ticket does not belong to this player or match',
    );
  }
  if (seat !== null && validated.seat !== seat) {
    throw new SocketAuthorizationError(
      'MATCH_SEAT_REJECTED',
      'The match ticket does not belong to this seat',
    );
  }
  if (validated.protocolVersion !== protocolVersion) {
    throw new SocketAuthorizationError(
      'PROTOCOL_VERSION_MISMATCH',
      'Match protocol version is not supported',
    );
  }

  const consumed = await matches.consumeJoinTicket(ticket);
  if (consumed === null) {
    const rejection = await matches.classifyJoinTicketRejection(ticket);
    throw new SocketAuthorizationError(
      rejection === 'consumed' ? 'MATCH_TICKET_CONSUMED' : 'MATCH_TICKET_REJECTED',
      rejection === 'consumed'
        ? 'The match ticket was already used. Request a fresh ticket.'
        : 'The match ticket is expired or no longer valid',
    );
  }
  logInfo('join_ticket_consumed', {
    matchId: consumed.matchId,
    playerId: consumed.playerId,
    seat: consumed.seat,
  });

  socket.data.controlPlane = {
    matchId: validated.matchId,
    playerId: validated.playerId,
    seat: validated.seat,
    matchSeed: validated.matchSeed,
    protocolVersion: validated.protocolVersion,
  };
}

class SocketAuthorizationError extends Error {
  public readonly data: SocketAuthErrorPayload;

  public constructor(code: SocketAuthErrorCode, message: string) {
    super(message);
    this.name = 'SocketAuthorizationError';
    this.data = { code, message };
  }
}

async function resolveDurablePlayerId(
  socket: Socket,
  players: PlayerStore | null,
): Promise<string | undefined> {
  const controlPlane = socket.data?.controlPlane;
  if (isRecord(controlPlane) && typeof controlPlane.playerId === 'string') {
    return controlPlane.playerId;
  }
  if (players === null) return undefined;

  const player = await players.createGuestPlayer(`Guest ${socket.id.slice(0, 8)}`);
  return player.id;
}

function readSocketSeatBinding(socket: Socket): SocketSeatBinding | undefined {
  const controlPlane = socket.data?.controlPlane;
  if (!isRecord(controlPlane)) return undefined;
  const matchId = controlPlane.matchId;
  const playerId = controlPlane.playerId;
  const seat = controlPlane.seat;
  const matchSeed = controlPlane.matchSeed;
  const protocolVersion = controlPlane.protocolVersion;
  if (
    typeof matchId !== 'string'
    || typeof playerId !== 'string'
    || (seat !== 'A' && seat !== 'B')
    || typeof matchSeed !== 'number'
    || typeof protocolVersion !== 'number'
    || !Number.isInteger(protocolVersion)
  ) {
    return undefined;
  }
  return { matchId, playerId, seat, matchSeed, protocolVersion };
}

function readAuthString(auth: unknown, key: string): string | null {
  if (!isRecord(auth)) return null;
  const value = auth[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readAuthNumber(auth: unknown, key: string): number | null {
  if (!isRecord(auth)) return null;
  const value = auth[key];
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function readAuthSeat(auth: unknown): 'A' | 'B' | 'invalid' | null {
  if (!isRecord(auth)) return null;
  const value = auth.seat;
  if (value === undefined) return null;
  return value === 'A' || value === 'B' ? value : 'invalid';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
