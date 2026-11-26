/**
 * TRIZ 9 Windows: Beispiel.
 *
 * Das Beispiel `triz9windows-pizza-lieferung` liegt in der Modulablage, lädt
 * streng und ohne Reparatur, seine Felder gleichen dem `read()` der Altform
 * (alle Fenster ohne Bild), und `toJSON` ist zeichengleich mit der Datei.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { setModelName } from '../../../js/core/model.js';
import { schemaAgentEntry, readSchemaModel } from '../../../js/core/agent/agent-schema.js';
import { State } from '../../../js/modules/triz-9-windows/domain/model.js';

setModelName(State, 'triz-9-windows');

const BASE = '../../../js/modules/triz-9-windows/resources/examples/';
const FILE = 'projects/triz-9windows-pizza-lieferung.json';

/** `read()` der Altform für das Beispiel (mit `fields: ['cells']` vollständig). */
const LEGACY_READ = {
  systemTitle: 'Pizza-Lieferprozess Bella Margherita',
  colLabels: ['Vergangenheit', 'Gegenwart', 'Zukunft'],
  rowLabels: ['Subsystem', 'System', 'Übersystem'],
  cells: [
    [
      { text: 'Wachspapier + einfache Pappschachtel; Pizza kühlt nach 10 min spürbar ab.', image: null },
      { text: 'Karton + Thermo-Box mit defekter Dichtung; Wärmeverlust ~ 12 °C/15 min.', image: null },
      { text: 'Doppelwand-Box mit Phase-Change-Insert; hält Temperatur ≥ 30 min über 50 °C.', image: null },
    ],
    [
      { text: 'Festes Bestellfenster pro Schicht, Fahrer wählt Route aus dem Kopf.', image: null },
      { text: 'Online-Bestellungen, manuelle Routenwahl, Engpässe in Stoßzeiten.', image: null },
      { text: 'Live-Routenoptimierung, gepuffertes Backen, Echtzeit-Lieferprognose im Bestellsystem.', image: null },
    ],
    [
      { text: 'Einzelne Filiale, kein Wettbewerbsdruck durch Lieferdienste.', image: null },
      { text: 'Mehrere Pizzerien + Plattformen (Lieferando, Wolt); Kunden vergleichen Lieferzeit.', image: null },
      { text: 'Vernetztes Filialnetz mit gemeinsamer Logistik-Plattform; Lieferzeiten als Wettbewerbsmerkmal.', image: null },
    ],
  ],
};

/** @param {string} relPath */
async function fetchJson(relPath) {
  const res = await fetch(new URL(relPath, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

const plain = (v) => JSON.parse(JSON.stringify(v));

suite('triz-9-windows: Beispiel', () => {
  test('das Beispiel steht in der Modulablage', async () => {
    const own = await fetchJson(`${BASE}examples.json`);
    assertDeepEqual(own.examples.map((e) => e.id), ['triz-9windows-pizza-lieferung']);
    const [e] = own.examples;
    assertEqual(e.type, 'project');
    assertEqual(e.format, 'json');
    assertEqual(e.file, FILE);
    assertEqual(e.modules, undefined);
    assertTrue(!!e.title.de && !!e.title.en, 'Titel fehlt');
    assertTrue(!!e.description.de && !!e.description.en, 'Beschreibung fehlt');
  });

  test('pizza-lieferung: lädt streng ohne Reparatur, Werte wie in der Altform', async () => {
    const raw = await fetchJson(`${BASE}${FILE}`);
    assertDeepEqual(raw._schema, { name: 'triz-9-windows', version: '1.0' });
    assertDeepEqual(Object.keys(raw), ['_schema', 'systemTitle', 'colLabels', 'rowLabels', 'cells']);
    State.fromJSON(plain(raw));
    /** @type {string[]} */
    const repairs = [];
    const m = State.fromJSON(plain(raw), { repair: true, onRepair: (f) => repairs.push(f) });
    assertDeepEqual(repairs, []);
    const { _schema, ...fields } = plain(m.toJSON());
    assertDeepEqual(fields, LEGACY_READ);
    assertEqual(JSON.stringify(m.toJSON()), JSON.stringify(raw));
    assertTrue(m.hasContent(), 'hasContent');
  });

  test('read({ fields }) gleicht dem read() der Altform', async () => {
    const raw = await fetchJson(`${BASE}${FILE}`);
    const m = State.fromJSON(plain(raw));
    const out = readSchemaModel(schemaAgentEntry(State), m, { fields: ['systemTitle', 'colLabels', 'rowLabels', 'cells'] });
    assertEqual(JSON.stringify(out), JSON.stringify(LEGACY_READ));
  });
});
