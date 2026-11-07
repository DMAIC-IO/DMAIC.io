/**
 * D.Mike — Kachel der attributiven Regelkarte
 *
 * „Ist der Prozess stabil?“ — Stabilitätsmarke, verletzende Punkte, CL und
 * Grenzen und eine kompakte Regelkarte (Widget `control-chart`). Form: createTile
 * (core/template-tile.js); Einstellungen in settings.js, Markup in
 * resources/tile.html. Das Arbeitsblatt kommt über `ctx.data`.
 */
import { createTile } from '../../../core/template-tile.js';
import { windowed } from '../../../ui/tile-chart-window.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { analyzeState, signalIndices, baselineEndOf } from '../domain/analyze.js';
import { meanOf } from '../viewmodel/present.js';
import { asList } from '../domain/limits.js';
import { Settings } from './settings.js';

/** Vier Nachkommastellen, `—` ohne Wert. @param {number|null|undefined} v @returns {string} */
const fmt = (v) => (Number.isFinite(v) ? /** @type {number} */ (v).toFixed(4) : '—');

export default createTile({
  descriptor,
  Model: State,
  Settings,
  size: { defaultW: 3, defaultH: 10, minW: 2, minH: 6 },
  titlePrefix: 'SPC',
  refreshOn: ['state:saved', 'resize'],

  /** @type {import('./settings.types.js').AttributeControlChartTileViewFn} */
  view(ctx) {
    /** Je Rendern einmal gerechnet (der Scope ist ein Schnappschuss). */
    let memo = null;
    return {
      get analysis() {
        if (memo === null) memo = { value: analyzeState(this.model, (ref) => ctx.data.values(ref) ?? []) };
        return memo.value;
      },
      /** Leertext, sonst null. */
      get empty() {
        if (!this.model.defectsRef) return ctx.i18n.t('dashboard.attrSpcEmpty');
        return this.analysis ? null : ctx.i18n.t('dashboard.attrSpcNoData');
      },
      /** Die verletzenden Punkte (Indizes, ohne Doppelte). */
      get signals() { return signalIndices(this.analysis?.violations ?? []); },
      get stable() { return (this.analysis?.violations.length ?? 0) === 0; },
      get variable() { return Boolean(this.analysis?.result.variableLimits); },
      get type() { return this.analysis?.ct.id ?? ''; },
      get badgeModifier() { return `dashboard-attr-spc__badge--${this.stable ? 'ok' : 'bad'}`; },
      get badge() { return ctx.i18n.t(this.stable ? 'dashboard.attrSpcStable' : 'dashboard.attrSpcUnstable'); },
      get metric() {
        return {
          modifier: `dashboard-spc__metric--${this.stable ? 'ok' : 'bad'}`,
          value: String(this.signals.length),
          label: ctx.i18n.t('dashboard.spcViolations'),
          sub: ctx.i18n.t('dashboard.spcOf', { total: this.analysis?.valid ?? 0 }),
        };
      },
      get clText() { return fmt(meanOf(this.analysis?.result.cl)); },
      get uclLabel() { return this.variable ? 'UCL̄' : 'UCL'; },
      get uclText() { return fmt(meanOf(this.analysis?.result.ucl)); },
      get lclLabel() { return this.variable ? 'LCL̄' : 'LCL'; },
      get lclText() { return fmt(meanOf(this.analysis?.result.lcl)); },
      /** Die Regelkarte der letzten `lastN` Punkte; null ohne Daten oder ausgeblendet. */
      get chart() {
        const a = this.analysis;
        if (!a || !this.settings.showChart) return null;
        const r = a.result;
        const win = windowed(r, new Set(this.signals), baselineEndOf(this.model.baselineCount, r.values.length), this.settings.lastN);
        return {
          ...win,
          cl: asList(win.cl), ucl: asList(win.ucl), lcl: asList(win.lcl),
          ...(win.sigma == null ? {} : { sigma: asList(win.sigma) }),
          violationIndices: [...win.violationIndices],
          usl: null, lsl: null,
          showZones: !this.variable,
          xLabel: this.t('xLabelSample'),
          yLabel: this.t(`yLabel_${this.model.chartTypeId}`),
          showTitle: false, showXLabel: false, showYLabel: false,
          showXTicks: false, showYTicks: false, showLegend: false,
        };
      },
    };
  },
});
