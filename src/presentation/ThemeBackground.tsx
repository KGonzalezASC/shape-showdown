import React from 'react';
import {
  BG_BLUR_IDLE,
  BG_BLUR_MATCH,
  DispersedVoronoiBackground,
} from '../components/DispersedVoronoiBackground';
import { ComicHalftoneBackground } from '../components/ComicHalftoneBackground';
import { useThemePackage } from './ThemeProvider';

interface ThemeBackgroundProps {
  isPlaying: boolean;
  decorationSeed: number;
}

/** Theme-owned page background. Downwell unmounts the Voronoi tile instead of hiding it. */
export function ThemeBackground({ isPlaying, decorationSeed }: ThemeBackgroundProps) {
  const theme = useThemePackage();
  if (theme.background.kind === 'solid') {
    return (
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{ backgroundColor: theme.background.color }}
        aria-hidden
      />
    );
  }

  if (theme.background.kind === 'comic-halftone') {
    return <ComicHalftoneBackground />;
  }

  return (
    <DispersedVoronoiBackground
      scrimOpacity={isPlaying ? theme.background.scrimMatch : theme.background.scrimIdle}
      blur={isPlaying ? BG_BLUR_MATCH : BG_BLUR_IDLE}
      decorationSeed={decorationSeed}
      palette={theme.background.palette}
    />
  );
}
