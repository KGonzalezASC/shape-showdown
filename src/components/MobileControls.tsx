import React from 'react';

interface MobileControlsProps {
  onInput: (input: { left: boolean; right: boolean; softDrop: boolean }) => void;
  onAction: (action: 'rotateCW' | 'rotateCCW' | 'hardDrop' | 'hold') => void;
}

const MobileControls: React.FC<MobileControlsProps> = ({ onInput, onAction }) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex h-36 items-center justify-between px-3 pb-5 md:hidden">
      <div className="flex gap-2">
        <button
          className="h-16 w-16 rounded-full bg-white/10 active:bg-white/20 flex items-center justify-center border border-white/10 shadow-lg select-none touch-none"
          onTouchStart={(e) => { e.preventDefault(); onInput({ left: true, right: false, softDrop: false }); }}
          onTouchEnd={(e) => { e.preventDefault(); onInput({ left: false, right: false, softDrop: false }); }}
        >
          <span className="text-2xl select-none pointer-events-none">←</span>
        </button>
        <button
          className="h-16 w-16 rounded-full bg-white/10 active:bg-white/20 flex items-center justify-center border border-white/10 shadow-lg select-none touch-none"
          onTouchStart={(e) => { e.preventDefault(); onInput({ left: false, right: true, softDrop: false }); }}
          onTouchEnd={(e) => { e.preventDefault(); onInput({ left: false, right: false, softDrop: false }); }}
        >
          <span className="text-2xl select-none pointer-events-none">→</span>
        </button>
        <button
          className="h-16 w-16 rounded-full bg-white/10 active:bg-white/20 flex items-center justify-center border border-white/10 shadow-lg select-none touch-none"
          onTouchStart={(e) => { e.preventDefault(); onInput({ left: false, right: false, softDrop: true }); }}
          onTouchEnd={(e) => { e.preventDefault(); onInput({ left: false, right: false, softDrop: false }); }}
        >
          <span className="text-xl font-bold select-none pointer-events-none">↓</span>
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          className="h-14 w-14 rounded-full bg-amber-500/20 active:bg-amber-500/40 flex items-center justify-center border border-amber-500/30 shadow-lg select-none touch-none text-xs font-bold"
          onTouchStart={(e) => { e.preventDefault(); onAction('rotateCCW'); }}
        >
          CCW
        </button>
        <button
          className="h-14 w-14 rounded-full bg-amber-500/20 active:bg-amber-500/40 flex items-center justify-center border border-amber-500/30 shadow-lg select-none touch-none text-xs font-bold"
          onTouchStart={(e) => { e.preventDefault(); onAction('rotateCW'); }}
        >
          CW
        </button>
        <button
          className="h-14 w-14 rounded-full bg-indigo-500/20 active:bg-indigo-500/40 flex items-center justify-center border border-indigo-500/30 shadow-lg select-none touch-none text-xs font-bold"
          onTouchStart={(e) => { e.preventDefault(); onAction('hold'); }}
        >
          HOLD
        </button>
        <button
          className="h-14 w-14 rounded-full bg-emerald-500/20 active:bg-emerald-500/40 flex items-center justify-center border border-emerald-500/30 shadow-lg select-none touch-none text-xs font-bold"
          onTouchStart={(e) => { e.preventDefault(); onAction('hardDrop'); }}
        >
          DROP
        </button>
      </div>
    </div>
  );
};

export default MobileControls;
