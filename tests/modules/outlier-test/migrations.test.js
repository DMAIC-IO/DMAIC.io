/**
 * Ausreißertest: Migration der Altform (domain/migrations.js).
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/outlier-test/domain/model.js';
import { from0 } from '../../../js/modules/outlier-test/domain/migrations.js';
import { ALL_METHODS } from '../../../js/modules/outlier-test/domain/analyze.js';

const CTX = { cycle: 'dmaic', confidenceLevel: 95, power: 80 };
const plain = (v) => JSON.parse(JSON.stringify(v));
const load = (json, context = CTX) => State.fromJSON(json, { context });

const WS = '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d';

/** Instanz der Altprojekt-Fixture (Stand des Altmoduls, ohne `_schema`). */
const LEGACY = {
  colRef: { instanceId: WS, sheetId: 'sheet_1', columnId: 'col_ot_d' },
  alpha: 0.1, side: 'upper', tukeyFactor: 2, hampelK: 2.5, zThreshold: 2.5,
  modZThreshold: 3, esdMaxOutliers: 3,
  enabled: ['z-score', 'grubbs', 'tukey-iqr', 'generalized-esd'],
  chartMethod: 'grubbs', exampleWorksheetId: null,
};

/** Das Beispiel `outlier-bolzen-grubbs` in der Altform (ohne `sourceWorksheetFile`). */
const EXAMPLE_OLD = {
  colRef: { instanceId: '__source__', sheetId: 'sheet-outlier-bolzen', columnId: 'c-durchmesser' },
  alpha: 0.05, side: 'two-sided', tukeyFactor: 1.5, hampelK: 3, zThreshold: 3, modZThreshold: 3.5,
  esdMaxOutliers: null, enabled: ['grubbs', 'generalized-esd', 'tukey-iqr', 'modified-z'], chartMethod: 'all',
};

/** Dasselbe Beispiel in der neuen Form (nur Abweichungen von der Vorgabe). */
const EXAMPLE_NEW = {
  _schema: { version: '1.0' },
  colRef: { instanceId: '__source__', sheetId: 'sheet-outlier-bolzen', columnId: 'c-durchmesser' },
  alpha: 0.05,
  enabled: ['grubbs', 'generalized-esd', 'tukey-iqr', 'modified-z'],
};

suite('outlier-test: Migration — Altprojekt', () => {
  test('Altfixture: alle Felder übernommen, enabled geordnet, chartMethod bleibt', () => {
    const m = load(LEGACY);
    assertDeepEqual(plain(m.colRef), LEGACY.colRef);
    assertEqual(m.alpha, 0.1);
    assertEqual(m.side, 'upper');
    assertEqual(m.tukeyFactor, 2);
    assertEqual(m.hampelK, 2.5);
    assertEqual(m.zThreshold, 2.5);
    assertEqual(m.modZThreshold, 3);
    assertEqual(m.esdMaxOutliers, 3);
    assertDeepEqual(plain(m.enabled), ['grubbs', 'generalized-esd', 'tukey-iqr', 'z-score']);
    assertEqual(m.chartMethod, 'grubbs');
    assertEqual(m.exampleWorksheetId, null);
    assertDeepEqual(plain(m.chart), {});
  });

  test('Beispiel outlier-bolzen-grubbs: Altform ergibt dasselbe wie die neue Datei', () => {
    const a = plain(load(EXAMPLE_OLD).toJSON());
    const b = plain(load(EXAMPLE_NEW, { ...CTX, confidenceLevel: 90 }).toJSON());
    assertDeepEqual(a, b);
    assertEqual(load(EXAMPLE_OLD, { ...CTX, confidenceLevel: 90 }).alpha, 0.05, 'alpha 0,05 bleibt ausdrücklich');
  });

  test('Fremdschlüssel entfallen', () => {
    const out = from0({ ...LEGACY, foo: 1, results: { x: 1 }, sourceWorksheetFile: 'x.json' });
    for (const k of ['foo', 'results', 'sourceWorksheetFile']) assertEqual(k in out, false, k);
    assertEqual(load({ ...LEGACY, foo: 1 }).toJSON().foo, undefined);
  });
});

suite('outlier-test: Migration — Fälle des alten fromJSON', () => {
  test('{} ergibt die Vorgaben', () => {
    const m = load({});
    assertEqual(m.colRef, null);
    assertEqual(m.alpha, 0.05);
    assertEqual(m.side, 'two-sided');
    assertEqual(m.tukeyFactor, 1.5);
    assertEqual(m.hampelK, 3);
    assertEqual(m.zThreshold, 3);
    assertEqual(m.modZThreshold, 3.5);
    assertEqual(m.esdMaxOutliers, null);
    assertDeepEqual(plain(m.enabled), [...ALL_METHODS]);
    assertEqual(m.chartMethod, 'all');
    assertEqual(m.exampleWorksheetId, null);
  });

  test('gültige Einzelwerte bleiben', () => {
    assertEqual(load({ alpha: 0.01 }).alpha, 0.01);
    assertEqual(load({ side: 'upper' }).side, 'upper');
    assertEqual(load({ tukeyFactor: 3 }).tukeyFactor, 3);
    assertEqual(load({ hampelK: 2.5 }).hampelK, 2.5);
    assertEqual(load({ zThreshold: 2.5 }).zThreshold, 2.5);
    assertEqual(load({ modZThreshold: 4 }).modZThreshold, 4);
    assertEqual(load({ esdMaxOutliers: 5 }).esdMaxOutliers, 5);
    assertEqual(load({ esdMaxOutliers: null }).esdMaxOutliers, null);
    assertDeepEqual(plain(load({ enabled: ['grubbs', 'tukey-iqr'] }).enabled), ['grubbs', 'tukey-iqr']);
    assertEqual(load({ chartMethod: 'grubbs' }).chartMethod, 'grubbs');
    assertEqual(load({ exampleWorksheetId: 'ws-123' }).exampleWorksheetId, 'ws-123');
  });

  test('colRef: vollständig wird Text, unvollständig oder kein Objekt → null', () => {
    assertDeepEqual(plain(load({ colRef: { instanceId: 'inst1', sheetId: 'sheet1', columnId: 'col1' } }).colRef),
      { instanceId: 'inst1', sheetId: 'sheet1', columnId: 'col1' });
    assertDeepEqual(from0({ colRef: { instanceId: 1, sheetId: 2, columnId: 3 } }).colRef,
      { instanceId: '1', sheetId: '2', columnId: '3' });
    assertEqual(load({ colRef: { instanceId: 'x' } }).colRef, null);
    assertEqual(load({ colRef: 'invalid' }).colRef, null);
    assertEqual(load({ colRef: { instanceId: '', sheetId: 's', columnId: 'c' } }).colRef, null);
  });

  test('side unbekannt → Vorgabe', () => {
    assertEqual('side' in from0({ side: 'invalid-side' }), false);
    assertEqual(load({ side: 'invalid-side' }).side, 'two-sided');
  });
});

suite('outlier-test: Migration — alpha', () => {
  test('null, fehlend, 0,7 oder NaN → Feld entfällt, Kontextvorgabe greift', () => {
    for (const v of [null, undefined, 0.7, NaN, 'x', 0]) {
      assertEqual('alpha' in from0({ alpha: v }), false, String(v));
      assertEqual(load({ alpha: v }).alpha, 0.05, String(v));
    }
    assertEqual(load({ alpha: null }, { ...CTX, confidenceLevel: 90 }).alpha, 0.1);
    assertEqual(load({}, { ...CTX, confidenceLevel: 90 }).alpha, 0.1);
  });

  test('Ränder 0,0001 und 0,5 bleiben, Text wird Zahl', () => {
    assertEqual(load({ alpha: 0.0001 }).alpha, 0.0001);
    assertEqual(load({ alpha: 0.5 }).alpha, 0.5);
    assertEqual(load({ alpha: '0.1' }).alpha, 0.1);
  });
});

suite('outlier-test: Migration — Schwellen', () => {
  test('Text wird Zahl (wie Number im alten fromJSON)', () => {
    const m = load({ tukeyFactor: '2', hampelK: '4.5', zThreshold: '2.5', modZThreshold: '3' });
    assertEqual(m.tukeyFactor, 2);
    assertEqual(m.hampelK, 4.5);
    assertEqual(m.zThreshold, 2.5);
    assertEqual(m.modZThreshold, 3);
  });

  test('außerhalb des Bereichs oder nicht endlich → Vorgabe', () => {
    const m = load({ tukeyFactor: 11, hampelK: 0.05, zThreshold: Infinity, modZThreshold: NaN });
    assertEqual(m.tukeyFactor, 1.5);
    assertEqual(m.hampelK, 3);
    assertEqual(m.zThreshold, 3);
    assertEqual(m.modZThreshold, 3.5);
    assertEqual(load({ hampelK: 20 }).hampelK, 20);
    assertEqual(load({ tukeyFactor: 'abc', zThreshold: '', modZThreshold: true }).tukeyFactor, 1.5);
  });
});

suite('outlier-test: Migration — esdMaxOutliers', () => {
  test("'3' → 3, 0/-1/'x' → automatisch, 80 → 50", () => {
    assertEqual(load({ esdMaxOutliers: '3' }).esdMaxOutliers, 3);
    assertEqual(load({ esdMaxOutliers: 0 }).esdMaxOutliers, null);
    assertEqual(load({ esdMaxOutliers: -1 }).esdMaxOutliers, null);
    assertEqual(load({ esdMaxOutliers: 'x' }).esdMaxOutliers, null);
    assertEqual(load({ esdMaxOutliers: 80 }).esdMaxOutliers, 50);
    assertEqual(load({ esdMaxOutliers: 4.7 }).esdMaxOutliers, 4);
  });
});

suite('outlier-test: Migration — enabled', () => {
  test('ungeordnet → feste Reihenfolge, Doppelte und Unbekannte entfallen', () => {
    assertDeepEqual(plain(load({ enabled: ['modified-z', 'grubbs', 'hampel'] }).enabled), ['grubbs', 'hampel', 'modified-z']);
    assertDeepEqual(plain(load({ enabled: ['grubbs', 'grubbs', 'z-score'] }).enabled), ['grubbs', 'z-score']);
    assertDeepEqual(plain(load({ enabled: ['nope', 'tukey-iqr', 42] }).enabled), ['tukey-iqr']);
  });

  test('[], nur Unbekannte oder kein Array → alle sieben', () => {
    for (const v of [[], ['nope'], 'grubbs', null, { grubbs: true }]) {
      assertEqual('enabled' in from0({ enabled: v }), false, JSON.stringify(v));
      assertDeepEqual(plain(load({ enabled: v }).enabled), [...ALL_METHODS], JSON.stringify(v));
    }
  });
});

suite('outlier-test: Migration — chartMethod', () => {
  test("unbekannt oder '' → 'all', gültig bleibt", () => {
    assertEqual(load({ chartMethod: 'nope' }).chartMethod, 'all');
    assertEqual(load({ chartMethod: '' }).chartMethod, 'all');
    assertEqual(load({ chartMethod: 'all' }).chartMethod, 'all');
    assertEqual(load({ chartMethod: 'hampel' }).chartMethod, 'hampel');
  });

  test('landet im Inhaltsfeld: abweichende Wahl zählt als Inhalt', () => {
    assertEqual(load({ chartMethod: 'hampel' }).hasContent(), true);
    assertEqual(load({ chartMethod: 'all' }).hasContent(), false);
  });

  test('ein Verfahren, das nicht aktiv ist, bleibt gespeichert (Heilung beim Lesen)', () => {
    assertEqual(load({ chartMethod: 'dixon-q', enabled: ['grubbs'] }).chartMethod, 'dixon-q');
  });
});
