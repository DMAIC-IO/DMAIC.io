/**
 * D.Mike — Attribute Control Chart Model (attribute-control-chart-model.js)
 *
 * Pure state container for the attribute control chart module. Holds the
 * persisted user inputs only: chart type, the referenced defect/size columns,
 * the constant subgroup size, the baseline window, the enabled Nelson rules,
 * and the id of any worksheet provisioned by an example load.
 *
 * Contains NO view logic, NO i18n and NO chartManager calls. The SPC analysis
 * (control limits, violations) is computed transiently in the view layer via
 * the attribute-control-chart engine, so it is intentionally NOT persisted here.
 *
 * The persisted JSON shape is identical to the legacy module's getState().
 */

import { ATTRIBUTE_CHART_TYPES, ATTR_DEFAULT_ENABLED_RULES } from '../../engines/attribute-control-chart-engine.js';

/** Valid chart type ids ('p' | 'np' | 'c' | 'u'). */
const CHART_TYPE_IDS = ATTRIBUTE_CHART_TYPES.map(t => t.id);

/**
 * Restore a worksheet column reference from persisted JSON, or null.
 * @param {*} d
 * @returns {{instanceId:string,sheetId:string,columnId:string}|null}
 */
function columnRefFromJSON(d) {
  if (!d || typeof d !== 'object') return null;
  if (d.instanceId == null || d.sheetId == null || d.columnId == null) return null;
  return {
    instanceId: String(d.instanceId),
    sheetId: String(d.sheetId),
    columnId: String(d.columnId),
  };
}

export class State {
  /** Chart type: 'p' | 'np' | 'c' | 'u'. */
  chartTypeId = 'p';

  /** Referenced defect/count worksheet column, or null. */
  defectsRef = null;

  /** Referenced sample-size/units worksheet column (p, u), or null. */
  sizeRef = null;

  /** Constant subgroup size n (np chart). */
  constantN = 50;

  /** Baseline window length, or null = use all points. */
  baselineCount = null;

  /** Enabled Nelson rule ids. */
  enabledRules = [...ATTR_DEFAULT_ENABLED_RULES];

  /** Instance id of a worksheet provisioned by loadExample (for cleanup on re-load). */
  exampleWorksheetId = null;

  /** @returns {boolean} true if a defect or size column is selected (drives confirmPopout). */
  hasContent() {
    return Boolean(this.defectsRef) || Boolean(this.sizeRef);
  }

  toJSON() {
    return {
      chartTypeId: this.chartTypeId,
      defectsRef: this.defectsRef ? { ...this.defectsRef } : null,
      sizeRef: this.sizeRef ? { ...this.sizeRef } : null,
      constantN: this.constantN,
      baselineCount: this.baselineCount,
      enabledRules: [...this.enabledRules],
      exampleWorksheetId: this.exampleWorksheetId,
    };
  }

  /**
   * Deserialize and validate. Always returns a valid State, even for
   * null/undefined/malformed input.
   * @param {*} d
   * @returns {State}
   */
  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;

    s.chartTypeId = CHART_TYPE_IDS.includes(d.chartTypeId) ? d.chartTypeId : 'p';
    s.defectsRef = columnRefFromJSON(d.defectsRef);
    s.sizeRef = columnRefFromJSON(d.sizeRef);

    const n = d.constantN;
    s.constantN = (Number.isFinite(n) && n > 0) ? n : 50;

    s.baselineCount = Number.isFinite(d.baselineCount) ? d.baselineCount : null;

    s.enabledRules = Array.isArray(d.enabledRules)
      ? d.enabledRules.filter(r => Number.isFinite(r))
      : [...ATTR_DEFAULT_ENABLED_RULES];

    s.exampleWorksheetId = typeof d.exampleWorksheetId === 'string' ? d.exampleWorksheetId : null;

    return s;
  }
}
