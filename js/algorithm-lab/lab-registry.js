/**
 * Algorithm Lab — Registry
 * Loads and caches algorithm index, algorithm JSONs, and fixture files.
 */
import { INDEX, ALGOS } from './lab-data.generated.js';

export class LabRegistry {
  constructor() {
    /** @type {Map<string, object>} id → algorithm JSON */
    this._algorithms = new Map();
    /** @type {Map<string, object>} id → fixture JSON */
    this._fixtures = new Map();
    /** @type {object|null} */
    this._index = null;
  }

  /**
   * Load the algorithm index.
   * @returns {Promise<object>}
   */
  async loadIndex() {
    if (this._index) return this._index;
    // Prefer inlined data; fall back to fetch for un-built/un-generated checkouts.
    if (INDEX) { this._index = INDEX; return this._index; }
    const resp = await fetch('js/algorithm-lab/algorithms/index.json', { cache: 'no-cache' });
    if (!resp.ok) throw new Error(`Failed to load algorithm index: ${resp.status}`);
    this._index = await resp.json();
    return this._index;
  }

  /**
   * Get all categories from the index.
   * @returns {Array<{id: string, name: string}>}
   */
  getCategories() {
    return this._index?.categories ?? [];
  }

  /**
   * Get all algorithm entries from the index.
   * @returns {Array<{id: string, path: string}>}
   */
  getAllEntries() {
    return this._index?.algorithms ?? [];
  }

  /**
   * Load a single algorithm JSON by ID.
   * @param {string} algoId
   * @returns {Promise<object>}
   */
  async getAlgorithm(algoId) {
    if (this._algorithms.has(algoId)) return this._algorithms.get(algoId);

    // Prefer inlined data; fall back to fetch for un-built/un-generated checkouts.
    if (ALGOS && ALGOS[algoId]) {
      this._algorithms.set(algoId, ALGOS[algoId]);
      return ALGOS[algoId];
    }

    const entry = this.getAllEntries().find(a => a.id === algoId);
    if (!entry) throw new Error(`Algorithm not found: ${algoId}`);

    const resp = await fetch(entry.path, { cache: 'no-cache' });
    if (!resp.ok) throw new Error(`Failed to load algorithm ${algoId}: ${resp.status}`);
    const data = await resp.json();
    this._algorithms.set(algoId, data);
    return data;
  }

  /**
   * Get algorithms grouped by category (loads all algorithm JSONs).
   * @returns {Promise<Map<string, object[]>>}
   */
  async getAlgorithmsByCategory() {
    const entries = this.getAllEntries();
    const all = await Promise.all(entries.map(e => this.getAlgorithm(e.id)));

    const grouped = new Map();
    for (const cat of this.getCategories()) {
      grouped.set(cat.id, []);
    }
    for (const algo of all) {
      const list = grouped.get(algo.category);
      if (list) list.push(algo);
    }
    return grouped;
  }

  /**
   * Load fixture file for an algorithm.
   * @param {string} algoId
   * @returns {Promise<object|null>}
   */
  async getFixtures(algoId) {
    if (this._fixtures.has(algoId)) return this._fixtures.get(algoId);

    const algo = await this.getAlgorithm(algoId);
    const path = `tests/fixtures/${algo.category}/${algoId}.fixtures.json`;

    try {
      const resp = await fetch(path, { cache: 'no-cache' });
      if (!resp.ok) return null;
      const data = await resp.json();
      this._fixtures.set(algoId, data);
      return data;
    } catch {
      return null;
    }
  }

  /**
   * Search algorithms by query string (fuzzy match on id + name).
   * @param {string} query
   * @returns {object[]}
   */
  search(query) {
    const q = query.toLowerCase().trim();
    if (!q) return [...this._algorithms.values()];
    const str = (v) => {
      if (!v) return '';
      if (typeof v === 'string') return v;
      if (typeof v === 'object') return Object.values(v).join(' ');
      return '';
    };
    return [...this._algorithms.values()].filter(a =>
      a.id.toLowerCase().includes(q) ||
      str(a.name).toLowerCase().includes(q) ||
      str(a.description?.short).toLowerCase().includes(q)
    );
  }
}
