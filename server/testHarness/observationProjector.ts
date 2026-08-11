import { BOARD_COLS, BOARD_HIDDEN_ROWS, BOARD_ROWS, CURTAIN_FROST_ROWS, HOLD_SWAP_CUTOFF_VISIBLE_ROW } from '../../src/constants.js';
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

export function sanitizeEffectId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  const hex = (hash >>> 0).toString(16);
  const prefix = id.replace(/-\d+$/, '');
  return `${prefix}_${hex}`;
}

export function computeEffectsHash(effects?: readonly ObservedEffect[], limited = false): string {
  if (!effects || effects.length === 0) return 'none';
  if (limited) {
    return effects.map((e) => `${e.kind}:${e.id}`).join(';');
  }
  return effects.map((e) => `${e.kind}:${e.id}:${e.expiresAtTick ?? 0}`).join(';');
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
    const rawEffects: ObservedEffect[] = (publicPlayer.activeEffects ?? []).map((e) => ({
      id: e.id,
      kind: e.kind,
      label: e.label,
      expiresAtTick: e.expiresAtTick,
    }));

    if (mode === 'omniscient') {
      const omniEffectsHash = computeEffectsHash(rawEffects, false);
      const context: BotObservationContext = {
        revision: `omni:${playerId}:${omniEffectsHash}`,
        mode: 'omniscient',
        boardVisibility: null,
        poisonVisibility: null,
        effects: rawEffects,
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
    // 3. Absolute server timestamps are converted to relative delta ticks (ticksUntilArrival / ticksRemaining) and arrivalTick is removed.
    // 4. Observation tick is normalized to 0 to prevent raw server loop tick leakage.
    // 5. Effect IDs are sanitized to remove creation tick numbers while retaining unique instance hash for revision invalidation.
    const projectedPlayer: PublicPlayerState = JSON.parse(JSON.stringify(publicPlayer));
    const currentTick = gameState.tick;

    // Mask hidden spawn rows 0..BOARD_HIDDEN_ROWS - 1
    for (let y = 0; y < BOARD_HIDDEN_ROWS; y++) {
      for (let x = 0; x < BOARD_COLS; x++) {
        projectedPlayer.board[y][x] = null;
        if (projectedPlayer.poisonBoard?.[y]) {
          projectedPlayer.poisonBoard[y][x] = 0;
        }
      }
    }

    // Convert absolute garbage arrival ticks to relative ticksUntilArrival (removing arrivalTick)
    projectedPlayer.pendingGarbage = (publicPlayer.pendingGarbage ?? []).map((p) => ({
      lines: p.lines,
      ticksUntilArrival: p.arrivalTick !== undefined ? Math.max(0, p.arrivalTick - currentTick) : p.ticksUntilArrival,
      arrivalTick: undefined,
    }));

    if (projectedPlayer.holdFrozenUntilTick !== undefined) {
      projectedPlayer.holdFrozenUntilTick = Math.max(0, projectedPlayer.holdFrozenUntilTick - currentTick);
    }
    if (projectedPlayer.satelliteDelayUntilTick !== undefined) {
      projectedPlayer.satelliteDelayUntilTick = Math.max(0, projectedPlayer.satelliteDelayUntilTick - currentTick);
    }
    if (projectedPlayer.tectonicShiftNextStepTick !== undefined && projectedPlayer.tectonicShiftNextStepTick !== null) {
      projectedPlayer.tectonicShiftNextStepTick = Math.max(0, projectedPlayer.tectonicShiftNextStepTick - currentTick);
    }
    if (projectedPlayer.lastHardDropTick !== undefined) {
      projectedPlayer.lastHardDropTick = Math.max(0, currentTick - projectedPlayer.lastHardDropTick);
    }

    if (projectedPlayer.poisonSpread) {
      projectedPlayer.poisonSpread = {
        ...projectedPlayer.poisonSpread,
        nextSpreadTick: Math.max(0, projectedPlayer.poisonSpread.nextSpreadTick - currentTick),
      };
    }

    if (projectedPlayer.activeEffects) {
      projectedPlayer.activeEffects = projectedPlayer.activeEffects.map((e) => ({
        ...e,
        id: sanitizeEffectId(e.id),
        expiresAtTick: e.expiresAtTick !== undefined ? Math.max(0, e.expiresAtTick - currentTick) : undefined,
      }));
    }

    const curtainActive = rawEffects.some((e) => e.kind === 'curtain');
    let boardVisibility: BoardVisibility | null = null;
    let poisonVisibility: BoardVisibility | null = null;

    if (curtainActive) {
      const cutoffRow = publicPlayer.swapCutoffRow ?? HOLD_SWAP_CUTOFF_VISIBLE_ROW;
      const frostRows = CURTAIN_FROST_ROWS + (publicPlayer.curtainDefenseLevel ?? 0);
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

    // Normalize effect expiration ticks and sanitize IDs in context
    const normalizedEffects: ObservedEffect[] = rawEffects.map((e) => ({
      ...e,
      id: sanitizeEffectId(e.id),
      expiresAtTick: e.expiresAtTick !== undefined ? Math.max(0, e.expiresAtTick - currentTick) : undefined,
    }));

    const limitedEffectsHash = computeEffectsHash(normalizedEffects, true);
    const visTag = curtainActive ? `curtain-active@${boardVisibility?.maskedRowsStart}` : 'clear';
    const context: BotObservationContext = {
      revision: `limited:${playerId}:${visTag}:${limitedEffectsHash}`,
      mode: 'player-limited',
      boardVisibility,
      poisonVisibility,
      effects: normalizedEffects,
    };

    return {
      tick: 0,
      player: Object.freeze(projectedPlayer),
      context,
    };
  }
}

export const defaultObservationProjector = new StandardObservationProjector();
