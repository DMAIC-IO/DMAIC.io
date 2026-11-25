/**
 * Widerspruchsmatrix (TRIZ): Texte der 39 Parameter und 40 Prinzipien in
 * resources/i18n/ui.<lang>.json — vollständig in beiden Sprachen, passend zur
 * Tabelle und wortgleich mit den Quelldateien unter data/.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { MATRIX, PARAMETER_COUNT, PRINCIPLE_COUNT } from '../../../js/modules/triz-contradiction-matrix/domain/matrix.js';

const MOD = '../../../js/modules/triz-contradiction-matrix/';
const LANGS = ['de', 'en'];

async function fetchJson(path) {
  const res = await fetch(new URL(`${MOD}${path}`, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

const ui = (lang) => fetchJson(`resources/i18n/ui.${lang}.json`);
const ids = (n) => Array.from({ length: n }, (_, i) => String(i + 1));

/** Texte einer Tabelle aus der Quelldatei als `{ "<id>": { name, description } }`. */
const fromSource = (list, lang) => Object.fromEntries(
  list.map((e) => [String(e.id), { name: e[lang].name, description: e[lang].description }]),
);

suite('Widerspruchsmatrix (TRIZ): Tabellentexte in ui.<lang>.json', () => {
  test('39 Parameter und 40 Prinzipien in DE und EN, je mit Name und Beschreibung', async () => {
    for (const lang of LANGS) {
      const { parameters, principles } = await ui(lang);
      assertDeepEqual(Object.keys(parameters), ids(PARAMETER_COUNT), `${lang} parameters`);
      assertDeepEqual(Object.keys(principles), ids(PRINCIPLE_COUNT), `${lang} principles`);
      for (const [kind, table] of [['parameters', parameters], ['principles', principles]]) {
        for (const [id, entry] of Object.entries(table)) {
          assertDeepEqual(Object.keys(entry), ['name', 'description'], `${lang} ${kind}.${id}`);
          assertTrue(typeof entry.name === 'string' && entry.name.length > 0, `${lang} ${kind}.${id}.name`);
          assertTrue(typeof entry.description === 'string' && entry.description.length > 0, `${lang} ${kind}.${id}.description`);
        }
      }
    }
  });

  test('so viele Parameter wie Zeilen der Matrix, jedes Prinzip der Matrix hat einen Text', async () => {
    const used = new Set(MATRIX.flat().filter(Boolean).flat());
    for (const lang of LANGS) {
      const { parameters, principles } = await ui(lang);
      assertEqual(Object.keys(parameters).length, MATRIX.length, lang);
      for (const id of used) assertTrue(Object.hasOwn(principles, String(id)), `${lang} principles.${id}`);
    }
  });

  test('Parametertexte gleichen data/parameters.json wortgleich', async () => {
    const { parameters: source } = await fetchJson('data/parameters.json');
    for (const lang of LANGS) assertDeepEqual((await ui(lang)).parameters, fromSource(source, lang), lang);
  });

  test('Prinzipientexte gleichen data/principles.json wortgleich', async () => {
    const { principles: source } = await fetchJson('data/principles.json');
    for (const lang of LANGS) assertDeepEqual((await ui(lang)).principles, fromSource(source, lang), lang);
  });
});
