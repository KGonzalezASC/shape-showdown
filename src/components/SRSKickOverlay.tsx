import React, { useEffect, useReducer, useRef } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { PlayerState } from '../types';
import { statusPillClass } from '../ui/shapeShowdownTheme';

interface SRSKickOverlayProps {
  player: PlayerState;
}

type KickPopup = { kx: number; ky: number } | null;
type KickPopupAction = { type: 'SHOW'; popup: { kx: number; ky: number } } | { type: 'HIDE' };

function kickPopupReducer(_state: KickPopup, action: KickPopupAction): KickPopup {
  return action.type === 'SHOW' ? action.popup : null;
}

export const SRSKickOverlay: React.FC<SRSKickOverlayProps> = ({ player }) => {
  const [kickPopup, dispatchKickPopup] = useReducer(kickPopupReducer, null);
  const prevKickNonceRef = useRef(0);
  const kickPopupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (kickPopupTimeoutRef.current) clearTimeout(kickPopupTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const n = player.srsKickNonce ?? 0;
    if (n > prevKickNonceRef.current && player.lastSrsKick) {
      if (kickPopupTimeoutRef.current) clearTimeout(kickPopupTimeoutRef.current);
      dispatchKickPopup({ type: 'SHOW', popup: { kx: player.lastSrsKick.kx, ky: player.lastSrsKick.ky } });
      kickPopupTimeoutRef.current = setTimeout(() => dispatchKickPopup({ type: 'HIDE' }), 480);
    }
    prevKickNonceRef.current = n;
  }, [player.srsKickNonce, player.lastSrsKick]);

  return (
    <AnimatePresence>
      {kickPopup && (
        <m.div
          key={`${kickPopup.kx},${kickPopup.ky}-${player.srsKickNonce ?? 0}`}
          initial={{ opacity: 0, scale: 0.92, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: -4 }}
          transition={{ type: 'spring', stiffness: 520, damping: 28 }}
          className={`pointer-events-none absolute -top-2 right-3 z-10 ${statusPillClass('white')}`}
        >
          Kick {kickPopup.kx >= 0 ? '+' : ''}
          {kickPopup.kx},{kickPopup.ky >= 0 ? '+' : ''}
          {kickPopup.ky}
        </m.div>
      )}
    </AnimatePresence>
  );
};
