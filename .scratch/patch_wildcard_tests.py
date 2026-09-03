from pathlib import Path

# Update server presentation test
pres_test = Path("server/puzzle/puzzlePresentation.test.ts")
text = pres_test.read_text(encoding="utf-8")
if "keeps deferred pending kinds" not in text:
    insert = '''
  it('keeps deferred pending kinds visible after authored tick', () => {
    assert.deepEqual(presentTimelineHints(events, 'partial', 40, ['wildcard']), [
      { tick: -1, kind: 'wildcard' },
    ]);
    assert.deepEqual(presentTimelineHints(events, 'revealed', 40, ['wildcard']), [
      { tick: -1, kind: 'wildcard' },
    ]);
  });
'''
    # insert before the last queue-count test
    marker = "  it('limits next-queue preview by policy', () => {"
    if marker not in text:
        raise SystemExit("marker not found in presentation test")
    text = text.replace(marker, insert + "\n" + marker, 1)
    pres_test.write_text(text, encoding="utf-8")
    print("updated puzzlePresentation.test.ts")
else:
    print("presentation test already has pending case")

# Update poison synergy test with lifetime assertion
syn = Path("server/puzzle/puzzlePoisonSynergy.test.ts")
text = syn.read_text(encoding="utf-8")
if "WILDCARD_INCOMING_LABEL" not in text:
    # add import
    old_imp = "import { applyScriptedShopAttack } from '../shop.js';"
    # find existing imports
    if "from '../../src/shop/fieldEffects.js'" not in text:
        # add after first import block line with applyScriptedShopAttack
        if old_imp in text:
            text = text.replace(
                old_imp,
                old_imp + "\nimport { WILDCARD_INCOMING_LABEL } from '../../src/shop/fieldEffects.js';",
                1,
            )
        else:
            # try alternate
            raise SystemExit("applyScriptedShopAttack import not found: " + repr([l for l in text.splitlines() if 'shop' in l][:10]))

new_test = '''
  it('defers wildcard telegraph until shape locks, then swaps to applied pill', () => {
    const level = buildPoisonBeatLevel();
    const session = new PuzzleSession({
      level,
      driver: new RulesBot({ mode: 'omniscient' }),
      maxTicks: 60 * 60,
    });
    let sawIncomingWhileDeferred = false;
    let incomingExpiredBeforeApply = false;
    let appliedTick: number | null = null;
    for (let i = 0; i < 60 * 45; i++) {
      const before = session.getPlayerState();
      const hadCustom = before.customNextPieceOffsets != null;
      const hadIncoming = (before.activeEffects ?? []).some(
        (e) => e.kind === 'wildcard-four' && e.label === WILDCARD_INCOMING_LABEL,
      );
      session.advance(1);
      const after = session.getPlayerState();
      const pending = session.getPendingHazardKinds();
      const hasIncoming = (after.activeEffects ?? []).some(
        (e) => e.kind === 'wildcard-four' && e.label === WILDCARD_INCOMING_LABEL,
      );
      const hasAppliedPill = (after.activeEffects ?? []).some(
        (e) => e.kind === 'wildcard-four' && e.label === 'Wildcard +4',
      );
      if (pending.includes('wildcard')) {
        if (hasIncoming) sawIncomingWhileDeferred = true;
        if (!hasIncoming) incomingExpiredBeforeApply = true;
      }
      if (!hadCustom && after.customNextPieceOffsets != null) {
        appliedTick = session.tick;
        assert.equal(hasIncoming, false, 'incoming pill must clear on apply');
        assert.equal(hasAppliedPill, true, 'applied Wildcard +4 pill must be present');
        assert.deepEqual(session.getPendingHazardKinds(), []);
        break;
      }
      void hadIncoming;
    }
    assert.equal(sawIncomingWhileDeferred, true, 'must show Wildcard incoming while deferred');
    assert.equal(incomingExpiredBeforeApply, false, 'incoming must not expire before apply');
    assert.ok(appliedTick != null && appliedTick >= 170);
  });
'''

if "defers wildcard telegraph until shape locks" not in text:
    # append before final closing of describe if possible
    # find the authored poison-beat test end and insert after that it-block
    marker = "    assert.ok(wildcardTick != null && wildcardTick >= 170, 'wildcard applies at/after authored earliest tick');"
    idx = text.find(marker)
    if idx < 0:
        raise SystemExit("poison-beat assert marker not found")
    # find closing of that it() after marker
    rest = text[idx:]
    # find "\n  });\n" after marker - first occurrence that closes the it
    close_rel = rest.find("\n  });\n")
    if close_rel < 0:
        raise SystemExit("close not found")
    insert_at = idx + close_rel + len("\n  });\n")
    text = text[:insert_at] + new_test + text[insert_at:]
    syn.write_text(text, encoding="utf-8")
    print("updated puzzlePoisonSynergy.test.ts")
else:
    syn.write_text(text, encoding="utf-8")
    print("synergy test already had telegraph case / imports updated")
