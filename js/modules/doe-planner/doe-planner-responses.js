/**
 * D.Mike — DoE Planner: response state of the linked datasheet (doe-planner-responses.js)
 *
 * Pure functions over (context, model). The datasheet lives in another
 * module's state, which Alpine cannot track; callers touch the shell's
 * revision counter (rev()) before calling so their view recomputes.
 */
import { readResponsesFromWorksheet, isWorksheetValid } from './doe-planner-worksheet.js';

/**
 * @param {object} context module context
 * @param {object} model a State
 * @returns {?{values: Array<Array<?number>>, complete: boolean, filledCount: number, totalCount: number}} null without a linked datasheet
 */
export function readResponses(context, model) {
  return model.worksheetRef ? readResponsesFromWorksheet(context, model.worksheetRef) : null;
}

/**
 * @param {object} context module context
 * @param {object} model a State
 * @returns {'unbound'|'bound'|'stale'} unbound without a valid datasheet; bound while it matches the design
 */
export function staleness(context, model) {
  if (!model.worksheetRef || !isWorksheetValid(context, model.worksheetRef)) return 'unbound';
  const cur = model.designSignature();
  const saved = model.worksheetRef.designSignature || null;
  if (cur && saved && cur === saved) return 'bound';
  return 'stale';
}

/**
 * @param {object} context module context
 * @param {object} model a State
 * @returns {number} filled response cells in percent, rounded
 */
export function boundPct(context, model) {
  const resp = readResponses(context, model);
  return resp && resp.totalCount > 0 ? Math.round(resp.filledCount / resp.totalCount * 100) : 0;
}

/**
 * @param {object} context module context
 * @param {object} model a State
 * @returns {boolean} every response cell of the linked datasheet is filled
 */
export function boundComplete(context, model) {
  const resp = readResponses(context, model);
  return Boolean(resp && resp.complete);
}
