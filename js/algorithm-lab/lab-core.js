/**
 * Algorithm Lab — Core Controller
 * Routing, tab management, all tab rendering, HTML skeleton.
 * Renders inside the #dev-area container.
 */

import { LabRegistry } from './lab-registry.js';
import { LabSidebar } from './lab-sidebar.js';
import { LabTryIt } from './lab-try-it.js';
import { renderFormulas, renderCode, renderTimeline, statusBadgeHTML, updatePrismTheme } from './lab-renderer.js';

const TABS = ['docs', 'source', 'validation', 'tryit', 'history'];

/**
 * Resolve a localized value.
 * Accepts either a plain string or an object { de: "...", en: "..." }.
 * @param {string|object} value
 * @param {string} lang - current language code
 * @returns {string}
 */
function loc(value, lang) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return value[lang] ?? value.en ?? value.de ?? '';
  return String(value);
}

export class AlgorithmLab {
  /**
   * @param {HTMLElement} container - The #dev-area element
   * @param {object} deps
   * @param {import('../core/event-bus.js').EventBus} deps.eventBus
   * @param {import('../core/i18n.js').I18n} deps.i18n
   */
  constructor(container, { eventBus, i18n }) {
    this._container = container;
    this._eventBus = eventBus;
    this._i18n = i18n;
    this._registry = new LabRegistry();
    this._sidebar = null;
    this._tryIt = null;
    this._currentAlgo = null;
    this._currentTab = 'docs';
    this._initialized = false;
  }

  /** Resolve a localized value from algorithm JSON. */
  _loc(value) { return loc(value, this._i18n.getLanguage()); }

  /**
   * Initialize the lab — build HTML, load index, render sidebar.
   */
  async init() {
    if (this._initialized) return;
    this._initialized = true;

    this._buildSkeleton();

    try {
      await this._registry.loadIndex();
      const grouped = await this._registry.getAlgorithmsByCategory();

      this._sidebar = new LabSidebar(
        this._sidebarEl,
        { onAlgoSelect: id => this.navigate(id), i18n: this._i18n, loc: (v) => this._loc(v) }
      );
      this._sidebar.render(this._registry.getCategories(), grouped);

      this._renderOverview(grouped);
    } catch (err) {
      this._contentEl.innerHTML = `<div class="lab__error">${err.message}</div>`;
    }

    // Listen for navigate events from other modules
    this._onNavigate = (e) => this.navigate(e.algoId, e.tab);
    this._eventBus.on('lab:navigate', this._onNavigate);

    // Listen for theme changes to swap Prism CSS
    this._onTheme = (theme) => updatePrismTheme(theme);
    this._eventBus.on('theme:changed', this._onTheme);

    // Listen for language changes to re-render all localized content
    this._onLanguage = async () => {
      const grouped = await this._registry.getAlgorithmsByCategory();
      this._sidebar?.render(this._registry.getCategories(), grouped);
      if (this._currentAlgo) {
        this._sidebar?.setActive(this._currentAlgo.id);
        this._renderAlgoHeader(this._currentAlgo);
        this._renderTabs(this._currentTab);
        await this._renderTabContent(this._currentAlgo, this._currentTab);
      } else {
        this._renderOverview(grouped);
      }
    };
    this._eventBus.on('language:changed', this._onLanguage);
  }

  /**
   * Navigate to a specific algorithm and tab.
   * @param {string} algoId
   * @param {string} [tab='docs']
   */
  async navigate(algoId, tab = 'docs') {
    try {
      const algo = await this._registry.getAlgorithm(algoId);
      this._currentAlgo = algo;
      this._currentTab = tab;

      this._sidebar?.setActive(algoId);
      this._renderAlgoHeader(algo);
      this._renderTabs(tab);
      await this._renderTabContent(algo, tab);
    } catch (err) {
      this._contentEl.innerHTML = `<div class="lab__error">${err.message}</div>`;
    }
  }

  /**
   * Clean up event listeners.
   */
  destroy() {
    if (this._onNavigate) this._eventBus.off('lab:navigate', this._onNavigate);
    if (this._onTheme) this._eventBus.off('theme:changed', this._onTheme);
    if (this._onLanguage) this._eventBus.off('language:changed', this._onLanguage);
  }

  // ─── Skeleton ──────────────────────────────────────────────

  _buildSkeleton() {
    this._container.innerHTML = `<div class="lab">
      <div class="lab__sidebar-slot"></div>
      <div class="lab__content">
        <div class="lab__algo-header-slot"></div>
        <div class="lab__tabs-slot"></div>
        <div class="lab__tab-content"></div>
      </div>
    </div>`;

    this._sidebarEl = this._container.querySelector('.lab__sidebar-slot');
    this._contentEl = this._container.querySelector('.lab__content');
    this._headerSlot = this._container.querySelector('.lab__algo-header-slot');
    this._tabsSlot = this._container.querySelector('.lab__tabs-slot');
    this._tabContent = this._container.querySelector('.lab__tab-content');

    this._tabsSlot.addEventListener('click', (e) => {
      const btn = e.target.closest('.lab__tab');
      if (!btn || !this._currentAlgo) return;
      const tab = btn.dataset.tab;
      this._currentTab = tab;

      this._tabsSlot.querySelectorAll('.lab__tab').forEach(t =>
        t.classList.toggle('lab__tab--active', t.dataset.tab === tab)
      );

      this._renderTabContent(this._currentAlgo, tab);
    });
  }

  // ─── Overview (start page) ─────────────────────────────────

  _renderOverview(grouped) {
    this._headerSlot.innerHTML = '';
    this._tabsSlot.innerHTML = '';

    const allAlgos = [...grouped.values()].flat();
    const validated = allAlgos.filter(a => a.status === 'validated').length;
    const inProgress = allAlgos.filter(a => a.status === 'in-progress').length;
    const t = (k) => this._i18n.t(k);

    this._tabContent.innerHTML = '';
    this._tabContent.className = 'lab__tab-content';
    const overview = document.createElement('div');
    overview.className = 'lab__overview';

    overview.innerHTML = `
      <h2 class="lab__overview-title">${t('lab.overview.title')}</h2>
      <div class="lab__overview-stats">
        <div class="lab__stat-card">
          <div class="lab__stat-value">${allAlgos.length}</div>
          <div class="lab__stat-label">${t('lab.overview.totalAlgorithms')}</div>
        </div>
        <div class="lab__stat-card">
          <div class="lab__stat-value" style="color: var(--color-success)">${validated}</div>
          <div class="lab__stat-label">${t('lab.status.validated')}</div>
        </div>
        <div class="lab__stat-card">
          <div class="lab__stat-value" style="color: var(--color-warning)">${inProgress}</div>
          <div class="lab__stat-label">${t('lab.status.in-progress')}</div>
        </div>
      </div>
      <div class="lab__category-cards"></div>
    `;

    const cards = overview.querySelector('.lab__category-cards');
    for (const cat of this._registry.getCategories()) {
      const algos = grouped.get(cat.id) || [];
      const card = document.createElement('div');
      card.className = 'lab__category-card';
      card.innerHTML = `
        <div class="lab__category-card-name">${this._loc(cat.name)}</div>
        <div class="lab__category-card-count">${algos.length} ${t('lab.overview.totalAlgorithms')}</div>
      `;
      if (algos.length > 0) {
        card.addEventListener('click', () => this.navigate(algos[0].id));
      }
      cards.append(card);
    }

    this._tabContent.append(overview);
  }

  // ─── Algorithm Header ──────────────────────────────────────

  _renderAlgoHeader(algo) {
    this._headerSlot.innerHTML = `
      <div class="lab__algo-header">
        <span class="lab__algo-name">${this._loc(algo.name)}</span>
        <span class="lab__algo-version">v${algo.version}</span>
        ${statusBadgeHTML(algo.status, this._i18n)}
      </div>
    `;
  }

  // ─── Tabs ──────────────────────────────────────────────────

  _renderTabs(activeTab) {
    const t = (k) => this._i18n.t(k);
    this._tabsSlot.innerHTML = `<div class="lab__tabs">
      ${TABS.map(tab => `
        <button class="lab__tab ${tab === activeTab ? 'lab__tab--active' : ''}" data-tab="${tab}">
          ${t(`lab.tabs.${tab}`)}
        </button>
      `).join('')}
    </div>`;
  }

  // ─── Tab Content Dispatch ──────────────────────────────────

  async _renderTabContent(algo, tab) {
    this._tabContent.className = 'lab__tab-content';
    this._tabContent.innerHTML = `<div class="lab__loading">${this._i18n.t('lab.loading')}</div>`;

    try {
      switch (tab) {
        case 'docs': this._renderDocsTab(algo); break;
        case 'source': await this._renderSourceTab(algo); break;
        case 'validation': await this._renderValidationTab(algo); break;
        case 'tryit': await this._renderTryIt(algo); break;
        case 'history': this._renderHistoryTab(algo); break;
      }
    } catch (err) {
      this._tabContent.innerHTML = `<div class="lab__error">${err.message}</div>`;
    }
  }

  // ─── Documentation Tab ─────────────────────────────────────

  _renderDocsTab(algo) {
    this._tabContent.innerHTML = '';

    // Description
    if (algo.description?.long) {
      const desc = document.createElement('div');
      desc.className = 'lab__docs-section';
      desc.innerHTML = `<p class="lab__docs-description">${this._loc(algo.description.long)}</p>`;
      this._tabContent.append(desc);
    }

    // Formulas
    if (algo.documentation?.formulas?.length) {
      const section = document.createElement('div');
      section.className = 'lab__docs-section';
      section.innerHTML = `<h3>${this._i18n.t('lab.docs.formulas')}</h3>`;
      const formulaContainer = document.createElement('div');
      section.append(formulaContainer);
      this._tabContent.append(section);
      renderFormulas(algo.documentation.formulas, formulaContainer, (v) => this._loc(v));
    }

    // Assumptions
    if (algo.documentation?.assumptions?.length) {
      const section = document.createElement('div');
      section.className = 'lab__docs-section';
      section.innerHTML = `<h3>${this._i18n.t('lab.docs.assumptions')}</h3>
        <ul class="lab__docs-list">
          ${algo.documentation.assumptions.map(a => `<li>${this._loc(a)}</li>`).join('')}
        </ul>`;
      this._tabContent.append(section);
    }

    // Limitations
    if (algo.documentation?.limitations?.length) {
      const section = document.createElement('div');
      section.className = 'lab__docs-section';
      section.innerHTML = `<h3>${this._i18n.t('lab.docs.limitations')}</h3>
        <ul class="lab__docs-list">
          ${algo.documentation.limitations.map(l => `<li>${this._loc(l)}</li>`).join('')}
        </ul>`;
      this._tabContent.append(section);
    }

    // References
    if (algo.documentation?.references?.length) {
      const section = document.createElement('div');
      section.className = 'lab__docs-section';
      section.innerHTML = `<h3>${this._i18n.t('lab.docs.references')}</h3>`;
      for (const ref of algo.documentation.references) {
        const p = document.createElement('div');
        p.className = 'lab__docs-ref';
        p.innerHTML = ref.url
          ? `${ref.source} — <a href="${ref.url}" target="_blank">${ref.chapter || 'Link'}</a>`
          : `${ref.source}${ref.chapter ? `, ${ref.chapter}` : ''}`;
        section.append(p);
      }
      this._tabContent.append(section);
    }

    // Minitab equivalent
    if (algo.documentation?.minitab_equivalent) {
      const section = document.createElement('div');
      section.className = 'lab__docs-section';
      section.innerHTML = `<h3>Minitab</h3>
        <div class="lab__minitab-callout">${algo.documentation.minitab_equivalent}</div>`;
      this._tabContent.append(section);
    }
  }

  // ─── Source Code Tab ───────────────────────────────────────

  async _renderSourceTab(algo) {
    this._tabContent.innerHTML = '';
    const src = algo.source;
    if (!src) {
      this._tabContent.innerHTML = `<div class="lab__empty">${this._i18n.t('lab.noSource')}</div>`;
      return;
    }

    // Meta info
    const meta = document.createElement('div');
    meta.className = 'lab__source-meta';
    meta.innerHTML = `
      <span>${src.file_path}</span>
      <button class="btn btn--sm btn--ghost lab__source-copy" title="Copy code">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
      </button>
    `;
    this._tabContent.append(meta);

    // Code
    const codeContainer = document.createElement('div');
    codeContainer.className = 'lab__source-code';

    let codeText = src.code_snippet || null;
    if (!codeText && src.file_path) {
      try {
        const resp = await fetch('/' + src.file_path);
        codeText = resp.ok ? await resp.text() : null;
      } catch { /* ignore fetch errors */ }
    }
    codeText = codeText || `// Source: ${src.file_path}\n// Function: ${src.function_name}()`;
    await renderCode(codeText, 'javascript', codeContainer);
    this._tabContent.append(codeContainer);

    // Copy button
    meta.querySelector('.lab__source-copy').addEventListener('click', () => {
      navigator.clipboard.writeText(codeText).catch(() => {});
    });

    // Signature
    if (src.signature) {
      const sig = document.createElement('div');
      sig.className = 'lab__signature';

      // Parameters
      sig.innerHTML = `<h4>${this._i18n.t('lab.source.parameters')}</h4>`;
      const table = document.createElement('table');
      table.className = 'lab__sig-table';
      table.innerHTML = `<thead><tr>
        <th>Name</th><th>Type</th><th>${this._i18n.t('lab.source.required')}</th><th>${this._i18n.t('lab.source.description')}</th>
      </tr></thead><tbody>
        ${(src.signature.parameters || []).map(p => `<tr>
          <td><code>${p.name}</code></td>
          <td class="lab__sig-type">${p.type}</td>
          <td>${p.required ? '✓' : '—'}</td>
          <td>${this._loc(p.description)}</td>
        </tr>`).join('')}
      </tbody>`;
      sig.append(table);

      // Returns
      if (src.signature.returns) {
        const retDiv = document.createElement('div');
        retDiv.innerHTML = `<h4 style="margin-top:var(--spacing-md)">${this._i18n.t('lab.source.returns')}</h4>`;
        const retTable = document.createElement('table');
        retTable.className = 'lab__sig-table';
        retTable.innerHTML = `<thead><tr><th>${this._i18n.t('lab.source.field')}</th><th>Type</th><th>${this._i18n.t('lab.source.description')}</th></tr></thead><tbody>
          ${Object.entries(src.signature.returns.properties || {}).map(([k, v]) => `<tr>
            <td><code>${k}</code></td>
            <td class="lab__sig-type">${v.type}</td>
            <td>${this._loc(v.description)}</td>
          </tr>`).join('')}
        </tbody>`;
        retDiv.append(retTable);
        sig.append(retDiv);
      }

      this._tabContent.append(sig);
    }
  }

  // ─── Validation Tab ────────────────────────────────────────

  async _renderValidationTab(algo) {
    this._tabContent.innerHTML = '';
    const fixtures = await this._registry.getFixtures(algo.id);

    if (!fixtures) {
      this._tabContent.innerHTML = `<div class="lab__empty">${this._i18n.t('lab.noFixtures')}</div>`;
      return;
    }

    // Header
    const header = document.createElement('div');
    header.className = 'lab__validation-header';
    const total = fixtures.test_cases.length;
    header.innerHTML = `
      <span class="lab__validation-summary lab__test-pending">${total} ${this._i18n.t('lab.validation.pending')}</span>
      <span class="lab__validation-meta">${this._formatGenInfo(fixtures)}</span>
      <button class="lab__run-all-btn">${this._i18n.t('lab.validation.runAll')}</button>
    `;
    this._tabContent.append(header);

    // Group by tier
    const tiers = ['standard', 'edge', 'stress', 'robustness'];
    for (const tier of tiers) {
      const cases = fixtures.test_cases.filter(tc => tc.tier === tier);
      if (cases.length === 0) continue;

      const section = document.createElement('div');
      section.className = 'lab__tier-section';
      section.innerHTML = `
        <div class="lab__tier-title">
          ${tier.charAt(0).toUpperCase() + tier.slice(1)}
          <span class="lab__tier-count" data-tier="${tier}">0/${cases.length}</span>
        </div>
      `;

      const table = document.createElement('table');
      table.className = 'lab__test-table';
      table.innerHTML = `<thead><tr>
        <th>Test</th><th>Status</th><th>${this._i18n.t('lab.validation.details')}</th><th>${this._i18n.t('lab.validation.duration')}</th>
      </tr></thead>`;
      const tbody = document.createElement('tbody');

      for (const tc of cases) {
        const row = document.createElement('tr');
        row.dataset.testId = tc.id;
        row.innerHTML = `
          <td title="${tc.description}">${tc.id}</td>
          <td class="lab__test-pending">—</td>
          <td></td>
          <td></td>
        `;
        tbody.append(row);
      }

      table.append(tbody);
      section.append(table);
      this._tabContent.append(section);
    }

    // Run all button
    const runBtn = header.querySelector('.lab__run-all-btn');
    runBtn.addEventListener('click', () => this._runAllTests(algo, fixtures));
  }

  async _runAllTests(algo, fixtures) {
    const runBtn = this._tabContent.querySelector('.lab__run-all-btn');
    if (runBtn) {
      runBtn.disabled = true;
      runBtn.textContent = '...';
    }

    // Get the calculation function from the engine module
    let fn;
    try {
      fn = await this._buildFunction(algo);
    } catch (err) {
      const summary = this._tabContent.querySelector('.lab__validation-summary');
      if (summary) {
        summary.className = 'lab__validation-summary lab__test-fail';
        summary.textContent = `Error: ${err.message}`;
      }
      if (runBtn) runBtn.disabled = false;
      return;
    }

    let passCount = 0;
    let failCount = 0;
    const tierCounts = {};

    for (const tc of fixtures.test_cases) {
      const row = this._tabContent.querySelector(`tr[data-test-id="${tc.id}"]`);
      if (!row) continue;

      const cells = row.querySelectorAll('td');
      const start = performance.now();
      let result = null;
      let error = null;

      try {
        const inputs = this._prepareInputs(tc.inputs);
        const args = this._mapArgs(algo, inputs);
        result = fn(...args);
      } catch (e) {
        error = { type: e.constructor.name, message: e.message };
      }

      const duration = performance.now() - start;
      const tol = tc.tolerance_override
        ? fixtures.tolerances.overrides[tc.tolerance_override]
        : fixtures.tolerances.default;

      let pass = false;
      let details = '';

      if (tc.expected_error) {
        pass = !!(error &&
          error.type === tc.expected_error.type &&
          error.message.includes(tc.expected_error.message_contains));
        details = pass
          ? `${error.type}: ${error.message}`
          : error ? `Got ${error.type}: ${error.message}` : 'No error thrown';
      } else if (tc.expected && !error) {
        const checks = [];
        if (Array.isArray(tc.expected)) {
          // Array of objects — compare element-by-element, field-by-field
          const arr = Array.isArray(result) ? result : [];
          for (let i = 0; i < tc.expected.length; i++) {
            const expItem = tc.expected[i];
            const actItem = arr[i];
            for (const [field, expVal] of Object.entries(expItem)) {
              const actVal = actItem != null ? actItem[field] : undefined;
              const ok = this._compare(actVal, expVal, tol);
              checks.push(ok);
              if (!ok) {
                details += `${i}.${field}: ${JSON.stringify(actVal)} ≠ ${JSON.stringify(expVal)} `;
              }
            }
          }
        } else {
          for (const [key, expected] of Object.entries(tc.expected)) {
            const actual = this._getByPath(result, key);
            const ok = this._compare(actual, expected, tol);
            checks.push(ok);
            if (!ok) {
              details += `${key}: ${actual} ≠ ${expected} `;
            }
          }
        }
        pass = checks.every(Boolean);
        if (pass) details = 'All values match';
      } else if (error) {
        details = `Unexpected error: ${error.message}`;
      }

      if (pass) passCount++; else failCount++;

      // Track per-tier
      if (!tierCounts[tc.tier]) tierCounts[tc.tier] = { pass: 0, total: 0 };
      tierCounts[tc.tier].total++;
      if (pass) tierCounts[tc.tier].pass++;

      cells[1].className = pass ? 'lab__test-pass' : 'lab__test-fail';
      cells[1].textContent = pass ? '✓' : '✗';
      cells[2].textContent = details;
      cells[2].className = 'lab__test-diff';
      cells[3].textContent = `${duration.toFixed(2)} ms`;
      cells[3].className = 'lab__test-duration';
    }

    // Update summary
    const summary = this._tabContent.querySelector('.lab__validation-summary');
    if (summary) {
      const total = passCount + failCount;
      summary.className = failCount === 0
        ? 'lab__validation-summary lab__test-pass'
        : 'lab__validation-summary lab__test-fail';
      summary.textContent = `${passCount}/${total} ${this._i18n.t('lab.validation.passed')}`;
    }

    // Update tier counts
    for (const [tier, counts] of Object.entries(tierCounts)) {
      const el = this._tabContent.querySelector(`.lab__tier-count[data-tier="${tier}"]`);
      if (el) el.textContent = `${counts.pass}/${counts.total}`;
    }

    if (runBtn) {
      runBtn.disabled = false;
      runBtn.textContent = this._i18n.t('lab.validation.runAll');
    }
  }

  /**
   * Load the algorithm's calculation function.
   * - If code_snippet is null: dynamic import of the actual engine module (preferred)
   * - If code_snippet is set: legacy sandbox mode via new Function()
   */
  async _buildFunction(algo) {
    const src = algo.source;
    if (!src) throw new Error('No source definition');

    // Legacy path: code_snippet is explicitly set → use sandbox
    if (src.code_snippet) {
      const wrapper = new Function(`${src.code_snippet}\nreturn ${src.function_name};`);
      return wrapper();
    }

    // Primary path: dynamic import of the actual engine module.
    // file_path is repo-relative (e.g. "js/engines/math-utils.js"). Resolve it
    // against document.baseURI so the import works regardless of where the app
    // is deployed (`/`, `/app/dev/`, `/app/v0.4.0/`, …).
    if (src.file_path && src.function_name) {
      const modulePath = new URL(src.file_path, document.baseURI).href;
      const mod = await import(modulePath);
      const fn = mod[src.function_name];
      if (typeof fn !== 'function') {
        throw new Error(`Export "${src.function_name}" not found in ${src.file_path}`);
      }
      return fn;
    }

    throw new Error('No source file_path or code_snippet available');
  }

  _prepareInputs(inputs) {
    // Clone and ensure data is a proper array of numbers
    const prepared = { ...inputs };
    if (Array.isArray(prepared.data)) {
      prepared.data = prepared.data.map(Number);
    }
    return prepared;
  }

  /**
   * Map inputs to function arguments in the order defined by signature.parameters.
   * Falls back to legacy (data, lsl, usl) if no signature is defined.
   *
   * Special case: if the signature has exactly one parameter and its name is
   * not a top-level key in `inputs`, pass the whole `inputs` object as that
   * single argument. This lets flat fixture shapes (e.g. {function, x, mu})
   * be forwarded directly to single-object dispatchers like math-utils
   * `evaluate(inputs)` without any fixture rewriting.
   */
  _mapArgs(algo, inputs) {
    const params = algo.source?.signature?.parameters;
    if (params && params.length > 0) {
      if (params.length === 1 && !(params[0].name in (inputs || {}))) {
        return [inputs];
      }
      return params.map(p => inputs[p.name]);
    }
    // Legacy fallback for algorithms without signature metadata
    return [inputs.data, inputs.lsl, inputs.usl];
  }

  /**
   * Resolve a dot-separated path on an object (e.g. "varComp.grr.pctStudyVar").
   */
  _getByPath(obj, path) {
    // Primitive (non-object), undefined, or null result: synthetic `value` key
    // returns the result itself, so fixtures for number- or null-returning
    // functions can write `expected: { value: 0.5 }` or `expected: { value: null }`.
    // Without the type guard, `path in primitive` would throw.
    if (obj == null || typeof obj !== 'object') {
      return path === 'value' ? obj : undefined;
    }
    // Fast path: direct key exists (no traversal needed)
    if (path in obj) return obj[path];
    const parts = path.split('.');
    let cur = obj;
    for (const p of parts) {
      if (cur == null) return undefined;
      cur = cur[p];
    }
    return cur;
  }

  _compare(actual, expected, tol) {
    // Sentinel-string handling for special numeric values. We only apply the
    // sentinel interpretation when `actual` is itself a number — otherwise both
    // sides may legitimately be the literal string "NaN"/"Infinity" (engines
    // sometimes use these as their own serialization sentinels) and we should
    // fall through to plain string equality.
    if (expected === 'Infinity' && typeof actual === 'number') return actual === Infinity;
    if (expected === '-Infinity' && typeof actual === 'number') return actual === -Infinity;
    if (expected === 'NaN' && typeof actual === 'number') return Number.isNaN(actual);
    // JSON round-trips undefined → null, so treat them as interchangeable in
    // expected/actual comparisons. Without this, snapshot fixtures recorded with
    // `null` at array slots that the engine actually returns as `undefined` fail.
    if (expected === null) return actual === null || actual === undefined;
    // Arrays: element-by-element recursive comparison
    if (Array.isArray(expected)) {
      if (!Array.isArray(actual) || actual.length !== expected.length) return false;
      return expected.every((exp, i) => this._compare(actual[i], exp, tol));
    }
    // Plain objects: key-by-key recursive comparison
    if (expected != null && typeof expected === 'object') {
      if (actual == null || typeof actual !== 'object') return false;
      return Object.entries(expected).every(([k, v]) => this._compare(actual[k], v, tol));
    }
    // Non-numeric types: exact equality (strings, booleans, integers)
    if (typeof expected !== 'number') return actual === expected;
    if (typeof actual !== 'number') return false;
    if (!isFinite(actual) && !isFinite(expected)) return true;

    const absDiff = Math.abs(actual - expected);
    const relDiff = expected !== 0 ? absDiff / Math.abs(expected) : absDiff;
    return absDiff <= tol.absolute || relDiff <= tol.relative;
  }

  _formatGenInfo(fixtures) {
    const g = fixtures.generated_with;
    if (!g) return '';
    if (g.method) return g.method;
    return `Python ${g.python} / SciPy ${g.scipy}`;
  }

  // ─── History Tab ───────────────────────────────────────────

  _renderHistoryTab(algo) {
    this._tabContent.innerHTML = '';
    if (!algo.changelog?.length) {
      this._tabContent.innerHTML = `<div class="lab__empty">${this._i18n.t('lab.noHistory')}</div>`;
      return;
    }
    const container = document.createElement('div');
    renderTimeline(algo.changelog, container, (v) => this._loc(v));
    this._tabContent.append(container);
  }

  // ─── Try-It Panel ──────────────────────────────────────────

  async _renderTryIt(algo) {
    if (!this._tryIt) {
      this._tryIt = new LabTryIt(this._tabContent, {
        i18n: this._i18n,
        registry: this._registry,
        buildFunction: (a) => this._buildFunction(a),  // returns Promise
        compare: (actual, expected, tol) => this._compare(actual, expected, tol),
        loc: (v) => this._loc(v),
      });
    }
    await this._tryIt.render(algo);
  }
}
