/**
 * Ishikawa: Konfiguration der Diagramme (viewmodel/charts.js) — rein, ohne
 * DOM und ohne Uhr. Prüft, was die Widgets `trend-chart`, `gantt-chart` und
 * `cumulative-cost-chart` bekommen, und die Datumsregel des Moduls
 * (viewmodel/dates.js).
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual, assertAlmostEqual } from '../../test-utils.js';
import { trendConfig, ganttConfig, costConfig } from '../../../js/modules/ishikawa/viewmodel/charts.js';
import { localeOf, dayMonth, dateText, dateTimeText } from '../../../js/modules/ishikawa/viewmodel/dates.js';
import trendWidget from '../../../js/widgets/trend-chart/schema.js';
import ganttWidget from '../../../js/widgets/gantt-chart/schema.js';
import costWidget from '../../../js/widgets/cumulative-cost-chart/schema.js';
import { checkValue } from '../../../js/core/model.js';

const EXPERTS = [{ id: 1 }, { id: 2 }];

/** Ein Stand mit Zeilen; Experten nach Vorgabe EXPERTS. */
function state(name, date, rows, experts = EXPERTS) {
  return { name, date, data: { rows, experts } };
}

suite('ishikawa charts: trendConfig', () => {
  test('weniger als zwei Stände: kein Diagramm', () => {
    assertEqual(trendConfig([state('S1', '2020-01-01', [])], { lang: 'de' }), null);
    assertEqual(trendConfig([], { lang: 'de' }), null);
  });

  test('Zeilen ohne Bewertung: kein Diagramm', () => {
    const rows = [{ stableId: 'a', name: 'A', ratings: {} }];
    assertEqual(trendConfig([state('S1', '2020-01-01', rows), state('S2', '2020-01-02', rows)], { lang: 'de' }), null);
  });

  test('eine Reihe je stableId mit Punkten', () => {
    const s1 = state('S1', '2020-01-01', [
      { stableId: 'a', name: 'Hyp A', ratings: { 1: 4, 2: 6 } },
      { stableId: 'b', name: 'Hyp B', ratings: { 1: 2, 2: 2 } },
    ]);
    const s2 = state('S2', '2020-01-02', [
      { stableId: 'a', name: 'Hyp A', ratings: { 1: 8, 2: 8 } },
      { stableId: 'b', name: 'Hyp B', ratings: { 1: 5, 2: 7 } },
    ]);
    const cfg = trendConfig([s1, s2], { lang: 'de' });
    assertDeepEqual(cfg.series.map((s) => s.sid), ['a', 'b']);
    assertEqual(cfg.xCount, 2);
  });

  test('Punkte: x = Index des Stands, y = Score', () => {
    const s1 = state('S1', '2020-01-01', [{ stableId: 'a', name: 'A', ratings: { 1: 4, 2: 6 } }]);
    const s2 = state('S2', '2020-01-02', [{ stableId: 'a', name: 'A', ratings: { 1: 8, 2: 8 } }]);
    assertDeepEqual(trendConfig([s1, s2], { lang: 'de' }).series[0].points, [{ x: 0, y: 5 }, { x: 1, y: 8 }]);
  });

  test('Stand ohne Score fehlt in der Reihe', () => {
    const s1 = state('S1', '2020-01-01', [{ stableId: 'a', name: 'A', ratings: {} }]);
    const s2 = state('S2', '2020-01-02', [{ stableId: 'a', name: 'A', ratings: { 1: 6, 2: 6 } }]);
    const s3 = state('S3', '2020-01-03', [{ stableId: 'a', name: 'A', ratings: { 1: 9, 2: 9 } }]);
    assertDeepEqual(trendConfig([s1, s2, s3], { lang: 'de' }).series[0].points.map((p) => p.x), [1, 2]);
  });

  test('Score nur über die Experten des Stands', () => {
    const s1 = state('S1', '2020-01-01', [{ stableId: 'a', name: 'A', ratings: { 1: 2, 9: 9 } }]);
    const s2 = state('S2', '2020-01-02', [{ stableId: 'a', name: 'A', ratings: { 1: 4 } }], []);
    const cfg = trendConfig([s1, s2], { lang: 'de' });
    assertDeepEqual(cfg.series[0].points, [{ x: 0, y: 2 }]);
  });

  test('Name der Reihe: jüngster nicht leerer Name', () => {
    const s1 = state('S1', '2020-01-01', [{ stableId: 'a', name: 'Old name', ratings: { 1: 5 } }]);
    const s2 = state('S2', '2020-01-02', [{ stableId: 'a', name: 'New name', ratings: { 1: 5 } }]);
    assertEqual(trendConfig([s1, s2], { lang: 'de' }).series[0].name, 'New name');
    const s3 = state('S3', '2020-01-03', [{ stableId: 'a', name: '   ', ratings: { 1: 5 } }]);
    assertEqual(trendConfig([s1, s3], { lang: 'de' }).series[0].name, 'Old name');
    const s4 = state('S4', '2020-01-04', [{ stableId: 'a', name: '', ratings: { 1: 5 } }]);
    assertEqual(trendConfig([s4, s4], { lang: 'de' }).series[0].name, 'a');
  });

  test('Farbe der Reihe aus den Linienfarben des Moduls, der Reihe nach, nach 16 von vorn', () => {
    const rows = Array.from({ length: 17 }, (_, i) => ({ stableId: `s${i}`, name: `R${i}`, ratings: { 1: 5 } }));
    const cfg = trendConfig([state('S1', '2020-01-01', rows), state('S2', '2020-01-02', rows)], { lang: 'de' });
    assertEqual(cfg.series[0].color, 'var(--ishikawa-line-1)');
    assertEqual(cfg.series[1].color, 'var(--ishikawa-line-2)');
    assertEqual(cfg.series[15].color, 'var(--ishikawa-line-16)');
    assertEqual(cfg.series[16].color, 'var(--ishikawa-line-1)');
  });

  test('Beschriftung der Stände: Datum in der Sprache, langer Name gekürzt', () => {
    const s1 = state('S1 with a very long name indeed', '2020-03-09', [{ stableId: 'a', name: 'A', ratings: { 1: 5 } }]);
    const s2 = state('Short', '2020-04-15', [{ stableId: 'a', name: 'A', ratings: { 1: 5 } }]);
    const de = trendConfig([s1, s2], { lang: 'de' });
    assertEqual(de.xLabels.length, 2);
    assertEqual(de.xLabels[0].date, '09.03.');
    assertTrue(de.xLabels[0].name.length <= 13, 'gekürzt');
    assertTrue(de.xLabels[0].name.endsWith('…'), 'Auslassungszeichen');
    assertEqual(de.xLabels[1].name, 'Short');
    assertEqual(trendConfig([s1, s2], { lang: 'en' }).xLabels[0].date, '03/09');
    assertEqual(trendConfig([state('X', 'kein Datum', s1.data.rows), s2], { lang: 'de' }).xLabels[0].date, '');
  });

  test('nur Schlüssel des Widgets, Ränder wie bisher', () => {
    const rows = [{ stableId: 'a', name: 'A', ratings: { 1: 5 } }];
    const cfg = trendConfig([state('S1', '2020-01-01', rows), state('S2', '2020-01-02', rows)], { lang: 'de' });
    checkValue(trendWidget.props.config, 'config', cfg);
    assertDeepEqual(Object.keys(cfg).sort(), ['layout', 'series', 'xCount', 'xLabels']);
    assertDeepEqual(cfg.layout, { padT: 30, padR: 30, padB: 55, padL: 45 });
  });
});

const DAY = 86400000;

/** Ein Experiment mit Vorgaben wie im Model. */
function exp(o) {
  return {
    title: '', responsible: '', status: 'planned', startDate: '', endDate: '', costMoney: null, costHours: null, ...o,
  };
}

/** ms der lokalen Mitternacht eines Datums (wie das Modul rechnet). */
const ms = (d) => new Date(`${d}T00:00:00`).getTime();

const G = { now: ms('2020-06-15'), lang: 'de', todayLabel: 'Heute' };
const C = { now: ms('2020-06-15'), lang: 'de', moneyUnit: '€', hoursUnit: 'h', moneyLabel: 'Kosten (€)', hoursLabel: 'Aufwand (h)' };
const CR = { ...C, moneyUnit: '€/Tag', hoursUnit: 'h/Tag' };

suite('ishikawa charts: Datumsregel des Moduls', () => {
  test('de → de-DE (Tag vor Monat), sonst en-US (Monat vor Tag)', () => {
    assertEqual(localeOf('de'), 'de-DE');
    assertEqual(localeOf('en'), 'en-US');
    assertEqual(localeOf('fr'), 'en-US');
  });

  test('Tag und Monat, Datum, Datum mit Uhrzeit', () => {
    const d = new Date(2026, 2, 9, 14, 5);
    assertEqual(dayMonth(d.getTime(), 'de'), '09.03.');
    assertEqual(dayMonth(d.getTime(), 'en'), '03/09');
    assertEqual(dateText(d, 'de'), '9.3.2026');
    assertEqual(dateText(d, 'en'), '3/9/2026');
    assertEqual(dateTimeText(d.toISOString(), 'de'), '9.3.2026 14:05');
    assertEqual(dateTimeText(d.toISOString(), 'en'), `3/9/2026 ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`);
    assertTrue(dateTimeText(d.toISOString(), 'en').includes('PM'), '12-Stunden-Uhr');
    assertEqual(dayMonth(Number.NaN, 'de'), '');
    assertEqual(dateTimeText('kein Datum', 'de'), '');
  });
});

suite('ishikawa charts: ganttConfig — Auswahl', () => {
  test('ohne Start- oder Enddatum entfällt das Experiment', () => {
    const cfg = ganttConfig([
      exp({ startDate: '2020-01-01', endDate: '2020-01-10' }),
      exp({ startDate: '', endDate: '2020-01-10' }),
      exp({ startDate: '2020-01-01', endDate: '' }),
      exp({}),
    ], G);
    assertEqual(cfg.tasks.length, 1);
  });

  test('ungültiges Datum entfällt', () => {
    const cfg = ganttConfig([
      exp({ startDate: '2020-01-01', endDate: '2020-01-10' }),
      exp({ startDate: 'not-a-date', endDate: '2020-01-10' }),
      exp({ startDate: '2020-01-01', endDate: 'xxxx' }),
    ], G);
    assertEqual(cfg.tasks.length, 1);
  });

  test('ohne datierte Experimente: kein Diagramm', () => {
    assertEqual(ganttConfig([], G), null);
    assertEqual(ganttConfig([exp({ startDate: '2020-01-01' })], G), null);
  });
});

suite('ishikawa charts: ganttConfig — Zeitachse und Balken', () => {
  test('xDomain vom frühesten Start bis zum spätesten Ende', () => {
    const cfg = ganttConfig([
      exp({ startDate: '2020-03-01', endDate: '2020-03-20' }),
      exp({ startDate: '2020-01-10', endDate: '2020-02-10' }),
      exp({ startDate: '2020-02-01', endDate: '2020-05-01' }),
    ], G);
    assertEqual(cfg.xDomain.minT, ms('2020-01-10'));
    assertEqual(cfg.xDomain.maxT, ms('2020-05-01'));
  });

  test('Spanne mindestens ein Tag', () => {
    const cfg = ganttConfig([exp({ startDate: '2020-01-01', endDate: '2020-01-01' })], G);
    assertEqual(cfg.xDomain.maxT - cfg.xDomain.minT, DAY);
  });

  test('Balken von Start bis Ende', () => {
    const t = ganttConfig([exp({ startDate: '2020-01-05', endDate: '2020-01-20', status: 'running' })], G).tasks[0];
    assertEqual(t.start, ms('2020-01-05'));
    assertEqual(t.end, ms('2020-01-20'));
    assertEqual(t.startDate, '2020-01-05');
    assertEqual(t.endDate, '2020-01-20');
  });

  test('Ende vor oder gleich Start: Balken einen Tag lang, keine ungültige Zahl', () => {
    const cfg = ganttConfig([
      exp({ startDate: '2020-01-05', endDate: '2020-01-05' }),
      exp({ startDate: '2020-01-05', endDate: '2020-01-02' }),
    ], G);
    assertEqual(cfg.tasks[0].end, ms('2020-01-05') + DAY);
    assertEqual(cfg.tasks[1].end, ms('2020-01-05') + DAY);
    assertTrue(!JSON.stringify(cfg).includes('null'), 'keine NaN (JSON zeigt NaN als null)');
  });

  test('Farbe des Status aus den Statusfarben des Moduls', () => {
    const cfg = ganttConfig(['done', 'running', 'cancelled', 'planned'].map((status) => exp({ startDate: '2020-01-01', endDate: '2020-01-10', status })), G);
    assertDeepEqual(cfg.tasks.map((t) => t.color), [
      'var(--ishikawa-status-done)', 'var(--ishikawa-status-running)',
      'var(--ishikawa-status-cancelled)', 'var(--ishikawa-status-planned)',
    ]);
    assertDeepEqual(cfg.tasks.map((t) => t.status), ['done', 'running', 'cancelled', 'planned']);
  });

  test('ohne Titel: „#<Position>“; Verantwortlicher im Tooltip', () => {
    const cfg = ganttConfig([
      exp({ title: '   ', startDate: '2020-01-01', endDate: '2020-01-10' }),
      exp({ title: 'Trial X', responsible: 'Anna', startDate: '2020-02-01', endDate: '2020-02-10' }),
    ], G);
    assertEqual(cfg.tasks[0].label, '#1');
    assertEqual(cfg.tasks[1].label, 'Trial X');
    assertEqual(cfg.tasks[1].responsible, 'Anna');
  });

  test('„#<Position>“ zählt in der ganzen Liste, nicht nach dem Filtern', () => {
    const cfg = ganttConfig([
      exp({ title: 'Dropped', startDate: '2020-01-01', endDate: '' }),
      exp({ title: '   ', startDate: '2020-02-01', endDate: '2020-02-10' }),
    ], G);
    assertEqual(cfg.tasks.length, 1);
    assertEqual(cfg.tasks[0].label, '#2');
  });
});

suite('ishikawa charts: ganttConfig — Teilung und Heute', () => {
  const stepFor = (startDate, endDate) => ganttConfig([exp({ startDate, endDate })], G).stepDays;

  test('Spanne bis 14 Tage: täglich; bis 60: wöchentlich; bis 365: monatlich; darüber: quartalsweise', () => {
    assertEqual(stepFor('2020-01-01', '2020-01-10'), 1);
    assertEqual(stepFor('2020-01-01', '2020-02-15'), 7);
    assertEqual(stepFor('2020-01-01', '2020-06-01'), 30);
    assertEqual(stepFor('2020-01-01', '2022-01-01'), 90);
  });

  test('Teilstriche ab Mitternacht des Starts, innerhalb der Spanne; Beschriftung nach der Datumsregel', () => {
    const cfg = ganttConfig([exp({ startDate: '2020-01-01', endDate: '2020-01-08' })], G);
    assertTrue(cfg.ticks.length >= 2, 'mehrere Teilstriche');
    for (const t of cfg.ticks) assertTrue(t <= cfg.xDomain.maxT, 'innerhalb');
    assertEqual(cfg.ticks[0], ms('2020-01-01'));
    assertEqual(cfg.tickLabels[0], '01.01.');
    assertEqual(ganttConfig([exp({ startDate: '2020-01-01', endDate: '2020-01-08' })], { ...G, lang: 'en' }).tickLabels[0], '01/01');
  });

  test('Heute-Linie nur innerhalb der Spanne; Beschriftung aus der Übersetzung', () => {
    const inside = ganttConfig([exp({ startDate: '2020-06-01', endDate: '2020-06-30' })], G);
    assertEqual(inside.showToday, true);
    assertEqual(inside.now, ms('2020-06-15'));
    assertEqual(inside.todayLabel, 'Heute');
    assertEqual(ganttConfig([exp({ startDate: '2020-06-01', endDate: '2020-06-30' })], { ...G, now: ms('2021-01-01') }).showToday, false);
  });

  test('nur Schlüssel des Widgets, Ränder wie bisher', () => {
    const cfg = ganttConfig([exp({ title: 'A', startDate: '2020-01-01', endDate: '2020-01-10' })], G);
    checkValue(ganttWidget.props.config, 'config', cfg);
    assertDeepEqual(cfg.layout, { labelW: 220, padL: 8, padR: 16, padT: 30, padB: 24, rowH: 26 });
  });
});

suite('ishikawa charts: costConfig — Auswahl', () => {
  test('ohne datiertes Experiment: kein Diagramm', () => {
    assertEqual(costConfig([exp({ costMoney: 100 })], 'cumulative', C), null);
  });

  test('datiert, aber weder Geld noch Stunden (0 oder null): kein Diagramm', () => {
    assertEqual(costConfig([exp({ startDate: '2020-01-01', endDate: '2020-01-10', costMoney: 0, costHours: 0 })], 'cumulative', C), null);
    assertEqual(costConfig([exp({ startDate: '2020-01-01', endDate: '2020-01-10' })], 'rate', CR), null);
  });

  test('Geld oder Stunden reichen', () => {
    assertTrue(costConfig([exp({ startDate: '2020-01-01', endDate: '2020-01-10', costMoney: 100 })], 'cumulative', C) !== null, 'Geld');
    assertTrue(costConfig([exp({ startDate: '2020-01-01', endDate: '2020-01-10', costHours: 8 })], 'cumulative', C) !== null, 'Stunden');
  });

  test('Ende vor Start und fehlende Kosten: ein Tag, keine ungültige Zahl', () => {
    const cfg = costConfig([
      exp({ startDate: '2020-01-05', endDate: '2020-01-02', costMoney: 50 }),
      exp({ startDate: '2020-01-01', endDate: '2020-01-03', costMoney: null, costHours: 4 }),
    ], 'cumulative', C);
    assertAlmostEqual(cfg.peakMoney, 50, 1e-9, 'Geld');
    assertAlmostEqual(cfg.peakHours, 4, 1e-9, 'Stunden');
    assertTrue(!JSON.stringify(cfg).includes('null'), 'keine NaN');
  });
});

suite('ishikawa charts: costConfig — kumuliert', () => {
  test('Endpunkt = Summe; Spitze = Summe', () => {
    const cfg = costConfig([exp({ startDate: '2020-01-01', endDate: '2020-01-11', costMoney: 1000, costHours: 40 })], 'cumulative', C);
    assertAlmostEqual(cfg.moneyPts.at(-1).v, 1000, 1e-6, 'Geld');
    assertAlmostEqual(cfg.hoursPts.at(-1).v, 40, 1e-6, 'Stunden');
    assertAlmostEqual(cfg.peakMoney, 1000, 1e-6, 'peakMoney');
    assertAlmostEqual(cfg.peakHours, 40, 1e-6, 'peakHours');
  });

  test('beginnt mit (minT, 0) für Geld und Stunden', () => {
    const cfg = costConfig([exp({ startDate: '2020-01-01', endDate: '2020-01-05', costMoney: 400 })], 'cumulative', C);
    assertEqual(cfg.moneyPts[0].t, cfg.xDomain.min);
    assertEqual(cfg.moneyPts[0].v, 0);
    assertEqual(cfg.hoursPts[0].v, 0);
  });

  test('steigt monoton', () => {
    const cfg = costConfig([exp({ startDate: '2020-01-01', endDate: '2020-01-06', costMoney: 500 })], 'cumulative', C);
    for (let i = 1; i < cfg.moneyPts.length; i++) assertTrue(cfg.moneyPts[i].v >= cfg.moneyPts[i - 1].v, 'monoton');
  });

  test('überlappende Experimente summieren sich', () => {
    const cfg = costConfig([
      exp({ startDate: '2020-01-01', endDate: '2020-01-11', costMoney: 1000 }),
      exp({ startDate: '2020-01-01', endDate: '2020-01-11', costMoney: 500 }),
    ], 'cumulative', C);
    assertAlmostEqual(cfg.moneyPts.at(-1).v, 1500, 1e-6, 'Summe');
  });
});

suite('ishikawa charts: costConfig — je Tag', () => {
  test('zwei Stufenpunkte je Tag, gleicher Wert', () => {
    const cfg = costConfig([exp({ startDate: '2020-01-01', endDate: '2020-01-05', costMoney: 400 })], 'rate', CR);
    assertEqual(cfg.moneyPts.length, 8);
    for (let d = 0; d < 4; d++) assertEqual(cfg.moneyPts[d * 2].v, cfg.moneyPts[d * 2 + 1].v);
  });

  test('Stufenpunkte am Tagesbeginn und einen Tag später', () => {
    const cfg = costConfig([exp({ startDate: '2020-01-01', endDate: '2020-01-03', costMoney: 200 })], 'rate', CR);
    assertEqual(cfg.moneyPts[0].t, cfg.xDomain.min);
    assertEqual(cfg.moneyPts[1].t, cfg.xDomain.min + DAY);
  });

  test('Spitze = höchste Tagesrate', () => {
    const cfg = costConfig([exp({ startDate: '2020-01-01', endDate: '2020-01-03', costMoney: 200, costHours: 16 })], 'rate', CR);
    assertAlmostEqual(cfg.peakMoney, 100, 1e-6, 'Geld je Tag');
    assertAlmostEqual(cfg.peakHours, 8, 1e-6, 'Stunden je Tag');
  });
});

suite('ishikawa charts: costConfig — Einheiten, Teilung, Schlüssel', () => {
  test('Einheiten und Beschriftungen kommen vom Aufrufer, je Art', () => {
    const one = [exp({ startDate: '2020-01-01', endDate: '2020-01-05', costMoney: 100, costHours: 1 })];
    const cum = costConfig(one, 'cumulative', C);
    assertEqual(cum.mode, 'cumulative');
    assertEqual(cum.moneyUnit, '€');
    assertEqual(cum.hoursUnit, 'h');
    assertEqual(cum.moneyLabel, 'Kosten (€)');
    assertEqual(cum.hoursLabel, 'Aufwand (h)');
    const rate = costConfig(one, 'rate', CR);
    assertEqual(rate.mode, 'rate');
    assertEqual(rate.moneyUnit, '€/Tag');
    assertEqual(rate.hoursUnit, 'h/Tag');
  });

  test('Teilung wie im Gantt; erster Teilstrich bei minT', () => {
    const stepFor = (startDate, endDate) => costConfig([exp({ startDate, endDate, costMoney: 100 })], 'cumulative', C).stepDays;
    assertEqual(stepFor('2020-01-01', '2020-01-10'), 1);
    assertEqual(stepFor('2020-01-01', '2020-02-15'), 7);
    assertEqual(stepFor('2020-01-01', '2020-06-01'), 30);
    assertEqual(stepFor('2020-01-01', '2022-01-01'), 90);
    const cfg = costConfig([exp({ startDate: '2020-01-01', endDate: '2020-01-08', costMoney: 100 })], 'cumulative', C);
    assertEqual(cfg.ticks[0], ms('2020-01-01'));
    assertEqual(cfg.tickLabels[0], '01.01.');
    assertEqual(costConfig([exp({ startDate: '2020-01-01', endDate: '2020-01-08', costMoney: 100 })], 'cumulative', { ...C, lang: 'en' }).tickLabels[0], '01/01');
  });

  test('Heute-Linie nur innerhalb der Spanne', () => {
    const one = [exp({ startDate: '2020-06-01', endDate: '2020-06-30', costMoney: 100 })];
    assertEqual(costConfig(one, 'cumulative', C).showToday, true);
    assertEqual(costConfig(one, 'cumulative', { ...C, now: ms('2021-01-01') }).showToday, false);
  });

  test('nur Schlüssel des Widgets, Ränder wie bisher', () => {
    const cfg = costConfig([exp({ startDate: '2020-01-01', endDate: '2020-01-05', costMoney: 100 })], 'rate', CR);
    checkValue(costWidget.props.config, 'config', cfg);
    assertDeepEqual(cfg.layout, { labelW: 220, padL: 8, padR: 48, padT: 16, padB: 28, innerH: 140 });
  });
});
