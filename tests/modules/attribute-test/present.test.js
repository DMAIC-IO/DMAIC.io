/**
 * Attributtest: Darstellung (viewmodel/present.js) — Kennzahlen, Entscheidung,
 * Hinweise, Kreuztabelle und Hypothesen in der App-Sprache; die Zahlen kommen
 * aus dem Bericht (domain/report.js).
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { buildReport } from '../../../js/modules/attribute-test/domain/report.js';
import { present, hypotheses } from '../../../js/modules/attribute-test/viewmodel/present.js';

/** Übersetzer-Stub: Schlüssel samt Platzhaltern, damit die Werte prüfbar sind. */
const T = (k, p) => (p && Object.keys(p).length
  ? `${k}(${Object.entries(p).map(([a, b]) => `${a}=${b}`).join(',')})`
  : k);
const st = (over = {}) => ({ direction: 'two-sided', alpha: 0.05, pooled: false, ratePooled: false, ...over });
const TWO = { ok: true, kind: 'two', x1: 46, n1: 1200, x2: 21, n2: 1150, groups: null, missing: 0 };
const value = (shown, key) => shown.stats.find((s) => s.key === key)?.value;

suite('attribute-test: Darstellung', () => {
  test('zwei Anteile deutsch: Komma, Gruppierung ab 1000, Intervall mit Semikolon', () => {
    const shown = present(buildReport(st(), TWO), 0.05, T, 'de');
    assertEqual(value(shown, 'counts1'), '46 / 1.200');
    assertEqual(value(shown, 'p1'), '0,0383');
    assertEqual(value(shown, 'ci'), '[0,0067; 0,0334]');
    assertEqual(value(shown, 'pValue'), '0,0032');
    assertEqual(shown.decisionText, 'decisionReject(alpha=0,05)');
    assertEqual(shown.decisionClass, 'attrtest__decision--reject');
    assertEqual(shown.basisText, 'basisZ');
    assertEqual(shown.table, null);
  });

  test('zwei Anteile englisch: Punkt, Komma als Tausendertrenner, Intervall mit Semikolon', () => {
    const shown = present(buildReport(st(), TWO), 0.05, T, 'en');
    assertEqual(value(shown, 'counts1'), '46 / 1,200');
    assertEqual(value(shown, 'p1'), '0.0383');
    assertEqual(value(shown, 'ci'), '[0.0067; 0.0334]');
    assertEqual(shown.decisionText, 'decisionReject(alpha=0.05)');
  });

  test('Beschriftungen und Hilfeschlüssel je Kennzahl, Zahlen in Platzhaltern lokal', () => {
    const shown = present(buildReport(st(), TWO), 0.05, T, 'de');
    const ci = shown.stats.find((s) => s.key === 'ci');
    assertEqual(ci.label, 'statCiDiff(level=95)');
    assertEqual(ci.help, 'modules.attribute-test.stats.two.ci');
    assertEqual(shown.stats.find((s) => s.key === 'counts1').label, 'statCountsGroup(group=1)');
    assertDeepEqual(shown.notes, [{ key: 'notePairedUseMcNemar', text: 'notePairedUseMcNemar' }]);
  });

  test('nicht signifikant: Folgeschritt Äquivalenz, H₀ beibehalten', () => {
    const shown = present(buildReport(st(), { ...TWO, x2: 41, n2: 1180 }), 0.05, T, 'de');
    assertEqual(shown.decisionClass, 'attrtest__decision--keep');
    assertEqual(shown.decisionText, 'decisionKeep(alpha=0,05)');
    assertDeepEqual(shown.actions, [{ key: 'actionCheckEquivalence', label: 'actionCheckEquivalence' }]);
  });

  test('Äquivalenz nicht nachgewiesen: Grenzen in Prozentpunkten, weder grün noch rot', () => {
    const r = buildReport(st(), { ok: true, kind: 'equiv', samples: 2, x1: 184, n1: 3902, x2: 179, n2: 4023,
      lower: -0.01, upper: 0.01, symmetric: true, delta: 1, groups: null, missing: 0 });
    const shown = present(r, 0.05, T, 'de');
    assertEqual(shown.decisionText, 'decisionNotEquivalent(lower=-1,00,upper=1,00,unit=pp,alpha=0,05)');
    assertEqual(shown.decisionClass, 'attrtest__decision--inconclusive');
    assertEqual(value(shown, 'bounds'), '[-1,00; 1,00]');
    assertEqual(value(shown, 'pValue'), '0,0592');
  });

  test('Zusammenhang: Kreuztabelle mit beobachtet, erwartet (2 Stellen) und Beitrag (3 Stellen)', () => {
    const r = buildReport(st(), { ok: true, kind: 'assoc', rows: ['A', 'B'], cols: ['X', 'Y'], counts: [[1200, 40], [980, 55]], missing: 0 });
    const shown = present(r, 0.05, T, 'de');
    assertDeepEqual(shown.table.cols, ['X', 'Y']);
    assertDeepEqual(shown.table.rows.map((row) => row.name), ['A', 'B']);
    const cell = shown.table.rows[0].cells[0];
    assertEqual(cell.obs, '1.200');
    assertTrue(/^\d{1}\.\d{3},\d{2}$/.test(cell.exp), cell.exp);
    assertTrue(/^\d+,\d{3}$/.test(cell.contrib), cell.contrib);
    const en = present(r, 0.05, T, 'en').table.rows[0].cells[0];
    assertEqual(en.obs, '1,200');
  });

  test('Hypothesen je Testart, Richtung als Zeichen', () => {
    assertDeepEqual(hypotheses({ testKind: 'two', direction: 'greater' }, { before: '', after: '' }, T),
      ['h0Two', 'h1Two(op=>)']);
    assertDeepEqual(hypotheses({ testKind: 'rate1', direction: 'less' }, { before: '', after: '' }, T),
      ['h0Rate1', 'h1Rate1(op=<)']);
    assertDeepEqual(hypotheses({ testKind: 'equiv', direction: 'less' }, { before: '', after: '' }, T),
      ['h0Equiv', 'h1Equiv']);
    assertDeepEqual(hypotheses({ testKind: 'assoc', direction: 'bogus' }, { before: '', after: '' }, T),
      ['h0Assoc', 'h1Assoc']);
    assertDeepEqual(hypotheses({ testKind: 'one', direction: 'bogus' }, { before: '', after: '' }, T),
      ['h0One', 'h1One(op=≠)']);
  });

  test('McNemar: ohne Bezeichnungen allgemein, mit einer Bezeichnung die andere als Rückfall', () => {
    const m = { testKind: 'mcnemar', direction: 'two-sided' };
    assertDeepEqual(hypotheses(m, { before: '', after: '' }, T), ['h0McNemar', 'h1McNemar(op=≠)']);
    assertDeepEqual(hypotheses(m, { before: 'alt', after: '' }, T), [
      'h0McNemarLabeled(before=alt,after=fallbackAfter,op=≠)',
      'h1McNemarLabeled(before=alt,after=fallbackAfter,op=≠)',
    ]);
  });
});
