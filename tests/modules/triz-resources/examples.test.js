/**
 * TRIZ-Ressourcen: Beispiel.
 *
 * Das Beispiel `triz-resources-bandfoerderer` liegt in der Modulablage, lädt
 * streng und ohne Reparatur, und System, Notizen und Status je Zelle gleichen
 * dem `read()` der Altform.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { setModelName } from '../../../js/core/model.js';
import { State } from '../../../js/modules/triz-resources/domain/model.js';

setModelName(State, 'triz-resources');

const BASE = '../../../js/modules/triz-resources/resources/examples/';
const FILE = 'projects/triz-resources-bandfoerderer.json';

/** `read()` der Altform für das Beispiel. */
const LEGACY_READ = {
  system: 'Bandförderer für lose Schüttgut',
  cells: {
    substance: {
      sub: { notes: 'Förderband (Gummi), Antriebsrolle, Lagerschilde, Aufnahmetrichter.', status: 'full' },
      sys: { notes: 'Schüttgut selbst, Staub als Nebenprodukt, Schmierfett der Lager.', status: 'partial' },
      super: { notes: 'Hallenboden, Hallenluft mit Feuchte und Staub, Sammelbehälter.', status: 'unused' },
    },
    field: {
      sub: { notes: 'Reibung Band/Rolle, Antriebsdrehmoment.', status: 'full' },
      sys: { notes: 'Schwerkraft auf das Schüttgut, Eigengewicht der Brücken, Vibration der Rollen.', status: 'partial' },
      super: { notes: 'Hallentemperatur (saisonale Schwankung), elektromagnetisches Feld der Antriebe.', status: 'unknown' },
    },
    space: {
      sub: { notes: 'Bandquerschnitt — Material liegt nur in der Mitte.', status: 'partial' },
      sys: { notes: 'Hohlraum unter dem Band, Übergangstrichter (Hauptklemmstelle).', status: 'unused' },
      super: { notes: 'Freier Raum oberhalb des Förderers, Wand des Übergangsbereichs.', status: 'unused' },
    },
    time: {
      sub: { notes: 'Stillstandszeit zwischen Förder-Chargen ~ 30 s.', status: 'unused' },
      sys: { notes: 'Vorlaufzeit beim Anfahren — Material liegt zunächst still.', status: 'unknown' },
      super: { notes: 'Schichtwechsel — keine Förderlast für ~ 10 min.', status: 'unused' },
    },
    info: {
      sub: { notes: 'Motorstrom (steigt bei Verstopfung), Lagertemperatur.', status: 'partial' },
      sys: { notes: 'Geräusch des Förderbands ändert sich vor Stau (Operator hört es).', status: 'unused' },
      super: { notes: 'Kein Schüttgut-Füllstandsensor im Übergabe-Trichter.', status: 'unknown' },
    },
    function: {
      sub: { notes: 'Antrieb dreht Rollen — könnte zusätzlich Vibration erzeugen.', status: 'unused' },
      sys: { notes: 'Kinetische Energie des fließenden Materials — könnte Brückenbildung selbst stören.', status: 'unused' },
      super: { notes: 'Bestehender Druckluftring zur Reinigung — könnte als Klopfer dienen.', status: 'unknown' },
    },
  },
};

/** @param {string} relPath */
async function fetchJson(relPath) {
  const res = await fetch(new URL(relPath, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

const plain = (v) => JSON.parse(JSON.stringify(v));

suite('triz-resources: Beispiel', () => {
  test('das Beispiel steht in der Modulablage', async () => {
    const own = await fetchJson(`${BASE}examples.json`);
    assertDeepEqual(own.examples.map((e) => e.id), ['triz-resources-bandfoerderer']);
    const [e] = own.examples;
    assertEqual(e.type, 'project');
    assertEqual(e.format, 'json');
    assertEqual(e.file, FILE);
    assertEqual(e.modules, undefined);
    assertTrue(!!e.title.de && !!e.title.en, 'Titel fehlt');
    assertTrue(!!e.description.de && !!e.description.en, 'Beschreibung fehlt');
  });

  test('bandfoerderer: lädt streng ohne Reparatur, Werte wie in der Altform', async () => {
    const raw = await fetchJson(`${BASE}${FILE}`);
    assertDeepEqual(raw._schema, { name: 'triz-resources', version: '1.0' });
    assertDeepEqual(Object.keys(raw), ['_schema', 'system', 'cells']);
    State.fromJSON(plain(raw));
    /** @type {string[]} */
    const repairs = [];
    const m = State.fromJSON(plain(raw), { repair: true, onRepair: (f) => repairs.push(f) });
    assertDeepEqual(repairs, []);
    assertDeepEqual({ system: m.system, cells: plain(m.cells) }, LEGACY_READ);
    const cells = Object.values(LEGACY_READ.cells).flatMap((c) => Object.values(c));
    assertEqual(cells.length, 18);
    assertEqual(cells.filter((c) => c.notes.length > 0).length, 18);
    assertEqual(JSON.stringify(m.toJSON()), JSON.stringify(raw));
    assertTrue(m.hasContent(), 'hasContent');
  });
});
