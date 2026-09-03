import React, { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw, Trophy, WifiOff } from 'lucide-react';
import { AnimatePresence, LazyMotion, domAnimation, m } from 'motion/react';
import { DrillConsole, DrillResult } from './components/DrillConsole';
import { MatchChrome } from './components/MatchChrome';
import { MatchScopePicker } from './components/MatchScopePicker';
import { PlayfieldShell } from './components/PlayfieldShell';
import { ServerDiagnosticsPanel } from './components/ServerDiagnosticsPanel';
import { ShapeLoadingSpinner } from './components/ShapeLoadingSpinner';
import MobileControls, { type MobileControlsRef } from './components/MobileControls';
import { OnScreenControlsPreferenceButton } from './components/OnScreenControlsPreference';
import { GameFieldRef } from './components/GameField';
import { BackgroundPrototype } from './components/BackgroundPrototype';
import { ThemeBackground } from './presentation/ThemeBackground';
import { ThemeProvider } from './presentation/ThemeProvider';
import { KeyBindingsProvider, useKeyBindings } from './input/KeyBindingsProvider';
import { actionForCode } from './input/keyBindings';
import { DEV_TOOLS_ENABLED } from './devTools';
import { DISCONNECT_SEAT_LEASE_MS } from './constants';
import { useLockDrill } from './hooks/useLockDrill';
import { useShopConfirm } from './hooks/useShopConfirm';
import {
  GameStateProvider,
  useGameActions,
  useGameState,
  useIsConnected,
  useMatchChromeSnapshot,
  useMatchDiagnostics,
  useMyId,
  usePlayfieldSnapshot,
  useServerHealth,
} from './state/GameStateProvider';
import { COUNTDOWN_SECONDS } from './types';
import type { ActionType, InputState } from './types';
import { isShopViewportUnplayable } from './responsive/shopViewportWarning';
import {
  playfieldScreenClass,
  playfieldViewportPaddingClass,
  usePlayfieldLayoutMode,
} from './responsive/playfieldLayoutMode';
import { mixDecorationSeed } from './presentation/decorationSeed';
import {
  readPreferredMatchScope,
  type SearchScope,
} from './matchmaking/searchScope';
import { setAppRoute } from './appRoute';
import { isDiscordActivityContext } from './discordContext';
import { relaunchForClientUpdate } from './discordActivity';
import {
  actionAvailabilityFor,
  deriveGameplayControlAvailability,
} from './input/gameplayControls';
import { useOnScreenControlsPolicy } from './input/onScreenControlsPolicy';


interface DrillState {
  enabled: boolean;
  result: DrillResult | null;
}

const VIEWPORT_WARNING_DELAY_MS = 300;

type DrillAction =
  | { type: 'TOGGLE' }
  | { type: 'SET_RESULT'; payload: DrillResult }
  | { type: 'CLEAR_RESULT' };

function drillReducer(state: DrillState, action: DrillAction): DrillState {
  switch (action.type) {
    case 'TOGGLE':
      return { ...state, enabled: !state.enabled };
    case 'SET_RESULT':
      return { ...state, result: action.payload };
    case 'CLEAR_RESULT':
      return { ...state, result: null };
    default:
      return state;
  }
}

interface AppShellState {
  showViewportWarning: boolean;
  hatchingEnabled: boolean;
  backgroundSeedKey: number;
  faceSeedKey: number;
  faceGrowthMatchSeed: number | null;
  faceGrowthStartedAtMs: number | null;
}

type AppShellAction =
  | { type: 'SET_VIEWPORT_WARNING'; visible: boolean }
  | { type: 'TOGGLE_HATCHING' }
  | { type: 'RESEED_PURCHASE'; matchSeed: number; startedAtMs: number }
  | { type: 'RESEED_COUNTDOWN' }
  | { type: 'RESEED_MATCH_START'; matchSeed: number; startedAtMs: number };

function createInitialAppShellState(): AppShellState {
  return {
    showViewportWarning: false,
    hatchingEnabled: false,
    backgroundSeedKey: 0,
    faceSeedKey: 0,
    faceGrowthMatchSeed: null,
    faceGrowthStartedAtMs: null,
  };
}

function appShellReducer(state: AppShellState, action: AppShellAction): AppShellState {
  switch (action.type) {
    case 'SET_VIEWPORT_WARNING':
      return state.showViewportWarning === action.visible
        ? state
        : { ...state, showViewportWarning: action.visible };
    case 'TOGGLE_HATCHING':
      return { ...state, hatchingEnabled: !state.hatchingEnabled };
    case 'RESEED_PURCHASE':
      return {
        ...state,
        backgroundSeedKey: state.backgroundSeedKey + 1,
        faceSeedKey: state.faceSeedKey + 1,
        faceGrowthMatchSeed: action.matchSeed,
        faceGrowthStartedAtMs: action.startedAtMs,
      };
    case 'RESEED_COUNTDOWN':
      return { ...state, backgroundSeedKey: state.backgroundSeedKey + 1 };
    case 'RESEED_MATCH_START':
      return {
        ...state,
        faceSeedKey: state.faceSeedKey + 1,
        faceGrowthMatchSeed: action.matchSeed,
        faceGrowthStartedAtMs: action.startedAtMs,
      };
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

export interface GameViewProps {
  onExitToLanding?: () => void;
}

export const GameView: React.FC<GameViewProps> = ({ onExitToLanding }) => {
  const connected = useIsConnected();
  const serverHealth = useServerHealth();
  const matchDiagnostics = useMatchDiagnostics();
  const gameState = useGameState();
  const myId = useMyId();
  const playfield = usePlayfieldSnapshot();
  const bindings = useKeyBindings();
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;
  const layoutMode = usePlayfieldLayoutMode();
  const hasLocalPlayer = Boolean(playfield.myPlayer);
  const [appShellState, appShellDispatch] = useReducer(
    appShellReducer,
    undefined,
    createInitialAppShellState,
  );
  const {
    showViewportWarning,
    hatchingEnabled,
    backgroundSeedKey,
    faceSeedKey,
    faceGrowthMatchSeed,
    faceGrowthStartedAtMs,
  } = appShellState;


  const chrome = useMatchChromeSnapshot();
  const {
    sendAction,
    sendInputState,
    resetClientSession,
    retryConnection,
    cancelQueueSearch,
    abandonMatch,
    changeQueueScope,
    findNewOpponent,
  } = useGameActions();
  const handleShopConfirm = useShopConfirm();
  const controlsPolicy = useOnScreenControlsPolicy();
  const showOnScreenControls = controlsPolicy.visible;
  const heldKeysRef = useRef<InputState>({ left: false, right: false, softDrop: false });
  const clearHeldInput = useCallback(() => {
    heldKeysRef.current = { left: false, right: false, softDrop: false };
    sendInputState({ left: false, right: false, softDrop: false });
  }, [sendInputState]);

  const isPlaying = chrome.status === 'playing';
  const isTerminalOutcome = chrome.status === 'ended';
  const isAuthoritativelyPaused = gameState?.pause !== undefined && !isTerminalOutcome;
  const isConnectionInterrupted = connected
    && !isTerminalOutcome
    && !isAuthoritativelyPaused
    && (
      matchDiagnostics.phase === 'reconnecting'
      || matchDiagnostics.phase === 'error'
      || matchDiagnostics.phase === 'session-invalid'
      || matchDiagnostics.phase === 'service-unavailable'
      || matchDiagnostics.phase === 'server-void'
    );
  const gameplayInputActive = connected
    && isPlaying
    && playfield.status === 'playing'
    && !isAuthoritativelyPaused
    && !isConnectionInterrupted;
  const controlsAvailability = useMemo(
    () => deriveGameplayControlAvailability({
      active: gameplayInputActive,
      player: playfield.myPlayer,
      currentTick: chrome.tick,
      utility: {
        kind: 'shop',
        enabled: gameplayInputActive && chrome.shopPhase !== 'waiting',
        ...(gameplayInputActive && chrome.shopPhase === 'waiting'
          ? { disabledReason: 'Shop is not available' }
          : !gameplayInputActive
            ? { disabledReason: 'Gameplay is not active' }
            : {}),
        onActivate: handleShopConfirm,
      },
    }),
    [chrome.shopPhase, chrome.tick, gameplayInputActive, handleShopConfirm, playfield.myPlayer],
  );
  const controlsAvailabilityRef = useRef(controlsAvailability);
  controlsAvailabilityRef.current = controlsAvailability;
  const controlsActiveRef = useRef(gameplayInputActive);
  controlsActiveRef.current = gameplayInputActive;

  const [queuedSearchScope, setQueuedSearchScope] = useState<SearchScope>(
    () => readPreferredMatchScope() ?? (isDiscordActivityContext() ? 'guild' : 'global'),
  );
  const changeSearchScope = async (scope: SearchScope): Promise<void> => {
    if (scope === queuedSearchScope) return;
    const effectiveScope = await changeQueueScope(scope);
    if (effectiveScope !== null) setQueuedSearchScope(effectiveScope);
  };

  const [queuedSeconds, setQueuedSeconds] = useState(0);
  useEffect(() => {
    if (matchDiagnostics.phase !== 'queued') {
      setQueuedSeconds(0);
      return;
    }
    const interval = window.setInterval(() => {
      setQueuedSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [matchDiagnostics.phase]);
  useEffect(() => {
    if (
      matchDiagnostics.phase === 'queued'
      && matchDiagnostics.effectiveSearchScope !== undefined
    ) {
      setQueuedSearchScope(matchDiagnostics.effectiveSearchScope);
    }
  }, [matchDiagnostics.effectiveSearchScope, matchDiagnostics.phase]);

  const [pauseSecondsRemaining, setPauseSecondsRemaining] = useState<number | null>(null);
  const pauseReturnTriggeredRef = useRef(false);
  useEffect(() => {
    const pauseStartedAt = gameState?.pause?.startedAt;
    if (pauseStartedAt === undefined || chrome.status === 'ended') {
      setPauseSecondsRemaining(null);
      return;
    }
    const updatePauseClock = () => {
      const elapsedMs = Math.max(0, Date.now() - pauseStartedAt);
      setPauseSecondsRemaining(
        Math.max(0, Math.ceil((DISCONNECT_SEAT_LEASE_MS - elapsedMs) / 1_000)),
      );
      if (elapsedMs >= DISCONNECT_SEAT_LEASE_MS && !pauseReturnTriggeredRef.current) {
        pauseReturnTriggeredRef.current = true;
        if (onExitToLanding) onExitToLanding();
        else setAppRoute('landing');
      }
    };
    updatePauseClock();
    const interval = window.setInterval(updatePauseClock, 250);
    return () => window.clearInterval(interval);
  }, [chrome.status, gameState?.pause?.startedAt, onExitToLanding]);

  useEffect(() => {
    if (chrome.endReason !== 'disconnect-forfeit' || pauseReturnTriggeredRef.current) return;
    pauseReturnTriggeredRef.current = true;
    if (onExitToLanding) onExitToLanding();
    else setAppRoute('landing');
  }, [chrome.endReason, onExitToLanding]);

  const stateRef = useRef({ playfield, myId });
  useLayoutEffect(() => {
    stateRef.current = { playfield, myId };
  }, [playfield, myId]);

  const railRef = useRef<HTMLDivElement>(null);
  const [drill, drillDispatch] = useReducer(drillReducer, { enabled: false, result: null });
  const lastShopPurchaseRef = useRef<string | null | undefined>(undefined);
  const lastCountdownDigitRef = useRef<number | null>(null);
  const lastMatchStatusRef = useRef(chrome.status);

  const myFieldRef = useRef<GameFieldRef>(null);
  const mobileControlsRef = useRef<MobileControlsRef>(null);
  const oppDesktopFieldRef = useRef<GameFieldRef>(null);

  const handleDrillResult = useCallback((result: DrillResult) => {
    drillDispatch({ type: 'SET_RESULT', payload: result });
  }, []);

  useLockDrill(
    DEV_TOOLS_ENABLED && drill.enabled,
    gameState,
    myId,
    sendAction,
    sendInputState,
    handleDrillResult,
  );

  const triggerShake = useCallback((isMe: boolean, type: 'soft' | 'medium') => {
    if (isMe) {
      myFieldRef.current?.shake(type);
    } else {
      oppDesktopFieldRef.current?.shake(type);
    }
  }, []);

  const handleAction = useCallback(
    (action: ActionType) => {
      const availability = actionAvailabilityFor(controlsAvailabilityRef.current, action);
      if (!availability.enabled) return;
      const me = stateRef.current.playfield.myPlayer;
      if (action === 'hardDrop' && me?.activePiece && !me.snagHardDropBlocked) {
        triggerShake(true, 'soft');
        myFieldRef.current?.hardDrop();
      }
      sendAction(action);
    },
    [sendAction, triggerShake],
  );

  useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    let animationFrame = 0;
    let warningTimer: number | null = null;
    let disposed = false;
    const shopCannotFit = () => {
      const offerList = rail.querySelector<HTMLElement>('.shop-offer-list');
      const offerRows = rail.querySelectorAll<HTMLElement>('.shop-offer-row');
      if (!offerList || offerRows.length === 0) return false;

      return isShopViewportUnplayable({
        viewportWidth: window.innerWidth,
        shopPhase: chrome.shopPhase,
        offerCount: offerRows.length,
        offerListHeight: offerList.clientHeight,
      });
    };
    const measure = () => {
      if (disposed) return;
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        if (!shopCannotFit()) {
          if (warningTimer !== null) {
            window.clearTimeout(warningTimer);
            warningTimer = null;
          }
          appShellDispatch({ type: 'SET_VIEWPORT_WARNING', visible: false });
          return;
        }

        if (warningTimer !== null) return;
        warningTimer = window.setTimeout(() => {
          warningTimer = null;
          if (!disposed && shopCannotFit()) {
            appShellDispatch({ type: 'SET_VIEWPORT_WARNING', visible: true });
          }
        }, VIEWPORT_WARNING_DELAY_MS);
      });
    };

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(rail);
    const offerList = rail.querySelector<HTMLElement>('.shop-offer-list');
    if (offerList) resizeObserver.observe(offerList);
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    void document.fonts.ready.then(measure);
    measure();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      if (warningTimer !== null) window.clearTimeout(warningTimer);
      resizeObserver.disconnect();
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
    };
  }, [chrome.shopPhase, connected, hasLocalPlayer, layoutMode, showOnScreenControls]);

  useEffect(() => {
    if (!drill.result) return;
    const t = window.setTimeout(() => drillDispatch({ type: 'CLEAR_RESULT' }), 2200);
    return () => window.clearTimeout(t);
  }, [drill.result]);

  useEffect(() => {
    if (!gameplayInputActive || showViewportWarning || !showOnScreenControls) clearHeldInput();
  }, [clearHeldInput, gameplayInputActive, showOnScreenControls, showViewportWarning]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (showViewportWarning) return;
      if (DEV_TOOLS_ENABLED) {
        if (e.key === 'F6') {
          e.preventDefault();
          drillDispatch({ type: 'TOGGLE' });
          return;
        }
      }
      const { playfield: pf, myId: id } = stateRef.current;
      if (!controlsActiveRef.current || pf.status !== 'playing' || !id || !pf.myPlayer) return;

      const action = actionForCode(bindingsRef.current, e.code);
      if (!action) return;

      e.preventDefault();
      if (action === 'moveLeft') {
        if (heldKeysRef.current.left) return;
        heldKeysRef.current = { ...heldKeysRef.current, left: true };
        sendInputState({ ...heldKeysRef.current });
      } else if (action === 'moveRight') {
        if (heldKeysRef.current.right) return;
        heldKeysRef.current = { ...heldKeysRef.current, right: true };
        sendInputState({ ...heldKeysRef.current });
      } else if (action === 'softDrop') {
        if (heldKeysRef.current.softDrop) return;
        heldKeysRef.current = { ...heldKeysRef.current, softDrop: true };
        sendInputState({ ...heldKeysRef.current });
      } else if (action === 'hardDrop') {
        handleAction('hardDrop');
      } else if (action === 'rotateCW') {
        if (e.repeat) return;
        handleAction('rotateCW');
      } else if (action === 'rotateCCW') {
        if (e.repeat) return;
        handleAction('rotateCCW');
      } else if (action === 'hold') {
        handleAction('hold');
      } else if (action === 'shop') {
        const utility = controlsAvailabilityRef.current.utility;
        if (utility.kind === 'shop' && utility.enabled) utility.onActivate();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (showViewportWarning) return;
      const action = actionForCode(bindingsRef.current, e.code);
      if (action === 'moveLeft') {
        heldKeysRef.current = { ...heldKeysRef.current, left: false };
        sendInputState({ ...heldKeysRef.current });
      } else if (action === 'moveRight') {
        heldKeysRef.current = { ...heldKeysRef.current, right: false };
        sendInputState({ ...heldKeysRef.current });
      } else if (action === 'softDrop') {
        heldKeysRef.current = { ...heldKeysRef.current, softDrop: false };
        sendInputState({ ...heldKeysRef.current });
      }
    };
    const clearInput = () => {
      heldKeysRef.current = { left: false, right: false, softDrop: false };
      sendInputState({ left: false, right: false, softDrop: false });
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearInput);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearInput);
      clearHeldInput();
    };
  }, [clearHeldInput, handleAction, handleShopConfirm, sendInputState, showViewportWarning]);

  useEffect(() => {
    const evt = chrome.lastMatchEvent;
    if (!evt) return;
    const isMe = !!(myId && evt.playerId === myId);
    if (evt.type === 'lineClear') {
      triggerShake(isMe, 'soft');
    } else if (evt.type === 'garbageApplied') {
      triggerShake(isMe, 'medium');
    }
  }, [chrome.lastMatchEvent, myId, triggerShake]);

  const showDeveloperReconnectHint = DEV_TOOLS_ENABLED
    && (
      matchDiagnostics.phase === 'reconnecting'
      || matchDiagnostics.phase === 'error'
    );
  // Keep the background's per-countdown reroll cadence unchanged. Shrine faces
  // use a separate seed so their entrance animation is not restarted per digit.
  const backgroundDecorationSeed = mixDecorationSeed(
    gameState?.seed ?? 4207,
    backgroundSeedKey,
  );
  const faceDecorationSeed = mixDecorationSeed(gameState?.seed ?? 4207, faceSeedKey);

  useEffect(() => {
    const purchasedId = chrome.shopLastPurchasedItemId;
    const prev = lastShopPurchaseRef.current;
    lastShopPurchaseRef.current = purchasedId;
    // Skip the first observe so reconnect/hydrate does not reseed.
    // Reseed only when a purchase lands (null→id or id→other id), not when the shop clears.
    if (prev === undefined) return;
    if (purchasedId && purchasedId !== prev) {
      appShellDispatch({
        type: 'RESEED_PURCHASE',
        matchSeed: gameState?.seed ?? 4207,
        startedAtMs: performance.now(),
      });
    }
  }, [chrome.shopLastPurchasedItemId, gameState?.seed]);

  // Reseed the background once per displayed 3→2→1 digit. This intentionally
  // remains independent from the face entrance trigger.
  useEffect(() => {
    if (chrome.status !== 'countdown') {
      lastCountdownDigitRef.current = null;
      return;
    }
    const digit = Math.ceil(chrome.countdown);
    if (digit < 1 || digit > COUNTDOWN_SECONDS) return;
    if (lastCountdownDigitRef.current === digit) return;
    lastCountdownDigitRef.current = digit;
    appShellDispatch({ type: 'RESEED_COUNTDOWN' });
  }, [chrome.status, chrome.countdown]);

  useEffect(() => {
    const previousStatus = lastMatchStatusRef.current;
    if (previousStatus === 'countdown' && chrome.status === 'playing') {
      appShellDispatch({
        type: 'RESEED_MATCH_START',
        matchSeed: gameState?.seed ?? 4207,
        startedAtMs: performance.now(),
      });
    }
    lastMatchStatusRef.current = chrome.status;
  }, [chrome.status, gameState?.seed]);

  return (
    <div className={`relative flex h-dvh max-h-dvh min-h-0 flex-col items-center justify-center overflow-hidden text-[var(--ss-text-primary)] ${playfieldViewportPaddingClass(layoutMode)}`}>
      <ThemeBackground isPlaying={isPlaying} decorationSeed={backgroundDecorationSeed} />
      {DEV_TOOLS_ENABLED && (
        <ServerDiagnosticsPanel
          connected={connected}
          database={serverHealth}
          tick={gameState?.tick ?? null}
          matchSeed={gameState?.seed ?? null}
          match={matchDiagnostics}
        />
      )}
      {!connected
        && (
          matchDiagnostics.phase === 'session-invalid'
          || matchDiagnostics.phase === 'protocol-mismatch'
          || matchDiagnostics.phase === 'server-void'
          || matchDiagnostics.phase === 'service-unavailable'
          || matchDiagnostics.phase === 'error'
        )
        && (
          <div
            role="alertdialog"
            aria-modal="true"
            className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0a0a0f]/85 p-4 backdrop-blur-md sm:p-8"
          >
            <div className="w-full max-w-[min(calc(100vw-2rem),28rem)] rounded-[1.5rem] border border-white/10 bg-[#1a1a1a] p-6 text-center shadow-2xl sm:rounded-[2rem] sm:p-10">
              <h2 className="mb-3 text-[18px] font-bold uppercase tracking-[0.08em] sm:text-[22px]">
                {matchDiagnostics.phase === 'session-invalid'
                  ? 'Guest session expired'
                  : matchDiagnostics.phase === 'protocol-mismatch'
                    ? 'Update required'
                    : matchDiagnostics.phase === 'server-void'
                      ? 'Match voided'
                      : matchDiagnostics.phase === 'service-unavailable'
                        ? 'Service unavailable'
                      : 'Unable to connect'}
              </h2>
              <p className="text-[9px] leading-5 text-zinc-400">
                {matchDiagnostics.phase === 'session-invalid'
                  ? 'This guest session cannot reclaim a match. Start a new guest session to continue.'
                  : matchDiagnostics.phase === 'protocol-mismatch'
                    ? matchDiagnostics.error ?? 'Reload the page to receive the current game protocol.'
                    : matchDiagnostics.phase === 'server-void'
                      ? 'The server voided this match. No player won.'
                      : matchDiagnostics.phase === 'service-unavailable'
                        ? 'The game service is unavailable. Retry when it is back online.'
                      : matchDiagnostics.error ?? 'The game server is unavailable.'}
              </p>
              {matchDiagnostics.phase === 'session-invalid' && (
                <button
                  type="button"
                  onClick={resetClientSession}
                  className="mt-6 rounded border border-emerald-300/60 px-4 py-2 text-[9px] uppercase tracking-[0.12em] text-emerald-200 transition hover:bg-emerald-300/10"
                >
                  Start new guest session
                </button>
              )}
              {matchDiagnostics.phase !== 'session-invalid' && (
                <button
                  type="button"
                  onClick={() => {
                    if (matchDiagnostics.phase === 'protocol-mismatch') {
                      void relaunchForClientUpdate();
                      return;
                    }
                    retryConnection();
                  }}
                  className="mt-6 rounded border border-amber-300/60 px-4 py-2 text-[9px] uppercase tracking-[0.12em] text-amber-200 transition hover:bg-amber-300/10"
                >
                  {matchDiagnostics.phase === 'protocol-mismatch'
                    ? (isDiscordActivityContext() ? 'Close Activity to update' : 'Reload to update')
                    : 'Retry connection'}
                </button>
              )}
            </div>
          </div>
        )}

      {!connected ? (
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-6 p-4">
          <ShapeLoadingSpinner cellSize={11} orbitDurationMs={4200} />
          <div className="ss-searching-card flex flex-col items-center gap-4 rounded-2xl p-5 shadow-2xl backdrop-blur-md">
            <p className="ss-searching-status text-[9px] uppercase tracking-[0.14em] animate-pulse">
              {matchDiagnostics.phase === 'queued'
                ? 'Searching for an opponent...'
                : matchDiagnostics.phase === 'assigned' || matchDiagnostics.phase === 'connecting'
                  ? 'Match assigned — connecting...'
                  : matchDiagnostics.phase === 'reconnecting'
                    ? 'Reconnecting to the match...'
                    : 'Connecting to Game Server...'}
            </p>
            {matchDiagnostics.repeatPairing && (
              <p
                role="status"
                className="ss-repeat-pairing-banner rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-1.5 text-[8px] sm:text-[9px] font-mono uppercase tracking-wider text-amber-200"
              >
                No fresh opponents available — rematch with your previous opponent
              </p>
            )}
            {matchDiagnostics.phase === 'queued' && (
              <div className="flex flex-col items-center gap-3">
                <MatchScopePicker value={queuedSearchScope} onChange={changeSearchScope} />
                {queuedSearchScope === 'guild' && queuedSeconds >= 15 && (
                  <div className="ss-search-expand-callout flex flex-col items-center gap-1.5 rounded-xl border border-emerald-500/20 bg-emerald-950/30 p-2.5 text-center">
                    <p className="ss-search-expand-text text-[8px] sm:text-[9px] text-emerald-300 font-mono">
                      Searching in chat for {queuedSeconds}s. No opponents yet.
                    </p>
                    <button
                      type="button"
                      onClick={() => changeSearchScope('global')}
                      className="ss-search-expand-btn rounded-lg border border-emerald-400/50 bg-emerald-500/20 px-3 py-1 text-[8px] sm:text-[9px] font-bold uppercase tracking-wider text-emerald-200 transition hover:bg-emerald-500/30"
                    >
                      Expand to Worldwide
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    const cancelled = await cancelQueueSearch();
                    if (cancelled) {
                      if (onExitToLanding) onExitToLanding();
                      else setAppRoute('landing');
                    }
                  }}
                  className="ss-search-cancel-btn text-[8px] sm:text-[9px] font-mono font-bold uppercase tracking-[0.14em]"
                >
                  Cancel Search
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <main
            inert={showViewportWarning || isConnectionInterrupted || isAuthoritativelyPaused || isTerminalOutcome}
            className={playfieldScreenClass(layoutMode)}
          >
            <MatchChrome
              actionSlot={
                <OnScreenControlsPreferenceButton
                  onBeforeChange={(next) => {
                    if (next === 'hidden') {
                      mobileControlsRef.current?.clearInput();
                      clearHeldInput();
                    }
                  }}
                />
              }
            />
            {DEV_TOOLS_ENABLED && drill.enabled && gameState && myId && gameState.players[myId] && (
              <DrillConsole
                player={gameState.players[myId]}
                enabled={drill.enabled}
                onToggle={() => drillDispatch({ type: 'TOGGLE' })}
                result={drill.result}
              />
            )}

            <PlayfieldShell
              railRef={railRef}
              myFieldRef={myFieldRef}
              oppDesktopFieldRef={oppDesktopFieldRef}
              layoutMode={layoutMode}
              hatchingEnabled={DEV_TOOLS_ENABLED && hatchingEnabled}
              decorationSeed={faceDecorationSeed}
              faceGrowthStartedAtMs={
                faceGrowthMatchSeed === (gameState?.seed ?? 4207) && faceSeedKey > 0
                  ? (faceGrowthStartedAtMs ?? null)
                  : null
              }
              matchVisualKey={
                matchDiagnostics.matchId ?? (gameState ? String(gameState.seed) : 'unassigned')
              }
              onToggleHatching={
                DEV_TOOLS_ENABLED
                  ? () => appShellDispatch({ type: 'TOGGLE_HATCHING' })
                  : undefined
              }
            />
            {showOnScreenControls && gameplayInputActive && (
              <MobileControls
                ref={mobileControlsRef}
                onInput={sendInputState}
                onAction={handleAction}
                availability={controlsAvailability}
              />
            )}
          </main>

          {showViewportWarning && (
            <div
              role="alertdialog"
              aria-modal="true"
              aria-live="assertive"
              aria-labelledby="viewport-warning-title"
              aria-describedby="viewport-warning-description"
              tabIndex={-1}
              className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/95 p-3 text-center"
            >
              <div className="w-full max-w-xl border-4 border-rose-400 bg-[#111] p-4 shadow-[8px_8px_0_#000] sm:p-6">
                <p className="mb-2 text-[8px] uppercase tracking-[0.16em] text-rose-300">Display warning</p>
                <h2
                  id="viewport-warning-title"
                  className="text-[clamp(16px,5vw,28px)] leading-tight uppercase text-white"
                >
                  The shop cannot fit
                </h2>
                <p
                  id="viewport-warning-description"
                  className="mx-auto mt-4 max-w-md text-[9px] leading-5 text-zinc-300"
                >
                  please play the game at playable resolution
                </p>
              </div>
            </div>
          )}

      <LazyMotion features={domAnimation}>
        <AnimatePresence>
          {chrome.status === 'countdown' && (
            <m.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 2 }}
              className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
            >
              <h1 className="text-white drop-shadow-2xl [font-size:min(18vw,8rem)] [text-shadow:4px_4px_0_#000]">
                {Math.ceil(chrome.countdown)}
              </h1>
            </m.div>
          )}

          {chrome.status === 'ended' && (
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="match-outcome-title"
              aria-describedby="match-outcome-description"
              className="fixed inset-0 bg-[#0a0a0f]/80 backdrop-blur-md flex items-center justify-center z-50 p-4 sm:p-8"
            >
              <div className="bg-[#1a1a1a] p-6 sm:p-10 md:p-12 rounded-[1.5rem] sm:rounded-[2rem] border border-white/10 shadow-2xl text-center max-w-[min(calc(100vw-2rem),28rem)] w-full">
                {chrome.endReason === 'server-void' ? (
                  <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-amber-300 sm:mb-6 sm:h-16 sm:w-16 md:h-20 md:w-20" />
                ) : (
                  <Trophy className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 text-yellow-400 mx-auto mb-4 sm:mb-6" />
                )}
                <h2
                  id="match-outcome-title"
                  className="text-[18px] sm:text-[22px] md:text-[26px] font-bold uppercase tracking-[0.08em] mb-2"
                >
                  {chrome.endReason === 'server-void' ? 'Match voided' : 'Game Over'}
                </h2>
                <p
                  id="match-outcome-description"
                  aria-live="assertive"
                  className="text-[8px] sm:text-[9px] text-zinc-400 mb-5 sm:mb-8"
                >
                  {chrome.endReason === 'server-void'
                    ? 'Match voided — no winner.'
                    : chrome.technicalVictory && chrome.winnerId === myId
                    ? 'Opponent disconnected. Technical victory!'
                    : chrome.technicalVictory && chrome.winnerId !== myId
                    ? 'You were disconnected. Your opponent received a technical victory.'
                    : chrome.winnerId === myId
                      ? 'You won the match!'
                      : chrome.winnerId === 'draw'
                        ? "It's a draw!"
                        : 'Opponent won the match.'}
                </p>
                <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-5 sm:mb-8">
                  <div className="bg-[#0a0a0f]/40 p-3 sm:p-4 rounded-xl sm:rounded-2xl">
                    <p className="text-[9px] sm:text-[10px] uppercase text-zinc-500 font-bold mb-1">Your Score</p>
                    <p className="text-xl sm:text-2xl font-mono">{chrome.myScore}</p>
                  </div>
                  <div className="bg-[#0a0a0f]/40 p-3 sm:p-4 rounded-xl sm:rounded-2xl">
                    <p className="text-[9px] sm:text-[10px] uppercase text-zinc-500 font-bold mb-1">Opponent</p>
                    <p className="text-xl sm:text-2xl font-mono">{chrome.oppScore}</p>
                  </div>
                </div>
                <p className="text-xs text-zinc-600 mb-4">
                  {chrome.restartTimer !== undefined
                    ? `Restarting level in ${Math.max(0, Math.ceil(chrome.restartTimer))} seconds...`
                    : 'Match completed.'}
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={findNewOpponent}
                    className="w-full sm:w-auto rounded-xl border border-emerald-400/60 bg-emerald-500/20 px-4 py-2 text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-200 transition hover:bg-emerald-500/30 shadow-md"
                  >
                    Find New Opponent
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (onExitToLanding) onExitToLanding();
                      else setAppRoute('landing');
                    }}
                    className="w-full sm:w-auto rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-200"
                  >
                    Return to Menu
                  </button>
                </div>
              </div>
            </m.div>
          )}

          {isAuthoritativelyPaused && (
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="fixed inset-0 z-[85] flex items-center justify-center bg-[#0a0a0f]/70 p-4 backdrop-blur-sm sm:p-8"
            >
              <div
                role="status"
                aria-live="polite"
                className="w-full max-w-[min(calc(100vw-2rem),28rem)] rounded-[1.5rem] border border-amber-200/20 bg-[#1a1a1a] p-6 text-center shadow-2xl sm:rounded-[2rem] sm:p-10"
              >
                <RefreshCw className="mx-auto mb-4 h-12 w-12 animate-spin text-amber-300 sm:mb-6 sm:h-16 sm:w-16" />
                <h2 className="mb-2 text-[18px] font-bold uppercase tracking-[0.08em] sm:text-[22px]">
                  Match paused
                </h2>
                <p className="text-[8px] leading-5 text-zinc-400 sm:text-[9px]">
                  {gameState?.pause?.playerId === myId
                    ? 'Your seat is being reclaimed. The match will resume from the server snapshot.'
                    : 'Opponent disconnected. Waiting to reconnect.'}
                </p>
                {pauseSecondsRemaining !== null && (
                  <p className="mt-3 text-[8px] uppercase tracking-[0.12em] text-amber-200/70 sm:text-[9px]">
                    Reconnect window: {pauseSecondsRemaining}s
                  </p>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    await abandonMatch();
                    if (onExitToLanding) onExitToLanding();
                    else setAppRoute('landing');
                  }}
                  className="mt-6 rounded border border-zinc-500/70 px-5 py-2 text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-300 transition hover:border-zinc-300 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </m.div>
          )}

          {isConnectionInterrupted && (
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0a0a0f]/80 p-4 backdrop-blur-md sm:p-8"
            >
              <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="connection-status-title"
                aria-describedby="connection-status-description"
                className="w-full max-w-[min(calc(100vw-2rem),28rem)] rounded-[1.5rem] border border-white/10 bg-[#1a1a1a] p-6 text-center shadow-2xl sm:rounded-[2rem] sm:p-10 md:p-12"
              >
                {matchDiagnostics.phase === 'server-void' ? (
                  <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-amber-300 sm:mb-6 sm:h-16 sm:w-16 md:h-20 md:w-20" />
                ) : matchDiagnostics.phase === 'reconnecting' ? (
                  <RefreshCw className="mx-auto mb-4 h-12 w-12 animate-spin text-amber-300 sm:mb-6 sm:h-16 sm:w-16 md:h-20 md:w-20" />
                ) : (
                  <WifiOff className="mx-auto mb-4 h-12 w-12 text-rose-300 sm:mb-6 sm:h-16 sm:w-16 md:h-20 md:w-20" />
                )}
                <h2
                  id="connection-status-title"
                  className="mb-2 text-[18px] font-bold uppercase tracking-[0.08em] sm:text-[22px] md:text-[26px]"
                >
                  {matchDiagnostics.phase === 'session-invalid'
                    ? 'Guest session expired'
                    : matchDiagnostics.phase === 'protocol-mismatch'
                    ? 'Update required'
                    : matchDiagnostics.phase === 'server-void'
                    ? 'Match voided'
                    : matchDiagnostics.phase === 'service-unavailable'
                    ? 'Service unavailable'
                    : matchDiagnostics.phase === 'reconnecting'
                    ? 'Connection Interrupted'
                    : 'Connection Lost'}
                </h2>
                <p
                  id="connection-status-description"
                  className="text-[8px] text-zinc-400 sm:text-[9px]"
                >
                  {matchDiagnostics.phase === 'session-invalid'
                    ? 'This guest session cannot reclaim the match. Start a new guest session to continue.'
                    : matchDiagnostics.phase === 'protocol-mismatch'
                    ? 'Reload to receive the current game protocol before reconnecting.'
                    : matchDiagnostics.phase === 'server-void'
                    ? 'The server voided this match. No player won.'
                    : matchDiagnostics.phase === 'service-unavailable'
                    ? 'The game service is unavailable. Retry when it is back online.'
                    : matchDiagnostics.phase === 'reconnecting'
                    ? 'Reconnecting to the match...'
                    : 'Unable to reach the game server. Waiting for the connection to return.'}
                </p>
                {showDeveloperReconnectHint && (
                  <p className="mt-4 border-t border-emerald-300/20 pt-3 text-left text-[8px] leading-4 text-emerald-100/75 sm:text-[9px]">
                    Developer note: to reclaim this seat after closing the client,
                    reopen this same origin in the same browser profile.
                    <span className="block text-emerald-100/50">
                      `localhost:3000` and `127.0.0.1:3000` use separate browser storage.
                      Reclaim uses the durable session, not a saved match ID.
                    </span>
                  </p>
                )}
                {matchDiagnostics.phase === 'session-invalid' && (
                  <button
                    type="button"
                    onClick={resetClientSession}
                    className="mt-6 rounded border border-emerald-300/60 px-4 py-2 text-[9px] uppercase tracking-[0.12em] text-emerald-200 transition hover:bg-emerald-300/10"
                  >
                    Start new guest session
                  </button>
                )}
                {(matchDiagnostics.phase === 'protocol-mismatch'
                  || matchDiagnostics.phase === 'service-unavailable') && (
                  <button
                    type="button"
                    onClick={() => {
                      if (matchDiagnostics.phase === 'protocol-mismatch') {
                        void relaunchForClientUpdate();
                        return;
                      }
                      retryConnection();
                    }}
                    className="mt-6 rounded border border-amber-300/60 px-4 py-2 text-[9px] uppercase tracking-[0.12em] text-amber-200 transition hover:bg-amber-300/10"
                  >
                    {matchDiagnostics.phase === 'protocol-mismatch'
                      ? (isDiscordActivityContext() ? 'Close Activity to update' : 'Reload to update')
                      : 'Retry connection'}
                  </button>
                )}
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </LazyMotion>

        </>
      )}
    </div>
  );
};

const App: React.FC<GameViewProps> = (props) => {
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
        <GameStateProvider>
          <GameView {...props} />
        </GameStateProvider>
      </KeyBindingsProvider>
    </ThemeProvider>
  );
};

export default App;
