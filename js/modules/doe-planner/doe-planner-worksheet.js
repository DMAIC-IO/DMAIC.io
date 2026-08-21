/**
 * D.Mike — DoE Planner: Worksheet Integration Helper (doe-planner-worksheet.js)
 *
 * Creates and reads dedicated Worksheet instances for DoE experiment plans.
 * Each DoE plan gets its own Worksheet in the 'data' phase.
 *
 * Follows the same pattern as MSA modules (msa-typ1.js, msa-typ2.js).
 */

import { ROLE } from '../../core/datagrid/datagrid-roles.js';
import { uid } from '../../core/uid.js';

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
 * @param {object[]} responses - Response definitions [{name, unit}]
 * @param {string} doeName - Name of the DoE plan (used as sheet name)
 * @param {string} [phase='improve'] - DMAIC phase to register the worksheet in
 * @param {string|null} [experimentId=null] - Optional id to embed in column.meta.managedRef
 * @returns {WorksheetRef}
 */
export function createDesignWorksheet(context, design, factors, responses, doeName, phase = 'improve', experimentId = null) {
  const { stateManager: sm, eventBus, i18n } = context;

  // Generate IDs
  const wsInstanceId = uid();
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
  const runOrderColId = uid();
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
    role: ROLE.IDENTIFIER,
    roleManual: true,
  });

  // StdOrder column — also serves as group id for replicate aggregates,
  // so it stays hard-locked even though aggregates depend on it.
  const stdOrderColId = uid();
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
    role: ROLE.IDENTIFIER,
    roleManual: true,
  });

  // Block column (always 1 for now — multi-block support in Phase E)
  columns.push({
    id: uid(),
    name: i18n.t('modules.doe-planner.colBlock'),
    shortName: `C${columns.length + 1}`,
    type: 'numeric',
    unit: '',
    values: new Array(nRuns).fill(1),
    formulas: new Array(nRuns).fill(null),
    format: { decimals: 0 },
    meta: lockMeta('hard', 'block-column'),
    role: ROLE.CATEGORICAL,
    roleManual: true,
  });

  // Replicate column
  columns.push({
    id: uid(),
    name: i18n.t('modules.doe-planner.colReplicate'),
    shortName: `C${columns.length + 1}`,
    type: 'numeric',
    unit: '',
    values: (design.replicateIds || new Array(nRuns).fill(1)).map(v => v),
    formulas: new Array(nRuns).fill(null),
    format: { decimals: 0 },
    meta: lockMeta('hard', 'replicate-id'),
    role: ROLE.CATEGORICAL,
    roleManual: true,
  });

  // Factor columns. For categorical factors the natural-units column carries
  // the level *labels* (strings); a `categoricalCoding` map on the column meta
  // tells consumers (regression, correlation, plots) how to translate each
  // label back to ±1 for numerical work. For continuous factors the column
  // stays numeric and the meta has no coding.
  factors.forEach((f, fi) => {
    const colId = uid();
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
      role: isCategorical ? ROLE.CATEGORICAL : ROLE.CONTINUOUS,
      roleManual: true,
    });
  });

  // Response columns. Seeded from `design.sourceResponseSeeds` when the design
  // was built on top of an existing Datensammlung: the first `sourceRowCount`
  // response values are copied verbatim from the source so the user doesn't
  // need to re-enter measurements that already exist. The new (augmented) rows
  // stay null and wait for fresh measurements.
  const seedRows = Number.isFinite(design.sourceRowCount) ? design.sourceRowCount : 0;
  const seeds = Array.isArray(design.sourceResponseSeeds) ? design.sourceResponseSeeds : null;
  responses.forEach((r, ri) => {
    const colId = uid();
    responseColumnIds.push(colId);
    const values = new Array(nRuns).fill(null);
    if (seeds && seeds[ri]) {
      const limit = Math.min(seedRows, seeds[ri].length, nRuns);
      for (let i = 0; i < limit; i++) {
        const v = seeds[ri][i];
        if (v != null && Number.isFinite(v)) values[i] = v;
      }
    }
    columns.push({
      id: colId,
      name: r.name || `Y${ri + 1}`,
      shortName: `C${columns.length + 1}`,
      type: 'numeric',
      unit: r.unit || '',
      values,
      formulas: new Array(nRuns).fill(null),
      format: { decimals: 4 },
      meta: null,    // explicit null — user fills these in, no lock.
      role: ROLE.CONTINUOUS,
      roleManual: true,
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

      const meanId  = uid();
      const lnVarId = uid();
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
        role: ROLE.CONTINUOUS,
        roleManual: true,
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
        role: ROLE.CONTINUOUS,
        roleManual: true,
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
      twoFactor: Boolean(design.twoFactor),
      quadratic: Boolean(design.quadratic),
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

// ─── Append Rows (Design Augmentation) ─────────────────────────────

/**
 * Append additional design rows to the bound worksheet. Used when augmenting
 * an optimal design with extra runs — the originally created columns stay
 * intact, only their `values` and `formulas` arrays grow.
 *
 * RunOrder/StdOrder continue monotonically from the previous max; Block and
 * Replicate default to 1; factor columns receive the new actual values (label
 * for categorical, number for continuous); response columns get `null`.
 * Mean/ln(variance) helper columns extend their per-row formulas with the new
 * row index — the formula template is cloned from an existing row.
 *
 * @param {object} context - Module context (stateManager, eventBus)
 * @param {WorksheetRef} ref - Worksheet reference
 * @param {object[]} factors - Factor definitions (same order as factorColumnIds)
 * @param {Array<Array<number|string>>} newActualRows - addRuns × k matrix of new actual values
 * @returns {{ added: number, totalRuns: number } | null}
 */
export function appendDoERowsToWorksheet(context, ref, factors, newActualRows) {
  if (!ref || !Array.isArray(newActualRows) || !newActualRows.length) return null;
  const { stateManager: sm, eventBus } = context;

  const ws = sm.getModuleState(ref.instanceId);
  if (!ws?.sheets) return null;
  const sheet = ws.sheets.find(s => s.id === ref.sheetId);
  if (!sheet?.state?.columns) return null;

  const addRuns = newActualRows.length;
  const oldN = sheet.state.rowCount ?? 0;

  const newRunOrders = Array.from({ length: addRuns }, (_, i) => oldN + i + 1);
  const newStdOrders = Array.from({ length: addRuns }, (_, i) => oldN + i + 1);

  // Map column ID → role for fast lookup
  const factorIdToIdx = new Map(ref.factorColumnIds.map((id, i) => [id, i]));
  const responseIds = new Set(ref.responseColumnIds);
  const meanIds = new Set(ref.meanColumnIds || []);
  const lnVarIds = new Set(ref.lnVarColumnIds || []);

  for (const col of sheet.state.columns) {
    let appendValues;
    const appendFormulas = new Array(addRuns).fill(null);

    if (col.id === ref.runOrderColumnId) {
      appendValues = newRunOrders;
    } else if (col.id === ref.stdOrderColumnId) {
      appendValues = newStdOrders;
    } else if (col.meta?.reason === 'block-column') {
      appendValues = new Array(addRuns).fill(1);
    } else if (col.meta?.reason === 'replicate-id') {
      appendValues = new Array(addRuns).fill(1);
    } else if (factorIdToIdx.has(col.id)) {
      const fIdx = factorIdToIdx.get(col.id);
      appendValues = newActualRows.map(row => row[fIdx]);
    } else if (responseIds.has(col.id)) {
      appendValues = new Array(addRuns).fill(null);
    } else if (meanIds.has(col.id) || lnVarIds.has(col.id)) {
      // Clone the template by reading any existing per-row formula and
      // substituting the row index. The formula format is
      //   =AVERAGEIF('STD'; 'STD'[N]; 'RESP')
      // where N is the only bracketed number.
      const template = (col.formulas || []).find(f => typeof f === 'string') || null;
      appendValues = new Array(addRuns).fill(null);
      if (template) {
        for (let i = 0; i < addRuns; i++) {
          appendFormulas[i] = template.replace(/\[\d+\]/, `[${oldN + i + 1}]`);
        }
      }
    } else {
      // Unknown column (e.g., user-added) — extend with nulls.
      appendValues = new Array(addRuns).fill(null);
    }

    col.values = [...col.values, ...appendValues];
    col.formulas = [...(col.formulas || new Array(oldN).fill(null)), ...appendFormulas];
  }

  sheet.state.rowCount = oldN + addRuns;

  sm.setModuleState(ref.instanceId, ws);
  eventBus?.emit('worksheet:dataChanged', { instanceId: ref.instanceId });

  return { added: addRuns, totalRuns: oldN + addRuns };
}

// ─── Source-Worksheet enumeration & reader ─────────────────────────

/**
 * List every worksheet sheet currently registered in any project phase.
 * The DoE planner uses this to populate a picker so users can build an
 * optimal design on top of measurements that already live in a Datensammlung.
 *
 * @param {object} context
 * @returns {Array<{instanceId:string, sheetId:string, name:string, phaseId:string, rowCount:number, columns:Array<{id:string,name:string,type:string}>}>}
 */
export function listProjectWorksheets(context) {
  const { stateManager: sm } = context;
  const phases = sm.get('phases') || {};
  const out = [];
  for (const [phaseId, instances] of Object.entries(phases)) {
    if (!Array.isArray(instances)) continue;
    for (const inst of instances) {
      if (inst.moduleId !== 'worksheet') continue;
      const ws = sm.getModuleState(inst.instanceId);
      if (!ws?.sheets) continue;
      for (const sheet of ws.sheets) {
        const cols = sheet.state?.columns || [];
        out.push({
          instanceId: inst.instanceId,
          sheetId: sheet.id,
          name: sheet.name || sheet.id,
          phaseId,
          rowCount: sheet.state?.rowCount || 0,
          columns: cols.map(c => ({ id: c.id, name: c.name, type: c.type })),
        });
      }
    }
  }
  return out;
}

/**
 * Read factor + response values from a picked source worksheet and convert
 * them to the coded representation the optimal-design engine expects.
 *
 * Columns are matched to factors/responses by **name** (case-insensitive,
 * trimmed). Missing factor columns abort with `errors.missingFactors`;
 * missing response columns are silently treated as "no data" (the response
 * stays empty for those rows).
 *
 * For continuous factors the coded value is `2·(v − lo)/(hi − lo) − 1`,
 * clamped to [−1, +1] if the source value falls outside the planner's
 * declared range. For categorical factors the value is matched against the
 * factor's `levels` (case-insensitive); unmatched cells abort the row.
 *
 * Rows with any missing/invalid factor cell are skipped.
 *
 * @param {object} context
 * @param {{instanceId:string, sheetId:string}} sourceRef
 * @param {object[]} factors
 * @param {object[]} responses
 * @returns {{
 *   ok: boolean,
 *   codedMatrix?: number[][],
 *   actualRows?: Array<Array<number|string>>,
 *   responseValues?: Array<Array<number|null>>,
 *   rowCount?: number,
 *   mappedResponseCount?: number,
 *   skippedRows?: number,
 *   errors: string[],
 *   missingFactors?: string[],
 * }}
 */
export function readSourceData(context, sourceRef, factors, responses) {
  const { stateManager: sm } = context;
  if (!sourceRef?.instanceId || !sourceRef?.sheetId) {
    return { ok: false, errors: ['source-missing-ref'] };
  }

  const ws = sm.getModuleState(sourceRef.instanceId);
  if (!ws?.sheets) return { ok: false, errors: ['source-not-found'] };
  const sheet = ws.sheets.find(s => s.id === sourceRef.sheetId);
  if (!sheet?.state?.columns) return { ok: false, errors: ['source-sheet-not-found'] };

  const columns = sheet.state.columns;
  const rowCount = sheet.state.rowCount ?? 0;
  if (rowCount === 0) return { ok: false, errors: ['source-empty'] };

  const norm = (s) => String(s ?? '').trim().toLowerCase();
  const findCol = (name) => columns.find(c => norm(c.name) === norm(name));

  // Factor mapping is mandatory — bail early with a useful error
  const factorMap = factors.map(f => ({ factor: f, col: findCol(f.name) }));
  const missing = factorMap.filter(m => !m.col).map(m => m.factor.name);
  if (missing.length) {
    return { ok: false, errors: ['source-missing-factor-columns'], missingFactors: missing };
  }

  // Response mapping is optional — unmapped responses just stay empty
  const responseMap = responses.map(r => ({ response: r, col: findCol(r.name) }));

  const codedMatrix = [];
  const actualRows = [];
  const responseValues = responses.map(() => []);
  let skipped = 0;

  for (let i = 0; i < rowCount; i++) {
    const codedRow = [];
    const actualRow = [];
    let rowValid = true;

    for (let fi = 0; fi < factors.length; fi++) {
      const f = factors[fi];
      const raw = factorMap[fi].col.values[i];
      if (raw == null || raw === '') { rowValid = false; break; }

      let coded;
      if (f.kind === 'categorical') {
        const idx = f.levels.findIndex(l => norm(l) === norm(raw));
        if (idx < 0) { rowValid = false; break; }
        const nLv = f.levels.length;
        coded = nLv === 1 ? 0 : -1 + (2 * idx) / (nLv - 1);
        actualRow.push(f.levels[idx]); // keep canonical casing from factor defn
      } else {
        const num = parseFloat(raw);
        if (!isFinite(num)) { rowValid = false; break; }
        const lo = parseFloat(f.levels[0]);
        const hi = parseFloat(f.levels[f.levels.length - 1]);
        if (!isFinite(lo) || !isFinite(hi) || lo === hi) { rowValid = false; break; }
        coded = -1 + (2 * (num - lo)) / (hi - lo);
        coded = Math.max(-1, Math.min(1, coded));
        actualRow.push(num);
      }
      codedRow.push(coded);
    }

    if (!rowValid) { skipped++; continue; }

    codedMatrix.push(codedRow);
    actualRows.push(actualRow);

    for (let ri = 0; ri < responses.length; ri++) {
      const rc = responseMap[ri];
      if (rc.col) {
        const v = rc.col.values[i];
        const num = (v == null || v === '') ? null : parseFloat(v);
        responseValues[ri].push(Number.isFinite(num) ? num : null);
      } else {
        responseValues[ri].push(null);
      }
    }
  }

  if (codedMatrix.length === 0) {
    return { ok: false, errors: ['source-no-valid-rows'], skippedRows: skipped };
  }

  return {
    ok: true,
    codedMatrix,
    actualRows,
    responseValues,
    rowCount: codedMatrix.length,
    mappedResponseCount: responseMap.filter(rc => rc.col).length,
    skippedRows: skipped,
    errors: [],
  };
}
