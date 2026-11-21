/**
 * D.Mike — Kachel der Prozessfähigkeit
 *
 * „Ist der Prozess fähig?“ — Cpk-Ampel, Ppk, PPM, n und ein kompaktes
 * Histogramm (Widget `histogram-chart`). Form: createTile
 * (core/template-tile.js); Einstellungen in settings.js, Markup in
 * resources/tile.html. Die Analyse ist das derived `analysis` des Models;
 * die Werte fürs Histogramm kommen über `ctx.source`.
 */
import { createTile } from '../../../core/template-tile.js';
import { sourceColumns } from '../../../core/source-columns.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { inputValues, formatHint, specRefLines } from '../domain/analyze.js';
import { fmt as formatNumber } from '../domain/format.js';
import { Settings } from './settings.js';

/** ppmBasis-Einstellung → Feld des Ergebnisses. */
const PPM_FIELD = { overall: 'ppmTotal', within: 'ppmWithinTotal', observed: 'ppmObservedTotal' };

/** Cpk-Urteil → Zusatzklasse der SPC-Kennzahl. */
const CPK_MODIFIER = { pass: 'ok', warn: 'warn', fail: 'bad' };

/** Feste Nachkommastellen, `—` ohne endlichen Wert (etwa Cp bei Streuung 0). @param {any} v @param {number} d @returns {string} */
const fmt = (v, d) => (Number.isFinite(v) ? formatNumber(v, d) : '—');

export default createTile({
  descriptor,
  Model: State,
  Settings,
  size: { defaultW: 3, defaultH: 10, minW: 2, minH: 6 },
  titlePrefix: 'Cpk',
  refreshOn: ['state:saved', 'resize', 'worksheet:dataChanged'],

  /** @type {import('./settings.types.js').ProcessCapabilityTileViewFn} */
  view(ctx) {
    // `this.analysis` ist der Getter des Kerns für das derived `analysis`; ein Wurf kommt als `{ error }` an
    // und zählt wie „keine Analyse“ (etwa wenn die Messspalte gelöscht wurde).
    /** @param {any} scope @returns {any} die Analyse oder null */
    const analysisOf = (scope) => { const a = scope.analysis; return a && !a.error ? a : null; };
    return {
      /** Leertext, sonst null. */
      get empty() {
        const a = analysisOf(this);
        if (!a || a.empty) return ctx.i18n.t(a ? 'dashboard.capabilityEmpty' : 'dashboard.capabilityNoData');
        return a.result ? null : ctx.i18n.t('dashboard.capabilityNoData');
      },
      /** Hinweis zu Schätzer oder ID-Spalte, sonst null. */
      get hint() {
        const a = analysisOf(this);
        return a && !a.empty ? formatHint(a.hint, this.t) || null : null;
      },
      get metrics() {
        const r = analysisOf(this)?.result;
        if (!r) return [];
        return [
          { modifier: `dashboard-spc__metric--${CPK_MODIFIER[r.cpkStatus] || 'warn'}`, value: fmt(r.Cpk, 2), label: 'Cpk',
            sub: r.Cp != null ? `Cp = ${fmt(r.Cp, 2)}` : null },
          { modifier: '', value: fmt(r.Ppk, 2), label: 'Ppk', sub: null },
        ];
      },
      get stats() {
        const r = analysisOf(this)?.result;
        if (!r) return [];
        const ppm = r[PPM_FIELD[this.settings.ppmBasis]];
        return [
          { label: ctx.i18n.t('dashboard.capabilityPpm'), value: Number.isFinite(ppm) ? String(Math.round(ppm)) : '—' },
          { label: 'n', value: String(r.n) },
        ];
      },
      /** Die Histogramm-Konfiguration; null ohne Ergebnis oder ausgeblendet. */
      get chart() {
        const r = analysisOf(this)?.result;
        if (!r || !this.settings.showChart) return null;
        return {
          data: inputValues(this.model, sourceColumns(ctx.source)),
          showNormalCurve: true,
          barColor: 'var(--color-accent)',
          normalCurveColor: 'var(--color-info)',
          refLines: specRefLines(r, (key) => ctx.i18n.t(key)),
          xLabel: this.t('histogramXLabel'),
          yLabel: this.t('histogramYLabel'),
          showTitle: false, showXLabel: false, showYLabel: false,
          showXTicks: false, showYTicks: false, showLegend: false,
        };
      },
    };
  },
});
