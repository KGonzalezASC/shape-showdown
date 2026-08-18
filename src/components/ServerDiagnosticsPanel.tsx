import React from 'react';
import { ServerHealthSnapshot } from '../types';

type ServerDiagnosticsPanelProps = {
  connected: boolean;
  database: ServerHealthSnapshot;
  tick: number | null;
  matchSeed: number | null;
};

export const ServerDiagnosticsPanel: React.FC<ServerDiagnosticsPanelProps> = ({
  connected,
  database,
  tick,
  matchSeed,
}) => {
  return (
    <aside
      aria-label="Backend diagnostics"
      className="fixed bottom-3 left-3 z-[60] w-48 border border-emerald-300/30 bg-[#06100d]/95 p-2 font-mono text-[9px] uppercase tracking-[0.08em] text-emerald-100 shadow-[4px_4px_0_rgba(0,0,0,0.45)] backdrop-blur-sm"
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
