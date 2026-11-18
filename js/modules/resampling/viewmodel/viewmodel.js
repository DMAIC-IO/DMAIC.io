/**
 * D.Mike — Resampling: Viewmodel.
 *
 * `computed` liest Stichproben (`ctx.source`) und Fingerabdruck für den Lauf;
 * `asyncTasks.compute` rechnet Bootstrap und Permutationstest mit
 * Fortschritt und Abbruch und schreibt das Ergebnis ins Model.
 */
import { createModule } from '../../../core/template-module.js';
import { setFields } from '../../../core/model.js';
import { asyncTask } from '../../../core/async-task.js';
import { createInlineRunner } from '../../../engines/resampling-runner.js';
import { readColumn, columnLabel } from '../../../core/source-columns.js';
import descriptor from '../module.js';
import { State, MODES, CONTRASTS, DIRECTIONS, CI_METHODS, STATS_BY_MODE } from '../domain/model.js';
import { readInputs, errorKeyForCode, buildJobs, computeInputsHash, summarize } from '../domain/analyze.js';
import { statementParts, renderStatement } from '../domain/statement.js';
import { statisticKey } from '../domain/format.js';
import { resultView, bootChartConfig, permChartConfig } from './present.js';

/** @param {any} m @returns {any[]} Spaltenbezüge je Aufbau */
const refsOf = (m) => (m.mode === 'k' ? m.colRefsK : m.mode === 'one' ? [m.colRef1] : [m.colRef1, m.colRef2]);

/** @param {any} src @param {any} ref @returns {string} Spaltenname, leer wenn nicht lesbar */
const labelOf = (src, ref) => { const c = readColumn(src, ref); return c ? columnLabel(c) : ''; };

const MODE_LABEL_KEYS = { one: 'modeOne', two: 'modeTwo', paired: 'modePaired', k: 'modeK' };
const CONTRAST_LABEL_KEYS = { difference: 'contrastDifference', ratio: 'contrastRatio' };
const DIRECTION_LABEL_KEYS = { 'two-sided': 'twoSided', greater: 'greater', less: 'less' };
const CI_METHOD_LABEL_KEYS = { bca: 'ciBca', percentile: 'ciPercentile' };

const mod = createModule({
  descriptor,
  Model: State,
  asyncTasks: {
    compute: asyncTask({
      blocked() { return this.validationText || null; },
      async run(_args, { signal, progress }) {
        // Stand vor dem ersten await: der Lauf rechnet mit den Einstellungen seines Starts.
        const snap = JSON.parse(JSON.stringify(this.model.toJSON()));
        const inputs = this.inputs;
        const hash = this.inputsHash;
        const labels = [...this.labels];
        const jobs = buildJobs(snap, inputs);
        const runner = mod.runnerFactory();
        const outcomes = [];
        try {
          for (let i = 0; i < jobs.length; i++) {
            const result = await runner.run(jobs[i].job, {
              signal,
              onProgress: (done, total) => progress((i + (total ? done / total : 0)) / jobs.length),
            });
            outcomes.push({ role: jobs[i].role, result });
          }
        } catch (err) {
          if (err?.name === 'AbortError') throw err;
          throw new Error(this.t(err?.code ? errorKeyForCode(err.code, snap.statisticId) : 'errUnexpected'), { cause: err });
        }
        // Ein Abbruch nach dem letzten Teil-Lauf darf kein Ergebnis mehr schreiben.
        signal.throwIfAborted();
        const summary = JSON.parse(JSON.stringify(summarize(snap, inputs, outcomes, hash, labels)));
        setFields(this.model, { result: summary });
        return summary;
      },
    }),
  },
  /** @type {import('../../../core/template-module.js').ViewFn<import('../domain/model.types.js').StateModel, {}>} */
  view(ctx) {
    return {
      computed: {
        /** Stichproben aus dem Arbeitsblatt (roh gelesen: gepaart bleiben die Zeilen zusammen). */
        inputs() { return readInputs(this.model, (ref) => readColumn(ctx.source, ref)?.values ?? null); },
        /** Fingerabdruck der Eingaben, gegen den ein gespeichertes Ergebnis veraltet. */
        inputsHash() { return computeInputsHash(this.model, this.inputs); },
        /** Spaltennamen je Stichprobe. */
        labels() { return refsOf(this.model).map((r) => (r ? labelOf(ctx.source, r) : '')); },
      },
      get stale() { return !!this.model.result && this.model.result.inputsHash !== this.inputsHash; },
      get resultView() { return resultView(this.model.result, { ciMethod: this.model.ciMethod, target: this.model.target, lang: ctx.context.language }); },
      /** Ergebnisansicht für die Vorlage: nie null, damit ein beim Abbau noch laufender Ausdruck nicht ins Leere greift. */
      get view() { return this.resultView ?? EMPTY_VIEW; },
      get hasResult() { return this.resultView !== null; },
      get noResult() { return this.resultView === null; },
      get showStale() { return this.hasResult && this.stale; },
      get showValidation() { return !!this.validation && refsOf(this.model).some(Boolean); },
      get validationText() { return this.validation ? this.t(this.validation) : ''; },
      get statementText() {
        return renderStatement(statementParts(this.model.result, { ciMethod: this.model.ciMethod, target: this.model.target, lang: ctx.context.language }), this.t);
      },
      get hasStatement() { return this.statementText !== ''; },
      get showDecision() { return !!this.resultView?.decisionKey; },
      get decisionText() { const k = this.resultView?.decisionKey; return k ? this.t(k) : ''; },
      get intervalHeader() { return `${this.t('interval')} (${this.t(CI_METHOD_LABEL_KEYS[this.model.ciMethod])})`; },
      get methodText() {
        const test = this.resultView?.test;
        return test ? `${this.t(test.methodKey)} · ${test.permutations}` : '';
      },
      get bootChart() { return this.model.result ? bootChartConfig(this.model.result, this.model.ciMethod, this.t) : null; },
      get permChart() { return this.model.result ? permChartConfig(this.model.result, this.t) : null; },
      get hasBootChart() { return this.bootChart !== null; },
      get hasPermChart() { return this.permChart !== null; },
      get isK() { return this.model.mode === 'k'; },
      get notK() { return this.model.mode !== 'k'; },
      get hasTwo() { return this.model.mode === 'two' || this.model.mode === 'paired'; },
      get sample1Label() {
        const m = this.model.mode;
        return this.t(m === 'paired' ? 'pairedXColumn' : m === 'two' ? 'group1Column' : 'sampleColumn');
      },
      get sample2Label() { return this.t(this.model.mode === 'paired' ? 'pairedYColumn' : 'group2Column'); },
      get showTrim() { return this.model.statisticId === 'trimmedMean'; },
      get showQuantileP() { return this.model.statisticId === 'quantile'; },
      get showLimits() { return this.model.statisticId === 'ppk'; },
      get showContrast() { return this.model.mode === 'two'; },
      get showTarget() { return this.model.mode === 'one'; },
      get showDirection() { return this.model.mode === 'two' || this.model.mode === 'paired'; },
      get modeButtons() {
        return MODES.map((value) => ({
          value, ref: `mode-${value}`, label: this.t(MODE_LABEL_KEYS[value]),
          cls: value === this.model.mode ? 'btn--active' : '', pressed: String(value === this.model.mode),
        }));
      },
      get statisticOptions() {
        return STATS_BY_MODE[this.model.mode].map((value) => ({ value, label: this.t(statisticKey(value)), selected: value === this.model.statisticId }));
      },
      get contrastOptions() {
        return CONTRASTS.map((value) => ({ value, label: this.t(CONTRAST_LABEL_KEYS[value]), selected: value === this.model.contrast }));
      },
      get directionOptions() {
        return DIRECTIONS.map((value) => ({ value, label: this.t(DIRECTION_LABEL_KEYS[value]), selected: value === this.model.direction }));
      },
      get ciMethodOptions() {
        return CI_METHODS.map((value) => ({ value, label: this.t(CI_METHOD_LABEL_KEYS[value]), selected: value === this.model.ciMethod }));
      },
    };
  },
});

/** Austauschbar (Tests, späterer Worker-Runner). */
mod.runnerFactory = () => createInlineRunner();

/** Inerte Ansicht ohne Ergebnis. */
const EMPTY_VIEW = Object.freeze({ hasBoot: false, hasTest: false, isK: false, bcaFallback: false, estimate: '', se: '', bias: '', interval: '', test: null, groups: [], posthoc: [] });

export default mod;
