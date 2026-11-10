import { suite, test, assert, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/msa-typ5/domain/model.js';

const CTX = { cycle: 'dmaic', confidenceLevel: 95, power: 90 };
const ref = (col) => ({ instanceId: 'ws1', sheetId: 's1', columnId: col });
const load = (json, opts = {}) => State.fromJSON(json, { context: CTX, ...opts });

suite('MSA Typ 5 — Migration 0→1.0', () => {
  test('Parameter als Text werden Zahlen; ordinalOrder und params entfallen', () => {
    const m = load({ params: { type: 'ordinal', weights: 'linear', alpha: '0.10', ruleSet: 'bosch', layout: 'wide', trials: '3', positiveLevel: null, ordinalOrder: ['a'] } });
    assertEqual(m.type, 'ordinal');
    assertEqual(m.weights, 'linear');
    assertEqual(m.alpha, 0.1);
    assertEqual(m.ruleSet, 'bosch');
    assertEqual(m.layout, 'wide');
    assertEqual(m.trials, 3);
    assertEqual(m.positiveLevel, null);
    const json = m.toJSON();
    assert(!('params' in json) && !('ordinalOrder' in json), 'Altschlüssel entfallen');
  });

  test('alpha: Altzahl bleibt, ungültiger Text entfällt', () => {
    assertEqual(load({ params: { alpha: 0.05 } }).alpha, 0.05);
    assertEqual(load({ params: { alpha: '0.07' } }).alpha, 0.05);
  });

  test('trials: ungültig entfällt, Vorgabe greift', () => {
    assertEqual(load({ params: { trials: 'x' } }).trials, 2);
    assertEqual(load({ params: { trials: '0' } }).trials, 2);
    assertEqual(load({ params: { trials: 4 } }).trials, 4);
  });

  test('unbekannter type: Vorgabe', () => {
    assertEqual(load({ params: { type: 'bogus' } }).type, 'binary');
  });

  test('positiveLevel als Text bleibt', () => {
    assertEqual(load({ params: { positiveLevel: 'ok' } }).positiveLevel, 'ok');
  });

  test('columns werden Felder; columns entfällt; exampleWorksheetId bleibt', () => {
    const m = load({
      columns: { part: ref('p'), appraiser: ref('a'), rating: ref('r'), reference: ref('f'), replicate: ref('t'), ratings: [ref('r1'), ref('r2')] },
      exampleWorksheetId: 'ws-9',
    });
    assertDeepEqual(m.part, ref('p'));
    assertDeepEqual(m.appraiser, ref('a'));
    assertDeepEqual(m.rating, ref('r'));
    assertDeepEqual(m.reference, ref('f'));
    assertDeepEqual(m.replicate, ref('t'));
    assertEqual(m.ratings.map((r) => r.columnId).join(','), 'r1,r2');
    assertEqual(m.exampleWorksheetId, 'ws-9');
    assert(!('columns' in m.toJSON()), 'columns entfällt');
  });

  test('chartEdits bleiben außerhalb des Models', () => {
    const m = load({ chartEdits: { kappa: { title: 'X' } }, params: { type: 'nominal' } });
    assertEqual(m.type, 'nominal');
    assert(!('chartEdits' in m.toJSON()));
  });

  test('null und Müll liefern die Vorgaben', () => {
    assertEqual(load(null).type, 'binary');
    assertEqual(load({ params: 5, columns: 'x' }).trials, 2);
  });

  test('doppelte Bewertungsspalten werden beim Laden repariert', () => {
    const m = load({ columns: { ratings: [ref('a'), ref('a')] } }, { repair: true });
    assertEqual(m.ratings.length, 1);
  });

  const NAMES = ['binary-good', 'binary-marginal', 'binary-wide', 'nominal-3classes', 'ordinal-scale5', 'zaehltest'];
  for (const n of NAMES) {
    test(`Beispielprojekt ${n} lädt ohne Reparatur`, async () => {
      const url = new URL(`../../../examples/projects/msa-typ5-${n}.json`, import.meta.url);
      const res = await fetch(url, { cache: 'no-cache' });
      assert(res.ok, `fetch ${n}`);
      const data = await res.json();
      const reports = [];
      const m = State.fromJSON(data, { repair: true, onRepair: (r) => reports.push(r), context: CTX });
      assertEqual(reports.length, 0, 'keine Reparatur');
      assertEqual(m.layout, n === 'binary-wide' ? 'wide' : 'long');
      assert(m.part !== null || data.columns.part == null);
    });
  }
});
