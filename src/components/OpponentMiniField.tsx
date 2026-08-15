import React, { useMemo } from 'react';
import { BoardCanvasOverlay } from '../board/BoardCanvasOverlay';
import { buildBoardVisualModel } from '../board/boardVisualModel';
import {
  pendingGarbageTotal,
  publicPlayersEqual,
  type PublicPlayerState,
} from '../state/publicSnapshots';
import { BOARD_COLS, BOARD_VISIBLE_ROWS } from '../types';
import { useThemePackage } from '../presentation/ThemeProvider';
import { fieldFrameClass } from '../ui/shapeShowdownTheme';
import { VoronoiFlowfieldCanvas } from './VoronoiFlowfieldCanvas';
import { IncomingGarbageReadout } from './IncomingGarbageReadout';
import { BoardGridLines } from './BoardGridLines';

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
  const theme = useThemePackage();
  const shellClass = viewportMode === 'tablet'
    ? `w-full overflow-visible border ${fieldFrameClass('opponent')} p-2 shadow-xl`
    : `w-24 min-[661px]:w-full overflow-visible border ${fieldFrameClass('opponent')} p-1 min-[661px]:p-2 shadow-xl`;
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
        <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-[var(--ss-opponent-muted)]">
          Opp
        </p>
        <IncomingGarbageReadout fieldTitle="Opponent Field" lines={0} compact />
        <div className="mt-1 flex h-[100px] items-center justify-center border border-[var(--ss-opponent-border)] bg-[var(--ss-panel-well)] px-1">
          <p className="ss-opponent-waiting-text text-center text-[8px] font-bold uppercase tracking-widest">
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
          <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-[var(--ss-opponent-muted)]">
            Opp
          </p>
          <p className="font-mono text-[9px] font-bold text-[var(--ss-opponent-strong)]">{player.funds}</p>
        </div>
        <IncomingGarbageReadout
          fieldTitle="Opponent Field"
          lines={pendingGarbageTotal(player.pendingGarbage)}
          compact
          magnetLevel={player.magnetPermanentStacks ?? 0}
        />
      </div>
      <div className="mx-auto w-fit overflow-hidden border border-[var(--ss-opponent-border)]">
        <div
          className="relative bg-[var(--ss-panel-well)]"
          style={{
            width: BOARD_COLS * MINI_CELL_SIZE,
            height: BOARD_VISIBLE_ROWS * MINI_CELL_SIZE,
          }}
        >
          <BoardGridLines cellSize={MINI_CELL_SIZE} />
          <VoronoiFlowfieldCanvas
            visibleRows={visibleRows}
            visiblePoison={visiblePoison}
            activeCells={visualModel.activeCells}
            activePieceKey={visualModel.activePieceKey}
            cellSize={MINI_CELL_SIZE}
            poisonSpread={player.poisonSpread}
            performanceId="mobile-opponent-mini"
            piecePalette={theme.piecePalette}
            poisonPalette={theme.poisonPalette}
          />
          <BoardCanvasOverlay
            model={visualModel}
            cellSize={MINI_CELL_SIZE}
            performanceId="mobile-opponent-mini"
          />
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between text-[8px] font-semibold uppercase tracking-wider">
        <span className="text-[var(--ss-text-tertiary)]">
          Ln <span className="font-mono text-[var(--ss-text-primary)]">{player.linesCleared}</span>
        </span>
      </div>
    </div>
  );
};

export default React.memo(OpponentMiniField, (prev, next) => (
  prev.hatchingEnabled === next.hatchingEnabled &&
  publicPlayersEqual(prev.player, next.player)
));
