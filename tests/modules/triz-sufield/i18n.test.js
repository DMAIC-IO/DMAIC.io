/**
 * Stoff-Feld-Analyse (TRIZ): Texte in resources/i18n/ui.<lang>.json — die
 * vier Texte je Standardlösung vollständig in beiden Sprachen, passend zur
 * Tabelle, festgehalten über eine Prüfsumme je Sprache; Namen der Klassen,
 * Feldarten, Verknüpfungen und Lagen vollständig.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { cyrb53 } from '../../../js/core/hash.js';
import { STANDARDS, CLASS_NUMBERS } from '../../../js/modules/triz-sufield/domain/standards.js';
import { FIELD_TYPES, LINK_TYPES } from '../../../js/modules/triz-sufield/domain/diagnosis.js';

const MOD = '../../../js/modules/triz-sufield/';
const LANGS = ['de', 'en'];
const TEXT_KEYS = ['title', 'description', 'trigger', 'example'];
const SITUATIONS = ['partial', 'incomplete', 'complete-useful', 'complete-insufficient', 'complete-excessive', 'complete-harmful'];

async function fetchJson(path) {
  const res = await fetch(new URL(`${MOD}${path}`, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

const ui = (lang) => fetchJson(`resources/i18n/ui.${lang}.json`);

/** Der Eintrag zur id `k.g.n` unter `standards.<k>.<g>.<n>`. */
const entryOf = (standards, id) => {
  const [c, g, n] = id.split('.');
  return standards?.[c]?.[g]?.[n];
};

/** Alle Blätter `k.g.n` der verschachtelten Texte. */
const idsOf = (standards) => Object.entries(standards).flatMap(([c, groups]) =>
  Object.entries(groups).flatMap(([g, entries]) => Object.keys(entries).map((n) => `${c}.${g}.${n}`)));

/**
 * cyrb53 über JSON der Texte der Standardlösungen je Sprache. Gebildet, als
 * die Texte wortgleich mit der früheren Quelldatei `data/standards.json`
 * waren; danach sind im Deutschen fünf Stellen bewusst typografisch
 * korrigiert worden („z.B.“ → „z. B.“ in den Auslösern von 1.1.7 und 2.4.12
 * und den Beschreibungen von 2.4.7, 4.2.2 und 5.2.2), die Prüfsumme `de` ist
 * danach neu gebildet. Die englischen Texte sind unverändert.
 */
const CHECKSUMS = { de: 1444517045237691, en: 3389924795424250 };

suite('triz-sufield Texte der Standardlösungen in ui.<lang>.json', () => {
  test('78 Standardlösungen in DE und EN, je mit vier nichtleeren Texten, in Tabellenreihenfolge', async () => {
    for (const lang of LANGS) {
      const { standards } = await ui(lang);
      assertDeepEqual(idsOf(standards), STANDARDS.map((s) => s.id), lang);
      for (const { id } of STANDARDS) {
        const entry = entryOf(standards, id);
        assertDeepEqual(Object.keys(entry), TEXT_KEYS, `${lang} ${id}`);
        for (const k of TEXT_KEYS) {
          assertTrue(typeof entry[k] === 'string' && entry[k].trim().length > 0, `${lang} standards.${id}.${k}`);
        }
      }
    }
  });

  test('deutsch ohne „z.B.“ (typografisch „z. B.“)', async () => {
    const { standards } = await ui('de');
    assertTrue(!JSON.stringify(standards).includes('z.B.'), 'z.B.');
    assertEqual(entryOf(standards, '1.1.7').trigger.includes('z. B.'), true, '1.1.7');
  });

  test('Prüfsumme je Sprache', async () => {
    for (const lang of LANGS) {
      const { standards } = await ui(lang);
      assertEqual(cyrb53(JSON.stringify(standards)), CHECKSUMS[lang], lang);
    }
  });
});

suite('triz-sufield Namen der Klassen, Feldarten, Verknüpfungen und Lagen', () => {
  test('class.1–5 mit Name und Beschreibung', async () => {
    for (const lang of LANGS) {
      const { class: classes } = await ui(lang);
      assertDeepEqual(Object.keys(classes), CLASS_NUMBERS.map(String), lang);
      for (const [n, c] of Object.entries(classes)) {
        assertDeepEqual(Object.keys(c), ['name', 'description'], `${lang} class.${n}`);
        assertTrue(c.name.length > 0 && c.description.length > 0, `${lang} class.${n}`);
      }
    }
  });

  test('field.*, link.* und situation.* je Wert der Listen', async () => {
    for (const lang of LANGS) {
      const { field, link, situation } = await ui(lang);
      assertDeepEqual(Object.keys(field), [...FIELD_TYPES], `${lang} field`);
      assertDeepEqual(Object.keys(link), [...LINK_TYPES], `${lang} link`);
      assertDeepEqual(Object.keys(situation), SITUATIONS, `${lang} situation`);
      for (const v of [...Object.values(field), ...Object.values(link), ...Object.values(situation)]) {
        assertTrue(typeof v === 'string' && v.length > 0, lang);
      }
    }
  });

  test('ein Text je Invariante des Models', async () => {
    for (const lang of LANGS) {
      const { invariants } = await ui(lang);
      assertDeepEqual(Object.keys(invariants), ['knownNotes', 'knownSelections', 'validExpandedClasses'], lang);
    }
  });
});
