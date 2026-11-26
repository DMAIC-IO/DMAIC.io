/**
 * Tests for modules/calculator/viewmodel/present.js — die Anzeigetabelle der
 * Altform je Kommando, die Gültigkeit einer Anzeige gegen den Stand, die
 * Texte beider Zeilen, die Tastenbeschriftungen und das Zahlformat in de/en.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import {
  nextDisplay, currentDisplay, topText, mainText, isError, mainIcon, keyLabel,
  formatStat, formatCalc, formatValue, snapOf,
} from '../../../js/modules/calculator/viewmodel/present.js';

/** @param {object} [p] @returns {any} */
const model = (p = {}) => ({
  mode: 'sci', expression: '', lastResult: null, memory: 0, angleMode: 'DEG',
  dataset: [], ssDataset: [], lsl: null, usl: null, ...p,
});
const T = { statMode: 'Modus', statSkewness: 'Schiefe', statMean: 'Mittelwert', statSample: 'Stichpr.', keyCp: 'Cp', error: 'Fehler', removed: 'Entfernt', needN2: 'n ≥ 2 nötig', noData: 'Keine Daten', needDataAndLimits: 'Daten + USG/OSG nötig' };
const t = (k) => T[k] ?? k;
/** @param {any} d @param {any} m */
const shown = (d, m, lang = 'de') => [topText(currentDisplay(d, m), t), mainText(currentDisplay(d, m), m, t, lang)];

suite('calculator Presenter — Anzeige je Kommando', () => {
  test('ohne Anzeige: Ausdruck oder 0, keine Zeile darüber', () => {
    assertDeepEqual(shown(null, model()), ['', '0']);
    assertDeepEqual(shown(null, model({ expression: '2^3' })), ['', '2^3']);
  });
  test('Eingabe lässt die Zeile darüber stehen', () => {
    const m1 = model({ lastResult: 5 });
    const d1 = nextDisplay(null, 'calculate', {}, { value: 5, reason: null, expression: '2+3' }, m1);
    const m2 = model({ expression: '7' });
    const d2 = nextDisplay(d1, 'inputText', { ch: '7' }, '7', m2);
    assertDeepEqual(shown(d2, m2), ['2+3 =', '7']);
  });
  test('calculate: Ausdruck mit =, Ergebnis; Fehler rot, Zeile bleibt', () => {
    const m = model({ lastResult: 0.5 });
    const d = nextDisplay(null, 'calculate', {}, { value: 0.5, reason: null, expression: '1÷2' }, m);
    assertDeepEqual(shown(d, m), ['1÷2 =', '0,5']);
    assertDeepEqual(shown(d, m, 'en'), ['1÷2 =', '0.5']);
    const m2 = model({ expression: '(' });
    const e = nextDisplay(d, 'calculate', {}, { value: null, reason: 'error', expression: '(' }, m2);
    assertDeepEqual(shown(e, m2), ['1÷2 =', 'Fehler']);
    assertEqual(isError(e), true);
  });
  test('Unendlich wird angezeigt', () => {
    const m = model();
    const d = nextDisplay(null, 'calculate', {}, { value: Infinity, reason: null, expression: '1÷0' }, m);
    assertDeepEqual(shown(d, m), ['1÷0 =', 'Infinity']);
  });
  test('Kennwert: Symbol bzw. Beschriftung, Wert, Modalwerte mit ;', () => {
    const m = model({ mode: 'stats', dataset: [1, 2], lastResult: 1.5 });
    assertDeepEqual(shown(nextDisplay(null, 'calcStat', { type: 'mean' }, { value: 1.5, modes: null, reason: null }, m), m), ['x̄', '1,5']);
    const m2 = model({ mode: 'stats', dataset: [1, 1, 2.5, 2.5] });
    assertDeepEqual(shown(nextDisplay(null, 'calcStat', { type: 'mode' }, { value: null, modes: [1, 2.5], reason: null }, m2), m2), ['Modus', '1; 2,5']);
  });
  test('Hinweis im Statistikbereich ohne Fehlerfarbe mit Beschriftung, Fehler ohne', () => {
    const m = model({ mode: 'stats', dataset: [1] });
    const soft = nextDisplay(null, 'calcStat', { type: 'stdS' }, { value: null, modes: null, reason: 'needN2' }, m);
    assertDeepEqual(shown(soft, m), ['s', 'n ≥ 2 nötig']);
    assertEqual(isError(soft), false);
    const m0 = model({ mode: 'stats' });
    const hard = nextDisplay(null, 'calcStat', { type: 'mean' }, { value: null, modes: null, reason: 'noData' }, m0);
    assertDeepEqual(shown(hard, m0), ['', 'Keine Daten']);
    assertEqual(isError(hard), true);
    const ss = nextDisplay(null, 'calcSS', { type: 'std' }, { value: null, percent: null, reason: 'needN2' }, m0);
    assertEqual(isError(ss), true);
  });
  test('Yield als Prozent mit vier Stellen', () => {
    const m = model({ mode: 'sixsigma' });
    const d = nextDisplay(null, 'calcSS', { type: 'yield' }, { value: null, percent: 99.73002039367, reason: null }, m);
    assertDeepEqual(shown(d, m), ['Yield', '99,7300%']);
  });
  test('Wert übernommen: Icon, Zeile darüber leer; ohne Wert keine Änderung', () => {
    const m = model({ mode: 'stats', dataset: [1234.5] });
    const d = nextDisplay(null, 'addData', {}, 1234.5, m);
    assertDeepEqual(shown(d, m), ['', '1.234,5']);
    assertEqual(mainIcon(d), 'status.ok');
    assertEqual(nextDisplay(d, 'addData', {}, null, m), null);
  });
  test('Entfernt, Leeren, Bereichswechsel', () => {
    const m = model({ mode: 'stats' });
    assertDeepEqual(shown(nextDisplay(null, 'removeLast', {}, undefined, m), m), ['', 'Entfernt']);
    assertDeepEqual(shown(nextDisplay(null, 'clearData', {}, undefined, m), m), ['', '0']);
    assertDeepEqual(shown(nextDisplay(null, 'switchMode', { m: 'stats' }, true, m), m), ['', '0']);
    assertEqual(nextDisplay(null, 'switchMode', { m: 'stats' }, false, m), null);
    assertEqual(nextDisplay(null, 'memStore', {}, 0, m), null);
  });
  test('Stand weicht ab (Rückgängig): Anzeige verfällt', () => {
    const m = model({ lastResult: 5 });
    const d = nextDisplay(null, 'calculate', {}, { value: 5, reason: null, expression: '2+3' }, m);
    const back = model({ expression: '2+3' });
    assertEqual(currentDisplay(d, back), null);
    assertDeepEqual(shown(d, back), ['', '2+3']);
    assertDeepEqual(d?.snap, snapOf(m));
  });
});

suite('calculator Presenter — Zahlformat und Tasten', () => {
  test('Kennwert: 8 Stellen, Exponent unter 1e-4 und ab 1e8', () => {
    assertEqual(formatStat(15.8113883008, 'de'), '15,811388');
    assertEqual(formatStat(15.8113883008, 'en'), '15.811388');
    assertEqual(formatStat(2700, 'de'), '2.700');
    assertEqual(formatStat(0.00001234, 'de'), '1,234000e-5');
    assertEqual(formatStat(123456789.5, 'en'), '1.234568e+8');
    assertEqual(formatStat(NaN, 'de'), 'NaN');
  });
  test('Rechenergebnis: 12 Stellen, Exponent ab 1e10', () => {
    assertEqual(formatCalc(2.718281828459045, 'en'), '2.71828182846');
    assertEqual(formatCalc(1200000000000.1, 'en'), '1.20000000e+12');
    assertEqual(formatCalc(1e-10, 'de'), '1,00000000e-10');
    assertEqual(formatCalc(-3, 'de'), '-3');
    assertEqual(formatCalc(-Infinity, 'de'), '-Infinity');
  });
  test('Datensatzwerte', () => {
    assertEqual(formatValue(12.4, 'de'), '12,4');
    assertEqual(formatValue(12.4, 'en'), '12.4');
  });
  test('Tastenbeschriftungen wie die Altform', () => {
    assertEqual(keyLabel('stat', 'mean', t), 'x̄ Mittelwert');
    assertEqual(keyLabel('stat', 'stdS', t), 's (Stichpr.)');
    assertEqual(keyLabel('stat', 'mode', t), 'Modus');
    assertEqual(keyLabel('ss', 'cp', t), 'Cp');
  });
});
