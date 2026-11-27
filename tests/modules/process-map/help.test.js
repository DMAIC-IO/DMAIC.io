/**
 * Process Map Ressourcen: Handbuch je Sprache, Oberflächentexte und
 * Kontexthilfe für alle Kommandos und Felder des Models.
 */
import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import { helpDefFromFiles } from '../../../js/core/module-help-files.js';
import { State } from '../../../js/modules/process-map/domain/model.js';

const SECTION_IDS = ['overview', 'methodology', 'pitfalls'];
/** Kommandos des Models mit ihren Parametern, aus dem Schema. */
const COMMANDS = Object.fromEntries(Object.entries(State.schema.commands)
  .map(([name, def]) => [name, Object.keys(def.params ?? {})]));
/** Setter und Namen der Altform, die entfallen. */
const DEAD_ACTIONS = ['setStepTitle', 'setStepDescription', 'setIOName', 'setLoopCondition',
  'setLoopStepTitle', 'setSubstepTitle', 'setSubstepsExpanded'];
const DEAD_UI = ['addFirstStep', 'insertBefore', 'reset', 'resetConfirm', 'resetDone', 'exportJSON', 'exportCSV',
  'exportedJSON', 'exportedCSV', 'expandSubsteps', 'collapseSubsteps', 'unclassified', 'csvInputType', 'addLoop'];
const BASE = '../../../js/modules/process-map/resources/';
const FIELDS = ['steps', 'steps.title', 'steps.description', 'steps.valueType', 'steps.valueType.va',
  'steps.valueType.bnva', 'steps.valueType.nva', 'steps.inputs', 'steps.inputs.name', 'steps.inputs.inputType',
  'steps.inputs.inputType.param', 'steps.inputs.inputType.noise', 'steps.outputs', 'steps.outputs.name',
  'steps.substeps', 'steps.substeps.title', 'steps.loop', 'steps.loop.targetStepId', 'steps.loop.condition',
  'steps.loop.steps', 'steps.loop.steps.title', 'expanded'];
/** Strukturjargon, den verankerte Hilfesätze nicht nennen. */
const JARGON = /\bnull\b|\bkeys\b|targetStepId|inputType|valueType/;

async function loadJson(rel) {
  const res = await fetch(new URL(`${BASE}${rel}`, import.meta.url));
  if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
  const file = await res.json();
  delete file.$schema;
  return file;
}

const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const filled = (v) => typeof v === 'string' && v.trim().length > 0;

suite('Process Map: Handbuch aus help.<lang>.json', () => {
  test('die drei Abschnitte existieren mit DE- und EN-Inhalt', async () => {
    const def = helpDefFromFiles('process-map', {
      de: await loadJson('i18n/help.de.json'),
      en: await loadJson('i18n/help.en.json'),
    });
    assertEqual(Object.keys(def.sections).join(','), SECTION_IDS.join(','));
    for (const id of SECTION_IDS) {
      for (const lang of ['de', 'en']) {
        const localized = def.sections[id][lang];
        assertTrue(filled(localized?.title), `Abschnitt "${id}" (${lang}) ohne Titel`);
        assertTrue(Array.isArray(localized.blocks) && localized.blocks.length > 0, `Abschnitt "${id}" (${lang}) ohne Blöcke`);
      }
    }
  });
});

suite('Process Map: Oberflächentexte und Kontexthilfe', () => {
  test('ui: Pflichtschlüssel in beiden Sprachen, tote Schlüssel entfallen', async () => {
    for (const lang of ['de', 'en']) {
      const ui = await loadJson(`i18n/ui.${lang}.json`);
      for (const k of ['name', 'description', 'whenToUse', 'noLoop', 'loopTargetNotBefore', 'csvLoopTarget',
        'stepGrip', 'ioGrip', 'substepGrip', 'substepPlaceholder', 'addSubstep', 'substepsLabel',
        'importFromSipocDone', 'importFromSipocHint']) {
        assertTrue(filled(ui[k]), `ui.${k} fehlt (${lang})`);
      }
      for (const name of Object.keys(State.schema.invariants)) {
        assertTrue(filled(ui.invariants?.[name]), `ui.invariants.${name} fehlt (${lang})`);
      }
      for (const k of DEAD_UI) assertEqual(ui[k], undefined, `${k} (${lang}) muss entfallen`);
      assertEqual(ui.actions, undefined);
      assertEqual(ui.types, undefined);
      assertEqual(ui.fields, undefined);
    }
  });

  test('context-help: alle 18 Kommandos mit Parametern und command, alle Felder, ohne Strukturjargon', async () => {
    assertEqual(Object.keys(COMMANDS).length, 18);
    for (const lang of ['de', 'en']) {
      const ch = await loadJson(`i18n/context-help.${lang}.json`);
      for (const k of FIELDS) {
        const help = get(ch, `fields.${k}.help`);
        assertTrue(filled(help), `fields.${k}.help fehlt (${lang})`);
        assertTrue(!JARGON.test(help), `fields.${k}.help nennt Strukturjargon (${lang})`);
      }
      for (const [cmd, params] of Object.entries(COMMANDS)) {
        const help = get(ch, `actions.${cmd}.help`);
        assertTrue(filled(help), `actions.${cmd}.help fehlt (${lang})`);
        assertTrue(!JARGON.test(help), `actions.${cmd}.help nennt Strukturjargon (${lang})`);
        for (const p of [...params, 'command']) {
          assertTrue(filled(get(ch, `actions.${cmd}.params.${p}`)), `actions.${cmd}.params.${p} fehlt (${lang})`);
        }
      }
      for (const dead of DEAD_ACTIONS) assertEqual(get(ch, `actions.${dead}`), undefined, `${dead} (${lang})`);
    }
  });
});
