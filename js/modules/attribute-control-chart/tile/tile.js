/**
 * D.Mike — Kachel der attributiven Regelkarte
 *
 * „Ist der Prozess stabil?“ — Stabilitätsmarke, verletzende Punkte, CL und
 * Grenzen und eine kompakte Regelkarte (Widget `control-chart`). Form: createTile
 * (core/template-tile.js); Einstellungen in settings.js, Markup in
 * resources/tile.html. Die Analyse ist das derived `analysis` des Models.
 */
import { createTile } from '../../../core/template-tile.js';
import { windowed } from '../../../ui/tile-chart-window.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { signalIndices, baselineEndOf } from '../domain/analyze.js';
import { meanOf } from '../viewmodel/present.js';
import { asList } from '../domain/limits.js';
import { Settings } from './settings.js';
import { formatNumber } from '../../../core/number-format.js';

/** Vier Nachkommastellen, `—` ohne Wert. @param {number|null|undefined} v @param {string} lang @returns {string} */
const fmt = (v, lang) => (Number.isFinite(v) ? formatNumber(/** @type {number} */ (v), lang, { decimals: 4 }) : '—');

export default createTile({
  descriptor,
  Model: State,
  Settings,
  size: { defaultW: 3, defaultH: 10, minW: 2, minH: 6 },
  titlePrefix: 'SPC',
  refreshOn: ['state:saved', 'resize'],

  /** @type {import('./settings.types.js').AttributeControlChartTileViewFn} */
  view(ctx) {
    // `this.analysis` ist der Getter des Kerns für das derived `analysis` (je Rendern einmal gerechnet);
    // ein Wurf der Ableitung kommt als `{ error }` an und zählt wie „keine Analyse“.
    /** @param {any} scope @returns {any} die Analyse oder null */
    const analysisOf = (scope) => { const a = scope.analysis; return a && !a.error ? a : null; };
    return {
      /** Leertext, sonst null. */
      get empty() {
        if (!this.model.defectsRef) return ctx.i18n.t('dashboard.attrSpcEmpty');
        return analysisOf(this) ? null : ctx.i18n.t('dashboard.attrSpcNoData');
      },
      /** Die verletzenden Punkte (Indizes, ohne Doppelte). */
      get signals() { return signalIndices(analysisOf(this)?.violations ?? []); },
      get stable() { return (analysisOf(this)?.violations.length ?? 0) === 0; },
      get variable() { return Boolean(analysisOf(this)?.result.variableLimits); },
      get type() { return analysisOf(this)?.ct.id ?? ''; },
      get badgeModifier() { return `dashboard-attr-spc__badge--${this.stable ? 'ok' : 'bad'}`; },
      // `badge` urteilt über rohe Regelverletzungen, `metric` zählt Signalpunkte — ein Punkt kann mehrere Regeln verletzen.
      get badge() { return ctx.i18n.t(this.stable ? 'dashboard.attrSpcStable' : 'dashboard.attrSpcUnstable'); },
      get metric() {
        return {
          modifier: `dashboard-spc__metric--${this.stable ? 'ok' : 'bad'}`,
          value: String(this.signals.length),
          label: ctx.i18n.t('dashboard.spcViolations'),
          sub: ctx.i18n.t('dashboard.spcOf', { total: analysisOf(this)?.valid ?? 0 }),
        };
      },
      get clText() { return fmt(meanOf(analysisOf(this)?.result.cl), ctx.i18n.getLanguage()); },
      get uclLabel() { return this.variable ? 'UCL̄' : 'UCL'; },
      get uclText() { return fmt(meanOf(analysisOf(this)?.result.ucl), ctx.i18n.getLanguage()); },
      get lclLabel() { return this.variable ? 'LCL̄' : 'LCL'; },
      get lclText() { return fmt(meanOf(analysisOf(this)?.result.lcl), ctx.i18n.getLanguage()); },
      /** Die Regelkarte der letzten `lastN` Punkte; null ohne Daten oder ausgeblendet. */
      get chart() {
        const a = analysisOf(this);
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
