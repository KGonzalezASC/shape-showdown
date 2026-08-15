import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { Server } from 'socket.io';
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
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    // Vite HMR shares this HTTP server in development. Leave upgrades on
    // other paths alone instead of destroying Vite's WebSocket after 1 second.
    destroyUpgrade: false,
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    perMessageDeflate: {
      threshold: 1024,
    },
  });

  app.get('/health', (_req, res) => {
    res.status(200).type('text/plain').send('ok');
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

  const gameManager = new GameManager(io, config.replayKeyframeIntervalTicks);
  io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);
    gameManager.handleConnection(socket);
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
    throw error;
  }

  const address = httpServer.address();
  if (address === null || typeof address === 'string') {
    gameManager.stopLoop();
    await closeDevelopmentServer?.();
    io.close();
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
    },
  };
}
