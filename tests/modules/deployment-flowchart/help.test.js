/**
 * Deployment-Flowchart: Handbuch und Kontexthilfe aus den Moduldateien
 * (`resources/i18n/help.<lang>.json`, `context-help.<lang>.json`) — die Form,
 * die das Hilfe-Panel nach `helpDefFromFiles` erwartet, und die Schlüssel,
 * die die Umstellung braucht.
 */
import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import { helpDefFromFiles } from '../../../js/core/module-help-files.js';
import { State } from '../../../js/modules/deployment-flowchart/domain/model.js';

const SECTION_IDS = ['overview', 'whenToUse', 'howToUse', 'lanes'];
/** Kommandos des Models mit ihren Parametern, aus dem Schema. */
const COMMANDS = Object.fromEntries(Object.entries(State.schema.commands)
  .map(([name, def]) => [name, Object.keys(def.params ?? {})]));
const DEAD_ACTIONS = ['addStepUnassigned', 'insertBefore', 'addLaneInline', 'removeLaneById', 'setLaneName',
  'setStepTitle', 'setStepDescription', 'setSubstepTitle', 'setSubstepsExpanded'];
const BASE = '../../../js/modules/deployment-flowchart/resources/';

async function loadJson(rel) {
  const res = await fetch(new URL(`${BASE}${rel}`, import.meta.url));
  if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
  const { $schema: _schema, ...file } = await res.json();
  return file;
}

const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const filled = (v) => typeof v === 'string' && v.trim().length > 0;

suite('Deployment-Flowchart: Handbuch aus help.<lang>.json', () => {
  test('die vier Abschnitte existieren mit DE- und EN-Inhalt', async () => {
    const def = helpDefFromFiles('deployment-flowchart', {
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

  test('howToUse beschreibt die kombinierte Geste und die Tastatur', async () => {
    for (const lang of ['de', 'en']) {
      const text = JSON.stringify((await loadJson(`i18n/help.${lang}.json`)).sections.howToUse);
      assertTrue(text.includes('Escape'), `Escape fehlt (${lang})`);
      assertTrue(text.includes('←/→') && text.includes('↑/↓'), `Pfeiltasten fehlen (${lang})`);
      assertTrue(!text.includes('auf einen Pfeil zwischen') && !text.includes('on an arrow between'), `alte Ablegeregel (${lang})`);
    }
  });

  test('deutsche Texte verwenden echte Unicode-Umlaute', async () => {
    const de = await loadJson('i18n/help.de.json');
    assertTrue(/[äöüÄÖÜß]/.test(JSON.stringify(de.sections.overview)), 'kein Umlaut im Aufbau-Abschnitt');
  });
});

suite('Deployment-Flowchart: Kontexthilfe', () => {
  test('Felder und alle Kommandos des Models mit Parametern, ohne tote Schlüssel', async () => {
    assertEqual(Object.keys(COMMANDS).length, 11);
    for (const lang of ['de', 'en']) {
      const ch = await loadJson(`i18n/context-help.${lang}.json`);
      for (const k of ['steps', 'steps.title', 'steps.description', 'steps.laneId', 'steps.substeps',
        'steps.substeps.title', 'lanes', 'lanes.name', 'expanded']) {
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
