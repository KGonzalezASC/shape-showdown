import React from 'react';
import { LOCK_RESET_CAP, PlayerState } from '../types';
import { SRSKickOverlay } from './SRSKickOverlay';

export type DrillResult = { status: 'pass' | 'fail'; message: string };

interface DrillConsoleProps {
  player: PlayerState;
  enabled: boolean;
  onToggle: () => void;
  result: DrillResult | null;
}

export const DrillConsole: React.FC<DrillConsoleProps> = ({ player, enabled, onToggle, result }) => (
  <>
    {result && (
      <div
        className={`mb-2 w-full max-w-5xl self-center rounded-lg border px-3 py-2 text-sm font-semibold ${
          result.status === 'pass'
            ? 'border-emerald-400/40 bg-emerald-950/30 text-emerald-200'
            : 'border-rose-400/40 bg-rose-950/30 text-rose-200'
        }`}
      >
        {result.message}
      </div>
    )}
    <div className="relative mb-2 hidden w-full max-w-5xl self-center rounded-lg border border-cyan-500/25 bg-cyan-950/15 px-3 py-2 text-xs text-cyan-100 lg:block">
      <SRSKickOverlay player={player} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-semibold uppercase tracking-wide">Lock Debug</div>
        <button
          type="button"
          onClick={onToggle}
          className={`rounded px-2 py-1 font-mono text-[11px] ${enabled ? 'bg-cyan-500/30 text-cyan-50' : 'bg-zinc-800 text-zinc-200'}`}
        >
          Drill {enabled ? 'ON' : 'OFF'} (F6)
        </button>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px]">
        <span>lockDelay: {player.lockDelayRemainingTicks}</span>
        <span>resetUsed: {player.lockResetsUsed}</span>
        <span>pieceY: {player.activePiece ? player.activePiece.y : 'none'}</span>
        <span>cap: {player.pieceLockResetCap ?? LOCK_RESET_CAP}</span>
        <span>
          lastKick:{' '}
          {player.lastSrsKick ? `${player.lastSrsKick.kx},${player.lastSrsKick.ky}` : '—'}
        </span>
      </div>
      <div className="mt-1 text-[10px] text-cyan-200/80">
        Soft-drops to ground, rotates until move-reset cap is spent, then probes with more rotations. Fails only if
        lockDelay jumps to full after cap without the piece stepping down (Y increase).
      </div>
    </div>
  </>
);
