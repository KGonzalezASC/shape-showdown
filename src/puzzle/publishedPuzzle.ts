import { BOARD_COLS, BOARD_ROWS } from '../constants.js';
import type { CellValue, ShapeType } from '../types.js';

/** Version of the player-safe puzzle content schema. */
export const PUBLISHED_PUZZLE_SCHEMA_VERSION = 1;

/** Puzzle runtime label. It is independent from the multiplayer protocol version. */
export const PUZZLE_RUNTIME_VERSION = 'puzzle-runtime-v1';

const PUZZLE_CONTENT_HASH_PREFIX = 'shape-showdown:puzzle:v1\0';
const PUZZLE_TRACE_HASH_PREFIX = 'shape-showdown:puzzle-trace:v1\0';
const PUZZLE_PACK_HASH_PREFIX = 'shape-showdown:puzzle-pack:v1\0';
const PUZZLE_STATE_HASH_PREFIX = 'shape-showdown:puzzle-state:v1\0';

export type NonEmptyReadonlyArray<T> = readonly [T, ...T[]];

export interface PublishedPuzzleObjectV1 {
  readonly [key: string]: PublishedPuzzleValueV1;
}

export type PublishedPuzzleValueV1 =
  | null
  | boolean
  | string
  | number
  | readonly PublishedPuzzleValueV1[]
  | PublishedPuzzleObjectV1;

export type PublishedPuzzleParamsV1 = PublishedPuzzleObjectV1;

export type PublishedPuzzleHazardKindV1 =
  | 'poison'
  | 'storage-poison'
  | 'retrim'
  | 'purge'
  | 'curtain'
  | 'freeze'
  | 'magnet'
  | 'snag'
  | 'sticky'
  | 'bomber'
  | 'wildcard'
  | 'tectonic'
  | 'garbage'
  | 'satellite';

/** Timeline entries have one scheduling mode and one hazard payload. */
export type PublishedPuzzleTimelineEventV1 =
  | {
      kind: 'atTick';
      tick: number;
      hazard: PublishedPuzzleHazardKindV1;
      params?: PublishedPuzzleParamsV1;
    }
  | {
      kind: 'afterPieces';
      afterPieces: number;
      hazard: PublishedPuzzleHazardKindV1;
      params?: PublishedPuzzleParamsV1;
    };

export type PublishedPuzzleGoalV1 =
  | { kind: 'garbage-clear'; maxPieces?: number }
  | { kind: 'perfect-clear'; maxPieces?: number }
  | { kind: 'survive'; ticks: number }
  | { kind: 'clear-lines'; lines: number }
  | { kind: 'survive-clear'; ticks: number; lines: number };

export type PublishedPuzzleBenchmarkMetricV1 = 'score' | 'ticks' | 'pieces';

export interface PublishedPuzzleBenchmarkPolicyV1 {
  metric: PublishedPuzzleBenchmarkMetricV1;
  direction: 'maximize' | 'minimize';
  tieBreakers?: readonly {
    metric: PublishedPuzzleBenchmarkMetricV1;
    direction: 'maximize' | 'minimize';
  }[];
}

export type PublishedPuzzleVisibilityPolicyV1 = 'hidden' | 'partial' | 'revealed';

export interface PublishedPuzzlePayloadV1 {
  id: string;
  name: string;
  description?: string;
  initialBoard: readonly (readonly CellValue[])[];
  finitePieceSequence: NonEmptyReadonlyArray<ShapeType>;
  goal: PublishedPuzzleGoalV1;
  allowedMechanics: {
    allowHold: boolean;
  };
  timeline: readonly PublishedPuzzleTimelineEventV1[];
  visibilityPolicy: PublishedPuzzleVisibilityPolicyV1;
  benchmark: PublishedPuzzleBenchmarkPolicyV1;
}

export interface PublishedPuzzleBaselineV1 {
  score: number;
  ticksUsed: number;
  piecesUsed: number;
  linesCleared: number;
}

/** A published puzzle contains only immutable player-facing content and metrics. */
export interface PublishedPuzzleV1 {
  payload: PublishedPuzzlePayloadV1;
  contentHash: string;
  publicBaseline: PublishedPuzzleBaselineV1;
}

export interface PublishedPuzzlePackV1 {
  schemaVersion: 1;
  id: string;
  puzzles: NonEmptyReadonlyArray<PublishedPuzzleV1>;
}

export interface PublishedPuzzlePackRefV1 {
  id: string;
  url: string;
  sha256: string;
  byteLength: number;
  puzzleIds: NonEmptyReadonlyArray<string>;
}

export interface PublishedPuzzleManifestV1 {
  schemaVersion: 1;
  puzzleRuntimeVersion: string;
  releaseId: string;
  packs: readonly PublishedPuzzlePackRefV1[];
}

export type PuzzleInputStateV1 = {
  left: boolean;
  right: boolean;
  softDrop: boolean;
};

export type PuzzleActionV1 = 'rotateCW' | 'rotateCCW' | 'hardDrop' | 'hold';

export type PuzzleCommandV1 =
  | {
      tick: number;
      orderWithinTick: number;
      kind: 'input';
      left: boolean;
      right: boolean;
      softDrop: boolean;
    }
  | {
      tick: number;
      orderWithinTick: number;
      kind: 'action';
      action: PuzzleActionV1;
    };

export type PuzzleAttemptStatusV1 = 'solved' | 'top-out' | 'incomplete' | 'timeout';

export interface PuzzleClaimedOutcomeV1 {
  status: PuzzleAttemptStatusV1;
  ticksUsed: number;
  piecesUsed: number;
  linesCleared: number;
  score: number;
  finalStateHash: string;
}

export interface PuzzleAttemptGrantV1 {
  grantId: string;
  puzzleId: string;
  contentHash: string;
  puzzleRuntimeVersion: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
}

export interface PuzzleAttemptEnvelopeV1 {
  schemaVersion: 1;
  puzzleRuntimeVersion: string;
  puzzleId: string;
  contentHash: string;
  attemptGrantId: string | null;
  commands: readonly PuzzleCommandV1[];
  claimedOutcome: PuzzleClaimedOutcomeV1;
  traceHash: string;
}

export type PuzzleVerificationRejectReasonV1 =
  | 'UNKNOWN_CONTENT'
  | 'VERSION_MISMATCH'
  | 'INVALID_COMMAND'
  | 'TRACE_LIMIT'
  | 'OUTCOME_MISMATCH'
  | 'GRANT_REPLAYED';

export interface PuzzleVerificationAcceptedV1 {
  accepted: true;
  reason: 'ACCEPTED';
  authoritativeOutcome: PuzzleClaimedOutcomeV1;
  traceHash: string;
  verifierVersion: string;
}

export interface PuzzleVerificationRejectedV1 {
  accepted: false;
  reason: PuzzleVerificationRejectReasonV1;
  authoritativeOutcome: null;
  traceHash: string;
  verifierVersion: string;
}

export type PuzzleVerificationVerdictV1 =
  | PuzzleVerificationAcceptedV1
  | PuzzleVerificationRejectedV1;

type PlainRecord = Record<string, unknown>;

function isPlainRecord(value: unknown): value is PlainRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requiredField(record: PlainRecord, key: string, path: string): unknown {
  if (!Object.hasOwn(record, key)) {
    throw new Error(`${path}.${key} is required`);
  }
  return record[key];
}

function optionalField(record: PlainRecord, key: string): unknown {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

function assertExactKeys(
  record: PlainRecord,
  expectedKeys: readonly string[],
  path: string,
): void {
  const actual = Object.keys(record).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(
      `${path} has unexpected fields; expected ${expected.join(', ')}, got ${actual.join(', ')}`,
    );
  }
}

function parseString(value: unknown, path: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) {
    throw new Error(`${path} must be a${allowEmpty ? ' ' : ' non-empty '}string`);
  }
  return value;
}

function parseSafeInteger(value: unknown, path: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${path} must be a safe integer >= ${minimum}`);
  }
  return value;
}

function parseHash(value: unknown, path: string): string {
  const hash = parseString(value, path);
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    throw new Error(`${path} must be a lowercase SHA-256 hex digest`);
  }
  return hash;
}

function parseBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${path} must be a boolean`);
  return value;
}

function parseArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value;
}

function parseShape(value: unknown, path: string): ShapeType {
  switch (value) {
    case 'I':
    case 'J':
    case 'L':
    case 'O':
    case 'S':
    case 'T':
    case 'Z':
      return value;
    default:
      throw new Error(`${path} must be a known shape type`);
  }
}

function parseCellValue(value: unknown, path: string): CellValue {
  if (value === null) return null;
  if (value === 'G') return 'G';
  if (value === 'W') return 'W';
  return parseShape(value, path);
}

function parseParams(value: unknown, path: string): PublishedPuzzleParamsV1 {
  if (!isPlainRecord(value)) throw new Error(`${path} must be an object`);
  const params: Record<string, PublishedPuzzleValueV1> = {};
  for (const [key, child] of Object.entries(value)) {
    params[key] = parsePublishedPuzzleValueV1(child, `${path}.${key}`);
  }
  return params;
}

export function parsePublishedPuzzleValueV1(
  value: unknown,
  path = 'value',
): PublishedPuzzleValueV1 {
  if (value === null) return null;
  if (typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    return parseSafeInteger(value, path);
  }
  if (Array.isArray(value)) {
    return value.map((child, index) => parsePublishedPuzzleValueV1(child, `${path}[${index}]`));
  }
  if (isPlainRecord(value)) {
    const output: Record<string, PublishedPuzzleValueV1> = {};
    for (const [key, child] of Object.entries(value)) {
      output[key] = parsePublishedPuzzleValueV1(child, `${path}.${key}`);
    }
    return output;
  }
  throw new Error(`${path} contains a value that cannot be published`);
}

function parseBoard(value: unknown, path: string): CellValue[][] {
  const rows = parseArray(value, path);
  if (rows.length !== BOARD_ROWS) {
    throw new Error(`${path} must have exactly ${BOARD_ROWS} rows`);
  }
  return rows.map((row, rowIndex) => {
    const cells = parseArray(row, `${path}[${rowIndex}]`);
    if (cells.length !== BOARD_COLS) {
      throw new Error(`${path}[${rowIndex}] must have exactly ${BOARD_COLS} cells`);
    }
    return cells.map((cell, columnIndex) =>
      parseCellValue(cell, `${path}[${rowIndex}][${columnIndex}]`),
    );
  });
}

function parseHazard(value: unknown, path: string): PublishedPuzzleHazardKindV1 {
  switch (value) {
    case 'poison':
    case 'storage-poison':
    case 'retrim':
    case 'purge':
    case 'curtain':
    case 'freeze':
    case 'magnet':
    case 'snag':
    case 'sticky':
    case 'bomber':
    case 'wildcard':
    case 'tectonic':
    case 'garbage':
    case 'satellite':
      return value;
    default:
      throw new Error(`${path} is an unknown timeline hazard`);
  }
}

function parseTimelineEvent(value: unknown, path: string): PublishedPuzzleTimelineEventV1 {
  if (!isPlainRecord(value)) throw new Error(`${path} must be an object`);
  const kind = requiredField(value, 'kind', path);
  const params = Object.hasOwn(value, 'params')
    ? parseParams(requiredField(value, 'params', path), `${path}.params`)
    : undefined;

  switch (kind) {
    case 'atTick': {
      assertExactKeys(value, ['kind', 'tick', 'hazard', ...(params === undefined ? [] : ['params'])], path);
      const event: {
        kind: 'atTick';
        tick: number;
        hazard: PublishedPuzzleHazardKindV1;
        params?: PublishedPuzzleParamsV1;
      } = {
        kind,
        tick: parseSafeInteger(requiredField(value, 'tick', path), `${path}.tick`),
        hazard: parseHazard(requiredField(value, 'hazard', path), `${path}.hazard`),
      };
      if (params !== undefined) event.params = params;
      return event;
    }
    case 'afterPieces': {
      assertExactKeys(
        value,
        ['kind', 'afterPieces', 'hazard', ...(params === undefined ? [] : ['params'])],
        path,
      );
      const event: {
        kind: 'afterPieces';
        afterPieces: number;
        hazard: PublishedPuzzleHazardKindV1;
        params?: PublishedPuzzleParamsV1;
      } = {
        kind,
        afterPieces: parseSafeInteger(
          requiredField(value, 'afterPieces', path),
          `${path}.afterPieces`,
          1,
        ),
        hazard: parseHazard(requiredField(value, 'hazard', path), `${path}.hazard`),
      };
      if (params !== undefined) event.params = params;
      return event;
    }
    default:
      throw new Error(`${path}.kind is an unknown timeline kind`);
  }
}

function parseGoal(value: unknown, path: string): PublishedPuzzleGoalV1 {
  if (!isPlainRecord(value)) throw new Error(`${path} must be an object`);
  const kind = requiredField(value, 'kind', path);
  switch (kind) {
    case 'garbage-clear':
    case 'perfect-clear': {
      const maxPieces = optionalField(value, 'maxPieces');
      assertExactKeys(value, ['kind', ...(maxPieces === undefined ? [] : ['maxPieces'])], path);
      return {
        kind,
        ...(maxPieces === undefined
          ? {}
          : { maxPieces: parseSafeInteger(maxPieces, `${path}.maxPieces`, 1) }),
      };
    }
    case 'survive':
      assertExactKeys(value, ['kind', 'ticks'], path);
      return {
        kind,
        ticks: parseSafeInteger(requiredField(value, 'ticks', path), `${path}.ticks`, 1),
      };
    case 'clear-lines':
      assertExactKeys(value, ['kind', 'lines'], path);
      return {
        kind,
        lines: parseSafeInteger(requiredField(value, 'lines', path), `${path}.lines`, 1),
      };
    case 'survive-clear':
      assertExactKeys(value, ['kind', 'ticks', 'lines'], path);
      return {
        kind,
        ticks: parseSafeInteger(requiredField(value, 'ticks', path), `${path}.ticks`, 1),
        lines: parseSafeInteger(requiredField(value, 'lines', path), `${path}.lines`, 1),
      };
    default:
      throw new Error(`${path}.kind is an unknown puzzle goal`);
  }
}

function parseBenchmark(
  value: unknown,
  path: string,
): PublishedPuzzleBenchmarkPolicyV1 {
  if (!isPlainRecord(value)) throw new Error(`${path} must be an object`);
  const tieBreakers = optionalField(value, 'tieBreakers');
  assertExactKeys(value, ['metric', 'direction', ...(tieBreakers === undefined ? [] : ['tieBreakers'])], path);
  const metric = parseBenchmarkMetric(requiredField(value, 'metric', path), `${path}.metric`);
  const direction = parseDirection(requiredField(value, 'direction', path), `${path}.direction`);
  if (tieBreakers === undefined) return { metric, direction };
  return {
    metric,
    direction,
    tieBreakers: parseArray(tieBreakers, `${path}.tieBreakers`).map((entry, index) => {
      const entryPath = `${path}.tieBreakers[${index}]`;
      if (!isPlainRecord(entry)) throw new Error(`${entryPath} must be an object`);
      assertExactKeys(entry, ['metric', 'direction'], entryPath);
      return {
        metric: parseBenchmarkMetric(requiredField(entry, 'metric', entryPath), `${entryPath}.metric`),
        direction: parseDirection(
          requiredField(entry, 'direction', entryPath),
          `${entryPath}.direction`,
        ),
      };
    }),
  };
}

function parseBenchmarkMetric(value: unknown, path: string): PublishedPuzzleBenchmarkMetricV1 {
  if (value === 'score' || value === 'ticks' || value === 'pieces') return value;
  throw new Error(`${path} must be score, ticks, or pieces`);
}

function parseDirection(value: unknown, path: string): 'maximize' | 'minimize' {
  if (value === 'maximize' || value === 'minimize') return value;
  throw new Error(`${path} must be maximize or minimize`);
}

export function parsePublishedPuzzlePayloadV1(value: unknown): PublishedPuzzlePayloadV1 {
  if (!isPlainRecord(value)) throw new Error('published puzzle payload must be an object');
  const description = optionalField(value, 'description');
  assertExactKeys(
    value,
    [
      'id',
      'name',
      'initialBoard',
      'finitePieceSequence',
      'goal',
      'allowedMechanics',
      'timeline',
      'visibilityPolicy',
      'benchmark',
      ...(description === undefined ? [] : ['description']),
    ],
    'published puzzle payload',
  );

  const finitePieceSequence = parseArray(
    requiredField(value, 'finitePieceSequence', 'published puzzle payload'),
    'published puzzle payload.finitePieceSequence',
  ).map((piece, index) => parseShape(piece, `published puzzle payload.finitePieceSequence[${index}]`));
  if (finitePieceSequence.length === 0) {
    throw new Error('published puzzle payload.finitePieceSequence must not be empty');
  }
  const [firstPiece, ...remainingPieces] = finitePieceSequence;
  if (firstPiece === undefined) throw new Error('published puzzle payload.finitePieceSequence must not be empty');

  const allowedMechanics = requiredField(value, 'allowedMechanics', 'published puzzle payload');
  if (!isPlainRecord(allowedMechanics)) {
    throw new Error('published puzzle payload.allowedMechanics must be an object');
  }
  assertExactKeys(allowedMechanics, ['allowHold'], 'published puzzle payload.allowedMechanics');

  const timeline = parseArray(
    requiredField(value, 'timeline', 'published puzzle payload'),
    'published puzzle payload.timeline',
  ).map((entry, index) => parseTimelineEvent(entry, `published puzzle payload.timeline[${index}]`));

  const visibilityPolicy = requiredField(value, 'visibilityPolicy', 'published puzzle payload');
  if (visibilityPolicy !== 'hidden' && visibilityPolicy !== 'partial' && visibilityPolicy !== 'revealed') {
    throw new Error('published puzzle payload.visibilityPolicy is invalid');
  }

  return {
    id: parseString(requiredField(value, 'id', 'published puzzle payload'), 'published puzzle payload.id'),
    name: parseString(requiredField(value, 'name', 'published puzzle payload'), 'published puzzle payload.name'),
    ...(description === undefined
      ? {}
      : { description: parseString(description, 'published puzzle payload.description', true) }),
    initialBoard: parseBoard(
      requiredField(value, 'initialBoard', 'published puzzle payload'),
      'published puzzle payload.initialBoard',
    ),
    finitePieceSequence: [firstPiece, ...remainingPieces],
    goal: parseGoal(requiredField(value, 'goal', 'published puzzle payload'), 'published puzzle payload.goal'),
    allowedMechanics: {
      allowHold: parseBoolean(
        requiredField(allowedMechanics, 'allowHold', 'published puzzle payload.allowedMechanics'),
        'published puzzle payload.allowedMechanics.allowHold',
      ),
    },
    timeline,
    visibilityPolicy,
    benchmark: parseBenchmark(
      requiredField(value, 'benchmark', 'published puzzle payload'),
      'published puzzle payload.benchmark',
    ),
  };
}

export function parsePublishedPuzzleBaselineV1(value: unknown): PublishedPuzzleBaselineV1 {
  if (!isPlainRecord(value)) throw new Error('published puzzle.publicBaseline must be an object');
  assertExactKeys(
    value,
    ['score', 'ticksUsed', 'piecesUsed', 'linesCleared'],
    'published puzzle.publicBaseline',
  );
  return {
    score: parseSafeInteger(requiredField(value, 'score', 'published puzzle.publicBaseline'), 'published puzzle.publicBaseline.score'),
    ticksUsed: parseSafeInteger(requiredField(value, 'ticksUsed', 'published puzzle.publicBaseline'), 'published puzzle.publicBaseline.ticksUsed'),
    piecesUsed: parseSafeInteger(requiredField(value, 'piecesUsed', 'published puzzle.publicBaseline'), 'published puzzle.publicBaseline.piecesUsed'),
    linesCleared: parseSafeInteger(
      requiredField(value, 'linesCleared', 'published puzzle.publicBaseline'),
      'published puzzle.publicBaseline.linesCleared',
    ),
  };
}

export function parsePublishedPuzzleStructureV1(value: unknown): PublishedPuzzleV1 {
  if (!isPlainRecord(value)) throw new Error('published puzzle must be an object');
  assertExactKeys(value, ['payload', 'contentHash', 'publicBaseline'], 'published puzzle');
  return {
    payload: parsePublishedPuzzlePayloadV1(requiredField(value, 'payload', 'published puzzle')),
    contentHash: parseHash(requiredField(value, 'contentHash', 'published puzzle'), 'published puzzle.contentHash'),
    publicBaseline: parsePublishedPuzzleBaselineV1(
      requiredField(value, 'publicBaseline', 'published puzzle'),
    ),
  };
}

export async function parsePublishedPuzzleV1(value: unknown): Promise<PublishedPuzzleV1> {
  const puzzle = parsePublishedPuzzleStructureV1(value);
  const expectedHash = await hashPublishedPuzzlePayload(puzzle.payload);
  if (puzzle.contentHash !== expectedHash) {
    throw new Error(
      `published puzzle contentHash mismatch: claimed ${puzzle.contentHash}, computed ${expectedHash}`,
    );
  }
  return puzzle;
}

export function parsePublishedPuzzleManifestV1(value: unknown): PublishedPuzzleManifestV1 {
  if (!isPlainRecord(value)) throw new Error('published puzzle manifest must be an object');
  assertExactKeys(
    value,
    ['schemaVersion', 'puzzleRuntimeVersion', 'releaseId', 'packs'],
    'published puzzle manifest',
  );
  const schemaVersion = requiredField(value, 'schemaVersion', 'published puzzle manifest');
  if (schemaVersion !== PUBLISHED_PUZZLE_SCHEMA_VERSION) {
    throw new Error(`published puzzle manifest schema version ${String(schemaVersion)} is unsupported`);
  }
  const packs = parseArray(
    requiredField(value, 'packs', 'published puzzle manifest'),
    'published puzzle manifest.packs',
  ).map((pack, index) => {
    const path = `published puzzle manifest.packs[${index}]`;
    if (!isPlainRecord(pack)) throw new Error(`${path} must be an object`);
    assertExactKeys(pack, ['id', 'url', 'sha256', 'byteLength', 'puzzleIds'], path);
    const puzzleIds = parseArray(requiredField(pack, 'puzzleIds', path), `${path}.puzzleIds`).map(
      (puzzleId, puzzleIndex) =>
        parseString(puzzleId, `${path}.puzzleIds[${puzzleIndex}]`),
    );
    if (puzzleIds.length === 0) throw new Error(`${path}.puzzleIds must not be empty`);
    const [firstPuzzleId, ...remainingPuzzleIds] = puzzleIds;
    if (firstPuzzleId === undefined) throw new Error(`${path}.puzzleIds must not be empty`);
    const nonEmptyPuzzleIds: NonEmptyReadonlyArray<string> = [firstPuzzleId, ...remainingPuzzleIds];
    return {
      id: parseString(requiredField(pack, 'id', path), `${path}.id`),
      url: parseString(requiredField(pack, 'url', path), `${path}.url`),
      sha256: parseHash(requiredField(pack, 'sha256', path), `${path}.sha256`),
      byteLength: parseSafeInteger(requiredField(pack, 'byteLength', path), `${path}.byteLength`),
      puzzleIds: nonEmptyPuzzleIds,
    };
  });
  return {
    schemaVersion,
    puzzleRuntimeVersion: parseString(
      requiredField(value, 'puzzleRuntimeVersion', 'published puzzle manifest'),
      'published puzzle manifest.puzzleRuntimeVersion',
    ),
    releaseId: parseString(
      requiredField(value, 'releaseId', 'published puzzle manifest'),
      'published puzzle manifest.releaseId',
    ),
    packs,
  };
}

export function parsePublishedPuzzlePackStructureV1(value: unknown): PublishedPuzzlePackV1 {
  if (!isPlainRecord(value)) throw new Error('published puzzle pack must be an object');
  assertExactKeys(value, ['schemaVersion', 'id', 'puzzles'], 'published puzzle pack');
  const schemaVersion = requiredField(value, 'schemaVersion', 'published puzzle pack');
  if (schemaVersion !== PUBLISHED_PUZZLE_SCHEMA_VERSION) {
    throw new Error(`published puzzle pack schema version ${String(schemaVersion)} is unsupported`);
  }
  const id = parseString(requiredField(value, 'id', 'published puzzle pack'), 'published puzzle pack.id');
  const rawPuzzles = parseArray(
    requiredField(value, 'puzzles', 'published puzzle pack'),
    'published puzzle pack.puzzles',
  );
  if (rawPuzzles.length === 0) throw new Error('published puzzle pack.puzzles must not be empty');
  const puzzles = rawPuzzles.map((p) =>
    parsePublishedPuzzleStructureV1(p),
  );
  const [first, ...rest] = puzzles;
  if (!first) throw new Error('published puzzle pack.puzzles must not be empty');
  return {
    schemaVersion,
    id,
    puzzles: [first, ...rest],
  };
}

export async function parsePublishedPuzzlePackV1(value: unknown): Promise<PublishedPuzzlePackV1> {
  const structure = parsePublishedPuzzlePackStructureV1(value);
  const verifiedPuzzles = await Promise.all(
    structure.puzzles.map((puzzle) => parsePublishedPuzzleV1(puzzle)),
  );
  const [first, ...rest] = verifiedPuzzles;
  if (!first) throw new Error('published puzzle pack.puzzles must not be empty');
  return {
    schemaVersion: structure.schemaVersion,
    id: structure.id,
    puzzles: [first, ...rest],
  };
}

function parseCommandBase(value: unknown, path: string): PlainRecord {
  if (!isPlainRecord(value)) throw new Error(`${path} must be an object`);
  parseSafeInteger(requiredField(value, 'tick', path), `${path}.tick`);
  parseSafeInteger(requiredField(value, 'orderWithinTick', path), `${path}.orderWithinTick`);
  return value;
}

export function parsePuzzleCommandV1(value: unknown, path = 'command'): PuzzleCommandV1 {
  const record = parseCommandBase(value, path);
  switch (requiredField(record, 'kind', path)) {
    case 'input':
      assertExactKeys(record, ['tick', 'orderWithinTick', 'kind', 'left', 'right', 'softDrop'], path);
      return {
        tick: parseSafeInteger(requiredField(record, 'tick', path), `${path}.tick`),
        orderWithinTick: parseSafeInteger(
          requiredField(record, 'orderWithinTick', path),
          `${path}.orderWithinTick`,
        ),
        kind: 'input',
        left: parseBoolean(requiredField(record, 'left', path), `${path}.left`),
        right: parseBoolean(requiredField(record, 'right', path), `${path}.right`),
        softDrop: parseBoolean(requiredField(record, 'softDrop', path), `${path}.softDrop`),
      };
    case 'action': {
      assertExactKeys(record, ['tick', 'orderWithinTick', 'kind', 'action'], path);
      const action = requiredField(record, 'action', path);
      if (action !== 'rotateCW' && action !== 'rotateCCW' && action !== 'hardDrop' && action !== 'hold') {
        throw new Error(`${path}.action is not an allowed puzzle action`);
      }
      return {
        tick: parseSafeInteger(requiredField(record, 'tick', path), `${path}.tick`),
        orderWithinTick: parseSafeInteger(
          requiredField(record, 'orderWithinTick', path),
          `${path}.orderWithinTick`,
        ),
        kind: 'action',
        action,
      };
    }
    default:
      throw new Error(`${path}.kind is an unknown puzzle command kind`);
  }
}

export function parsePuzzleCommandStreamV1(value: unknown): PuzzleCommandV1[] {
  const commands = parseArray(value, 'commands').map((command, index) =>
    parsePuzzleCommandV1(command, `commands[${index}]`),
  );
  let previousTick: number | null = null;
  let expectedOrder = 0;
  let previousInput: PuzzleInputStateV1 = { left: false, right: false, softDrop: false };

  for (const [index, command] of commands.entries()) {
    if (previousTick === null || command.tick > previousTick) {
      expectedOrder = 0;
    } else if (command.tick < previousTick) {
      throw new Error(`commands[${index}] is out of tick order`);
    }
    if (command.orderWithinTick !== expectedOrder) {
      throw new Error(`commands[${index}] orderWithinTick must be contiguous from zero`);
    }
    expectedOrder += 1;
    previousTick = command.tick;

    if (command.kind === 'input') {
      const nextInput: PuzzleInputStateV1 = {
        left: command.left,
        right: command.right,
        softDrop: command.softDrop,
      };
      if (
        nextInput.left === previousInput.left
        && nextInput.right === previousInput.right
        && nextInput.softDrop === previousInput.softDrop
      ) {
        throw new Error(`commands[${index}] repeats the held-input state`);
      }
      previousInput = nextInput;
    }
  }
  return commands;
}

export function parsePuzzleAttemptGrantV1(value: unknown): PuzzleAttemptGrantV1 {
  if (!isPlainRecord(value)) throw new Error('puzzle attempt grant must be an object');
  assertExactKeys(
    value,
    ['grantId', 'puzzleId', 'contentHash', 'puzzleRuntimeVersion', 'issuedAt', 'expiresAt', 'nonce'],
    'puzzle attempt grant',
  );
  return {
    grantId: parseString(requiredField(value, 'grantId', 'puzzle attempt grant'), 'puzzle attempt grant.grantId'),
    puzzleId: parseString(requiredField(value, 'puzzleId', 'puzzle attempt grant'), 'puzzle attempt grant.puzzleId'),
    contentHash: parseHash(
      requiredField(value, 'contentHash', 'puzzle attempt grant'),
      'puzzle attempt grant.contentHash',
    ),
    puzzleRuntimeVersion: parseString(
      requiredField(value, 'puzzleRuntimeVersion', 'puzzle attempt grant'),
      'puzzle attempt grant.puzzleRuntimeVersion',
    ),
    issuedAt: parseSafeInteger(
      requiredField(value, 'issuedAt', 'puzzle attempt grant'),
      'puzzle attempt grant.issuedAt',
    ),
    expiresAt: parseSafeInteger(
      requiredField(value, 'expiresAt', 'puzzle attempt grant'),
      'puzzle attempt grant.expiresAt',
    ),
    nonce: parseString(requiredField(value, 'nonce', 'puzzle attempt grant'), 'puzzle attempt grant.nonce'),
  };
}

function parseAttemptStatus(value: unknown, path: string): PuzzleAttemptStatusV1 {
  if (value === 'solved' || value === 'top-out' || value === 'incomplete' || value === 'timeout') return value;
  throw new Error(`${path} is not a valid puzzle attempt status`);
}

function parseClaimedOutcome(value: unknown, path: string): PuzzleClaimedOutcomeV1 {
  if (!isPlainRecord(value)) throw new Error(`${path} must be an object`);
  assertExactKeys(value, ['status', 'ticksUsed', 'piecesUsed', 'linesCleared', 'score', 'finalStateHash'], path);
  return {
    status: parseAttemptStatus(requiredField(value, 'status', path), `${path}.status`),
    ticksUsed: parseSafeInteger(requiredField(value, 'ticksUsed', path), `${path}.ticksUsed`),
    piecesUsed: parseSafeInteger(requiredField(value, 'piecesUsed', path), `${path}.piecesUsed`),
    linesCleared: parseSafeInteger(requiredField(value, 'linesCleared', path), `${path}.linesCleared`),
    score: parseSafeInteger(requiredField(value, 'score', path), `${path}.score`),
    finalStateHash: parseHash(requiredField(value, 'finalStateHash', path), `${path}.finalStateHash`),
  };
}

export function parsePuzzleAttemptEnvelopeV1(value: unknown): PuzzleAttemptEnvelopeV1 {
  if (!isPlainRecord(value)) throw new Error('puzzle attempt envelope must be an object');
  assertExactKeys(
    value,
    [
      'schemaVersion',
      'puzzleRuntimeVersion',
      'puzzleId',
      'contentHash',
      'attemptGrantId',
      'commands',
      'claimedOutcome',
      'traceHash',
    ],
    'puzzle attempt envelope',
  );
  const schemaVersion = requiredField(value, 'schemaVersion', 'puzzle attempt envelope');
  if (schemaVersion !== PUBLISHED_PUZZLE_SCHEMA_VERSION) {
    throw new Error(`puzzle attempt schema version ${String(schemaVersion)} is unsupported`);
  }
  const attemptGrantIdValue = requiredField(value, 'attemptGrantId', 'puzzle attempt envelope');
  const attemptGrantId = attemptGrantIdValue === null
    ? null
    : parseString(attemptGrantIdValue, 'puzzle attempt envelope.attemptGrantId');
  return {
    schemaVersion,
    puzzleRuntimeVersion: parseString(
      requiredField(value, 'puzzleRuntimeVersion', 'puzzle attempt envelope'),
      'puzzle attempt envelope.puzzleRuntimeVersion',
    ),
    puzzleId: parseString(
      requiredField(value, 'puzzleId', 'puzzle attempt envelope'),
      'puzzle attempt envelope.puzzleId',
    ),
    contentHash: parseHash(
      requiredField(value, 'contentHash', 'puzzle attempt envelope'),
      'puzzle attempt envelope.contentHash',
    ),
    attemptGrantId,
    commands: parsePuzzleCommandStreamV1(requiredField(value, 'commands', 'puzzle attempt envelope')),
    claimedOutcome: parseClaimedOutcome(
      requiredField(value, 'claimedOutcome', 'puzzle attempt envelope'),
      'puzzle attempt envelope.claimedOutcome',
    ),
    traceHash: parseHash(
      requiredField(value, 'traceHash', 'puzzle attempt envelope'),
      'puzzle attempt envelope.traceHash',
    ),
  };
}

function parseVerificationRejectReason(
  value: unknown,
  path: string,
): PuzzleVerificationRejectReasonV1 {
  switch (value) {
    case 'UNKNOWN_CONTENT':
    case 'VERSION_MISMATCH':
    case 'INVALID_COMMAND':
    case 'TRACE_LIMIT':
    case 'OUTCOME_MISMATCH':
    case 'GRANT_REPLAYED':
      return value;
    default:
      throw new Error(`${path} is not a valid puzzle verification reject reason`);
  }
}

export function parsePuzzleVerificationVerdictV1(value: unknown): PuzzleVerificationVerdictV1 {
  if (!isPlainRecord(value)) throw new Error('puzzle verification verdict must be an object');
  assertExactKeys(
    value,
    ['accepted', 'reason', 'authoritativeOutcome', 'traceHash', 'verifierVersion'],
    'puzzle verification verdict',
  );
  const accepted = parseBoolean(
    requiredField(value, 'accepted', 'puzzle verification verdict'),
    'puzzle verification verdict.accepted',
  );
  const reason = requiredField(value, 'reason', 'puzzle verification verdict');
  const authoritativeOutcome = requiredField(
    value,
    'authoritativeOutcome',
    'puzzle verification verdict',
  );
  const traceHash = parseHash(
    requiredField(value, 'traceHash', 'puzzle verification verdict'),
    'puzzle verification verdict.traceHash',
  );
  const verifierVersion = parseString(
    requiredField(value, 'verifierVersion', 'puzzle verification verdict'),
    'puzzle verification verdict.verifierVersion',
  );

  if (accepted) {
    if (reason !== 'ACCEPTED') {
      throw new Error('accepted puzzle verification verdict must use reason ACCEPTED');
    }
    return {
      accepted: true,
      reason,
      authoritativeOutcome: parseClaimedOutcome(
        authoritativeOutcome,
        'puzzle verification verdict.authoritativeOutcome',
      ),
      traceHash,
      verifierVersion,
    };
  }
  if (authoritativeOutcome !== null) {
    throw new Error('rejected puzzle verification verdict must have a null authoritative outcome');
  }
  return {
    accepted: false,
    reason: parseVerificationRejectReason(reason, 'puzzle verification verdict.reason'),
    authoritativeOutcome: null,
    traceHash,
    verifierVersion,
  };
}

function canonicalize(value: unknown, path: string, ancestors: Set<object>): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    parseSafeInteger(value, path);
    return String(value);
  }
  if (typeof value !== 'object') {
    throw new Error(`${path} contains a value JSON cannot represent`);
  }
  if (ancestors.has(value)) throw new Error(`${path} contains a cycle`);
  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      const keys = Object.keys(value);
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) throw new Error(`${path}[${index}] is missing`);
      }
      if (keys.some((key) => !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) {
        throw new Error(`${path} contains non-index array properties`);
      }
      return `[${value.map((child, index) => canonicalize(child, `${path}[${index}]`, ancestors)).join(',')}]`;
    }
    if (!isPlainRecord(value)) throw new Error(`${path} must contain only plain objects`);
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key], `${path}.${key}`, ancestors)}`)
      .join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

/** Canonical JSON text. Object keys are sorted and array order is preserved. */
export function canonicalEncode(value: unknown): string {
  return canonicalize(value, 'value', new Set<object>());
}

export const encodeCanonicalJson = canonicalEncode;

/** Canonical JSON bytes encoded as UTF-8. */
export function encodeCanonicalBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalEncode(value));
}

function prefixedBytes(prefix: string, value: unknown): Uint8Array {
  const prefixBytes = new TextEncoder().encode(prefix);
  const valueBytes = encodeCanonicalBytes(value);
  const bytes = new Uint8Array(prefixBytes.length + valueBytes.length);
  bytes.set(prefixBytes, 0);
  bytes.set(valueBytes, prefixBytes.length);
  return bytes;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('SHA-256 requires Web Crypto support');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashPublishedPuzzlePayload(
  payload: PublishedPuzzlePayloadV1,
): Promise<string> {
  return sha256Hex(prefixedBytes(PUZZLE_CONTENT_HASH_PREFIX, payload));
}

export async function hashPuzzleAttemptTraceV1(
  envelope: PuzzleAttemptEnvelopeV1,
): Promise<string> {
  const { traceHash: _traceHash, ...traceFields } = envelope;
  return sha256Hex(prefixedBytes(PUZZLE_TRACE_HASH_PREFIX, traceFields));
}

export async function hashPuzzlePackBytesV1(bytes: Uint8Array): Promise<string> {
  const prefixBytes = new TextEncoder().encode(PUZZLE_PACK_HASH_PREFIX);
  const input = new Uint8Array(prefixBytes.length + bytes.length);
  input.set(prefixBytes, 0);
  input.set(bytes, prefixBytes.length);
  return sha256Hex(input);
}

export interface PuzzleFinalStateDigestFieldsV1 {
  status: string;
  ticksUsed: number;
  piecesUsed: number;
  linesCleared: number;
  score: number;
  board: ReadonlyArray<ReadonlyArray<CellValue>>;
}

export async function hashPuzzleFinalStateV1(
  finalState: PuzzleFinalStateDigestFieldsV1,
): Promise<string> {
  return sha256Hex(prefixedBytes(PUZZLE_STATE_HASH_PREFIX, finalState));
}

export async function createPublishedPuzzleV1(
  payload: PublishedPuzzlePayloadV1,
  publicBaseline: PublishedPuzzleBaselineV1,
): Promise<PublishedPuzzleV1> {
  const parsedPayload = parsePublishedPuzzlePayloadV1(payload);
  const parsedBaseline = parsePublishedPuzzleBaselineV1(publicBaseline);
  return {
    payload: parsedPayload,
    contentHash: await hashPublishedPuzzlePayload(parsedPayload),
    publicBaseline: parsedBaseline,
  };
}
