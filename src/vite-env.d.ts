/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** WebSocket server origin (e.g. https://game-api.example.com:10106). */
  readonly VITE_GAME_SERVER_URL?: string;
  /** Same hostname as the page, custom port (e.g. 10106) when URL is not set in game-config. */
  readonly VITE_GAME_SERVER_PORT?: string;
  /** Optional hostname override for VITE_GAME_SERVER_PORT (default: page hostname). */
  readonly VITE_GAME_SERVER_HOST?: string;
  /** Public base path for assets (set in vite.config via VITE_BASE_URL). */
  readonly BASE_URL: string;
  /** Opt-in dev/QA UI for non-local builds (e.g. internal staging). */
  readonly VITE_DEV_TOOLS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
