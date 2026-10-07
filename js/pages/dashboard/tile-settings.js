/**
 * D.Mike — Dashboard tile settings helpers (tile-settings.js)
 *
 * Pure functions around a tile's declarative settings schema:
 * validation, value coercion, resolution against stored overrides and the
 * sparse storage format of `dashboard.tileSettings`. See docs/DASHBOARD.md.
 */

const TYPES = new Set(['number', 'select', 'boolean']);

/** Validated schema per tile object, so a broken schema warns only once. */
const schemaCache = new WeakMap();

/**
 * Describe why a schema field is invalid.
 * @param {object} field
 * @returns {string|null} problem, or null when the field is valid
 */
function fieldProblem(field) {
  if (!field || typeof field !== 'object') return 'not an object';
  if (!TYPES.has(field.type)) return `unknown type "${field.type}"`;
  if (typeof field.label !== 'string' || field.label === '') return 'missing label';
  if (!Object.hasOwn(field, 'default')) return 'missing default';
  if (field.type === 'number') {
    if (!Number.isFinite(field.min) || !Number.isFinite(field.max) || field.min > field.max) {
      return 'number needs finite min <= max';
    }
    if (field.step !== undefined && !(Number.isFinite(field.step) && field.step > 0)) return 'step must be > 0';
    if (!Number.isFinite(field.default) || field.default < field.min || field.default > field.max) {
      return 'default outside min/max';
    }
  }
  if (field.type === 'select') {
    if (!Array.isArray(field.options) || field.options.length === 0) return 'select needs options';
    if (!field.options.every(o => typeof o === 'string')) return 'select options must be strings';
    if (!field.options.includes(field.default)) return 'default not in options';
  }
  if (field.type === 'boolean' && typeof field.default !== 'boolean') return 'boolean default must be a boolean';
  return null;
}

/**
 * Return the valid fields of a settings schema. Invalid fields are dropped
 * with a warning, so a broken field never breaks the tile.
 * @param {object|undefined} schema
 * @param {(msg: string) => void} [warn]
 * @returns {object}
 */
export function validateSchema(schema, warn = console.warn) {
  const out = {};
  if (!schema || typeof schema !== 'object') return out;
  for (const [key, field] of Object.entries(schema)) {
    const problem = fieldProblem(field);
    if (problem) {
      warn(`[tile-settings] field "${key}" ignored: ${problem}`);
      continue;
    }
    out[key] = field;
  }
  return out;
}

/**
 * Validated settings schema of a tile, cached per tile object.
 * @param {object} tile  tile-file default export
 * @returns {object}
 */
export function schemaOf(tile) {
  if (!tile || typeof tile !== 'object') return {};
  let schema = schemaCache.get(tile);
  if (!schema) {
    schema = validateSchema(tile.settings);
    schemaCache.set(tile, schema);
  }
  return schema;
}

/**
 * Coerce a raw value (form input or stored JSON) into a valid field value.
 * Anything unusable falls back to the field default.
 * @param {object} field  a valid schema field
 * @param {*} raw
 * @returns {*}
 */
export function coerceValue(field, raw) {
  if (field.type === 'number') {
    const usable = typeof raw === 'number' || (typeof raw === 'string' && raw.trim() !== '');
    const n = usable ? Number(raw) : NaN;
    if (!Number.isFinite(n)) return field.default;
    const step = field.step ?? 1;
    const stepped = field.min + Math.round((n - field.min) / step) * step;
    const clamped = Math.min(field.max, Math.max(field.min, stepped));
    return Number(clamped.toFixed(10));
  }
  if (field.type === 'select') return field.options.includes(raw) ? raw : field.default;
  return typeof raw === 'boolean' ? raw : field.default;
}

/**
 * Complete, valid settings for every schema key: stored overrides merged
 * over defaults. Unknown stored keys are ignored.
 * @param {object} schema  validated schema
 * @param {object|undefined} stored
 * @returns {object}
 */
export function resolveSettings(schema, stored) {
  const src = (stored && typeof stored === 'object') ? stored : {};
  const out = {};
  for (const [key, field] of Object.entries(schema)) {
    out[key] = Object.hasOwn(src, key) ? coerceValue(field, src[key]) : field.default;
  }
  return out;
}

/**
 * Sparse storage entry: only values that differ from the default. Keys of
 * `previous` that the schema does not know are kept unchanged.
 * @param {object} schema  validated schema
 * @param {object} values
 * @param {object} [previous]
 * @returns {object}
 */
export function toStored(schema, values, previous = {}) {
  const out = {};
  for (const [key, value] of Object.entries(previous || {})) {
    if (!Object.hasOwn(schema, key)) out[key] = value;
  }
  for (const [key, field] of Object.entries(schema)) {
    const value = coerceValue(field, values?.[key]);
    if (value !== field.default) out[key] = value;
  }
  return out;
}

/**
 * Write one tile's entry into a copy of the settings map. An empty entry
 * removes the tile.
 * @param {object|undefined} all  current `dashboard.tileSettings`
 * @param {string} tileId
 * @param {object} stored  sparse entry from toStored()
 * @returns {object}
 */
export function withTileSettings(all, tileId, stored) {
  const next = { ...(all || {}) };
  if (stored && Object.keys(stored).length > 0) next[tileId] = stored;
  else delete next[tileId];
  return next;
}

/**
 * Drop entries whose tile no longer exists, and empty entries.
 * @param {object|undefined} all
 * @param {Iterable<string>} liveIds
 * @returns {object}
 */
export function pruneTileSettings(all, liveIds) {
  const live = new Set(liveIds);
  const out = {};
  for (const [id, entry] of Object.entries(all || {})) {
    if (!live.has(id)) continue;
    if (!entry || typeof entry !== 'object' || Object.keys(entry).length === 0) continue;
    out[id] = entry;
  }
  return out;
}

/**
 * Decide what the layout-save path does with stored tile settings: prune
 * entries of tiles that no longer enumerate, but only when every tile file
 * loaded (a transient chunk error must never delete settings).
 * @param {object|undefined} all  stored dashboard.tileSettings
 * @param {Iterable<string>} liveIds  ids of all current tile descriptors
 * @param {boolean} allLoaded  whether every tile file loaded in this render
 * @returns {object|null} the pruned object to store, or null when nothing changes
 */
export function settingsToStoreOnLayoutSave(all, liveIds, allLoaded) {
  if (!allLoaded) return null;
  const current = all || {};
  const pruned = pruneTileSettings(current, liveIds);
  return Object.keys(pruned).length !== Object.keys(current).length ? pruned : null;
}
