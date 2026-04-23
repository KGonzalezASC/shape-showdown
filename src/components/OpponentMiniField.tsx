import React, { useMemo } from 'react';
import { BOARD_COLS, BOARD_HIDDEN_ROWS, BOARD_VISIBLE_ROWS, CellValue, PlayerState, TetrominoType } from '../types';

interface OpponentMiniFieldProps {
  player: PlayerState | null;
  pendingGarbage: number;
}

const MINI_CELL_SIZE = 5;

const COLORS: Record<Exclude<CellValue, null>, string> = {
  I: 'bg-cyan-400',
  J: 'bg-blue-500',
  L: 'bg-orange-400',
  O: 'bg-yellow-300',
  S: 'bg-green-400',
  T: 'bg-purple-400',
  Z: 'bg-red-500',
  G: 'bg-zinc-500',
};

const SHAPES: Record<TetrominoType, [number, number][][]> = {
  I: [
    [[0, 1], [1, 1], [2, 1], [3, 1]],
    [[2, 0], [2, 1], [2, 2], [2, 3]],
    [[0, 2], [1, 2], [2, 2], [3, 2]],
    [[1, 0], [1, 1], [1, 2], [1, 3]],
  ],
  J: [
    [[0, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]],
    [[1, 0], [1, 1], [0, 2], [1, 2]],
  ],
  L: [
    [[2, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 1], [0, 2]],
    [[0, 0], [1, 0], [1, 1], [1, 2]],
  ],
  O: [
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
  ],
  S: [
    [[1, 0], [2, 0], [0, 1], [1, 1]],
    [[1, 0], [1, 1], [2, 1], [2, 2]],
    [[1, 1], [2, 1], [0, 2], [1, 2]],
    [[0, 0], [0, 1], [1, 1], [1, 2]],
  ],
  T: [
    [[1, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [1, 2]],
    [[1, 0], [0, 1], [1, 1], [1, 2]],
  ],
  Z: [
    [[0, 0], [1, 0], [1, 1], [2, 1]],
    [[2, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [1, 2], [2, 2]],
    [[1, 0], [0, 1], [1, 1], [0, 2]],
  ],
};

const OpponentMiniField: React.FC<OpponentMiniFieldProps> = ({ player, pendingGarbage }) => {
  const visibleRows = useMemo(() => {
    if (!player) return null;
    const rows = player.board.slice(BOARD_HIDDEN_ROWS, BOARD_HIDDEN_ROWS + BOARD_VISIBLE_ROWS).map((r) => [...r]);
    if (player.activePiece) {
      for (const [dx, dy] of SHAPES[player.activePiece.type][player.activePiece.rotation]) {
        const x = player.activePiece.x + dx;
        const y = player.activePiece.y + dy - BOARD_HIDDEN_ROWS;
        if (y >= 0 && y < BOARD_VISIBLE_ROWS && x >= 0 && x < BOARD_COLS) {
          rows[y][x] = player.activePiece.type;
        }
      }
    }
    return rows;
  }, [player]);

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
          className="grid bg-[#141414]"
          style={{ gridTemplateColumns: `repeat(${BOARD_COLS}, ${MINI_CELL_SIZE}px)` }}
        >
          {visibleRows.flatMap((row, y) =>
            row.map((cell, x) => (
              <div
                key={`${x}-${y}`}
                className={`border border-black/25 ${cell ? COLORS[cell] : 'bg-zinc-900'}`}
                style={{ width: MINI_CELL_SIZE, height: MINI_CELL_SIZE }}
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

export default OpponentMiniField;
