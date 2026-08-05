import type { GameManager } from '../GameManager.js';
import type { PlayerFixture } from './fixtures.js';

export interface DevSmokeConfig {
  enabled?: boolean;
  soloDummy?: boolean;
  playerFixtures?: Record<string, PlayerFixture>;
}

export function isDevSmokeEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  return process.env.DEV_SMOKE_CONTROLS === 'true' || process.env.NODE_ENV === 'development';
}

/** Development-only helper for staging test scenarios on a GameManager instance. */
export function applyDevSmokeScenario(gm: GameManager, config: DevSmokeConfig): boolean {
  if (!isDevSmokeEnabled()) {
    console.warn('[SmokeControl] Dev smoke controls ignored in production mode.');
    return false;
  }

  const internal = gm as unknown as {
    gameState: {
      status: string;
      players: Record<string, any>;
    };
  };

  if (config.playerFixtures) {
    for (const [id, fixture] of Object.entries(config.playerFixtures)) {
      if (internal.gameState.players[id]) {
        fixture(internal.gameState.players[id]);
      }
    }
  }

  return true;
}
