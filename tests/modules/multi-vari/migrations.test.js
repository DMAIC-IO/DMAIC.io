import { suite, test, assert, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/multi-vari/domain/model.js';

const ref = (col) => ({ instanceId: 'ws1', sheetId: 's1', columnId: col });

suite('Multi-Vari — Migration 0→1.0', () => {
  test('nur factorRows: ids und Bezüge bleiben, columnRefs/factorRows entfallen', () => {
    const m = State.fromJSON({
      columnRefs: { measurement: ref('y') },
      factorRows: [{ id: 'a', ref: ref('x1') }, { id: 'b', ref: null }, { id: 'c', ref: ref('x3') }],
    });
    assertDeepEqual(m.measurement, ref('y'));
    assertDeepEqual(m.factors, [{ id: 'a', ref: ref('x1') }, { id: 'b', ref: null }, { id: 'c', ref: ref('x3') }]);
    const json = m.toJSON();
    assert(!('columnRefs' in json) && !('factorRows' in json), 'Altschlüssel entfallen');
  });

  test('nur flaches columnRefs.factors (Beispielform): neue, eindeutige ids', () => {
    const m = State.fromJSON({
      columnRefs: {
        measurement: { instanceId: '__source__', sheetId: 's', columnId: 'y' },
        factors: [{ instanceId: '__source__', sheetId: 's', columnId: 'a' }, { instanceId: '__source__', sheetId: 's', columnId: 'b' }, { instanceId: '__source__', sheetId: 's', columnId: 'c' }],
      },
    });
    assertEqual(m.factors.length, 3);
    assertEqual(m.factors[2].ref.columnId, 'c');
    assertEqual(m.measurement.instanceId, '__source__');
    const ids = m.factors.map(f => f.id);
    assert(ids.every(id => id !== ''), 'ids nicht leer');
    assertEqual(new Set(ids).size, 3);
  });

  test('beides: factorRows gewinnt', () => {
    const m = State.fromJSON({
      columnRefs: { measurement: null, factors: [ref('flat1'), ref('flat2')] },
      factorRows: [{ id: 'r1', ref: ref('row1') }, { id: 'r2', ref: ref('row2') }],
    });
    assertDeepEqual(m.factors, [{ id: 'r1', ref: ref('row1') }, { id: 'r2', ref: ref('row2') }]);
  });

  test('unbekannte Enums fallen zurück, Schalter folgen !== false', () => {
    const m = State.fromJSON({ modelForm: 'bogus', estimator: 'x', showPoints: 0, connectMeans: false, showGroupMean: null });
    assertEqual(m.modelForm, 'nested');
    assertEqual(m.estimator, 'anova');
    assertEqual(m.showPoints, true);
    assertEqual(m.connectMeans, false);
    assertEqual(m.showGroupMean, true);
    assertEqual(m.showRefLine, true);
  });

  test('exampleWorksheetId bleibt, fremde Werte werden null', () => {
    assertEqual(State.fromJSON({ exampleWorksheetId: 'ws-9' }).exampleWorksheetId, 'ws-9');
    assertEqual(State.fromJSON({ exampleWorksheetId: 5 }).exampleWorksheetId, null);
  });

  test('Rundreise toJSON/fromJSON ohne _schema ist gleich', () => {
    const m = State.fromJSON({ columnRefs: { measurement: ref('y') }, factorRows: [{ id: 'a', ref: ref('x') }, { id: 'b', ref: null }], estimator: 'reml' });
    const { _schema, ...plain } = m.toJSON();
    assertDeepEqual(State.fromJSON(plain).toJSON(), m.toJSON());
    assertDeepEqual(State.fromJSON(m.toJSON()).toJSON(), m.toJSON());
  });

  test('kaputte Eingaben ergeben die Vorgabe', () => {
    assertEqual(State.fromJSON({}).hasContent(), false);
  });
});
