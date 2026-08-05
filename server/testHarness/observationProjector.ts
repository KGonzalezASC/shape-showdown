import { BOARD_COLS, BOARD_HIDDEN_ROWS, BOARD_ROWS, CURTAIN_FROST_ROWS } from '../../src/constants.js';
import {
  PublicPlayerState,
  toPublicPlayerState,
} from '../../src/state/publicSnapshots.js';
import type { FieldEffectKind, GameState } from '../../src/types.js';

export type ObservationMode = 'omniscient' | 'player-limited';

export interface BoardVisibility {
  cutoffRow: number;
  frostRows: number;
  maskedRowsStart: number;
}

export interface ObservedEffect {
  id: string;
  kind: FieldEffectKind;
  label: string;
  expiresAtTick?: number;
}

export interface BotObservationContext {
  revision: string;
  mode: ObservationMode;
  boardVisibility: BoardVisibility | null;
  poisonVisibility: BoardVisibility | null;
  effects: readonly ObservedEffect[];
}

export interface PlayerObservation {
  tick: number;
  player: PublicPlayerState;
  context: BotObservationContext;
}

export interface ObservationProjector {
  project(
    gameState: GameState,
    playerId: string,
    mode: ObservationMode,
  ): PlayerObservation;
}

export function computeEffectsHash(effects?: readonly ObservedEffect[]): string {
  if (!effects || effects.length === 0) return 'none';
  return effects.map((e) => `${e.kind}:${e.expiresAtTick ?? 0}`).join(';');
}

export class StandardObservationProjector implements ObservationProjector {
  project(
    gameState: GameState,
    playerId: string,
    mode: ObservationMode,
  ): PlayerObservation {
    const rawPlayer = gameState.players[playerId];
    if (!rawPlayer) {
      throw new Error(`Player ${playerId} not found in gameState`);
    }

    const publicPlayer = toPublicPlayerState(rawPlayer);
    const effects: ObservedEffect[] = (publicPlayer.activeEffects ?? []).map((e) => ({
      id: e.id,
      kind: e.kind,
      label: e.label,
      expiresAtTick: e.expiresAtTick,
    }));

    const effectsHash = computeEffectsHash(effects);

    if (mode === 'omniscient') {
      const context: BotObservationContext = {
        revision: `omni:${playerId}:${effectsHash}`,
        mode: 'omniscient',
        boardVisibility: null,
        poisonVisibility: null,
        effects,
      };

      return {
        tick: gameState.tick,
        player: Object.freeze(JSON.parse(JSON.stringify(publicPlayer))),
        context,
      };
    }

    // Player-limited mode:
    // 1. Hidden spawn rows (0..BOARD_HIDDEN_ROWS-1) are ALWAYS masked for human-facing observation.
    // 2. If Curtain is active, mask blackout rows starting at (BOARD_HIDDEN_ROWS + cutoffRow + CURTAIN_FROST_ROWS).
    const projectedPlayer: PublicPlayerState = JSON.parse(JSON.stringify(publicPlayer));

    // Mask hidden spawn rows 0..BOARD_HIDDEN_ROWS - 1
    for (let y = 0; y < BOARD_HIDDEN_ROWS; y++) {
      for (let x = 0; x < BOARD_COLS; x++) {
        projectedPlayer.board[y][x] = null;
        if (projectedPlayer.poisonBoard?.[y]) {
          projectedPlayer.poisonBoard[y][x] = 0;
        }
      }
    }

    const curtainActive = effects.some((e) => e.kind === 'curtain');
    let boardVisibility: BoardVisibility | null = null;
    let poisonVisibility: BoardVisibility | null = null;

    if (curtainActive) {
      const cutoffRow = publicPlayer.swapCutoffRow ?? (BOARD_ROWS - BOARD_HIDDEN_ROWS - 10);
      const frostRows = CURTAIN_FROST_ROWS;
      const maskedRowsStart = Math.min(BOARD_ROWS, BOARD_HIDDEN_ROWS + cutoffRow + frostRows);

      boardVisibility = { cutoffRow, frostRows, maskedRowsStart };
      poisonVisibility = { cutoffRow, frostRows, maskedRowsStart };

      // Mask board rows below curtain frost band
      for (let y = maskedRowsStart; y < BOARD_ROWS; y++) {
        for (let x = 0; x < BOARD_COLS; x++) {
          projectedPlayer.board[y][x] = null;
          if (projectedPlayer.poisonBoard?.[y]) {
            projectedPlayer.poisonBoard[y][x] = 0;
          }
        }
      }
    }

    const visTag = curtainActive ? `curtain-active@${boardVisibility?.maskedRowsStart}` : 'clear';
    const context: BotObservationContext = {
      revision: `limited:${playerId}:${visTag}:${effectsHash}`,
      mode: 'player-limited',
      boardVisibility,
      poisonVisibility,
      effects,
    };

    return {
      tick: gameState.tick,
      player: Object.freeze(projectedPlayer),
      context,
    };
  }
}

export const defaultObservationProjector = new StandardObservationProjector();
