import {
  GARBAGE_ARRIVAL_DELAY_TICKS,
  SATELLITE_DURATION_TICKS,
} from '../../constants.js';
import {
  applyBomberToBuyer,
  armSatelliteToBuyer,
  makePlayer,
  startTectonicShift,
  tryActivateSatellite,
} from './engine.js';
import { matchStep, type MatchTickResult } from './matchStep.js';
import {
  assertRuntimeCommands,
  PUZZLE_TRACE_LIMITS,
  type PuzzleRuntimeCommand,
} from './puzzleCommands.js';
import {
  applyScriptedShopAttack,
  type ScriptedShopAttackId,
} from './shop.js';
import {
  ensureWildcardIncomingEffect,
  pushFieldEffect,
} from '../../shop/fieldEffects.js';
import {
  createPlayerRngChannels,
  type RngChannels,
} from '../../rng.js';
import type {
  ActionType,
  GameState,
  MatchEvent,
  PlayerState,
} from '../../types.js';
import type {
  PublishedPuzzleHazardKindV1,
  PublishedPuzzleParamsV1,
  PublishedPuzzlePayloadV1,
  PublishedPuzzleTimelineEventV1,
} from '../publishedPuzzle.js';

export type PuzzleRuntimeStatus =
  | 'playing'
  | 'solved'
  | 'top-out'
  | 'incomplete'
  | 'timeout';

export interface PuzzleRuntimeConfig {
  payload: PublishedPuzzlePayloadV1;
  /** Stable seed used for garbage/effect channels and the runtime snapshot. */
  seed?: number;
  /** Injected channels make server replay and browser playback use the same RNG. */
  rngChannels?: RngChannels;
  /** Maximum authoritative ticks before the attempt becomes a timeout. */
  maxTicks?: number;
}

export interface PuzzleRuntimeState {
  readonly payload: PublishedPuzzlePayloadV1;
  readonly maxTicks: number;
  readonly enableShop: false;
  gameState: GameState;
  rngChannels: RngChannels;
  timeline: readonly PublishedPuzzleTimelineEventV1[];
  timelineIndex: number;
  pieceTimeline: readonly PublishedPuzzleTimelineEventV1[];
  pieceTimelineIndex: number;
  piecesPlaced: number;
  status: PuzzleRuntimeStatus;
  deferredWildcards: PublishedPuzzleParamsV1[];
  preparedTick: number | null;
}

export interface PuzzleRuntimeResult {
  status: PuzzleRuntimeStatus;
  solved: boolean;
  topOut: boolean;
  ticksUsed: number;
  piecesUsed: number;
  linesCleared: number;
  perfectClear: boolean;
  score: number;
}

export interface PuzzleRuntimeSnapshot extends PuzzleRuntimeResult {
  gameState: GameState;
}

export interface PuzzleRuntimeTransition {
  state: PuzzleRuntimeState;
  events: MatchEvent[];
  result: PuzzleRuntimeResult;
}

export function stableSeedForPuzzle(id: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash | 0;
}

function assertMaxTicks(maxTicks: number): void {
  if (!Number.isSafeInteger(maxTicks) || maxTicks < 1) {
    throw new Error(`puzzle runtime maxTicks must be a positive safe integer, got ${maxTicks}`);
  }
}

function sortTimeline(
  timeline: readonly PublishedPuzzleTimelineEventV1[],
): PublishedPuzzleTimelineEventV1[] {
  return [...timeline].sort((left, right) => {
    if (left.kind === 'atTick' && right.kind === 'atTick') {
      return left.tick - right.tick || left.hazard.localeCompare(right.hazard);
    }
    if (left.kind === 'afterPieces' && right.kind === 'afterPieces') {
      return left.afterPieces - right.afterPieces || left.hazard.localeCompare(right.hazard);
    }
    return left.kind === 'atTick' ? -1 : 1;
  });
}

function cloneGameState(gameState: GameState): GameState {
  return structuredClone(gameState);
}

function playerFor(state: PuzzleRuntimeState): PlayerState {
  const player = state.gameState.players.puzzle;
  if (!player) throw new Error('puzzle runtime state has no puzzle player');
  return player;
}

function applyInputState(player: PlayerState, inputState: PlayerState['inputState']): void {
  player.inputState = {
    left: inputState.left,
    right: inputState.right,
    softDrop: inputState.softDrop,
  };
}

function applyRuntimeCommand(player: PlayerState, command: PuzzleRuntimeCommand): void {
  if (command.kind === 'input') {
    applyInputState(player, command.inputState);
    return;
  }
  player.actionQueue.push(command.action);
}

function paramsRecord(
  params: PublishedPuzzleParamsV1 | undefined,
): Readonly<Record<string, unknown>> {
  return params ?? {};
}

function numberParam(
  params: PublishedPuzzleParamsV1 | undefined,
  key: string,
): number | undefined {
  const value = params?.[key];
  return typeof value === 'number' ? value : undefined;
}

function scriptedAttackForHazard(
  hazard: Exclude<PublishedPuzzleHazardKindV1, 'bomber' | 'garbage' | 'satellite' | 'tectonic'>,
): ScriptedShopAttackId {
  switch (hazard) {
    case 'poison':
      return 'elixir-pulse';
    case 'storage-poison':
      return 'storage-toxin';
    case 'retrim':
      return 'retrim';
    case 'purge':
      return 'vortex-step';
    case 'curtain':
      return 'curtain';
    case 'freeze':
      return 'frost-shift';
    case 'magnet':
      return 'gravity-lure';
    case 'snag':
      return 'fortify-frame';
    case 'sticky':
      return 'quickstep-clock';
    case 'wildcard':
      return 'wildcard-four';
    default: {
      const _exhaustive: never = hazard;
      throw new Error(`Unsupported scripted puzzle hazard: ${_exhaustive}`);
    }
  }
}

/**
 * Apply one published timeline hazard to the puzzle player. These effects are
 * the same engine effects used by multiplayer shop handlers; no server-only
 * purchase or transport code is involved here.
 */
function applyHazard(
  state: PuzzleRuntimeState,
  hazard: PublishedPuzzleHazardKindV1,
  params: PublishedPuzzleParamsV1 | undefined,
): boolean {
  const player = playerFor(state);
  const tick = state.gameState.tick;
  switch (hazard) {
    case 'bomber':
      applyBomberToBuyer(player);
      pushFieldEffect(player, 'bomber', tick, 'Bomber', '💣', tick + 240);
      return true;
    case 'garbage': {
      const lines = numberParam(params, 'lines') ?? 1;
      const delayTicks = numberParam(params, 'delayTicks') ?? GARBAGE_ARRIVAL_DELAY_TICKS;
      player.pendingGarbage.push({ lines, arrivalTick: tick + delayTicks });
      tryActivateSatellite(player, tick);
      return true;
    }
    case 'satellite': {
      armSatelliteToBuyer(player, tick);
      const activated = (player.satelliteDelayUntilTick ?? 0) > tick;
      pushFieldEffect(
        player,
        'satellite',
        tick,
        activated ? 'Satellite' : 'Satellite armed',
        '🛰️',
        activated ? player.satelliteDelayUntilTick : tick + SATELLITE_DURATION_TICKS,
      );
      return true;
    }
    case 'tectonic':
      startTectonicShift(player, tick);
      pushFieldEffect(player, 'tectonic-shift', tick, 'Tectonic Shift', '🪐', tick + 360);
      return true;
    case 'wildcard': {
      const applied = applyScriptedShopAttack(
        'wildcard-four',
        player,
        tick,
        paramsRecord(params),
      );
      if (!applied) {
        state.deferredWildcards.push(params ?? {});
        ensureWildcardIncomingEffect(player, tick);
      }
      return applied;
    }
    default:
      return applyScriptedShopAttack(
        scriptedAttackForHazard(hazard),
        player,
        tick,
        paramsRecord(params),
      );
  }
}

function applyDueTimelineHazards(state: PuzzleRuntimeState): void {
  while (state.timelineIndex < state.timeline.length) {
    const event = state.timeline[state.timelineIndex];
    if (event === undefined || event.kind !== 'atTick' || event.tick > state.gameState.tick) break;
    state.timelineIndex += 1;
    applyHazard(state, event.hazard, event.params);
  }
}

function retryDeferredWildcards(state: PuzzleRuntimeState): void {
  if (state.deferredWildcards.length === 0) return;
  const player = playerFor(state);
  const remaining: PublishedPuzzleParamsV1[] = [];
  for (const params of state.deferredWildcards) {
    if (!applyScriptedShopAttack('wildcard-four', player, state.gameState.tick, params)) {
      remaining.push(params);
      ensureWildcardIncomingEffect(player, state.gameState.tick);
    }
  }
  state.deferredWildcards = remaining;
}

function applyDuePieceHazards(state: PuzzleRuntimeState): void {
  while (state.pieceTimelineIndex < state.pieceTimeline.length) {
    const event = state.pieceTimeline[state.pieceTimelineIndex];
    if (
      event === undefined
      || event.kind !== 'afterPieces'
      || event.afterPieces > state.piecesPlaced
    ) break;
    state.pieceTimelineIndex += 1;
    applyHazard(state, event.hazard, event.params);
  }
}

function goalReached(state: PuzzleRuntimeState): boolean {
  const player = playerFor(state);
  switch (state.payload.goal.kind) {
    case 'garbage-clear':
      return !player.board.some((row) => row.some((cell) => cell === 'G'));
    case 'perfect-clear':
      return player.board.every((row) => row.every((cell) => cell === null));
    case 'survive':
      return state.gameState.tick >= state.payload.goal.ticks;
    case 'clear-lines':
      return player.linesCleared >= state.payload.goal.lines;
    case 'survive-clear':
      return state.gameState.tick >= state.payload.goal.ticks
        && player.linesCleared >= state.payload.goal.lines;
  }
}

function finiteSourceExhausted(state: PuzzleRuntimeState): boolean {
  const player = playerFor(state);
  return player.finitePieceSourceExhausted === true
    && player.activePiece === null
    && player.nextQueue.length === 0;
}

function resultFor(state: PuzzleRuntimeState): PuzzleRuntimeResult {
  const player = playerFor(state);
  const perfectClear = player.board.every((row) => row.every((cell) => cell === null));
  return {
    status: state.status,
    solved: state.status === 'solved',
    topOut: state.status === 'top-out',
    ticksUsed: state.gameState.tick,
    piecesUsed: state.piecesPlaced,
    linesCleared: player.linesCleared,
    perfectClear,
    score: player.score,
  };
}

function markTerminal(state: PuzzleRuntimeState, status: Exclude<PuzzleRuntimeStatus, 'playing'>): void {
  state.status = status;
  state.gameState.status = 'ended';
}

function updateTerminalStatus(state: PuzzleRuntimeState, step: MatchTickResult): void {
  const player = playerFor(state);
  if (step.matchEnded || step.stepResults.puzzle?.topOut || player.topOut) {
    markTerminal(state, 'top-out');
    return;
  }

  if (goalReached(state)) {
    markTerminal(state, 'solved');
    return;
  }

  if (finiteSourceExhausted(state)) {
    markTerminal(state, 'incomplete');
    return;
  }

  if (state.gameState.tick >= state.maxTicks) {
    markTerminal(state, 'timeout');
  }
}

function makeInitialPlayer(
  payload: PublishedPuzzlePayloadV1,
  rngChannels: RngChannels,
): PlayerState {
  const player = makePlayer('puzzle', rngChannels);
  const [firstPiece, ...remainingPieces] = payload.finitePieceSequence;
  if (firstPiece === undefined || player.activePiece === null) {
    throw new Error('published puzzle must provide an initial active piece');
  }

  player.board = payload.initialBoard.map((row) => [...row]);
  player.activePiece = { ...player.activePiece, type: firstPiece };
  player.nextQueue = [...remainingPieces];
  player.bag = [];
  // The queue is the complete finite source. The engine must never append a
  // seeded continuation after the published sequence runs out.
  player.finitePieceSourceExhausted = true;
  if (!payload.allowedMechanics.allowHold) {
    player.canHold = false;
    player.swapCutoffRow = 0;
  }
  return player;
}

export function createPuzzleRuntimeState(config: PuzzleRuntimeConfig): PuzzleRuntimeState {
  const maxTicks = config.maxTicks ?? PUZZLE_TRACE_LIMITS.maxTicks;
  assertMaxTicks(maxTicks);
  const seed = config.seed ?? stableSeedForPuzzle(config.payload.id);
  const rngChannels = config.rngChannels ?? createPlayerRngChannels(seed, 'puzzle');
  const player = makeInitialPlayer(config.payload, rngChannels);
  const timeline = sortTimeline(
    config.payload.timeline.filter((event) => event.kind === 'atTick'),
  );
  const pieceTimeline = sortTimeline(
    config.payload.timeline.filter((event) => event.kind === 'afterPieces'),
  );

  return {
    payload: config.payload,
    maxTicks,
    enableShop: false,
    gameState: {
      players: { puzzle: player },
      status: 'playing',
      countdown: 0,
      winnerId: null,
      tick: 0,
      seed,
    },
    rngChannels,
    timeline,
    timelineIndex: 0,
    pieceTimeline,
    pieceTimelineIndex: 0,
    piecesPlaced: 0,
    status: 'playing',
    deferredWildcards: [],
    preparedTick: null,
  };
}

/**
 * Apply hazards scheduled for the current tick before an observation is built.
 * The operation is idempotent so server-side drivers can observe the same state
 * that a direct browser/verifier transition would use.
 */
export function preparePuzzleTick(state: PuzzleRuntimeState): void {
  if (state.status !== 'playing' || state.preparedTick === state.gameState.tick) return;
  applyDueTimelineHazards(state);
  retryDeferredWildcards(state);
  state.preparedTick = state.gameState.tick;
}

/**
 * Advance exactly one authoritative puzzle tick. Commands are applied in the
 * supplied order, then the shared match step advances gravity and locking.
 */
export function advancePuzzle(
  state: PuzzleRuntimeState,
  commandsForTick: readonly PuzzleRuntimeCommand[],
  rngChannels: RngChannels,
): PuzzleRuntimeTransition {
  assertRuntimeCommands(commandsForTick);
  state.rngChannels = rngChannels;
  if (state.status !== 'playing') {
    return { state, events: [], result: resultFor(state) };
  }

  preparePuzzleTick(state);

  const player = playerFor(state);
  for (const command of commandsForTick) {
    applyRuntimeCommand(player, command);
  }

  const step = matchStep(
    state.gameState,
    { puzzle: rngChannels },
    {
      enableShop: false,
      enableGarbage: false,
      finitePieceSource: true,
    },
  );
  const events = [...step.events];

  if (step.stepResults.puzzle?.locked) {
    state.piecesPlaced += 1;
    if (!state.payload.allowedMechanics.allowHold) {
      player.canHold = false;
      player.swapCutoffRow = 0;
    }
    applyDuePieceHazards(state);
  }

  state.preparedTick = null;
  updateTerminalStatus(state, step);
  return { state, events, result: resultFor(state) };
}

/** Return a detached presentation/replay snapshot of the current runtime. */
export function snapshotPuzzle(state: PuzzleRuntimeState): PuzzleRuntimeSnapshot {
  return {
    ...resultFor(state),
    gameState: cloneGameState(state.gameState),
  };
}

/** Finish an abandoned or otherwise still-running attempt as incomplete. */
export function finishPuzzle(state: PuzzleRuntimeState): PuzzleRuntimeResult {
  if (state.status === 'playing') markTerminal(state, 'incomplete');
  return resultFor(state);
}

export type { MatchTickResult };
export type { ActionType };
