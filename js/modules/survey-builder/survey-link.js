/**
 * D.Mike — Survey hand-over (survey-link.js)
 *
 * The only file that knows the state shapes of other modules: worksheet
 * (DataGrid workbook), kano and voc-ctx-tree. Everything here is a pure
 * snapshot builder; the module writes the result via stateManager.
 *
 * Spec: docs/superpowers/specs/2026-10-10-survey-builder-design.md §6.2, §8
 */

import { uid } from '../../core/uid.js';

export { treePhaseForCycle } from '../voc-ctx-tree/voc-ctx-tree-phase.js';

/**
 * Workbook state for a new worksheet instance (DataGrid format, same shape
 * as doe-planner-worksheet.js builds).
 * @param {Array<{name: string, type: 'numeric'|'text', role: string, values: Array}>} columns
 * @param {string} sheetName
 * @returns {{sheets: object[], activeSheetId: string, sheetCounter: number}}
 */
export function buildWorksheetState(columns, sheetName) {
  const rowCount = columns.reduce((m, c) => Math.max(m, c.values.length), 0);
  const cols = columns.map((c, i) => ({
    id: uid(),
    name: c.name,
    shortName: `C${i + 1}`,
    type: c.type,
    unit: '',
    values: c.values.slice(),
    formulas: new Array(rowCount).fill(null),
    format: {},
    role: c.role,
    roleManual: true,
  }));
  return {
    sheets: [{
      id: 'sheet_1',
      name: sheetName,
      state: { columns: cols, rowCount, colWidths: {}, sortCol: null, sortDir: null, selection: null },
    }],
    activeSheetId: 'sheet_1',
    sheetCounter: 1,
  };
}

/**
 * All instances of a module across all phases of the project.
 * @param {object|null} stateManager
 * @param {string} moduleId
 * @returns {Array<{instanceId: string, phase: string, state: object|null}>}
 */
export function listInstances(stateManager, moduleId) {
  if (!stateManager) return [];
  const out = [];
  for (const [phase, list] of Object.entries(stateManager.get('phases') || {})) {
    if (!Array.isArray(list)) continue;
    for (const inst of list) {
      if (inst?.moduleId === moduleId) {
        out.push({ instanceId: inst.instanceId, phase, state: stateManager.getModuleState(inst.instanceId) });
      }
    }
  }
  return out;
}

/**
 * Kano state after handing one kano question over (spec §8.1). Snapshot,
 * not a live link. Entries carry `origin`; a repeat hand-over replaces only
 * entries with the same origin and keeps manual ones with their answers.
 * @param {object|null} target existing kano state, null for a new instance
 * @param {{surveyInstanceId: string, question: object, responses: object[],
 *          recipients: Array<{id: string, name: string}>, anonymous: boolean,
 *          respondentLabel: (n: number) => string}} input
 * @returns {object} persisted kano state
 */
export function kanoStateFromSurvey(target, input) {
  const { surveyInstanceId, question, responses, recipients, anonymous, respondentLabel } = input;
  const base = target && typeof target === 'object' ? JSON.parse(JSON.stringify(target)) : {};
  const origin = { surveyInstanceId, questionId: question.id };
  const ours = (x) => x?.origin?.surveyInstanceId === surveyInstanceId && x.origin.questionId === question.id;

  const keptItems = (base.items || []).filter((i) => !ours(i));
  const keptRespondents = (base.respondents || []).filter((r) => !ours(r));
  const keptItemIds = new Set(keptItems.map((i) => i.id));

  const itemIdByRow = new Map();
  const items = question.rows.map((row) => {
    const id = uid();
    itemIdByRow.set(row.id, id);
    return { id, nodeId: null, label: row.text, path: '', missing: false, origin: { ...origin } };
  });

  const names = new Map(recipients.map((r) => [r.id, r.name]));
  const answering = responses.filter((r) => r.answers?.[question.id] && typeof r.answers[question.id] === 'object');
  const respondents = answering.map((r, i) => ({
    id: uid(),
    name: (!anonymous && names.get(r.recipientId)) || respondentLabel(i + 1),
    origin: { ...origin },
  }));

  const answers = {};
  for (const r of keptRespondents) {
    const old = base.answers?.[r.id] || {};
    answers[r.id] = Object.fromEntries(Object.entries(old).filter(([itemId]) => keptItemIds.has(itemId)));
  }
  answering.forEach((resp, i) => {
    const byItem = {};
    for (const row of question.rows) {
      const a = resp.answers[question.id][row.id];
      if (a && typeof a === 'object') byItem[itemIdByRow.get(row.id)] = { f: a.f ?? null, d: a.d ?? null, w: a.w ?? null };
    }
    answers[respondents[i].id] = byItem;
  });

  const allRespondents = [...keptRespondents, ...respondents];
  return {
    source: base.source ? { instanceId: base.source.instanceId ?? null, level: base.source.level || 'need' } : { instanceId: null, level: 'need' },
    options: { importance: Boolean(question.importance) },
    items: [...keptItems, ...items],
    respondents: allRespondents,
    answers,
    activeRespondentId: allRespondents.some((r) => r.id === base.activeRespondentId)
      ? base.activeRespondentId
      : (allRespondents[0]?.id ?? null),
  };
}

/**
 * VoC entries for the tree from selected free-text answers (spec §8.2).
 * @param {Array<{text: string, name: string}>} entries
 * @param {string} sourceLabel e.g. 'Fragebogen „Kundenbefragung“'
 * @param {boolean} anonymous
 * @returns {Array<{id: string, text: string, source: string, needs: []}>}
 */
export function vocsFromAnswers(entries, sourceLabel, anonymous) {
  return entries.map((e) => ({
    id: uid(),
    text: e.text,
    source: !anonymous && e.name ? `${sourceLabel}, ${e.name}` : sourceLabel,
    needs: [],
  }));
}

/**
 * Append VoCs to a persisted voc-ctx-tree state (or create one).
 * @param {object|null} treeState
 * @param {object[]} vocs
 * @returns {object}
 */
export function appendVocs(treeState, vocs) {
  const base = treeState && typeof treeState === 'object' ? JSON.parse(JSON.stringify(treeState)) : {};
  const existing = Array.isArray(base.vocs) ? base.vocs : [];
  return {
    ...base,
    vocs: [...existing, ...JSON.parse(JSON.stringify(vocs))],
    activeVocId: base.activeVocId || vocs[0]?.id || null,
  };
}
