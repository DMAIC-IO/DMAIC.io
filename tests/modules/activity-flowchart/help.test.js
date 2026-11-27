/**
 * Activity-Flowchart: Handbuch und Kontexthilfe aus den Moduldateien
 * (`resources/i18n/help.<lang>.json`, `context-help.<lang>.json`).
 */
import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import { helpDefFromFiles } from '../../../js/core/module-help-files.js';
import { State } from '../../../js/modules/activity-flowchart/domain/model.js';

const SECTION_IDS = ['overview', 'whenToUse', 'howToUse', 'noBranchBand', 'reworkLoops'];
const COMMANDS = Object.fromEntries(Object.entries(State.schema.commands)
  .map(([name, def]) => [name, Object.keys(def.params ?? {})]));
const DEAD_ACTIONS = ['read', 'appendStep', 'insertInBand', 'addActivityToBand', 'addDecisionToBand', 'insertAtMenu',
  'setStepTitle', 'setStepDescription', 'setDecisionLabel', 'setSubstepTitle', 'setSubstepsExpanded'];
const BASE = '../../../js/modules/activity-flowchart/resources/';

async function loadJson(rel) {
  const res = await fetch(new URL(`${BASE}${rel}`, import.meta.url));
  if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
  const { $schema: _schema, ...file } = await res.json();
  return file;
}

const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const filled = (v) => typeof v === 'string' && v.trim().length > 0;

suite('Activity-Flowchart: Handbuch aus help.<lang>.json', () => {
  test('die fünf Abschnitte existieren mit DE- und EN-Inhalt', async () => {
    const def = helpDefFromFiles('activity-flowchart', {
      de: await loadJson('i18n/help.de.json'),
      en: await loadJson('i18n/help.en.json'),
    });
    assertEqual(Object.keys(def.sections).join(','), SECTION_IDS.join(','));
    for (const id of SECTION_IDS) {
      for (const lang of ['de', 'en']) {
        const localized = def.sections[id][lang];
        assertTrue(!!localized, `Abschnitt "${id}" hat keine "${lang}"-Fassung`);
        assertTrue(filled(localized.title), `Abschnitt "${id}" (${lang}) hat keinen Titel`);
        assertTrue(Array.isArray(localized.blocks) && localized.blocks.length > 0, `Abschnitt "${id}" (${lang}) ohne Blöcke`);
      }
    }
  });

  test('howToUse und noBranchBand beschreiben Griff, Tastatur und den Einstieg-Knopf (A16)', async () => {
    for (const lang of ['de', 'en']) {
      const { sections } = await loadJson(`i18n/help.${lang}.json`);
      const how = JSON.stringify(sections.howToUse);
      assertTrue(how.includes('Escape') && how.includes('←/→') && how.includes('↑/↓') && how.includes('Enter'), `Tastatur (${lang})`);
      assertTrue(how.includes('✕'), `✕ (${lang})`);
      const all = JSON.stringify(sections);
      assertTrue(!all.includes('Target-Picker') && !all.includes('target picker'), `alter Picker (${lang})`);
      assertTrue(!all.includes('Nächster Schritt') && !all.includes('"next step"'), `Ziel „nächster Schritt“ (${lang})`);
    }
  });

  test('deutsche Texte verwenden echte Unicode-Umlaute', async () => {
    const de = await loadJson('i18n/help.de.json');
    assertTrue(/[äöüÄÖÜß]/.test(JSON.stringify(de.sections.overview)), 'kein Umlaut im Aufbau-Abschnitt');
  });
});

suite('Activity-Flowchart: Kontexthilfe', () => {
  test('Felder samt derived bands und alle Kommandos des Models mit Parametern, ohne tote Schlüssel', async () => {
    assertEqual(Object.keys(COMMANDS).length, 10);
    for (const lang of ['de', 'en']) {
      const ch = await loadJson(`i18n/context-help.${lang}.json`);
      for (const k of ['steps', 'steps.title', 'steps.description', 'steps.kind', 'steps.branchId', 'steps.decision',
        'steps.decision.label', 'steps.decision.noTarget', 'steps.substeps', 'steps.substeps.title', 'expanded',
        'bands', 'bands.id', 'bands.ownerId', 'bands.label', 'bands.depth']) {
        assertTrue(filled(get(ch, `fields.${k}.help`)), `fields.${k}.help fehlt (${lang})`);
      }
      for (const [cmd, params] of Object.entries(COMMANDS)) {
        assertTrue(filled(get(ch, `actions.${cmd}.help`)), `actions.${cmd}.help fehlt (${lang})`);
        assertTrue(filled(get(ch, `actions.${cmd}.params.command`)), `actions.${cmd}.params.command fehlt (${lang})`);
        for (const p of params) {
          assertTrue(filled(get(ch, `actions.${cmd}.params.${p}`)), `actions.${cmd}.params.${p} fehlt (${lang})`);
        }
      }
      for (const dead of DEAD_ACTIONS) assertEqual(get(ch, `actions.${dead}`), undefined, `${dead} (${lang})`);
      assertEqual(get(ch, 'types'), undefined, `types (${lang}) muss entfallen`);
    }
  });

  test('Feldhilfen nennen kein keys und kein null', async () => {
    for (const lang of ['de', 'en']) {
      const fields = JSON.stringify((await loadJson(`i18n/context-help.${lang}.json`)).fields);
      assertTrue(!/\bkeys\b/.test(fields) && !/\bnull\b/.test(fields), `Strukturjargon (${lang})`);
    }
  });
});
