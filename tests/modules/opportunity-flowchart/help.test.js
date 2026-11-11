/**
 * D.Mike — Opportunity-Flowchart: Ressourcen aus den Moduldateien.
 *
 * Handbuch je Sprache (`resources/i18n/help.<lang>.json`), Oberflächentexte
 * und Kontexthilfe; geprüft werden die Form, die das Hilfe-Panel nach
 * `helpDefFromFiles` erwartet, und die Schlüssel, die die Umstellung braucht.
 */
import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import { helpDefFromFiles } from '../../../js/core/module-help-files.js';

const SECTION_IDS = ['overview', 'whenToUse', 'howToUse', 'valueClassification'];
const COMMANDS = {
  addStep: ['side', 'index'],
  removeStep: ['id'],
  moveStep: ['id', 'index', 'side'],
  setSide: ['id', 'side'],
  addSubstep: ['stepId'],
  removeSubstep: ['stepId', 'substepId'],
  moveSubstep: ['stepId', 'substepId', 'index'],
  setExpanded: ['id', 'expanded'],
  appendSteps: ['steps'],
};
const DEAD_ACTIONS = ['appendStep', 'insertAt', 'setStepTitle', 'setStepDescription',
  'setSubstepsExpanded', 'setSubstepTitle'];
const BASE = '../../../js/modules/opportunity-flowchart/resources/';

async function loadJson(rel) {
  const res = await fetch(new URL(`${BASE}${rel}`, import.meta.url));
  if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
  const { $schema, ...file } = await res.json();
  return file;
}

const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const filled = (v) => typeof v === 'string' && v.trim().length > 0;

suite('Opportunity-Flowchart: Handbuch aus help.<lang>.json', () => {
  test('die vier Abschnitte existieren mit DE- und EN-Inhalt', async () => {
    const def = helpDefFromFiles('opportunity-flowchart', {
      de: await loadJson('i18n/help.de.json'),
      en: await loadJson('i18n/help.en.json'),
    });
    assertEqual(Object.keys(def.sections).join(','), SECTION_IDS.join(','));
    for (const id of SECTION_IDS) {
      for (const lang of ['de', 'en']) {
        const localized = def.sections[id][lang];
        assertTrue(!!localized, `Abschnitt "${id}" hat keine "${lang}"-Fassung`);
        assertTrue(filled(localized.title), `Abschnitt "${id}" (${lang}) hat keinen Titel`);
        assertTrue(Array.isArray(localized.blocks) && localized.blocks.length > 0,
          `Abschnitt "${id}" (${lang}) hat keine Blöcke`);
      }
    }
  });

  test('howToUse beschreibt Griff und Tastatur statt HTML5-Drag', async () => {
    for (const lang of ['de', 'en']) {
      const text = JSON.stringify((await loadJson(`i18n/help.${lang}.json`)).sections.howToUse);
      assertTrue(text.includes('Escape'), `Escape fehlt (${lang})`);
      assertTrue(text.includes('←/→') && text.includes('↑/↓'), `Pfeiltasten fehlen (${lang})`);
      assertTrue(!text.includes('freie Fläche') && !text.includes('empty area'), `alter Drag-Text (${lang})`);
    }
  });

  test('deutsche Texte verwenden echte Unicode-Umlaute', async () => {
    const de = await loadJson('i18n/help.de.json');
    assertTrue(/[äöüÄÖÜß]/.test(JSON.stringify(de.sections.overview)), 'kein Umlaut im Aufbau-Abschnitt');
  });
});

suite('Opportunity-Flowchart: Oberflächentexte und Kontexthilfe', () => {
  test('ui: Schlüssel in beiden Sprachen, ohne den Bild-Export-Platzhalter', async () => {
    for (const lang of ['de', 'en']) {
      const ui = await loadJson(`i18n/ui.${lang}.json`);
      for (const k of ['name', 'description', 'whenToUse', 'titlePlaceholder', 'descriptionPlaceholder',
        'substepsLabel', 'substepPlaceholder', 'addSubstep', 'substepGrip', 'stepGrip', 'headerVA', 'headerNVA',
        'addStepVA', 'addStepNVA', 'deleteStep', 'emptyHint', 'insertHere', 'insertVA', 'insertNVA',
        'moveToVA', 'moveToNVA', 'importFrom', 'importTitle', 'importHint', 'importConfirm',
        'importEmptyHint', 'importDone']) {
        assertTrue(filled(ui[k]), `ui.${k} fehlt (${lang})`);
      }
      assertEqual(ui.exportImageComingSoon, undefined, `exportImageComingSoon (${lang}) muss entfallen`);
      assertEqual(ui.actions, undefined);
      assertEqual(ui.types, undefined);
    }
  });

  test('context-help: Felder und alle neun Kommandos mit Parametern, ohne tote Schlüssel', async () => {
    for (const lang of ['de', 'en']) {
      const ch = await loadJson(`i18n/context-help.${lang}.json`);
      for (const k of ['steps', 'steps.title', 'steps.description', 'steps.side', 'steps.side.va',
        'steps.side.nva', 'steps.substeps', 'steps.substeps.title']) {
        assertTrue(filled(get(ch, `fields.${k}.help`)), `fields.${k}.help fehlt (${lang})`);
      }
      for (const [cmd, params] of Object.entries(COMMANDS)) {
        assertTrue(filled(get(ch, `actions.${cmd}.help`)), `actions.${cmd}.help fehlt (${lang})`);
        for (const p of params) {
          assertTrue(filled(get(ch, `actions.${cmd}.params.${p}`)), `actions.${cmd}.params.${p} fehlt (${lang})`);
        }
      }
      for (const dead of DEAD_ACTIONS) assertEqual(get(ch, `actions.${dead}`), undefined, `${dead} (${lang})`);
      assertEqual(get(ch, 'types'), undefined, `types (${lang}) muss entfallen`);
    }
  });

  test('der Block modules.opportunity-flowchart ist aus der Kern-i18n entfernt', async () => {
    for (const lang of ['de', 'en']) {
      const res = await fetch(new URL(`../../../i18n/${lang}.json`, import.meta.url));
      assertEqual((await res.json()).modules['opportunity-flowchart'], undefined);
    }
  });
});
