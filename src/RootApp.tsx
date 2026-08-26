import React, { useEffect, useState } from 'react';
import LandingShowcase from './components/LandingShowcase';
import { GameView } from './App';
import { BackgroundPrototype } from './components/BackgroundPrototype';
import { ThemeProvider } from './presentation/ThemeProvider';
import { GameStateProvider } from './state/GameStateProvider';
import { DEV_TOOLS_ENABLED } from './devTools';
import { getAppRoute, setAppRoute, type AppRoute } from './appRoute';

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

  if (
    DEV_TOOLS_ENABLED
    && typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('prototype') === 'background'
  ) {
    return <BackgroundPrototype />;
  }

  return (
    <ThemeProvider>
      {route === 'landing' ? (
        <LandingShowcase onPlayGame={() => setAppRoute('game')} />
      ) : (
        <GameStateProvider>
          <GameView onExitToLanding={() => setAppRoute('landing')} />
        </GameStateProvider>
      )}
    </ThemeProvider>
  );
};

export default RootApp;
