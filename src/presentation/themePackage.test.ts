import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BIO_TOXIN_POISON_PALETTE,
  COMIC_TOXIN_POISON_PALETTE,
  DEFAULT_POISON_PALETTE,
  DOWNWELL_SHAPE_COLORS,
  INVINCIBLE_SHAPE_COLORS,
  SHAPE_COLORS,
} from './shapePalette';
import {
  parseThemeId,
  readThemeIdFromLocation,
  resolveThemePackage,
  THEME_PACKAGES,
} from './themePackage';

describe('themePackage', () => {
  test('parseThemeId falls back to default', () => {
    assert.equal(parseThemeId(null), 'default');
    assert.equal(parseThemeId('nope'), 'default');
    assert.equal(parseThemeId('downwell'), 'downwell');
  });

  test('query string picks a known theme', () => {
    assert.equal(readThemeIdFromLocation('?theme=invincible'), 'invincible');
    assert.equal(readThemeIdFromLocation('?theme=nope'), null);
  });

  test('default keeps the non-Guideline piece table and its poison ramp', () => {
    assert.deepEqual(THEME_PACKAGES.default.piecePalette, SHAPE_COLORS);
    assert.deepEqual(THEME_PACKAGES.default.poisonPalette, DEFAULT_POISON_PALETTE);
  });

  test('downwell uses shrine pieces and bio-toxin poison', () => {
    assert.deepEqual(THEME_PACKAGES.downwell.piecePalette, DOWNWELL_SHAPE_COLORS);
    assert.deepEqual(THEME_PACKAGES.downwell.poisonPalette, BIO_TOXIN_POISON_PALETTE);
  });

  test('invincible uses comic pieces and comic-toxin poison', () => {
    assert.deepEqual(THEME_PACKAGES.invincible.piecePalette, INVINCIBLE_SHAPE_COLORS);
    assert.deepEqual(THEME_PACKAGES.invincible.poisonPalette, COMIC_TOXIN_POISON_PALETTE);
  });

  test('poison variants are unique within and across every theme palette', () => {
    const poisonPalettes = [
      DEFAULT_POISON_PALETTE,
      BIO_TOXIN_POISON_PALETTE,
      COMIC_TOXIN_POISON_PALETTE,
    ];

    for (const palette of poisonPalettes) {
      const colors = Object.values(palette);
      assert.equal(new Set(colors).size, colors.length);
    }

    for (let index = 0; index < poisonPalettes.length; index += 1) {
      const colors = Object.values(poisonPalettes[index]);
      for (const otherPalette of poisonPalettes.slice(index + 1)) {
        assert.deepEqual(
          colors.filter((color) => Object.values(otherPalette).includes(color)),
          [],
        );
      }
    }
  });

  test('theme backgrounds stay assigned to their visual treatments', () => {
    assert.equal(resolveThemePackage('default').shrine, 'none');
    assert.equal(resolveThemePackage('invincible').shrine, 'none');
    assert.equal(resolveThemePackage('downwell').shrine, 'watching-amalgam');
    assert.equal(resolveThemePackage('default').background.kind, 'dispersed-voronoi');
    assert.equal(resolveThemePackage('invincible').background.kind, 'comic-halftone');
    assert.deepEqual(resolveThemePackage('downwell').background, { kind: 'solid', color: '#171717' });
  });
});
