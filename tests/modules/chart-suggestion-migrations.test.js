import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import { State } from '../../js/modules/chart-suggestion/domain/model.js';
import { from0, refsFromSelection } from '../../js/modules/chart-suggestion/domain/migrations.js';
import { loadModel } from '../../js/core/initial-model.js';
import { setFields } from '../../js/core/model.js';

const col = (id) => ({ id, name: id, role: 'continuous', type: 'numeric', values: [1] });
const sel = { sourceInstanceId: 'ws', sourceSheetId: 's', ts: 1, columns: [col('a'), col('b')] };
const refs = [{ instanceId: 'ws', sheetId: 's', columnId: 'a' }, { instanceId: 'ws', sheetId: 's', columnId: 'b' }];

suite('chart-suggestion: Migration', () => {
  test('Altform → columns/pick/exampleWorksheetId', () => {
    assertDeepEqual(from0({ selection: sel, selectedChartType: 'bar', exampleWorksheetId: 'x' }), { columns: refs, pick: 'bar', exampleWorksheetId: 'x' });
  });
  test('Vorbelegung des Arbeitsblatts (selectedChartType null)', () => {
    assertDeepEqual(from0({ selection: sel, selectedChartType: null }), { columns: refs, pick: null, exampleWorksheetId: null });
  });
  test('Beispiel mit __source__', () => {
    assertEqual(from0({ selection: { ...sel, sourceInstanceId: '__source__' } }).columns[0].instanceId, '__source__');
  });
  test('ohne Blatt oder Instanz leer', () => {
    assertDeepEqual(from0({ selection: { ...sel, sourceSheetId: null } }).columns, []);
    assertDeepEqual(from0({ selection: { ...sel, sourceInstanceId: null } }).columns, []);
    assertDeepEqual(from0({}).columns, []);
  });
  test('refsFromSelection', () => {
    assertDeepEqual(refsFromSelection(sel), refs);
    assertDeepEqual(refsFromSelection(null), []);
  });
});

suite('chart-suggestion: Model', () => {
  test('loadModel der Altform ohne Warnung, mit _schema', () => {
    const orig = console.warn; const calls = [];
    console.warn = (...a) => calls.push(a);
    let m;
    try { m = loadModel(State, { selection: sel, selectedChartType: 'pie' }); } finally { console.warn = orig; }
    assertEqual(calls.length, 0);
    assertEqual(m.pick, 'pie');
    assertDeepEqual(m.columns, refs);
    const j = m.toJSON();
    assertTrue(j._schema && j._schema.version === '1.0');
  });
  test('oneSheet', () => {
    const m = new State();
    let err = null;
    try { setFields(m, { columns: [refs[0], { ...refs[1], sheetId: 's2' }] }); } catch (e) { err = e; }
    assertTrue(err && /oneSheet/.test(err.message));
  });
  test('distinct', () => {
    const m = new State();
    let err = null;
    try { setFields(m, { columns: [refs[0], { ...refs[0] }] }); } catch (e) { err = e; }
    assertTrue(err && /distinct/.test(err.message));
  });
  test('hasContent', () => {
    const m = new State();
    assertEqual(m.hasContent(), false);
    setFields(m, { columns: [refs[0]] });
    assertEqual(m.hasContent(), true);
  });
});
