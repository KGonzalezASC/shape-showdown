import fs from 'node:fs';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

/**
 * Vite `base`: use `"./"` for builds that must load from any URL path (assets relative to index.html).
 * Use absolute paths like `/webgl/bubble-blitzers/` only when you want fixed hosting on that prefix.
 */
function readClientBaseUrl() {
  const file = path.join(projectRoot, 'config', 'client.json');
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (typeof j.baseUrl === 'string' && j.baseUrl.length > 0) {
      return j.baseUrl;
    }
  } catch {
    /* use fallback */
  }
  return './';
}

function normalizeViteBase(raw) {
  const b = raw.trim();
  if (b === '.' || b === './') return './';
  if (b.endsWith('/')) return b;
  return `${b}/`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, '');
  const fromFile = readClientBaseUrl();
  const fromEnv = env.VITE_BASE_URL?.trim();
  // Config file first; VITE_BASE_URL overrides when set (e.g. CI).
  const rawBase =
    fromEnv && fromEnv.length > 0 ? fromEnv : fromFile;
  const normalizedBase = normalizeViteBase(rawBase);

  return {
    base: normalizedBase,
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': projectRoot,
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
