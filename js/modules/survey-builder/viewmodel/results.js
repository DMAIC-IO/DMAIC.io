/**
 * D.Mike — Survey builder evaluation (viewmodel/results.js)
 *
 * Sub-viewmodel of the evaluation: filter, question blocks, summary, group
 * comparison, report export and the charts that draw these blocks. Mounts
 * its charts when the results tab is shown and drops them when it is left.
 * Knows the model, survey-labels.js and the pure survey-*.js modules — never
 * a sibling or the shell.
 */

import { documentOrder, findQuestion } from '../survey-conditions.js';
import { sanitizeFileNamePart } from '../survey-export.js';
import {
  filterResponses, questionStats, responseRate, ratingRanking, kanoOverview, freeTextSummary, groupComparison,
} from '../survey-stats.js';
import { reportStrings, buildReportHtml } from '../survey-report.js';
import { plainCopy } from '../survey-builder-model.js';
import { catLabel, fmtNum, fmtPct, localeOf, optionText, questionLabel } from '../survey-labels.js';
import { downloadBlob } from '../../../core/export-utils.js';
import { requireEnum, requireKnownId } from '../../../core/agent/agent-argcheck.js';

/** "Top-Prioritäten" shows this many rows until expanded (survey-builder design §7.1). */
const RANKING_TOP = 10;

const BOOL_VALUES = [true, false];

export class ResultsViewModel {
  /**
   * @param {{t: function(string, object=): string, context: object, container: function(): ?Element}} deps
   */
  constructor({ t, context, container }) {
    this._t = t;
    this._context = context;
    this._container = container;
    /** @type {?object} the component's State, set by attach() */
    this.model = null;
    /** "Top-Prioritäten" expanded beyond RANKING_TOP rows (session only). */
    this.showAllRanking = false;
    /** @type {object[]} mounted chart instances (results tab) */
    this._charts = [];
    /** Render generation — drops mounts from outdated runs. */
    this._renderGen = 0;
    /** true once detach() ran — blocks mounts that come back later. */
    this._destroyed = false;
    /** @type {Array<function(): void>} */
    this._unsubs = [];
    /** Alpine's $nextTick, set by attach(). */
    this._nextTick = (cb) => cb();
  }

  /**
   * Binds the component's model; re-mounts the charts when the data, the
   * tab or the theme change.
   * @noagent lifecycle
   * @param {{model: object, watch: function, nextTick: function}} binding
   */
  attach({ model, watch, nextTick }) {
    this.model = model;
    this._nextTick = nextTick;
    this._destroyed = false;
    this._unsubs = [];
    watch(() => this._resultsSignature(), () => this.scheduleCharts());
    watch(() => this.model.ui.tab, (tab) => this._onTab(tab));
    const eb = this._context.eventBus;
    const onTheme = () => this.scheduleCharts();
    eb.on('theme:changed', onTheme);
    this._unsubs.push(() => eb.off('theme:changed', onTheme));
    this.scheduleCharts();
  }

  /**
   * Unsubscribes and drops the charts.
   * @noagent lifecycle
   */
  detach() {
    this._destroyed = true;
    this._unsubs.forEach((off) => off());
    this._unsubs = [];
    this._renderGen++;
    this.destroyCharts();
  }

  /** @returns {boolean} whether the results tab is the active one */
  _isResultsTab() { return this.model.ui.tab === 'results'; }

  /**
   * Charts only live on the results tab: entering it mounts them, leaving it
   * drops them (a hidden host has no size to draw into).
   * @param {string} tab the new tab
   */
  _onTab(tab) {
    if (tab === 'results') {
      this.scheduleCharts();
      return;
    }
    this._renderGen++;
    this.destroyCharts();
  }

  /**
   * Mounts the charts after the next render when the results tab is active.
   * @noagent chart rendering
   */
  scheduleCharts() {
    if (!this._isResultsTab()) return;
    this._nextTick(() => this.mountCharts());
  }

  // Filter

  /**
   * @returns {Array<{value: string, label: string}>} one entry per single/multi option
   * @noagent view transform
   */
  filterOptions() {
    const out = [];
    for (const { question: q } of documentOrder(this.model.survey)) {
      if (q.type !== 'single' && q.type !== 'multi') continue;
      for (const o of q.options) {
        out.push({
          value: `${q.id}|${o.id}`,
          label: this._t('filterOption', { question: questionLabel(this.model.survey, q, this._t), option: optionText(o, this._t) }),
        });
      }
    }
    return out;
  }

  /** Filter of the model, or null when it points at a deleted question or option. */
  _activeFilter() {
    const f = this.model.ui.filter;
    if (!f) return null;
    const q = findQuestion(this.model.survey, f.questionId);
    return q && Array.isArray(q.options) && q.options.some((o) => o.id === f.optionId) ? f : null;
  }

  /**
   * @noagent view transform
   * @returns {string} select value of the active filter, '' = none
   */
  filterValue() {
    const f = this._activeFilter();
    return f ? `${f.questionId}|${f.optionId}` : '';
  }

  /**
   * @noagent view transform
   * @param {string} value
   * @returns {boolean} whether it is the active filter value
   */
  isFilterValue(value) { return this.filterValue() === value; }

  /** @returns {string[]} ids of the single and multiple choice questions */
  _choiceQuestionIds() {
    return documentOrder(this.model.survey)
      .filter(({ question: q }) => q.type === 'single' || q.type === 'multi').map(({ question: q }) => q.id);
  }

  /** @returns {string[]} ids of the single choice questions */
  _singleQuestionIds() {
    return documentOrder(this.model.survey).filter(({ question: q }) => q.type === 'single').map(({ question: q }) => q.id);
  }

  /**
   * Narrow the evaluation to the responses that chose one option of a
   * single or multiple choice question; null for both shows all responses.
   * @agent
   * @param {string|null} questionId the choice question, null for no filter
   * @param {string|null} optionId one of its options, null for no filter
   * @returns {void}
   * @throws {Error} if the question is no choice question or the option does not belong to it
   */
  setFilter(questionId, optionId) {
    if (questionId === null && optionId === null) { this.model.ui.filter = null; return; }
    requireKnownId('questionId', questionId, this._choiceQuestionIds());
    const q = findQuestion(this.model.survey, questionId);
    requireKnownId('optionId', optionId, q.options.map((o) => o.id));
    this.model.ui.filter = { questionId, optionId };
  }

  /**
   * @noagent template handler, see setFilter
   * @param {Event} ev
   */
  setFilterFromEvent(ev) {
    const [questionId, optionId] = ev.target.value.split('|');
    this.setFilter(optionId ? questionId : null, optionId || null);
  }

  /**
   * @noagent view transform
   * @returns {object[]} responses under the active filter
   */
  filtered() {
    return filterResponses(this.model.survey, this.model.responses, this._activeFilter());
  }

  /**
   * @noagent view transform
   * @returns {string} "n = …" for the filtered responses
   */
  nLine() { return this._t('report.nResponses', { n: this.filtered().length }); }

  // Question blocks

  /**
   * @returns {Array<{key: string, question: object, title: string, stats: object}>} info excluded
   * @noagent view transform
   */
  blocks() {
    const responses = this.filtered();
    const out = [];
    for (const { question } of documentOrder(this.model.survey)) {
      const stats = questionStats(this.model.survey, question, responses);
      if (stats) out.push({ key: question.id, question, title: questionLabel(this.model.survey, question, this._t), stats });
    }
    return out;
  }

  /**
   * @noagent view transform
   * @param {object} b block
   * @param {string} type
   * @returns {boolean}
   */
  isType(b, type) { return b.stats.type === type; }

  /**
   * @noagent view transform
   * @param {object} b block
   * @returns {boolean} single or multi
   */
  isChoice(b) { return b.stats.type === 'single' || b.stats.type === 'multi'; }

  /**
   * @noagent view transform
   * @param {string} prefix
   * @param {string} id
   * @returns {string} value of a chart host's `data-chart`
   */
  chartKey(prefix, id) { return `${prefix}:${id}`; }

  /**
   * @noagent view transform
   * @param {object} b block
   * @returns {string} "n = …" of the block
   */
  blockN(b) { return this._t('report.nResponses', { n: b.stats.n }); }

  /**
   * @noagent view transform
   * @param {object} b block
   * @returns {boolean} whether the Kano question asks for importance
   */
  hasImportance(b) { return Boolean(b.question.importance); }

  /**
   * @noagent view transform
   * @param {object} b block
   * @returns {boolean} whether the question offers "other"
   */
  hasOther(b) { return b.question.other === true; }

  /**
   * @noagent view transform
   * @param {object} b block
   * @returns {string} share of "other" answers
   */
  otherShare(b) { return fmtPct(b.stats.n ? b.stats.otherCount / b.stats.n : null); }

  /**
   * @noagent view transform
   * @param {object} b block
   * @returns {boolean}
   */
  hasOtherTexts(b) { return b.stats.otherTexts.length > 0; }

  /**
   * @noagent view transform
   * @param {{dist: number[]}} row
   * @returns {string} "0 · 1 · 2 · 0 · 0" (answers per scale point 1–5)
   */
  distLabel(row) { return row.dist.join(' · '); }

  // Summary

  /**
   * @noagent Lesefläche: die Auswertung, wie der Reiter sie zeigt, als Zahlen.
   * @returns {object} SurveyResults (Typedef in survey-builder.js)
   */
  agentSnapshot() {
    const survey = this.model.survey;
    const filter = this._activeFilter();
    const groupBy = this._activeGroupBy();
    const responses = this.filtered();
    const questions = [];
    for (const { question } of documentOrder(survey)) {
      const stats = questionStats(survey, question, responses);
      if (stats) questions.push(plainCopy(stats));
    }
    return {
      filter: filter ? { questionId: filter.questionId, optionId: filter.optionId } : null,
      groupBy,
      n: responses.length,
      responseRate: plainCopy(this._rate()),
      questions,
      ratingRanking: plainCopy(ratingRanking(survey, responses)),
      kanoOverview: plainCopy(kanoOverview(survey, responses)),
      freeText: plainCopy(freeTextSummary(survey, responses, this.model.transfers.vocTree.responseKeys)),
      groupComparison: groupBy ? plainCopy(groupComparison(survey, responses, groupBy)) : null,
    };
  }

  /**
   * Response rate over all recipients and responses; the filter does not apply.
   * @returns {object} result of responseRate()
   */
  _rate() {
    return responseRate({
      recipients: this.model.recipients,
      responses: this.model.responses,
      answeredRecipientIds: this.model.answeredRecipientIds,
    });
  }

  /**
   * @returns {string} "3 verschickt · 2 beantwortet (67 %)"
   * @noagent view transform
   */
  rateLine() {
    const r = this._rate();
    return this._t('report.rateLine', { sent: r.sent, answered: r.answered, rate: fmtPct(r.rate) });
  }

  /**
   * @returns {boolean} true when responses exist that no recipient owns
   * @noagent view transform
   */
  hasWithoutRecipient() { return this._rate().withoutRecipient > 0; }

  /**
   * @returns {string} "2 Antworten ohne Empfänger"
   * @noagent view transform
   */
  withoutRecipientLine() { return this._t('report.withoutRecipient', { count: this._rate().withoutRecipient }); }

  /**
   * The group table only pays off with more than one group. @returns {boolean}
   * @noagent view transform
   */
  hasRateGroups() { return this._rate().groups.length > 1; }

  /**
   * @returns {Array<{key: string, group: string, sent: number, answered: number, rate: string}>}
   * @noagent view transform
   */
  rateGroups() {
    return this._rate().groups.map((g) => ({
      key: g.group || '__none',
      group: g.group || this._t('report.groupNone'),
      sent: g.sent,
      answered: g.answered,
      rate: fmtPct(g.rate),
    }));
  }

  /** @returns {Array<object>} rating rows over the filtered responses, best first */
  _ranking() { return ratingRanking(this.model.survey, this.filtered()); }

  /**
   * @returns {boolean} true when there is at least one ranked rating row
   * @noagent view transform
   */
  hasRanking() { return this._ranking().length > 0; }

  /**
   * @returns {Array<{key: string, text: string, n: number, mean: string, top: string}>}
   * @noagent view transform
   */
  rankingRows() {
    const all = this._ranking();
    const shown = this.showAllRanking ? all : all.slice(0, RANKING_TOP);
    return shown.map((r) => ({
      key: `${r.questionId}:${r.rowId}`, text: r.text, n: r.n,
      mean: fmtNum(r.mean, 2, localeOf(this._context.i18n)), top: fmtPct(r.topShare),
    }));
  }

  /**
   * @returns {boolean} true when the ranking has more rows than RANKING_TOP
   * @noagent view transform
   */
  hasMoreRanking() { return this._ranking().length > RANKING_TOP; }

  /**
   * Expands or collapses the ranking.
   * @noagent session-only view state
   */
  toggleRanking() { this.showAllRanking = !this.showAllRanking; }

  /**
   * @returns {string} label of the expand/collapse button
   * @noagent view transform
   */
  rankingToggleLabel() {
    return this.showAllRanking
      ? this._t('rankingTop', { count: RANKING_TOP })
      : this._t('rankingAll', { count: this._ranking().length });
  }

  /** @returns {Array<object>} Kano rows over the filtered responses */
  _kanoOverview() { return kanoOverview(this.model.survey, this.filtered()); }

  /**
   * @returns {boolean} true when any Kano row exists
   * @noagent view transform
   */
  hasKanoOverview() { return this._kanoOverview().length > 0; }

  /**
   * @returns {Array<{key: string, text: string, category: string, cs: string, ds: string}>}
   * @noagent view transform
   */
  kanoOverviewRows() {
    return this._kanoOverview().map((k) => ({
      key: `${k.questionId}:${k.rowId}`, text: k.text, category: catLabel(k.category, this._context.i18n),
      cs: fmtNum(k.cs, 2, localeOf(this._context.i18n)), ds: fmtNum(k.ds, 2, localeOf(this._context.i18n)),
    }));
  }

  /**
   * "5 offene Antworten, 2 in den VoC-Baum übernommen" over the filtered responses.
   * @noagent view transform
   * @returns {string}
   */
  freeTextLine() {
    const keys = this.model.transfers.vocTree.responseKeys;
    return this._t('report.freeText', freeTextSummary(this.model.survey, this.filtered(), keys));
  }

  // Group comparison

  /**
   * @returns {Array<{value: string, label: string}>} the `single` questions
   * @noagent view transform
   */
  groupByOptions() {
    return documentOrder(this.model.survey)
      .filter(({ question: q }) => q.type === 'single')
      .map(({ question: q }) => ({ value: q.id, label: questionLabel(this.model.survey, q, this._t) }));
  }

  /**
   * Grouping question of the model, null when it is gone or no longer `single`.
   * @returns {string|null}
   */
  _activeGroupBy() {
    const id = this.model.ui.groupBy;
    if (!id) return null;
    const q = findQuestion(this.model.survey, id);
    return q && q.type === 'single' ? id : null;
  }

  /**
   * @noagent view transform
   * @param {string} value question id, '' for "none"
   * @returns {boolean} true when it is the selected grouping
   */
  isGroupBy(value) { return (this._activeGroupBy() || '') === value; }

  /**
   * Compare the evaluation across the options of a single choice question;
   * null switches the comparison off.
   * @agent
   * @param {string|null} questionId the single choice question, null for no grouping
   * @returns {void}
   * @throws {Error} if the question is no single choice question
   */
  setGroupBy(questionId) {
    if (questionId !== null) requireKnownId('questionId', questionId, this._singleQuestionIds());
    this.model.ui.groupBy = questionId;
  }

  /**
   * @noagent template handler, see setGroupBy
   * @param {Event} ev change event of the grouping select
   */
  setGroupByFromEvent(ev) { this.setGroupBy(ev.target.value || null); }

  /**
   * Filter first, then group.
   * @returns {object|null} result of groupComparison(), null without grouping
   */
  _comparison() {
    const id = this._activeGroupBy();
    return id ? groupComparison(this.model.survey, this.filtered(), id) : null;
  }

  /**
   * @returns {boolean} true when a comparison is shown
   * @noagent view transform
   */
  hasComparison() { return this._comparison() !== null; }

  /**
   * @returns {string} heading of the comparison, '' without grouping
   * @noagent view transform
   */
  groupsTitle() {
    const id = this._activeGroupBy();
    if (!id) return '';
    return this._t('report.groupsTitle', { question: questionLabel(this.model.survey, findQuestion(this.model.survey, id), this._t) });
  }

  /**
   * @returns {Array<{id: string, label: string}>} "Handel (n = 3, wenig Antworten)"
   * @noagent view transform
   */
  groupHeads() {
    const cmp = this._comparison();
    if (!cmp) return [];
    return cmp.groups.map((g) => ({
      id: g.id,
      label: this._t(g.few ? 'groupHeadFew' : 'groupHead', { group: g.text, n: g.n }),
    }));
  }

  /**
   * The comparison of every question in one shape for the template:
   * rows with a label, a note and one cell per group.
   * @noagent view transform
   * @returns {Array<{key: string, questionId: string, title: string, chart: boolean,
   *   rows: Array<{key: string, label: string, note: string, differs: boolean,
   *     cells: Array<{key: string, text: string, deviates: boolean}>}>}>}
   */
  comparisonParts() {
    const cmp = this._comparison();
    if (!cmp) return [];
    const groupId = (i) => cmp.groups[i].id;
    return cmp.questions.map((part) => {
      let rows;
      if (part.type === 'rating') {
        rows = part.rows.map((row) => ({
          key: row.id, label: row.text, differs: false,
          note: this._t('overallMean', { mean: fmtNum(row.overall, 2, localeOf(this._context.i18n)) }),
          cells: row.cells.map((c, i) => ({ key: groupId(i), text: fmtNum(c.mean, 2, localeOf(this._context.i18n)), deviates: c.deviates })),
        }));
      } else if (part.type === 'kano') {
        rows = part.rows.map((row) => ({
          key: row.id, label: row.text, differs: row.differs,
          note: row.differs ? this._t('report.differs') : '',
          cells: row.categories.map((c, i) => ({ key: groupId(i), text: catLabel(c, this._context.i18n), deviates: false })),
        }));
      } else {
        rows = part.options.map((o) => ({
          key: o.id, label: o.text, differs: false, note: '',
          cells: o.shares.map((s, i) => ({ key: groupId(i), text: fmtPct(s), deviates: false })),
        }));
      }
      return {
        key: part.questionId,
        questionId: part.questionId,
        title: questionLabel(this.model.survey, findQuestion(this.model.survey, part.questionId), this._t),
        chart: part.type === 'single' || part.type === 'multi',
        rows,
      };
    });
  }

  /**
   * @noagent view transform
   * @param {{deviates: boolean}} c comparison cell
   * @returns {object} class map for :class
   */
  cellClass(c) { return { 'survey-builder__cell--deviates': c.deviates }; }

  /**
   * @noagent view transform
   * @param {{differs: boolean}} row comparison row
   * @returns {object} class map for :class
   */
  rowClass(row) { return { 'survey-builder__row--differs': row.differs }; }

  // Report

  /**
   * Names in the report only exist when the survey is not anonymous. @returns {boolean}
   * @noagent view transform
   */
  canShowNames() { return !this.model.survey.anonymous; }

  /**
   * @returns {boolean} state of the "Freitexte mit Namen" switch
   * @noagent view transform
   */
  isReportWithNames() { return this.model.ui.reportWithNames; }

  /**
   * Whether the exported report names the respondents of free texts. Has no
   * effect for an anonymous questionnaire.
   * @agent
   * @param {boolean} on true names them
   * @returns {void}
   * @throws {Error} if `on` is neither true nor false
   */
  setReportWithNames(on) {
    requireEnum('on', on, BOOL_VALUES);
    this.model.ui.reportWithNames = on;
  }

  /**
   * @noagent template handler, see setReportWithNames
   * @param {Event} ev change event of the checkbox
   */
  setReportWithNamesFromEvent(ev) { this.setReportWithNames(ev.target.checked); }

  /**
   * "Bericht exportieren": self-contained HTML with filter and grouping as shown.
   * @noagent file download
   * @returns {Promise<void>}
   */
  async exportReport() {
    try {
      await this._exportReport();
    } catch (err) {
      console.error('survey-builder: report export failed', err);
      if (!this._destroyed) this._context.notify(this._t('reportExportFailed'), 'error');
    }
  }

  /**
   * Builds and downloads the report; throws on failure.
   * @returns {Promise<void>}
   */
  async _exportReport() {
    const data = {
      survey: plainCopy(this.model.survey),
      recipients: plainCopy(this.model.recipients),
      responses: plainCopy(this.model.responses),
      answeredRecipientIds: plainCopy(this.model.answeredRecipientIds),
    };
    const filter = this._activeFilter();
    const strings = await reportStrings(this._context.i18n);
    const html = buildReportHtml(data, strings, {
      locale: localeOf(this._context.i18n),
      withNames: !data.survey.anonymous && this.model.ui.reportWithNames,
      filter: filter ? plainCopy(filter) : null,
      groupBy: this._activeGroupBy(),
      vocKeys: plainCopy(this.model.transfers.vocTree.responseKeys),
      generatedAt: new Date().toISOString(),
    });
    const title = data.survey.title.trim() || this._t('report.untitled');
    downloadBlob(
      new Blob([html], { type: 'text/html;charset=utf-8' }),
      `${sanitizeFileNamePart(this._t('fileReport'))}_${sanitizeFileNamePart(title)}.html`,
    );
  }
  /**
   * Unmounts every chart of the results tab.
   * @noagent chart rendering
   */
  destroyCharts() {
    for (const c of this._charts) {
      try { this._context.chartManager.destroy(c); } catch { /* ignore */ }
    }
    this._charts = [];
  }

  /**
   * Everything the charts depend on — a change re-mounts them.
   * @returns {string}
   */
  _resultsSignature() {
    return JSON.stringify([this.model.survey, this.model.responseIds(), this.model.ui.filter, this.model.ui.groupBy]);
  }

  /**
   * Per-question charts: choice shares, rating means, Kano better/worse.
   * @noagent chart rendering
   */
  questionChartJobs() {
    const jobs = [];
    for (const b of this.blocks()) {
      const key = this.chartKey('q', b.question.id);
      const s = b.stats;
      if (this.isChoice(b) && s.n > 0) {
        jobs.push({ key, type: 'bar', config: {
          categories: s.options.map((o) => o.text),
          groups: [{ name: this._t('chartShare'), values: s.options.map((o) => Math.round((o.share || 0) * 1000) / 10), color: 'var(--color-chart-1)' }],
          yLabel: '%', yMin: 0, showLegend: false,
        } });
      }
      if (s.type === 'rating') {
        const rows = s.rows.filter((r) => r.mean !== null).sort((a, c) => c.mean - a.mean);
        if (rows.length > 0) {
          jobs.push({ key, type: 'bar', config: {
            categories: rows.map((r) => r.text),
            groups: [{ name: this._t('chartMean'), values: rows.map((r) => r.mean), color: 'var(--color-chart-1)' }],
            yLabel: this._t('report.colMean'), yMin: 0, showLegend: false,
          } });
        }
      }
      if (s.type === 'kano') {
        const config = this._kanoScatter(s.rows.map((r) => ({ label: r.text, cs: r.cs, ds: r.ds })));
        if (config) jobs.push({ key, type: 'scatter', config });
      }
    }
    return jobs;
  }

  /**
   * Summary scatter, group bars, then the per-question charts.
   * @noagent chart rendering
   * @returns {Array<{key: string, type: string, config: object}>}
   */
  chartJobs() {
    return [...this.summaryChartJobs(), ...this.groupChartJobs(), ...this.questionChartJobs()];
  }

  /**
   * One Better/Worse scatter over all Kano rows of all Kano questions.
   * @noagent chart rendering
   * @returns {Array<{key: string, type: string, config: object}>}
   */
  summaryChartJobs() {
    const config = this._kanoScatter(this._kanoOverview().map((k) => ({ label: k.text, cs: k.cs, ds: k.ds })));
    return config ? [{ key: 'kano-overview', type: 'scatter', config }] : [];
  }

  /**
   * Grouped bars, share in % per group, for every choice question of the comparison.
   * @noagent chart rendering
   * @returns {Array<{key: string, type: string, config: object}>}
   */
  groupChartJobs() {
    const cmp = this._comparison();
    if (!cmp) return [];
    return cmp.questions
      .filter((part) => part.type === 'single' || part.type === 'multi')
      .map((part) => ({
        key: this.chartKey('g', part.questionId),
        type: 'bar',
        config: {
          categories: part.options.map((o) => o.text),
          groups: cmp.groups.map((g, i) => ({
            name: g.text,
            values: part.options.map((o) => Math.round((o.shares[i] || 0) * 1000) / 10),
            color: `var(--color-chart-${(i % 10) + 1})`,
          })),
          yLabel: '%', yMin: 0, showLegend: true,
        },
      }));
  }

  /**
   * Better/worse scatter, same look as the kano module (kano.js mountChart):
   * one series per item so the tooltip names it, no legend.
   * @param {Array<{label: string, cs: number|null, ds: number|null}>} rows
   * @returns {object|null} chart config, null without a plottable row
   */
  _kanoScatter(rows) {
    const points = rows.filter((r) => r.cs !== null && r.ds !== null);
    if (points.length === 0) return null;
    const i18n = this._context.i18n;
    return {
      xLabel: i18n.t('modules.kano.chartX'),
      yLabel: i18n.t('modules.kano.chartY'),
      showLegend: false,
      series: points.map((r) => ({
        name: r.label, color: 'var(--color-chart-1)', symbol: 'circle', markerSize: 8, strokeWidth: 1,
        x: [Math.abs(r.ds)], y: [r.cs],
      })),
      refLines: [
        { dir: 'h', value: 0.5, dash: 'dash', width: 1, color: 'var(--color-text-tertiary)' },
        { dir: 'v', value: 0.5, dash: 'dash', width: 1, color: 'var(--color-text-tertiary)' },
      ],
    };
  }

  /**
   * Waits across animation frames (bounded) until an anchor exists, as the
   * hosts sit inside x-for/x-if templates that Alpine materialises late.
   * @param {string} selector
   * @param {number} gen render generation of the caller
   * @param {number} [maxFrames=30]
   * @returns {Promise<Element|null>} null when outdated or never rendered
   */
  _whenAnchor(selector, gen, maxFrames = 30) {
    return new Promise((resolve) => {
      const tick = (left) => {
        if (gen !== this._renderGen) { resolve(null); return; }
        const root = this._container();
        const el = root && root.querySelector(selector);
        if (el) { resolve(el); return; }
        if (left <= 0) { resolve(null); return; }
        requestAnimationFrame(() => tick(left - 1));
      };
      tick(maxFrames);
    });
  }

  /**
   * Mounts every chart job into its `[data-chart]` host (gen guard as in kano.js).
   * @noagent chart rendering
   */
  async mountCharts() {
    if (this._destroyed || !this._isResultsTab()) return;
    this._renderGen++;
    const gen = this._renderGen;
    this.destroyCharts();
    for (const job of this.chartJobs()) {
      const host = await this._whenAnchor(`[data-chart="${job.key}"]`, gen);
      if (this._destroyed || gen !== this._renderGen) return;
      if (!host) continue;
      const chart = await this._context.chartManager.create(host, job.type, job.config);
      if (this._destroyed || gen !== this._renderGen) {
        try { this._context.chartManager.destroy(chart); } catch { /* ignore */ }
        return;
      }
      this._charts.push(chart);
    }
  }}
