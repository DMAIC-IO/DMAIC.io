import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import {
  validateSchema, schemaOf, coerceValue, resolveSettings, toStored,
  withTileSettings, pruneTileSettings,
} from '../../js/pages/dashboard/tile-settings.js';

const TOP_N = { type: 'number', min: 1, max: 10, step: 1, default: 5, label: 'l.topN' };
const VIEW = { type: 'select', options: ['bar', 'list'], default: 'bar', label: 'l.view' };
const LEGEND = { type: 'boolean', default: true, label: 'l.legend' };
const SCHEMA = { topN: TOP_N, view: VIEW, showLegend: LEGEND };

suite('tile-settings: validateSchema', () => {
  test('keeps valid fields without warnings', () => {
    const warnings = [];
    const out = validateSchema(SCHEMA, (m) => warnings.push(m));
    assertDeepEqual(Object.keys(out), ['topN', 'view', 'showLegend']);
    assertEqual(warnings.length, 0);
  });

  test('drops invalid fields and warns once per field', () => {
    const warnings = [];
    const out = validateSchema({
      good: LEGEND,
      unknownType: { type: 'color', default: '#000', label: 'x' },
      noLabel: { type: 'boolean', default: true },
      noDefault: { type: 'boolean', label: 'x' },
      noMax: { type: 'number', min: 1, default: 1, label: 'x' },
      defaultOutOfRange: { type: 'number', min: 1, max: 3, default: 9, label: 'x' },
      emptyOptions: { type: 'select', options: [], default: 'a', label: 'x' },
      nonStringOption: { type: 'select', options: [1, 2], default: 1, label: 'x' },
      defaultNotOption: { type: 'select', options: ['a'], default: 'b', label: 'x' },
      boolDefaultString: { type: 'boolean', default: 'yes', label: 'x' },
      notAnObject: null,
    }, (m) => warnings.push(m));
    assertDeepEqual(Object.keys(out), ['good']);
    assertEqual(warnings.length, 10);
    assertTrue(warnings[0].includes('unknownType'));
  });

  test('a missing schema is an empty schema', () => {
    assertDeepEqual(validateSchema(undefined, () => {}), {});
  });

  test('schemaOf caches per tile object', () => {
    const warnings = [];
    const original = console.warn;
    console.warn = (m) => warnings.push(m);
    try {
      const tile = { settings: { bad: { type: 'nope', default: 1, label: 'x' } } };
      schemaOf(tile);
      schemaOf(tile);
      assertEqual(warnings.length, 1);
      assertTrue(schemaOf(tile) === schemaOf(tile));
    } finally {
      console.warn = original;
    }
  });
});

suite('tile-settings: coerceValue', () => {
  test('number: parses strings, clamps, rounds to step', () => {
    assertEqual(coerceValue(TOP_N, '3'), 3);
    assertEqual(coerceValue(TOP_N, 0), 1);
    assertEqual(coerceValue(TOP_N, 99), 10);
    assertEqual(coerceValue(TOP_N, 2.7), 3);
    assertEqual(coerceValue({ ...TOP_N, step: 0.5 }, 2.3), 2.5);
  });

  test('number: empty, non-numeric and boolean fall back to the default', () => {
    assertEqual(coerceValue(TOP_N, ''), 5);
    assertEqual(coerceValue(TOP_N, 'abc'), 5);
    assertEqual(coerceValue(TOP_N, true), 5);
    assertEqual(coerceValue(TOP_N, undefined), 5);
    assertEqual(coerceValue(TOP_N, Infinity), 5);
  });

  test('select: only listed options', () => {
    assertEqual(coerceValue(VIEW, 'list'), 'list');
    assertEqual(coerceValue(VIEW, 'pie'), 'bar');
  });

  test('boolean: only real booleans', () => {
    assertEqual(coerceValue(LEGEND, false), false);
    assertEqual(coerceValue(LEGEND, 'yes'), true);
    assertEqual(coerceValue(LEGEND, 0), true);
  });
});

suite('tile-settings: resolveSettings', () => {
  test('fills defaults for missing keys', () => {
    assertDeepEqual(resolveSettings(SCHEMA, undefined), { topN: 5, view: 'bar', showLegend: true });
  });

  test('applies stored overrides, coerced', () => {
    assertDeepEqual(resolveSettings(SCHEMA, { topN: 999, showLegend: 'no' }),
      { topN: 10, view: 'bar', showLegend: true });
  });

  test('ignores unknown stored keys', () => {
    assertDeepEqual(resolveSettings({ topN: TOP_N }, { topN: 2, legacy: 'x' }), { topN: 2 });
  });
});

suite('tile-settings: toStored', () => {
  test('stores only values that differ from the default', () => {
    assertDeepEqual(toStored(SCHEMA, { topN: 3, view: 'bar', showLegend: true }), { topN: 3 });
  });

  test('a value equal to the default removes the key', () => {
    assertDeepEqual(toStored(SCHEMA, { topN: 5, view: 'bar', showLegend: true }, { topN: 3 }), {});
  });

  test('keeps unknown keys from the previous entry', () => {
    assertDeepEqual(toStored({ topN: TOP_N }, { topN: 2 }, { topN: 4, view: 'list' }),
      { view: 'list', topN: 2 });
  });
});

suite('tile-settings: withTileSettings', () => {
  test('sets one tile without touching another', () => {
    const all = { 'fmea:a': { topN: 2 } };
    const next = withTileSettings(all, 'fmea:b', { topN: 7 });
    assertDeepEqual(next, { 'fmea:a': { topN: 2 }, 'fmea:b': { topN: 7 } });
    assertDeepEqual(all, { 'fmea:a': { topN: 2 } });
  });

  test('an empty entry removes the tile', () => {
    assertDeepEqual(withTileSettings({ 'fmea:a': { topN: 2 } }, 'fmea:a', {}), {});
  });

  test('works on a missing map', () => {
    assertDeepEqual(withTileSettings(undefined, 'x', { a: 1 }), { x: { a: 1 } });
  });
});

suite('tile-settings: pruneTileSettings', () => {
  test('keeps live ids, drops dead ids and empty entries', () => {
    const all = { live: { topN: 2 }, dead: { topN: 3 }, empty: {} };
    assertDeepEqual(pruneTileSettings(all, ['live', 'empty']), { live: { topN: 2 } });
  });

  test('a missing map prunes to an empty map', () => {
    assertDeepEqual(pruneTileSettings(undefined, ['a']), {});
  });
});
