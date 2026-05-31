import { renderBlockMath, renderInlineMath, injectInlineMathMarkers } from '../core/katex-loader.js';

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
    /** @type {?(termId: string) => Promise<object|null>} */
    this._glossaryGet = null;
    /** Permanent fallback loader (set once at bootstrap) so inline
     *  `[data-glossary-term]` clicks work before any module help has been opened. */
    this._glossaryGetFallback = null;
    /** Synchronous title resolver: `(id, lang) => string`. Used to render
     *  seeAlso labels and `{{term:id}}` cross-refs with the real title
     *  instead of the kebab-case id. */
    this._glossaryTitleResolver = null;
    /** Lightweight list passed in via showWithTabs(). */
    this._glossaryItems = [];
    /** Currently open detail term (null = list view). */
    this._glossaryOpenId = null;
    /** Search query inside the glossary tab. */
    this._glossaryQuery = '';
  }

  render() {
    const t = (k) => this._i18n.t(k);

    this._container.className = 'help-panel help-panel--hidden';
    this._container.innerHTML = `
      <div class="help-panel__header">
        <span class="help-panel__title">${t('moduleHelp.title')}</span>
        <button class="btn btn--icon btn--ghost" id="help-close-btn" aria-label="${t('common.close')}">✕</button>
      </div>
      <div class="help-panel__tabs" role="tablist">
        <button class="help-panel__tab help-panel__tab--active" data-tab="help" role="tab" aria-selected="true">
          ${t('moduleHelp.tabHelp')}
        </button>
        <button class="help-panel__tab" data-tab="examples" role="tab" aria-selected="false">
          ${t('moduleHelp.tabExamples')}
        </button>
        <button class="help-panel__tab" data-tab="glossary" role="tab" aria-selected="false">
          ${t('moduleHelp.tabGlossary')}
        </button>
      </div>
      <div class="help-panel__body">
        <div class="help-panel__content"  data-pane="help"     role="tabpanel"></div>
        <div class="help-panel__examples" data-pane="examples" role="tabpanel" hidden></div>
        <div class="help-panel__glossary" data-pane="glossary" role="tabpanel" hidden></div>
      </div>
    `;

    this._content       = this._container.querySelector('[data-pane="help"]');
    this._examplesPane  = this._container.querySelector('[data-pane="examples"]');
    this._glossaryPane  = this._container.querySelector('[data-pane="glossary"]');
    this._titleEl       = this._container.querySelector('.help-panel__title');

    this._container.querySelector('#help-close-btn').addEventListener('click', () => this.hide());

    this._container.querySelectorAll('.help-panel__tab').forEach(btn => {
      btn.addEventListener('click', () => this._setActiveTab(btn.dataset.tab));
    });

    this._examplesPane.addEventListener('click', (e) => {
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
   * @param {string} html
   */
  show(title, html) {
    this._titleEl.textContent = title;
    this._content.innerHTML = html;
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
   * @param {?string} opts.helpHtml      HTML for the Help tab (null/empty → hidden)
   * @param {object[]=} opts.examples    Catalog entries to render in the Examples tab
   * @param {(exampleId: string) => void=} opts.onLoadExample
   * @param {object[]=} opts.glossary    Lightweight term entries for the Glossary tab
   * @param {(termId: string) => Promise<object|null>=} opts.glossaryGet  Lazy loader for full term
   * @param {'help'|'examples'|'glossary'=} opts.preferredTab
   */
  showWithTabs(title, { helpHtml, examples, onLoadExample, glossary, glossaryGet, preferredTab } = {}) {
    this._titleEl.textContent = title;

    this._hasHelp = !!helpHtml;
    this._content.innerHTML = this._hasHelp ? helpHtml : '';

    this._hasExamples = Array.isArray(examples) && examples.length > 0;
    this._onLoadExample = onLoadExample || null;
    this._examplesPane.innerHTML = this._hasExamples
      ? this._renderExamplesList(examples)
      : '';

    this._glossaryItems = Array.isArray(glossary) ? glossary : [];
    this._hasGlossary = this._glossaryItems.length > 0;
    this._glossaryGet = glossaryGet || null;
    // Reset detail view + search when the underlying list changes.
    this._glossaryOpenId = null;
    this._glossaryQuery = '';
    if (this._hasGlossary) this._renderGlossary();
    else this._glossaryPane.innerHTML = '';

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
    this._content.innerHTML = '';
    this._examplesPane.innerHTML = '';
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
    const esc = htmlEscape;

    const items = examples.map(ex => {
      const title = ex.title?.[lang] || ex.title?.en || ex.id;
      const desc  = ex.description?.[lang] || ex.description?.en || '';
      const source = ex.source ? `<div class="help-panel__example-meta">${t('moduleHelp.source')}: ${esc(ex.source)}</div>` : '';
      return `
        <div class="help-panel__example">
          <div class="help-panel__example-head">
            <span class="help-panel__example-title">${esc(title)}</span>
          </div>
          ${desc ? `<p class="help-panel__example-desc">${esc(desc)}</p>` : ''}
          ${source}
          <button class="btn btn--sm btn--primary help-panel__example-load" data-example-id="${esc(ex.id)}">
            ${t('moduleHelp.loadButton')}
          </button>
        </div>
      `;
    });
    return items.join('');
  }

  // ─── Glossary tab rendering ──────────────────────────────

  _renderGlossary() {
    if (this._glossaryOpenId) this._renderGlossaryDetail();
    else this._renderGlossaryList();
  }

  _renderGlossaryList() {
    const lang = this._i18n.getLanguage();
    const t = (k) => this._i18n.t(k);
    const esc = htmlEscape;

    const q = this._glossaryQuery.trim().toLowerCase();
    const visible = q
      ? this._glossaryItems.filter(item => {
          const hay = [item.title?.[lang], item.title?.de, item.title?.en,
                       item.short?.[lang], item.short?.de, item.short?.en]
                       .filter(Boolean).join('  ').toLowerCase();
          return hay.includes(q);
        })
      : this._glossaryItems;

    const items = visible.map(item => {
      const title = item.title?.[lang] || item.title?.en || item.id;
      const short = item.short?.[lang] || item.short?.en || '';
      return `
        <button type="button" class="help-panel__glossary-item" data-glossary-id="${esc(item.id)}">
          <span class="help-panel__glossary-item-title">${esc(title)}</span>
          ${short ? `<span class="help-panel__glossary-item-short">${esc(short)}</span>` : ''}
        </button>
      `;
    }).join('');

    const empty = visible.length === 0
      ? `<p class="help-panel__glossary-empty">${t('moduleHelp.glossaryNoMatch')}</p>`
      : '';

    this._glossaryPane.innerHTML = `
      <div class="help-panel__glossary-search">
        <input type="search"
               data-glossary-search
               class="input input--sm"
               placeholder="${esc(t('moduleHelp.glossarySearchPlaceholder'))}"
               value="${esc(this._glossaryQuery)}"
               aria-label="${esc(t('moduleHelp.glossarySearchPlaceholder'))}">
      </div>
      <div class="help-panel__glossary-list">
        ${items}${empty}
      </div>
    `;

    // Restore focus to search after re-render so live typing keeps caret.
    const input = this._glossaryPane.querySelector('[data-glossary-search]');
    if (input && this._glossaryQuery) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  async _renderGlossaryDetail() {
    const t = (k) => this._i18n.t(k);
    const esc = htmlEscape;

    // Show loading state immediately.
    this._glossaryPane.innerHTML = `
      <div class="help-panel__glossary-detail">
        <button type="button" class="help-panel__glossary-back" data-glossary-back>
          ← ${esc(t('moduleHelp.glossaryBack'))}
        </button>
        <p class="help-panel__glossary-loading">${esc(t('moduleHelp.loading'))}</p>
      </div>
    `;

    const term = this._glossaryGet ? await this._glossaryGet(this._glossaryOpenId) : null;

    // If the user navigated away while loading, drop the result.
    if (this._glossaryOpenId !== (term?.id ?? this._glossaryOpenId)) return;

    if (!term) {
      this._glossaryPane.innerHTML = `
        <div class="help-panel__glossary-detail">
          <button type="button" class="help-panel__glossary-back" data-glossary-back>
            ← ${esc(t('moduleHelp.glossaryBack'))}
          </button>
          <p class="help-panel__glossary-error">${esc(t('moduleHelp.glossaryLoadError'))}</p>
        </div>
      `;
      return;
    }

    const lang = this._i18n.getLanguage();
    const titleOf = this._glossaryTitleResolver
      ? (id) => this._glossaryTitleResolver(id, lang)
      : (id) => id;
    this._glossaryPane.innerHTML = renderGlossaryDetailHtml(term, lang, t, esc, titleOf);

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

function renderGlossaryDetailHtml(term, lang, t, esc, titleOf = (id) => id) {
  const title = term.title?.[lang] || term.title?.en || term.id;
  const blocks = term.definition?.[lang] || term.definition?.en || [];
  const aliases = term.aliases?.[lang] || term.aliases?.en || [];

  const body = blocks.map(b => renderGlossaryBlock(b, esc, titleOf)).join('\n');

  const aliasesHtml = aliases.length
    ? `<p class="help-panel__glossary-aliases"><em>${esc(t('moduleHelp.glossaryAliases'))}:</em> ${aliases.map(esc).join(', ')}</p>`
    : '';

  const seeAlso = Array.isArray(term.seeAlso) && term.seeAlso.length
    ? `<div class="help-panel__glossary-seealso">
         <h4>${esc(t('moduleHelp.glossarySeeAlso'))}</h4>
         <ul>${term.seeAlso.map(id => `<li><a href="#" data-glossary-seealso="${esc(id)}">${esc(titleOf(id))}</a></li>`).join('')}</ul>
       </div>`
    : '';

  const modules = Array.isArray(term.modules) && term.modules.length
    ? `<div class="help-panel__glossary-modules">
         <h4>${esc(t('moduleHelp.glossaryUsedIn'))}</h4>
         <p>${term.modules.map(esc).join(', ')}</p>
       </div>`
    : '';

  const sources = Array.isArray(term.sources) && term.sources.length
    ? `<div class="help-panel__glossary-sources">
         <h4>${esc(t('moduleHelp.glossarySources'))}</h4>
         <ul>${term.sources.map(s => {
           const label = esc(s.label || '');
           return s.url
             ? `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${label}</a></li>`
             : `<li>${label}</li>`;
         }).join('')}</ul>
       </div>`
    : '';

  return `
    <div class="help-panel__glossary-detail">
      <button type="button" class="help-panel__glossary-back" data-glossary-back>
        ← ${esc(t('moduleHelp.glossaryBack'))}
      </button>
      <h3 class="help-panel__glossary-title">${esc(title)}</h3>
      ${aliasesHtml}
      <div class="help-panel__glossary-body">${body}</div>
      ${seeAlso}
      ${modules}
      ${sources}
    </div>
  `;
}

function renderGlossaryBlock(block, esc, titleOf = (id) => id) {
  if (!block || typeof block !== 'object') return '';
  switch (block.type) {
    case 'paragraph':
      return `<p>${renderInlineMarkdown(block.text || '', esc, titleOf)}</p>`;
    case 'note':
      return `<div class="help-panel__glossary-note">${renderInlineMarkdown(block.text || '', esc, titleOf)}</div>`;
    case 'list':
      return `<ul>${(block.items || []).map(it => `<li>${renderInlineMarkdown(it || '', esc, titleOf)}</li>`).join('')}</ul>`;
    case 'formula':
      // Rendered via KaTeX post-insert; fallback shows the raw LaTeX as code.
      return `<div class="help-panel__glossary-formula" data-katex="${esc(block.latex || '')}"><code>${esc(block.latex || '')}</code></div>`;
    default:
      return block.text ? `<p>${esc(block.text)}</p>` : '';
  }
}

/**
 * Lightweight inline rendering for glossary text blocks:
 *   - `**bold**` / `*italic*` — Markdown-lite
 *   - `$…$` — inline LaTeX (KaTeX, rendered post-insert)
 *   - `{{term:id}}` — cross-ref to another glossary term
 *
 * Order matters: HTML-escape first, then math markers (so they survive
 * subsequent regex passes), then bold/italic, then term refs.
 */
function renderInlineMarkdown(text, esc, titleOf = (id) => id) {
  let s = esc(text);
  s = injectInlineMathMarkers(s);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // Inside the glossary tab, {{term:id|label}} keeps its explicit label;
  // the no-label form {{term:id}} resolves the label via the title resolver.
  s = s.replace(/\{\{term:([a-z0-9-]+)\|([^}]+)\}\}/gi, (_, id, label) =>
    `<a href="#" class="help-panel__glossary-xref" data-glossary-seealso="${id}">${label}</a>`);
  s = s.replace(/\{\{term:([a-z0-9-]+)\}\}/gi, (_, id) =>
    `<a href="#" class="help-panel__glossary-xref" data-glossary-seealso="${id}">${titleOf(id)}</a>`);
  return s;
}

function htmlEscape(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}
