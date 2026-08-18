import { createHash, randomBytes } from 'node:crypto';
import { Router, type Request, type RequestHandler, type Response } from 'express';
import type { Database } from './database.js';
import { LobbyStore, QueueStore } from './queueLobbyStore.js';
import { PlayerStore, type ValidatedSession } from './playerStore.js';

type RouteHandler = (
  request: Request,
  response: Response,
  next: (error?: unknown) => void,
) => Promise<void>;

export function createControlPlaneRouter(database: Database): Router {
  const router = Router();
  const players = new PlayerStore(database);
  const queue = new QueueStore(database);
  const lobbies = new LobbyStore(database);

  router.post(
    '/players/guest',
    asyncHandler(async (request, response) => {
      const displayName = readStringField(request.body, 'displayName', 1, 32);
      if (displayName === null) {
        sendClientError(response, 400, 'displayName must be 1-32 characters');
        return;
      }

      const player = await players.createGuestPlayer(displayName);
      const rawToken = randomBytes(32).toString('hex');
      const session = await players.createSession({
        playerId: player.id,
        tokenHash: hashSecret(rawToken),
        ipAddress: request.ip ?? null,
        userAgent: request.get('user-agent') ?? null,
      });

      response.status(201).json({
        player,
        session: {
          id: session.id,
          expiresAt: session.expiresAt,
          token: rawToken,
        },
      });
    }),
  );

  router.post(
    '/queue',
    asyncHandler(async (request, response) => {
      const session = await authenticate(request, players);
      if (session === null) {
        sendClientError(response, 401, 'valid session required');
        return;
      }

      const entry = await queue.upsertEntry({
        playerId: session.playerId,
        sessionId: session.sessionId,
      });
      if (entry === null) {
        sendClientError(response, 409, 'player already has a matched queue entry');
        return;
      }

      response.status(200).json({ entry });
    }),
  );

  router.post(
    '/queue/heartbeat',
    asyncHandler(async (request, response) => {
      const session = await authenticate(request, players);
      if (session === null) {
        sendClientError(response, 401, 'valid session required');
        return;
      }

      const lease = await queue.heartbeatEntry(session.playerId);
      if (lease === null) {
        sendClientError(response, 404, 'searching queue entry not found');
        return;
      }

      response.status(200).json({ lease });
    }),
  );

  router.delete(
    '/queue',
    asyncHandler(async (request, response) => {
      const session = await authenticate(request, players);
      if (session === null) {
        sendClientError(response, 401, 'valid session required');
        return;
      }

      const entryId = await queue.removeEntry(session.playerId);
      response.status(200).json({ removed: entryId !== null });
    }),
  );

  router.post(
    '/lobbies',
    asyncHandler(async (request, response) => {
      const session = await authenticate(request, players);
      if (session === null) {
        sendClientError(response, 401, 'valid session required');
        return;
      }

      const lobby = await lobbies.createLobby({
        code: createLobbyCode(),
        hostPlayerId: session.playerId,
      });
      response.status(201).json({ lobby });
    }),
  );

  router.post(
    '/lobbies/:code/join',
    asyncHandler(async (request, response) => {
      const session = await authenticate(request, players);
      if (session === null) {
        sendClientError(response, 401, 'valid session required');
        return;
      }

      const code = readRouteCode(request.params.code);
      if (code === null) {
        sendClientError(response, 400, 'lobby code must be 1-8 characters');
        return;
      }

      const member = await lobbies.joinLobby({
        code,
        playerId: session.playerId,
      });
      if (member === null) {
        sendClientError(response, 404, 'open lobby not found');
        return;
      }

      response.status(200).json({ member });
    }),
  );

  router.post(
    '/lobbies/:code/heartbeat',
    asyncHandler(async (request, response) => {
      const session = await authenticate(request, players);
      if (session === null) {
        sendClientError(response, 401, 'valid session required');
        return;
      }

      const code = readRouteCode(request.params.code);
      if (code === null) {
        sendClientError(response, 400, 'lobby code must be 1-8 characters');
        return;
      }

      const lease = await lobbies.heartbeatLobby({
        code,
        playerId: session.playerId,
      });
      if (lease === null) {
        sendClientError(response, 404, 'active lobby membership not found');
        return;
      }

      response.status(200).json({ lease });
    }),
  );

  router.delete(
    '/lobbies/:code',
    asyncHandler(async (request, response) => {
      const session = await authenticate(request, players);
      if (session === null) {
        sendClientError(response, 401, 'valid session required');
        return;
      }

      const code = readRouteCode(request.params.code);
      if (code === null) {
        sendClientError(response, 400, 'lobby code must be 1-8 characters');
        return;
      }

      const deleted = await lobbies.deleteLobby({
        code,
        hostPlayerId: session.playerId,
      });
      response.status(200).json({ deleted: deleted !== null });
    }),
  );

  return router;
}

async function authenticate(
  request: Request,
  players: PlayerStore,
): Promise<ValidatedSession | null> {
  const rawToken = readBearerToken(request);
  return rawToken === null ? null : players.validateSession(hashSecret(rawToken));
}

function readBearerToken(request: Request): string | null {
  const authorization = request.header('authorization');
  if (authorization === undefined) return null;

  const [scheme, token] = authorization.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || token === undefined || token.length === 0) {
    return null;
  }
  return token;
}

function readRouteCode(value: string | undefined): string | null {
  if (value === undefined || value.length < 1 || value.length > 8) return null;
  return value.toUpperCase();
}

function readStringField(
  value: unknown,
  field: string,
  minimumLength: number,
  maximumLength: number,
): string | null {
  if (!isRecord(value)) return null;
  const fieldValue = value[field];
  if (
    typeof fieldValue !== 'string' ||
    fieldValue.length < minimumLength ||
    fieldValue.length > maximumLength
  ) {
    return null;
  }
  return fieldValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hashSecret(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function createLobbyCode(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}

function asyncHandler(handler: RouteHandler): RequestHandler {
  return (request, response, next) => {
    void handler(request, response, next).catch(next);
  };
}

function sendClientError(response: Response, status: number, message: string): void {
  response.status(status).json({ error: message });
}
