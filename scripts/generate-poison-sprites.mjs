/**
 * Builds public/poison/poison-sheet.svg — 8-frame × 4-variant poison overlay
 * (Gen III–style zigzag screen; original art, not ripped sprites).
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const FRAME = 28;
const FRAMES = 8;
const VARIANTS = 4;

/** Dark base + bright zigzag accent per variant (FR/LG poison palette family). */
const VARIANTS_CFG = [
  { base: '#4c1d95', accent: '#e879f9', glow: '#d946ef' },
  { base: '#365314', accent: '#bef264', glow: '#a3e635' },
  { base: '#312e81', accent: '#a5b4fc', glow: '#818cf8' },
  { base: '#134e4a', accent: '#99f6e4', glow: '#5eead4' },
];

/** One 28×28 frame: chevron tiles shifted upward each frame (stepped anim). */
function frameSvg(fx, fy, base, accent, glow, frameIndex) {
  const shift = (frameIndex % FRAMES) * 3.5;
  const tiles = [];
  for (let ty = -1; ty < 3; ty++) {
    for (let tx = -1; tx < 3; tx++) {
      const ox = tx * 14;
      const oy = ty * 14 - shift;
      // Diamond / chevron tile (matches CSS 135°/225° gradient look)
      tiles.push(
        `<polygon points="${ox + 7},${oy} ${ox + 14},${oy + 7} ${ox + 7},${oy + 14} ${ox},${oy + 7}" fill="${accent}" opacity="0.92"/>`,
      );
      tiles.push(
        `<circle cx="${ox + 4}" cy="${oy + 10}" r="2.2" fill="${glow}" opacity="0.55"/>`,
      );
    }
  }
  return `<g transform="translate(${fx},${fy})">
    <rect width="${FRAME}" height="${FRAME}" fill="${base}"/>
    <clipPath id="c-${fx}-${fy}"><rect width="${FRAME}" height="${FRAME}"/></clipPath>
    <g clip-path="url(#c-${fx}-${fy})">${tiles.join('')}</g>
    <rect width="${FRAME}" height="${FRAME}" fill="url(#vignette)" opacity="0.35"/>
  </g>`;
}

const w = FRAME * FRAMES;
const h = FRAME * VARIANTS;
const defs = `<defs>
  <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
    <stop offset="0%" stop-color="#000" stop-opacity="0"/>
    <stop offset="100%" stop-color="#000" stop-opacity="0.55"/>
  </radialGradient>
</defs>`;

const body = [];
for (let v = 0; v < VARIANTS; v++) {
  const cfg = VARIANTS_CFG[v];
  for (let f = 0; f < FRAMES; f++) {
    body.push(frameSvg(f * FRAME, v * FRAME, cfg.base, cfg.accent, cfg.glow, f));
  }
}

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
${defs}
${body.join('\n')}
</svg>`;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'poison');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'poison-sheet.svg'), svg, 'utf8');
console.log(`Wrote ${join(outDir, 'poison-sheet.svg')} (${w}×${h})`);
