/**
 * Attributtest: Texte in resources/i18n/ui.<lang>.json und
 * context-help.<lang>.json — Oberflächentexte der Altform ohne tote
 * Schlüssel, Kontexthilfe zu jedem Feld, Unterfeld, Kommando und Typ.
 */
import { suite, test, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/attribute-test/domain/model.js';
import { buildReport } from '../../../js/modules/attribute-test/domain/report.js';

const MOD = '../../../js/modules/attribute-test/';
const LANGS = ['de', 'en'];

/** @param {string} path @returns {Promise<any>} */
async function fetchJson(path) {
  const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

const ui = (lang) => fetchJson(`${MOD}resources/i18n/ui.${lang}.json`);
const contextHelp = (lang) => fetchJson(`${MOD}resources/i18n/context-help.${lang}.json`);
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;
const COMMANDS = ['setTableCell', 'setTableRowName', 'setTableColName', 'setPairCell', 'addRow', 'addCol',
  'removeRow', 'removeCol', 'checkEquivalence'];

/** Alle Knoten unter einem Schema-Objekt als Pfade. */
function shapePaths(spec, prefix = '') {
  const out = [];
  for (const [k, s] of Object.entries(spec.shape ?? {})) {
    out.push(prefix + k);
    if (s.kind === 'object') out.push(...shapePaths(s, `${prefix}${k}.`));
  }
  return out;
}

suite('attribute-test Texte in ui.<lang>.json', () => {
  test('Name, Beschreibung, Einsatz, Invarianten und Kennzahl-Hilfen; keine toten Schlüssel', async () => {
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const k of ['name', 'description', 'whenToUse', 'sectionTest', 'hintEnterCounts', 'decisionReject', 'actionCheckEquivalence']) {
        assertTrue(nonEmpty(t[k]), `${lang} ${k}`);
      }
      for (const k of ['tableShape', 'pairsShape']) assertTrue(nonEmpty(t.invariants[k]), `${lang} invariants.${k}`);
      assertDeepEqual(Object.keys(t.stats).sort(), ['assoc', 'equiv', 'mcnemar', 'one', 'rate1', 'rate2', 'two'], lang);
      for (const k of ['actions', 'fields', 'types', 'errDiff0']) assertTrue(!Object.hasOwn(t, k), `${lang} ${k}`);
    }
  });

  test('jeder Schlüssel, den ein Bericht nutzt, steht in de und en', async () => {
    const st = { direction: 'two-sided', alpha: 0.05, pooled: true, ratePooled: false };
    const reports = [
      buildReport(st, { ok: true, kind: 'two', x1: 30, n1: 400, x2: 18, n2: 380, groups: null, missing: 1 }),
      buildReport(st, { ok: true, kind: 'one', x: 0, n: 30, p0: 0.1, missing: 0 }),
      buildReport(st, { ok: true, kind: 'rate1', x: 0, t: 10, lambda0: 0.2, missing: 0 }),
      buildReport(st, { ok: true, kind: 'rate2', x1: 12, t1: 100, x2: 5, t2: 110, diff0: 0, groups: null, missing: 0 }),
      buildReport(st, { ok: true, kind: 'mcnemar', table: [[20, 4], [1, 18]], labels: { before: 'a', after: '' }, missing: 0 }),
      buildReport(st, { ok: true, kind: 'equiv', samples: 1, x: 8, n: 100, p0: 0.05, lower: -0.01, upper: 0.01 }),
      buildReport(st, { ok: true, kind: 'assoc', rows: ['A', 'B', 'C'], cols: ['X', 'Y'], counts: [[1, 2], [0, 0], [3, 9]], missing: 0 }),
    ];
    const keys = new Set(['hintEnterCounts', 'hintPickColumns', 'errCountInvalid', 'errNZero', 'errXGreaterN', 'errP0Range',
      'errExposure', 'errLambda0', 'errPairsLength', 'errPairLevels', 'errResponseLevels', 'errGroupLevels', 'errTableTooSmall',
      'hintEnterBounds', 'errBoundsOrder', 'errBoundsContain', 'errBoundsContainOne', 'noteRateNotTestable', 'noteNoDiscordant',
      'noteEquivDegenerate', 'decisionReject', 'decisionKeep', 'decisionEquivalent', 'decisionNotEquivalent']);
    for (const r of reports) {
      keys.add(r.basisKey);
      r.stats.forEach((s) => keys.add(s.labelKey));
      r.notes.forEach((n) => keys.add(n.key));
      (r.actions || []).forEach((a) => keys.add(a.key));
    }
    for (const lang of LANGS) {
      const t = await ui(lang);
      assertDeepEqual([...keys].filter((k) => !nonEmpty(t[k])), [], lang);
    }
  });
});

suite('attribute-test Kontexthilfe in context-help.<lang>.json', () => {
  test('jedes Feld, jedes Unterfeld und jede Ableitung hat einen Hilfetext', async () => {
    const top = [...Object.keys(State.schema.fields), 'exampleWorksheetId', 'activeParams', 'activeColumnSlots', 'eventValueOptions', 'effectiveEventValue', 'result'];
    const nested = ['equiv', 'summary', 'colRefs'].flatMap((f) => shapePaths(State.schema.fields[f], `${f}.`));
    for (const lang of LANGS) {
      const { fields } = await contextHelp(lang);
      assertDeepEqual(Object.keys(fields).sort(), [...top].sort(), lang);
      for (const path of [...top, ...nested]) {
        const node = path.split('.').reduce((n, k) => n?.[k], fields);
        assertTrue(nonEmpty(node?.help), `${lang} fields.${path}`);
      }
    }
  });

  test('jedes Kommando mit Hilfe, params.command und Parametern', async () => {
    for (const lang of LANGS) {
      const { actions } = await contextHelp(lang);
      assertDeepEqual(Object.keys(actions).sort(), [...COMMANDS].sort(), lang);
      for (const c of COMMANDS) {
        assertTrue(nonEmpty(actions[c].help) && nonEmpty(actions[c].params.command), `${lang} ${c}`);
        const params = Object.keys(State.schema.commands[c].params ?? {});
        for (const p of params) assertTrue(nonEmpty(actions[c].params[p]), `${lang} ${c}.${p}`);
      }
    }
  });

  test('Typen ohne Params; Result kennt status, reason, hint, message', async () => {
    for (const lang of LANGS) {
      const { types } = await contextHelp(lang);
      assertTrue(!Object.hasOwn(types, 'Params'), lang);
      for (const k of ['status', 'reason', 'hint', 'message', 'kind', 'stats', 'decision']) assertTrue(nonEmpty(types.Result[k]), `${lang} ${k}`);
      for (const t of ['Stat', 'Note', 'Warning', 'CrossTable', 'CrossRow', 'CrossCell', 'Action']) assertTrue(!!types[t], `${lang} ${t}`);
    }
  });

  test('kein „null“ in den Feldtexten', async () => {
    for (const lang of LANGS) {
      const { fields } = await contextHelp(lang);
      assertTrue(!/\bnull\b/.test(JSON.stringify(fields)), lang);
    }
  });
});
