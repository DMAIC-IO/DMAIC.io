/**
 * Datentransformation: Texte in resources/i18n/ui.<lang>.json und
 * context-help.<lang>.json — Namen und Beschreibungen der Transformationen,
 * Beschriftungen der Parameter, Fehlertexte; Kontexthilfe zu jedem Feld,
 * jedem Parameter jeder Transformation, den Läufen, dem Kommando und den
 * Typschlüsseln; ohne die toten Schlüssel und Agententexte der Altform.
 */
import { suite, test, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/data-transformation/domain/model.js';
import { TRANSFORMS, PARAMS_SHAPE } from '../../../js/modules/data-transformation/domain/transforms.js';

const MOD = '../../../js/modules/data-transformation/';
const LANGS = ['de', 'en'];

async function fetchJson(path) {
  const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}
const ui = (lang) => fetchJson(`${MOD}resources/i18n/ui.${lang}.json`);
const contextHelp = (lang) => fetchJson(`${MOD}resources/i18n/context-help.${lang}.json`);
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;
const ERRORS = ['errBoxCoxPositive', 'errLogPositive', 'errLog10Positive', 'errSqrtNonNeg', 'errInverseZero', 'errJohnsonSBRange'];

suite('data-transformation Texte in ui.<lang>.json', () => {
  test('Name, Beschreibung, Einsatz, je Transformation Name und Beschreibung, je Parameter die Beschriftung, Fehler', async () => {
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const k of ['name', 'description', 'whenToUse', 'sentToWorksheet', 'selectTarget', 'targetUnavailable',
        'warnBoxCoxFallback', 'copied', 'nothingToCopy', 'copyFailed', 'original', 'transformed', ...ERRORS]) {
        assertTrue(nonEmpty(t[k]), `${lang} ${k}`);
      }
      for (const tf of TRANSFORMS) {
        assertTrue(nonEmpty(t[tf.nameKey]) && nonEmpty(t[tf.descKey]), `${lang} ${tf.id}`);
        for (const p of tf.params) assertTrue(nonEmpty(t[p.labelKey]), `${lang} ${tf.id}.${p.key}`);
      }
    }
  });

  test('ohne die toten Schlüssel der Altform und ohne die Agententexte', async () => {
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const k of ['run', 'errNoColumn', 'errMinData', 'downloadCSV', 'newColumn', 'actions', 'fields', 'types']) {
        assertTrue(!Object.hasOwn(t, k), `${lang} ${k}`);
      }
    }
  });
});

suite('data-transformation Kontexthilfe in context-help.<lang>.json', () => {
  test('jedes Feld, jedes Ansichtsfeld und jede Ableitung hat einen Hilfetext', async () => {
    const names = [...Object.keys(State.schema.fields), ...Object.keys(State.schema.view), ...Object.keys(State.schema.derived)];
    for (const lang of LANGS) {
      const { fields } = await contextHelp(lang);
      for (const n of names) assertTrue(nonEmpty(fields[n]?.help), `${lang} fields.${n}`);
    }
  });

  test('jeder Parameter jeder Transformation hat einen Hilfetext', async () => {
    for (const lang of LANGS) {
      const { fields } = await contextHelp(lang);
      assertDeepEqual(Object.keys(fields.params).filter((k) => k !== 'help'), Object.keys(PARAMS_SHAPE), lang);
      for (const [tf, s] of Object.entries(PARAMS_SHAPE)) {
        assertTrue(nonEmpty(fields.params[tf].help), `${lang} ${tf}`);
        for (const p of Object.keys(s.shape)) assertTrue(nonEmpty(fields.params[tf][p]?.help), `${lang} ${tf}.${p}`);
      }
    }
  });

  test('Läufe analysis und toWorksheet, Kommando copyExport, toWorksheet unter actions', async () => {
    for (const lang of LANGS) {
      const { actions, asyncTasks } = await contextHelp(lang);
      assertDeepEqual(Object.keys(actions), ['toWorksheet', 'copyExport'], lang);
      assertTrue(nonEmpty(actions.toWorksheet.params.command), `${lang} toWorksheet.params.command`);
      assertTrue(nonEmpty(actions.copyExport.help) && nonEmpty(actions.copyExport.params.command), `${lang} copyExport`);
      assertDeepEqual(Object.keys(asyncTasks), ['analysis', 'toWorksheet'], lang);
      assertTrue(nonEmpty(asyncTasks.analysis.help) && nonEmpty(asyncTasks.analysis.cancel.help), `${lang} analysis`);
      assertTrue(nonEmpty(asyncTasks.toWorksheet.help) && nonEmpty(asyncTasks.toWorksheet.params.target)
        && nonEmpty(asyncTasks.toWorksheet.cancel.help), `${lang} toWorksheet`);
    }
  });

  test('Typschlüssel von Result, Descriptives und TargetColumn', async () => {
    for (const lang of LANGS) {
      const { types } = await contextHelp(lang);
      assertDeepEqual(Object.keys(types.Result), ['n', 'transform', 'params', 'original', 'transformed'], lang);
      assertDeepEqual(Object.keys(types.Descriptives),
        ['mean', 'std', 'median', 'skewness', 'kurtosis', 'min', 'max', 'adStatAdj', 'adPValue', 'normal'], lang);
      assertDeepEqual(Object.keys(types.TargetColumn), ['key', 'name'], lang);
    }
  });

  test('keine entfallenen Aktionen und Lesefelder der Altform', async () => {
    for (const lang of LANGS) {
      const all = JSON.stringify(await contextHelp(lang));
      for (const word of ['selectTF', 'setColumn', 'setParam', 'runAnalysis', 'errorMsg', 'pickableColumns', '"transforms"', '"result"', '"Params"']) {
        assertTrue(!all.includes(word), `${lang} „${word}“`);
      }
    }
  });
});
