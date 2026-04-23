import { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { ActionType, GameState, InputState, MatchEvent } from '../types';

type GameRuntimeConfig = {
  /** Full origin, e.g. https://api.example.com:10106 — highest priority when non-empty */
  gameServerUrl?: string;
  /** Same host as the page but different port (when gameServerUrl is empty) */
  gameServerPort?: number;
  /** Override hostname for port-based URL; empty = window.location.hostname */
  gameServerHost?: string;
};

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

export const useGameSocket = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [lastMatchEvent, setLastMatchEvent] = useState<MatchEvent | null>(null);

  useEffect(() => {
    let cancelled = false;
    let sock: Socket | null = null;

    (async () => {
      const url = await resolveGameServerUrl();
      if (cancelled) return;
      console.log(`[Socket] Initializing connection to resolved URL: ${url}`);
      sock = io(url, {
        transports: ['websocket', 'polling'],
      });
      setSocket(sock);

      sock.on('connect', () => {
        console.log(`[Socket] Connected successfully with ID: ${sock?.id}`);
        setMyId(sock?.id || null);
      });

      sock.on('connect_error', (error) => {
        console.error('[Socket] Connection error:', error);
      });

      sock.on('gameState', (state: GameState) => {
        setGameState(structuredClone(state) as GameState);
      });
      sock.on('matchEvent', (evt: MatchEvent) => {
        setLastMatchEvent(evt);
      });
    })();

    return () => {
      cancelled = true;
      sock?.close();
    };
  }, []);

  const sendInputState = useCallback((input: InputState) => {
    socket?.emit('inputState', input);
  }, [socket]);

  const sendAction = useCallback((action: ActionType) => {
    socket?.emit('action', action);
  }, [socket]);

  return {
    socket,
    gameState,
    myId,
    lastMatchEvent,
    sendInputState,
    sendAction
  };
};
