import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBoardVisualModel } from '../src/board/boardVisualModel';
import {
  canvasBackingSize,
  isCanvasLayoutVisible,
  syncCanvasBackingStore,
} from '../src/board/boardRenderer';
import { paintBoardCanvasOverlay } from '../src/board/BoardCanvasOverlay';
import { localDevelopmentGameServerUrl } from '../src/network/localGameServer';
import { BOARD_COLS, BOARD_HIDDEN_ROWS, BOARD_ROWS } from '../src/types';
import { toPublicPlayerState } from '../src/state/publicSnapshots';
import { makePlayer, makeRng } from './tetris/engine';

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
  test('merges locked and active tetromino cells into visible coordinates', () => {
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
    player.magnetPermanentStacks = 1;

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
    fillRect: () => operations.push('fillRect'),
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => operations.push('stroke'),
    fill: () => operations.push('fill'),
    save: () => {},
    restore: () => {},
    arc: () => operations.push('arc'),
    rect: () => {},
    clip: () => {},
    strokeRect: () => operations.push('magnet'),
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
  assert.equal(operations.includes('magnet'), true);
  assert.equal(operations.includes('wildcard-dash'), true);
  assert.equal(
    operations.some((operation) => operation === 'stroke:rgba(255,255,255,0.38)'),
    true,
  );
});
