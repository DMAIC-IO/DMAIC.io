/**
 * D.Mike — Survey builder evaluation (survey-results-controller.js)
 *
 * Results tab: filter, question blocks, summary, group comparison and
 * the report export.
 * Spread into the data function of survey-builder.js, which owns config,
 * lifecycle, tabs, labels and formatting; `this` is the whole component.
 *
 * Spec: docs/superpowers/specs/2026-10-10-survey-builder-design.md
 */

import { documentOrder, findQuestion } from './survey-conditions.js';
import { sanitizeFileNamePart } from './survey-export.js';
import {
  filterResponses, questionStats, responseRate, ratingRanking, kanoOverview, freeTextSummary, groupComparison,
} from './survey-stats.js';
import { reportStrings, buildReportHtml } from './survey-report.js';
import { plainCopy } from './survey-builder-model.js';
import { downloadBlob } from '../../core/export-utils.js';

/** "Top-Prioritäten" shows this many rows until expanded (spec §7.1). */
const RANKING_TOP = 10;

/**
 * @param {object} module the module instance (`_context`, `_container`)
 * @param {function(string, object=): string} _t translation function of the module
 * @returns {object} members of the Alpine component
 */
export function resultsController(module, _t) {
  return {
    /** "Top-Prioritäten" expanded beyond RANKING_TOP rows (session only). */
    showAllRanking: false,

    // Filter

    /** @returns {Array<{value: string, label: string}>} one entry per single/multi option */
    filterOptions() {
      const out = [];
      for (const { question: q } of documentOrder(this.model.survey)) {
        if (q.type !== 'single' && q.type !== 'multi') continue;
        for (const o of q.options) {
          out.push({
            value: `${q.id}|${o.id}`,
            label: _t('filterOption', { question: this.questionLabel(q), option: this.optionText(o) }),
          });
        }
      }
      return out;
    },

    /** Filter of the model, or null when it points at a deleted question or option. */
    _activeFilter() {
      const f = this.model.ui.filter;
      if (!f) return null;
      const q = findQuestion(this.model.survey, f.questionId);
      return q && Array.isArray(q.options) && q.options.some((o) => o.id === f.optionId) ? f : null;
    },

    /**
     * @returns {string} select value of the active filter, '' = none
     */
    filterValue() {
      const f = this._activeFilter();
      return f ? `${f.questionId}|${f.optionId}` : '';
    },

    /**
     * @param {string} value
     * @returns {boolean} whether it is the active filter value
     */
    isFilterValue(value) { return this.filterValue() === value; },

    /**
     * `@change` of the filter select.
     * @param {Event} ev
     */
    setFilterFromEvent(ev) {
      const [questionId, optionId] = ev.target.value.split('|');
      this.model.ui.filter = optionId ? { questionId, optionId } : null;
    },

    /**
     * @returns {object[]} responses under the active filter
     */
    filtered() {
      return filterResponses(this.model.survey, this.model.responses, this._activeFilter());
    },

    /**
     * @returns {string} "n = …" for the filtered responses
     */
    nLine() { return _t('report.nResponses', { n: this.filtered().length }); },

    // Question blocks

    /** @returns {Array<{key: string, question: object, title: string, stats: object}>} info excluded */
    blocks() {
      const responses = this.filtered();
      const out = [];
      for (const { question } of documentOrder(this.model.survey)) {
        const stats = questionStats(this.model.survey, question, responses);
        if (stats) out.push({ key: question.id, question, title: this.questionLabel(question), stats });
      }
      return out;
    },

    /**
     * @param {object} b block
     * @param {string} type
     * @returns {boolean}
     */
    isType(b, type) { return b.stats.type === type; },

    /**
     * @param {object} b block
     * @returns {boolean} single or multi
     */
    isChoice(b) { return b.stats.type === 'single' || b.stats.type === 'multi'; },

    /**
     * @param {string} prefix
     * @param {string} id
     * @returns {string} value of a chart host's `data-chart`
     */
    chartKey(prefix, id) { return `${prefix}:${id}`; },

    /**
     * @param {object} b block
     * @returns {string} "n = …" of the block
     */
    blockN(b) { return _t('report.nResponses', { n: b.stats.n }); },

    /**
     * @param {object} b block
     * @returns {boolean} whether the Kano question asks for importance
     */
    hasImportance(b) { return Boolean(b.question.importance); },

    /**
     * @param {object} b block
     * @returns {boolean} whether the question offers "other"
     */
    hasOther(b) { return b.question.other === true; },

    /**
     * @param {object} b block
     * @returns {string} share of "other" answers
     */
    otherShare(b) { return this.fmtPct(b.stats.n ? b.stats.otherCount / b.stats.n : null); },

    /**
     * @param {object} b block
     * @returns {boolean}
     */
    hasOtherTexts(b) { return b.stats.otherTexts.length > 0; },

    /**
     * @param {{dist: number[]}} row
     * @returns {string} "0 · 1 · 2 · 0 · 0" (answers per scale point 1–5)
     */
    distLabel(row) { return row.dist.join(' · '); },

    // Summary (spec §7.1)

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
    },

    /** @returns {string} "3 verschickt · 2 beantwortet (67 %)" */
    rateLine() {
      const r = this._rate();
      return _t('report.rateLine', { sent: r.sent, answered: r.answered, rate: this.fmtPct(r.rate) });
    },

    /** @returns {boolean} true when responses exist that no recipient owns */
    hasWithoutRecipient() { return this._rate().withoutRecipient > 0; },

    /** @returns {string} "2 Antworten ohne Empfänger" */
    withoutRecipientLine() { return _t('report.withoutRecipient', { count: this._rate().withoutRecipient }); },

    /** The group table only pays off with more than one group. @returns {boolean} */
    hasRateGroups() { return this._rate().groups.length > 1; },

    /** @returns {Array<{key: string, group: string, sent: number, answered: number, rate: string}>} */
    rateGroups() {
      return this._rate().groups.map((g) => ({
        key: g.group || '__none',
        group: g.group || _t('report.groupNone'),
        sent: g.sent,
        answered: g.answered,
        rate: this.fmtPct(g.rate),
      }));
    },

    /** @returns {Array<object>} rating rows over the filtered responses, best first */
    _ranking() { return ratingRanking(this.model.survey, this.filtered()); },

    /** @returns {boolean} true when there is at least one ranked rating row */
    hasRanking() { return this._ranking().length > 0; },

    /** @returns {Array<{key: string, text: string, n: number, mean: string, top: string}>} */
    rankingRows() {
      const all = this._ranking();
      const shown = this.showAllRanking ? all : all.slice(0, RANKING_TOP);
      return shown.map((r) => ({
        key: `${r.questionId}:${r.rowId}`, text: r.text, n: r.n,
        mean: this.fmtNum(r.mean, 2), top: this.fmtPct(r.topShare),
      }));
    },

    /** @returns {boolean} true when the ranking has more rows than RANKING_TOP */
    hasMoreRanking() { return this._ranking().length > RANKING_TOP; },

    /** Expands or collapses the ranking. */
    toggleRanking() { this.showAllRanking = !this.showAllRanking; },

    /** @returns {string} label of the expand/collapse button */
    rankingToggleLabel() {
      return this.showAllRanking
        ? _t('rankingTop', { count: RANKING_TOP })
        : _t('rankingAll', { count: this._ranking().length });
    },

    /** @returns {Array<object>} Kano rows over the filtered responses */
    _kanoOverview() { return kanoOverview(this.model.survey, this.filtered()); },

    /** @returns {boolean} true when any Kano row exists */
    hasKanoOverview() { return this._kanoOverview().length > 0; },

    /** @returns {Array<{key: string, text: string, category: string, cs: string, ds: string}>} */
    kanoOverviewRows() {
      return this._kanoOverview().map((k) => ({
        key: `${k.questionId}:${k.rowId}`, text: k.text, category: this.catLabel(k.category),
        cs: this.fmtNum(k.cs, 2), ds: this.fmtNum(k.ds, 2),
      }));
    },

    /**
     * "5 offene Antworten, 2 in den VoC-Baum übernommen" over the filtered responses.
     * @returns {string}
     */
    freeTextLine() {
      const keys = this.model.transfers.vocTree.responseKeys;
      return _t('report.freeText', freeTextSummary(this.model.survey, this.filtered(), keys));
    },

    // Group comparison (spec §7.2)

    /** @returns {Array<{value: string, label: string}>} the `single` questions */
    groupByOptions() {
      return documentOrder(this.model.survey)
        .filter(({ question: q }) => q.type === 'single')
        .map(({ question: q }) => ({ value: q.id, label: this.questionLabel(q) }));
    },

    /**
     * Grouping question of the model, null when it is gone or no longer `single`.
     * @returns {string|null}
     */
    _activeGroupBy() {
      const id = this.model.ui.groupBy;
      if (!id) return null;
      const q = findQuestion(this.model.survey, id);
      return q && q.type === 'single' ? id : null;
    },

    /**
     * @param {string} value question id, '' for "none"
     * @returns {boolean} true when it is the selected grouping
     */
    isGroupBy(value) { return (this._activeGroupBy() || '') === value; },

    /**
     * @param {Event} ev change event of the grouping select
     */
    setGroupByFromEvent(ev) { this.model.ui.groupBy = ev.target.value || null; },

    /**
     * Filter first, then group (spec §7.2).
     * @returns {object|null} result of groupComparison(), null without grouping
     */
    _comparison() {
      const id = this._activeGroupBy();
      return id ? groupComparison(this.model.survey, this.filtered(), id) : null;
    },

    /** @returns {boolean} true when a comparison is shown */
    hasComparison() { return this._comparison() !== null; },

    /** @returns {string} heading of the comparison, '' without grouping */
    groupsTitle() {
      const id = this._activeGroupBy();
      if (!id) return '';
      return _t('report.groupsTitle', { question: this.questionLabel(findQuestion(this.model.survey, id)) });
    },

    /** @returns {Array<{id: string, label: string}>} "Handel (n = 3, wenig Antworten)" */
    groupHeads() {
      const cmp = this._comparison();
      if (!cmp) return [];
      return cmp.groups.map((g) => ({
        id: g.id,
        label: _t(g.few ? 'groupHeadFew' : 'groupHead', { group: g.text, n: g.n }),
      }));
    },

    /**
     * The comparison of every question in one shape for the template:
     * rows with a label, a note and one cell per group.
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
            note: _t('overallMean', { mean: this.fmtNum(row.overall, 2) }),
            cells: row.cells.map((c, i) => ({ key: groupId(i), text: this.fmtNum(c.mean, 2), deviates: c.deviates })),
          }));
        } else if (part.type === 'kano') {
          rows = part.rows.map((row) => ({
            key: row.id, label: row.text, differs: row.differs,
            note: row.differs ? _t('report.differs') : '',
            cells: row.categories.map((c, i) => ({ key: groupId(i), text: this.catLabel(c), deviates: false })),
          }));
        } else {
          rows = part.options.map((o) => ({
            key: o.id, label: o.text, differs: false, note: '',
            cells: o.shares.map((s, i) => ({ key: groupId(i), text: this.fmtPct(s), deviates: false })),
          }));
        }
        return {
          key: part.questionId,
          questionId: part.questionId,
          title: this.questionLabel(findQuestion(this.model.survey, part.questionId)),
          chart: part.type === 'single' || part.type === 'multi',
          rows,
        };
      });
    },

    /**
     * @param {{deviates: boolean}} c comparison cell
     * @returns {object} class map for :class
     */
    cellClass(c) { return { 'survey-builder__cell--deviates': c.deviates }; },

    /**
     * @param {{differs: boolean}} row comparison row
     * @returns {object} class map for :class
     */
    rowClass(row) { return { 'survey-builder__row--differs': row.differs }; },

    // Report (spec §7.3)

    /** Names in the report only exist when the survey is not anonymous. @returns {boolean} */
    canShowNames() { return !this.model.survey.anonymous; },

    /** @returns {boolean} state of the "Freitexte mit Namen" switch */
    isReportWithNames() { return this.model.ui.reportWithNames; },

    /**
     * @param {Event} ev change event of the checkbox
     */
    setReportWithNamesFromEvent(ev) { this.model.ui.reportWithNames = ev.target.checked; },

    /**
     * "Bericht exportieren": self-contained HTML with filter and grouping as shown.
     * @returns {Promise<void>}
     */
    async exportReport() {
      try {
        await this._exportReport();
      } catch (err) {
        console.error('survey-builder: report export failed', err);
        if (!this._destroyed) module._context.notify(_t('reportExportFailed'), 'error');
      }
    },

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
      const strings = await reportStrings(module._context.i18n);
      const html = buildReportHtml(data, strings, {
        locale: this._locale(),
        withNames: !data.survey.anonymous && this.model.ui.reportWithNames,
        filter: filter ? plainCopy(filter) : null,
        groupBy: this._activeGroupBy(),
        vocKeys: plainCopy(this.model.transfers.vocTree.responseKeys),
        generatedAt: new Date().toISOString(),
      });
      const title = data.survey.title.trim() || _t('report.untitled');
      downloadBlob(
        new Blob([html], { type: 'text/html;charset=utf-8' }),
        `${sanitizeFileNamePart(_t('fileReport'))}_${sanitizeFileNamePart(title)}.html`,
      );
    },
  };
}
