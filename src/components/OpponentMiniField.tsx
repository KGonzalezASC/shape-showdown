import React, { useMemo } from 'react';
import { BOARD_COLS, BOARD_HIDDEN_ROWS, BOARD_VISIBLE_ROWS, CellValue } from '../types';
import { SHAPES } from '../tetris/shapes';
import { PublicPlayerState } from '../state/publicSnapshots';
import { SHAPE_COLORS } from '../presentation/shapePalette';

interface OpponentMiniFieldProps {
  player: PublicPlayerState | null;
  pendingGarbage: number;
  hatchingEnabled: boolean;
}

const MINI_CELL_SIZE = 5;

const MemoizedMiniCell = React.memo(({ color, noHatch }: { color: CellValue; noHatch: boolean }) => (
  <div
    className={`relative ${color ? '' : 'arena-cell-empty'}`}
    style={{ width: MINI_CELL_SIZE, height: MINI_CELL_SIZE }}
  >
    {color && (
      <div className="shape-token absolute inset-[8%]" style={{ backgroundColor: SHAPE_COLORS[color] }}>
        {!noHatch && (
          <div className="tetromino-hatch tetromino-hatch-mini pointer-events-none absolute inset-0" aria-hidden />
        )}
      </div>
    )}
  </div>
));

const OpponentMiniField: React.FC<OpponentMiniFieldProps> = ({ player, pendingGarbage, hatchingEnabled }) => {
  const visibleRows = useMemo(() => {
    if (!player) return null;
    const rows = player.board.slice(BOARD_HIDDEN_ROWS, BOARD_HIDDEN_ROWS + BOARD_VISIBLE_ROWS).map((r) => [...r]);
    if (player.activePiece) {
      const offsets = player.activePiece.customOffsets ?? SHAPES[player.activePiece.type][player.activePiece.rotation];
      for (const [dx, dy] of offsets) {
        const x = player.activePiece.x + dx;
        const y = player.activePiece.y + dy - BOARD_HIDDEN_ROWS;
        if (y >= 0 && y < BOARD_VISIBLE_ROWS && x >= 0 && x < BOARD_COLS) {
          rows[y][x] = player.activePiece.isWildcard ? 'W' : player.activePiece.type;
        }
      }
    }
    return rows;
  }, [player?.board, player?.activePiece]);

  const noHatchCells = useMemo(() => {
    const cells = new Set<string>();
    if (!player) return cells;

    for (let y = 0; y < BOARD_VISIBLE_ROWS; y += 1) {
      for (let x = 0; x < BOARD_COLS; x += 1) {
        if ((player.poisonBoard?.[BOARD_HIDDEN_ROWS + y]?.[x] ?? 0) > 0) {
          cells.add(`${x},${y}`);
        }
      }
    }

    const activePiece = player.activePiece;
    const magnetActive = (player.magnetPermanentStacks ?? 0) > 0 || (player.magnetPieceBoost ?? 0) > 0;
    if (activePiece && (activePiece.poisoned || activePiece.bomber || magnetActive)) {
      const offsets = activePiece.customOffsets ?? SHAPES[activePiece.type][activePiece.rotation];
      for (const [dx, dy] of offsets) {
        const x = activePiece.x + dx;
        const y = activePiece.y + dy - BOARD_HIDDEN_ROWS;
        if (y >= 0 && y < BOARD_VISIBLE_ROWS && x >= 0 && x < BOARD_COLS) {
          cells.add(`${x},${y}`);
        }
      }
    }

    return cells;
  }, [
    player?.poisonBoard,
    player?.activePiece,
    player?.magnetPermanentStacks,
    player?.magnetPieceBoost,
  ]);

  if (!player || !visibleRows) {
    return (
      <div className="w-[5.75rem] rounded-lg border border-rose-500/30 bg-[#140f13]/90 p-1.5 shadow-xl backdrop-blur">
        <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-rose-300/80">Opp</p>
        <div className="mt-1 flex h-[100px] items-center justify-center rounded border border-rose-500/15 bg-[#141414] px-1">
          <p className="text-center text-[8px] uppercase tracking-widest text-zinc-500">Waiting</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-[5.75rem] rounded-lg border border-rose-500/30 bg-[#140f13]/90 p-1.5 shadow-xl backdrop-blur">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-rose-300/80">Opp</p>
        <p className="font-mono text-[9px] text-rose-100">{player.score}</p>
      </div>
      <div className="overflow-hidden rounded border border-rose-500/20">
        <div
          className="arena-grid grid"
          style={{ gridTemplateColumns: `repeat(${BOARD_COLS}, ${MINI_CELL_SIZE}px)` }}
        >
          {visibleRows.flatMap((row, y) =>
            row.map((cell, x) => (
              <MemoizedMiniCell
                key={`${x}-${y}`}
                color={cell}
                noHatch={!hatchingEnabled || noHatchCells.has(`${x},${y}`)}
              />
            )),
          )}
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between text-[8px] font-semibold uppercase tracking-wider">
        <span className="text-zinc-400">
          Ln <span className="font-mono text-zinc-200">{player.linesCleared}</span>
        </span>
        <span className="text-rose-300/80">
          In <span className="font-mono text-rose-100">{pendingGarbage}</span>
        </span>
      </div>
    </div>
  );
};

export default React.memo(OpponentMiniField, (prev, next) => {
  if (prev.pendingGarbage !== next.pendingGarbage || prev.hatchingEnabled !== next.hatchingEnabled) return false;

  const pA = prev.player;
  const pB = next.player;
  if (pA === pB) return true;
  if (!pA || !pB) return false;

  if (
    pA.score !== pB.score ||
    pA.linesCleared !== pB.linesCleared
  ) {
    return false;
  }

  const aA = pA.activePiece;
  const aB = pB.activePiece;
  if ((!aA && aB) || (aA && !aB)) return false;
  if (aA && aB) {
    if (
      aA.x !== aB.x ||
      aA.y !== aB.y ||
      aA.rotation !== aB.rotation ||
      aA.type !== aB.type ||
      aA.isWildcard !== aB.isWildcard ||
      aA.poisoned !== aB.poisoned ||
      aA.bomber !== aB.bomber
    ) {
      return false;
    }
  }

  if (
    pA.magnetPermanentStacks !== pB.magnetPermanentStacks ||
    pA.magnetPieceBoost !== pB.magnetPieceBoost
  ) {
    return false;
  }

  for (let y = 0; y < pA.board.length; y++) {
    const rowA = pA.board[y];
    const rowB = pB.board[y];
    for (let x = 0; x < rowA.length; x++) {
      if (rowA[x] !== rowB[x]) return false;
    }
  }

  const poisonA = pA.poisonBoard;
  const poisonB = pB.poisonBoard;
  if (!!poisonA !== !!poisonB) return false;
  if (poisonA && poisonB) {
    for (let y = 0; y < poisonA.length; y += 1) {
      const rowA = poisonA[y];
      const rowB = poisonB[y];
      for (let x = 0; x < rowA.length; x += 1) {
        if (rowA[x] !== rowB[x]) return false;
      }
    }
  }

  return true;
});
