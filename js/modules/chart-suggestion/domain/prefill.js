/**
 * D.Mike — Diagramm-Vorschlag: Vorbelegungen. Rein.
 *
 * Abbildung Diagrammtyp → Zustand des Zielmoduls in dessen Altform. Die
 * Zielmodule nehmen diese Form an und gleichen sie beim Laden an.
 */

function _ref(srcId, sheetId, col) {
  return { instanceId: srcId, sheetId, columnId: col.id };
}

/**
 * Prefill adapters: suggestion chart-type → target module state. Each maps the
 * selected column snapshot to the initial state shape the corresponding full
 * module expects. Returns null when the columns don't satisfy that module's
 * minimums. Pure — no DOM, no i18n.
 */
export const MODULE_PREFILL = {
  histogram(cols, srcId, sheetId) {
    const cont = cols.filter(c => c.role === 'continuous');
    if (cont.length === 0) return null;
    return {
      target: 'histogram',
      state: {
        datasets: cont.map(c => ({ valueRef: _ref(srcId, sheetId, c), groupRef: null })),
      },
    };
  },
  xy(cols, srcId, sheetId) {
    const cont = cols.filter(c => c.role === 'continuous');
    if (cont.length < 2) return null;
    return {
      target: 'xy-plot',
      state: {
        datasets: [{
          xRef: _ref(srcId, sheetId, cont[0]),
          yRef: _ref(srcId, sheetId, cont[1]),
          groupRef: null,
        }],
      },
    };
  },
  run(cols, srcId, sheetId) {
    const cont = cols.filter(c => c.role === 'continuous');
    if (cont.length === 0) return null;
    return { target: 'run-chart', state: { columnRef: _ref(srcId, sheetId, cont[0]) } };
  },
  imr(cols, srcId, sheetId) {
    // The control-chart module plots in row order; with a date column the
    // preview sorts by date, so opening it would show a different chart.
    if (cols.some(c => c.role === 'date')) return null;
    const cont = cols.filter(c => c.role === 'continuous');
    if (cont.length === 0) return null;
    return { target: 'control-chart', state: { chartTypeId: 'i-mr', columnRef: _ref(srcId, sheetId, cont[0]) } };
  },
  transformedImr(cols, srcId, sheetId) {
    const cont = cols.filter(c => c.role === 'continuous');
    if (cont.length === 0) return null;
    return { target: 'transformed-imr-chart', state: { columnRef: _ref(srcId, sheetId, cont[0]), lambdaMode: 'auto' } };
  },
  boxplot(cols, srcId, sheetId) {
    const cont = cols.filter(c => c.role === 'continuous');
    const grp = cols.find(c => c.role === 'categorical' || c.role === 'ordinal');
    if (cont.length === 0) return null;
    const grpRef = grp ? _ref(srcId, sheetId, grp) : null;
    return {
      target: 'boxplot',
      state: {
        seriesRefs: cont.map(c => _ref(srcId, sheetId, c)),
        groupRefs:  cont.map(() => grpRef),
      },
    };
  },
  ivp(cols, srcId, sheetId) {
    const cont = cols.filter(c => c.role === 'continuous');
    const grp = cols.find(c => c.role === 'categorical' || c.role === 'ordinal');
    if (cont.length === 0) return null;
    const grpRef = grp ? _ref(srcId, sheetId, grp) : null;
    return {
      target: 'individual-value-plot',
      state: {
        seriesRefs: cont.map(c => _ref(srcId, sheetId, c)),
        groupRefs:  cont.map(() => grpRef),
      },
    };
  },
  probability(cols, srcId, sheetId) {
    const cont = cols.filter(c => c.role === 'continuous');
    if (cont.length === 0) return null;
    return { target: 'probability-plot', state: { columnRef: _ref(srcId, sheetId, cont[0]) } };
  },
  bar(cols, srcId, sheetId) {
    const cont = cols.filter(c => c.role === 'continuous');
    const cat  = cols.filter(c => c.role === 'categorical' || c.role === 'ordinal');
    if (cat.length >= 2) {
      return {
        target: 'bar',
        state: {
          xRef: _ref(srcId, sheetId, cat[0]),
          gRef: _ref(srcId, sheetId, cat[1]),
          yRef: null,
          chartConfig: { stacked: true, aggregation: 'mean' },
        },
      };
    }
    if (cont.length >= 1 && cat.length >= 1) {
      return {
        target: 'bar',
        state: {
          xRef: _ref(srcId, sheetId, cat[0]),
          yRef: _ref(srcId, sheetId, cont[0]),
          gRef: null,
        },
      };
    }
    const cc = cat[0] || cont[0];
    if (!cc) return null;
    return { target: 'bar', state: { xRef: _ref(srcId, sheetId, cc), yRef: null, gRef: null } };
  },
  pareto(cols, srcId, sheetId) {
    const cat  = cols.filter(c => c.role === 'categorical' || c.role === 'ordinal');
    const cont = cols.filter(c => c.role === 'continuous');
    if (cat.length >= 2) {
      return {
        target: 'pareto',
        state: { xRef: _ref(srcId, sheetId, cat[0]), gRef: _ref(srcId, sheetId, cat[1]), yRef: null },
      };
    }
    const cc = cat[0] || cont[0];
    if (!cc) return null;
    return { target: 'pareto', state: { xRef: _ref(srcId, sheetId, cc), yRef: null, gRef: null } };
  },
  mosaic(cols, srcId, sheetId) {
    const cat = cols.filter(c => c.role === 'categorical' || c.role === 'ordinal');
    if (cat.length < 2) return null;
    return {
      target: 'mosaic',
      state: { xRef: _ref(srcId, sheetId, cat[0]), gRef: _ref(srcId, sheetId, cat[1]) },
    };
  },
  heatmap(cols, srcId, sheetId) {
    const cat  = cols.filter(c => c.role === 'categorical' || c.role === 'ordinal');
    const cont = cols.filter(c => c.role === 'continuous');
    if (cat.length < 2) return null;
    if (cont.length >= 1) {
      return {
        target: 'heatmap',
        state: {
          xRef: _ref(srcId, sheetId, cat[1]),
          gRef: _ref(srcId, sheetId, cat[0]),
          vRef: _ref(srcId, sheetId, cont[0]),
          chartConfig: { aggregation: 'mean', valueDecimals: 2 },
        },
      };
    }
    return {
      target: 'heatmap',
      state: { xRef: _ref(srcId, sheetId, cat[1]), gRef: _ref(srcId, sheetId, cat[0]), vRef: null },
    };
  },
};

/**
 * Suggestion chart-type → prefill adapter. Types not in this table have no
 * open-in-module button (pie, ewma, scatter-matrix, and preview-only
 * composites like main-effects / interaction-plot / scatter-marginal / cusum).
 */
export const CHART_TYPE_TO_PREFILL = {
  'histogram':             MODULE_PREFILL.histogram,
  'scatter':               MODULE_PREFILL.xy,
  'run-chart':             MODULE_PREFILL.run,
  'control-chart':         MODULE_PREFILL.imr,
  'transformed-imr-chart': MODULE_PREFILL.transformedImr,
  'boxplot':               MODULE_PREFILL.boxplot,
  'individual-value-plot': MODULE_PREFILL.ivp,
  'probability-plot':      MODULE_PREFILL.probability,
  'bar':                   MODULE_PREFILL.bar,
  'pareto':                MODULE_PREFILL.pareto,
  'mosaic':                MODULE_PREFILL.mosaic,
  'heatmap':               MODULE_PREFILL.heatmap,
};
/**
 * Vorbelegung des Zielmoduls für einen Diagrammtyp, oder null, wenn der Typ
 * kein Zielmodul hat, die Quelle fehlt oder die Spalten dessen Minimum nicht erfüllen.
 * @param {string|null} type
 * @param {Array<{ id: string, role: string }>} cols
 * @param {string} sourceInstanceId
 * @param {string} sourceSheetId
 * @returns {{ target: string, state: object }|null}
 */
export function buildPrefill(type, cols, sourceInstanceId, sourceSheetId) {
  const fn = CHART_TYPE_TO_PREFILL[type];
  if (!fn) return null;
  if (!sourceInstanceId || !sourceSheetId) return null;
  return fn(cols || [], sourceInstanceId, sourceSheetId);
}

/**
 * Vorbelegung des Zielmoduls für einen Typ und die gewählten Bezüge, oder null ohne Bezug.
 * @param {Array<{ instanceId: string, sheetId?: string, columnId: string }>} refs die gewählten Spaltenbezüge (der erste gibt die Quelle)
 * @param {string|null} type
 * @param {Array<{ id: string, role: string }>} cols
 * @returns {{ target: string, state: object }|null}
 */
export function prefillFor(refs, type, cols) {
  const first = refs[0];
  if (!first) return null;
  return buildPrefill(type, cols, first.instanceId, first.sheetId ?? '');
}
