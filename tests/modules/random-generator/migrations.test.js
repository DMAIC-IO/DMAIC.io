/**
 * Tests for modules/random-generator/domain/migrations.js — '0→1.0'
 * übernimmt jeden Stand des alten `State.fromJSON` samt dem, was die Altform
 * beim Erzeugen las (Parameter mit Vorgabe, Umfang geklemmt, Startwert
 * ganzzahlig); dazu das Altprojekt aus den E2E-Fixtures (nur (c) wird
 * repariert) und die goldene Fixture v0.3.0.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { from0 } from '../../../js/modules/random-generator/domain/migrations.js';
import { State } from '../../../js/modules/random-generator/domain/model.js';
import { setModelName } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';

setModelName(State, 'random-generator');

const plain = (v) => JSON.parse(JSON.stringify(v));
const FIXTURES = new URL('../../fixtures/exports/', import.meta.url);
const DEFAULTS = plain(new State().toJSON());
delete DEFAULTS._schema;
// Die Ansichtsfelder (Editor-Einstellungen) setzt die Migration nicht; ihre Vorgabe greift beim Laden.
delete DEFAULTS.histogramEdits;
delete DEFAULTS.paretoEdits;

/** @param {URL} url */
async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${url}: HTTP ${res.status}`);
  return res.json();
}
/** @param {object} j */
function repaired(j) {
  const fields = [];
  const m = State.fromJSON(plain(j), { repair: true, onRepair: (f) => fields.push(f) });
  return { m, fields };
}

/** Das Altprojekt der E2E-Fixture (Task 0), Stände ohne `_schema`. */
const LEGACY = {
  a: {
    currentDist: 'normal', seed: 7, count: 200, params: { mu: 5, sigma: 2, epsilon: 0, delta: 1 },
    attributes: [{ id: 'x1', name: 'A', weight: 1 }, { id: 'x2', name: 'B', weight: 2 }, { id: 'x3', name: 'C', weight: 7 }],
    attrCount: 50, attrSeed: 42,
  },
  b: {
    currentDist: 'attributive', seed: 42, count: 1000, params: {},
    attributes: [{ id: 'k1', name: 'Gut', weight: 6 }, { name: 'Nacharbeit', weight: 3 },
      { id: 'k3', name: 'Ausschuss', weight: -1 }, { id: 'k4', name: '', weight: 2 }],
    attrCount: 300, attrSeed: 0,
  },
  c: {
    currentDist: 'uniform', seed: 42, count: 250000, params: { a: 3, b: 1 },
    attributes: [{ id: 'y1', name: 'A', weight: 1 }, { id: 'y2', name: 'B', weight: 2 }, { id: 'y3', name: 'C', weight: 7 }],
    attrCount: 50, attrSeed: 42,
  },
};

suite('random-generator Migration 0→1.0 — Fälle des alten fromJSON', () => {
  test('leer oder kein Objekt: Vorgaben', () => {
    for (const old of [undefined, null, 'x', [], {}]) assertDeepEqual(from0(old), DEFAULTS, JSON.stringify(old));
  });

  test('unbekannte Verteilung wird null, die Parameter alle Vorgaben', () => {
    const out = from0({ currentDist: 123, params: { mu: 5 } });
    assertEqual(out.currentDist, null);
    assertDeepEqual(out.params, DEFAULTS.params);
    assertEqual(from0({ currentDist: 'toString' }).currentDist, null);
  });

  test('flaches params gehört der gespeicherten Verteilung; Text gelesen, Unlesbares die Vorgabe', () => {
    const out = from0({ currentDist: 'normal', params: { mu: '2,5', sigma: 'x', delta: 3, extra: 1 } });
    assertDeepEqual(out.params.normal, { mu: 2.5, sigma: 1, epsilon: 0, delta: 3 });
    assertDeepEqual(out.params.uniform, DEFAULTS.params.uniform);
    const attr = from0({ currentDist: 'attributive', params: { mu: 9 } });
    assertDeepEqual(attr.params, DEFAULTS.params);
  });

  test('Umfang wie clampCount, Startwert ganzzahlig, 0 bleibt', () => {
    const out = from0({ count: 250000, attrCount: 0, seed: 7.9, attrSeed: 0 });
    assertEqual(out.count, 100000);
    assertEqual(out.attrCount, 1);
    assertEqual(out.seed, 7);
    assertEqual(out.attrSeed, 0);
    const bad = from0({ count: 'y', attrCount: NaN, seed: 'x', attrSeed: undefined });
    assertDeepEqual([bad.count, bad.attrCount, bad.seed, bad.attrSeed], [1000, 50, 42, 42]);
    assertEqual(from0({ count: 12.7 }).count, 12);
  });

  test('Kategorien: leer oder kaputt die Vorgaben; fehlende und doppelte ids aus der Position', () => {
    assertDeepEqual(from0({ attributes: [] }).attributes, DEFAULTS.attributes);
    assertDeepEqual(from0({ attributes: 'bad' }).attributes, DEFAULTS.attributes);
    const out = from0({ attributes: [{ id: 'a2', name: 'X', weight: 4 }, { name: 7, weight: 'w' }, { id: 'a2', name: 'Y', weight: -2 }, null] });
    assertDeepEqual(out.attributes, [
      { id: 'a2', name: 'X', weight: 4 },
      { id: 'a2_', name: '', weight: 0 },
      { id: 'a3', name: 'Y', weight: 0 },
      { id: 'a4', name: '', weight: 0 },
    ]);
  });

  test('unbekannte Schlüssel entfallen', () => {
    assertDeepEqual(Object.keys(from0({ foo: 1, normal: {} })), Object.keys(DEFAULTS));
  });
});

suite('random-generator Migration — Altprojekt (Task 0)', () => {
  test('(a) normal lädt ohne Reparatur, alle Altwerte', () => {
    const { m, fields } = repaired(LEGACY.a);
    assertDeepEqual(fields, []);
    assertEqual(m.currentDist, 'normal');
    assertDeepEqual(plain(m.params.normal), { mu: 5, sigma: 2, epsilon: 0, delta: 1 });
    assertDeepEqual([m.count, m.seed], [200, 7]);
    assertDeepEqual(plain(m.attributes), LEGACY.a.attributes);
  });

  test('(b) attributiv lädt ohne Reparatur: id aus der Position, Gewicht −1 wird 0, leerer Name bleibt', () => {
    const { m, fields } = repaired(LEGACY.b);
    assertDeepEqual(fields, []);
    assertDeepEqual(plain(m.attributes), [
      { id: 'k1', name: 'Gut', weight: 6 }, { id: 'a2', name: 'Nacharbeit', weight: 3 },
      { id: 'k3', name: 'Ausschuss', weight: 0 }, { id: 'k4', name: '', weight: 2 },
    ]);
    assertDeepEqual([m.attrCount, m.attrSeed], [300, 0]);
    const g = evaluateDerived(m, /** @type {any} */ (undefined), ['generated']).generated;
    assertDeepEqual(g.frequency.map((r) => [r.name, r.count]), [['Gut', 213], ['Nacharbeit', 87]]);
  });

  test('(c) uniform: Umfang geklemmt, a > b repariert (getauscht)', () => {
    const { m, fields } = repaired(LEGACY.c);
    assertDeepEqual(fields, ['params']);
    assertDeepEqual(plain(m.params.uniform), { a: 1, b: 3 });
    assertEqual(m.count, 100000);
  });

  test('Wiederholtes Laden vergibt dieselben ids', () => {
    assertDeepEqual(plain(repaired(LEGACY.b).m.attributes), plain(repaired(LEGACY.b).m.attributes));
  });
});

suite('random-generator Migration — goldene Fixture', () => {
  test('v0.3.0_all_projects.json: Altform ohne params lädt ohne Reparatur mit Vorgaben', async () => {
    const file = await fetchJSON(new URL('v0.3.0_all_projects.json', FIXTURES));
    const states = [];
    for (const p of file.projects) {
      for (const list of Object.values(p.phases ?? {})) {
        for (const e of list) if (e.moduleId === 'random-generator') states.push(p.moduleStates[e.instanceId]);
      }
    }
    assertEqual(states.length, 1);
    const { m, fields } = repaired(states[0]);
    assertDeepEqual(fields, []);
    assertEqual(m.currentDist, 'normal');
    assertDeepEqual(plain(m.params), DEFAULTS.params);
    assertDeepEqual([m.count, m.seed, m.attrCount, m.attrSeed], [1000, 42, 50, 42]);
    assertDeepEqual(plain(m.attributes), DEFAULTS.attributes);
  });
});
