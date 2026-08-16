import { renderBlockMath, renderInlineMath } from '../core/katex-loader.js';
import { h } from '../core/dom.js';
import { parseInline } from '../core/markdown-parser.js';

/**
 * DMAIC.io — Help Panel (help-panel.js)
 * Right-side panel for module handbooks, example data, and glossary terms.
 *
 * Three tabs:
 *   - "Hilfe"        — lazy-loaded module help (existing behaviour)
 *   - "Beispieldaten" — list of catalog examples matching the active module
 *   - "Glossar"      — terms whose `modules` field matches the active module
 *
 * Backwards-compat: the original `show(title, html)` API still works
 * (it shows the Help tab, hides the other tabs).
 */

export class HelpPanel {
  /**
   * @param {HTMLElement} container
   * @param {import('../core/i18n.js').I18n} i18n
   */
  constructor(container, i18n) {
    this._container = container;
    this._i18n = i18n;
    /** @type {'help'|'examples'|'glossary'} */
    this._activeTab = 'help';
    this._hasHelp = false;
    this._hasExamples = false;
    this._hasGlossary = false;
    /** @type {?(exampleId: string) => void} */
    this._onLoadExample = null;
    /** @type {?(scenarioId: string) => void} */
    this._onLoadScenario = null;
    /** @type {?(termId: string) => Promise<object|null>} */
    this._glossaryGet = null;
    /** Permanent fallback loader (set once at bootstrap) so inline
     *  `[data-glossary-term]` clicks work before any module help has been opened. */
    this._glossaryGetFallback = null;
    /** Synchronous title resolver: `(id, lang) => string`. Used to render
     *  seeAlso labels and `{{term:id}}` cross-refs with the real title
     *  instead of the kebab-case id. */
    this._glossaryTitleResolver = null;
    /** Lightweight list passed in via showWithTabs() — module-specific terms. */
    this._glossaryItems = [];
    /** Full-catalog provider `() => term[]` for non-module search results. */
    this._glossaryCatalog = null;
    /** Currently open detail term (null = list view). */
    this._glossaryOpenId = null;
    /** Search query inside the glossary tab. */
    this._glossaryQuery = '';
  }

  render() {
    const t = (k) => this._i18n.t(k);

    this._container.className = 'help-panel help-panel--hidden';
    this._container.replaceChildren(
      h('div', { class: 'help-panel__header' },
        h('span', { class: 'help-panel__title' }, t('moduleHelp.title')),
        h('button', {
          class: 'btn btn--icon btn--ghost',
          id: 'help-close-btn',
          'aria-label': t('common.close'),
        }, '✕'),
      ),
      h('div', { class: 'help-panel__tabs', role: 'tablist' },
        h('button', {
          class: 'help-panel__tab help-panel__tab--active',
          'data-tab': 'help', role: 'tab', 'aria-selected': 'true',
        }, t('moduleHelp.tabHelp')),
        h('button', {
          class: 'help-panel__tab',
          'data-tab': 'examples', role: 'tab', 'aria-selected': 'false',
        }, t('moduleHelp.tabExamples')),
        h('button', {
          class: 'help-panel__tab',
          'data-tab': 'glossary', role: 'tab', 'aria-selected': 'false',
        }, t('moduleHelp.tabGlossary')),
      ),
      h('div', { class: 'help-panel__body' },
        h('div', { class: 'help-panel__content', 'data-pane': 'help', role: 'tabpanel' }),
        h('div', { class: 'help-panel__examples', 'data-pane': 'examples', role: 'tabpanel', hidden: true }),
        h('div', { class: 'help-panel__glossary', 'data-pane': 'glossary', role: 'tabpanel', hidden: true }),
      ),
    );

    this._content       = this._container.querySelector('[data-pane="help"]');
    this._examplesPane  = this._container.querySelector('[data-pane="examples"]');
    this._glossaryPane  = this._container.querySelector('[data-pane="glossary"]');
    this._titleEl       = this._container.querySelector('.help-panel__title');

    this._container.querySelector('#help-close-btn').addEventListener('click', () => this.hide());

    this._container.querySelectorAll('.help-panel__tab').forEach(btn => {
      btn.addEventListener('click', () => this._setActiveTab(btn.dataset.tab));
    });

    this._examplesPane.addEventListener('click', (e) => {
      const scenarioId = e.target.closest('[data-scenario-id]')?.dataset.scenarioId;
      if (scenarioId && this._onLoadScenario) { this._onLoadScenario(scenarioId); return; }
      const btn = e.target.closest('[data-example-id]');
      if (!btn) return;
      const id = btn.dataset.exampleId;
      if (this._onLoadExample) this._onLoadExample(id);
    });

    this._glossaryPane.addEventListener('click', (e) => {
      const back = e.target.closest('[data-glossary-back]');
      if (back) { this._glossaryOpenId = null; this._renderGlossary(); return; }
      const seeAlso = e.target.closest('[data-glossary-seealso]');
      if (seeAlso) { this._openGlossaryDetail(seeAlso.dataset.glossarySeealso); return; }
      const item = e.target.closest('[data-glossary-id]');
      if (!item) return;
      this._openGlossaryDetail(item.dataset.glossaryId);
    });

    this._glossaryPane.addEventListener('input', (e) => {
      const input = e.target.closest('[data-glossary-search]');
      if (!input) return;
      this._glossaryQuery = input.value;
      this._renderGlossaryList();
    });
  }

  /**
   * Backwards-compatible single-tab show: fills the Help tab and hides the others.
   * @param {string} title
   * @param {Node} helpNode
   */
  show(title, helpNode) {
    this._titleEl.textContent = title;
    this._content.replaceChildren(helpNode || document.createDocumentFragment());
    this._hasHelp = true;
    this._hasExamples = false;
    this._hasGlossary = false;
    this._updateTabVisibility();
    this._setActiveTab('help');
    this._container.classList.remove('help-panel--hidden');
  }

  /**
   * Tab-aware show. Configure panes; tabs whose content is empty/absent
   * are hidden. `preferredTab` selects the initial tab if multiple are
   * available.
   *
   * @param {string} title
   * @param {object} opts
   * @param {?Node} opts.helpNode        Node for the Help tab (null → hidden)
   * @param {object[]=} opts.examples    Catalog entries to render in the Examples tab
   * @param {(exampleId: string) => void=} opts.onLoadExample
   * @param {object[]=} opts.scenarios   Scenarios applicable to the listed examples,
   *                                     rendered as a block below the example list.
   * @param {(scenarioId: string) => void=} opts.onLoadScenario
   * @param {object[]=} opts.glossary    Lightweight term entries for the Glossary tab
   * @param {(termId: string) => Promise<object|null>=} opts.glossaryGet  Lazy loader for full term
   * @param {'help'|'examples'|'glossary'=} opts.preferredTab
   */
  showWithTabs(title, {
    helpNode, examples, onLoadExample, scenarios, onLoadScenario, glossary, glossaryGet, preferredTab,
  } = {}) {
    this._titleEl.textContent = title;

    this._hasHelp = Boolean(helpNode);
    if (this._hasHelp) this._content.replaceChildren(helpNode);
    else this._content.replaceChildren();

    this._hasExamples = Array.isArray(examples) && examples.length > 0;
    this._onLoadExample = onLoadExample || null;
    this._onLoadScenario = onLoadScenario || null;
    if (this._hasExamples) {
      this._renderExamplesList(examples);
      if (Array.isArray(scenarios) && scenarios.length > 0) {
        this._examplesPane.appendChild(this._buildScenarioBlock(scenarios));
      }
    } else {
      this._examplesPane.replaceChildren();
    }

    this._glossaryItems = Array.isArray(glossary) ? glossary : [];
    this._glossaryGet = glossaryGet || null;
    // Glossary is always available when wired (glossaryGet given): the tab
    // shows the module's terms and searching surfaces the full catalog. This
    // keeps the sidebar's content stable so the header icon never has to hide.
    this._hasGlossary = Boolean(this._glossaryGet) || this._glossaryItems.length > 0;
    // Reset detail view + search when the underlying list changes.
    this._glossaryOpenId = null;
    this._glossaryQuery = '';
    if (this._hasGlossary) this._renderGlossary();
    else this._glossaryPane.replaceChildren();

    this._updateTabVisibility();

    // Tab selection priority:
    //   1. Panel currently visible AND current tab still has content → keep it
    //   2. preferredTab if it has content
    //   3. First tab that has content (help → examples → glossary)
    let target;
    if (this.isVisible() && this._tabHasContent(this._activeTab)) {
      target = this._activeTab;
    } else if (preferredTab && this._tabHasContent(preferredTab)) {
      target = preferredTab;
    } else if (this._hasHelp) {
      target = 'help';
    } else if (this._hasExamples) {
      target = 'examples';
    } else {
      target = 'glossary';
    }
    this._setActiveTab(target);

    this._container.classList.remove('help-panel--hidden');
  }

  hide() {
    this._container.classList.add('help-panel--hidden');
  }

  isVisible() {
    return !this._container.classList.contains('help-panel--hidden');
  }

  /** Currently active tab. @returns {'help'|'examples'|'glossary'} */
  getActiveTab() {
    return this._activeTab;
  }

  /**
   * Open a glossary term directly in the detail view. Used by inline
   * `[data-glossary-term]` clicks anywhere in the app (stats-panel column
   * headers, module-help cross-refs, …). Force-enables the Glossar tab
   * even if the active module has no matching entries — the user clicked
   * a specific term and expects to see it.
   *
   * Requires that `_glossaryGet` was set by a prior `showWithTabs(...)`
   * call (true whenever the help button has ever been clicked in this
   * session); otherwise this is a no-op.
   *
   * @param {string} termId
   */
  /**
   * Open the full glossary catalog (modul-unabhängig). Used by the
   * header glossary button + `Strg+G` shortcut. Force-enables the Glossar
   * tab even if no module is active, replaces the modul-gefilterte Liste
   * with the full catalog, and opens the list view (not a specific term).
   *
   * @param {Array<{id:string,title?:object,short?:object,category?:string}>} items
   * @param {string} [title] — optional panel header title; defaults to the
   *                          localized "Glossar" string.
   */
  openGlossaryCatalog(items, title) {
    const t = (k) => this._i18n.t(k);
    this._titleEl.textContent = title || t('moduleHelp.tabGlossary') || 'Glossar';
    this._glossaryItems = Array.isArray(items) ? items : [];
    this._hasGlossary = this._glossaryItems.length > 0;
    // Adopt the bootstrap fallback loader so list-item clicks resolve the
    // selected term's detail view (same path as inline `data-glossary-term` clicks).
    if (!this._glossaryGet && this._glossaryGetFallback) {
      this._glossaryGet = this._glossaryGetFallback;
    }
    // Header invocation is glossary-only — hide the other tabs for clarity.
    this._hasHelp = false;
    this._hasExamples = false;
    this._content.replaceChildren();
    this._examplesPane.replaceChildren();
    this._glossaryOpenId = null;
    this._glossaryQuery = '';
    this._updateTabVisibility();
    if (!this._hasGlossary) return;
    this._renderGlossary();
    this._setActiveTab('glossary');
    this._container.classList.remove('help-panel--hidden');
  }

  openGlossaryTerm(termId) {
    if (!termId) return;
    const loader = this._glossaryGet || this._glossaryGetFallback;
    if (!loader) return;
    // Adopt the fallback as the active loader so the detail renderer can call it.
    if (!this._glossaryGet) this._glossaryGet = loader;
    this._hasGlossary = true;
    this._glossaryOpenId = termId;
    this._updateTabVisibility();
    this._setActiveTab('glossary');
    this._renderGlossaryDetail();
    this._container.classList.remove('help-panel--hidden');
  }

  /**
   * Set a permanent fallback loader for the glossary. Used by inline
   * `[data-glossary-term]` clicks fired before any module-help open
   * has happened.
   * @param {(termId: string) => Promise<object|null>} fn
   */
  setGlossaryLoader(fn) {
    this._glossaryGetFallback = typeof fn === 'function' ? fn : null;
  }

  /**
   * Set the synchronous title resolver used by inline glossary refs in
   * the detail view (seeAlso list + `{{term:id}}` cross-refs).
   * @param {(id: string, lang: string) => string} fn
   */
  setGlossaryTitleResolver(fn) {
    this._glossaryTitleResolver = typeof fn === 'function' ? fn : null;
  }

  /**
   * Set the full-catalog provider used to surface non-module-specific terms
   * when searching the glossary tab. `() => term[]` (e.g. registry.getAllCached).
   * @param {() => Array} fn
   */
  setGlossaryCatalog(fn) {
    this._glossaryCatalog = typeof fn === 'function' ? fn : null;
  }

  // ─── Internal ─────────────────────────────────────────────

  _setActiveTab(tab) {
    if (tab !== 'help' && tab !== 'examples' && tab !== 'glossary') return;
    if (!this._tabHasContent(tab)) return;
    this._activeTab = tab;

    this._container.querySelectorAll('.help-panel__tab').forEach(b => {
      const active = b.dataset.tab === tab;
      b.classList.toggle('help-panel__tab--active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    this._content.hidden       = tab !== 'help';
    this._examplesPane.hidden  = tab !== 'examples';
    this._glossaryPane.hidden  = tab !== 'glossary';

    // Mirror the active tab on the container so external observers (header
    // icon-menu mutual exclusivity) can sync without listening to every
    // internal class change.
    this._container.setAttribute('data-active-tab', tab);
  }

  _tabHasContent(tab) {
    if (tab === 'help')     return this._hasHelp;
    if (tab === 'examples') return this._hasExamples;
    if (tab === 'glossary') return this._hasGlossary;
    return false;
  }

  _updateTabVisibility() {
    const tabs = this._container.querySelector('.help-panel__tabs');
    const visibleCount = [this._hasHelp, this._hasExamples, this._hasGlossary].filter(Boolean).length;
    // Tab bar only makes sense when at least two tabs are visible.
    tabs.style.display = visibleCount >= 2 ? '' : 'none';

    // Per-tab show/hide so a single-tab visible state stays consistent.
    const setTab = (name, on) => {
      const btn = tabs.querySelector(`.help-panel__tab[data-tab="${name}"]`);
      if (btn) btn.style.display = on ? '' : 'none';
    };
    setTab('help',     this._hasHelp);
    setTab('examples', this._hasExamples);
    setTab('glossary', this._hasGlossary);
  }

  _renderExamplesList(examples) {
    const lang = this._i18n.getLanguage();
    const t = (k) => this._i18n.t(k);

    const items = examples.map(ex => {
      const title = ex.title?.[lang] || ex.title?.en || ex.id;
      const desc  = ex.description?.[lang] || ex.description?.en || '';
      return h('div', { class: 'help-panel__example' },
        h('div', { class: 'help-panel__example-head' },
          h('span', { class: 'help-panel__example-title' }, title),
        ),
        desc ? h('p', { class: 'help-panel__example-desc' }, desc) : null,
        ex.source
          ? h('div', { class: 'help-panel__example-meta' }, `${t('moduleHelp.source')}: ${ex.source}`)
          : null,
        h('button', {
          class: 'btn btn--sm btn--primary help-panel__example-load',
          'data-example-id': ex.id,
        }, t('moduleHelp.loadButton')),
      );
    });
    this._examplesPane.replaceChildren(...items);
  }

  /**
   * Render the "Szenarien" block below the example list. One row per scenario
   * variant applicable to the active module's examples; the click handler is
   * delegated through _onLoadScenario.
   * @param {object[]} scenarios
   * @returns {HTMLElement}
   */
  _buildScenarioBlock(scenarios) {
    const rows = scenarios.map(s => h('div', { class: 'help-panel__scenario' },
      h('div', { class: 'help-panel__scenario-title' }, s.title),
      s.description ? h('p', { class: 'help-panel__scenario-desc' }, s.description) : null,
      h('button', {
        class: 'btn btn--sm help-panel__scenario-load', type: 'button', 'data-scenario-id': s.id,
      }, this._i18n.t('scenarios.loadWhole')),
    ));
    return h('div', { class: 'help-panel__scenarios' },
      h('div', { class: 'help-panel__scenarios-title' }, this._i18n.t('scenarios.sectionTitle')),
      ...rows);
  }

  // ─── Glossary tab rendering ──────────────────────────────

  _renderGlossary() {
    if (this._glossaryOpenId) this._renderGlossaryDetail();
    else this._renderGlossaryList();
  }

  _renderGlossaryList() {
    const lang = this._i18n.getLanguage();
    const t = (k) => this._i18n.t(k);

    const q = this._glossaryQuery.trim().toLowerCase();
    const matches = (item) => {
      if (!q) return true;
      const hay = [item.title?.[lang], item.title?.de, item.title?.en,
                   item.short?.[lang], item.short?.de, item.short?.en]
                   .filter(Boolean).join('  ').toLowerCase();
      return hay.includes(q);
    };
    const renderItem = (item) => {
      const title = item.title?.[lang] || item.title?.en || item.id;
      const short = item.short?.[lang] || item.short?.en || '';
      return h('button', {
        type: 'button',
        class: 'help-panel__glossary-item',
        'data-glossary-id': item.id,
      },
        h('span', { class: 'help-panel__glossary-item-title' }, title),
        short ? h('span', { class: 'help-panel__glossary-item-short' }, short) : null,
      );
    };

    // Module-specific terms first.
    const moduleMatches = this._glossaryItems.filter(matches);
    // On search, surface non-module-specific terms from the full catalog after
    // a separator. Without a query only the module's own terms are listed.
    let otherMatches = [];
    if (q && typeof this._glossaryCatalog === 'function') {
      const moduleIds = new Set(this._glossaryItems.map(i => i.id));
      otherMatches = (this._glossaryCatalog() || []).filter(c => !moduleIds.has(c.id) && matches(c));
    }

    const items = moduleMatches.map(renderItem);
    if (otherMatches.length > 0) {
      // Only show the separator when there are module-specific matches above it.
      if (moduleMatches.length > 0) {
        items.push(h('div', { class: 'help-panel__glossary-separator' }, t('moduleHelp.glossaryOtherTerms')));
      }
      items.push(...otherMatches.map(renderItem));
    }
    if (items.length === 0) {
      items.push(h('p', { class: 'help-panel__glossary-empty' },
        t(q ? 'moduleHelp.glossaryNoMatch' : 'moduleHelp.glossarySearchHint')));
    }

    const placeholder = t('moduleHelp.glossarySearchPlaceholder');
    this._glossaryPane.replaceChildren(
      h('div', { class: 'help-panel__glossary-search' },
        h('input', {
          type: 'search',
          'data-glossary-search': true,
          class: 'input input--sm',
          placeholder,
          value: this._glossaryQuery,
          'aria-label': placeholder,
        }),
      ),
      h('div', { class: 'help-panel__glossary-list' }, ...items),
    );

    // Restore focus to search after re-render so live typing keeps caret.
    const input = this._glossaryPane.querySelector('[data-glossary-search]');
    if (input && this._glossaryQuery) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  async _renderGlossaryDetail() {
    const t = (k) => this._i18n.t(k);

    const backBtn = () => h('button', {
      type: 'button', class: 'help-panel__glossary-back', 'data-glossary-back': true,
    }, `← ${t('moduleHelp.glossaryBack')}`);

    // Show loading state immediately.
    this._glossaryPane.replaceChildren(
      h('div', { class: 'help-panel__glossary-detail' },
        backBtn(),
        h('p', { class: 'help-panel__glossary-loading' }, t('moduleHelp.loading')),
      ),
    );

    const term = this._glossaryGet ? await this._glossaryGet(this._glossaryOpenId) : null;

    // If the user navigated away while loading, drop the result.
    if (this._glossaryOpenId !== (term?.id ?? this._glossaryOpenId)) return;

    if (!term) {
      this._glossaryPane.replaceChildren(
        h('div', { class: 'help-panel__glossary-detail' },
          backBtn(),
          h('p', { class: 'help-panel__glossary-error' }, t('moduleHelp.glossaryLoadError')),
        ),
      );
      return;
    }

    const lang = this._i18n.getLanguage();
    const titleOf = this._glossaryTitleResolver
      ? (id) => this._glossaryTitleResolver(id, lang)
      : (id) => id;
    // Glossary detail body is freeform, app-authored rich content (inline
    // markdown, formulas, cross-refs) — built as DOM nodes via parseInline.
    this._glossaryPane.replaceChildren(renderGlossaryDetail(term, lang, t, titleOf));

    // KaTeX render for block formulas (`formula` blocks) and inline `$…$`
    // patterns that were marked up during text rendering.
    renderBlockMath(this._glossaryPane);
    renderInlineMath(this._glossaryPane);
  }

  _openGlossaryDetail(termId) {
    if (!termId) return;
    this._glossaryOpenId = termId;
    this._renderGlossaryDetail();
  }
}

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Build the glossary term-ref node for inline parsing inside glossary text.
 * `{{term:id|label}}` keeps its explicit label; `{{term:id}}` resolves the
 * label via the title resolver. Differs from the handbook term-ref (which
 * emits a `span.glossary-term`).
 * @param {(id:string) => string} titleOf
 * @returns {(id:string, label:string|null) => Node}
 */
function glossaryTermRef(titleOf) {
  return (id, label) => h('a', {
    href: '#',
    class: 'help-panel__glossary-xref',
    'data-glossary-seealso': id,
  }, label != null ? label : titleOf(id));
}

/** Inline-parse glossary text into DOM nodes with glossary cross-refs. */
function glossaryInline(text, titleOf) {
  return parseInline(text || '', { termRef: glossaryTermRef(titleOf) });
}

/**
 * Render the glossary detail view for a term as a DOM node.
 * @param {object} term
 * @param {string} lang
 * @param {(k:string) => string} t
 * @param {(id:string) => string} [titleOf]
 * @returns {HTMLElement} `.help-panel__glossary-detail`
 */
function renderGlossaryDetail(term, lang, t, titleOf = (id) => id) {
  const title = term.title?.[lang] || term.title?.en || term.id;
  const blocks = term.definition?.[lang] || term.definition?.en || [];
  const aliases = term.aliases?.[lang] || term.aliases?.en || [];

  const aliasesNode = aliases.length
    ? h('p', { class: 'help-panel__glossary-aliases' },
        h('em', null, `${t('moduleHelp.glossaryAliases')}:`), ' ', aliases.join(', '))
    : null;

  const seeAlsoNode = Array.isArray(term.seeAlso) && term.seeAlso.length
    ? h('div', { class: 'help-panel__glossary-seealso' },
        h('h4', null, t('moduleHelp.glossarySeeAlso')),
        h('ul', null, ...term.seeAlso.map(id =>
          h('li', null, h('a', { href: '#', 'data-glossary-seealso': id }, titleOf(id))))),
      )
    : null;

  const modulesNode = Array.isArray(term.modules) && term.modules.length
    ? h('div', { class: 'help-panel__glossary-modules' },
        h('h4', null, t('moduleHelp.glossaryUsedIn')),
        h('p', null, term.modules.join(', ')),
      )
    : null;

  const sourcesNode = Array.isArray(term.sources) && term.sources.length
    ? h('div', { class: 'help-panel__glossary-sources' },
        h('h4', null, t('moduleHelp.glossarySources')),
        h('ul', null, ...term.sources.map(s => {
          const label = s.label || '';
          return h('li', null, s.url
            ? h('a', { href: s.url, target: '_blank', rel: 'noopener' }, label)
            : label);
        })),
      )
    : null;

  return h('div', { class: 'help-panel__glossary-detail' },
    h('button', { type: 'button', class: 'help-panel__glossary-back', 'data-glossary-back': true },
      `← ${t('moduleHelp.glossaryBack')}`),
    h('h3', { class: 'help-panel__glossary-title' }, title),
    aliasesNode,
    h('div', { class: 'help-panel__glossary-body' }, ...blocks.map(b => renderGlossaryBlock(b, titleOf))),
    seeAlsoNode,
    modulesNode,
    sourcesNode,
  );
}

/**
 * Render a single glossary definition block to a DOM node (or null if empty).
 * @param {object} block
 * @param {(id:string) => string} [titleOf]
 * @returns {Node|null}
 */
function renderGlossaryBlock(block, titleOf = (id) => id) {
  if (!block || typeof block !== 'object') return null;
  switch (block.type) {
    case 'paragraph':
      return h('p', null, ...glossaryInline(block.text, titleOf));
    case 'note':
      return h('div', { class: 'help-panel__glossary-note' }, ...glossaryInline(block.text, titleOf));
    case 'list':
      return h('ul', null, ...(block.items || []).map(it =>
        h('li', null, ...glossaryInline(it, titleOf))));
    case 'formula':
      // Rendered via KaTeX post-insert; fallback shows the raw LaTeX as code.
      return h('div', { class: 'help-panel__glossary-formula', 'data-katex': block.latex || '' },
        h('code', null, block.latex || ''));
    default:
      return block.text ? h('p', null, ...glossaryInline(block.text, titleOf)) : null;
  }
}
