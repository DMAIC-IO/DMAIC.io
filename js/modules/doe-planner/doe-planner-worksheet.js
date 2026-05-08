/**
 * D.Mike — DoE Planner: Worksheet Integration Helper (doe-planner-worksheet.js)
 *
 * Creates and reads dedicated Worksheet instances for DoE experiment plans.
 * Each DoE plan gets its own Worksheet in the 'data' phase.
 *
 * Follows the same pattern as MSA modules (msa-typ1.js, msa-typ2.js).
 */

// ─── Create Worksheet ──────────────────────────────────────────────

/**
 * @typedef {object} WorksheetRef
 * @property {string} instanceId - Worksheet module instance ID
 * @property {string} sheetId - Sheet ID within the workbook
 * @property {string[]} factorColumnIds - Column IDs for factors (ordered)
 * @property {string[]} responseColumnIds - Column IDs for responses (ordered)
 * @property {string[]} meanColumnIds - Column IDs for replicate-mean helper columns (parallel to responseColumnIds; empty if no replicates)
 * @property {string[]} lnVarColumnIds - Column IDs for replicate-ln(var) helper columns (parallel to responseColumnIds; empty if no replicates)
 * @property {string} runOrderColumnId - Column ID for run order
 * @property {string} stdOrderColumnId - Column ID for standard order
 * @property {string|null} experimentId - Experiment id (back-reference into state.experiments[])
 */

/**
 * Create a new Worksheet instance populated with the design matrix.
 *
 * Structural columns (run order, std order, block, replicate, factors) are written
 * with `column.meta.lock = 'hard'` so the user cannot accidentally edit the design.
 * For replicated designs (`replicates > 1`), two helper columns per response are
 * added (mean + ln(variance), `lock: 'soft'`) with formulas that aggregate over
 * runs sharing the same Standard Order.
 *
 * @param {object} context - Module context (eventBus, stateManager, i18n)
 * @param {object} design - Design result from generateDesign()
 * @param {number[][]} design.actualMatrix - Real-value design matrix
 * @param {number[]} design.runOrder - Run order (1-based)
 * @param {number[]} design.stdOrder - Standard order (1-based)
 * @param {object[]} factors - Factor definitions [{name, unit, levels}]
 * @param {object[]} responses - Response definitions [{name, unit, goal}]
 * @param {string} doeName - Name of the DoE plan (used as sheet name)
 * @param {string} [phase='improve'] - DMAIC phase to register the worksheet in
 * @param {string|null} [experimentId=null] - Optional id to embed in column.meta.managedRef
 * @returns {WorksheetRef}
 */
export function createDesignWorksheet(context, design, factors, responses, doeName, phase = 'improve', experimentId = null) {
  const { stateManager: sm, eventBus, i18n } = context;

  // Generate IDs
  const wsInstanceId = crypto.randomUUID();
  const sheetId = 'sheet_1';
  const managedRef = experimentId ? `experiment:${experimentId}` : null;

  // Helper to build a `meta` block — keeps each column definition compact.
  const lockMeta = (lock, reason) => ({
    lock, managedBy: 'doe-planner', managedRef, reason,
  });

  // Build columns
  const columns = [];
  const factorColumnIds = [];
  const responseColumnIds = [];
  const meanColumnIds = [];
  const lnVarColumnIds = [];
  const nRuns = design.actualMatrix.length;
  const hasReplicates = nRuns > 0 && Array.isArray(design.replicateIds)
    && design.replicateIds.some(v => v > 1);

  // Localized name for the std-order column — needed to build replicate-aggregate formulas
  // that reference it by name.
  const stdOrderName = i18n.t('modules.doe-planner.colStdOrder');

  // RunOrder column
  const runOrderColId = crypto.randomUUID();
  columns.push({
    id: runOrderColId,
    name: i18n.t('modules.doe-planner.colRunOrder'),
    shortName: 'C1',
    type: 'numeric',
    unit: '',
    values: design.runOrder.map(v => v),
    formulas: new Array(nRuns).fill(null),
    format: { decimals: 0 },
    meta: lockMeta('hard', 'run-order'),
  });

  // StdOrder column — also serves as group id for replicate aggregates,
  // so it stays hard-locked even though aggregates depend on it.
  const stdOrderColId = crypto.randomUUID();
  columns.push({
    id: stdOrderColId,
    name: stdOrderName,
    shortName: 'C2',
    type: 'numeric',
    unit: '',
    values: design.stdOrder.map(v => v),
    formulas: new Array(nRuns).fill(null),
    format: { decimals: 0 },
    meta: lockMeta('hard', 'group-id'),
  });

  // Block column (always 1 for now — multi-block support in Phase E)
  columns.push({
    id: crypto.randomUUID(),
    name: i18n.t('modules.doe-planner.colBlock'),
    shortName: `C${columns.length + 1}`,
    type: 'numeric',
    unit: '',
    values: new Array(nRuns).fill(1),
    formulas: new Array(nRuns).fill(null),
    format: { decimals: 0 },
    meta: lockMeta('hard', 'block-column'),
  });

  // Replicate column
  columns.push({
    id: crypto.randomUUID(),
    name: i18n.t('modules.doe-planner.colReplicate'),
    shortName: `C${columns.length + 1}`,
    type: 'numeric',
    unit: '',
    values: (design.replicateIds || new Array(nRuns).fill(1)).map(v => v),
    formulas: new Array(nRuns).fill(null),
    format: { decimals: 0 },
    meta: lockMeta('hard', 'replicate-id'),
  });

  // Factor columns. For categorical factors the natural-units column carries
  // the level *labels* (strings); a `categoricalCoding` map on the column meta
  // tells consumers (regression, correlation, plots) how to translate each
  // label back to ±1 for numerical work. For continuous factors the column
  // stays numeric and the meta has no coding.
  factors.forEach((f, fi) => {
    const colId = crypto.randomUUID();
    factorColumnIds.push(colId);
    const letter = String.fromCharCode(65 + fi);
    const isCategorical = f.kind === 'categorical';
    let values;
    let coding = null;
    if (isCategorical) {
      const nLevels = f.levels.length;
      coding = Object.fromEntries(
        f.levels.map((label, li) => [label, nLevels === 1 ? 0 : -1 + (2 * li) / (nLevels - 1)])
      );
      values = design.codedMatrix.map((row) => {
        const c = row[fi];
        const idx = Math.round((c + 1) * (nLevels - 1) / 2);
        const clamped = Math.max(0, Math.min(nLevels - 1, idx));
        return f.levels[clamped] ?? '';
      });
    } else {
      values = design.actualMatrix.map(row => row[fi]);
    }
    const baseMeta = lockMeta('hard', 'design-factor');
    columns.push({
      id: colId,
      name: f.name || `${i18n.t('modules.doe-planner.factor')} ${letter}`,
      shortName: `C${columns.length + 1}`,
      type: isCategorical ? 'text' : 'numeric',
      unit: isCategorical ? '' : (f.unit || ''),
      values,
      formulas: new Array(nRuns).fill(null),
      format: isCategorical ? null : { decimals: 2 },
      meta: coding ? { ...baseMeta, categoricalCoding: coding } : baseMeta,
    });
  });

  // Response columns (empty — user fills in results)
  responses.forEach((r, ri) => {
    const colId = crypto.randomUUID();
    responseColumnIds.push(colId);
    columns.push({
      id: colId,
      name: r.name || `Y${ri + 1}`,
      shortName: `C${columns.length + 1}`,
      type: 'numeric',
      unit: r.unit || '',
      values: new Array(nRuns).fill(null),
      formulas: new Array(nRuns).fill(null),
      format: { decimals: 4 },
      meta: null,    // explicit null — user fills these in, no lock.
    });
  });

  // Replicate-aggregate helper columns: mean + ln(variance) per response.
  // Only added if the design actually contains replicates (otherwise the formulas
  // would always be #N/A — single observation per group can't have a sample variance).
  if (hasReplicates) {
    const meanSuffix  = i18n.t('modules.doe-planner.colMeanSuffix');
    const lnVarSuffix = i18n.t('modules.doe-planner.colLnVarSuffix');
    responses.forEach((r, ri) => {
      const respName = r.name || `Y${ri + 1}`;
      const respId = responseColumnIds[ri];
      // The formula references columns by name; quote them with single quotes.
      const buildFormulas = (template) => {
        const out = new Array(nRuns).fill(null);
        for (let row = 1; row <= nRuns; row++) {
          out[row - 1] = template
            .replaceAll('{STD}',  `'${stdOrderName}'`)
            .replaceAll('{ROW}',  String(row))
            .replaceAll('{RESP}', `'${respName}'`);
        }
        return out;
      };
      const meanFormulas  = buildFormulas('=AVERAGEIF({STD}; {STD}[{ROW}]; {RESP})');
      const lnVarFormulas = buildFormulas('=LN(VARIF({STD}; {STD}[{ROW}]; {RESP}))');

      const meanId  = crypto.randomUUID();
      const lnVarId = crypto.randomUUID();
      meanColumnIds.push(meanId);
      lnVarColumnIds.push(lnVarId);

      columns.push({
        id: meanId,
        name: `${respName} ${meanSuffix}`,
        shortName: `C${columns.length + 1}`,
        type: 'numeric',
        unit: r.unit || '',
        values: new Array(nRuns).fill(null),
        formulas: meanFormulas,
        format: { decimals: 4 },
        meta: lockMeta('soft', 'replicate-aggregate'),
      });
      columns.push({
        id: lnVarId,
        name: `${respName} ${lnVarSuffix}`,
        shortName: `C${columns.length + 1}`,
        type: 'numeric',
        unit: '',
        values: new Array(nRuns).fill(null),
        formulas: lnVarFormulas,
        format: { decimals: 4 },
        meta: lockMeta('soft', 'replicate-aggregate'),
      });
    });
  }

  // Build sheet state (DataGrid format)
  const sheetState = {
    columns,
    rowCount: nRuns,
    colWidths: {},
    sortCol: null,
    sortDir: null,
    selection: null,
  };

  // Build workbook state
  const sheetName = doeName
    ? `DoE: ${doeName}`
    : `DoE ${new Date().toLocaleDateString()}`;

  const wbState = {
    sheets: [{ id: sheetId, name: sheetName, state: sheetState }],
    activeSheetId: sheetId,
    sheetCounter: 1,
  };

  // Register worksheet in the same phase as the DoE planner.
  // Use a fresh array copy to avoid stale-reference issues.
  const existing = sm.get(`phases.${phase}`) ?? [];
  sm.set(`phases.${phase}`, [
    ...existing,
    { instanceId: wsInstanceId, moduleId: 'worksheet', order: existing.length, state: {} },
  ]);

  // Persist workbook state
  sm.setModuleState(wsInstanceId, wbState);

  // Emit event so UI updates (sidebar, tabs).
  // silent: true → sidebar/badge update, but workspace stays on the current module.
  eventBus.emit('module:added', {
    moduleId: 'worksheet',
    phase,
    instanceId: wsInstanceId,
    silent: true,
  });

  return {
    instanceId: wsInstanceId,
    sheetId,
    factorColumnIds,
    responseColumnIds,
    meanColumnIds,
    lnVarColumnIds,
    runOrderColumnId: runOrderColId,
    stdOrderColumnId: stdOrderColId,
    experimentId: experimentId ?? null,
  };
}

// ─── Experiment Record (state.experiments[id]) ─────────────────────

/**
 * Persist an experiment record alongside the worksheet. The record captures the
 * design metadata that downstream modules (Regression DoE-Modus, Response
 * Optimization) need to consume the experiment without re-deriving it from the
 * worksheet alone.
 *
 * Schema follows V0.4-DOE-REGRESSION-OPTIMIERUNG §3.
 *
 * @param {object} context
 * @param {string} experimentId
 * @param {object} design - generateDesign() output
 * @param {object[]} factors
 * @param {object[]} responses
 * @param {string} doeName
 * @param {WorksheetRef} worksheetRef
 */
export function createExperimentRecord(context, experimentId, design, factors, responses, doeName, worksheetRef) {
  const { stateManager: sm } = context;

  // Replicate groups: indices (0-based) of all rows that share the same coded
  // factor values. This is the correct definition of pure-error replicates
  // for any design type — including CCD center points (multiple runs at the
  // origin) and mixed designs where the same continuous-RSM block is
  // repeated for each categorical combination (the center points within
  // each combo are replicates, but center points *across* different
  // categorical levels are not).
  //
  // We previously grouped by `stdOrder` which only catches explicit-replicate
  // runs and missed inherent center-point replication.
  const replicateGroups = [];
  const sourceMatrix = Array.isArray(design.codedMatrix)
    ? design.codedMatrix
    : (Array.isArray(design.actualMatrix) ? design.actualMatrix : null);
  if (sourceMatrix) {
    const groupsByValue = new Map();
    sourceMatrix.forEach((row, idx) => {
      const key = row.map(v => Number(v).toFixed(8)).join('|');
      if (!groupsByValue.has(key)) groupsByValue.set(key, []);
      groupsByValue.get(key).push(idx);
    });
    for (const indices of groupsByValue.values()) {
      if (indices.length > 1) replicateGroups.push(indices);
    }
  }

  const record = {
    name: doeName || `DoE ${new Date().toLocaleDateString()}`,
    createdAt: new Date().toISOString(),
    designType: design.designType ?? null,
    factors: factors.map(f => {
      const kind = f.kind === 'categorical' ? 'categorical' : 'continuous';
      const out = {
        name: f.name,
        kind,
        unit: kind === 'categorical' ? null : (f.unit ?? null),
        levels: f.levels ? [...f.levels] : null,
      };
      if (kind === 'continuous') {
        out.low  = Number.isFinite(parseFloat(f.levels?.[0])) ? parseFloat(f.levels[0]) : null;
        out.high = Number.isFinite(parseFloat(f.levels?.[f.levels.length - 1])) ? parseFloat(f.levels[f.levels.length - 1]) : null;
      } else {
        // For categorical factors the natural-units "range" is the set of labels;
        // low/high are not meaningful, but the optimizer still needs box bounds —
        // it gets them from the coded ±1 representation, not from low/high.
        out.reference = f.levels?.[0] ?? null;
      }
      return out;
    }),
    plannedTerms: {
      linear:    true,
      twoFactor: !!design.twoFactor    ?? false,
      quadratic: !!design.quadratic    ?? false,
      blockColumn: false,
    },
    aliasing: design.aliases ?? null,
    runMatrix: {
      worksheetRef: { instanceId: worksheetRef.instanceId, sheetId: worksheetRef.sheetId },
      columnTags: {
        runOrder:   worksheetRef.runOrderColumnId,
        stdOrder:   worksheetRef.stdOrderColumnId,
        factors:    [...worksheetRef.factorColumnIds],
        responses:  [...worksheetRef.responseColumnIds],
        means:      [...(worksheetRef.meanColumnIds  ?? [])],
        lnVars:     [...(worksheetRef.lnVarColumnIds ?? [])],
      },
    },
    centerPointRows: Array.isArray(design.centerPointRows) ? [...design.centerPointRows] : [],
    replicateGroups,
    responseColumns: responses.map((r, i) => ({
      name: r.name || `Y${i + 1}`,
      unit: r.unit ?? null,
      goal: r.goal ?? null,
      columnId: worksheetRef.responseColumnIds[i],
      meanColumnId:  worksheetRef.meanColumnIds?.[i]  ?? null,
      lnVarColumnId: worksheetRef.lnVarColumnIds?.[i] ?? null,
    })),
  };

  const existing = sm.get('experiments') ?? {};
  sm.set('experiments', { ...existing, [experimentId]: record });
  return record;
}

/**
 * Remove an experiment record from state. Does not touch the worksheet itself —
 * caller decides whether to delete or keep the worksheet.
 */
export function removeExperimentRecord(context, experimentId) {
  const { stateManager: sm } = context;
  const all = sm.get('experiments') ?? {};
  if (!(experimentId in all)) return;
  const next = { ...all };
  delete next[experimentId];
  sm.set('experiments', next);
}

// ─── Read Responses from Worksheet ─────────────────────────────────

/**
 * Read response values from the worksheet linked to a DoE plan.
 *
 * @param {object} context - Module context
 * @param {WorksheetRef} ref - Worksheet reference from createDesignWorksheet
 * @returns {{ values: (number|null)[][], complete: boolean, filledCount: number, totalCount: number }}
 */
export function readResponsesFromWorksheet(context, ref) {
  const { stateManager: sm } = context;

  const ws = sm.getModuleState(ref.instanceId);
  if (!ws?.sheets) return { values: [], complete: false, filledCount: 0, totalCount: 0 };

  const sheet = ws.sheets.find(s => s.id === ref.sheetId);
  if (!sheet?.state?.columns) return { values: [], complete: false, filledCount: 0, totalCount: 0 };

  const responseValues = ref.responseColumnIds.map(colId => {
    const col = sheet.state.columns.find(c => c.id === colId);
    return col ? [...col.values] : [];
  });

  const nRuns = responseValues[0]?.length ?? 0;
  let filledCount = 0;
  const totalCount = nRuns * responseValues.length;

  for (const vals of responseValues) {
    for (const v of vals) {
      if (v != null && typeof v === 'number' && !isNaN(v)) filledCount++;
    }
  }

  return {
    values: responseValues,
    complete: filledCount === totalCount && totalCount > 0,
    filledCount,
    totalCount,
  };
}

// ─── Check Worksheet Existence ─────────────────────────────────────

/**
 * Check if a worksheet reference is still valid (worksheet and sheet exist).
 *
 * @param {object} context - Module context
 * @param {WorksheetRef|null} ref - Worksheet reference
 * @returns {boolean}
 */
export function isWorksheetValid(context, ref) {
  if (!ref) return false;
  const { stateManager: sm } = context;
  const ws = sm.getModuleState(ref.instanceId);
  if (!ws?.sheets) return false;
  return ws.sheets.some(s => s.id === ref.sheetId);
}
