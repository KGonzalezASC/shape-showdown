import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { PlayerState } from '../types';

interface SRSKickOverlayProps {
  player: PlayerState;
}

export const SRSKickOverlay: React.FC<SRSKickOverlayProps> = ({ player }) => {
  const [kickPopup, setKickPopup] = useState<{ kx: number; ky: number } | null>(null);
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
      setKickPopup({ kx: player.lastSrsKick.kx, ky: player.lastSrsKick.ky });
      kickPopupTimeoutRef.current = setTimeout(() => setKickPopup(null), 480);
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
          className="pointer-events-none absolute -top-2 right-3 z-10 rounded border border-amber-400/45 bg-amber-950/95 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-tight text-amber-100 shadow-md shadow-amber-950/50"
        >
          Kick {kickPopup.kx >= 0 ? '+' : ''}
          {kickPopup.kx},{kickPopup.ky >= 0 ? '+' : ''}
          {kickPopup.ky}
        </m.div>
      )}
    </AnimatePresence>
  );
};
