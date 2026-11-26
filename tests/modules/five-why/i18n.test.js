/**
 * 5-Why: Texte in resources/i18n/ui.<lang>.json — Invarianten des Models, die
 * gelesenen Texte der Ansicht und der Rückfrage in beiden Sprachen, ohne die
 * toten Schlüssel der Altform; Kontexthilfe für Felder, Kommandos und die
 * Kennzahlen der Statistik.
 */
import { suite, test, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/five-why/domain/model.js';

const MOD = '../../../js/modules/five-why/';
const LANGS = ['de', 'en'];

async function fetchJson(path) {
  const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

const ui = (lang) => fetchJson(`${MOD}resources/i18n/ui.${lang}.json`);
const help = (lang) => fetchJson(`${MOD}resources/i18n/context-help.${lang}.json`);
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;
/** @param {any} o @param {string} path */
const at = (o, path) => path.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);

const READ_KEYS = [
  'name', 'description', 'whenToUse', 'problem', 'problemPlaceholder', 'addWhy', 'addWhyN', 'addSubQuestion',
  'rootCause', 'rootCausePlaceholder', 'answerPlaceholder', 'collapse', 'expand', 'collapseAll', 'expandAll',
  'deleteConfirm', 'statsNodes', 'statsDepth', 'statsBranches', 'statsAnswered',
];

suite('five-why Texte in ui.<lang>.json', () => {
  test('ein Text je Invariante des Models, in DE und EN', async () => {
    const names = Object.keys(State.schema.invariants);
    assertDeepEqual(names, ['uniqueIds', 'parentLinks', 'knownCollapsed']);
    for (const lang of LANGS) {
      const { invariants } = await ui(lang);
      assertDeepEqual(Object.keys(invariants), names, lang);
      for (const n of names) assertTrue(nonEmpty(invariants[n]), `${lang} invariants.${n}`);
    }
  });

  test('die gelesenen Texte, in DE und EN; addWhyN mit {n}', async () => {
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const k of READ_KEYS) assertTrue(nonEmpty(t[k]), `${lang} ${k}`);
      assertTrue(t.addWhyN.includes('{n}'), `${lang} addWhyN`);
    }
  });

  test('ohne die toten Schlüssel der Altform und ohne die Agententexte', async () => {
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const k of [
        'questionPlaceholder', 'answer', 'delete', 'reset', 'resetConfirm', 'resetDone', 'emptyHint',
        'exportJSON', 'exportedJSON', 'actions', 'fields',
      ]) {
        assertTrue(!Object.hasOwn(t, k), `${lang} ${k}`);
      }
    }
  });
});

suite('five-why Kontexthilfe in context-help.<lang>.json', () => {
  test('Felder, Kommandos samt Parametern und command, Kennzahlen; in DE und EN', async () => {
    const keys = [
      'fields.problem.help', 'fields.nodes.help', 'fields.stats.help',
      ...['id', 'level', 'parentId', 'answer', 'children'].map((k) => `fields.nodes.${k}.help`),
      ...Object.entries(State.schema.commands).flatMap(([c, def]) => [
        `actions.${c}.help`, ...Object.keys(def.params).map((p) => `actions.${c}.params.${p}`),
      ]),
      ...['addRoot', 'addChild', 'setAnswer', 'removeNode'].map((c) => `actions.${c}.params.command`),
      ...['totalNodes', 'maxDepth', 'branches', 'answered'].map((k) => `types.FiveWhyStats.${k}`),
    ];
    for (const lang of LANGS) {
      const h = await help(lang);
      for (const k of keys) assertTrue(nonEmpty(at(h, k)), `${lang} ${k}`);
    }
  });

  test('der Text zu addChild nennt die Absage auf der Grundursachen-Ebene', async () => {
    assertTrue((await help('de')).actions.addChild.help.includes('Grundursachen-Ebene'));
    assertTrue((await help('en')).actions.addChild.help.includes('root-cause level'));
  });
});
