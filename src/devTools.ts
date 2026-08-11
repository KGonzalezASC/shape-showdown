/**
 * Internal QA / developer UI gate.
 *
 * Default on in `bun run dev`. For staging or internal production builds that
 * need debug panels, set `VITE_DEV_TOOLS=true` at build time.
 *
 * Default production builds omit dev UI; Vite dead-code-eliminates branches
 * guarded by `DEV_TOOLS_ENABLED` when it is statically false.
 */
export const DEV_TOOLS_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_DEV_TOOLS === 'true';
