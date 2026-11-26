/**
 * Stichprobenumfang: Migration '0→1.0' (domain/migrations.js) — jeder Stand
 * des alten `State.fromJSON`, fehlendes gegen gespeichertes `null` bei α und
 * Power, Effektangaben als Zahl oder `null`, Golden-Fixture und Altprojekt
 * ohne Reparatur.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { from0 } from '../../../js/modules/sample-size/domain/migrations.js';
import { State } from '../../../js/modules/sample-size/domain/model.js';
import { setModelName } from '../../../js/core/model.js';

setModelName(State, 'sample-size');

const CTX = { cycle: 'dmaic', confidenceLevel: 90, power: 90 };
const FIXTURES = new URL('../../fixtures/exports/', import.meta.url);
const plain = (v) => JSON.parse(JSON.stringify(v));
const EMPTY = {
  varianceOne: { sigma0: null, sigmaAlt: null },
  varianceTwo: { ratio: null },
  mean: { delta: null, sigma: null },
};

/** @param {URL} url @returns {Promise<any>} */
async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

/** Laden mit Reparatur; meldet die reparierten Felder. @param {object} j */
function repaired(j) {
  const fields = [];
  const m = State.fromJSON(plain(j), { repair: true, onRepair: (f) => fields.push(f), context: CTX });
  return { m, fields };
}

/** Zustände des Altprojekts aus den E2E-Fixtures. */
export const LEGACY_A = {
  category: 'mean', testType: 'two', direction: 'less', alpha: 0.01, power: 0.9,
  sigma0: '2', sigmaAlt: '', ratio: '', delta: '0.5', sigma: '0.8',
};
export const LEGACY_B = {
  category: 'variance', testType: 'one', direction: 'two-sided', alpha: null, power: null,
  sigma0: '1.5', sigmaAlt: '0', ratio: 'abc', delta: '', sigma: '',
};

suite('sample-size: Migration 0→1.0', () => {
  test('leerer Stand: Vorgaben, α/Power fehlen (Kontext greift)', () => {
    assertDeepEqual(from0({}), { category: 'variance', testType: 'one', direction: 'two-sided', effect: EMPTY });
    const { m, fields } = repaired({});
    assertDeepEqual(fields, []);
    assertEqual(m.alpha, 0.1);
    assertEqual(m.power, 0.9);
  });

  test('unbekannte Kategorie, Richtung, Testtyp → Vorgabe; two-sample-t → two', () => {
    const o = from0({ category: 'x', direction: 'sideways', testType: 'paired' });
    assertEqual(o.category, 'variance');
    assertEqual(o.direction, 'two-sided');
    assertEqual(o.testType, 'one');
    assertEqual(from0({ testType: 'two-sample-t' }).testType, 'two');
    for (const d of ['greater', 'less']) assertEqual(from0({ direction: d }).direction, d);
  });

  test('α/Power: null, Nicht-Zahl oder außerhalb → 0,05 bzw. 0,8; im Bereich bleibt', () => {
    for (const bad of [null, '0.1', NaN, 0.9, 0]) assertEqual(from0({ alpha: bad }).alpha, 0.05, String(bad));
    for (const bad of [null, 'x', 0.3, 1]) assertEqual(from0({ power: bad }).power, 0.8, String(bad));
    assertEqual(from0({ alpha: 0.0001, power: 0.9999 }).alpha, 0.0001);
    assertEqual(from0({ alpha: 0.0001, power: 0.9999 }).power, 0.9999);
  });

  test('Effektangaben: Text und Zahl → Zahl; leer, unlesbar, ≤ 0 → null', () => {
    const o = from0({ sigma0: '1.5', sigmaAlt: 2, ratio: 'abc', delta: '0', sigma: '-1' });
    assertDeepEqual(o.effect, {
      varianceOne: { sigma0: 1.5, sigmaAlt: 2 },
      varianceTwo: { ratio: null },
      mean: { delta: null, sigma: null },
    });
    assertEqual(from0({ delta: '2,5' }).effect.mean.delta, 2.5);
    assertEqual(from0({ delta: '' }).effect.mean.delta, null);
    assertEqual(from0({ delta: '1.5abc' }).effect.mean.delta, null);
  });

  test('Fremdschlüssel entfallen', () => {
    const o = from0({ foo: 1, result: { nRequired: 3 } });
    assertEqual('foo' in o, false);
    assertEqual('result' in o, false);
  });

  test('Altprojekt (a) und (b) ohne Reparatur', () => {
    const a = repaired(LEGACY_A);
    assertDeepEqual(a.fields, []);
    assertDeepEqual(plain(a.m.effect), { ...EMPTY, varianceOne: { sigma0: 2, sigmaAlt: null }, mean: { delta: 0.5, sigma: 0.8 } });
    assertEqual(a.m.alpha, 0.01);
    assertEqual(a.m.power, 0.9);
    const b = repaired(LEGACY_B);
    assertDeepEqual(b.fields, []);
    assertEqual(b.m.alpha, 0.05);
    assertEqual(b.m.power, 0.8);
    assertDeepEqual(plain(b.m.effect), { ...EMPTY, varianceOne: { sigma0: 1.5, sigmaAlt: null } });
  });

  test('Golden-Fixture v0.3.0: zwei Stichproben, ohne Reparatur', async () => {
    const doc = await fetchJSON(new URL('v0.3.0_single_project.json', FIXTURES));
    const { m, fields } = repaired(doc.moduleStates['inst-ssize']);
    assertDeepEqual(fields, []);
    assertEqual(m.category, 'mean');
    assertEqual(m.testType, 'two');
    assertEqual(m.power, 0.9);
    assertDeepEqual(plain(m.effect), {
      varianceOne: { sigma0: 1, sigmaAlt: 1 }, varianceTwo: { ratio: 1 }, mean: { delta: 0.5, sigma: 1 },
    });
    assertEqual(m.toJSON()._schema.version, '1.0');
  });
});
