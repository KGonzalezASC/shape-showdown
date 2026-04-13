import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { GameManager } from './server/GameManager.js';
import { loadServerConfig } from './server/loadConfig.js';

async function startServer() {
  const cfg = loadServerConfig();
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  const gameManager = new GameManager(io);

  app.get('/health', (_req, res) => {
    res.status(200).type('text/plain').send('ok');
  });

  io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);
    gameManager.handleConnection(socket);
  });

  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (cfg.serveClient) {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(cfg.port, cfg.host, () => {
    const mode = isDev ? 'dev (Vite middleware)' : 'production';
    console.log(`Shape Showdown server [${mode}] on http://${cfg.host}:${cfg.port}`);
    if (!isDev && !cfg.serveClient) {
      console.log('Static client not served (serveClient is false in config/server.json). Host dist/ separately.');
    }
  });
}

startServer();
