import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBoardVisualModel } from '../src/board/boardVisualModel';
import {
  ACTIVE_PIECE_MOTION_MS,
  interpolateActivePiecePoint,
  shouldRestartActivePieceVisualLifetime,
  shouldSnapActivePieceMotion,
} from '../src/board/activePieceMotion';
import {
  ACTIVE_VORONOI_SHAPE_HOLD_SECONDS,
  ACTIVE_VORONOI_SHAPE_MORPH_SECONDS,
  activeVoronoiCellHandoff,
  activeVoronoiCellMorph,
  voronoiCellSides,
} from '../src/board/voronoiCellStyle';
import {
  canvasBackingSize,
  isCanvasLayoutVisible,
  syncCanvasBackingStore,
} from '../src/board/boardRenderer';
import { paintBoardCanvasOverlay } from '../src/board/BoardCanvasOverlay';
import { localDevelopmentGameServerUrl } from '../src/network/localGameServer';
import { BOARD_COLS, BOARD_HIDDEN_ROWS, BOARD_ROWS } from '../src/types';
import { toPublicPlayerState } from '../src/state/publicSnapshots';
import { makePlayer, makeRng } from './puzzleEngine/engine.js';

function visualPlayer() {
  const player = makePlayer('visual', makeRng(7));
  player.board = Array.from({ length: BOARD_ROWS }, () =>
    Array.from({ length: BOARD_COLS }, () => null),
  );
  player.poisonBoard = Array.from({ length: BOARD_ROWS }, () =>
    Array.from({ length: BOARD_COLS }, () => 0),
  );
  player.activePiece = null;
  return player;
}

describe('buildBoardVisualModel', () => {
  test('merges locked and active gamepiece cells into visible coordinates', () => {
    const player = visualPlayer();
    player.board[BOARD_HIDDEN_ROWS + 5][1] = 'J';
    player.activePiece = {
      type: 'T',
      rotation: 0,
      x: 3,
      y: BOARD_HIDDEN_ROWS + 2,
    };

    const model = buildBoardVisualModel(toPublicPlayerState(player), {
      hatchingEnabled: true,
      isMe: true,
    });

    assert.deepEqual(
      { value: model.cellAt(1, 5)?.value, hatched: model.cellAt(1, 5)?.hatched },
      { value: 'J', hatched: true },
    );
    assert.deepEqual(
      model.cells.filter((cell) => cell.value === 'T').map(({ x, y }) => [x, y]),
      [
        [4, 2],
        [3, 3],
        [4, 3],
        [5, 3],
      ],
    );
    assert.deepEqual(
      model.activeCells.map(({ offsetIndex, x, y }) => [offsetIndex, x, y]),
      [[0, 4, 2], [1, 3, 3], [2, 4, 3], [3, 5, 3]],
    );
  });

  test('eases active-piece visual motion without changing its target cell', () => {
    assert.deepEqual(interpolateActivePiecePoint({ x: 1, y: 4 }, { x: 2, y: 5 }, 0), { x: 1, y: 4 });
    assert.deepEqual(interpolateActivePiecePoint({ x: 1, y: 4 }, { x: 2, y: 5 }, 1), { x: 2, y: 5 });
    assert.equal(shouldSnapActivePieceMotion({ x: 4, y: 2 }, { x: 4, y: 4 }), false);
    assert.equal(shouldSnapActivePieceMotion({ x: 4, y: 2 }, { x: 4, y: 5 }), true);
    assert.deepEqual(ACTIVE_PIECE_MOTION_MS, 72);
  });

  test('keeps Voronoi lifetime through rotation-sized movement but resets on a new spawn', () => {
    const before = [{ offsetIndex: 0, x: 4, y: 8 }];
    assert.equal(
      shouldRestartActivePieceVisualLifetime(before, [{ offsetIndex: 0, x: 5, y: 7 }]),
      false,
    );
    assert.equal(
      shouldRestartActivePieceVisualLifetime(before, [{ offsetIndex: 0, x: 4, y: 0 }]),
      true,
    );
  });

  test('keeps an active cell polygon shape stable while it moves between rows', () => {
    assert.equal(voronoiCellSides(4, 3, 2), voronoiCellSides(5, 3, 2));
    assert.equal(voronoiCellSides(4, 3, 2), 7);
  });

  test('holds active cell identity before gently morphing to the next variation', () => {
    assert.deepEqual(activeVoronoiCellMorph(0, 0), {
      fromSides: 5,
      toSides: 5,
      progress: 0,
    });
    assert.deepEqual(activeVoronoiCellMorph(ACTIVE_VORONOI_SHAPE_HOLD_SECONDS, 0), {
      fromSides: 5,
      toSides: 6,
      progress: 0,
    });
    const midpoint = activeVoronoiCellMorph(
      ACTIVE_VORONOI_SHAPE_HOLD_SECONDS + ACTIVE_VORONOI_SHAPE_MORPH_SECONDS / 2,
      0,
    );
    assert.equal(midpoint.fromSides, 5);
    assert.equal(midpoint.toSides, 6);
    assert.ok(Math.abs(midpoint.progress - 0.5) < 1e-9);
  });

  test('preserves active Voronoi identity as the source of the stack handoff', () => {
    assert.deepEqual(activeVoronoiCellHandoff(8, 4, 1, 0), {
      sourceMorph: { fromSides: 6, toSides: 6, progress: 0 },
      sourceWobblePhase: 1,
      targetSides: 5,
      targetWobblePhase: 8,
    });
  });

  test('marks hard-drop state in the active-piece identity so it cannot animate as soft drop', () => {
    const player = visualPlayer();
    player.activePiece = {
      type: 'I',
      rotation: 0,
      x: 3,
      y: BOARD_HIDDEN_ROWS + 2,
    };
    const before = buildBoardVisualModel(toPublicPlayerState(player), {
      hatchingEnabled: false,
      isMe: true,
    });
    player.pieceHasHardDropped = true;
    const after = buildBoardVisualModel(toPublicPlayerState(player), {
      hatchingEnabled: false,
      isMe: true,
    });

    assert.notEqual(before.activePieceKey, after.activePieceKey);
  });

  test('resets motion identity across regular rotations', () => {
    const player = visualPlayer();
    player.activePiece = {
      type: 'T',
      rotation: 0,
      x: 3,
      y: BOARD_HIDDEN_ROWS + 2,
    };
    const before = buildBoardVisualModel(toPublicPlayerState(player), {
      hatchingEnabled: false,
      isMe: true,
    });
    player.activePiece = { ...player.activePiece, rotation: 1 };
    const after = buildBoardVisualModel(toPublicPlayerState(player), {
      hatchingEnabled: false,
      isMe: true,
    });

    assert.notEqual(before.activePieceKey, after.activePieceKey);
  });

  test('preserves poison, bomber, and magnet semantics on an active piece', () => {
    const player = visualPlayer();
    player.activePiece = {
      type: 'O',
      rotation: 0,
      x: 4,
      y: BOARD_HIDDEN_ROWS + 3,
      poisoned: true,
      poisonVariant: 3,
      bomber: true,
    };
    player.magnetPieceBoost = 1;

    const model = buildBoardVisualModel(toPublicPlayerState(player), {
      hatchingEnabled: true,
      isMe: true,
    });
    const activeCells = model.cells.filter((cell) => cell.value === 'O');

    assert.equal(activeCells.length, 4);
    assert.equal(
      activeCells.every(
        (cell) =>
          cell.poisonVariant === 3 &&
          cell.bomber &&
          cell.magnetAura &&
          !cell.hatched,
      ),
      true,
    );
  });

  test('marks wildcard cells and emits only the outer source-shape edges', () => {
    const player = visualPlayer();
    player.activePiece = {
      type: 'I',
      rotation: 0,
      x: 2,
      y: BOARD_HIDDEN_ROWS + 1,
      customOffsets: [[0, 0], [1, 0], [0, 1], [1, 1]],
      isWildcard: true,
    };
    player.customNextPieceSourceCells = [
      [2, BOARD_HIDDEN_ROWS + 7],
      [3, BOARD_HIDDEN_ROWS + 7],
    ];

    const model = buildBoardVisualModel(toPublicPlayerState(player), {
      hatchingEnabled: false,
      isMe: true,
    });

    assert.equal(model.cells.filter((cell) => cell.value === 'W').length, 4);
    assert.equal(model.wildcardOutline.length, 6);
    assert.equal(
      model.wildcardOutline.some((edge) =>
        edge.every((coordinate, index) => coordinate === [3, 7, 3, 8][index])),
      false,
    );
  });

  test('exposes a curtain only for the affected local field', () => {
    const player = visualPlayer();
    player.swapCutoffRow = 6;
    player.activeEffects = [{ id: 'curtain-1', kind: 'curtain', label: 'Curtain' }];
    const publicPlayer = toPublicPlayerState(player);

    assert.deepEqual(
      buildBoardVisualModel(publicPlayer, { hatchingEnabled: false, isMe: true }).curtain,
      { cutoffRow: 6, frostRows: 3 },
    );
    assert.equal(
      buildBoardVisualModel(publicPlayer, { hatchingEnabled: false, isMe: false }).curtain,
      null,
    );
  });
});

describe('board renderer sizing', () => {
  test('preserves CSS dimensions while scaling backing pixels by device ratio', () => {
    assert.deepEqual(canvasBackingSize(17, 2), {
      cssWidth: 170,
      cssHeight: 306,
      pixelWidth: 340,
      pixelHeight: 612,
      dpr: 2,
    });
  });

  test('updates an already-mounted backing store after a responsive cell-size change', () => {
    const canvas = { width: 0, height: 0 };
    syncCanvasBackingStore(canvas, 28, 2);
    assert.deepEqual(canvas, { width: 560, height: 1008 });

    const resized = syncCanvasBackingStore(canvas, 17, 1.5);
    assert.deepEqual(canvas, { width: 255, height: 459 });
    assert.deepEqual(resized, {
      cssWidth: 170,
      cssHeight: 306,
      pixelWidth: 255,
      pixelHeight: 459,
      dpr: 1.5,
    });
  });

  test('distinguishes mounted visible canvases from CSS-hidden layouts', () => {
    assert.equal(
      isCanvasLayoutVisible({ offsetParent: {} as Element }),
      true,
    );
    assert.equal(isCanvasLayoutVisible({ offsetParent: null }), false);
  });
});

test('local development connects to its own worktree origin', () => {
  assert.equal(
    localDevelopmentGameServerUrl(
      'http://localhost:3003',
      'localhost',
      true,
    ),
    'http://localhost:3003',
  );
  assert.equal(
    localDevelopmentGameServerUrl(
      'https://game.example.com',
      'game.example.com',
      false,
    ),
    null,
  );
});

test('canvas effect painter exercises hatching, bomber, magnet, and wildcard branches', () => {
  const player = visualPlayer();
  player.board[BOARD_HIDDEN_ROWS + 6][1] = 'T';
  player.activePiece = {
    type: 'I',
    rotation: 0,
    x: 2,
    y: BOARD_HIDDEN_ROWS + 2,
    customOffsets: [[0, 0], [1, 0], [0, 1], [1, 1]],
    isWildcard: true,
    poisoned: true,
    poisonVariant: 3,
    bomber: true,
  };
  player.magnetPieceBoost = 1;
  player.customNextPieceSourceCells = [
    [2, BOARD_HIDDEN_ROWS + 8],
    [3, BOARD_HIDDEN_ROWS + 8],
  ];
  const model = buildBoardVisualModel(toPublicPlayerState(player), {
    hatchingEnabled: true,
    isMe: true,
  });
  const operations: string[] = [];
  const context = {
    clearRect: () => operations.push('clear'),
    beginPath: () => operations.push('beginPath'),
    roundRect: () => operations.push('roundRect'),
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => operations.push('stroke'),
    fill: () => operations.push('fill'),
    save: () => {},
    restore: () => {},
    arc: () => operations.push('arc'),
    rect: () => {},
    clip: () => {},
    fillRect: () => operations.push('magnet-field-rect'),
    createLinearGradient: () => ({
      addColorStop: () => {},
    }),
    strokeRect: () => operations.push('strokeRect'),
    fillText: (text: string) => operations.push(`text:${text}`),
    setLineDash: () => operations.push('wildcard-dash'),
    set fillStyle(value: string) {
      operations.push(`fill:${value}`);
    },
    set strokeStyle(value: string) {
      operations.push(`stroke:${value}`);
    },
    set lineWidth(_value: number) {},
    set lineCap(_value: CanvasLineCap) {},
    set lineDashOffset(_value: number) {},
    set shadowColor(_value: string) {},
    set shadowBlur(_value: number) {},
    set font(_value: string) {},
    set textAlign(_value: CanvasTextAlign) {},
    set textBaseline(_value: CanvasTextBaseline) {},
  } as unknown as CanvasRenderingContext2D;

  paintBoardCanvasOverlay(context, model, 20, 500);

  assert.equal(operations.includes('text:💣'), true);
  assert.equal(operations.includes('wildcard-dash'), true);
  assert.equal(
    operations.some((operation) => operation === 'stroke:rgba(255,255,255,0.38)'),
    true,
  );
});
