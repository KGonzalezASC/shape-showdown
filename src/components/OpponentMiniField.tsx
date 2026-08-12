import React, { useMemo } from 'react';
import { BoardCanvasOverlay } from '../board/BoardCanvasOverlay';
import { buildBoardVisualModel } from '../board/boardVisualModel';
import {
  pendingGarbageTotal,
  publicPlayersEqual,
  type PublicPlayerState,
} from '../state/publicSnapshots';
import { BOARD_COLS, BOARD_VISIBLE_ROWS } from '../types';
import { VoronoiFlowfieldCanvas } from './VoronoiFlowfieldCanvas';
import { IncomingGarbageReadout } from './IncomingGarbageReadout';

interface OpponentMiniFieldProps {
  player: PublicPlayerState | null;
  hatchingEnabled: boolean;
  viewportMode?: 'phone' | 'tablet';
}

const MINI_CELL_SIZE = 5;

const OpponentMiniField: React.FC<OpponentMiniFieldProps> = ({
  player,
  hatchingEnabled,
  viewportMode = 'phone',
}) => {
  const shellClass = viewportMode === 'tablet'
    ? 'w-full border border-rose-500/30 bg-[#171919]/95 p-2 shadow-xl'
    : 'w-24 border border-rose-500/30 bg-[#171919]/95 p-1 shadow-xl';
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
      <div className={shellClass}>
        <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-rose-300/80">
          Opp
        </p>
        <IncomingGarbageReadout fieldTitle="Opponent Field" lines={0} compact />
        <div className="mt-1 flex h-[100px] items-center justify-center border border-rose-500/15 bg-[#141414] px-1">
          <p className="text-center text-[8px] uppercase tracking-widest text-zinc-500">
            Waiting
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={shellClass}>
      <div className="mb-1">
        <div className="flex items-center justify-between">
          <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-rose-300/80">
            Opp
          </p>
          <p className="font-mono text-[9px] font-bold text-rose-200">{player.funds}</p>
        </div>
        <IncomingGarbageReadout
          fieldTitle="Opponent Field"
          lines={pendingGarbageTotal(player.pendingGarbage)}
          compact
          magnetLevel={player.magnetPermanentStacks ?? 0}
        />
      </div>
      <div className="mx-auto w-fit overflow-hidden border border-rose-500/20">
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
            activePieceKey={visualModel.activePieceKey}
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
      </div>
    </div>
  );
};

export default React.memo(OpponentMiniField, (prev, next) => (
  prev.hatchingEnabled === next.hatchingEnabled &&
  publicPlayersEqual(prev.player, next.player)
));
