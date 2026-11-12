/**
 * Tests for modules/ishikawa/io/export.js — Tabellen-Mapper, Zelle für Zelle
 * mit dem Inhalt der bisherigen CSV (dieselben Abschnitte und Zellen; Zahlen
 * jetzt als Zahlen).
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { exportTable } from '../../../js/modules/ishikawa/io/export.js';
import { State } from '../../../js/modules/ishikawa/domain/model.js';
import { resolveDateOffset } from '../../../js/core/date-offset.js';

const BASE = new URL('../../../js/modules/ishikawa/resources/examples/projects/', import.meta.url);
const t = (k) => `«${k}»`;

/** @returns {Promise<any>} das Beispiel Lieferzeit mit aufgelösten Datumsangaben */
async function lieferzeitRaw() {
  const raw = await (await fetch(new URL('ishikawa-lieferzeit-zu-lang.json', BASE), { cache: 'no-cache' })).json();
  for (const f of raw.facts ?? []) f.date = resolveDateOffset(f.date);
  for (const e of raw.experiments ?? []) { e.startDate = resolveDateOffset(e.startDate); e.endDate = resolveDateOffset(e.endDate); }
  return raw;
}

/** Ursachenzeilen der bisherigen CSV (Bewertungen und Score als Zahlen). */
const OLD_CAUSES = [
  ['1', '«main»', '«cat.man»', '«cat.man»', 'Fahrer-Erfahrung gering', 'Neue Fahrer kennen Berliner Innenstadt schlecht', 6, 4, 5, 5, '«status.open»'],
  ['2', '«main»', '«cat.method»', '«cat.method»', 'Suboptimale Routenplanung', 'Fahrer fahren nach eigenem Gefühl, keine Optimierung', 8, 5, 9, 7.3, '«status.confirmed»'],
  ['3', '«main»', '«cat.machine»', '«cat.machine»', 'Ofen-Kapazität in Spitzen', 'Nur ein Holzofen, max. 4 Pizzen parallel', 7, 9, 4, 6.7, '«status.confirmed»'],
  ['4', '«main»', '«cat.material»', '«cat.material»', 'Thermo-Boxen veraltet', 'Dichtungen porös, Wärmeverlust hoch', 5, 3, 8, 5.3, '«status.confirmed»'],
  ['5', '«main»', '«cat.environment»', '«cat.environment»', 'Verkehr Berlin-Mitte zur Hauptverkehrszeit', 'Rush Hour 17–19 Uhr', 8, 4, 9, 7, '«status.open»'],
  ['6', '«main»', '«cat.measurement»', '«cat.measurement»', 'Keine kontinuierliche Zeitmessung', 'Lieferzeiten nur stichprobenartig erfasst', 6, 5, 5, 5.3, '«status.open»'],
];

/** Faktenzeilen der bisherigen CSV ohne Datum (das Beispiel rechnet es relativ zu heute). */
const OLD_FACTS = [
  [1, 'Lieferzeit-Median 32 min', 'Median der gemessenen Lieferzeit der letzten 4 Wochen liegt bei 32 min (Sollwert ≤ 30 min)', 'M. Müller (Filialleiter)'],
  [2, '44 % > 30 min in Rush Hour', 'Zwischen 17:00 und 20:00 Uhr überschreiten 44 % aller Lieferungen die 30-Minuten-Grenze', 'M. Müller (Filialleiter)'],
  [3, '11 Reklamationen „Pizza kalt“ / Monat', 'Im März 2026 wurden 11 Reklamationen wegen kalter Pizza erfasst, gegenüber 4 im Vorjahresmonat', 'M. Müller (Filialleiter)'],
  [4, 'Bestell-Peak 18:30–19:15', 'Höchste Bestelldichte mit > 9 Pizzen / 15 min — Ofen läuft an der Kapazitätsgrenze', 'G. Rossi (Pizzabäcker)'],
  [5, 'Neue Fahrer: +6,2 min ggü. Stammfahrern', 'Lieferzeit-Vergleich Fahrer < 3 Monate Erfahrung vs. Stammfahrer (> 12 Monate): ø +6,2 min', 'K. Schmidt (Fahrer)'],
  [6, 'Thermo-Box-Audit: 5 von 8 defekt', 'Sichtprüfung Dichtungen: 5 von 8 Boxen mit sichtbar porösen Dichtungen, 3 davon kritisch', 'M. Müller (Filialleiter)'],
  [7, 'Datenlücke: 35 % ohne Zeit-Datensatz', 'Lieferzeit wird nur händisch in der Bestell-App eingetragen, ca. 35 % aller Bestellungen ohne erfassten Zeitstempel', 'K. Schmidt (Fahrer)'],
];

suite('ishikawa/io/export', () => {
  test('Lieferzeit: Zelle für Zelle wie die bisherige CSV', async () => {
    const raw = await lieferzeitRaw();
    const m = State.fromJSON(raw, { onRepair: () => {} });
    const rows = exportTable(m, { t });
    assertDeepEqual(rows[0], ['«problemStatement»', 'Pizza-Lieferzeit übersteigt 30 min in Stoßzeiten']);
    assertDeepEqual(rows[1], []);
    assertDeepEqual(rows[2], ['#', '«level»', '«category»', '«effCat»', '«colName»', '«colDescription»',
      'M. Müller (Filialleiter)', 'G. Rossi (Pizzabäcker)', 'K. Schmidt (Fahrer)', '«avgScore»', '«statusHeader»']);
    for (let i = 0; i < OLD_CAUSES.length; i++) assertDeepEqual(rows[3 + i], OLD_CAUSES[i]);
    const at = 3 + OLD_CAUSES.length;
    assertDeepEqual(rows[at], []);
    assertDeepEqual(rows[at + 1], ['«tabFacts»']);
    assertDeepEqual(rows[at + 2], ['#', '«factName»', '«factDescription»', '«factDate»', '«factOwner»']);
    assertEqual(rows.length, at + 3 + OLD_FACTS.length);
    OLD_FACTS.forEach(([n, name, desc, owner], i) => {
      assertDeepEqual(rows[at + 3 + i], [n, name, desc, raw.facts[i].date, owner]);
    });
  });

  test('Score auf eine Dezimale gerundet, als Zahl', () => {
    const m = State.fromJSON({
      problem: 'P', experts: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }],
      rows: [{ id: 1, stableId: 'H-001', parentId: null, category: 'man', name: 'x', description: '', ratings: { 1: 3, 2: 3, 3: 4 }, status: 'open' }],
    }, { onRepair: () => {} });
    assertEqual(exportTable(m, { t })[3][9], 3.3);
  });

  test('eigene Kategoriebezeichnung, geerbte Kategorie, ohne Fakten kein Faktenblock', () => {
    const m = State.fromJSON({
      problem: 'P', experts: [{ id: 1, name: 'A' }], catLabels: { man: ' Mensch ' },
      rows: [
        { id: 1, stableId: 'H-001', parentId: null, category: 'man', name: 'x', description: 'd', ratings: { 1: 4 }, status: 'open' },
        { id: 2, stableId: 'H-002', parentId: 1, category: '', name: 'y', description: '', ratings: {}, status: 'confirmed' },
      ],
    }, { onRepair: () => {} });
    const rows = exportTable(m, { t });
    assertDeepEqual(rows[3], ['1', '«main»', 'Mensch', 'Mensch', 'x', 'd', 4, 4, '«status.open»']);
    assertDeepEqual(rows[4], ['1.1', '«sub»', '', 'Mensch', 'y', '  ', '', '', '«status.confirmed»']);
    assertEqual(rows.length, 5);
  });
});

suite('ishikawa export: echte Modultexte', () => {
  for (const lang of ['de', 'en']) {
    test(`${lang}: Kopfzeile besteht nur aus Textzellen, Statuskopf ist das Statuslabel`, async () => {
      const ui = await (await fetch(new URL(`../../../js/modules/ishikawa/resources/i18n/ui.${lang}.json`, import.meta.url), { cache: 'no-cache' })).json();
      /** Wie der Kern: Punktpfad im Textbaum, unbekannt liefert den Schlüssel. */
      const real = (k) => k.split('.').reduce((o, p) => (o == null ? undefined : o[p]), ui) ?? k;
      const model = State.fromJSON(await lieferzeitRaw(), { onRepair: () => {} });
      const rows = exportTable(model, { t: real });
      for (const row of rows) {
        for (const cell of row) {
          assertEqual(typeof cell === 'object', false, `Zelle ist ein Objekt: ${JSON.stringify(cell)}`);
          assertEqual(String(cell).includes('[object Object]'), false);
        }
      }
      const head = rows[2];
      assertEqual(head[head.length - 1], ui.statusHeader);
      assertEqual(head[4], ui.colName);
      assertEqual(head[5], ui.colDescription);
    });
  }
});
