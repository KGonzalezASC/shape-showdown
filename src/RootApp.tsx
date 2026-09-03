import React, { useEffect, useState } from 'react';
import LandingShowcase from './components/LandingShowcase';
import { GameView } from './App';
import { BackgroundPrototype } from './components/BackgroundPrototype';
import { ThemeProvider } from './presentation/ThemeProvider';
import { KeyBindingsProvider } from './input/KeyBindingsProvider';
import { GameStateProvider } from './state/GameStateProvider';
import { DEV_TOOLS_ENABLED } from './devTools';
import { getAppRoute, setAppRoute, type AppRoute } from './appRoute';
import { useDocumentInteractionPolicy } from './input/documentInteractionPolicy';

const LazyPuzzleScreen = React.lazy(() => import('./components/PuzzleScreen'));

export const RootApp: React.FC = () => {
  const [route, setRoute] = useState<AppRoute>(() => getAppRoute());

  useEffect(() => {
    const handleRouteChange = () => {
      setRoute(getAppRoute());
    };

    window.addEventListener('hashchange', handleRouteChange);
    window.addEventListener('popstate', handleRouteChange);
    return () => {
      window.removeEventListener('hashchange', handleRouteChange);
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.page = route === 'game' ? 'game' : 'landing';
  }, [route]);
  useDocumentInteractionPolicy(
    route === 'landing' ? 'landing' : route === 'puzzles' ? 'puzzle-picker' : 'gameplay',
  );

  if (
    DEV_TOOLS_ENABLED
    && typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('prototype') === 'background'
  ) {
    return <BackgroundPrototype />;
  }

  return (
    <ThemeProvider>
      <KeyBindingsProvider>
        {route === 'landing' ? (
          <LandingShowcase onPlayGame={() => setAppRoute('game')} />
        ) : route === 'puzzles' ? (
          <React.Suspense
            fallback={
              <div className="flex h-dvh w-full items-center justify-center bg-[#07080b] font-mono text-xs uppercase tracking-widest text-zinc-500">
                Loading puzzle runtime...
              </div>
            }
          >
            <LazyPuzzleScreen />
          </React.Suspense>
        ) : (
          <GameStateProvider>
            <GameView onExitToLanding={() => setAppRoute('landing')} />
          </GameStateProvider>
        )}
      </KeyBindingsProvider>
    </ThemeProvider>
  );
};

export default RootApp;
