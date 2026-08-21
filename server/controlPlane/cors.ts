import type { RequestHandler, Response } from 'express';

export type CorsOrigin = '*' | Array<string | RegExp>;

const pagesOriginPattern = /^https:\/\/[a-z0-9-]+\.pages\.dev$/i;
const discordOriginPattern = /^https:\/\/[a-z0-9-]+\.discordsays\.com$/i;
const localhostOriginPattern = /^http:\/\/localhost(?::\d+)?$/i;

export function resolveCorsOrigins(mode: 'development' | 'production'): CorsOrigin {
  if (mode === 'development') return '*';

  const explicitOrigins = parseExplicitOrigins(process.env.CORS_ALLOWED_ORIGINS);
  const origins: Array<string | RegExp> = [
    discordOriginPattern,
    ...(explicitOrigins.length > 0 ? explicitOrigins : [pagesOriginPattern]),
  ];

  if (process.env.ALLOW_LOCALHOST === 'true') {
    origins.push(localhostOriginPattern);
  }

  return origins;
}

export function createHttpCorsMiddleware(mode: 'development' | 'production'): RequestHandler {
  const origins = resolveCorsOrigins(mode);

  return (request, response, next) => {
    const requestOrigin = request.header('origin');
    if (requestOrigin === undefined) {
      next();
      return;
    }

    if (!isAllowedOrigin(origins, requestOrigin)) {
      response.status(403).type('text/plain').send('origin not allowed');
      return;
    }

    response.setHeader('Access-Control-Allow-Origin', origins === '*' ? '*' : requestOrigin);
    appendVaryHeaders(response, 'Origin');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    response.setHeader(
      'Access-Control-Allow-Headers',
      'Authorization, Content-Type, Idempotency-Key',
    );

    if (request.method === 'OPTIONS') {
      response.status(204).end();
      return;
    }

    next();
  };
}

export function createNoStoreMiddleware(): RequestHandler {
  return (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('Expires', '0');
    next();
  };
}

export function appendVaryHeaders(response: Response, ...headers: string[]): void {
  const current = response.getHeader('Vary');
  const values = current === undefined ? [] : String(current).split(',');
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const value of [...values, ...headers]) {
    const trimmed = value.trim();
    if (trimmed.length === 0 || seen.has(trimmed.toLowerCase())) continue;
    seen.add(trimmed.toLowerCase());
    merged.push(trimmed);
  }

  response.setHeader('Vary', merged.join(', '));
}

function parseExplicitOrigins(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function isAllowedOrigin(origins: CorsOrigin, requestOrigin: string): boolean {
  if (origins === '*') return true;
  return origins.some((origin) =>
    typeof origin === 'string' ? origin === requestOrigin : origin.test(requestOrigin),
  );
}
