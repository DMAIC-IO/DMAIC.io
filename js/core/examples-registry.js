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
 * Schema is documented in .claude/BEISPIELDATEN-KONZEPT.md.
 */

const CATALOG_URL = './examples/index.json';
const BASE_PATH = './examples/';

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
    return this._examples.filter(e => Array.isArray(e.modules) && e.modules.includes(moduleId));
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
   * @returns {Promise<{ meta: object, data: any }>}
   */
  async load(exampleId) {
    const meta = this.get(exampleId);
    if (!meta) throw new Error(`Unknown example id: ${exampleId}`);

    if (meta.type === 'generator') {
      return { meta, data: this._runGenerator(meta.generator) };
    }

    if (!meta.file) throw new Error(`Example "${exampleId}" has no file`);

    const url = `${BASE_PATH}${meta.file}`;
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);

    if (meta.format === 'json') {
      const data = await res.json();
      // Resolve sourceWorksheetFile reference → inline as sourceWorksheetData.
      // Lets multiple project snapshots share one worksheet definition.
      if (data && typeof data.sourceWorksheetFile === 'string') {
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
      }
      return { meta, data };
    }

    // Default: CSV
    const text = await res.text();
    const data = parseCsv(text);
    return { meta, data };
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
 * Provision a new Worksheet instance in the data phase, seeded with the
 * supplied module-state. Used by example-loading code paths that need a
 * fresh Datensammlung to back column references in the loaded module
 * state (e.g. regression colRefs, DoE source data).
 *
 * Emits `module:added` with `silent: true` so the workspace tab list
 * updates without stealing focus from the currently active module.
 *
 * @param {object} context — module context (must expose stateManager + eventBus)
 * @param {object} wsState — { sheets:[{id,name,state}], activeSheetId, sheetCounter }
 * @returns {{ instanceId: string, sheetId: string } | null}
 */
export function provisionWorksheet(context, wsState) {
  if (!wsState?.sheets?.length) return null;
  const sheetId = wsState.activeSheetId || wsState.sheets[0]?.id;
  if (!sheetId) return null;

  const sm = context.stateManager;
  const instanceId = crypto.randomUUID();
  const dataPhase = sm.get('phases.data') ?? [];
  dataPhase.push({ instanceId, moduleId: 'worksheet', order: dataPhase.length, state: {} });
  sm.set('phases.data', dataPhase);
  sm.setModuleState(instanceId, wsState);

  context.eventBus?.emit?.('module:added', {
    moduleId: 'worksheet', phase: 'data', instanceId, silent: true,
  });

  return { instanceId, sheetId };
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
