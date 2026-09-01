import { createHash, randomBytes } from 'node:crypto';
import { Router, type Request, type RequestHandler, type Response } from 'express';
import type { MatchAssignment } from '../../src/types.js';
import { appendVaryHeaders, createNoStoreMiddleware } from './cors.js';
import type { Database } from './database.js';
import { AnalyticsStore } from './analyticsStore.js';
import {
  isAnalyticsEventName,
  validateAnalyticsProperties,
} from './analyticsPolicy.js';
import {
  createDiscordIdentityVerifier,
  DiscordIdentityError,
  type DiscordIdentityVerifier,
} from './discordIdentity.js';
import { MatchStore } from './matchStore.js';
import { logError, logInfo } from '../observability/logger.js';
import { LobbyStore, QueueStore } from './queueLobbyStore.js';
import { isScopedEnqueueEnabled, validateQueueScopeRequest } from './queueScope.js';
import {
  deriveGuestPlayerId,
  PlayerStore,
  type ValidatedSession,
} from './playerStore.js';
import { isRecordingActive, setRecordingActive } from './recordingControl.js';

type RouteHandler = (
  request: Request,
  response: Response,
  next: (error?: unknown) => void,
) => Promise<void>;

export type ControlPlaneRouterOptions = {
  verifyDiscordIdentity?: DiscordIdentityVerifier;
};

export function createControlPlaneRouter(
  database: Database,
  options: ControlPlaneRouterOptions = {},
): Router {
  const router = Router();
  const players = new PlayerStore(database);
  const verifyDiscordIdentity =
    options.verifyDiscordIdentity ?? createDiscordIdentityVerifier();
  const analytics = new AnalyticsStore(database);
  const queue = new QueueStore(database);
  const lobbies = new LobbyStore(database);

  router.use(createNoStoreMiddleware());
  router.use((_request, response, next) => {
    appendVaryHeaders(response, 'Origin', 'Authorization', 'Idempotency-Key');
    next();
  });

  router.post(
    '/players/guest',
    asyncHandler(async (request, response) => {
      const idempotencyKey = request.header('idempotency-key');
      if (idempotencyKey !== undefined && !isValidIdempotencyKey(idempotencyKey)) {
        sendClientError(response, 400, 'Idempotency-Key must be 1-128 valid characters');
        return;
      }

      const displayName = readStringField(request.body, 'displayName', 1, 32);
      if (displayName === null) {
        sendClientError(response, 400, 'displayName must be 1-32 characters');
        return;
      }

      const player = idempotencyKey === undefined
        ? await players.createGuestPlayer(displayName)
        : await players.createGuestPlayer(displayName, deriveGuestPlayerId(idempotencyKey));
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
    '/players/discord',
    asyncHandler(async (request, response) => {
      const authorizationCode = readStringField(request.body, 'code', 1, 2_048);
      if (authorizationCode === null) {
        sendClientError(response, 400, 'Discord authorization code is required');
        return;
      }

      let profile;
      try {
        profile = await verifyDiscordIdentity(authorizationCode);
      } catch (error: unknown) {
        if (error instanceof DiscordIdentityError) {
          if (error.code === 'DISCORD_ASSERTION_INVALID') {
            sendClientError(response, 401, 'Discord identity could not be verified');
            return;
          }
          if (
            error.code === 'DISCORD_AUTH_NOT_CONFIGURED'
            || error.code === 'DISCORD_PROVIDER_UNAVAILABLE'
          ) {
            sendClientError(response, 503, 'Discord Activity authentication is unavailable');
            return;
          }
        }
        throw error;
      }

      const player = await players.upsertDiscordPlayer(profile);
      if (player.status === 'suspended') {
        sendClientError(response, 403, 'player is suspended');
        return;
      }

      const rawToken = randomBytes(32).toString('hex');
      const session = await players.createSession({
        playerId: player.id,
        tokenHash: hashSecret(rawToken),
        ipAddress: request.ip ?? null,
        userAgent: request.get('user-agent') ?? null,
      });

      response.status(201).json({
        player: {
          id: player.id,
          displayName: player.displayName,
          avatarUrl: player.avatarUrl,
        },
        session: {
          id: session.id,
          expiresAt: session.expiresAt,
          token: rawToken,
        },
      });
    }),
  );

  router.post(
    '/analytics',
    asyncHandler(async (request, response) => {
      const session = await authenticate(request, players);
      if (session === null) {
        sendClientError(response, 401, 'valid session required');
        return;
      }

      const rawEventName = readStringField(request.body, 'eventName', 1, 32);
      const eventName = isAnalyticsEventName(rawEventName) ? rawEventName : null;
      const properties = eventName === null
        ? null
        : validateAnalyticsProperties(eventName, isRecord(request.body) ? request.body.properties : undefined);
      const matchId = readOptionalUuid(request.body, 'matchId');
      if (eventName === null || properties === null || matchId === false) {
        sendClientError(response, 400, 'invalid reliability analytics payload');
        return;
      }

      await analytics.insertReliabilityEvent({
        eventName,
        playerId: session.playerId,
        matchId,
        properties,
      });
      response.status(202).json({ accepted: true });
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

      const resolution = validateQueueScopeRequest(request.body, {
        discordUserId: session.discordUserId,
        scopedEnqueueEnabled: isScopedEnqueueEnabled(),
      });
      if (resolution.reason !== null) {
        sendClientError(response, 400, resolution.reason);
        return;
      }

      const entry = await queue.upsertEntry({
        playerId: session.playerId,
        sessionId: session.sessionId,
        searchScope: resolution.scope.searchScope,
        guildId: resolution.scope.guildId,
      });
      if (entry === null) {
        sendClientError(response, 409, 'player already has a matched queue entry');
        return;
      }

      response.status(200).json({
        entry,
        effectiveScope: resolution.scope,
      });
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

      const cancellation = await queue.cancelSearch(session.playerId);
      response.status(cancellation.status === 'already-assigned' ? 409 : 200).json(cancellation);
    }),
  );

  router.post(
    '/queue/requeue',
    asyncHandler(async (request, response) => {
      const session = await authenticate(request, players);
      if (session === null) {
        sendClientError(response, 401, 'valid session required');
        return;
      }
      const matchId = isRecord(request.body) && typeof request.body.matchId === 'string'
        ? readUuid(request.body.matchId)
        : null;
      if (matchId === null) {
        sendClientError(response, 400, 'match ID is required');
        return;
      }
      const idempotencyKey = request.header('idempotency-key');
      if (idempotencyKey !== undefined && !isValidIdempotencyKey(idempotencyKey)) {
        sendClientError(response, 400, 'Idempotency-Key must be 1-128 valid characters');
        return;
      }

      const hasScope = isRecord(request.body) && request.body.searchScope !== undefined;
      const requestedResolution = hasScope
        ? validateQueueScopeRequest(request.body, {
            discordUserId: session.discordUserId,
            scopedEnqueueEnabled: isScopedEnqueueEnabled(),
          })
        : null;
      if (requestedResolution !== null && requestedResolution.reason !== null) {
        sendClientError(response, 400, requestedResolution.reason);
        return;
      }

      const result = await database.begin(async (transaction) => {
        const terminalMatches = await transaction<{
          status: string;
          player_a_id: string;
          player_b_id: string;
          search_scope: 'global' | 'guild' | 'discord_only';
          guild_id: string | null;
        }[]>`
          SELECT status, player_a_id, player_b_id, search_scope, guild_id
          FROM matches
          WHERE id = ${matchId}
            AND ${session.playerId} IN (player_a_id, player_b_id)
            AND status IN ('ended', 'voided', 'cancelled')
          FOR UPDATE
        `;
        const terminalMatch = terminalMatches[0];
        if (terminalMatch === undefined) return null;

        const scope = requestedResolution?.scope ?? {
          searchScope: terminalMatch.search_scope,
          guildId: terminalMatch.guild_id,
        };
        const opponentId = terminalMatch.player_a_id === session.playerId
          ? terminalMatch.player_b_id
          : terminalMatch.player_a_id;
        const entry = await new QueueStore(transaction).upsertEntry({
          playerId: session.playerId,
          sessionId: session.sessionId,
          searchScope: scope.searchScope,
          guildId: scope.guildId,
          carryAvoidPlayerId: opponentId,
        });
        if (entry === null) return null;
        return { entry, scope };
      });
      if (result === null) {
        response.status(409).json({ error: 'match is not ready to requeue' });
        return;
      }
      response.status(200).json({
        status: 'searching',
        entry: result.entry,
        effectiveScope: result.scope,
      });
    }),
  );

  router.get(
    '/matches/:matchId/outcome',
    asyncHandler(async (request, response) => {
      const session = await authenticate(request, players);
      if (session === null) {
        sendClientError(response, 401, 'valid session required');
        return;
      }
      const matchId = readUuid(request.params.matchId);
      if (matchId === null) {
        sendClientError(response, 400, 'match ID is invalid');
        return;
      }
      const outcomeReason = await new MatchStore(database).findFinalizedOutcome(
        matchId,
        session.playerId,
      );
      if (outcomeReason === null) {
        response.status(404).end();
        return;
      }
      response.status(200).json({ outcomeReason });
    }),
  );

  router.get(
    '/match-assignment',
    asyncHandler(async (request, response) => {
      const session = await authenticate(request, players);
      if (session === null) {
        sendClientError(response, 401, 'valid session required');
        return;
      }

      let assignment: MatchAssignment | null;
      try {
        assignment = await database.begin(async (transaction) => {
          const active = await new MatchStore(transaction).findActiveMatchForPlayer(session.playerId);
          if (active === null) return null;
          const ticket = await new MatchStore(transaction).issueReplacementJoinTicket({
            matchId: active.match.id,
            playerId: session.playerId,
            seat: active.seat,
          });
          return {
            matchId: active.match.id,
            playerId: session.playerId,
            seat: active.seat,
            ticket: ticket.ticket,
            matchSeed: active.match.matchSeed,
            protocolVersion: active.match.protocolVersion,
            ...(active.match.isRepeatPairing ? { isRepeatPairing: true } : {}),
          };
        });
      } catch (error) {
        logError('join_ticket_refresh_failed', error, {
          playerId: session.playerId,
        });
        throw error;
      }

      if (assignment === null) {
        response.status(204).end();
        return;
      }
      logInfo('join_ticket_refreshed', {
        matchId: assignment.matchId,
        playerId: assignment.playerId,
        seat: assignment.seat,
      });
      response.status(200).json(assignment);
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

  router.get(
    '/admin/recording',
    asyncHandler(async (request, response) => {
      if (!authenticateAdmin(request)) {
        sendClientError(response, 401, 'admin authorization required');
        return;
      }
      response.status(200).json({ enabled: isRecordingActive() });
    }),
  );

  router.post(
    '/admin/recording',
    asyncHandler(async (request, response) => {
      if (!authenticateAdmin(request)) {
        sendClientError(response, 401, 'admin authorization required');
        return;
      }

      if (!isRecord(request.body) || typeof request.body.enabled !== 'boolean') {
        sendClientError(response, 400, 'enabled boolean field is required');
        return;
      }

      setRecordingActive(request.body.enabled);
      response.status(200).json({ enabled: isRecordingActive() });
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

function authenticateAdmin(request: Request): boolean {
  const adminSecret = process.env.ADMIN_SECRET?.trim();
  if (!adminSecret) return false;

  const headerSecret = request.header('x-admin-secret')?.trim();
  if (headerSecret === adminSecret) return true;

  const bearerSecret = readBearerToken(request);
  if (bearerSecret === adminSecret) return true;

  return false;
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

function isValidIdempotencyKey(value: string): boolean {
  return (
    value.length > 0
    && value.length <= 128
    && value.trim().length > 0
    && !/[\u0000-\u001f\u007f]/u.test(value)
  );
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

function readOptionalUuid(value: unknown, field: string): string | null | false {
  if (!isRecord(value) || value[field] === undefined) return null;
  const fieldValue = value[field];
  return typeof fieldValue === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(fieldValue)
    ? fieldValue
    : false;
}

function readUuid(value: string | undefined): string | null {
  return value !== undefined
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
    ? value
    : null;
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
