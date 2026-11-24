/**
 * D.Mike — SPC-Kachel der Regelkarte
 *
 * Eine Kachel je Instanz (`spc:<instanceId>`): Kartentyp und Spalte, CL,
 * Grenzen und σ̂ der ersten Teilkarte, Verletzungen, Werte außerhalb der
 * Spezifikation und Cpk sowie eine kompakte Regelkarte (Widget
 * `control-chart`). Form: createTile (core/template-tile.js); Einstellungen
 * in settings.js, Markup in resources/tile.html.
 *
 * Die Kachel rechnet eigen (`tileAnalysisOf`): ohne Stufen, ohne
 * ausgeschlossene Punkte und ohne eingefrorene Grenzen, Fähigkeit über alle
 * Werte. Das Arbeitsblatt liest sie nur über `ctx.source`.
 */
import { createTile } from '../../../core/template-tile.js';
import { sourceColumns } from '../../../core/source-columns.js';
import { formatNumber } from '../../../core/number-format.js';
import { getChartType } from '../../../engines/control-chart-engine.js';
import { windowed } from '../../../ui/tile-chart-window.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { tileAnalysisOf } from '../domain/analyze.js';
import { Settings } from './settings.js';

/**
 * Feste Nachkommastellen in der App-Sprache, `—` ohne endlichen Wert.
 * @param {number|null|undefined} v @param {number} decimals @param {string} lang @returns {string}
 */
const fmt = (v, decimals, lang) => (Number.isFinite(v) ? formatNumber(/** @type {number} */ (v), lang, { decimals }) : '—');

/** Eine Grenze als Liste (das Widget nimmt Listen). @param {number|number[]} v @returns {number[]} */
const asList = (v) => (Array.isArray(v) ? [...v] : [v]);

/**
 * Cpk-Urteil als Zusatzklasse der Kennzahl.
 * @param {number} cpk @returns {string}
 */
const cpkModifier = (cpk) => (cpk >= 1.33 ? 'ok' : cpk >= 1.0 ? 'warn' : 'bad');

export default createTile({
  descriptor,
  Model: State,
  Settings,
  size: { defaultW: 3, defaultH: 10, minW: 2, minH: 6 },
  titlePrefix: 'SPC',
  refreshOn: ['state:saved', 'resize', 'worksheet:dataChanged'],

  /**
   * Eine Kachel je Instanz; die Id `spc:<instanceId>` tragen gespeicherte
   * Layouts, Kachel-Einstellungen und Titel.
   * @param {{ i18n: any, findInstances: (id: string) => Array<{ instanceId: string, customName?: string }> }} ctx
   * @returns {Array<{ tileId: string, instanceId: string, title: string }>}
   */
  enumerate(ctx) {
    return ctx.findInstances('control-chart').map((inst) => ({
      tileId: `spc:${inst.instanceId}`,
      instanceId: inst.instanceId,
      title: `SPC — ${inst.customName || ctx.i18n.t('modules.control-chart.name')}`,
    }));
  },

  /** @type {import('../../../core/template-tile.js').TileViewFn<Readonly<import('../domain/model.types.js').StateModel>, { lastN: number, showChart: boolean }>} */
  view(ctx) {
    const lang = () => ctx.i18n.getLanguage();
    /** @param {any} scope @returns {any} die Rechnung der Kachel, wenn sie gelang, sonst null */
    const okOf = (scope) => { const a = scope.analysis; return a && a.status === 'ok' ? a : null; };
    // Der Scope ist ein Schnappschuss je Rendern: die Rechnung läuft einmal.
    /** @type {any} */
    let memo;
    /** Ein Kennwert der ersten Teilkarte mit vier Nachkommastellen. @param {any} scope @param {string} key @param {string} label @returns {{ label: string, value: string }} */
    const stat = (scope, key, label) => ({ label: scope.t(label), value: fmt(okOf(scope)?.primary[key], 4, lang()) });
    return {
      /** Rechnung der Kachel über die Werte der Spalte; null ohne Spalte oder unter zwei Werten, sonst `ok` oder `error`. */
      get analysis() {
        if (memo !== undefined) return memo;
        const ref = this.model.columnRef;
        memo = ref ? tileAnalysisOf(this.model, sourceColumns(ctx.source).values(ref)) : null;
        return memo;
      },
      /** Leertext, sonst null; ein Rechenfehler zählt wie „keine Daten“. */
      get empty() {
        if (!this.model.columnRef) return ctx.i18n.t('dashboard.spcEmpty');
        return okOf(this) ? null : ctx.i18n.t('dashboard.spcNoData');
      },
      get typeLabel() {
        const a = okOf(this);
        return a ? this.t(`tile.typeLabel_${a.chartTypeId}`) : '';
      },
      get colName() {
        const ref = this.model.columnRef;
        return (ref && sourceColumns(ctx.source).name(ref)) || '?';
      },
      get statCL() { return stat(this, 'cl', 'tile.statCL'); },
      get statUCL() { return stat(this, 'ucl', 'tile.statUCL'); },
      get statLCL() { return stat(this, 'lcl', 'tile.statLCL'); },
      get statSigma() { return stat(this, 'sigma', 'tile.statSigma'); },
      /** Die vier Kennwerte in der Reihenfolge der Kachel. */
      get stats() { return [this.statCL, this.statUCL, this.statLCL, this.statSigma]; },
      /** „von n Punkten“ unter den Zählern. */
      get of() { return ctx.i18n.t('dashboard.spcOf', { total: okOf(this)?.totalPoints ?? 0 }); },
      /** Verletzende Punkte (ohne Doppelte). */
      get violations() {
        const n = okOf(this)?.violationIndices.length ?? 0;
        return {
          modifier: `dashboard-spc__metric--${n === 0 ? 'ok' : 'bad'}`,
          value: String(n),
          label: ctx.i18n.t('dashboard.spcViolations'),
          sub: this.of,
        };
      },
      /** Werte außerhalb der Spezifikation; null ohne Grenze. */
      get outOfSpec() {
        const n = okOf(this)?.outOfSpec;
        if (n == null) return null;
        return {
          modifier: `dashboard-spc__metric--${n === 0 ? 'ok' : 'warn'}`,
          value: String(n),
          label: ctx.i18n.t('dashboard.spcOutOfSpec'),
          sub: this.of,
        };
      },
      /** Cpk mit „Cp = …“; null ohne Fähigkeit. */
      get cpk() {
        const c = okOf(this)?.capability;
        if (!c) return null;
        const l = lang();
        return {
          modifier: `dashboard-spc__metric--${cpkModifier(c.cpk)}`,
          value: fmt(c.cpk, 3, l),
          label: this.t('statCpk'),
          sub: c.cp ? this.t('statCp', { v: fmt(c.cp, 3, l) }) : null,
        };
      },
      /** Die Regelkarte der letzten `lastN` Punkte; null ohne Daten oder ausgeblendet. */
      get chart() {
        const a = okOf(this);
        if (!a || !this.settings.showChart) return null;
        const win = windowed(a.primary, new Set(a.violationIndices), a.baselineEnd, this.settings.lastN);
        const yLabel = getChartType(a.chartTypeId)?.subcharts[0].yLabel;
        return {
          ...win,
          cl: asList(win.cl), ucl: asList(win.ucl), lcl: asList(win.lcl),
          ...(win.sigma == null ? {} : { sigma: asList(win.sigma) }),
          violationIndices: [...win.violationIndices],
          usl: this.model.usl ?? null, lsl: this.model.lsl ?? null,
          showZones: true,
          xLabel: this.t('xLabelSample'),
          yLabel: yLabel?.[lang()] || yLabel?.de || '',
          showTitle: false, showXLabel: false, showYLabel: false,
          showXTicks: false, showYTicks: false, showLegend: false,
        };
      },
    };
  },
});
