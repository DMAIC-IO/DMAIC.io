/**
 * Widerspruchsmatrix (TRIZ): Texte der 39 Parameter und 40 Prinzipien in
 * resources/i18n/ui.<lang>.json — vollständig in beiden Sprachen, passend zur
 * Tabelle und wortgleich mit den früheren Quelldateien `parameters.json` und
 * `principles.json` (Prüfsummen, gebildet, als beide noch gleich waren).
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { cyrb53 } from '../../../js/core/hash.js';
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

/** cyrb53 über JSON der Tabellentexte je Sprache. */
const CHECKSUMS = {
  de: { parameters: 5205695168019191, principles: 4356071275164251 },
  en: { parameters: 1718647034650640, principles: 880279776355777 },
};

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

  test('Parameter- und Prinzipientexte wortgleich mit den früheren Quelldateien (Prüfsummen)', async () => {
    for (const lang of LANGS) {
      const { parameters, principles } = await ui(lang);
      assertEqual(cyrb53(JSON.stringify(parameters)), CHECKSUMS[lang].parameters, `${lang} parameters`);
      assertEqual(cyrb53(JSON.stringify(principles)), CHECKSUMS[lang].principles, `${lang} principles`);
    }
  });
});
