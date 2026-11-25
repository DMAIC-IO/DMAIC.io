/**
 * TRIZ Physikalischer Widerspruch: Beispiel.
 *
 * Das Beispiel `triz-physical-contradiction-tragfluegel` liegt in der
 * Modulablage, lädt streng und ohne Reparatur, und seine Felder gleichen dem
 * `read()` der Altform.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { setModelName } from '../../../js/core/model.js';
import { State } from '../../../js/modules/triz-physical-contradiction/domain/model.js';

setModelName(State, 'triz-physical-contradiction');

const BASE = '../../../js/modules/triz-physical-contradiction/resources/examples/';
const FILE = 'projects/triz-physical-contradiction-tragfluegel.json';

/** `read()` der Altform für das Beispiel. */
const LEGACY_READ = {
  parameter: 'Länge des Tragflügels',
  requirementA: 'lang — für hohen Auftrieb beim Start und im Langsamflug',
  requirementNotA: 'kurz — für niedrigen Luftwiderstand im Reiseflug',
  problemNote: 'Klassisches Lehrbeispiel. Aus der Widerspruchsmatrix kommt hier kein eindeutiger Vorschlag, weil sich derselbe Parameter widerspricht — Fall für den physikalischen Widerspruch.',
  principleNotes: {
    time: 'Variable Geometrie: Flügel zum Start ausgefahren, im Reiseflug eingefahren (Schwenkflügel — F-14, B-1).',
    space: 'Flügelinnenbereich lang (Auftrieb), Flügelspitzen pfeilförmig kurz (Widerstand) — Pfeilflügel, Winglets.',
    condition: 'Klappen/Slats: nur bei niedriger Geschwindigkeit ausgefahren (geschwindigkeitsabhängig).',
    system: 'Hauptflügel klein, separates Auftriebshilfssystem (Hochauftriebsklappen, Vorflügel) als eigenes Subsystem.',
  },
  selectedPrinciple: 'time',
  solutionNote: 'Schwenkflügel-Mechanik: Aktor stellt die effektive Spannweite je Flugphase ein. Zusätzlich Hochauftriebsklappen (Bedingungs-Separation) für die Übergänge.',
};

/** @param {string} relPath */
async function fetchJson(relPath) {
  const res = await fetch(new URL(relPath, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

const plain = (v) => JSON.parse(JSON.stringify(v));

suite('triz-physical-contradiction: Beispiel', () => {
  test('das Beispiel steht in der Modulablage', async () => {
    const own = await fetchJson(`${BASE}examples.json`);
    assertDeepEqual(own.examples.map((e) => e.id), ['triz-physical-contradiction-tragfluegel']);
    const [e] = own.examples;
    assertEqual(e.type, 'project');
    assertEqual(e.format, 'json');
    assertEqual(e.file, FILE);
    assertEqual(e.modules, undefined);
    assertTrue(!!e.title.de && !!e.title.en, 'Titel fehlt');
    assertTrue(!!e.description.de && !!e.description.en, 'Beschreibung fehlt');
  });

  test('tragfluegel: lädt streng ohne Reparatur, Werte wie in der Altform', async () => {
    const raw = await fetchJson(`${BASE}${FILE}`);
    assertDeepEqual(raw._schema, { name: 'triz-physical-contradiction', version: '1.0' });
    assertDeepEqual(Object.keys(raw), ['_schema', 'parameter', 'requirementA', 'requirementNotA', 'problemNote', 'principleNotes', 'selectedPrinciple', 'solutionNote']);
    State.fromJSON(plain(raw));
    /** @type {string[]} */
    const repairs = [];
    const m = State.fromJSON(plain(raw), { repair: true, onRepair: (f) => repairs.push(f) });
    assertDeepEqual(repairs, []);
    const { _schema, ...fields } = plain(m.toJSON());
    assertDeepEqual(fields, LEGACY_READ);
    assertEqual(Object.values(LEGACY_READ.principleNotes).filter((n) => n.length > 0).length, 4);
    assertEqual(JSON.stringify(m.toJSON()), JSON.stringify(raw));
    assertTrue(m.hasContent(), 'hasContent');
  });
});
