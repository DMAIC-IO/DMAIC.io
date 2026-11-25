/**
 * TRIZ-Widerspruchsmatrix: Beispiel.
 *
 * Das Beispiel `triz-contradiction-speed-vs-productivity` liegt in der
 * Modulablage, lädt streng und ohne Reparatur, seine Felder gleichen dem
 * `read()` der Altform, und die Ableitung `recommendation` meldet die leere
 * Zelle 9/39.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { setModelName } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { State } from '../../../js/modules/triz-contradiction-matrix/domain/model.js';

setModelName(State, 'triz-contradiction-matrix');

const BASE = '../../../js/modules/triz-contradiction-matrix/resources/examples/';
const FILE = 'projects/triz-contradiction-speed-vs-productivity.json';

/** `read()` der Altform für das Beispiel. */
const LEGACY_READ = {
  improving: 9,
  worsening: 39,
  problemNote: 'Wir wollen die Pizza schneller ausliefern (Speed ↑), ohne dass die Produktivität pro Schicht sinkt. Klassischer TRIZ-Konflikt im Lieferprozess — siehe Inventive Principles 35 (Eigenschaften ändern) und 18 (Mechanische Vibration / Pulsation, hier sinngemäß: gepufferter Takt).',
  showMatrix: true,
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

suite('triz-contradiction-matrix: Beispiel', () => {
  test('das Beispiel steht in der Modulablage', async () => {
    const own = await fetchJson(`${BASE}examples.json`);
    assertDeepEqual(own.examples.map((e) => e.id), ['triz-contradiction-speed-vs-productivity']);
    const [e] = own.examples;
    assertEqual(e.type, 'project');
    assertEqual(e.format, 'json');
    assertEqual(e.file, FILE);
    assertEqual(e.modules, undefined);
    assertTrue(!!e.title.de && !!e.title.en, 'Titel fehlt');
    assertTrue(!!e.description.de && !!e.description.en, 'Beschreibung fehlt');
  });

  test('speed-vs-productivity: lädt streng ohne Reparatur, Werte wie in der Altform', async () => {
    const raw = await fetchJson(`${BASE}${FILE}`);
    assertDeepEqual(raw._schema, { name: 'triz-contradiction-matrix', version: '1.0' });
    assertDeepEqual(Object.keys(raw), ['_schema', 'improving', 'worsening', 'problemNote', 'showMatrix']);
    State.fromJSON(plain(raw));
    /** @type {string[]} */
    const repairs = [];
    const m = State.fromJSON(plain(raw), { repair: true, onRepair: (f) => repairs.push(f) });
    assertDeepEqual(repairs, []);
    const { _schema, ...fields } = plain(m.toJSON());
    assertDeepEqual(fields, LEGACY_READ);
    assertEqual(JSON.stringify(m.toJSON()), JSON.stringify(raw));
    assertTrue(m.hasContent(), 'hasContent');
    assertDeepEqual(evaluateDerived(m, /** @type {any} */ (undefined), undefined, T).recommendation, { status: 'noEntry', principles: [] });
  });
});
