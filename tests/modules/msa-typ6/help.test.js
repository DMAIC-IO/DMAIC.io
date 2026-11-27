/**
 * MSA Typ 6: Handbuch und Referenzen aus den Moduldateien — gleich der Altform.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { helpDefFromFiles } from '../../../js/core/module-help-files.js';

const SECTION_IDS = ['goal', 'prerequisites', 'parameters', 'verdict', 'interpretation', 'examples'];
const BASE = '../../../js/modules/msa-typ6/resources/';

async function loadJson(rel) {
  const res = await fetch(new URL(`${BASE}${rel}`, import.meta.url));
  if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
  const { $schema: _schema, ...file } = await res.json();
  return file;
}

suite('MSA Typ 6: Handbuch aus help.<lang>.json', () => {
  test('Abschnitte mit DE- und EN-Inhalt', async () => {
    const def = helpDefFromFiles('msa-typ6', {
      de: await loadJson('i18n/help.de.json'),
      en: await loadJson('i18n/help.en.json'),
    });
    assertEqual(def.moduleId, 'msa-typ6');
    assertDeepEqual(Object.keys(def.sections), SECTION_IDS);
    for (const id of SECTION_IDS) {
      for (const lang of ['de', 'en']) {
        const s = def.sections[id][lang];
        assertTrue(typeof s.title === 'string' && s.title.length > 0, `${id} ${lang} Titel`);
        assertTrue(Array.isArray(s.blocks) && s.blocks.length > 0, `${id} ${lang} Blöcke`);
      }
    }
  });

  test('deutsche Texte mit echten Umlauten, μ als griechischer Buchstabe', async () => {
    for (const lang of ['de', 'en']) {
      const text = JSON.stringify(await loadJson(`i18n/help.${lang}.json`));
      assertTrue(!text.includes('µ'), `${lang}: Mikrozeichen statt μ`);
    }
    const de = await loadJson('i18n/help.de.json');
    assertTrue(/[äöüÄÖÜß]/.test(JSON.stringify(de.sections.goal)), 'Umlaut im Ziel');
  });

  test('jede {{ref:id}} steht in den Referenzen', async () => {
    const { references } = await loadJson('data/references.json');
    const known = new Set(references.map((r) => r.id ?? r.book));
    assertDeepEqual([...known], ['aiag-msa-4', 'montgomery-sqc-6', 'nelson-1984']);
    for (const lang of ['de', 'en']) {
      const text = JSON.stringify(await loadJson(`i18n/help.${lang}.json`));
      for (const m of text.matchAll(/\{\{ref:([^}|]+)/g)) {
        assertTrue(known.has(m[1]), `{{ref:${m[1]}}} (${lang}) fehlt in references.json`);
      }
    }
  });
});

// Die Lauflänge der Nelson-Regel 2 im Handbuch folgt dem Regeltext
// `common.nelson.2.short` (A5: derselbe Wortlaut wie in der Regelliste), die
// Quelle ist Nelson 1984 (neun Punkte auf einer Seite der Mittellinie).
const NUMBER_WORDS = {
  de: { 7: 'sieben', 8: 'acht', 9: 'neun' },
  en: { 7: 'seven', 8: 'eight', 9: 'nine' },
};

suite('MSA Typ 6: Nelson-Regeln im Handbuch wie die Regeltexte', () => {
  for (const lang of ['de', 'en']) {
    test(`${lang}: Lauflänge der Regel 2 und Quelle Nelson 1984`, async () => {
      const res = await fetch(new URL(`../../../i18n/${lang}.json`, import.meta.url));
      const runLength = Number.parseInt((await res.json()).common.nelson['2'].short, 10);
      assertEqual(runLength, 9);
      const help = await loadJson(`i18n/help.${lang}.json`);
      const block = help.sections.parameters.blocks
        .find((b) => b.type === 'definition' && /nelson-regeln/.test(b.term));
      assertTrue(!!block, 'Definition der Nelson-Regeln fehlt');
      assertTrue(block.content.includes(`${NUMBER_WORDS[lang][runLength]} `), `"${NUMBER_WORDS[lang][runLength]}" fehlt: ${block.content}`);
      for (const [n, other] of Object.entries(NUMBER_WORDS[lang])) {
        if (Number(n) === runLength) continue;
        assertTrue(!block.content.includes(`${other} Punkte`) && !block.content.includes(`${other} points`),
          `veraltete Lauflänge "${other}": ${block.content}`);
      }
      assertTrue(block.content.includes('{{ref:nelson-1984}}'));
    });
  }
});
