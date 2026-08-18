import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { Server, type Socket } from 'socket.io';
import { createControlPlaneRouter } from './controlPlane/routes.js';
import { createHttpCorsMiddleware, resolveCorsOrigins } from './controlPlane/cors.js';
import { createDatabase, healthPing } from './controlPlane/database.js';
import { MatchStore } from './controlPlane/matchStore.js';
import { PostgresMatchPersistence } from './controlPlane/matchPersistence.js';
import { runMigrations } from './controlPlane/migrations.js';
import { PlayerStore } from './controlPlane/playerStore.js';
import { GameManager } from './GameManager.js';
import { loadServerConfig, type ServerConfig } from './loadConfig.js';

type ServerMode = 'development' | 'production';

type StartGameServerOptions = {
  config?: ServerConfig;
  cwd?: string;
  mode?: ServerMode;
};

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
  const playerStore = database === null ? null : new PlayerStore(database);
  const databaseRequired =
    mode === 'production' && process.env.ALLOW_IN_MEMORY_DATABASE !== 'true';

  if (database === null && databaseRequired) {
    throw new Error('DATABASE_URL is required in production');
  }

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
  const corsOrigins = resolveCorsOrigins(mode);
  app.use(express.json({ limit: '32kb' }));
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
      void authorizeSocket(socket, matchStore).then(() => next()).catch(next);
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
      process.env.GAME_SERVER_URL?.trim() || `http://localhost:${config.port}`,
    );
  const gameManager = new GameManager(io, config.replayKeyframeIntervalTicks, persistence);
  io.on('connection', (socket) => {
    void resolveDurablePlayerId(socket, playerStore)
      .then((durablePlayerId) => {
        if (!socket.connected) return;
        console.log(`Player connected: ${socket.id}`);
        gameManager.handleConnection(socket, durablePlayerId);
      })
      .catch((error: unknown) => {
        console.error('Failed to prepare durable player', {
          event: 'durable_player_prepare_failed',
          socketId: socket.id,
          error,
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
    gameManager.stopLoop();
    await closeDevelopmentServer?.();
    io.close();
    await database?.end({ timeout: 1 });
    throw error;
  }

  const address = httpServer.address();
  if (address === null || typeof address === 'string') {
    gameManager.stopLoop();
    await closeDevelopmentServer?.();
    io.close();
    await database?.end({ timeout: 1 });
    throw new Error('Game server did not expose a TCP address');
  }

  let stopped = false;
  return {
    config,
    mode,
    origin: `http://${config.host}:${address.port}`,
    stop: async () => {
      if (stopped) return;
      stopped = true;
      gameManager.stopLoop();
      await closeDevelopmentServer?.();
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await database?.end({ timeout: 1 });
    },
  };
}

async function authorizeSocket(socket: Socket, matches: MatchStore): Promise<void> {
  const ticket = readAuthString(socket.handshake.auth, 'ticket');
  if (ticket === null) {
    if (process.env.REQUIRE_MATCH_TICKETS === 'true') {
      throw new Error('match ticket required');
    }
    return;
  }

  const matchId = readAuthString(socket.handshake.auth, 'matchId');
  const playerId = readAuthString(socket.handshake.auth, 'playerId');
  const protocolVersion = readAuthNumber(socket.handshake.auth, 'protocolVersion');
  if (matchId === null || playerId === null || protocolVersion === null) {
    throw new Error('match ticket identity is incomplete');
  }

  const validated = await matches.validateJoinTicket(ticket);
  if (
    validated === null ||
    validated.matchId !== matchId ||
    validated.playerId !== playerId ||
    validated.protocolVersion !== protocolVersion
  ) {
    throw new Error('match ticket rejected');
  }

  const consumed = await matches.consumeJoinTicket(ticket);
  if (consumed === null) {
    throw new Error('match ticket already consumed');
  }

  socket.data.controlPlane = {
    matchId: validated.matchId,
    playerId: validated.playerId,
    seat: validated.seat,
    protocolVersion: validated.protocolVersion,
  };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
