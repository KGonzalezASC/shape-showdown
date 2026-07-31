import React from 'react';
import {
  isBoardPerformanceProfilingEnabled,
  recordBoardReactCommit,
  type BoardPerformanceRenderer,
} from './boardPerformance';

interface BoardProfilerProps {
  id: string;
  renderer: BoardPerformanceRenderer;
  children: React.ReactNode;
}

export function BoardProfiler({ id, renderer, children }: BoardProfilerProps) {
  if (!isBoardPerformanceProfilingEnabled()) return children;
  return (
    <React.Profiler
      id={id}
      onRender={(
        profilerId,
        phase,
        actualDuration,
        baseDuration,
        startTime,
        commitTime,
      ) => {
        recordBoardReactCommit(
          renderer,
          profilerId,
          phase,
          actualDuration,
          baseDuration,
          startTime,
          commitTime,
        );
      }}
    >
      {children}
    </React.Profiler>
  );
}
