/**
 * Attributtest: Bericht (domain/report.js) in der Form von `read().result`
 * (domain/format.js, Texte wie die Altform). Fälle der Altform.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { buildReport as rawReport, STAT_ROWS } from '../../../js/modules/attribute-test/domain/report.js';
import { toReadResult, formatValue } from '../../../js/modules/attribute-test/domain/format.js';

/** Der Bericht wie in `read().result`, ohne `status`; Gründe unverändert. */
function buildReport(s, norm) {
  const r = rawReport({ ratePooled: false, ...s }, norm);
  if ('error' in r) return r;
  const { status, ...rest } = toReadResult(r);
  return rest;
}
const st = (over = {}) => ({ direction: 'two-sided', alpha: 0.05, pooled: false, ...over });
const fmtP = (v) => formatValue({ t: 'p', v }, 'en', 'read');
const fmtRate = (v) => formatValue({ t: 'rate', v }, 'en', 'read');
const twoNorm = (over = {}) => ({ ok: true, kind: 'two', x1: 30, n1: 400, x2: 18, n2: 380, groups: null, missing: 0, ...over });

suite('attribute-test: Bericht', () => {
  test('Gründe des Normalisierers gehen durch', () => {
    assertDeepEqual(buildReport(st(), { ok: false, error: 'errNZero' }), { error: 'errNZero' });
    assertDeepEqual(buildReport(st(), { ok: false, error: 'hintEnterCounts', hint: true }), { error: 'hintEnterCounts', hint: true });
  });
  test('ein Anteil mit x = n meldet die Normalapproximation', () => {
    const r = buildReport(st({ direction: 'greater' }), { ok: true, kind: 'one', x: 25, n: 25, p0: 0.9, missing: 0 });
    assertEqual(r.kind, 'one');
    assertTrue(r.notes.some((n) => n.key === 'noteNormalApprox'));
    assertTrue(!r.stats.find((s) => s.key === 'ci').value.includes('NaN'));
    assertEqual(r.basisKey, 'basisExact');
  });
  test('zwei Anteile: gepoolter z behält H₀ bei ähnlichen Raten', () => {
    const r = buildReport(st({ pooled: true }), twoNorm());
    assertEqual(r.decision, 'keep');
    assertEqual(r.stats.find((s) => s.key === 'pValue').value, '0.1085');
    assertEqual(r.stats.find((s) => s.key === 'pFisher').value, '0.1356');
    assertTrue(r.notes.some((n) => n.key === 'notePooled'));
  });
  test('Zusammenhang: entfernte Nullzeile wird genannt, 2×2-Zeilen da', () => {
    const r = buildReport(st(), { ok: true, kind: 'assoc', rows: ['A', 'B', 'C'], cols: ['X', 'Y'], counts: [[10, 20], [0, 0], [15, 5]], missing: 0 });
    assertEqual(r.notes.find((n) => n.key === 'noteDropped').params.names, 'B');
    assertDeepEqual(r.table.rows.map((x) => x.name), ['A', 'C']);
    assertTrue(r.stats.some((s) => s.key === 'yates') && r.stats.some((s) => s.key === 'pFisher'));
    assertDeepEqual(r.table.rows[0].cells[0], { obs: '10', exp: r.table.rows[0].cells[0].exp, contrib: r.table.rows[0].cells[0].contrib });
    assertTrue(/^\d+\.\d{2}$/.test(r.table.rows[0].cells[0].exp) && /^\d+\.\d{3}$/.test(r.table.rows[0].cells[0].contrib));
  });
  test('Zusammenhang 2×2: Fisher folgt der Richtung', () => {
    const norm = { ok: true, kind: 'assoc', rows: ['A', 'B'], cols: ['X', 'Y'], counts: [[8, 2], [3, 7]], missing: 0 };
    const two = buildReport(st(), norm).stats.find((s) => s.key === 'pFisher');
    const gr = buildReport(st({ direction: 'greater' }), norm).stats.find((s) => s.key === 'pFisher');
    const le = buildReport(st({ direction: 'less' }), norm).stats.find((s) => s.key === 'pFisher');
    assertEqual(two.labelKey, 'statPFisher');
    assertEqual(gr.labelKey, 'statPFisherGreater');
    assertEqual(le.labelKey, 'statPFisherLess');
    assertTrue(Number(gr.value) < Number(two.value) && Number(le.value) > Number(gr.value));
  });
  test('Zusammenhang: größere Tabelle ohne Fisher; unter 2×2 ein Fehler; kleine Erwartungswerte warnen', () => {
    assertTrue(!buildReport(st({ direction: 'greater' }), { ok: true, kind: 'assoc', rows: ['A', 'B'], cols: ['X', 'Y', 'Z'], counts: [[5, 6, 8], [7, 4, 9]], missing: 0 })
      .stats.some((s) => s.key === 'pFisher'));
    assertEqual(buildReport(st(), { ok: true, kind: 'assoc', rows: ['A', 'B'], cols: ['X', 'Y'], counts: [[5, 0], [7, 0]], missing: 0 }).error, 'errTableTooSmall');
    assertTrue(buildReport(st(), { ok: true, kind: 'assoc', rows: ['A', 'B'], cols: ['X', 'Y', 'Z'], counts: [[1, 2, 8], [3, 1, 9]], missing: 0 })
      .notes.some((n) => n.key === 'warnShareBelow5'));
  });
  test('Zahlenebene: num, pValue, ci und noteDetails neben dem Text', () => {
    const two = buildReport(st({ pooled: true }), twoNorm({ missing: 2 }));
    const pRow = two.stats.find((s) => s.key === 'pValue');
    assertEqual(pRow.value, '0.1085');
    assertTrue(pRow.num > 0.1084 && pRow.num < 0.1086 && pRow.num !== 0.1085);
    assertEqual(two.pValue, pRow.num);
    assertTrue(two.ci[0] < two.ci[1]);
    assertEqual(two.stats.find((s) => s.key === 'counts1').num, null);
    assertEqual(two.stats.find((s) => s.key === 'ci').num, null);
    assertDeepEqual(two.noteDetails.map((n) => n.code), two.notes.map((n) => n.key));
    assertDeepEqual(two.noteDetails.find((n) => n.code === 'noteMissing').values, { count: 2 });
    const assoc = buildReport(st(), { ok: true, kind: 'assoc', rows: ['A', 'B'], cols: ['X', 'Y', 'Z'], counts: [[1, 2, 8], [3, 1, 9]], missing: 0 });
    assertEqual(assoc.ci, null);
    const share = assoc.noteDetails.find((n) => n.code === 'warnShareBelow5').values.share;
    assertTrue(share > 0 && share <= 1);
  });
  test('ein Anteil: einseitige Grenzen bei x = 0 und x = n', () => {
    const lo = buildReport(st({ direction: 'less' }), { ok: true, kind: 'one', x: 0, n: 30, p0: 0.1, missing: 0 });
    assertTrue(lo.stats.find((s) => s.key === 'ci').value.startsWith('[0.0000,'));
    const hi = buildReport(st({ direction: 'greater' }), { ok: true, kind: 'one', x: 12, n: 12, p0: 0.5, missing: 0 });
    assertTrue(hi.stats.find((s) => s.key === 'ci').value.endsWith(', 1.0000]'));
    assertDeepEqual(buildReport(st(), { ok: true, kind: 'one', x: 3, n: 4, p0: 0.5, missing: 2 })
      .notes.find((n) => n.key === 'noteMissing').params, { count: 2 });
  });
  test('zwei Anteile: Äquivalenz-Hinweis und Folgeschritt nur bei p ≥ α zweiseitig, McNemar-Hinweis immer', () => {
    const keep = buildReport(st({ pooled: true }), twoNorm());
    assertTrue(keep.notes.some((n) => n.key === 'noteNotEquivalentIsNotEqual'));
    assertDeepEqual(keep.actions, [{ key: 'actionCheckEquivalence' }]);
    const rej = buildReport(st(), twoNorm({ x1: 30, n1: 200, x2: 10, n2: 200 }));
    assertEqual(rej.decision, 'reject');
    assertTrue(rej.actions === undefined && rej.notes.some((n) => n.key === 'notePairedUseMcNemar'));
    const one = buildReport(st({ direction: 'greater', pooled: true }), twoNorm());
    assertTrue(one.actions === undefined);
  });
  test('eine Rate: Null Ereignisse, keine NaN, Zeilen', () => {
    const r = buildReport(st(), { ok: true, kind: 'rate1', x: 0, t: 10, lambda0: 0.2, missing: 0 });
    assertTrue(r.stats.find((s) => s.key === 'ci').value.startsWith('[0.0000,'));
    r.stats.forEach((s) => assertTrue(!s.value.includes('NaN'), s.key));
    assertDeepEqual(r.stats.map((s) => s.key), ['counts', 'rate', 'ci', 'pExact', 'z', 'pNormal']);
    assertTrue(!buildReport(st(), { ok: true, kind: 'rate1', x: 120, t: 100, lambda0: 1, missing: 0 })
      .notes.some((n) => n.key === 'noteRateNormalApprox'));
  });
  test('eine Rate: vier gültige Ziffern, Umfang ohne Rundungsrauschen', () => {
    const r = buildReport(st(), { ok: true, kind: 'rate1', x: 2, t: 50000, lambda0: 0.0001, missing: 0 });
    assertEqual(r.stats.find((s) => s.key === 'rate').value, '0.00004000');
    assertTrue(r.stats.find((s) => s.key === 'ci').value.startsWith('[4.844e-6, 0.0001445]'));
    const noisy = buildReport(st(), { ok: true, kind: 'rate1', x: 3, t: 0.1 * 3, lambda0: 1, missing: 0 });
    assertEqual(noisy.stats.find((s) => s.key === 'counts').value, '3 / 0.3');
  });
  test('zwei Raten: Zeilen, bedingter Test nur bei Δ₀ = 0, einseitig ±∞, nicht prüfbar', () => {
    const norm = { ok: true, kind: 'rate2', x1: 12, t1: 100, x2: 5, t2: 110, diff0: 0, groups: null, missing: 0 };
    const r = buildReport(st(), norm);
    assertTrue(['rate1', 'rate2', 'diff', 'ci', 'z', 'pValue', 'pExactCond', 'ratio', 'ratioCi'].every((k) => r.stats.some((s) => s.key === k)));
    assertTrue(!buildReport(st(), { ...norm, diff0: 0.02 }).stats.some((s) => s.key === 'pExactCond'));
    assertTrue(buildReport(st({ direction: 'greater' }), norm).stats.find((s) => s.key === 'ci').value.endsWith('∞]'));
    assertTrue(buildReport(st({ direction: 'less' }), norm).stats.find((s) => s.key === 'ci').value.startsWith('[−∞,'));
    assertDeepEqual(buildReport(st(), { ...norm, x1: 0, x2: 0, diff0: 0.05 }), { error: 'noteRateNotTestable', hint: true });
    const has = (x) => x.notes.some((n) => n.key === 'noteRatePooledIgnored');
    assertTrue(has(buildReport(st({ ratePooled: true }), { ...norm, diff0: 0.02 })));
    assertTrue(!has(buildReport(st({ ratePooled: true }), norm)));
  });
  test('McNemar: ohne abweichende Paare ein Hinweis, Zeilen, Bezeichnungen', () => {
    const pair = (table, labels = { before: '', after: '' }) => ({ ok: true, kind: 'mcnemar', table, labels, missing: 0 });
    assertDeepEqual(buildReport(st(), pair([[5, 0], [0, 5]])), { error: 'noteNoDiscordant', hint: true });
    const r = buildReport(st(), pair([[20, 9], [3, 18]]));
    assertEqual(r.basisKey, 'basisExactMcNemar');
    assertTrue(r.stats.some((s) => s.key === 'pChi2Cc'));
    assertEqual(r.stats.find((s) => s.key === 'discordant').value, '9 / 3');
    const small = buildReport(st({ direction: 'greater' }), pair([[20, 4], [1, 18]]));
    assertTrue(small.notes.some((n) => n.key === 'noteSmallDiscordant') && !small.stats.some((s) => s.key === 'chi2'));
    const labeled = buildReport(st(), pair([[20, 9], [3, 18]], { before: 'Alt', after: ' Neu ' }));
    assertDeepEqual(labeled.stats.find((s) => s.key === 'pBefore').params, { label: 'Alt' });
    assertDeepEqual(labeled.stats.find((s) => s.key === 'pAfter').params, { label: 'Neu' });
    assertEqual(buildReport(st(), pair([[20, 9], [3, 18]], { before: 'Alt', after: '' })).stats.find((s) => s.key === 'pAfter').labelKey, 'statPAfter');
  });
  test('Äquivalenz: entartet, gleichwertig, eine Stichprobe, Gruppennamen', () => {
    const base = { ok: true, kind: 'equiv', samples: 2, x1: 470, n1: 10000, x2: 455, n2: 10000, lower: -0.01, upper: 0.01, groups: null };
    assertDeepEqual(buildReport(st(), { ...base, x1: 0, n1: 5, x2: 0, n2: 5 }), { error: 'noteEquivDegenerate', hint: true });
    const r = buildReport(st(), base);
    assertEqual(r.decision, 'equivalent');
    assertEqual(r.stats.find((s) => s.key === 'ci').params.level, 90);
    assertEqual(r.stats.find((s) => s.key === 'estimate').value, '0.15');
    assertEqual(r.stats.find((s) => s.key === 'bounds').value, '[-1.00; 1.00]');
    assertDeepEqual(r.decisionParams, { lower: '-1.00', upper: '1.00', unit: 'pp', alpha: 0.05 });
    const one = buildReport(st(), { ok: true, kind: 'equiv', samples: 1, x: 8, n: 100, p0: 0.05, lower: -0.01, upper: 0.01 });
    assertEqual(one.decision, 'notEquivalent');
    assertEqual(one.stats.find((s) => s.key === 'bounds').value, '[4.00; 6.00]');
    assertEqual(one.stats.find((s) => s.key === 'estimate').value, '8.00');
    assertDeepEqual(one.stats.find((s) => s.key === 'counts'), { key: 'counts', labelKey: 'statCounts', value: '8 / 100', num: null });
    const named = buildReport(st(), { ...base, groups: ['Lieferant A', 'Lieferant B'] });
    assertDeepEqual(named.stats.slice(0, 2), [
      { key: 'counts1', labelKey: 'statCountsGroup', params: { group: 'Lieferant A' }, value: '470 / 10000', num: null },
      { key: 'counts2', labelKey: 'statCountsGroup', params: { group: 'Lieferant B' }, value: '455 / 10000', num: null },
    ]);
  });
  test('STAT_ROWS: jede Zeile der drei Testarten kommt in einem Bericht vor', () => {
    const one = buildReport(st(), { ok: true, kind: 'one', x: 3, n: 40, p0: 0.1, missing: 0 });
    const two = buildReport(st(), twoNorm());
    const assoc = buildReport(st(), { ok: true, kind: 'assoc', rows: ['A', 'B'], cols: ['X', 'Y'], counts: [[8, 2], [3, 7]], missing: 0 });
    assertDeepEqual(one.stats.map((s) => s.key), [...STAT_ROWS.one]);
    assertDeepEqual(two.stats.map((s) => s.key), [...STAT_ROWS.two]);
    assertDeepEqual(assoc.stats.map((s) => s.key), [...STAT_ROWS.assoc]);
  });
});

suite('attribute-test: Zahlen als Text', () => {
  test('read: fmtP und fmtRate wie die Altform', () => {
    assertEqual(fmtP(0.00001), '< 0.0001');
    assertEqual(fmtP(0.5), '0.5000');
    assertEqual(fmtP(null), '–');
    assertEqual(fmtRate(37 / 120), '0.3083');
    assertEqual(fmtRate(12.34567), '12.3457');
    assertEqual(fmtRate(0), '0.0000');
    assertEqual(fmtRate(2e-7), '2.000e-7');
    assertEqual(fmtRate(-0.00123456), '-0.001235');
    assertEqual(fmtRate(0.00456), '0.004560');
    assertEqual(fmtRate(NaN), '–');
  });
  test('read: Prozentpunkte ohne „-0.00“, Zählungen ohne Gruppierung, Intervall mit Komma', () => {
    assertEqual(formatValue({ t: 'pp', v: -0.00001 }, 'de', 'read'), '0.00');
    assertEqual(formatValue({ t: 'counts', a: 46, b: 1200 }, 'de', 'read'), '46 / 1200');
    assertEqual(formatValue({ t: 'ci', lo: 0.0067, hi: Infinity, of: 'fix' }, 'de', 'read'), '[0.0067, ∞]');
  });
  test('display de: Dezimalkomma, Gruppierung, Intervall [a; b], p und Rate', () => {
    assertEqual(formatValue({ t: 'fix', v: 0.0383333, d: 4 }, 'de', 'display'), '0,0383');
    assertEqual(formatValue({ t: 'p', v: 0.00001 }, 'de', 'display'), '< 0,0001');
    assertEqual(formatValue({ t: 'counts', a: 46, b: 1200 }, 'de', 'display'), '46 / 1.200');
    assertEqual(formatValue({ t: 'counts', a: 3, b: 0.1 * 3, exposure: true }, 'de', 'display'), '3 / 0,3');
    assertEqual(formatValue({ t: 'ci', lo: 0.0234, hi: 0.0512, of: 'fix' }, 'de', 'display'), '[0,0234; 0,0512]');
    assertEqual(formatValue({ t: 'ci', lo: -Infinity, hi: 0.5, of: 'rate' }, 'de', 'display'), '[−∞; 0,5000]');
    assertEqual(formatValue({ t: 'rate', v: 2e-7 }, 'de', 'display'), '2,000e-7');
    assertEqual(formatValue({ t: 'ppci', lo: -0.0091, hi: 0.0162 }, 'de', 'display'), '[-0,91; 1,62]');
    assertEqual(formatValue({ t: 'pp', v: -0.00001 }, 'de', 'display'), '0,00');
  });
  test('display en: Punkt, Gruppierung mit Komma, Intervall [a; b]', () => {
    assertEqual(formatValue({ t: 'counts', a: 46, b: 1200 }, 'en', 'display'), '46 / 1,200');
    assertEqual(formatValue({ t: 'ci', lo: 0.0234, hi: 0.0512, of: 'fix' }, 'en', 'display'), '[0.0234; 0.0512]');
  });
});
