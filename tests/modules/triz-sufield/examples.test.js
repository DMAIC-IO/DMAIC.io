/**
 * TRIZ Su-Field: Beispiel.
 *
 * Das Beispiel `triz-sufield-bohrer-beton` liegt in der Modulablage, lädt
 * streng und ohne Reparatur, sein `read()` gleicht dem der Altform (Felder und
 * Diagnose als Literale), und `toJSON` ist zeichengleich mit der Datei.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { setModelName } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { schemaAgentEntry, readSchemaModel } from '../../../js/core/agent/agent-schema.js';
import { State } from '../../../js/modules/triz-sufield/domain/model.js';

setModelName(State, 'triz-sufield');

const BASE = '../../../js/modules/triz-sufield/resources/examples/';
const FILE = 'projects/triz-sufield-bohrer-beton.json';

/** `read()` der Altform für das Beispiel ohne das Massenfeld `standards`. */
const LEGACY_READ = {
  s1: 'Bohrer',
  s2: 'Werkstück (Beton)',
  field: 'M',
  link: 'insufficient',
  problemNote: 'Bohrer dringt zu langsam ein — mechanisches Feld zu schwach. Höhere Drehzahl überhitzt den Bohrer. Klassischer Fall für Klasse-2-Entwicklung.',
  notes: {
    '2.2.5': 'Pulsbetrieb: Schlagbohren statt kontinuierlicher Rotation — höhere Spitzenleistung ohne Überhitzung.',
    '2.4.1': 'Ferromagnetische Schwingungserregung am Werkstückhalter — Vibration unterstützt Materialabtrag.',
  },
  selected: { '2.2.5': true },
  diagnosis: { situation: 'complete-insufficient', suggestedClasses: [2] },
};

/** Stub-Übersetzer: macht den Schlüssel sichtbar. @param {string} key */
const T = (key) => `T:${key}`;

/** @param {string} relPath */
async function fetchJson(relPath) {
  const res = await fetch(new URL(relPath, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

const plain = (v) => JSON.parse(JSON.stringify(v));

/** Lesefläche wie im eingehängten Modul. @param {object} m @param {object} [options] */
function read(m, options) {
  const values = evaluateDerived(m, /** @type {any} */ (undefined), undefined, T);
  return readSchemaModel(schemaAgentEntry(State), m, options, {
    ...values, standardsColumns: ['id', 'class', 'group', 'title', 'trigger'],
  });
}

suite('triz-sufield: Beispiel', () => {
  test('das Beispiel steht in der Modulablage', async () => {
    const own = await fetchJson(`${BASE}examples.json`);
    assertDeepEqual(own.examples.map((e) => e.id), ['triz-sufield-bohrer-beton']);
    const [e] = own.examples;
    assertEqual(e.type, 'project');
    assertEqual(e.format, 'json');
    assertEqual(e.file, FILE);
    assertEqual(e.modules, undefined);
    assertTrue(!!e.title.de && !!e.title.en, 'Titel fehlt');
    assertTrue(!!e.description.de && !!e.description.en, 'Beschreibung fehlt');
  });

  test('bohrer-beton: lädt streng ohne Reparatur, toJSON zeichengleich, Ansichtsfelder', async () => {
    const raw = await fetchJson(`${BASE}${FILE}`);
    assertDeepEqual(raw._schema, { name: 'triz-sufield', version: '1.0' });
    assertDeepEqual(Object.keys(raw), [
      '_schema', 's1', 's2', 'field', 'link', 'problemNote', 'notes', 'selected', 'filterMode', 'expandedClasses',
    ]);
    State.fromJSON(plain(raw));
    /** @type {string[]} */
    const repairs = [];
    const m = State.fromJSON(plain(raw), { repair: true, onRepair: (f) => repairs.push(f) });
    assertDeepEqual(repairs, []);
    assertEqual(JSON.stringify(m.toJSON()), JSON.stringify(raw));
    assertEqual(m.filterMode, 'auto');
    assertDeepEqual([...m.expandedClasses], [2]);
    assertTrue(m.hasContent(), 'hasContent');
  });

  test('read() gleicht dem der Altform, standards als Tabellen-Deskriptor', async () => {
    const m = State.fromJSON(plain(await fetchJson(`${BASE}${FILE}`)));
    const { standards, ...rest } = plain(read(m));
    assertEqual(JSON.stringify(rest), JSON.stringify(LEGACY_READ));
    assertDeepEqual(standards, {
      $bulk: true, kind: 'table', rowCount: 78, columns: ['id', 'class', 'group', 'title', 'trigger'],
    });
  });
});
