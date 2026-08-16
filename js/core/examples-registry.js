/**
 * DMAIC.io — Examples Registry (examples-registry.js)
 *
 * Central registry for example data. Loads `app/dev/examples/index.json`
 * at startup and serves catalog entries to modules.
 *
 * Three entry types:
 *   - dataset:   tabular data shipped as CSV/JSON file
 *   - project:   pre-filled module-state snapshot (passes through to setState)
 *   - generator: synthetic data generated at runtime with reproducible seed
 *
 * Schema is documented in docs/EXAMPLES.md (private site repo).
 */

const CATALOG_URL = './examples/index.json';
const BASE_PATH = './examples/';

/**
 * Split a scenario item into example id and optional explicit module.
 * `"ex-b#histogram"` → `{ exampleId: 'ex-b', moduleId: 'histogram' }`.
 * @param {string} item
 * @returns {{ exampleId: string, moduleId: string|null }}
 */
export function parseScenarioItem(item) {
  const [exampleId, moduleId] = String(item).split('#');
  return { exampleId, moduleId: moduleId || null };
}

export class ExamplesRegistry {
  constructor() {
    /** @type {object[]} */
    this._examples = [];
    /** @type {boolean} */
    this._initialized = false;
  }

  /**
   * Load the example catalog. Called once at app bootstrap.
   * Failures are non-fatal — the registry just stays empty.
   * @returns {Promise<void>}
   */
  async init() {
    try {
      const res = await fetch(CATALOG_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const catalog = await res.json();
      this._examples = Array.isArray(catalog?.examples) ? catalog.examples : [];
    } catch (err) {
      console.warn('[ExamplesRegistry] Could not load catalog:', err.message);
      this._examples = [];
    }
    this._initialized = true;
  }

  /** @returns {boolean} */
  isInitialized() {
    return this._initialized;
  }

  /**
   * Return all catalog entries whose `modules` list contains the given moduleId.
   * @param {string} moduleId
   * @returns {object[]}
   */
  getForModule(moduleId) {
    if (!moduleId) return [];
    return this._examples.filter(e =>
      e.type !== 'scenario'
      && Array.isArray(e.modules) && e.modules.includes(moduleId));
  }

  /**
   * All scenario entries, optionally filtered by cycle.
   * @param {{ cycle?: string }} [opts]
   * @returns {object[]}
   */
  getScenarios({ cycle } = {}) {
    return this._examples.filter(e =>
      e.type === 'scenario' && (!cycle || e.cycle === cycle));
  }

  /**
   * All scenarios whose `items` reference the given example id (the optional
   * `#module` suffix is ignored when matching).
   * @param {string} exampleId
   * @returns {object[]}
   */
  getScenariosForExample(exampleId) {
    if (!exampleId) return [];
    return this.getScenarios().filter(s =>
      (s.items || []).some(item => parseScenarioItem(item).exampleId === exampleId));
  }

  /**
   * Get a single catalog entry by id.
   * @param {string} exampleId
   * @returns {object|undefined}
   */
  get(exampleId) {
    return this._examples.find(e => e.id === exampleId);
  }

  /**
   * Load an example's payload. Fetches & parses the file for `dataset`/`project`,
   * or generates synthetic data for `generator` entries.
   *
   * @param {string} exampleId
   * @returns {Promise<{ meta: object, data: any, worksheetKey: string|null }>}
   */
  async load(exampleId) {
    const meta = this.get(exampleId);
    if (!meta) throw new Error(`Unknown example id: ${exampleId}`);

    if (meta.type === 'generator') {
      return { meta, data: this._runGenerator(meta.generator), worksheetKey: null };
    }

    if (!meta.file) throw new Error(`Example "${exampleId}" has no file`);

    const url = `${BASE_PATH}${meta.file}`;
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);

    if (meta.format === 'json') {
      const data = await res.json();
      // Resolve sourceWorksheetFile reference → inline as sourceWorksheetData.
      // Lets multiple project snapshots share one worksheet definition. The
      // worksheet file path doubles as the dedup key for scenario loads. It
      // is returned on the envelope, never on `data` — modules pass `data`
      // straight into setState().
      let worksheetKey = null;
      if (data && typeof data.sourceWorksheetFile === 'string') {
        worksheetKey = data.sourceWorksheetFile;
        const wsUrl = `${BASE_PATH}${data.sourceWorksheetFile}`;
        try {
          const wsRes = await fetch(wsUrl, { cache: 'no-cache' });
          if (wsRes.ok) {
            data.sourceWorksheetData = await wsRes.json();
          } else {
            console.warn(`[ExamplesRegistry] Worksheet file ${wsUrl} HTTP ${wsRes.status}`);
          }
        } catch (err) {
          console.warn(`[ExamplesRegistry] Failed to fetch worksheet file ${wsUrl}:`, err.message);
        }
        delete data.sourceWorksheetFile;
      } else if (Array.isArray(meta.modules) && meta.modules.includes('worksheet')) {
        // A worksheet example IS the data collection — key it by its own file.
        worksheetKey = meta.file;
      }
      return { meta, data, worksheetKey };
    }

    // Default: CSV — the source file is the dedup key.
    const text = await res.text();
    const data = parseCsv(text);
    return { meta, data, worksheetKey: meta.file };
  }

  // ─── Generators ─────────────────────────────────────────────

  _runGenerator(spec) {
    if (!spec || typeof spec !== 'object') throw new Error('Generator spec missing');
    const { algorithm, params = {}, seed = 0 } = spec;
    const rng = mulberry32(seed >>> 0);
    switch (algorithm) {
      case 'normal':
        return generateNormal(rng, params);
      default:
        throw new Error(`Unknown generator algorithm: ${algorithm}`);
    }
  }
}

/**
 * Remove a previously example-provisioned Worksheet instance. Modules that
 * own such an instance should call this before re-provisioning so reloads
 * don't pile up duplicate sheets in the column picker.
 *
 * Looks up the instance across all phases; emits `module:removed`
 * with `silent: true` to keep workspace focus stable.
 *
 * @param {object} context — must expose stateManager + eventBus
 * @param {string} instanceId
 * @returns {boolean} true if a sheet was actually removed
 */
export function removeProvisionedWorksheet(context, instanceId) {
  if (!instanceId) return false;
  const sm = context.stateManager;
  const allPhases = Object.keys(sm.get('phases') || {});
  for (const phase of allPhases) {
    const list = sm.get(`phases.${phase}`) ?? [];
    const idx = list.findIndex(i => i.instanceId === instanceId);
    if (idx === -1) continue;
    const next = list.slice(0, idx).concat(list.slice(idx + 1));
    sm.set(`phases.${phase}`, next);
    sm.removeModuleState?.(instanceId);
    context.eventBus?.emit?.('module:removed', {
      moduleId: 'worksheet', phase, instanceId, silent: true,
    });
    return true;
  }
  return false;
}

/**
 * Legt eine neue Modul-Instanz in der angegebenen Phase an und setzt ihren
 * Modul-State. Emittiert `module:added` mit `silent: true`, damit der Workspace
 * den Reiter ergänzt, ohne den Fokus vom aktiven Modul zu nehmen.
 *
 * Generisches Gegenstück zu `provisionWorksheet` (die feste `moduleId:
 * 'worksheet'`/`phase: 'data'`-Variante), herausgezogen für Aufrufer, die
 * eine andere Modul-Instanz (z. B. `voc-ctx-tree`) provisionieren müssen.
 *
 * @param {object} context Modul-Kontext (braucht stateManager + eventBus)
 * @param {{ moduleId: string, phase: string, state: object }} spec
 * @returns {string|null} Instanz-ID der neuen Instanz, null bei fehlenden Angaben
 */
export function provisionInstance(context, { moduleId, phase, state }) {
  if (!context?.stateManager || !moduleId || !phase) return null;
  const sm = context.stateManager;
  const instanceId = crypto.randomUUID();
  const list = sm.get(`phases.${phase}`) ?? [];
  list.push({ instanceId, moduleId, order: list.length, state: {} });
  sm.set(`phases.${phase}`, list);
  sm.setModuleState(instanceId, state);
  context.eventBus?.emit?.('module:added', { moduleId, phase, instanceId, silent: true });
  return instanceId;
}

/**
 * Provision a new Worksheet instance in the data phase, seeded with the
 * supplied module-state. Used by example-loading code paths that need a
 * fresh Datensammlung to back column references in the loaded module
 * state (e.g. regression colRefs, DoE source data).
 *
 * Emits `module:added` with `silent: true` so the workspace tab list
 * updates without stealing focus from the currently active module.
 *
 * Thin wrapper around `provisionInstance` — signature and return value
 * unchanged so existing callers (boxplot, histogram, regression, …) keep
 * working without modification.
 *
 * When `context.worksheetPool` (a Map) and `context.worksheetKey` are present,
 * an already-provisioned worksheet for that key is reused (scenario loading).
 *
 * @param {object} context — module context (must expose stateManager + eventBus)
 * @param {object} wsState — { sheets:[{id,name,state}], activeSheetId, sheetCounter }
 * @returns {{ instanceId: string, sheetId: string } | null}
 */
export function provisionWorksheet(context, wsState) {
  if (!wsState?.sheets?.length) return null;
  const sheetId = wsState.activeSheetId || wsState.sheets[0]?.id;
  if (!sheetId) return null;

  // Scenario loads pass a pool + key so several examples backed by the SAME
  // worksheet file share one data collection instead of piling up duplicates.
  const key = context?.worksheetKey;
  const pool = context?.worksheetPool;
  // Cache hit intentionally ignores this call's own `sheetId` — the cached
  // ref's `sheetId` wins even if the current wsState implies a different one.
  if (key && pool?.has(key)) return pool.get(key);

  const instanceId = provisionInstance(context, {
    moduleId: 'worksheet', phase: 'data', state: wsState,
  });
  if (!instanceId) return null;

  const ref = { instanceId, sheetId };
  if (key && pool) pool.set(key, ref);
  return ref;
}

/**
 * Convert a CSV-shaped example payload (`{ columns:[{name,type,values}] }`)
 * into the worksheet state shape consumed by `provisionWorksheet()`. Used
 * by chart modules so a `dataset`/`csv` example can be loaded into them via
 * the same andock path as a `project`/`json` example.
 *
 * Column ids are assigned `c-0`, `c-1`, …; sheet id is `sheet-csv`.
 *
 * @param {{ columns: {name: string, type: string, values: any[]}[] }} csvData
 * @param {{ id?: string, title?: { de?: string, en?: string } }} [meta]
 * @returns {{ sheets: object[], activeSheetId: string } | null}
 */
export function csvPayloadToWorksheetState(csvData, meta = {}) {
  if (!csvData || !Array.isArray(csvData.columns) || csvData.columns.length === 0) return null;
  const sheetId = 'sheet-csv';
  const name = meta.title?.de || meta.title?.en || meta.id || 'CSV';
  const columns = csvData.columns.map((c, i) => ({
    id: `c-${i}`,
    name: c.name,
    shortName: `C${i + 1}`,
    type: c.type || 'numeric',
    values: c.values,
  }));
  // datagrid.setState reads rowCount directly (no derivation from values),
  // so a sheet missing rowCount renders zero rows even when columns are set.
  // datagrid.setState reads rowCount directly (no derivation from values),
  // so a sheet missing rowCount renders zero rows even when columns are set.
  const rowCount = Math.max(0, ...columns.map(c => c.values.length));
  return {
    sheets: [{
      id: sheetId,
      name,
      state: {
        columns,
        rowCount,
        colWidths: {},
        sortCol: null,
        sortDir: null,
        selection: null,
      },
    }],
    activeSheetId: sheetId,
  };
}

/**
 * Shared example-load flow for modules whose example data is backed by a
 * provisioned Worksheet (Datensammlung). Captures the common sequence used by
 * the chart modules (control-chart, run-chart, xy-plot, boxplot, …):
 *
 *   1. guard the payload,
 *   2. confirm before overwriting existing module content,
 *   3. optionally synthesize a worksheet from a CSV-shape payload,
 *   4. provision a fresh worksheet (cleaning up a prior example-provisioned
 *      one via the model's `exampleWorksheetId`), record the new id, and
 *      rewrite the module's `__source__` column reference(s) to the real
 *      instance id,
 *   5. apply the resulting state via the module's own `setState`, persist it,
 *      and emit the success toast.
 *
 * Per-module differences are parameterized through `options`:
 *   - `State`        — the module's model class (for the `hasContent` overwrite
 *                      gate and for reading the previous `exampleWorksheetId`).
 *   - `synthesizeFromCsv(data, meta)` — optional. For modules that also accept
 *                      a CSV-shape (`{ columns }`) dataset: return
 *                      `{ sourceWorksheetData, columnRef }` (or a falsy value to
 *                      skip). Called only when `data` has no `sourceWorksheetData`
 *                      and no `columnRef`.
 *   - `rewriteRefs(data, instanceId)` — rewrite every `__source__` placeholder
 *                      reference in `data` to the provisioned `instanceId`.
 *                      Receives the (shallow-cloned) data object and the new
 *                      instance id; mutate/return it as needed.
 *
 * The helper performs NO worksheet provisioning when the payload carries no
 * `sourceWorksheetData` (after optional synthesis) — it still applies the
 * remaining state, matching the prior per-module behaviour.
 *
 * @param {object} module — the module instance (provides `_context`, `getState`,
 *   `setState`). `module._context` must expose `i18n`, `stateManager`,
 *   `instanceId`, and may expose `confirmPopout`/`notify`.
 * @param {{ meta: object, data: object }} payload
 * @param {{
 *   State: { fromJSON: (json: object) => any },
 *   synthesizeFromCsv?: (data: object, meta: object) => (object | null),
 *   rewriteRefs: (data: object, instanceId: string) => object,
 * }} options
 * @returns {Promise<void>}
 */
export async function loadExampleViaWorksheet(module, payload, options) {
  if (!payload || !payload.data) return;
  const { State, synthesizeFromCsv, rewriteRefs } = options;
  const ctx = module._context;
  const t = (key) => ctx.i18n.t(key);

  const current = module.getState();
  const currentModel = current ? State.fromJSON(current) : null;
  if (currentModel?.hasContent?.() && ctx?.confirmPopout) {
    const ok = await ctx.confirmPopout(t('moduleHelp.confirmOverwrite'), { danger: true });
    if (!ok) return;
  }

  let data = { ...payload.data };

  // Optional CSV-shape → worksheet synthesis (e.g. control-chart datasets).
  if (typeof synthesizeFromCsv === 'function'
      && !data.sourceWorksheetData && !data.columnRef && Array.isArray(data.columns)) {
    const synth = synthesizeFromCsv(data, payload.meta);
    if (synth) data = synth;
  }

  if (data.sourceWorksheetData) {
    const wsState = data.sourceWorksheetData;
    delete data.sourceWorksheetData;

    const prevId = currentModel?.exampleWorksheetId;
    if (prevId) removeProvisionedWorksheet(ctx, prevId);

    const ref = provisionWorksheet(ctx, wsState);
    if (ref) {
      data.exampleWorksheetId = ref.instanceId;
      data = rewriteRefs(data, ref.instanceId);
    }
  }

  module.setState(data);
  ctx.stateManager.setModuleState(ctx.instanceId, module.getState());

  const lang = ctx.i18n.getLanguage();
  const title = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
  ctx.notify?.(t('moduleHelp.exampleLoaded').replace('{title}', title), 'success');
}

/**
 * Build a placeholder-rewrite function that swaps the `instanceId` on a fixed
 * set of single-ref fields. Each named field on `data` whose ref has the
 * `oldId` placeholder is replaced immutably with `{ ...ref, instanceId: newId }`.
 *
 * Returned function signature: `(data, oldId, newId) => data` (mutates and
 * returns the same `data` object, matching prior per-module behaviour).
 *
 * @param {string[]} fields — ref field names to rewrite (e.g. ['xRef','yRef','gRef'])
 * @returns {(data: object, oldId: string, newId: string) => object}
 */
export function rewriteRefFields(fields) {
  return (data, oldId, newId) => {
    for (const field of fields) {
      const r = data[field];
      if (r && r.instanceId === oldId) {
        data[field] = { ...r, instanceId: newId };
      }
    }
    return data;
  };
}

/**
 * Build a placeholder-rewrite function for a single array-valued ref field.
 * Maps over the array, replacing the `instanceId` on every element whose ref
 * carries the `oldId` placeholder (immutably per element via `{ ...r, … }`).
 *
 * Returned function signature: `(data, oldId, newId) => data`.
 *
 * @param {string} field — array ref field name (e.g. 'colRefs')
 * @returns {(data: object, oldId: string, newId: string) => object}
 */
export function rewriteRefArray(field) {
  return (data, oldId, newId) => {
    const arr = data[field];
    if (Array.isArray(arr)) {
      data[field] = arr.map((r) => (r && r.instanceId === oldId)
        ? { ...r, instanceId: newId }
        : r);
    }
    return data;
  };
}

/**
 * Shared worksheet-backed example loader for chart modules.
 *
 * Captures the verbatim per-module `loadExample` flow used by the chart
 * cluster (bar, time-weighted-chart, run-chart, boxplot, …): examples ship a
 * full worksheet in `sourceWorksheetData` and use the literal placeholder
 * `__source__` as the column-ref instanceId. On load we provision a fresh
 * worksheet, rewrite the placeholder across the module's ref fields, then apply
 * state. If the payload carries no `sourceWorksheetData`, state is applied
 * directly without provisioning — matching prior behaviour.
 *
 * The only per-module variation is which ref fields carry `__source__`; that is
 * supplied via `rewriteRefs` (see {@link rewriteRefFields} / {@link rewriteRefArray}).
 *
 * @param {object} mod — module instance (provides `_context`, `getState`, `setState`).
 *   `mod._context` must expose `i18n`, `stateManager`, `instanceId`; may expose
 *   `confirmPopout` and `notify`.
 * @param {{ meta: object, data: object }} payload
 * @param {{
 *   Model: { fromJSON: (json: object) => { hasContent: () => boolean, exampleWorksheetId?: string } },
 *   rewriteRefs: (data: object, oldId: string, newId: string) => object,
 * }} options
 * @returns {Promise<void>}
 */
export async function loadWorksheetExample(mod, payload, { Model, rewriteRefs }) {
  if (!payload || !payload.data) return;
  const ctx = mod._context;
  const t = (key) => ctx.i18n.t(key);

  const current = mod.getState();
  const currentModel = current ? Model.fromJSON(current) : null;
  if (currentModel?.hasContent() && ctx?.confirmPopout) {
    const ok = await ctx.confirmPopout(t('moduleHelp.confirmOverwrite'), { danger: true });
    if (!ok) return;
  }

  const data = { ...payload.data };

  if (data.sourceWorksheetData) {
    const wsState = data.sourceWorksheetData;
    delete data.sourceWorksheetData;

    const prevId = currentModel?.exampleWorksheetId;
    if (prevId) removeProvisionedWorksheet(ctx, prevId);

    const ref = provisionWorksheet(ctx, wsState);
    if (ref) {
      data.exampleWorksheetId = ref.instanceId;
      rewriteRefs(data, '__source__', ref.instanceId);
    }
  }

  mod.setState(data);
  ctx.stateManager.setModuleState(ctx.instanceId, mod.getState());

  const lang = ctx.i18n.getLanguage();
  const title = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
  ctx.notify?.(t('moduleHelp.exampleLoaded').replace('{title}', title), 'success');
}

// ─── CSV parsing ───────────────────────────────────────────────

/**
 * Minimal CSV parser for the controlled example datasets shipped with the app.
 * Supports: comma separator, double-quoted fields with escaped quotes,
 * one header row, numeric auto-coercion.
 *
 * Returns an object: { columns: [{name, type, values:[]}, ...], rows: [[...]] }
 *
 * @param {string} text
 * @returns {{ columns: object[], rows: any[][] }}
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ',') { row.push(field); field = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += ch; i++;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }

  if (rows.length === 0) return { columns: [], rows: [] };

  const headers = rows[0].map(h => h.trim());
  const dataRows = rows.slice(1).filter(r => r.some(c => c.length > 0));

  const columns = headers.map((name, idx) => {
    const values = dataRows.map(r => coerce(r[idx]));
    const type = values.every(v => v == null || typeof v === 'number') ? 'numeric' : 'text';
    return { name, type, values };
  });

  return { columns, rows: dataRows };
}

function coerce(s) {
  if (s == null) return null;
  const trimmed = String(s).trim();
  if (trimmed === '') return null;
  const num = Number(trimmed.replace(',', '.'));
  if (!Number.isNaN(num) && /^-?\d+([.,]\d+)?([eE][-+]?\d+)?$/.test(trimmed)) return num;
  return trimmed;
}

// ─── Seeded PRNG + Normal distribution ─────────────────────────

function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate n normally distributed values via Box-Muller.
 * Returns { columns: [{ name, type:'numeric', values }], rows: [[v], ...] }
 * to match the shape produced by parseCsv.
 */
function generateNormal(rng, { n = 30, mu = 0, sigma = 1, name = 'value' } = {}) {
  const values = [];
  for (let i = 0; i < n; i++) {
    const u1 = Math.max(rng(), 1e-12);
    const u2 = rng();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    values.push(mu + sigma * z);
  }
  return {
    columns: [{ name, type: 'numeric', values }],
    rows: values.map(v => [v]),
  };
}
