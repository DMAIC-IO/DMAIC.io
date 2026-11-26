/**
 * MSA Typ 1: Darstellung — Zahlformat je Sprache, Statuszeile, Tabelle und
 * Diagrammkonfiguration als reine Funktionen.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import {
  fmt, fmtOpt, fmtP, resultOf, kpiClass, statusLabel, badgeLabel, biasTestText, statCols,
  runChart, histChart, ZONE_FILL,
} from '../../../js/modules/msa-typ1/viewmodel/present.js';
import { analyze } from '../../../js/engines/msa-typ1-engine.js';

const t = (k, p) => (p ? `${k}${JSON.stringify(p)}` : k);
const VALUES = Array.from({ length: 30 }, (_, i) => 10 + ((i % 7) - 3) * 0.001);
const R = analyze({ ref: 10, lsl: 9.9, usl: 10.1, k1: 0.2, k2: 3 }, VALUES);
const OUT = analyze({ ref: 10, lsl: 9.9, usl: 10.1, k1: 0.2, k2: 3 }, [...VALUES.slice(0, 29), 10.05]);

suite('MSA Typ 1 present — Zahlen', () => {
  test('fmt/fmtOpt/fmtP je Sprache', () => {
    assertEqual(fmt(1.84451, 4, 'de'), '1,8445');
    assertEqual(fmt(1.84451, 4, 'en'), '1.8445');
    assertEqual(fmtOpt(null, 4, 'de'), '–');
    assertEqual(fmtOpt(Infinity, 4, 'de'), '–');
    assertEqual(fmtP(0.0001, 'de'), '< 0,001');
    assertEqual(fmtP(0.47825, 'de'), '= 0,478');
    assertEqual(fmtP(0.47825, 'en'), '= 0.478');
    assertEqual(fmtP(null, 'en'), '–');
  });
});

suite('MSA Typ 1 present — Status und Texte', () => {
  test('resultOf: null, invalid und error ergeben kein Ergebnis', () => {
    assertEqual(resultOf(null), null);
    assertEqual(resultOf({ invalid: { key: 'k', vars: null } }), null);
    assertEqual(resultOf({ error: 'x' }), null);
    assertEqual(resultOf(R), R);
  });
  test('Statusklassen und Urteile', () => {
    assertEqual(kpiClass('pass'), 'dmike-kpi--good');
    assertEqual(kpiClass('none'), '');
    assertEqual(statusLabel({ overall: 'none' }, t), 'statusOneSided');
    assertEqual(statusLabel({ noSpread: true, overall: 'none' }, t), 'statusNoSpread');
    assertEqual(badgeLabel(null, t), '–');
    assertEqual(badgeLabel('warn', t), 'condCapable');
  });
  test('t-Test-Zeile mit Dezimalkomma', () => {
    const s = biasTestText(R, t, 'de');
    assertEqual(s.startsWith('biasTestLine{"t":"'), true);
    assertEqual(/"t":"-?\d+,\d{2}"/.test(s), true);
    assertEqual(biasTestText({ biasTest: { t: null } }, t, 'de'), '–');
  });
  test('Statistiktabelle: zehn Spalten, Werte mit Einheit, k₁/k₂ ohne Anker', () => {
    const de = statCols(R, 'mm', t, 'de');
    assertEqual(de.length, 10);
    assertEqual(de[0].value, '30');
    assertEqual(de[6].value, '10,0000 mm');
    assertDeepEqual(de[9], { label: 'k₁ / k₂', help: null, value: '0,2 / 3' });
    assertEqual(statCols(R, 'mm', t, 'en')[9].value, '0.2 / 3');
    assertDeepEqual(statCols(null, 'mm', t, 'de'), []);
  });
});

suite('MSA Typ 1 present — Diagramme', () => {
  test('Verlauf: Ausreißerreihe nur mit Ausreißern, Zone mit der Mischfarbe', () => {
    assertEqual(runChart(R, t).series.length, 1);
    const c = runChart(OUT, t);
    assertEqual(c.series.length, 2);
    assertEqual(c.series[1].markerSize, 5);
    assertDeepEqual(c.series[1].x, [30]);
    assertEqual(c.moduleRefAreas[0].color, ZONE_FILL);
    assertEqual(runChart(null, t), null);
  });
  test('Verlauf einseitig: ohne Zone und ohne fehlende Grenze', () => {
    const one = analyze({ ref: 10, lsl: NaN, usl: 10.1, k1: 0.2, k2: 3 }, VALUES);
    const c = runChart(one, t);
    assertDeepEqual(c.moduleRefAreas, []);
    assertDeepEqual(c.moduleRefLines.map((l) => l.label), ['chartRefLabel', 'common.sym.xbar', 'common.sym.usl']);
  });
  test('Histogramm: Werte, Normalkurve, Linien USG/OSG/Sollwert', () => {
    const c = histChart(R, t);
    assertEqual(c.data.length, 30);
    assertEqual(c.showNormalCurve, true);
    assertDeepEqual(c.moduleRefLines.map((l) => [l.label, l.value]), [['common.sym.lsl', 9.9], ['common.sym.usl', 10.1], ['common.sym.target', 10]]);
    assertEqual(histChart(null, t), null);
  });
});
