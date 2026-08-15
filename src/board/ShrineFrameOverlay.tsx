import React, { useMemo } from 'react';
import { BOARD_COLS, BOARD_VISIBLE_ROWS } from '../types';
import type { FieldRole } from '../ui/shapeShowdownTheme';
import { seededDecorationUnit } from '../presentation/decorationSeed';
import { buildShrineLayout, SHRINE_PAD_PX, type ShrineFace } from './shrineLayout';
import {
  HORIZONTAL_GROWTH_SEGMENTS,
  SIDE_GROWTH_SEGMENTS,
  SHRINE_FACE_GROWTH_STAGGER_MS,
  SHRINE_FACE_PATH,
  SHRINE_GROWTH_BRIDGE_PATH,
  shrineGrowthAnimationDelayMs,
} from './shrineFaceGrowth';

interface ShrineFrameOverlayProps {
  cellSize: number;
  seed: number;
  showFaces: boolean;
  faceGrowthStartedAtMs: number | null;
  fieldRole: FieldRole;
}

export const ShrineFieldBoundary = React.memo(function ShrineFieldBoundary() {
  return (
    <svg
      className="ss-shrine-field-boundary pointer-events-none absolute z-[5]"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      <g fill="none" className="ss-shrine-field-boundary-lines">
        <path d="M 0 0 H 18.33 M 31.67 0 H 68.33 M 81.67 0 H 100" />
        <path d="M 0 100 H 27.33 M 40.67 100 H 73.33 M 86 100 H 100" />
        <path d="M 0 0 V 31.48 M 0 39.81 V 75 M 0 82.41 V 100" />
        <path d="M 100 0 V 17.59 M 100 25.93 V 59.26 M 100 66.67 V 100" />
      </g>
    </svg>
  );
});

function ShrineFaceSvg({
  face,
  boardLeft,
  boardTop,
  boardWidth,
  boardHeight,
  scale,
  staggerMs,
  blinkDelayMs,
  faceGrowthStartedAtMs,
  animationNowMs,
}: {
  face: ShrineFace;
  boardLeft: number;
  boardTop: number;
  boardWidth: number;
  boardHeight: number;
  scale: number;
  staggerMs: number;
  blinkDelayMs: number;
  faceGrowthStartedAtMs: number | null;
  animationNowMs: number;
}) {
  const animateFace = faceGrowthStartedAtMs !== null;
  const delayStyle = animateFace
    ? {
        animationDelay: `${shrineGrowthAnimationDelayMs(
          staggerMs,
          faceGrowthStartedAtMs,
          animationNowMs,
        )}ms`,
      }
    : undefined;
  const blinkStyle = { animationDelay: `${blinkDelayMs}ms` };
  const growthSegments = face.side === 'top'
    ? HORIZONTAL_GROWTH_SEGMENTS
    : SIDE_GROWTH_SEGMENTS;

  let transform = '';
  if (face.side === 'top') {
    const centerX = boardLeft + boardWidth * face.centerPercent / 100;
    transform = `translate(${centerX} ${boardTop}) scale(${scale})`;
  } else {
    const centerY = boardTop + boardHeight * face.centerPercent / 100;
    const edgeX = face.side === 'right' ? boardLeft + boardWidth : boardLeft;
    transform = `translate(${edgeX} ${centerY}) rotate(${face.side === 'right' ? 90 : -90}) scale(${scale})`;
  }

  return (
    <g className="ss-shrine-face-svg" transform={transform}>
      {animateFace && growthSegments.map(({ anchor, d, goopD }) => (
          <g key={anchor}>
            <path
              d={goopD}
              className={`ss-shrine-grow-goop ss-shrine-grow-goop--${anchor}`}
              style={delayStyle}
            />
            <path
              d={d}
              className={`ss-shrine-grow-taper ss-shrine-grow-taper--${anchor}`}
              style={delayStyle}
            />
          </g>
        ))}
      <path
        d={SHRINE_GROWTH_BRIDGE_PATH}
        className={animateFace ? 'ss-shrine-grow-bridge' : undefined}
        style={delayStyle}
      />
      <g
        className={animateFace ? 'ss-shrine-grow-body' : undefined}
        style={delayStyle}
      >
        <path d={SHRINE_FACE_PATH} />
        <g
          className={animateFace ? 'ss-shrine-grow-eye' : undefined}
          style={delayStyle}
        >
          <circle className="ss-shrine-face-eye ss-shrine-blink-eye" cx="-8" cy="-4.5" r="3" style={blinkStyle} />
          <circle className="ss-shrine-face-eye ss-shrine-blink-eye" cx="8" cy="-4.5" r="3" style={blinkStyle} />
        </g>
      </g>
    </g>
  );
}

export const ShrineFrameOverlay = React.memo(function ShrineFrameOverlay({
  cellSize,
  seed,
  showFaces,
  faceGrowthStartedAtMs,
  fieldRole,
}: ShrineFrameOverlayProps) {
  const layout = useMemo(() => buildShrineLayout(seed), [seed]);
  const boardWidth = BOARD_COLS * cellSize;
  const boardHeight = BOARD_VISIBLE_ROWS * cellSize;
  const pad = SHRINE_PAD_PX;
  const scale = cellSize / 30;
  const topFace = layout.faces.find((face) => face.side === 'top');
  const rightFace = layout.faces.find((face) => face.side === 'right');
  const leftFace = layout.faces.find((face) => face.side === 'left');
  const topFaceX = topFace ? pad + boardWidth * topFace.centerPercent / 100 : 0;
  const rightFaceY = rightFace ? pad + boardHeight * rightFace.centerPercent / 100 : 0;
  const leftFaceY = leftFace ? pad + boardHeight * leftFace.centerPercent / 100 : 0;
  const topGap = 24 * scale;
  const sideGap = 30 * scale;
  const animationNowMs = performance.now();

  return (
    <div
      className={`ss-shrine-overlay--${fieldRole} pointer-events-none absolute z-[5]`}
      style={{
        left: -pad,
        top: -pad,
        width: boardWidth + pad * 2,
        height: boardHeight + pad * 2,
      }}
      aria-hidden
    >
      <svg
        key={`shrine-decoration-${seed}-${faceGrowthStartedAtMs ?? 'static'}`}
        className="absolute inset-0 overflow-visible"
        width={boardWidth + pad * 2}
        height={boardHeight + pad * 2}
      >
        {Array.from({ length: BOARD_VISIBLE_ROWS + 1 }, (_, row) => {
          const y = pad + row * cellSize;
          const left = layout.lineExtLeft[row] ?? 12;
          const right = layout.lineExtRight[row] ?? 12;
          return (
            <g key={`h-${row}`}>
              <line x1={pad - left} y1={y} x2={pad} y2={y} className="ss-shrine-void-line" />
              <line x1={pad + boardWidth} y1={y} x2={pad + boardWidth + right} y2={y} className="ss-shrine-void-line" />
            </g>
          );
        })}
        {Array.from({ length: BOARD_COLS + 1 }, (_, col) => {
          const x = pad + col * cellSize;
          const top = layout.lineExtTop[col] ?? 12;
          const bottom = layout.lineExtBottom[col] ?? 12;
          return (
            <g key={`v-${col}`}>
              <line x1={x} y1={pad - top} x2={x} y2={pad} className="ss-shrine-void-line" />
              <line x1={x} y1={pad + boardHeight} x2={x} y2={pad + boardHeight + bottom} className="ss-shrine-void-line" />
            </g>
          );
        })}

        <path
          className="ss-shrine-board-frame"
          d={[
            `M ${pad} ${pad} H ${topFace ? topFaceX - topGap : pad + boardWidth}`,
            topFace ? `M ${topFaceX + topGap} ${pad} H ${pad + boardWidth}` : '',
            `M ${pad} ${pad + boardHeight} H ${pad + boardWidth}`,
            `M ${pad} ${pad} V ${leftFace ? leftFaceY - sideGap : pad + boardHeight}`,
            leftFace ? `M ${pad} ${leftFaceY + sideGap} V ${pad + boardHeight}` : '',
            `M ${pad + boardWidth} ${pad} V ${rightFace ? rightFaceY - sideGap : pad + boardHeight}`,
            rightFace ? `M ${pad + boardWidth} ${rightFaceY + sideGap} V ${pad + boardHeight}` : '',
          ].filter(Boolean).join(' ')}
        />

        {showFaces && layout.faces.map((face, index) => (
          <g key={`${seed}-${face.side}`}>
            <ShrineFaceSvg
              face={face}
              boardLeft={pad}
              boardTop={pad}
              boardWidth={boardWidth}
              boardHeight={boardHeight}
              scale={scale}
              staggerMs={index * SHRINE_FACE_GROWTH_STAGGER_MS}
              blinkDelayMs={
                (
                  (fieldRole === 'self' ? 0 : 1700)
                  + Math.floor(
                    seededDecorationUnit(seed, (fieldRole === 'self' ? 300 : 600) + index) * 1800,
                  )
                  + index * 760
                ) % 5200
              }
              faceGrowthStartedAtMs={faceGrowthStartedAtMs}
              animationNowMs={animationNowMs}
            />
          </g>
        ))}

        {layout.sparks.map((spark, index) => {
          const x = spark.side === 'right'
            ? pad + boardWidth + spark.offsetPx * scale
            : pad - spark.offsetPx * scale;
          const y = pad + boardHeight * spark.yPercent / 100;
          const arm = Math.max(3, cellSize * 0.22);
          return (
            <path
              key={`spark-${spark.side}-${spark.yPercent}-${spark.offsetPx}-${spark.opacity}`}
              className="ss-shrine-spark-svg"
              style={{ opacity: spark.opacity }}
              d={`M ${x} ${y - arm} V ${y + arm} M ${x - arm} ${y} H ${x + arm}`}
            />
          );
        })}
      </svg>
    </div>
  );
});
