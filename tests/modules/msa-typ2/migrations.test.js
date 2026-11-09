import { suite, test, assert, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/msa-typ2/domain/model.js';

const CTX = { cycle: 'dmaic', confidenceLevel: 95, power: 90 };
const ref = (col) => ({ instanceId: 'ws1', sheetId: 's1', columnId: col });
const load = (json, opts = {}) => State.fromJSON(json, { context: CTX, ...opts });

suite('MSA Typ 2 — Migration 0→1.0', () => {
  test('Texte werden Zahlen, Komma ist Dezimaltrenner, leer wird null', () => {
    const m = load({ params: { lsl: '6', usl: '14', alpha: '0,05', k: '5.15', verdictBasis: 'auto', sigmaHist: '' } });
    assertEqual(m.lsl, 6);
    assertEqual(m.usl, 14);
    assertEqual(m.alpha, 0.05);
    assertEqual(m.k, 5.15);
    assertEqual(m.verdictBasis, 'auto');
    assertEqual(m.sigmaHist, null);
  });

  test('Altzahlen: NaN wird null; leeres alpha entfällt, die Kontextvorgabe greift', () => {
    const m = load({ params: { lsl: NaN, usl: 12, alpha: '', sigmaHist: 'abc' } });
    assertEqual(m.lsl, null);
    assertEqual(m.usl, 12);
    assertEqual(m.alpha, 0.05);
    assertEqual(m.sigmaHist, null);
    assertEqual(load({ params: { alpha: NaN } }, { context: { ...CTX, confidenceLevel: 90 } }).alpha, 0.1);
  });

  test('k: params.k, sonst studyVarMultiplier, sonst 5,15', () => {
    assertEqual(load({ params: { studyVarMultiplier: 6 } }).k, 6);
    assertEqual(load({ params: { k: '6', studyVarMultiplier: 5.15 } }).k, 6);
    assertEqual(load({ params: {} }).k, 5.15);
    assertEqual(load({}).k, 5.15);
    assertEqual(load({ params: { k: '7' } }).k, 5.15);
  });

  test('verdictBasis: fehlend oder unbekannt wird studyVar', () => {
    assertEqual(load({ params: {} }).verdictBasis, 'studyVar');
    assertEqual(load({ params: { verdictBasis: 'bogus' } }).verdictBasis, 'studyVar');
    assertEqual(load({ params: { verdictBasis: 'tolerance' } }).verdictBasis, 'tolerance');
  });

  test('columnRefs werden Felder; params/columnRefs entfallen; exampleWorksheetId bleibt', () => {
    const m = load({
      columnRefs: { part: ref('p'), operator: ref('o'), measurement: ref('y') },
      params: { lsl: 1 }, exampleWorksheetId: 'ws-9',
    });
    assertDeepEqual(m.part, ref('p'));
    assertDeepEqual(m.operator, ref('o'));
    assertDeepEqual(m.measurement, ref('y'));
    assertEqual(m.exampleWorksheetId, 'ws-9');
    const json = m.toJSON();
    assert(!('params' in json) && !('columnRefs' in json), 'Altschlüssel entfallen');
  });

  test('chartEdits liegen beim Zustandsverwalter: die Migration lässt sie liegen', () => {
    const m = load({ chartEdits: { components: { title: 'X' } }, params: { lsl: 1 } });
    assertEqual(m.lsl, 1);
    assert(!('chartEdits' in m.toJSON()), 'kein chartEdits im Model');
  });

  test('Altprojekt mit lsl 9, usl 3: repair leert usl', () => {
    const reports = [];
    const m = load({ params: { lsl: '9', usl: '3' } }, { repair: true, onRepair: (n) => reports.push(n) });
    assertEqual(m.lsl, 9);
    assertEqual(m.usl, null);
    assert(reports.length > 0);
  });

  test('null und Müll liefern die Vorgaben', () => {
    const m = load(null);
    assertEqual(m.k, 6);
    assertEqual(m.part, null);
  });
});
