import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPlayerRngChannels } from '../rng';
import type { GameState, InputState } from '../types';
import { makePlayer, enqueueGarbage } from '../puzzle/runtime/engine';
import { matchStep } from '../puzzle/runtime/matchStep';
import { applyShopPurchase, applyScriptedShopAttack, type ScriptedShopAttackId } from '../puzzle/runtime/shop';
import { openPlayerShop, rollShopOnLineClear } from '../shop/playerShop';
import { GameActionsProvider, useGameActions, useMatchChromeSnapshot, useMatchTick, usePlayfieldSnapshot, type GameActions } from '../state/GameStateProvider';
import { setGameStateStore } from '../state/gameStateStore';
import { useKeyBindings } from '../input/KeyBindingsProvider';
import { actionForCode } from '../input/keyBindings';
import { deriveGameplayControlAvailability } from '../input/gameplayControls';
import { useOnScreenControlsPolicy } from '../input/onScreenControlsPolicy';
import { useShopConfirm } from '../hooks/useShopConfirm';
import { playfieldViewportPaddingClass, usePlayfieldLayoutMode } from '../responsive/playfieldLayoutMode';
import { ThemeBackground } from '../presentation/ThemeBackground';
import { MatchChrome } from './MatchChrome';
import { PlayfieldShell } from './PlayfieldShell';
import type { GameFieldRef } from './GameField';
import MobileControls from './MobileControls';
import { OnScreenControlsPreferenceButton } from './OnScreenControlsPreference';

const PLAYER_ID = 'preview-you';
const OPPONENT_ID = 'preview-rival';
const NEUTRAL_INPUT: InputState = { left: false, right: false, softDrop: false };

function createPreview() {
  const seed = 4207;
  const channels = {
    [PLAYER_ID]: createPlayerRngChannels(seed, PLAYER_ID),
    [OPPONENT_ID]: createPlayerRngChannels(seed, OPPONENT_ID),
  };
  const player = makePlayer(PLAYER_ID, channels[PLAYER_ID]);
  const opponent = makePlayer(OPPONENT_ID, channels[OPPONENT_ID]);
  player.displayName = 'You';
  opponent.displayName = 'Rival';
  player.funds = 240;
  opponent.funds = 160;
  opponent.holdPiece = { type: 'T' };
  for (const field of [player, opponent]) {
    for (let y = 16; y < 20; y += 1) {
      for (let x = 0; x < 10; x += 1) {
        if (x !== 4 && (x + y) % 5 !== 0) field.board[y][x] = 'T';
      }
    }
  }
  rollShopOnLineClear(player, channels[PLAYER_ID].shop);
  player.shop.offerIds = ['curtain', 'frost-shift', 'gravity-lure'];
  const state: GameState = {
    players: { [PLAYER_ID]: player, [OPPONENT_ID]: opponent },
    status: 'playing', countdown: 0, winnerId: null, tick: 600, seed,
  };
  applyScriptedShopAttack('curtain', player, state.tick);
  applyScriptedShopAttack('frost-shift', player, state.tick);
  applyScriptedShopAttack('curtain', opponent, state.tick);
  applyScriptedShopAttack('frost-shift', opponent, state.tick);
  return { state, channels };
}

function PreviewPlayfield() {
  const layoutMode = usePlayfieldLayoutMode();
  const chrome = useMatchChromeSnapshot();
  const matchTick = useMatchTick();
  const playfield = usePlayfieldSnapshot();
  const actions = useGameActions();
  const confirmShop = useShopConfirm();
  const bindings = useKeyBindings();
  const policy = useOnScreenControlsPolicy();
  const railRef = useRef<HTMLDivElement>(null);
  const myFieldRef = useRef<GameFieldRef>(null);
  const opponentRef = useRef<GameFieldRef>(null);
  const availability = deriveGameplayControlAvailability({
    active: chrome.status === 'playing', player: playfield.myPlayer, currentTick: matchTick,
    utility: { kind: 'shop', enabled: chrome.shopPhase !== 'waiting', onActivate: confirmShop },
  });
  const confirmRef = useRef(confirmShop);
  confirmRef.current = confirmShop;

  useEffect(() => {
    let held = { ...NEUTRAL_INPUT };
    const key = (event: KeyboardEvent, pressed: boolean) => {
      if (event.target instanceof HTMLElement && event.target.closest('button, input, select, textarea, summary')) return;
      const action = actionForCode(bindings, event.code);
      if (!action) return;
      event.preventDefault();
      if (action === 'moveLeft' || action === 'moveRight' || action === 'softDrop') {
        const field = action === 'moveLeft' ? 'left' : action === 'moveRight' ? 'right' : 'softDrop';
        held = { ...held, [field]: pressed };
        actions.sendInputState(held);
      } else if (pressed && !event.repeat) {
        if (action === 'shop') confirmRef.current();
        else actions.sendAction(action);
      }
    };
    const down = (event: KeyboardEvent) => key(event, true);
    const up = (event: KeyboardEvent) => key(event, false);
    const clear = () => { held = { ...NEUTRAL_INPUT }; actions.sendInputState(held); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      clear();
    };
  }, [actions, bindings]);

  return (
    <div className={`flex w-full justify-center ${playfieldViewportPaddingClass(layoutMode)}`}>
      <main className={`shape-showdown-screen battle-screen battle-screen--${layoutMode}`}>
        <MatchChrome actionSlot={<OnScreenControlsPreferenceButton />} />
        <PlayfieldShell railRef={railRef} myFieldRef={myFieldRef} oppDesktopFieldRef={opponentRef}
          layoutMode={layoutMode} hatchingEnabled={false} decorationSeed={4207}
          faceGrowthStartedAtMs={null} matchVisualKey="powerup-preview" />
        {policy.visible && <MobileControls onInput={actions.sendInputState} onAction={actions.sendAction} availability={availability} />}
      </main>
    </div>
  );
}

export default function PowerupUiPreview() {
  const [initialPreview] = useState(createPreview);
  const runtime = useRef(initialPreview);
  const [running, setRunning] = useState(false);
  const publish = useCallback(() => setGameStateStore(structuredClone(runtime.current.state), PLAYER_ID), []);
  useLayoutEffect(() => { publish(); return () => setGameStateStore(null, null); }, [publish]);
  const mutate = useCallback((change: (preview: ReturnType<typeof createPreview>) => void) => {
    change(runtime.current);
    publish();
  }, [publish]);
  const actions = useMemo<GameActions>(() => ({
    sendInputState: (input) => { runtime.current.state.players[PLAYER_ID].inputState = { ...input }; },
    sendAction: (action) => mutate(({ state, channels }) => {
      state.players[PLAYER_ID].actionQueue.push(action);
      matchStep(state, channels);
    }),
    sendShopOpen: () => mutate(({ state }) => { openPlayerShop(state.players[PLAYER_ID], state.tick); setRunning(true); }),
    sendShopPurchase: (itemId) => mutate(({ state, channels }) => {
      applyShopPurchase(state, state.players[PLAYER_ID], state.players[OPPONENT_ID], itemId, channels[PLAYER_ID]);
    }),
    cancelQueueSearch: async () => false, abandonMatch: async () => false,
    changeQueueScope: async () => null, findNewOpponent: async () => {},
    resetClientSession: () => {}, retryConnection: () => {},
  }), [mutate]);

  useEffect(() => {
    if (!running) {
      runtime.current.state.players[PLAYER_ID].inputState = { ...NEUTRAL_INPUT };
      return;
    }
    const interval = window.setInterval(() => {
      if (document.hidden) return;
      mutate(({ state, channels }) => {
        matchStep(state, channels);
        matchStep(state, channels);
        if (state.status === 'ended') setRunning(false);
      });
    }, 1000 / 30);
    return () => window.clearInterval(interval);
  }, [running, mutate]);

  const attack = (itemId: ScriptedShopAttackId) => mutate(({ state }) => {
    applyScriptedShopAttack(itemId, state.players[PLAYER_ID], state.tick);
  });
  const buttonClass = 'min-h-11 rounded-md border border-zinc-600 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 hover:border-emerald-300 focus-visible:outline-2 focus-visible:outline-emerald-300';
  return (
    <GameActionsProvider actions={actions}>
      <div className="relative min-h-dvh bg-[var(--ss-panel-well)] text-white">
        <ThemeBackground isPlaying decorationSeed={4207} />
        <PreviewPlayfield />
        <details className="relative z-20 mx-auto w-[calc(100%-24px)] max-w-3xl rounded-lg border border-zinc-600 bg-zinc-950 p-3 font-sans">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">UI playground · {running ? 'Live' : 'Paused'} · preview controls</summary>
          <p className="mb-3 text-xs leading-relaxed text-zinc-400">Start the clock to play. Opening the shop starts it automatically. Pause to inspect a warning; resize or zoom the browser to review layouts. This local preview uses the game runtime.</p>
          <div className="flex flex-wrap gap-2">
            <button className={buttonClass} onClick={() => setRunning((value) => !value)}>{running ? 'Pause clock' : 'Start clock'}</button>
            <button className={buttonClass} onClick={() => { runtime.current = createPreview(); setRunning(false); publish(); }}>Reset preview</button>
            <button className={buttonClass} onClick={() => attack('curtain')}>Incoming Curtain</button>
            <button className={buttonClass} onClick={() => attack('frost-shift')}>Freeze storage</button>
            <button className={buttonClass} onClick={() => attack('elixir-pulse')}>Poison piece</button>
            <button className={buttonClass} onClick={() => mutate(({ state }) => {
              applyScriptedShopAttack('curtain', state.players[OPPONENT_ID], state.tick);
              applyScriptedShopAttack('frost-shift', state.players[OPPONENT_ID], state.tick);
            })}>Attack opponent</button>
            <button className={buttonClass} onClick={() => mutate(({ state }) => {
              for (const id of ['curtain', 'frost-shift', 'elixir-pulse', 'gravity-lure', 'fortify-frame', 'quickstep-clock'] satisfies ScriptedShopAttackId[]) {
                applyScriptedShopAttack(id, state.players[PLAYER_ID], state.tick);
              }
              enqueueGarbage(state.players[PLAYER_ID], 4, state.tick);
            })}>Stack attacks + garbage</button>
            <button className={buttonClass} onClick={() => mutate(({ state, channels }) => {
              const old = state.players[PLAYER_ID];
              const clean = makePlayer(PLAYER_ID, channels[PLAYER_ID]);
              clean.displayName = old.displayName; clean.funds = old.funds; clean.shop = old.shop; clean.board = old.board;
              state.players[PLAYER_ID] = clean;
            })}>Clear effects</button>
            <button className={buttonClass} onClick={() => mutate(({ state, channels }) => rollShopOnLineClear(state.players[PLAYER_ID], channels[PLAYER_ID].shop))}>Fresh offers</button>
            <button className={buttonClass} onClick={() => mutate(({ state }) => { state.players[PLAYER_ID].funds = 0; })}>0 credits</button>
            <button className={buttonClass} onClick={() => mutate(({ state }) => { state.players[PLAYER_ID].funds = 500; })}>500 credits</button>
          </div>
          <a href="/" className="mt-3 inline-flex min-h-11 items-center text-xs text-emerald-300 underline">Back to landing</a>
        </details>
      </div>
    </GameActionsProvider>
  );
}
