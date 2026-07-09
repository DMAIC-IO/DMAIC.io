/**
 * D.Mike — Chart Suggestion Model (chart-suggestion-model.js)
 *
 * Pure state + business logic for the chart-suggestion recommender. Holds the
 * column selection snapshot, the user's picked chart type and the id of any
 * provisioned example worksheet. The ranked suggestion list is DERIVED from the
 * selection (recomputed, never persisted).
 *
 * The ranking itself is delegated to the shared core rule-engine
 * (`core/chart-suggestions/chart-suggestions.js` — pure, no DOM/i18n). This
 * Model only owns the selection state, pick-preservation and the prefill
 * adapters (column snapshot → target-module state). No DOM, no i18n, no CSS.
 */

import { getSuggestionsFor } from '../../core/chart-suggestions/chart-suggestions.js';

/** Deep-clone a single column snapshot ({id,name,role,type,values}). */
function cloneColumn(c) {
  return {
    id: c.id,
    name: c.name,
    role: c.role,
    type: c.type,
    values: Array.isArray(c.values) ? c.values.slice() : [],
  };
}

/** Deep-clone a selection ({sourceInstanceId,sourceSheetId,ts,columns[]}) or null. */
function cloneSelection(s) {
  if (!s || typeof s !== 'object') return null;
  return {
    sourceInstanceId: s.sourceInstanceId ?? null,
    sourceSheetId: s.sourceSheetId ?? null,
    ts: typeof s.ts === 'number' ? s.ts : null,
    columns: Array.isArray(s.columns) ? s.columns.map(cloneColumn) : [],
  };
}

function _ref(srcId, sheetId, col) {
  return { instanceId: srcId, sheetId, columnId: col.id };
}

/**
 * Prefill adapters: suggestion chart-type → target module state. Each maps the
 * selected column snapshot to the initial state shape the corresponding full
 * module expects. Returns null when the columns don't satisfy that module's
 * minimums. Pure — no DOM, no i18n.
 */
const MODULE_PREFILL = {
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
 * open-in-module button (pie, control-chart, scatter-matrix, and preview-only
 * composites like main-effects / interaction-plot / scatter-marginal / cusum).
 */
export const CHART_TYPE_TO_PREFILL = {
  'histogram':             MODULE_PREFILL.histogram,
  'scatter':               MODULE_PREFILL.xy,
  'run-chart':             MODULE_PREFILL.run,
  'boxplot':               MODULE_PREFILL.boxplot,
  'individual-value-plot': MODULE_PREFILL.ivp,
  'probability-plot':      MODULE_PREFILL.probability,
  'bar':                   MODULE_PREFILL.bar,
  'pareto':                MODULE_PREFILL.pareto,
  'mosaic':                MODULE_PREFILL.mosaic,
  'heatmap':               MODULE_PREFILL.heatmap,
};

export class State {
  /** @type {{sourceInstanceId,sourceSheetId,ts,columns:Array}|null} */
  selection = null;
  /** @type {string|null} currently-picked chart type */
  selectedChartType = null;
  /** @type {string|null} provisioned example worksheet instanceId */
  exampleWorksheetId = null;

  /** Derived (not persisted): ranked suggestions for the current selection. */
  suggestions = [];

  /**
   * Recompute the ranked suggestion list from the current selection and
   * preserve the user's pick when still valid, else pick the top-ranked one
   * (or null when there are no suggestions). Mirrors legacy _recomputeSuggestions.
   */
  recomputeSuggestions() {
    const cols = this.selection && Array.isArray(this.selection.columns) ? this.selection.columns : [];
    if (cols.length === 0) {
      this.suggestions = [];
      return this.suggestions;
    }
    this.suggestions = getSuggestionsFor(cols);
    const stillValid = this.selectedChartType
      && this.suggestions.some(s => s.type === this.selectedChartType);
    if (!stillValid) {
      this.selectedChartType = this.suggestions[0]?.type || null;
    }
    return this.suggestions;
  }

  /**
   * Build a prefill payload for the currently-selected chart type, or null when
   * the type has no corresponding standalone module or the selection lacks a
   * source worksheet. Pure (no DOM). Mirrors legacy _buildPrefill.
   */
  buildPrefill() {
    const fn = CHART_TYPE_TO_PREFILL[this.selectedChartType];
    if (!fn) return null;
    const sel = this.selection;
    if (!sel || !sel.sourceInstanceId || !sel.sourceSheetId) return null;
    return fn(sel.columns || [], sel.sourceInstanceId, sel.sourceSheetId);
  }

  /** True when the selection carries at least one column (drives loadExample confirm). */
  hasContent() {
    return Boolean(this.selection && Array.isArray(this.selection.columns) && this.selection.columns.length > 0);
  }

  toJSON() {
    return {
      selection: cloneSelection(this.selection),
      selectedChartType: typeof this.selectedChartType === 'string' ? this.selectedChartType : null,
      exampleWorksheetId: typeof this.exampleWorksheetId === 'string' ? this.exampleWorksheetId : null,
    };
  }

  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;
    s.selection = cloneSelection(d.selection);
    s.selectedChartType = typeof d.selectedChartType === 'string' ? d.selectedChartType : null;
    s.exampleWorksheetId = typeof d.exampleWorksheetId === 'string' ? d.exampleWorksheetId : null;
    s.recomputeSuggestions();
    return s;
  }
}
