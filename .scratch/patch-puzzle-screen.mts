import fs from 'node:fs';

const path = 'src/components/PuzzleScreen.tsx';
let s = fs.readFileSync(path, 'utf8');

// Add daily types and state
if (!s.includes('PuzzleDailySummary')) {
  s = s.replace(
    `interface PuzzleCatalogEntry {
  id: string;
  name: string;
  goal: { kind: string; lines?: number; ticks?: number };
  allowHold: boolean;
  visibilityPolicy: PuzzleVisibilityPolicy;
}`,
    `interface PuzzleCatalogEntry {
  id: string;
  name: string;
  goal: { kind: string; lines?: number; ticks?: number };
  allowHold: boolean;
  visibilityPolicy: PuzzleVisibilityPolicy;
}

interface PuzzleDailySummary {
  dateKey: string;
  puzzleId: string;
  name: string;
}

interface PuzzleCatalogPayload {
  puzzles: PuzzleCatalogEntry[];
  daily: PuzzleDailySummary;
}`,
  );
}

if (!s.includes('const [daily, setDaily]')) {
  s = s.replace(
    `  const [catalog, setCatalog] = useState<PuzzleCatalogEntry[]>([]);
  const [selectedPuzzleId, setSelectedPuzzleId] = useState<string | null>(null);
  const [picking, setPicking] = useState(true);`,
    `  const [catalog, setCatalog] = useState<PuzzleCatalogEntry[]>([]);
  const [daily, setDaily] = useState<PuzzleDailySummary | null>(null);
  const [selectedPuzzleId, setSelectedPuzzleId] = useState<string | null>(null);
  const [picking, setPicking] = useState(true);
  const dailyAutostartHandledRef = useRef(false);`,
  );
}

// Replace catalog handler
s = s.replace(
  `      socket.on('puzzle:catalog', (entries: PuzzleCatalogEntry[]) => {
        if (cancelled) return;
        setCatalog(entries);
      });`,
  `      socket.on('puzzle:catalog', (payload: PuzzleCatalogPayload | PuzzleCatalogEntry[]) => {
        if (cancelled) return;
        const puzzles = Array.isArray(payload) ? payload : payload.puzzles;
        const dailyPayload = Array.isArray(payload) ? null : payload.daily;
        setCatalog(puzzles);
        if (dailyPayload) setDaily(dailyPayload);

        // LandingShowcase Daily button stashes this flag.
        if (
          !dailyAutostartHandledRef.current &&
          typeof sessionStorage !== 'undefined' &&
          sessionStorage.getItem('puzzleAutostart') === 'daily'
        ) {
          dailyAutostartHandledRef.current = true;
          sessionStorage.removeItem('puzzleAutostart');
          setPicking(false);
          socket.emit('puzzle:start', { mode: 'daily' });
        }
      });`,
);

// Add startDaily helper after startPuzzle
if (!s.includes('const startDaily')) {
  s = s.replace(
    `  const restartSame = useCallback(() => {
    const id = selectedPuzzleIdRef.current;
    if (id) startPuzzle(id);
  }, [startPuzzle]);`,
    `  const startDaily = useCallback(() => {
    setEnd(null);
    setState(null);
    setStarted(null);
    setPicking(false);
    const socket = socketRef.current;
    if (!socket) return;
    if (!socket.connected) {
      socket.connect();
    }
    socket.emit('puzzle:start', { mode: 'daily' });
  }, []);

  const restartSame = useCallback(() => {
    const id = selectedPuzzleIdRef.current;
    if (id) startPuzzle(id);
  }, [startPuzzle]);`,
);

// Update picking UI to show Today's Challenge card
s = s.replace(
  `      {picking ? (
        <div className="flex w-full max-w-md flex-col gap-3 rounded-xl border border-white/10 bg-[#08090d] p-5">
          <p className="text-sm font-bold uppercase tracking-wider text-zinc-300">Choose a puzzle</p>
          {!connected && (
            <p className="text-xs text-zinc-500">Connecting…</p>
          )}
          {connected && catalog.length === 0 && (
            <p className="text-xs text-zinc-500">Loading catalog…</p>
          )}
          {catalog.map((entry) => (`,
  `      {picking ? (
        <div className="flex w-full max-w-md flex-col gap-3 rounded-xl border border-white/10 bg-[#08090d] p-5">
          <p className="text-sm font-bold uppercase tracking-wider text-zinc-300">Choose a puzzle</p>
          {!connected && (
            <p className="text-xs text-zinc-500">Connecting…</p>
          )}
          {connected && catalog.length === 0 && (
            <p className="text-xs text-zinc-500">Loading catalog…</p>
          )}
          {daily && (
            <button
              type="button"
              onClick={startDaily}
              className="flex flex-col items-start rounded-xl border border-amber-400/40 bg-gradient-to-br from-amber-500/20 to-orange-600/10 px-4 py-4 text-left shadow-[0_0_24px_rgba(251,191,36,0.12)] hover:from-amber-500/30 hover:to-orange-600/20"
            >
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">
                Today&apos;s Challenge
              </span>
              <span className="mt-1 text-base font-black text-white">{daily.name}</span>
              <span className="mt-0.5 text-xs text-amber-100/70">{daily.dateKey}</span>
            </button>
          )}
          <p className="pt-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Practice</p>
          {catalog.map((entry) => (`,
);

fs.writeFileSync(path, s);
console.log('PuzzleScreen patched');
