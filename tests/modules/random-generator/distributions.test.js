/**
 * Tests for modules/random-generator/domain/distributions.js — die Form
 * `PARAMS_SHAPE` (Regel M6) ist ein Literal und muss dem Register der Engine
 * gleichen: dieselben Verteilungen und Parameter in derselben Reihenfolge,
 * dieselben Vorgaben und Grenzen. Ebenso die Verteilungsliste im Schema und
 * die Tabelle der Migration (über die Vorgaben von `from0`).
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { DISTRIBUTIONS } from '../../../js/engines/random-variates-engine.js';
import {
  PARAMS_SHAPE, DIST_KEYS, NUMERIC_KEYS, ATTRIBUTIVE_KEY, categories, distOf, isNumericDist,
} from '../../../js/modules/random-generator/domain/distributions.js';
import { State } from '../../../js/modules/random-generator/domain/model.js';
import { from0 } from '../../../js/modules/random-generator/domain/migrations.js';

/** Die Parameter einer Verteilung aus dem Register: id, Vorgabe, Grenzen. */
const fromEngine = (key) => DISTRIBUTIONS[key].params.map((p) => [p.id, p.default, p.min ?? null, p.max ?? null]);
/** Dasselbe aus der Form. */
const fromShape = (key) => Object.entries(PARAMS_SHAPE[key].shape)
  .map(([id, s]) => [id, s.default, s.min ?? null, s.max ?? null]);

suite('random-generator Verteilungen — Literal gleich Register', () => {
  test('dieselben Verteilungen in Registerreihenfolge, attributiv am Ende', () => {
    assertDeepEqual(Object.keys(PARAMS_SHAPE), Object.keys(DISTRIBUTIONS));
    assertDeepEqual([...NUMERIC_KEYS], Object.keys(DISTRIBUTIONS));
    assertDeepEqual([...DIST_KEYS], [...Object.keys(DISTRIBUTIONS), ATTRIBUTIVE_KEY]);
    assertEqual(Object.keys(PARAMS_SHAPE).length, 25);
  });

  test('je Verteilung dieselben Parameter, Vorgaben und Grenzen', () => {
    for (const key of Object.keys(DISTRIBUTIONS)) {
      assertDeepEqual(fromShape(key), fromEngine(key), key);
      for (const s of Object.values(PARAMS_SHAPE[key].shape)) assertEqual(s.kind, 'number', key);
    }
  });

  test('die Verteilungsliste des Schemas gleicht DIST_KEYS', () => {
    const spec = State.schema.fields.currentDist;
    assertDeepEqual([...spec.values], [...DIST_KEYS]);
    assertEqual(spec.nullable, true);
  });

  test('die Tabelle der Migration gleicht den Vorgaben des Registers', () => {
    const { params } = from0({});
    assertDeepEqual(Object.keys(params), Object.keys(DISTRIBUTIONS));
    for (const key of Object.keys(DISTRIBUTIONS)) {
      const defaults = Object.fromEntries(DISTRIBUTIONS[key].params.map((p) => [p.id, p.default]));
      assertDeepEqual(params[key], defaults, key);
    }
  });

  test('die Tabelle der Migration kennt die Grenzen des Registers', () => {
    // Ein Wert knapp außerhalb jeder Grenze fällt auf die Vorgabe, einer auf der Grenze bleibt.
    for (const key of Object.keys(DISTRIBUTIONS)) {
      for (const p of DISTRIBUTIONS[key].params) {
        if (p.min !== undefined) {
          assertEqual(from0({ currentDist: key, params: { [p.id]: p.min } }).params[key][p.id], p.min, `${key}.${p.id} min`);
          assertEqual(from0({ currentDist: key, params: { [p.id]: p.min - 1 } }).params[key][p.id], p.default, `${key}.${p.id} < min`);
        }
        if (p.max !== undefined) {
          assertEqual(from0({ currentDist: key, params: { [p.id]: p.max } }).params[key][p.id], p.max, `${key}.${p.id} max`);
          assertEqual(from0({ currentDist: key, params: { [p.id]: p.max + 1 } }).params[key][p.id], p.default, `${key}.${p.id} > max`);
        }
      }
    }
  });
});

suite('random-generator Verteilungen — Hilfen', () => {
  test('categories: stetig, dann diskret, je in Registerreihenfolge', () => {
    const cats = categories();
    assertDeepEqual(cats.map((c) => c.key), ['catContinuous', 'catDiscrete']);
    assertDeepEqual(cats.flatMap((c) => c.dists).sort(), Object.keys(DISTRIBUTIONS).sort());
    assertEqual(cats[0].dists[0], 'normal');
    assertEqual(cats[0].dists.at(-1), 'mvnormal');
    assertEqual(cats[1].dists[0], 'bernoulli');
  });

  test('distOf und isNumericDist kennen nur Registerschlüssel', () => {
    assertEqual(distOf('normal'), DISTRIBUTIONS.normal);
    assertEqual(distOf(ATTRIBUTIVE_KEY), null);
    assertEqual(distOf(null), null);
    assertEqual(isNumericDist('toString'), false);
    assertEqual(isNumericDist('poisson'), true);
  });
});
