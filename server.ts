import 'dotenv/config';
import { startGameServer } from './server/gameServer.js';

async function startServer() {
  const server = await startGameServer();
  const modeLabel = server.mode === 'development' ? 'dev (Vite middleware)' : 'production';
  console.log(`Shape Showdown server [${modeLabel}] on ${server.origin}`);
  if (server.mode === 'production' && !server.config.serveClient) {
    console.log('Static client not served (serveClient is false in config/server.json). Host dist/ separately.');
  }

  const stop = async (signal: NodeJS.Signals) => {
    console.log(`Received ${signal}; stopping Shape Showdown server.`);
    try {
      await server.stop();
      process.exit(0);
    } catch (error) {
      console.error(`Error during graceful shutdown on ${signal}:`, error);
      process.exit(1);
    }
  };
  process.once('SIGINT', () => void stop('SIGINT'));
  process.once('SIGTERM', () => void stop('SIGTERM'));
}

startServer().catch((error: unknown) => {
  console.error('Failed to start Shape Showdown server:', error);
  process.exitCode = 1;
});
