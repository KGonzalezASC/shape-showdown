from pathlib import Path

path = Path("src/components/LandingShowcase.tsx")
s = path.read_text(encoding="utf-8")

# Add CalendarDays to lucide import
old_import = "import { HelpCircle, Keyboard, Play, Puzzle, X } from 'lucide-react';"
new_import = "import { CalendarDays, HelpCircle, Keyboard, Play, Puzzle, X } from 'lucide-react';"
if "CalendarDays" not in s:
    if old_import not in s:
        raise SystemExit("import not found")
    s = s.replace(old_import, new_import)

old_btn = """            <a
              href="#puzzles"
              onClick={(e) => {
                e.preventDefault();
                setAppRoute('puzzles');
              }}
              style={{
                backgroundColor: activeOption.accent,
                boxShadow: `0 0 24px ${activeOption.accent}33`,
              }}
              className="inline-flex h-10 shrink-0 whitespace-nowrap items-center justify-center gap-1.5 rounded-xl px-4 text-[9px] font-black uppercase tracking-wider text-[#07110d] transition-all hover:brightness-110 active:scale-[0.98] sm:h-12 sm:gap-2 sm:px-8 sm:text-xs"
            >
              <Puzzle className="h-3.5 w-3.5 fill-current sm:h-4 sm:w-4" />
              <span>Puzzles</span>
            </a>

            <button
              type="button"
              onClick={() => setShowHowToPlay(true)}
"""

new_btn = """            <a
              href="#puzzles"
              onClick={(e) => {
                e.preventDefault();
                setAppRoute('puzzles');
              }}
              style={{
                backgroundColor: activeOption.accent,
                boxShadow: `0 0 24px ${activeOption.accent}33`,
              }}
              className="inline-flex h-10 shrink-0 whitespace-nowrap items-center justify-center gap-1.5 rounded-xl px-4 text-[9px] font-black uppercase tracking-wider text-[#07110d] transition-all hover:brightness-110 active:scale-[0.98] sm:h-12 sm:gap-2 sm:px-8 sm:text-xs"
            >
              <Puzzle className="h-3.5 w-3.5 fill-current sm:h-4 sm:w-4" />
              <span>Puzzles</span>
            </a>

            <a
              href="#daily"
              onClick={(e) => {
                e.preventDefault();
                sessionStorage.setItem('puzzleAutostart', 'daily');
                setAppRoute('puzzles');
              }}
              style={{
                backgroundColor: activeOption.accent,
                boxShadow: `0 0 24px ${activeOption.accent}33`,
              }}
              className="inline-flex h-10 shrink-0 whitespace-nowrap items-center justify-center gap-1.5 rounded-xl px-4 text-[9px] font-black uppercase tracking-wider text-[#07110d] transition-all hover:brightness-110 active:scale-[0.98] sm:h-12 sm:gap-2 sm:px-8 sm:text-xs"
            >
              <CalendarDays className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span>Daily</span>
            </a>

            <button
              type="button"
              onClick={() => setShowHowToPlay(true)}
"""

if "puzzleAutostart" not in s:
    if old_btn not in s:
        raise SystemExit("puzzles button block not found")
    s = s.replace(old_btn, new_btn)

path.write_text(s, encoding="utf-8")
print("LandingShowcase patched", "puzzleAutostart" in s, "CalendarDays" in s)
