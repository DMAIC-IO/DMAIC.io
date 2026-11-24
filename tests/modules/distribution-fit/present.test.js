/**
 * Verteilungstest: die Anzeige aus der Rechnung (viewmodel/present.js).
 * Zahlen in der Sprache der Oberfläche mit den Stellen der Altform (4),
 * volle Hilfeschlüssel als Literale, Parameter mit „; “ getrennt.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { analyze } from '../../../js/modules/distribution-fit/domain/analyze.js';
import {
  fmt, pText, quality, kpiCells, rankRows, detailTiles, normality, histogramConfig,
} from '../../../js/modules/distribution-fit/viewmodel/present.js';

/** Übersetzer-Stub: der Schlüssel selbst. */
const t = (k) => k;

/** Spalte „Fehler“ der Altprojekt-Fixture (n = 30 Ganzzahlen 0…9). */
const FEHLER = [3, 5, 2, 4, 6, 3, 1, 4, 5, 2, 7, 3, 4, 0, 5, 3, 2, 6, 4, 3, 8, 2, 4, 5, 3, 1, 4, 9, 3, 5];
/** Fünf Werte: Jarque-Bera und D'Agostino-Pearson melden `tooSmall`. */
const SMALL = [1.2, 2.5, 3.1, 4.8, 5.3];

const fitOf = (values, dataType) => {
  const a = analyze(values, dataType);
  assertEqual(a?.status, 'ok');
  return /** @type {any} */ (a).fit;
};

suite('distribution-fit: Zahlen', () => {
  test('vier Stellen, Dezimalzeichen und Tausendertrennung der Sprache', () => {
    assertEqual(fmt(3.8666666, 'en'), '3.8667');
    assertEqual(fmt(3.8666666, 'de'), '3,8667');
    assertEqual(fmt(1234.5, 'de'), '1.234,5000');
    assertEqual(fmt(1234.5, 'en'), '1,234.5000');
    assertEqual(fmt(0, 'de'), '0,0000');
    assertEqual(fmt(-2.5, 'de', 2), '-2,50');
  });

  test('Exponentialform ab 10⁶ und unter 10⁻⁴, mit dem Dezimalzeichen der Sprache', () => {
    assertEqual(fmt(1234567, 'en'), '1.2346e+6');
    assertEqual(fmt(1234567, 'de'), '1,2346e+6');
    assertEqual(fmt(0.00001234, 'de'), '1,2340e-5');
    assertEqual(fmt(-0.00005, 'en'), '-5.0000e-5');
  });

  test('leer oder nicht endlich: „–“', () => {
    for (const v of [null, undefined, NaN, Infinity, 'x']) assertEqual(fmt(v, 'de'), '–', String(v));
  });

  test('p-Wert: unter 10⁻⁴ als null mit vier Stellen, leer „–“', () => {
    assertEqual(pText(0.00001, 'en'), '0.0000');
    assertEqual(pText(0.00001, 'de'), '0,0000');
    assertEqual(pText(0.97025859, 'de'), '0,9703');
    assertEqual(pText(null, 'de'), '–');
    assertEqual(pText(NaN, 'de'), '–');
  });

  test('Güte: ab 0,10 gut, ab 0,05 mäßig, sonst schlecht', () => {
    assertDeepEqual([0.1, 0.0999, 0.05, 0.0499, NaN].map(quality), ['good', 'moderate', 'moderate', 'poor', 'poor']);
  });
});

suite('distribution-fit: KPI-Streifen', () => {
  test('acht Kacheln, volle Hilfeschlüssel als Literale, Zahlen in der Sprache', () => {
    const cells = kpiCells(fitOf(FEHLER, 'discrete').stats, t, 'de');
    assertDeepEqual(cells.map((c) => c.value), ['30', '3,8667', '2,0297', '4,0000', '0,5650', '0,5206', '0,0000', '9,0000']);
    assertDeepEqual(cells.map((c) => c.label), ['common.sym.n', 'mean', 'stdDev', 'median', 'skewness', 'kurtosisExcess', 'min', 'max']);
    assertDeepEqual(cells.map((c) => c.help), ['n', 'mean', 'stdDev', 'median', 'skewness', 'kurtosis', 'min', 'max']
      .map((k) => `modules.distribution-fit.types.DescStats.${k}`));
  });
});

suite('distribution-fit: Rangliste', () => {
  test('diskret: Rang, Etiketten, Parameter mit „; “, χ², p, Fit-Stufe, Balken', () => {
    const rows = rankRows(fitOf(FEHLER, 'discrete').results, t, 'de');
    assertEqual(rows.length, 2);
    const [p, b] = rows;
    assertEqual(p.rank, 1);
    assertEqual(p.rankClass, 'distfit__rank--1');
    assertEqual(p.nameText, 'Poisson ');
    assertEqual(p.typeTagText, 'tagDisc');
    assertEqual(p.typeTagClass, 'distfit__tag--disc');
    assertEqual(p.isBest, true);
    assertEqual(p.params, 'λ=3,8667');
    assertEqual(p.testName, 'symChi2');
    assertEqual(p.statVal, '0,8995');
    assertEqual(p.pS, '0,9703');
    assertEqual(p.q, 'good');
    assertEqual(p.pCellClass, 'distfit__p-cell--good');
    assertEqual(p.barClass, 'distfit__fit-bar-inner--good');
    assertEqual(p.barStyle, 'width:100%');
    assertEqual(p.qL, 'fitGood');
    assertEqual(b.isBest, false);
    assertEqual(b.rankClass, 'distfit__rank--2');
    assertEqual(b.params, 'n=9,0000; p=0,4296');
  });

  test('stetig: K-S, Rang „other“ ab 4, schlechte Anpassung mit Mindestbalken, p unter 10⁻⁴', () => {
    const fit = fitOf(FEHLER, 'continuous');
    const rows = rankRows(fit.results, t, 'en');
    assertEqual(rows.length, 5);
    assertDeepEqual(rows.map((r) => r.rankClass),
      ['distfit__rank--1', 'distfit__rank--2', 'distfit__rank--3', 'distfit__rank--other', 'distfit__rank--other']);
    assertTrue(rows.every((r) => r.testName === 'symKs' && r.typeTagClass === 'distfit__tag--cont'), 'stetige Zeile');
    assertTrue(rows.every((r) => r.params.includes('; ') || !r.params.includes(',')), 'Trenner');
    const fake = rankRows([{ name: 'X', type: 'cont', params: { a: 1, b: 'k' }, ks: { D: 0.5, p: 0.00001 }, score: 0.00001 }], t, 'en')[0];
    assertEqual(fake.pS, '0.0000');
    assertEqual(fake.q, 'poor');
    assertEqual(fake.barStyle, 'width:5%');
    assertEqual(fake.params, 'a=1.0000; b=k');
    assertEqual(fake.statVal, '0.5000');
  });
});

suite('distribution-fit: Detailkacheln', () => {
  test('diskret mit Freiheitsgraden, stetig ohne; p-Zeile über colP', () => {
    const [d] = detailTiles(fitOf(FEHLER, 'discrete').results, t, 'de');
    assertEqual(d.titleText, ' Poisson ');
    assertEqual(d.pillClass, 'distfit__ndd-pill--pass');
    assertEqual(d.gofLabel, 'detailGofTest (symChi2)');
    assertEqual(d.statRowLabel, 'nddStatistic (symChi2)');
    assertEqual(d.isDisc, true);
    assertEqual(d.df, '5');
    assertEqual(d.pRowLabel, 'colP');
    assertEqual(d.pClass, 'distfit__p-cell--good');
    assertEqual(d.interpClass, 'distfit__interpret--good');
    assertEqual(d.interpText, 'interpGood');
    assertDeepEqual(d.paramRows, [{ key: 'λ', val: '3,8667' }]);
    const [c] = detailTiles(fitOf(FEHLER, 'continuous').results, t, 'de');
    assertEqual(c.isDisc, false);
    assertEqual(c.df, '');
    assertEqual(c.gofLabel, 'detailGofTest (symKs)');
    assertEqual(c.statRowLabel, 'nddStatistic (symKsD)');
  });
});

suite('distribution-fit: Normalitätskarten', () => {
  test('je Test Statistikname, Lab-Id, Urteil, p über colP', () => {
    const ndd = normality(fitOf(FEHLER, 'discrete').normalityTests, t, 'de');
    assertEqual(ndd.show, true);
    assertDeepEqual(ndd.cards.map((c) => c.name), ['Shapiro-Wilk', 'Anderson-Darling', 'Jarque-Bera', "D'Agostino-Pearson"]);
    assertDeepEqual(ndd.cards.map((c) => c.algoId), ['shapiro-wilk', 'anderson-darling', 'jarque-bera', 'dagostino-pearson']);
    assertDeepEqual(ndd.cards.map((c) => c.numText), ['1/4', '2/4', '3/4', '4/4']);
    assertDeepEqual(ndd.cards.map((c) => c.statRowLabel), ['W', 'A²', 'JB', 'K²'].map((s) => `nddStatistic (${s})`));
    assertDeepEqual(ndd.cards.map((c) => c.desc), ['nddSWDesc', 'nddADDesc', 'nddJBDesc', 'nddDPDesc']);
    const sw = ndd.cards[0];
    assertEqual(sw.tooSmall, false);
    assertEqual(sw.statVal, '0,9606');
    assertEqual(sw.pS, '0,3202');
    assertEqual(sw.pRowLabel, 'colP');
    assertEqual(sw.pillClass, 'distfit__ndd-pill--pass');
    assertEqual(sw.pillIcon, 'status.ok');
    assertEqual(sw.pillText, 'nddVerdictPass');
    assertEqual(sw.pClass, 'distfit__p-cell--good');
  });

  test('zu wenige Werte: eigene Texte für Jarque-Bera und D’Agostino-Pearson, nicht im Konsens', () => {
    const ndd = normality(fitOf(SMALL, 'continuous').normalityTests, t, 'en');
    assertDeepEqual(ndd.cards.map((c) => c.tooSmall), [false, false, true, true]);
    assertEqual(ndd.cards[2].tooSmallText, 'nddTooSmallJB');
    assertEqual(ndd.cards[3].tooSmallText, 'nddTooSmallDP');
    assertEqual(ndd.cards[2].algoId, 'jarque-bera');
    assertEqual(ndd.consensus.scoreLabel, '2/2');
    assertEqual(ndd.dots.length, 2);
    const sw = normality([{ name: 'Shapiro-Wilk', tooSmall: true, p: null }], t, 'en').cards[0];
    assertEqual(sw.tooSmallText, 'nddTooSmall');
  });

  test('Urteil mäßig und abgelehnt: Pille, Symbol, Klasse', () => {
    const [w, f] = normality([{ name: 'Shapiro-Wilk', W: 0.9, p: 0.07 }, { name: 'Anderson-Darling', A2: 2, p: 0.001 }], t, 'en').cards;
    assertEqual(w.pillClass, 'distfit__ndd-pill--warn');
    assertEqual(w.pillIcon, 'status.warning');
    assertEqual(w.pClass, 'distfit__p-cell--moderate');
    assertEqual(f.pillClass, 'distfit__ndd-pill--fail');
    assertEqual(f.pillIcon, 'status.error');
    assertEqual(f.pillText, 'nddVerdictFail');
  });

  test('Konsens in allen vier Stufen, Punkte je gültigem Test', () => {
    const c = (ps) => normality(ps.map((p) => ({ name: 'Shapiro-Wilk', W: 0.9, p })), t, 'en');
    const ok = c([0.2, 0.5]);
    assertDeepEqual(ok.consensus, { cls: 'distfit__ndd-consensus--good', title: 'nddConfirmed', text: 'nddConfirmedText', scoreLabel: '2/2' });
    assertDeepEqual(ok.dots.map((d) => d.cls), ['distfit__ndd-dot--good', 'distfit__ndd-dot--good']);
    const border = c([0.2, 0.07]);
    assertDeepEqual([border.consensus.cls, border.consensus.title, border.consensus.text, border.consensus.scoreLabel],
      ['distfit__ndd-consensus--moderate', 'nddBorderline', 'nddBorderlineText', '1/2']);
    assertDeepEqual(border.dots.map((d) => d.cls), ['distfit__ndd-dot--good', 'distfit__ndd-dot--moderate']);
    const mixed = c([0.2, 0.01]);
    assertDeepEqual([mixed.consensus.cls, mixed.consensus.title], ['distfit__ndd-consensus--moderate', 'nddMixed']);
    const rej = c([0.2, 0.01, 0.02]);
    assertDeepEqual([rej.consensus.cls, rej.consensus.title, rej.consensus.scoreLabel], ['distfit__ndd-consensus--poor', 'nddRejected', '1/3']);
    assertEqual(rej.dots[1].cls, 'distfit__ndd-dot--poor');
  });

  test('ohne Tests nicht zu zeigen', () => {
    const ndd = normality([], t, 'en');
    assertEqual(ndd.show, false);
    assertDeepEqual(ndd.cards, []);
    assertDeepEqual(ndd.dots, []);
  });
});

suite('distribution-fit: Histogramm', () => {
  test('Konfiguration wie in der Altform (ohne binMethod: Vorgabe des Typs)', () => {
    assertDeepEqual(histogramConfig([1, 2, 3], t), {
      title: 'histogram', data: [1, 2, 3], showNormalCurve: true,
      barColor: 'var(--color-chart-1)', normalCurveColor: 'var(--color-chart-2)', showLegend: false,
    });
  });
});
