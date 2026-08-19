import React from 'react';
import { MatchConnectionDiagnostics, ServerHealthSnapshot } from '../types';

type ServerDiagnosticsPanelProps = {
  connected: boolean;
  database: ServerHealthSnapshot;
  tick: number | null;
  matchSeed: number | null;
  match: MatchConnectionDiagnostics;
};

export const ServerDiagnosticsPanel: React.FC<ServerDiagnosticsPanelProps> = ({
  connected,
  database,
  tick,
  matchSeed,
  match,
}) => {
  return (
    <aside
      aria-label="Backend diagnostics"
      className="fixed bottom-3 left-3 z-[60] w-64 border border-emerald-300/30 bg-[#06100d]/95 p-2 font-mono text-[9px] uppercase tracking-[0.08em] text-emerald-100 shadow-[4px_4px_0_rgba(0,0,0,0.45)] backdrop-blur-sm"
    >
      <div className="mb-1.5 flex items-center gap-1.5 border-b border-emerald-300/20 pb-1.5 text-[10px] font-bold">
        <span
          aria-hidden="true"
          className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-300 shadow-[0_0_8px_#6ee7b7]' : 'bg-rose-400'}`}
        />
        <span>{connected ? 'Backend connected' : 'Backend offline'}</span>
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
