/**
 * Algorithm Lab — root Alpine component factory.
 * Owns sidebar, overview, and the docs/source/validation/history tabs.
 * Try-It is a nested `labTryIt` component (see lab-tryit-component.js).
 */
import { renderFormula, renderCode } from './lab-renderer.js';
import { buildFunction, prepareInputs, mapArgs, getByPath, compare } from './lab-exec.js';
import { stripTermTokens } from '../core/markdown-parser.js';
import { SOURCES } from './lab-data.generated.js';

const TABS = ['docs', 'source', 'validation', 'tryit', 'history'];
const TIERS = ['standard', 'edge', 'stress', 'robustness'];

function locValue(value, lang) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return value[lang] ?? value.en ?? value.de ?? '';
  return String(value);
}

/**
 * @param {object} deps
 * @param {import('./lab-registry.js').LabRegistry} deps.registry
 * @param {import('../core/i18n.js').I18n} deps.i18n
 * @param {import('../core/event-bus.js').EventBus} deps.eventBus
 */
export function createLabComponent({ registry, i18n, eventBus }) {
  return {
    TABS,
    categories: [],          // [{id, name, open, algos:[{id,name,status}]}]
    search: '',
    lang: i18n.getLanguage(),
    selectedAlgo: null,
    activeTab: 'docs',
    // source tab
    sourceCode: '',
    // validation tab
    fixtures: null,
    vReady: false,
    vRunning: false,
    vRows: [],               // flat [{id, tier, description, status, details, duration}]

    async init() {
      await registry.loadIndex();
      this.categories = await this._buildCategories();
      this._onLang = () => { this.lang = i18n.getLanguage(); this._refreshCategories(); };
      eventBus.on('language:changed', this._onLang);
      // theme:changed + lab:navigate are wired by the algorithm-lab page host's
      // mount() (it also needs them before Alpine mounts); see
      // js/pages/algorithm-lab/algorithm-lab.js.
    },

    destroy() {
      if (this._onLang) eventBus.off('language:changed', this._onLang);
    },

    // ── i18n / loc (touch this.lang so bindings re-eval on language change) ──
    t(key) { return this.lang, i18n.t(key); },
    loc(value) { return locValue(value, this.lang); },
    // Algorithm display name as PLAIN text: glossary `{{term:…}}` tokens flatten
    // to their label. The interactive link belongs in the docs body, not in a
    // sidebar button / heading / search key.
    algoName(algo) { return stripTermTokens(this.loc(algo?.name)); },

    async _buildCategories() {
      // Keep ALL categories (including empty ones) so the overview shows a card
      // per category; the sidebar drops empties via `visibleCategories`.
      const grouped = await registry.getAlgorithmsByCategory();
      return registry.getCategories()
        .map(cat => ({
          id: cat.id, name: cat.name, open: true,
          algos: (grouped.get(cat.id) || []).map(a => ({ id: a.id, name: a.name, status: a.status })),
        }));
    },
    async _refreshCategories() {
      const open = new Set(this.categories.filter(c => c.open).map(c => c.id));
      this.categories = (await this._buildCategories()).map(c => ({ ...c, open: open.has(c.id) || c.open }));
    },

    // ── Sidebar ──
    toggleCategory(cat) { cat.open = !cat.open; },
    navigateFirstAlgo(cat) { if (cat.algos.length) this.navigate(cat.algos[0].id); },
    algoMatches(algo) {
      const q = this.search.toLowerCase().trim();
      if (!q) return true;
      return this.algoName(algo).toLowerCase().includes(q) || algo.id.toLowerCase().includes(q);
    },
    get visibleCategories() {
      // Sidebar drops empty categories (the overview keeps them as cards).
      const nonEmpty = this.categories.filter(c => c.algos.length > 0);
      const q = this.search.toLowerCase().trim();
      if (!q) return nonEmpty;
      return nonEmpty.filter(c => c.algos.some(a => this.algoMatches(a)));
    },
    get selectedId() { return this.selectedAlgo?.id ?? null; },

    // ── Overview ──
    get stats() {
      const all = this.categories.flatMap(c => c.algos);
      return {
        total: all.length,
        validated: all.filter(a => a.status === 'validated').length,
        inProgress: all.filter(a => a.status === 'in-progress').length,
      };
    },

    // ── Navigation ──
    async navigate(algoId, tab = 'docs') {
      this.selectedAlgo = await registry.getAlgorithm(algoId);
      // ensure the containing category is open
      const cat = this.categories.find(c => c.algos.some(a => a.id === algoId));
      if (cat) cat.open = true;
      await this.setTab(tab);
    },
    async setTab(tab) {
      this.activeTab = tab;
      if (tab === 'source') await this._ensureSource();
      if (tab === 'validation') await this._ensureValidation();
    },

    // ── Docs getters ──
    get docLong() { return this.loc(this.selectedAlgo?.description?.long); },
    get formulas() { return this.selectedAlgo?.documentation?.formulas || []; },
    get assumptions() { return this.selectedAlgo?.documentation?.assumptions || []; },
    get limitations() { return this.selectedAlgo?.documentation?.limitations || []; },
    get references() { return this.selectedAlgo?.documentation?.references || []; },
    get minitab() { return this.selectedAlgo?.documentation?.minitab_equivalent || ''; },
    get changelog() { return this.selectedAlgo?.changelog || []; },
    renderFormula(el, f, lang) { return renderFormula(el, f, lang); },
    refLabel(ref) { return ref.source + (ref.chapter ? `, ${  ref.chapter}` : ''); },

    // ── Source ──
    async _ensureSource() {
      const src = this.selectedAlgo?.source;
      this.sourceCode = '';
      if (!src) return;
      let code = null;
      if (src.file_path) {
        // Prefer inlined data; fall back to fetch for un-built/un-generated checkouts.
        if (SOURCES && SOURCES[src.file_path] != null) {
          code = SOURCES[src.file_path];
        } else {
          try { const r = await fetch(src.file_path); code = r.ok ? await r.text() : null; }
          catch { /* ignore */ }
        }
      }
      this.sourceCode = code || `// Source: ${src.file_path}\n// Function: ${src.function_name}()`;
    },
    renderSource(el) { if (this.sourceCode) renderCode(el, this.sourceCode, 'javascript'); },
    copySource() { navigator.clipboard.writeText(this.sourceCode).catch(() => {}); },
    get returnRows() {
      const props = this.selectedAlgo?.source?.signature?.returns?.properties || {};
      return Object.entries(props).map(([key, v]) => ({ key, type: v.type, description: v.description }));
    },

    // ── Validation ──
    async _ensureValidation() {
      this.vReady = false;
      try {
        this.fixtures = await registry.getFixtures(this.selectedAlgo.id);
      } catch {
        this.fixtures = null;
      }
      this.vRows = (this.fixtures?.test_cases || []).map(tc => ({
        id: tc.id, tier: tc.tier, description: tc.description || '',
        status: 'pending', details: '', duration: null,
      }));
      this.vReady = true;
    },
    runAllLabel() { return this.vRunning ? '...' : this.t('lab.validation.runAll'); },
    get vGenInfo() {
      const g = this.fixtures?.generated_with;
      if (!g) return '';
      return g.method || `Python ${g.python} / SciPy ${g.scipy}`;
    },
    get vTiers() {
      return TIERS.map(name => {
        const rows = this.vRows.filter(r => r.tier === name).map(r => ({
          ...r,
          statusIcon: r.status === 'pass' ? 'status.ok' : r.status === 'fail' ? 'status.error' : null,
          durationText: r.duration == null ? '' : `${r.duration.toFixed(2)} ms`,
        }));
        const pass = rows.filter(r => r.status === 'pass').length;
        const done = rows.filter(r => r.status !== 'pending').length;
        return { name, rows, label: name.charAt(0).toUpperCase() + name.slice(1),
                 countText: `${done ? pass : 0}/${rows.length}` };
      }).filter(t => t.rows.length > 0);
    },
    get vSummary() {
      const total = this.vRows.length;
      const done = this.vRows.filter(r => r.status !== 'pending');
      if (done.length === 0) return { state: 'pending', text: `${total} ${i18n.t('lab.validation.pending')}` };
      const pass = done.filter(r => r.status === 'pass').length;
      const state = pass === total ? 'pass' : 'fail';
      return { state, text: `${pass}/${total} ${i18n.t('lab.validation.passed')}` };
    },
    async runAll() {
      this.vRunning = true;
      let fn;
      try { fn = await buildFunction(this.selectedAlgo); }
      catch (err) {
        this.vRows = this.vRows.map(r => ({ ...r, status: 'fail', details: `Error: ${err.message}` }));
        this.vRunning = false;
        return;
      }
      const byId = new Map(this.fixtures.test_cases.map(tc => [tc.id, tc]));
      this.vRows = this.vRows.map(r => this._runOne(fn, byId.get(r.id), r));
      this.vRunning = false;
    },
    _runOne(fn, tc, row) {
      const tol = tc.tolerance_override
        ? this.fixtures.tolerances.overrides[tc.tolerance_override]
        : this.fixtures.tolerances.default;
      const start = performance.now();
      let result = null, error = null;
      try { result = fn(...mapArgs(this.selectedAlgo, prepareInputs(tc.inputs))); }
      catch (e) { error = { type: e.constructor.name, message: e.message }; }
      const duration = performance.now() - start;

      let pass = false, details = '';
      if (tc.expected_error) {
        pass = Boolean(error && error.type === tc.expected_error.type &&
          error.message.includes(tc.expected_error.message_contains));
        details = pass ? `${error.type}: ${error.message}`
          : error ? `Got ${error.type}: ${error.message}` : 'No error thrown';
      } else if (tc.expected && !error) {
        const checks = [];
        if (Array.isArray(tc.expected)) {
          const arr = Array.isArray(result) ? result : [];
          tc.expected.forEach((expItem, i) => {
            for (const [field, expVal] of Object.entries(expItem)) {
              const ok = compare(arr[i] != null ? arr[i][field] : undefined, expVal, tol);
              checks.push(ok);
              if (!ok) details += `${i}.${field}: ${JSON.stringify(arr[i]?.[field])} ≠ ${JSON.stringify(expVal)} `;
            }
          });
        } else {
          for (const [key, expected] of Object.entries(tc.expected)) {
            const ok = compare(getByPath(result, key), expected, tol);
            checks.push(ok);
            if (!ok) details += `${key}: ${getByPath(result, key)} ≠ ${expected} `;
          }
        }
        pass = checks.every(Boolean);
        if (pass) details = 'All values match';
      } else if (error) {
        details = `Unexpected error: ${error.message}`;
      }
      return { ...row, status: pass ? 'pass' : 'fail', details, duration };
    },
  };
}
