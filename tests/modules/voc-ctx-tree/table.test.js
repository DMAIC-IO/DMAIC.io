/**
 * Tests for modules/voc-ctx-tree/io/table.js — die Zeilen für
 * `exports.table()`: am Pizza-Beispiel (de) gleich den Zeilen der
 * Byte-Fixture der Altform (`legacy-export.csv`, ohne BOM) bis auf das
 * Kernformat (`sep=;`, jedes Textfeld in Anführungszeichen, Zeilenende am
 * Schluss); `null` ohne Kundenstimmen.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { toRows } from '../../../js/modules/voc-ctx-tree/io/table.js';
import { State } from '../../../js/modules/voc-ctx-tree/domain/model.js';
import { toCsvText } from '../../../js/core/exporter.js';
import { setModelName } from '../../../js/core/model.js';

setModelName(State, 'voc-ctx-tree');

const MOD = new URL('../../../js/modules/voc-ctx-tree/', import.meta.url);
const EXAMPLE = new URL('../../../examples/projects/voc-ctx-pizza-lieferung.json', import.meta.url);

/** @param {URL} url @returns {Promise<any>} */
async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${url}: HTTP ${res.status}`);
  return res.json();
}

/** Die Zeilen der Byte-Fixture `legacy-export.csv` (ohne BOM; die Altform setzte keine Anführungszeichen, das Beispiel braucht keine). */
const LEGACY_CSV_LINES = [
  "VoC Statement;Quelle / Kunde (optional);Kundenbedürfnis;Typ;CTx;Messbare Anforderung;Ziel;Messung",
  "Die Pizza kommt manchmal lauwarm an, das finde ich enttäuschend.;Trustpilot-Kundenbewertung (2026-04);Heiße Pizza beim Auspacken;CTQ;Temperatur bei Übergabe;Pizza-Temperatur ≥ 50 °C bei Übergabe;;",
  "Die Pizza kommt manchmal lauwarm an, das finde ich enttäuschend.;Trustpilot-Kundenbewertung (2026-04);Heiße Pizza beim Auspacken;CTQ;Temperatur bei Übergabe;Thermo-Verpackung hält Temperatur ≥ 15 min;;",
  "Lieferzeit von 45 Minuten ist mir zu lang — ich bestelle dann woanders.;Kunden-Telefonbefragung, 12 Antworten;Pizza in akzeptabler Zeit;CTQ;Versprochene und tatsächliche Lieferzeit;95 % der Bestellungen ≤ 30 min;;",
  "Lieferzeit von 45 Minuten ist mir zu lang — ich bestelle dann woanders.;Kunden-Telefonbefragung, 12 Antworten;Pizza in akzeptabler Zeit;CTQ;Versprochene und tatsächliche Lieferzeit;Im Bestellsystem realistische Zeitprognose anzeigen;;",
  "Der Fahrer hat zweimal angerufen, weil er die Adresse nicht fand.;Reklamationsmail, K. Hartmann;Fahrer findet zuverlässig zum Kunden;CTQ;Adress-Korrektheit + Navigation;Adress-Plausibilitäts-Check bei der Bestellung;;",
  "Der Fahrer hat zweimal angerufen, weil er die Adresse nicht fand.;Reklamationsmail, K. Hartmann;Fahrer findet zuverlässig zum Kunden;CTQ;Adress-Korrektheit + Navigation;Routenplanungs-App mit Hausnummer-Genauigkeit;;",
];

/** Ein Feld im Kernformat. @param {string} s */
const quote = (s) => `"${s.replace(/"/g, '""')}"`;

suite('voc-ctx-tree table — toRows', () => {
  test('Pizza-Beispiel (de): Kopf und Zeilen wie die Altform; als CSV des Kerns die Byte-Fixture bis auf das Kernformat', async () => {
    const ui = await fetchJSON(new URL('resources/i18n/ui.de.json', MOD));
    const t = (key) => ui[key];
    const rows = toRows(State.fromJSON(await fetchJSON(EXAMPLE)), t);
    assertDeepEqual(rows, LEGACY_CSV_LINES.map((l) => l.split(';')));
    const expected = `sep=;\n${LEGACY_CSV_LINES.map((l) => l.split(';').map(quote).join(';')).join('\n')}\n`;
    assertEqual(toCsvText(rows, 'de'), expected);
  });
  test('Kopf in beiden Sprachen, Spalte CTx unübersetzt', async () => {
    for (const lang of ['de', 'en']) {
      const ui = await fetchJSON(new URL(`resources/i18n/ui.${lang}.json`, MOD));
      const m = new State();
      m.addVoc({ text: 'A' });
      const [head] = /** @type {string[][]} */ (toRows(m, (k) => ui[k]));
      assertEqual(head.length, 8, lang);
      assertEqual(head[4], 'CTx', lang);
      assertTrue(head.every((h) => typeof h === 'string' && h !== ''), lang);
    }
  });
  test('ohne Kundenstimmen: null', () => {
    assertEqual(toRows(new State(), (k) => k), null);
  });
});
