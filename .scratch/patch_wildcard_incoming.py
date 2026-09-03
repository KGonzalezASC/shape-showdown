from pathlib import Path

shop = Path("server/shop.ts")
text = shop.read_text(encoding="utf-8")

old_import = "import { pushFieldEffect } from '../src/shop/fieldEffects.js';"
new_import = "import { clearWildcardIncomingEffect, pushFieldEffect } from '../src/shop/fieldEffects.js';"
if old_import not in text:
    raise SystemExit("import not found")
text = text.replace(old_import, new_import, 1)

old_mp = """      opponent.wildcardLastSeed = [candidate.seed.x, candidate.seed.y];
      opponent.wildcardLastShapeKey = candidate.shapeKey;
      pushFieldEffect(opponent, 'wildcard-four', tick, 'Wildcard +4', '🧩', tick + 240);"""
new_mp = """      opponent.wildcardLastSeed = [candidate.seed.x, candidate.seed.y];
      opponent.wildcardLastShapeKey = candidate.shapeKey;
      clearWildcardIncomingEffect(opponent);
      pushFieldEffect(opponent, 'wildcard-four', tick, 'Wildcard +4', '🧩', tick + 240);"""
if old_mp not in text:
    raise SystemExit("mp push not found")
text = text.replace(old_mp, new_mp, 1)

old_sc = """      victim.wildcardLastSeed = [candidate.seed.x, candidate.seed.y];
      victim.wildcardLastShapeKey = candidate.shapeKey;
      pushFieldEffect(victim, 'wildcard-four', tick, 'Wildcard +4', '🧩', tick + 240);
      return true;"""
new_sc = """      victim.wildcardLastSeed = [candidate.seed.x, candidate.seed.y];
      victim.wildcardLastShapeKey = candidate.shapeKey;
      clearWildcardIncomingEffect(victim);
      pushFieldEffect(victim, 'wildcard-four', tick, 'Wildcard +4', '🧩', tick + 240);
      return true;"""
if old_sc not in text:
    raise SystemExit("scripted push not found")
text = text.replace(old_sc, new_sc, 1)

shop.write_text(text, encoding="utf-8")
print("updated shop.ts")
