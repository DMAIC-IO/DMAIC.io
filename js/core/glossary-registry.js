/**
 * DMAIC.io — Glossary Registry (glossary-registry.js)
 *
 * Loads `app/dev/glossary/index.json` at bootstrap and lazy-fetches
 * individual term files on demand. Single source of truth for the
 * help-panel glossary tab, the `{{term:…}}` inline link renderer, and
 * the static handbook's `/glossar/` section.
 *
 * Schema is documented in app/dev/glossary/README.md
 * and in .claude/GLOSSAR-KONZEPT.md.
 */

const CATALOG_URL = './glossary/index.json';
const BASE_PATH = './glossary/';

export class GlossaryRegistry {
  constructor() {
    /** @type {{id:string,category:string,file:string}[]} */
    this._index = [];
    /** @type {{id:string,label:{de:string,en:string}}[]} */
    this._categories = [];
    /** Loaded full term entries keyed by id. */
    this._terms = new Map();
    /** In-flight term fetch promises, to dedupe parallel calls. */
    this._inflight = new Map();
    this._initialized = false;
  }

  /**
   * Load the index. Term files are fetched lazily.
   * Failures are non-fatal — registry stays empty.
   * @returns {Promise<void>}
   */
  async init() {
    try {
      const res = await fetch(CATALOG_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const catalog = await res.json();
      this._index = Array.isArray(catalog?.terms) ? catalog.terms : [];
      this._categories = Array.isArray(catalog?.categories) ? catalog.categories : [];
    } catch (err) {
      console.warn('[GlossaryRegistry] Could not load catalog:', err.message);
      this._index = [];
      this._categories = [];
    }
    this._initialized = true;
  }

  isInitialized() {
    return this._initialized;
  }

  /** All index entries (lightweight — no definition payload). */
  getAll() {
    return this._index.slice();
  }

  /**
   * All warmed terms as lightweight entries (id, category, title, short).
   * Used by the header glossary button to populate the catalog view in
   * the help-panel without filtering on a module.
   */
  getAllCached() {
    const out = [];
    for (const t of this._terms.values()) {
      out.push({ id: t.id, category: t.category, title: t.title, short: t.short });
    }
    return out;
  }

  /**
   * Synchronous title lookup from the warmed cache. Returns the localized
   * title if the term is loaded, falling back to the other language, then
   * to the id. Use this for inline labels (seeAlso lists, `{{term:id}}`
   * cross-refs without explicit label).
   *
   * @param {string} id
   * @param {string} lang
   * @returns {string}
   */
  getCachedTitle(id, lang) {
    const t = this._terms.get(id);
    if (!t) return id;
    return t.title?.[lang] || t.title?.de || t.title?.en || id;
  }

  getCategories() {
    return this._categories.slice();
  }

  /**
   * Index entries whose `modules` field contains the given moduleId.
   * Reads from cached full entries only; entries not yet loaded are
   * eagerly fetched here so the help-panel tab visibility check is sync
   * after the first warm-up. Use `warmForModule()` to prefetch.
   *
   * @param {string} moduleId
   * @returns {{id:string,category:string,title?:object,short?:object}[]}
   */
  getForModule(moduleId) {
    if (!moduleId) return [];
    const out = [];
    for (const idx of this._index) {
      const full = this._terms.get(idx.id);
      if (!full) continue;
      if (Array.isArray(full.modules) && full.modules.includes(moduleId)) {
        out.push({
          id: full.id,
          category: full.category,
          title: full.title,
          short: full.short,
        });
      }
    }
    return out;
  }

  /**
   * Ensure all term files are loaded so `getForModule()` returns the
   * complete result set. Call this once after `init()` (or lazily on
   * first help-panel open). Failures per-term are logged and skipped.
   *
   * @returns {Promise<void>}
   */
  async warmAll() {
    await Promise.all(this._index.map(idx => this.get(idx.id).catch(() => null)));
  }

  /**
   * Lazy-load a single term entry by id.
   * @param {string} termId
   * @returns {Promise<object|null>}
   */
  async get(termId) {
    if (!termId) return null;
    if (this._terms.has(termId)) return this._terms.get(termId);
    if (this._inflight.has(termId)) return this._inflight.get(termId);

    const idx = this._index.find(e => e.id === termId);
    if (!idx) return null;

    const url = `${BASE_PATH}${idx.file}`;
    const p = (async () => {
      try {
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const term = await res.json();
        this._terms.set(termId, term);
        return term;
      } catch (err) {
        console.warn(`[GlossaryRegistry] Could not load term "${termId}":`, err.message);
        return null;
      } finally {
        this._inflight.delete(termId);
      }
    })();
    this._inflight.set(termId, p);
    return p;
  }

  /**
   * Simple full-text search over title + short + aliases for already-loaded
   * terms. Returns lightweight match objects (no `definition`).
   *
   * @param {string} query
   * @param {string} lang  language code ('de' | 'en')
   * @returns {{id:string,category:string,title?:object,short?:object}[]}
   */
  search(query, lang) {
    const q = (query || '').trim().toLowerCase();
    if (!q) return [...this._terms.values()].map(stripDef);

    const out = [];
    for (const term of this._terms.values()) {
      const haystack = [
        term.title?.[lang], term.title?.de, term.title?.en,
        term.short?.[lang], term.short?.de, term.short?.en,
        ...(term.aliases?.[lang] || []),
        ...(term.aliases?.de || []),
        ...(term.aliases?.en || []),
      ].filter(Boolean).join('  ').toLowerCase();
      if (haystack.includes(q)) out.push(stripDef(term));
    }
    return out;
  }
}

function stripDef(term) {
  return {
    id: term.id,
    category: term.category,
    title: term.title,
    short: term.short,
  };
}
