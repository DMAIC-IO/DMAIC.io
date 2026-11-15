/**
 * D.Mike — Survey builder: texts in the language of the questionnaire.
 *
 * The questionnaire file speaks `survey.lang`, which may differ from the
 * interface language. Its texts (`runner`, `kano`) therefore come from the
 * module's own `i18n/ui.<lang>.json` over the resource URLs of the build,
 * with gaps filled from `en`, once per file.
 */
import { readModuleResources, fetchJson } from '../../../core/module-resources.js';

const MODULE_ID = 'survey-builder';

/** @type {WeakMap<Function, Map<string, Promise<any>>>} loaded files per fetch function and url */
const cache = new WeakMap();

/** @param {unknown} v @returns {boolean} a plain object */
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * `base` with every value of `over` on top; objects merge, anything else is replaced.
 * @param {any} base @param {any} over @returns {any} a new value
 */
function overlay(base, over) {
  if (!isObject(base) || !isObject(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = overlay(base[k], v);
  return out;
}

/**
 * One language file of the module, `null` if it cannot be loaded.
 * @param {Record<string, any>} entry resource entry of the module
 * @param {string} lang @param {(url: string) => Promise<any>} fetch
 * @returns {Promise<Record<string, any>|null>}
 */
async function loadFile(entry, lang, fetch) {
  const url = entry.files?.[`i18n/ui.${lang}.json`];
  if (!url) return null;
  let files = cache.get(fetch);
  if (!files) { files = new Map(); cache.set(fetch, files); }
  let pending = files.get(url);
  if (!pending) {
    pending = fetch(url);
    files.set(url, pending);
    pending.catch(() => { if (files.get(url) === pending) files.delete(url); });
  }
  try {
    const json = await pending;
    return isObject(json) ? json : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} lang @param {Record<string, any>} entry @param {(url: string) => Promise<any>} fetch
 * @returns {Promise<{ runner: object, kano: object }>}
 */
async function build(lang, entry, fetch) {
  const en = await loadFile(entry, 'en', fetch);
  const own = lang === 'en' ? null : await loadFile(entry, lang, fetch);
  if (!en && !own) throw new Error(`[${MODULE_ID}] texts for "${lang}" could not be loaded`);
  const merged = overlay(en ?? {}, own ?? {});
  return structuredClone({ runner: merged.runner ?? {}, kano: merged.kano ?? {} });
}

/**
 * The texts the questionnaire file needs in a language: the strings of the
 * runner and the Kano scale. A language file that fails to load yields the
 * result from `en`; a failure is not remembered.
 * @param {string} lang `de` or `en`
 * @param {{ resources?: Record<string, any>, fetch?: (url: string) => Promise<any> }} [deps]
 * @returns {Promise<{ runner: object, kano: object }>}
 * @throws {Error} the module is missing in the resources, or no language file loads
 */
export async function loadTexts(lang, { resources = readModuleResources(), fetch = fetchJson } = {}) {
  const entry = resources[MODULE_ID];
  if (!entry) throw new Error(`[${MODULE_ID}] module is missing in the resources`);
  return build(lang, entry, fetch);
}
