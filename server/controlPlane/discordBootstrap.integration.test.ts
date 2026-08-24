import assert from 'node:assert/strict';
import express from 'express';
import { createServer, type Server as HttpServer } from 'node:http';
import { after, describe, it } from 'node:test';
import { createTestDatabase } from './testDatabase.js';
import { runMigrations } from './migrations.js';
import { createControlPlaneRouter } from './routes.js';
import type { DiscordPlayerProfile } from './discordIdentity.js';

const database = createTestDatabase();

describe('Discord Activity bootstrap', () => {
  if (database === null) {
    it('requires TEST_DATABASE_URL', { skip: 'TEST_DATABASE_URL is not configured' }, () => {});
    return;
  }

  after(async () => {
    await database.end({ timeout: 1 });
  });

  it('reuses the same player for a repeated identity and isolates different identities', async () => {
    await runMigrations(database, `${process.cwd()}/db/migrations`);

    const profiles = new Map<string, DiscordPlayerProfile>([
      ['activity-code-one', {
        discordUserId: '123456789012345678',
        displayName: 'Discord One',
        avatarUrl: null,
      }],
      ['activity-code-two', {
        discordUserId: '223456789012345678',
        displayName: 'Discord Two',
        avatarUrl: null,
      }],
    ]);
    const createdPlayerIds: string[] = [];
    let httpServer: HttpServer | null = null;

    try {
      const app = express();
      app.use(express.json());
      app.use('/api', createControlPlaneRouter(database, {
        verifyDiscordIdentity: async (code) => {
          const profile = profiles.get(code);
          if (profile === undefined) throw new Error('test identity was not found');
          return profile;
        },
      }));

      httpServer = await listen(app);
      const address = httpServer.address();
      assert.ok(address !== null && typeof address !== 'string');
      const origin = `http://127.0.0.1:${address.port}`;

      const first = await bootstrap(origin, 'activity-code-one');
      const remount = await bootstrap(origin, 'activity-code-one');
      const otherUser = await bootstrap(origin, 'activity-code-two');
      createdPlayerIds.push(first.player.id, otherUser.player.id);

      assert.equal(first.player.id, remount.player.id);
      assert.notEqual(first.session.token, remount.session.token);
      assert.notEqual(first.player.id, otherUser.player.id);
      assert.equal('discordUserId' in first.player, false);
      assert.equal('discordUserId' in remount.player, false);
    } finally {
      if (httpServer !== null) {
        await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
      }
      if (createdPlayerIds.length > 0) {
        await database`DELETE FROM players WHERE id IN ${database(createdPlayerIds)}`;
      }
    }
  });
});

async function listen(app: express.Express): Promise<HttpServer> {
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  return server;
}

async function bootstrap(
  origin: string,
  code: string,
): Promise<{
  player: { id: string; displayName: string; avatarUrl: string | null };
  session: { token: string };
}> {
  const response = await fetch(`${origin}/api/players/discord`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const responseBody = await response.text();
  assert.equal(response.status, 201, responseBody);
  return JSON.parse(responseBody) as {
    player: { id: string; displayName: string; avatarUrl: string | null };
    session: { token: string };
  };
}
