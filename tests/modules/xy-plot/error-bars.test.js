import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/xy-plot/domain/model.js';
import { buildErrorBars, ERROR_BAR_KEYS } from '../../../js/modules/xy-plot/domain/error-bars.js';
import { buildSeries } from '../../../js/modules/xy-plot/domain/series.js';

const ref = (c) => ({ instanceId: 'w', sheetId: 's', columnId: c });
const sheet = {
  x: [1, 2, 3, 4, 5], y: [10, 20, 30, 40, 50], g: ['A', 'B', 'A', 'B', 'A'],
  e: [1, '', 'abc', null, '2.5'], f: [0.1, 0.2, 0.3, 0.4, 0.5], blank: ['', null, '', null, ''],
  xs: [1, 'a', 3, 4, 5],
};
const read = { values: (r) => sheet[r.columnId] ?? null, name: (r) => r.columnId };
const model = (datasets) => ({ datasets, showMarkers: true, showLines: false, legacySeries: [] });
const row = (o) => ({ x: ref('x'), y: ref('y'), group: null, size: null, errorBars: { mode: 'none' }, ...o });

suite('xy-plot: Fehlerbalken — Feld', () => {
  test('Richtungen', () => {
    assertDeepEqual([...ERROR_BAR_KEYS], ['xPlus', 'xMinus', 'yPlus', 'yMinus']);
  });

  test('Vorgabe none', () => {
    assertDeepEqual(new State().datasets[0].errorBars, { mode: 'none' });
  });

  test('Rundlauf constant und columns, Kopie statt Referenz', () => {
    const m = new State();
    const eb = { mode: 'columns', columns: { xMinus: ref('f'), yPlus: ref('e') } };
    m.datasets = [row({ errorBars: eb }), row({ errorBars: { mode: 'constant', constant: { yPlus: 2.5, yMinus: -1 } } })];
    const t = State.fromJSON(m.toJSON());
    assertDeepEqual(t.datasets[0].errorBars, eb);
    assertDeepEqual(t.datasets[1].errorBars, { mode: 'constant', constant: { yPlus: 2.5, yMinus: -1 } });
    const j = m.toJSON();
    j.datasets[0].errorBars.columns.yPlus.columnId = 'changed';
    assertEqual(m.datasets[0].errorBars.columns.yPlus.columnId, 'e');
  });
});

suite('xy-plot: buildErrorBars', () => {
  test('konstant füllt alle Punkte', () => {
    const eb = buildErrorBars({ mode: 'constant', constant: { yPlus: 2, yMinus: 1 } }, [0, 3, 4], read);
    assertEqual(eb.show, true);
    assertDeepEqual(eb.yPlus, [2, 2, 2]);
    assertDeepEqual(eb.yMinus, [1, 1, 1]);
    assertEqual(eb.yMode, 'relative');
    assertEqual(eb.xMode, 'none');
    assertEqual('xPlus' in eb, false);
    assertEqual('xMinus' in eb, false);
  });

  test('nur +y: die andere Richtung bleibt leer', () => {
    const eb = buildErrorBars({ mode: 'constant', constant: { yPlus: 2, yMinus: null } }, [0, 1], read);
    assertDeepEqual(eb.yPlus, [2, 2]);
    assertDeepEqual(eb.yMinus, [null, null]);
  });

  test('x-Fehler', () => {
    const eb = buildErrorBars({ mode: 'constant', constant: { xPlus: 0.5 } }, [0, 1], read);
    assertEqual(eb.xMode, 'relative');
    assertEqual(eb.yMode, 'none');
    assertDeepEqual(eb.xPlus, [0.5, 0.5]);
    assertDeepEqual(eb.xMinus, [null, null]);
  });

  test('Spalten folgen den Zeilen', () => {
    const eb = buildErrorBars({ mode: 'columns', columns: { yPlus: ref('f') } }, [0, 2], read);
    assertDeepEqual(eb.yPlus, [0.1, 0.3]);
  });

  test('leere und nicht numerische Zellen ergeben null', () => {
    const eb = buildErrorBars({ mode: 'columns', columns: { yPlus: ref('e') } }, [0, 1, 2, 3, 4], read);
    assertDeepEqual(eb.yPlus, [1, null, null, null, 2.5]);
  });

  test('nicht auflösbare Spalte und leere Spalte ergeben keinen Balken', () => {
    assertEqual(buildErrorBars({ mode: 'columns', columns: { yPlus: ref('weg') } }, [0], read), null);
    assertEqual(buildErrorBars({ mode: 'columns', columns: { yPlus: ref('blank') } }, [0, 1], read), null);
  });

  test('none und null ergeben null', () => {
    assertEqual(buildErrorBars({ mode: 'none' }, [0, 1], read), null);
    assertEqual(buildErrorBars(null, [0, 1], read), null);
    assertEqual(buildErrorBars({ mode: 'constant', constant: {} }, [0, 1], read), null);
  });
});

suite('xy-plot: Fehlerbalken an den Reihen', () => {
  test('ohne Fehlerbalken trägt die Reihe keinen Schlüssel errorBars', () => {
    const r = buildSeries(model([row({})]), read);
    assertEqual('errorBars' in r.series[0], false);
  });

  test('G-Split: die Fehler folgen ihren Zeilen', () => {
    const r = buildSeries(model([row({ group: ref('g'), errorBars: { mode: 'columns', columns: { yPlus: ref('f') } } })]), read);
    assertDeepEqual(r.series.map((s) => s.errorBars.yPlus), [[0.1, 0.3, 0.5], [0.2, 0.4]]);
  });

  test('übersprungene Zeilen verschieben die Fehler nicht', () => {
    const r = buildSeries(model([row({ x: ref('xs'), errorBars: { mode: 'columns', columns: { yPlus: ref('f') } } })]), read);
    assertDeepEqual(r.series[0].x, [1, 3, 4, 5]);
    assertDeepEqual(r.series[0].errorBars.yPlus, [0.1, 0.3, 0.4, 0.5]);
  });

  test('gelöschte Fehlerspalte: kein Balken, Punkte bleiben', () => {
    const r = buildSeries(model([row({ errorBars: { mode: 'columns', columns: { yPlus: ref('weg'), yMinus: ref('f') } } })]), read);
    assertEqual(r.series[0].x.length, 5);
    assertEqual(r.series[0].errorBars.yPlus.every((v) => v === null), true);
    assertDeepEqual(r.series[0].errorBars.yMinus, [0.1, 0.2, 0.3, 0.4, 0.5]);
  });
});

suite('xy-plot: setErrorBars', () => {
  const two = () => {
    const m = new State();
    m.datasets = [row({}), row({ y: ref('f') })];
    return m;
  };

  test('setzt die Fehlerbalken einer Reihe', () => {
    const m = two();
    m.setErrorBars({ index: 1, spec: { mode: 'constant', constant: { yPlus: '2' } } });
    assertDeepEqual(m.datasets[1].errorBars, { mode: 'constant', constant: { yPlus: 2 } });
    assertDeepEqual(m.datasets[0].errorBars, { mode: 'none' });
    assertDeepEqual(m.datasets[1].y, ref('f'));
  });

  test('ersetzt die ganze Spezifikation: Moduswechsel leert', () => {
    const m = two();
    m.setErrorBars({ index: 0, spec: { mode: 'constant', constant: { yPlus: 1 } } });
    m.setErrorBars({ index: 0, spec: { mode: 'columns', columns: { yMinus: ref('f') } } });
    assertDeepEqual(m.datasets[0].errorBars, { mode: 'columns', columns: { yMinus: ref('f') } });
    m.setErrorBars({ index: 0, spec: { mode: 'none' } });
    assertDeepEqual(m.datasets[0].errorBars, { mode: 'none' });
  });

  test('lehnt Index, Modus, Zahl und fremde Variante ab', () => {
    const m = two();
    assertThrows(() => m.setErrorBars({ index: 2, spec: { mode: 'none' } }), /0\.\.1/);
    assertThrows(() => m.setErrorBars({ index: 0, spec: { mode: 'bogus' } }), /allowed: none, constant, columns/);
    assertThrows(() => m.setErrorBars({ index: 0, spec: { mode: 'constant', constant: { yPlus: 'abc' } } }), /yPlus/);
    assertThrows(() => m.setErrorBars({ index: 0, spec: { mode: 'columns', constant: {} } }), /allowed: columns \(mode columns\)/);
    assertTrue(m.datasets.every((d) => d.errorBars.mode === 'none'));
  });
});
