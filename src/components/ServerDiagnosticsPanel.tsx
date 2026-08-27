import React, { useEffect, useState } from 'react';
import { MatchConnectionDiagnostics, ServerHealthSnapshot } from '../types';

type ServerDiagnosticsPanelProps = {
  connected: boolean;
  database: ServerHealthSnapshot;
  tick: number | null;
  matchSeed: number | null;
  match: MatchConnectionDiagnostics;
};

const STORAGE_KEY = 'shape-showdown.dev-diagnostics.collapsed';

export const ServerDiagnosticsPanel: React.FC<ServerDiagnosticsPanelProps> = ({
  connected,
  database,
  tick,
  matchSeed,
  match,
}) => {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) return stored === 'true';
      return typeof window !== 'undefined' && window.innerWidth < 661;
    } catch {
      return false;
    }
  });

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F7') {
        e.preventDefault();
        toggleCollapsed();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggleCollapsed}
        title="Expand backend diagnostics (F7)"
        className="fixed top-2 left-2 z-[60] inline-flex items-center gap-1.5 rounded border border-emerald-300/30 bg-[#06100d]/90 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-emerald-100 shadow-[2px_2px_0_rgba(0,0,0,0.4)] backdrop-blur-sm hover:border-emerald-300/70 active:scale-95 transition-transform select-none min-[661px]:top-auto min-[661px]:bottom-3 min-[661px]:left-3"
      >
        <span
          aria-hidden="true"
          className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-300 shadow-[0_0_6px_#6ee7b7]' : 'bg-rose-400'}`}
        />
        <span>DEV HUD {tick !== null ? `· ${tick}` : ''}</span>
        <span className="text-[8px] text-emerald-300/60">[+]</span>
      </button>
    );
  }

  return (
    <aside
      aria-label="Backend diagnostics"
      className="fixed top-2 left-2 z-[60] w-64 max-w-[calc(100vw-1rem)] border border-emerald-300/30 bg-[#06100d]/95 p-2 font-mono text-[9px] uppercase tracking-[0.08em] text-emerald-100 shadow-[4px_4px_0_rgba(0,0,0,0.45)] backdrop-blur-sm select-none min-[661px]:top-auto min-[661px]:bottom-3 min-[661px]:left-3"
    >
      <div className="mb-1.5 flex items-center justify-between border-b border-emerald-300/20 pb-1.5 text-[10px] font-bold">
        <div className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-300 shadow-[0_0_8px_#6ee7b7]' : 'bg-rose-400'}`}
          />
          <span>{connected ? 'Backend connected' : 'Backend offline'}</span>
        </div>
        <button
          type="button"
          onClick={toggleCollapsed}
          title="Minimize diagnostics (F7)"
          className="rounded border border-emerald-300/30 px-1 py-0.5 text-[8px] text-emerald-200 hover:bg-emerald-950 active:scale-95"
        >
          [—]
        </button>
      </div>
      <DiagnosticRow label="Authority" value="Server" />
      <DiagnosticRow label="Server tick" value={tick === null ? '—' : String(tick)} />
      <DiagnosticRow label="Match seed" value={matchSeed === null ? '—' : String(matchSeed)} />
      <DiagnosticRow label="DB mode" value={databaseModeLabel(database.databaseMode)} />
      <DiagnosticRow label="DB check" value={databaseHealthLabel(database.databaseHealth)} />
      <DiagnosticRow label="Schema" value={database.migrationsReady ? 'Ready' : 'Pending'} />
      <div className="my-1 border-t border-emerald-300/20" />
      <DiagnosticRow label="Assignment" value={matchPhaseLabel(match.phase)} />
      <DiagnosticRow label="Durable player" value={shortIdentifier(match.playerId)} />
      <DiagnosticRow label="DB match" value={shortIdentifier(match.matchId)} />
      <DiagnosticRow label="Seat" value={match.seat ?? '—'} />
      <DiagnosticRow label="Protocol" value={match.protocolVersion === null ? '—' : String(match.protocolVersion)} />
      <DiagnosticRow label="Ticket" value={ticketLabel(match)} />
      {match.error !== null && (
        <div className="mt-1 break-words border-t border-rose-300/20 pt-1 text-[8px] normal-case tracking-normal text-rose-200">
          {match.error}
        </div>
      )}
    </aside>
  );
};

function DiagnosticRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-2 leading-4">
      <span className="text-emerald-100/55">{label}</span>
      <span className="text-right text-emerald-100">{value}</span>
    </div>
  );
}

function databaseModeLabel(mode: ServerHealthSnapshot['databaseMode']): string {
  switch (mode) {
    case 'postgres':
      return 'Postgres';
    case 'in-memory':
      return 'In-memory';
    case 'unknown':
      return '—';
    default: {
      const exhaustive: never = mode;
      return exhaustive;
    }
  }
}

function databaseHealthLabel(
  status: ServerHealthSnapshot['databaseHealth'],
): string {
  switch (status) {
    case 'healthy':
      return 'Healthy';
    case 'unavailable':
      return 'Unavailable';
    case 'not-configured':
      return 'Not configured';
    case 'unknown':
      return 'Checking';
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

function matchPhaseLabel(phase: MatchConnectionDiagnostics['phase']): string {
  switch (phase) {
    case 'idle':
      return 'Idle';
    case 'acquiring-session':
      return 'Session';
    case 'queued':
      return 'Queued';
    case 'assigned':
      return 'Assigned';
    case 'reconnecting':
      return 'Reconnecting';
    case 'connecting':
      return 'Ticket connecting';
    case 'connected':
      return 'Ticket connected';
    case 'session-invalid':
      return 'Session invalid';
    case 'service-unavailable':
      return 'Service unavailable';
    case 'protocol-mismatch':
      return 'Protocol mismatch';
    case 'server-void':
      return 'Match void';
    case 'error':
      return 'Error';
    default: {
      const exhaustive: never = phase;
      return exhaustive;
    }
  }
}

function ticketLabel(match: MatchConnectionDiagnostics): string {
  if (match.ticketState === 'none') return 'None';
  const length = match.ticketLength === null ? '' : ` (${match.ticketLength} chars)`;
  return `${match.ticketState}${length}`;
}

function shortIdentifier(value: string | null): string {
  if (value === null) return '—';
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}
