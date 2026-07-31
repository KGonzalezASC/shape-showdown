import React, { useMemo } from 'react';
import { BoardCanvasOverlay } from '../board/BoardCanvasOverlay';
import { buildBoardVisualModel } from '../board/boardVisualModel';
import {
  publicPlayersEqual,
  type PublicPlayerState,
} from '../state/publicSnapshots';
import { BOARD_COLS, BOARD_VISIBLE_ROWS } from '../types';
import { VoronoiFlowfieldCanvas } from './VoronoiFlowfieldCanvas';

interface OpponentMiniFieldProps {
  player: PublicPlayerState | null;
  pendingGarbage: number;
  hatchingEnabled: boolean;
}

const MINI_CELL_SIZE = 5;

const OpponentMiniField: React.FC<OpponentMiniFieldProps> = ({
  player,
  pendingGarbage,
  hatchingEnabled,
}) => {
  const visualModel = useMemo(
    () =>
      player
        ? buildBoardVisualModel(player, { hatchingEnabled, isMe: false })
        : null,
    [player, hatchingEnabled],
  );
  const visibleRows = useMemo(
    () =>
      visualModel
        ? Array.from({ length: BOARD_VISIBLE_ROWS }, (_, y) =>
            Array.from(
              { length: BOARD_COLS },
              (_, x) => visualModel.cellAt(x, y)?.value ?? null,
            ),
          )
        : [],
    [visualModel],
  );
  const visiblePoison = useMemo(
    () =>
      visualModel
        ? Array.from({ length: BOARD_VISIBLE_ROWS }, (_, y) =>
            Array.from(
              { length: BOARD_COLS },
              (_, x) => visualModel.cellAt(x, y)?.poisonVariant ?? 0,
            ),
          )
        : [],
    [visualModel],
  );

  if (!player || !visualModel) {
    return (
      <div className="w-[5.75rem] rounded-lg border border-rose-500/30 bg-[#140f13]/90 p-1.5 shadow-xl backdrop-blur">
        <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-rose-300/80">
          Opp
        </p>
        <div className="mt-1 flex h-[100px] items-center justify-center rounded border border-rose-500/15 bg-[#141414] px-1">
          <p className="text-center text-[8px] uppercase tracking-widest text-zinc-500">
            Waiting
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-[5.75rem] rounded-lg border border-rose-500/30 bg-[#140f13]/90 p-1.5 shadow-xl backdrop-blur">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-rose-300/80">
          Opp
        </p>
        <p className="font-mono text-[9px] text-rose-100">{player.score}</p>
      </div>
      <div className="overflow-hidden rounded border border-rose-500/20">
        <div
          className="relative bg-[#141414]"
          style={{
            width: BOARD_COLS * MINI_CELL_SIZE,
            height: BOARD_VISIBLE_ROWS * MINI_CELL_SIZE,
          }}
        >
          <VoronoiFlowfieldCanvas
            visibleRows={visibleRows}
            visiblePoison={visiblePoison}
            activeCells={visualModel.activeCells}
            cellSize={MINI_CELL_SIZE}
            poisonSpread={player.poisonSpread}
            performanceId="mobile-opponent-mini"
          />
          <BoardCanvasOverlay
            model={visualModel}
            cellSize={MINI_CELL_SIZE}
            performanceId="mobile-opponent-mini"
          />
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

export default React.memo(OpponentMiniField, (prev, next) => (
  prev.pendingGarbage === next.pendingGarbage &&
  prev.hatchingEnabled === next.hatchingEnabled &&
  publicPlayersEqual(prev.player, next.player)
));
