import React, { useEffect, useRef, useState } from 'react';
import {
  PlayerState,
  GAME_WIDTH,
  GAME_HEIGHT,
  PADDLE_WIDTH,
  PADDLE_HEIGHT,
  BALL_RADIUS,
} from '../types';
import {
  SCORE_PER_BUBBLE,
  BALL_LOSS_SCORE_PENALTY,
  SCORE_FLOAT_DURATION_SEC,
} from '../constants';

interface GameFieldProps {
  player: PlayerState;
  isMe: boolean;
  title: string;
  borderColorClass: string;
  shadowColorClass: string;
  opacityClass?: string;
}

type FieldFloat = {
  id: string;
  x: number;
  y: number;
  text: string;
  tone: 'gain' | 'loss';
};

const GameField: React.FC<GameFieldProps> = ({
  player,
  isMe,
  title,
  borderColorClass,
  shadowColorClass,
  opacityClass = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prevPlayerRef = useRef<PlayerState | null>(null);
  const [fieldFloats, setFieldFloats] = useState<FieldFloat[]>([]);

  useEffect(() => {
    const prev = prevPlayerRef.current;
    if (prev && prev.id === player.id) {
      for (const b of prev.bubbles) {
        if (!b.active) continue;
        const cur = player.bubbles.find((x) => x.id === b.id);
        if (cur && !cur.active) {
          const id = `bf-${b.id}-${performance.now()}-${Math.random().toString(36).slice(2, 8)}`;
          setFieldFloats((fs) => [
            ...fs,
            { id, x: b.x, y: b.y, text: `+${SCORE_PER_BUBBLE}`, tone: 'gain' },
          ]);
        }
      }

      if (prev.ballActive && !player.ballActive) {
        const x = Math.max(24, Math.min(GAME_WIDTH - 24, prev.ballPos.x));
        const y = Math.min(GAME_HEIGHT - 12, Math.max(prev.ballPos.y, GAME_HEIGHT * 0.72));
        const id = `df-${performance.now()}-${Math.random().toString(36).slice(2, 8)}`;
        setFieldFloats((fs) => [
          ...fs,
          { id, x, y, text: `-${BALL_LOSS_SCORE_PENALTY}`, tone: 'loss' },
        ]);
      }
    }
    prevPlayerRef.current = player;
  }, [player]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    ctx.fillStyle = isMe ? '#1a1a1a' : '#141414';
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    player.bubbles.forEach((bubble) => {
      if (!bubble.active) return;
      ctx.beginPath();
      ctx.arc(bubble.x, bubble.y, bubble.radius, 0, Math.PI * 2);
      ctx.fillStyle = bubble.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.stroke();
      ctx.closePath();
    });

    ctx.fillStyle = isMe ? '#4ade80' : '#f87171';
    ctx.fillRect(player.paddleX, GAME_HEIGHT - PADDLE_HEIGHT, PADDLE_WIDTH, PADDLE_HEIGHT);

    const showBall = player.ballActive || (!player.ballActive && player.canShoot);
    if (showBall) {
      ctx.beginPath();
      ctx.arc(player.ballPos.x, player.ballPos.y, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      if (!player.ballActive && player.canShoot) {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.closePath();
    }
  }, [player, isMe]);

  return (
    <div className={`relative ${opacityClass}`}>
      <div className="mb-2 flex justify-between items-end">
        <h2
          className={`text-sm font-bold uppercase tracking-widest ${isMe ? 'text-emerald-400' : 'text-rose-400'}`}
        >
          {title}
        </h2>
        {!player.ballActive && player.shootDelay > 0 && (
          <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-mono tabular-nums">
            Next ball in {(Math.ceil(player.shootDelay * 10) / 10).toFixed(1)}s
          </span>
        )}
        {isMe && !player.ballActive && player.canShoot && (
          <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">
            Press SPACE to Shoot
          </span>
        )}
      </div>
      <div
        className={`relative overflow-hidden rounded-xl border-2 ${borderColorClass} shadow-2xl ${shadowColorClass}`}
        style={{ width: GAME_WIDTH, height: GAME_HEIGHT }}
      >
        <canvas ref={canvasRef} width={GAME_WIDTH} height={GAME_HEIGHT} className="block" />
        {fieldFloats.map((f) => (
          <div
            key={f.id}
            className="pointer-events-none absolute z-20"
            style={{
              left: f.x,
              top: f.y,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <span
              role="presentation"
              style={{ animationDuration: `${SCORE_FLOAT_DURATION_SEC}s` }}
              className={`block font-bold tabular-nums drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] animate-score-float-field ${
                f.tone === 'gain' ? 'text-emerald-400' : 'text-rose-400'
              } text-xs`}
              onAnimationEnd={() =>
                setFieldFloats((fs) => fs.filter((x) => x.id !== f.id))
              }
            >
              {f.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default GameField;
