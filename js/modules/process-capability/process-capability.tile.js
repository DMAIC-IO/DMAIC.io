/**
 * D.Mike — Process capability dashboard tile (process-capability.tile.js)
 *
 * "Is the process capable?" — Cpk traffic light, Ppk, PPM, n and a compact
 * histogram through the tile-bound chartManager (editor edits persist per
 * tile). One tile per instance; source/copies via the host. Imports only the
 * pure domain files. The markup lives in
 * process-capability.tile.html. Tile contract: the lifecycle in js/pages/dashboard/tile-render.js.
 */

import { getColumnValues } from '../../ui/column-picker.js';
import { State } from './domain/model.js';
import { analyze, inputValues, formatHint, specRefLines } from './domain/analyze.js';
import { fmt as formatNumber } from './domain/format.js';
import { showChart, chartSlot } from '../../ui/tile-kit.js';

/** ppmBasis setting → engine result field. */
const PPM_FIELD = { overall: 'ppmTotal', within: 'ppmWithinTotal', observed: 'ppmObservedTotal' };

/** Engine cpkStatus → SPC metric modifier. */
const CPK_MODIFIER = { pass: 'ok', warn: 'warn', fail: 'bad' };

/** Fixed decimals, '—' when missing or not finite (e.g. Cp with a within-sigma of 0). */
function fmt(v, d) {
  return Number.isFinite(v) ? formatNumber(v, d) : '—';
}

/** PPM as a whole number, '—' when not finite. */
function ppmText(v) {
  return Number.isFinite(v) ? String(Math.round(v)) : '—';
}

export default {
  size: { defaultW: 3, defaultH: 10, minW: 2, minH: 6 },
  titlePrefix: 'Cpk',
  refreshOn: ['state:saved', 'resize'],
  settings: {
    ppmBasis: {
      type: 'select', options: ['overall', 'within', 'observed'], default: 'overall',
      label: 'dashboard.tileSettings.ppmBasis',
      optionLabels: {
        overall: 'dashboard.tileSettings.ppmOverall',
        within: 'dashboard.tileSettings.ppmWithin',
        observed: 'dashboard.tileSettings.ppmObserved',
      },
    },
    showChart: showChart(),
  },

  template: 'js/modules/process-capability/process-capability.tile.html',

  /**
   * Cpk traffic light, Ppk, PPM, n, the analysis hint and the histogram
   * config (null when hidden).
   * @param {{state: object, settings: {ppmBasis: string, showChart: boolean}, i18n: object,
   *   stateManager: object}} args
   * @returns {object} view model for process-capability.tile.html
   */
  viewModel({ state, settings, i18n, stateManager }) {
    const t = (key, params) => i18n.t(`modules.process-capability.${key}`, params);
    const model = State.fromJSON(state ?? null);
    const read = { values: (ref) => getColumnValues(stateManager, ref), name: () => null };
    const a = analyze(model, read);
    const hint = formatHint(a.hint, t) || null;
    const none = (key, hintText) => ({ empty: i18n.t(key), hint: hintText, metrics: [], stats: [], chart: null });

    if (a.empty) return none('dashboard.capabilityEmpty', null);
    if (!a.result) return none('dashboard.capabilityNoData', hint);

    const r = a.result;
    return {
      empty: null,
      hint,
      metrics: [
        { modifier: `dashboard-spc__metric--${CPK_MODIFIER[r.cpkStatus] || 'warn'}`, value: fmt(r.Cpk, 2), label: 'Cpk',
          sub: r.Cp != null ? `Cp = ${fmt(r.Cp, 2)}` : null },
        { modifier: '', value: fmt(r.Ppk, 2), label: 'Ppk', sub: null },
      ],
      stats: [
        { label: i18n.t('dashboard.capabilityPpm'), value: ppmText(r[PPM_FIELD[settings.ppmBasis]]) },
        { label: 'n', value: String(r.n) },
      ],
      chart: settings.showChart
        ? {
          data: inputValues(model, read),
          binMethod: 'sturges',
          showNormalCurve: true,
          barColor: 'var(--color-accent)',
          normalCurveColor: 'var(--color-info)',
          refLines: specRefLines(r, (key) => i18n.t(key)),
          xLabel: i18n.t('modules.process-capability.histogramXLabel'),
          yLabel: i18n.t('modules.process-capability.histogramYLabel'),
          showTitle: false, showXLabel: false, showYLabel: false,
          showXTicks: false, showYTicks: false, showLegend: false,
        }
        : null,
    };
  },

  ...chartSlot('histogram'),
};
