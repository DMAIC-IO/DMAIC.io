/**
 * Ideales Endresultat (TRIZ): Beispiel.
 *
 * Das Beispiel `triz-ifr-bandfoerderer` liegt in der Modulablage, lädt streng
 * und ohne Reparatur, und die sieben Texte gleichen dem `read()` der Altform
 * (die Felder der Datei, unverändert).
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { setModelName } from '../../../js/core/model.js';
import { State } from '../../../js/modules/triz-ifr/domain/model.js';

setModelName(State, 'triz-ifr');

const BASE = '../../../js/modules/triz-ifr/resources/examples/';
const FIELDS = ['system', 'usefulFunction', 'harmfulEffect', 'ifr1', 'ifr2', 'ifr3', 'obstacles'];

/** `read()` der Altform für das Beispiel. */
const LEGACY_READ = {
  system: 'Bandförderer für lose Schüttgut',
  usefulFunction: 'Transportiert Schüttgut zuverlässig von A nach B',
  harmfulEffect: 'Partikel verklemmen am Übergabe-Trichter und blockieren den Förderer',
  ifr1: 'Der Bandförderer verhindert das Verklemmen am Übergabe-Trichter von selbst — kein Eingriff, keine Reinigungsstation nötig.',
  ifr2: 'Das Material verklemmt nicht. (Idealerweise existiert das Problem gar nicht — z.B. weil die Korngrößenverteilung am Eingang bereits passend ist.)',
  ifr3: 'Die Schwerkraft selbst löst die Verklemmung auf — etwa durch geschickte Übergangsgeometrie, die Klemm-Brücken einfach zerfallen lässt.',
  obstacles: '• Übergangswinkel < Schüttwinkel → Materialbrücken bilden sich\n• Korngrößenverteilung zu breit → Verkeilung\n• Keine Vibration / Rüttler im Übergangsbereich\n• Operator hat keine Frühwarnung — erkennt Stau erst beim Stillstand',
};

/** @param {string} relPath */
async function fetchJson(relPath) {
  const res = await fetch(new URL(relPath, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

const plain = (v) => JSON.parse(JSON.stringify(v));

suite('triz-ifr: Beispiel', () => {
  test('das Beispiel steht in der Modulablage', async () => {
    const own = await fetchJson(`${BASE}examples.json`);
    assertDeepEqual(own.examples.map((e) => e.id), ['triz-ifr-bandfoerderer']);
    const [e] = own.examples;
    assertEqual(e.type, 'project');
    assertEqual(e.format, 'json');
    assertEqual(e.file, 'projects/triz-ifr-bandfoerderer.json');
    assertEqual(e.modules, undefined);
    assertTrue(!!e.title.de && !!e.title.en, 'Titel fehlt');
    assertTrue(!!e.description.de && !!e.description.en, 'Beschreibung fehlt');
  });

  test('triz-ifr-bandfoerderer: lädt streng ohne Reparatur, Texte wie in der Altform', async () => {
    const raw = await fetchJson(`${BASE}projects/triz-ifr-bandfoerderer.json`);
    assertDeepEqual(raw._schema, { name: 'triz-ifr', version: '1.0' });
    assertDeepEqual(Object.keys(raw), ['_schema', ...FIELDS]);
    State.fromJSON(plain(raw));
    /** @type {string[]} */
    const repairs = [];
    const m = State.fromJSON(plain(raw), { repair: true, onRepair: (f) => repairs.push(f) });
    assertDeepEqual(repairs, []);
    assertDeepEqual(Object.fromEntries(FIELDS.map((n) => [n, m[n]])), LEGACY_READ);
    assertEqual(JSON.stringify(m.toJSON()), JSON.stringify(raw));
    assertTrue(m.hasContent(), 'hasContent');
  });
});
