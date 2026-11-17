/**
 * DMAIC.io — Examples Registry (examples-registry.js)
 *
 * Central registry for example data. Loads `examples/index.json` and
 * `examples/shared/scenarios.json` at startup and serves catalog entries to
 * modules.
 *
 * Beispiele der Module in neuer Form stehen in `resources/examples/examples.json`
 * ihres Besitzers; `EXAMPLES`/`EXAMPLE_REFS` aus dem Katalog nennen Besitzer und
 * Nutzer. Geladen wird die Datei über `ModuleResources.url`, ohne das Modul zu
 * laden. `get`, `getForModule`, `load` sind `async`; Szenarien synchron.
 *
 * Three entry types:
 *   - dataset:   tabular data shipped as CSV/JSON file
 *   - project:   pre-filled module-state snapshot (passes through to setState)
 *   - generator: synthetic data generated at runtime with reproducible seed
 */

import { uid } from './uid.js';
import { parseCsvText, readCsvRecords } from './parser/csv.js';
import { withoutSchema } from './json-file.js';
import { rewriteColumnRefs, activeContext } from './model.js';
import { loadModel } from './initial-model.js';
import { EXAMPLES, EXAMPLE_REFS } from '../modules/catalog.generated.js';

const CATALOG_URL = './examples/index.json';
const BASE_PATH = './examples/';
const SCENARIOS_URL = './examples/shared/scenarios.json';

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

/**
 * Eine Katalogdatei holen; ein Fehlschlag ist nicht fatal (Warnung, null).
 * @param {string} url
 * @returns {Promise<object|null>}
 */
async function fetchCatalogFile(url) {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('[ExamplesRegistry] Could not load', url, err.message);
    return null;
  }
}

export class ExamplesRegistry {
  /**
   * @param {object} [opts]
   * @param {{ url(id: string, file: string): string|undefined } | null} [opts.resources]  ModuleResources
   * @param {{ examples: Record<string, string>, exampleRefs: Record<string, string[]> }} [opts.catalog]
   */
  constructor({ resources = null, catalog = { examples: EXAMPLES, exampleRefs: EXAMPLE_REFS } } = {}) {
    /** @type {object[]} */
    this._examples = [];
    /** @type {object[]} */
    this._scenarios = [];
    /** @type {boolean} */
    this._initialized = false;
    this._resources = resources;
    this._catalog = catalog;
    /** @type {Map<string, Promise<object[]>>} Besitzer → laufendes oder fertiges Laden */
    this._owned = new Map();
    /** @type {Map<string, object>} geladene Modulbeispiele (für peek) */
    this._loaded = new Map();
  }

  /**
   * `modules` eines Eintrags um die Nutzer aus exampleRefs ergänzen.
   * @param {object} entry @param {string[]} modules @returns {object}
   */
  _withRefs(entry, modules) {
    const refs = Object.hasOwn(this._catalog.exampleRefs, entry.id) ? this._catalog.exampleRefs[entry.id] : [];
    return refs.length ? { ...entry, modules: [...new Set([...modules, ...refs])] } : { ...entry, modules };
  }

  /**
   * Beispiele eines Besitzers aus seiner examples.json — einmal je Besitzer,
   * ein Fehlschlag wird nicht gespeichert.
   * @param {string} owner
   * @returns {Promise<object[]>}
   */
  _ownedBy(owner) {
    let pending = this._owned.get(owner);
    if (!pending) {
      const url = this._resources?.url(owner, 'examples/examples.json');
      pending = !url ? Promise.resolve([]) : fetch(url, { cache: 'no-cache' })
        .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
        .then((file) => (withoutSchema(file)?.examples ?? []).map((e) => {
          const entry = this._withRefs(e, [owner]);
          this._loaded.set(entry.id, entry);
          return entry;
        }));
      pending.catch(() => this._owned.delete(owner));
      this._owned.set(owner, pending);
    }
    return pending;
  }

  /**
   * Besitzer eines Modulbeispiels der neuen Form, sonst null.
   * @param {string} id @returns {string|null}
   */
  _ownerOf(id) {
    return Object.hasOwn(this._catalog.examples, id) ? this._catalog.examples[id] : null;
  }

  /**
   * Ids der Modulbeispiele, die ein Modul besitzt oder per exampleRefs nutzt.
   * @param {string} moduleId @returns {string[]}
   */
  _catalogIdsFor(moduleId) {
    const { examples, exampleRefs } = this._catalog;
    return [
      ...Object.keys(examples).filter((id) => examples[id] === moduleId),
      ...Object.keys(exampleRefs).filter((id) => exampleRefs[id].includes(moduleId)),
    ];
  }

  /**
   * URL einer Datei unter resources/examples/ eines Moduls.
   * @param {string} owner @param {string} file @returns {string}
   */
  _moduleUrl(owner, file) {
    const url = this._resources?.url(owner, `examples/${file}`);
    if (!url) throw new Error(`[ExamplesRegistry] ${owner}: examples/${file} fehlt in #module-resources`);
    return url;
  }

  /**
   * Load the example catalog. Called once at app bootstrap.
   * Failures are non-fatal — the registry just stays empty.
   * @returns {Promise<void>}
   */
  async init() {
    const [index, shared] = await Promise.all([fetchCatalogFile(CATALOG_URL), fetchCatalogFile(SCENARIOS_URL)]);
    this.setCatalog({
      examples: Array.isArray(index?.examples) ? index.examples : [],
      scenarios: Array.isArray(shared?.scenarios) ? shared.scenarios : [],
    });
    this._initialized = true;
  }

  /**
   * Katalog setzen (init, Tests). Einträge mit `type: 'scenario'` unter
   * `examples` (alte Form) zählen als Szenarien.
   * @param {{ examples?: object[], scenarios?: object[] }} catalog
   */
  setCatalog({ examples = [], scenarios = [] } = {}) {
    this._examples = examples.filter((e) => e.type !== 'scenario').map((e) => this._withRefs(e, e.modules ?? []));
    this._scenarios = [...scenarios, ...examples.filter((e) => e.type === 'scenario')];
  }

  /** @returns {boolean} */
  isInitialized() {
    return this._initialized;
  }

  /**
   * Beispiele eines Moduls: aus examples/index.json, aus der eigenen
   * examples.json und über exampleRefs — ohne Szenarien, ohne Doppel.
   * @param {string} moduleId
   * @returns {Promise<object[]>}
   */
  async getForModule(moduleId) {
    if (!moduleId) return [];
    const out = this._examples.filter((e) => Array.isArray(e.modules) && e.modules.includes(moduleId));
    const seen = new Set(out.map((e) => e.id));
    const ids = this._catalogIdsFor(moduleId).filter((id) => !seen.has(id));
    const loaded = await Promise.all(ids.map((id) => this.get(id).catch((err) => {
      console.warn(`[examples] ${id} (${moduleId}) übersprungen: ${err.message}`);
      return null;
    })));
    for (const entry of loaded) {
      if (entry && !seen.has(entry.id)) { out.push(entry); seen.add(entry.id); }
    }
    return out;
  }

  /**
   * All scenario entries, optionally filtered by cycle.
   * @param {{ cycle?: string }} [opts]
   * @returns {object[]}
   */
  getScenarios({ cycle } = {}) {
    return this._scenarios.filter(e => !cycle || e.cycle === cycle);
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
   * Ein Szenario (synchron — Szenarien stehen nach init() vollständig bereit).
   * @param {string} scenarioId
   * @returns {object|undefined}
   */
  getScenario(scenarioId) {
    return this._scenarios.find(s => s.id === scenarioId);
  }

  /**
   * Ein schon bekannter Eintrag (Beispiel oder Szenario), ohne zu laden —
   * für synchrone Stellen wie Modal-Titel. Ein noch nicht geladenes
   * Modulbeispiel liefert undefined.
   * @param {string} id
   * @returns {object|undefined}
   */
  peek(id) {
    return this._examples.find(e => e.id === id) ?? this.getScenario(id) ?? this._loaded.get(id);
  }

  /**
   * Ob ein Modul Beispiele hat, ohne zu laden.
   * @param {string} moduleId
   * @returns {boolean}
   */
  hasExamples(moduleId) {
    return this._examples.some(e => Array.isArray(e.modules) && e.modules.includes(moduleId))
      || this._catalogIdsFor(moduleId).length > 0;
  }

  /**
   * Ein Eintrag (Beispiel oder Szenario); ein Beispiel der neuen Form wird
   * dafür aus der examples.json seines Besitzers geladen.
   * @param {string} exampleId
   * @returns {Promise<object|undefined>}
   */
  async get(exampleId) {
    const known = this.peek(exampleId);
    if (known) return known;
    const owner = this._ownerOf(exampleId);
    if (!owner) return undefined;
    return (await this._ownedBy(owner)).find((e) => e.id === exampleId);
  }

  /**
   * Load an example's payload. Fetches & parses the file for `dataset`/`project`,
   * or generates synthetic data for `generator` entries.
   *
   * @param {string} exampleId
   * @returns {Promise<{ meta: object, data: any, worksheetKey: string|null }>}
   */
  async load(exampleId) {
    const meta = await this.get(exampleId);
    if (!meta) throw new Error(`Unknown example id: ${exampleId}`);

    if (meta.type === 'generator') {
      return { meta, data: this._runGenerator(meta.generator), worksheetKey: null };
    }

    if (!meta.file) throw new Error(`Example "${exampleId}" has no file`);

    const owner = this._ownerOf(exampleId);
    const url = owner ? this._moduleUrl(owner, meta.file) : `${BASE_PATH}${meta.file}`;
    const fileKey = owner ? `modules/${owner}/${meta.file}` : meta.file;
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
        const ws = data.sourceWorksheetFile;
        const own = owner && !ws.startsWith('shared/');
        worksheetKey = own ? `modules/${owner}/${ws}` : ws;
        const wsUrl = own ? this._moduleUrl(owner, ws) : `${BASE_PATH}${ws}`;
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
        worksheetKey = fileKey;
      }
      return { meta, data, worksheetKey };
    }

    // Default: CSV — the source file is the dedup key.
    const text = await res.text();
    const data = parseCsv(text);
    return { meta, data, worksheetKey: fileKey };
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
 * @param {{ moduleId: string, phase: string, state: object, customName?: string }} spec
 *   `customName` wird als Reiter-Name gesetzt; ohne ihn zeigt der Reiter den Modulnamen.
 * @returns {string|null} Instanz-ID der neuen Instanz, null bei fehlenden Angaben
 */
export function provisionInstance(context, { moduleId, phase, state, customName }) {
  if (!context?.stateManager || !moduleId || !phase) return null;
  const sm = context.stateManager;
  const instanceId = uid();
  const list = sm.get(`phases.${phase}`) ?? [];
  const record = { instanceId, moduleId, order: list.length, state: {} };
  if (customName) record.customName = customName;
  list.push(record);
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

  // Without a name every example-provisioned tab reads "Datensammlung"; the
  // active sheet's name tells them apart.
  const sheetName = wsState.sheets.find(s => s.id === sheetId)?.name;
  const instanceId = provisionInstance(context, {
    moduleId: 'worksheet', phase: 'data', state: wsState,
    customName: sheetName ? uniqueWorksheetTabName(context.stateManager, sheetName) : undefined,
  });
  if (!instanceId) return null;

  const ref = { instanceId, sheetId };
  if (key && pool) pool.set(key, ref);
  return ref;
}

/**
 * Return `baseName`, or `baseName 2`, `baseName 3`, … — the first one no
 * worksheet tab in the project carries yet.
 * @param {object} stateManager
 * @param {string} baseName
 * @returns {string}
 */
function uniqueWorksheetTabName(stateManager, baseName) {
  const taken = new Set();
  for (const phase of Object.keys(stateManager.get('phases') || {})) {
    for (const inst of stateManager.get(`phases.${phase}`) ?? []) {
      if (inst?.moduleId === 'worksheet' && inst.customName) taken.add(inst.customName);
    }
  }
  if (!taken.has(baseName)) return baseName;
  let i = 2;
  while (taken.has(`${baseName} ${i}`)) i++;
  return `${baseName} ${i}`;
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
 * Den Platzhalter `from` in den Spaltenbezügen durch `to` ersetzen: über die
 * übergebene `rewriteRefs(data, from, to)` oder — bei einem Model aus
 * `defineModel` ohne eigene Funktion — über das Schema.
 * @param {any} Model
 * @param {((data: object, from: string, to: string) => object|void)|undefined} rewriteRefs
 * @param {object} data @param {string} from @param {string} to
 * @returns {object}
 */
function rewritePlaceholder(Model, rewriteRefs, data, from, to) {
  if (typeof rewriteRefs === 'function') return rewriteRefs(data, from, to) ?? data;
  if (Model?.schema) return rewriteColumnRefs(Model, data, from, to);
  throw new Error('example loader: rewriteRefs is required for models without a schema');
}

/**
 * Den aktuellen Stand als Model laden — für die Überschreib-Rückfrage und die
 * `exampleWorksheetId` des vorigen Beispiels. Ein Schema-Model lädt mit
 * Reparatur-Rückfall (`loadModel`), statt an einem kaputten Stand zu werfen.
 * @param {any} Model @param {object|null|undefined} json @returns {any}
 */
const currentModelOf = (Model, json, stateManager) => (json ? loadModel(Model, json, Model.schema ? activeContext(stateManager) : undefined) : null);

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
 *   - `rewriteRefs(data, from, to)` — rewrite every `from` (`__source__`)
 *                      placeholder reference in `data` to the provisioned
 *                      instance id `to`. Receives the (shallow-cloned) data
 *                      object; returns the new data (or mutates it and returns
 *                      nothing). Optional for a `defineModel` model: its
 *                      `columnRef` fields are rewritten from the schema.
 *
 * The helper performs NO worksheet provisioning when the payload carries no
 * `sourceWorksheetData` (after optional synthesis) — it still applies the
 * remaining state, matching the prior per-module behaviour.
 *
 * @param {object} module — the module instance (provides `_context`, `getState`,
 *   `setState`). `module._context` must expose `i18n`, `stateManager`,
 *   `instanceId`, and may expose `dialog`/`notify`.
 * @param {{ meta: object, data: object }} payload
 * @param {{
 *   State: { fromJSON: (json: object) => any, schema?: object },
 *   synthesizeFromCsv?: (data: object, meta: object) => (object | null),
 *   rewriteRefs?: (data: object, from: string, to: string) => (object | void),
 *   confirmed?: boolean,
 * }} options
 * @returns {Promise<void>}
 */
export async function loadExampleViaWorksheet(module, payload, options) {
  if (!payload || !payload.data) return;
  const { State, synthesizeFromCsv, rewriteRefs, confirmed = false } = options;
  const ctx = module._context;
  const t = (key) => ctx.i18n.t(key);

  const currentModel = currentModelOf(State, module.getState(), module._context?.stateManager);
  if (!confirmed && currentModel?.hasContent?.() && ctx?.dialog) {
    const ok = await ctx.dialog.confirm({ message: t('moduleHelp.confirmOverwrite'), danger: true });
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
      data = rewritePlaceholder(State, rewriteRefs, data, '__source__', ref.instanceId);
      await whenWorksheetReadable(ctx, ref.instanceId);
    }
  }

  module.setState(data);

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
 * returns the same `data` object, matching prior per-module behaviour) — the
 * `rewriteRefs` form both example loaders take.
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
 * Wartet, bis das eben angelegte Arbeitsblatt über `ctx.data`/`readSync`
 * lesbar ist. Das Vorladen des Arbeitsblatt-Codes (`worksheet-preload.js`)
 * läuft erst nach `module:added` und asynchron; ein Modul, das in
 * `setState` sofort rechnet, läse sonst `not_loaded` — eine leere Spalte —
 * und bliebe bis zur nächsten Eingabe ohne Ergebnis. `instances.read` lädt
 * den Code und liest nur die Spaltenköpfe (`columns: []`). Ein Fehler beim
 * Lesen bleibt dem Leser überlassen: er meldet ihn selbst.
 * @param {any} ctx Modulkontext (`instances` fehlt in manchen Tests)
 * @param {string} instanceId das angelegte Arbeitsblatt
 * @returns {Promise<void>}
 */
async function whenWorksheetReadable(ctx, instanceId) {
  try {
    await ctx?.instances?.read?.(instanceId, { columns: [] });
  } catch (err) {
    console.warn('[ExamplesRegistry] worksheet not readable after provisioning:', err?.message ?? err);
  }
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
 *   `dialog` and `notify`.
 * @param {{ meta: object, data: object }} payload
 * @param {{
 *   Model: { fromJSON: (json: object) => { hasContent: () => boolean, exampleWorksheetId?: string }, schema?: object },
 *   rewriteRefs?: (data: object, from: string, to: string) => (object | void),
 *   confirmed?: boolean,
 *   prevId?: string|null,
 * }} options — `prevId` is the worksheet of the example being replaced, when the caller has
 *   already loaded the current state; `rewriteRefs` is optional for a `defineModel` model (its
 *   `columnRef` fields are rewritten from the schema); `confirmed` skips the
 *   overwrite question when the caller has already asked it.
 * @returns {Promise<void>}
 */
export async function loadWorksheetExample(mod, payload, { Model, rewriteRefs, confirmed = false, prevId: knownPrevId }) {
  if (!payload || !payload.data) return;
  const ctx = mod._context;
  const t = (key) => ctx.i18n.t(key);

  // Hat der Aufrufer den Stand schon geladen, kennt er auch das vorige Arbeitsblatt.
  const currentModel = knownPrevId === undefined
    ? currentModelOf(Model, mod.getState(), mod._context?.stateManager) : null;
  if (!confirmed && currentModel?.hasContent?.() && ctx?.dialog) {
    const ok = await ctx.dialog.confirm({ message: t('moduleHelp.confirmOverwrite'), danger: true });
    if (!ok) return;
  }

  let data = { ...payload.data };

  if (data.sourceWorksheetData) {
    const wsState = data.sourceWorksheetData;
    delete data.sourceWorksheetData;

    const prevId = knownPrevId ?? currentModel?.exampleWorksheetId;
    if (prevId) removeProvisionedWorksheet(ctx, prevId);

    const ref = provisionWorksheet(ctx, wsState);
    if (ref) {
      data.exampleWorksheetId = ref.instanceId;
      data = rewritePlaceholder(Model, rewriteRefs, data, '__source__', ref.instanceId);
      await whenWorksheetReadable(ctx, ref.instanceId);
    }
  }

  mod.setState(data);

  const lang = ctx.i18n.getLanguage();
  const title = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
  ctx.notify?.(t('moduleHelp.exampleLoaded').replace('{title}', title), 'success');
}

// ─── CSV parsing ───────────────────────────────────────────────

/**
 * Adapter for the example datasets shipped with the app: reads comma-separated
 * text with one header row through the central CSV parser.
 *
 * Returns an object: { columns: [{name, type, values:[]}, ...], rows: [[...]] }
 *
 * @param {string} text
 * @returns {{ columns: object[], rows: any[][] }}
 */
export function parseCsv(text) {
  const rows = readCsvRecords(text, { delimiter: 'comma' })
    .slice(1)
    .filter(r => r.some(c => c.length > 0));
  let sheet;
  try {
    sheet = parseCsvText(text, { delimiter: 'comma', hasHeader: true }).sheets[0];
  } catch (err) {
    if (err?.code === 'errCsvEmpty') return { columns: [], rows: [] };
    throw err;
  }
  const columns = sheet.columns.map(({ name, type, values }) => ({ name, type, values }));
  return { columns, rows };
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
