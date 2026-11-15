/**
 * D.Mike — Survey builder: view part "results" (viewmodel/results.js)
 *
 * The evaluation part of the results tab: the filter, the summary (response
 * rate, ranking of the rating rows, Kano overview, free texts), the group
 * comparison and one block per question with its table and its answers.
 * The figures come from the model's `results` (filter and grouping already
 * applied); this part only words and formats them. Filter and grouping run
 * the model commands `setFilter` and `setGroupBy`; the open ranking is UI
 * state (`state.rankingOpen`). Kano categories take the module's own
 * `kano.cat*` texts.
 */
import { runUiCommand } from '../../../core/command-directives.js';
import { documentOrder, findQuestion } from '../domain/conditions.js';
import { otherKey } from '../domain/stats.js';
import { catLabel, fmtNum, fmtPct, localeOf, optionText, questionLabel, recipientName } from '../domain/labels.js';

/** „Top-Prioritäten“ shows this many rows until opened. */
const RANKING_TOP = 10;

/**
 * @typedef {import('../domain/results.js').QuestionStat} QuestionStat
 * @typedef {{ key: string, question: any, title: string, nLine: string, stats: QuestionStat & Record<string, any> }} Block
 * @typedef {{ key: string, text: string, name: string }} AnswerRow
 */

/** @type {import('./state.types.js').SurveyBuilderViewFn} */
export const resultsView = (ctx) => ({
  /** @param {string|null} code Kano category code @returns {string} its label from `kano.cat*` */
  kanoCategory(code) { return catLabel(code, (key) => this.t(`kano.${key}`)); },

  /** @param {number|null} value @param {number} decimals @returns {string} localised, '—' when empty */
  num(value, decimals) { return fmtNum(value, decimals, localeOf(ctx.i18n)); },

  /**
   * Runs a model command of the evaluation; a failure is logged and reported.
   * @param {'setFilter'|'setGroupBy'} name @param {object} args
   * @returns {Promise<boolean>} whether it ran
   */
  async runResultsCommand(name, args) {
    const r = await runUiCommand(this._ui, name, args);
    if (r.ok) return true;
    if ('error' in r) {
      console.warn(`[survey-builder] ${name} failed`, r.error);
      ctx.notify(this.t('commandFailed'), 'error');
    }
    return false;
  },

  // ── Filter ────────────────────────────────────────────────

  /** @returns {Array<{ value: string, label: string }>} one entry per option of a single or multiple choice */
  get filterOptions() {
    const survey = this.model.survey;
    const out = [];
    for (const { question: q } of documentOrder(survey)) {
      if (q.type !== 'single' && q.type !== 'multi') continue;
      for (const o of q.options) {
        out.push({ value: `${q.id}|${o.id}`, label: this.t('filterOption', { question: questionLabel(survey, q, this.t), option: optionText(o, this.t) }) });
      }
    }
    return out;
  },

  /** @returns {string} select value of the active filter, '' = none */
  get filterValue() {
    const f = this.results.filter;
    return f ? `${f.questionId}|${f.optionId}` : '';
  },

  /** @param {string} value @returns {boolean} it is the active filter */
  isFilterValue(value) { return this.filterValue === value; },

  /**
   * The filter select changed: `questionId|optionId`, or '' for all responses.
   * @param {Event} $event @returns {Promise<void>}
   */
  async filterChanged($event) {
    const el = /** @type {HTMLSelectElement} */ ($event.target);
    const [questionId, optionId] = el.value.split('|');
    const ok = await this.runResultsCommand('setFilter', optionId ? { questionId, optionId } : { questionId: null, optionId: null });
    if (!ok) el.value = this.filterValue;
  },

  /** @returns {string} „n = …“ under the filter */
  get nLine() { return this.t('report.nResponses', { n: this.results.n }); },

  // ── Summary ───────────────────────────────────────────────

  /** „3 verschickt · 2 beantwortet (67 %)“ — over all responses. @returns {string} */
  get rateLine() {
    const r = this.results.responseRate;
    return this.t('report.rateLine', { sent: r.sent, answered: r.answered, rate: fmtPct(r.rate) });
  },

  /** @returns {boolean} responses exist that no recipient owns */
  get hasWithoutRecipient() { return this.results.responseRate.withoutRecipient > 0; },

  /** @returns {string} „2 Antworten ohne Empfänger“ */
  get withoutRecipientLine() { return this.t('report.withoutRecipient', { count: this.results.responseRate.withoutRecipient }); },

  /** The group table only pays off with more than one group. @returns {boolean} */
  get hasRateGroups() { return this.results.responseRate.groups.length > 1; },

  /** @returns {Array<{ key: string, group: string, sent: number, answered: number, rate: string }>} */
  get rateGroups() {
    return this.results.responseRate.groups.map((g) => ({
      key: g.group || '__none', group: g.group || this.t('report.groupNone'), sent: g.sent, answered: g.answered, rate: fmtPct(g.rate),
    }));
  },

  /** @returns {boolean} at least one ranked rating row */
  get hasRanking() { return this.results.ratingRanking.length > 0; },

  /** @returns {Array<{ key: string, text: string, n: number, mean: string, top: string }>} best first, ten until opened */
  get rankingRows() {
    const all = this.results.ratingRanking;
    const rows = this.state.rankingOpen ? all : all.slice(0, RANKING_TOP);
    return rows.map((r) => ({ key: `${r.questionId}:${r.rowId}`, text: r.text, n: r.n, mean: this.num(r.mean, 2), top: fmtPct(r.topShare) }));
  },

  /** @returns {boolean} more rows than the first ten */
  get hasMoreRanking() { return this.results.ratingRanking.length > RANKING_TOP; },

  /** Opens or closes the ranking. */
  toggleRanking() { this.state.rankingOpen = !this.state.rankingOpen; },

  /** @returns {string} label of the open/close button */
  get rankingToggleLabel() {
    return this.state.rankingOpen
      ? this.t('rankingTop', { count: RANKING_TOP })
      : this.t('rankingAll', { count: this.results.ratingRanking.length });
  },

  /** @returns {boolean} at least one Kano row */
  get hasKanoOverview() { return this.results.kanoOverview.length > 0; },

  /** @returns {Array<{ key: string, text: string, category: string, cs: string, ds: string }>} */
  get kanoOverviewRows() {
    return this.results.kanoOverview.map((k) => ({
      key: `${k.questionId}:${k.rowId}`, text: k.text, category: this.kanoCategory(k.category), cs: this.num(k.cs, 2), ds: this.num(k.ds, 2),
    }));
  },

  /** „5 offene Antworten, 2 in den VoC-Baum übernommen“ @returns {string} */
  get freeTextLine() { return this.t('report.freeText', this.results.freeText); },

  // ── Group comparison ──────────────────────────────────────

  /** @returns {Array<{ value: string, label: string }>} the single choice questions */
  get groupByOptions() {
    const survey = this.model.survey;
    return documentOrder(survey)
      .filter(({ question: q }) => q.type === 'single')
      .map(({ question: q }) => ({ value: q.id, label: questionLabel(survey, q, this.t) }));
  },

  /** @param {string} value question id, '' for none @returns {boolean} it is the active grouping */
  isGroupBy(value) { return (this.results.groupBy || '') === value; },

  /**
   * The grouping select changed: a question id, or '' for none.
   * @param {Event} $event @returns {Promise<void>}
   */
  async groupByChanged($event) {
    const el = /** @type {HTMLSelectElement} */ ($event.target);
    const ok = await this.runResultsCommand('setGroupBy', { questionId: el.value || null });
    if (!ok) el.value = this.results.groupBy || '';
  },

  /** @returns {boolean} a comparison is shown */
  get hasComparison() { return this.results.groupComparison !== null; },

  /** @returns {string} heading of the comparison, '' without grouping */
  get groupsTitle() {
    const id = this.results.groupBy;
    if (!id) return '';
    return this.t('report.groupsTitle', { question: questionLabel(this.model.survey, findQuestion(this.model.survey, id), this.t) });
  },

  /** @returns {Array<{ id: string, label: string }>} „Handel (n = 3, wenig Antworten)“ */
  get groupHeads() {
    const cmp = this.results.groupComparison;
    if (!cmp) return [];
    return cmp.groups.map((g) => ({ id: g.id, label: this.t(g.few ? 'groupHeadFew' : 'groupHead', { group: g.text, n: g.n }) }));
  },

  /**
   * The comparison of every question in one shape: rows with a label, a
   * note and one cell per group.
   * @returns {Array<{ key: string, questionId: string, title: string, chart: boolean,
   *   rows: Array<{ key: string, label: string, note: string, differs: boolean,
   *     cells: Array<{ key: string, text: string, deviates: boolean }> }> }>}
   */
  get comparisonParts() {
    const cmp = this.results.groupComparison;
    if (!cmp) return [];
    const survey = this.model.survey;
    /** @param {number} i @returns {string} */
    const groupId = (i) => cmp.groups[i].id;
    return cmp.questions.map((/** @type {any} */ part) => {
      let rows;
      if (part.type === 'rating') {
        rows = part.rows.map((/** @type {any} */ row) => ({
          key: row.id, label: row.text, differs: false,
          note: this.t('overallMean', { mean: this.num(row.overall, 2) }),
          cells: row.cells.map((/** @type {any} */ c, /** @type {number} */ i) => ({ key: groupId(i), text: this.num(c.mean, 2), deviates: c.deviates })),
        }));
      } else if (part.type === 'kano') {
        rows = part.rows.map((/** @type {any} */ row) => ({
          key: row.id, label: row.text, differs: row.differs,
          note: row.differs ? this.t('report.differs') : '',
          cells: row.categories.map((/** @type {string|null} */ c, /** @type {number} */ i) => ({ key: groupId(i), text: this.kanoCategory(c), deviates: false })),
        }));
      } else {
        rows = part.options.map((/** @type {any} */ o) => ({
          key: o.id, label: o.text, differs: false, note: '',
          cells: o.shares.map((/** @type {number|null} */ s, /** @type {number} */ i) => ({ key: groupId(i), text: fmtPct(s), deviates: false })),
        }));
      }
      return {
        key: part.questionId,
        questionId: part.questionId,
        title: questionLabel(survey, findQuestion(survey, part.questionId), this.t),
        chart: part.type === 'single' || part.type === 'multi',
        rows,
      };
    });
  },

  /** @param {{ deviates: boolean }} c @returns {Record<string, boolean>} */
  cellClass(c) { return { 'survey-builder__cell--deviates': c.deviates }; },

  /** @param {{ differs: boolean }} row @returns {Record<string, boolean>} */
  rowClass(row) { return { 'survey-builder__row--differs': row.differs }; },

  /** Names in the report only exist when the survey is not anonymous. @returns {boolean} */
  get canShowNames() { return !this.model.survey.anonymous; },

  // ── Question blocks ───────────────────────────────────────

  /** @returns {Block[]} one per question with figures (info excluded), in document order */
  get blocks() {
    const survey = this.model.survey;
    return this.results.questions.map((stats) => {
      const question = findQuestion(survey, stats.questionId);
      return {
        key: stats.questionId, question, title: questionLabel(survey, question, this.t),
        nLine: this.t('report.nResponses', { n: stats.n }), stats: /** @type {any} */ (stats),
      };
    });
  },

  /** @param {Block} b @param {string} type @returns {boolean} */
  blockIs(b, type) { return b.stats.type === type; },

  /** @param {Block} b @returns {boolean} single or multiple choice */
  isChoice(b) { return b.stats.type === 'single' || b.stats.type === 'multi'; },

  /** @param {Block} b @returns {Array<{ id: string, text: string, count: number, share: string }>} */
  optionRows(b) { return b.stats.options.map((/** @type {any} */ o) => ({ id: o.id, text: o.text, count: o.count, share: fmtPct(o.share) })); },

  /** @param {Block} b @returns {boolean} the question offers „Sonstiges“ */
  hasOther(b) { return b.question.other === true; },

  /** @param {Block} b @returns {string} share of the „Sonstiges“ answers */
  otherShare(b) { return fmtPct(b.stats.n ? b.stats.otherCount / b.stats.n : null); },

  /**
   * @param {Block} b @returns {Array<{ id: string, text: string, n: number, mean: string, median: string, dist: string, na: number }>}
   */
  ratingRows(b) {
    return b.stats.rows.map((/** @type {any} */ r) => ({
      id: r.id, text: r.text, n: r.n, mean: this.num(r.mean, 2), median: this.num(r.median, 1), dist: r.dist.join(' · '), na: r.na,
    }));
  },

  /** @param {Block} b @returns {boolean} the Kano question asks for importance */
  hasImportance(b) { return Boolean(b.question.importance); },

  /**
   * @param {Block} b @returns {Array<{ id: string, text: string, category: string, cs: string, ds: string, n: number, importance: string }>}
   */
  kanoRows(b) {
    return b.stats.rows.map((/** @type {any} */ r) => ({
      id: r.id, text: r.text, category: this.kanoCategory(r.category), cs: this.num(r.cs, 2), ds: this.num(r.ds, 2),
      n: r.n, importance: this.num(r.importanceMean, 1),
    }));
  },

  /**
   * @param {ReadonlyArray<{ responseId: string, recipientId: string|null, text: string }>} entries
   * @param {string} questionId @param {boolean} other
   * @returns {AnswerRow[]} the non-empty texts with their key and the respondent's name
   */
  answerRows(entries, questionId, other) {
    return entries
      .filter((a) => a.text.trim())
      .map((a) => ({ key: otherKey(a.responseId, questionId, other), text: a.text.trim(), name: recipientName(this.model.recipients, a.recipientId) || '' }));
  },

  /** @param {Block} b free text block @returns {AnswerRow[]} */
  textAnswers(b) { return this.answerRows(b.stats.answers, b.key, false); },

  /** @param {Block} b choice block @returns {AnswerRow[]} its „Sonstiges“ texts */
  otherAnswers(b) { return this.answerRows(b.stats.otherTexts, b.key, true); },

  /** @param {Block} b @returns {boolean} */
  hasTextAnswers(b) { return this.textAnswers(b).length > 0; },

  /** @param {Block} b @returns {boolean} */
  hasOtherTexts(b) { return b.stats.otherTexts.length > 0; },

  /** @param {AnswerRow} a @returns {boolean} the respondent may be named */
  hasName(a) { return !this.model.survey.anonymous && Boolean(a.name); },
});
