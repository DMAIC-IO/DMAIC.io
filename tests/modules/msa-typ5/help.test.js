/**
 * D.Mike — MSA Typ 5: Ressourcen aus den Moduldateien.
 *
 * Handbuch je Sprache (`resources/i18n/help.<lang>.json`), Literatur
 * (`resources/data/references.json`), Oberflächentexte und Kontexthilfe;
 * geprüft werden die Form, die das Hilfe-Panel nach `helpDefFromFiles`
 * erwartet, die Quellen und die Schlüssel, die die Umstellung braucht.
 */
import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import { helpDefFromFiles } from '../../../js/core/module-help-files.js';
import { AIAG_MSA_4, BOSCH_HEFT_10, MELZER_2019 } from '../../../js/core/references-books.js';

const SECTION_IDS = ['goal', 'data', 'formulas', 'details', 'verdict'];
const FIELDS = [
  'type', 'positiveLevel', 'weights', 'alpha', 'ruleSet', 'layout', 'trials',
  'part', 'appraiser', 'rating', 'reference', 'replicate', 'ratings',
  'exampleWorksheetId', 'analysis', 'levels',
];
const BASE = '../../../js/modules/msa-typ5/resources/';

async function loadJson(rel) {
  const res = await fetch(new URL(`${BASE}${rel}`, import.meta.url));
  if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
  const { $schema: _schema, ...file } = await res.json();
  return file;
}

const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);

suite('MSA Typ 5: Handbuch aus help.<lang>.json', () => {
  test('alle Abschnitte existieren mit DE- und EN-Inhalt', async () => {
    const def = helpDefFromFiles('msa-typ5', {
      de: await loadJson('i18n/help.de.json'),
      en: await loadJson('i18n/help.en.json'),
    });
    assertEqual(def.moduleId, 'msa-typ5');
    assertEqual(Object.keys(def.sections).join(','), SECTION_IDS.join(','));
    for (const id of SECTION_IDS) {
      for (const lang of ['de', 'en']) {
        const localized = def.sections[id][lang];
        assertTrue(!!localized, `Abschnitt "${id}" hat keine "${lang}"-Fassung`);
        assertTrue(typeof localized.title === 'string' && localized.title.length > 0,
          `Abschnitt "${id}" (${lang}) hat keinen Titel`);
        assertTrue(Array.isArray(localized.blocks) && localized.blocks.length > 0,
          `Abschnitt "${id}" (${lang}) hat keine Blöcke`);
      }
    }
  });

  test('deutsche Texte verwenden echte Unicode-Umlaute', async () => {
    const de = await loadJson('i18n/help.de.json');
    assertTrue(/[äöüÄÖÜß]/.test(JSON.stringify(de.sections.goal)),
      'Kein Unicode-Umlaut im deutschen Zielabschnitt gefunden');
  });

  test('jede {{ref:id}} steht in den Referenzen, die Bücher sind bekannt', async () => {
    const { references } = await loadJson('data/references.json');
    const known = new Set(references.map((r) => r.id ?? r.book));
    for (const id of [MELZER_2019.id, AIAG_MSA_4.id, BOSCH_HEFT_10.id, 'fleiss-nee-landis-1979']) {
      assertTrue(known.has(id), `Quelle ${id} fehlt in references.json`);
    }
    for (const lang of ['de', 'en']) {
      const text = JSON.stringify(await loadJson(`i18n/help.${lang}.json`));
      for (const m of text.matchAll(/\{\{ref:([^}|]+)/g)) {
        assertTrue(known.has(m[1]), `{{ref:${m[1]}}} (${lang}) fehlt in references.json`);
      }
    }
  });
});

suite('MSA Typ 5: Oberflächentexte und Kontexthilfe', () => {
  test('ui: Schlüssel der Umstellung in beiden Sprachen, ohne die entfallenen', async () => {
    for (const lang of ['de', 'en']) {
      const ui = await loadJson(`i18n/ui.${lang}.json`);
      for (const k of ['name', 'description', 'whenToUse', 'errCompute', 'errWideColumnsNotDivisible',
        'charts.sdtCriterion', 'invariants.uniqueRatings', 'labels.positiveSwap', 'emptyState']) {
        assertTrue(typeof get(ui, k) === 'string' && get(ui, k).length > 0, `ui.${k} fehlt (${lang})`);
      }
      assertEqual(get(ui, 'errWideInvalidTrials'), undefined, `errWideInvalidTrials (${lang}) muss entfallen`);
      assertEqual(get(ui, 'actions'), undefined);
      assertEqual(get(ui, 'types'), undefined);
    }
    assertEqual(get(await loadJson('i18n/ui.de.json'), 'charts.sdtCriterion'), 'Kriterium c');
    assertEqual(get(await loadJson('i18n/ui.en.json'), 'charts.sdtCriterion'), 'Criterion c');
  });

  test('context-help: Felder, Zustand, Kommando und Result-Typedef in beiden Sprachen', async () => {
    for (const lang of ['de', 'en']) {
      const ch = await loadJson(`i18n/context-help.${lang}.json`);
      for (const f of FIELDS) {
        assertTrue(!!get(ch, `fields.${f}.help`), `fields.${f}.help fehlt (${lang})`);
      }
      assertTrue(!!get(ch, 'state.onlyDisputed.help'), `state.onlyDisputed.help fehlt (${lang})`);
      assertTrue(!!get(ch, 'actions.swapPositive.help'), `actions.swapPositive.help fehlt (${lang})`);
      for (const k of ['meta', 'perAppraiser', 'verdict', 'invalid', 'error']) {
        assertTrue(!!get(ch, `types.Result.${k}`), `types.Result.${k} fehlt (${lang})`);
      }
      for (const dead of ['types.Params', 'types.AgentRead', 'actions.read', 'actions.setParam',
        'actions.setColumn', 'actions.runAnalysis', 'actions.scheduleAnalysis', 'actions.clearResults']) {
        assertEqual(get(ch, dead), undefined, `${dead} (${lang}) muss entfallen`);
      }
    }
  });
});
