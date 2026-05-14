/**
 * DMAIC.io — Help Panel (help-panel.js)
 * Right-side panel for module handbooks and example data.
 *
 * Two tabs:
 *   - "Hilfe"        — lazy-loaded module help (existing behaviour)
 *   - "Beispieldaten" — list of catalog examples matching the active module
 *
 * Backwards-compat: the original `show(title, html)` API still works
 * (it shows the Help tab, hides the Examples tab).
 */

export class HelpPanel {
  /**
   * @param {HTMLElement} container
   * @param {import('../core/i18n.js').I18n} i18n
   */
  constructor(container, i18n) {
    this._container = container;
    this._i18n = i18n;
    /** @type {'help'|'examples'} */
    this._activeTab = 'help';
    this._hasHelp = false;
    this._hasExamples = false;
    /** @type {?(exampleId: string) => void} */
    this._onLoadExample = null;
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
      </div>
      <div class="help-panel__body">
        <div class="help-panel__content" data-pane="help" role="tabpanel"></div>
        <div class="help-panel__examples" data-pane="examples" role="tabpanel" hidden></div>
      </div>
    `;

    this._content = this._container.querySelector('[data-pane="help"]');
    this._examplesPane = this._container.querySelector('[data-pane="examples"]');
    this._titleEl = this._container.querySelector('.help-panel__title');

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
  }

  /**
   * Backwards-compatible single-tab show: fills the Help tab and hides Examples.
   * @param {string} title
   * @param {string} html
   */
  show(title, html) {
    this._titleEl.textContent = title;
    this._content.innerHTML = html;
    this._hasHelp = true;
    this._hasExamples = false;
    this._updateTabVisibility();
    this._setActiveTab('help');
    this._container.classList.remove('help-panel--hidden');
  }

  /**
   * Tab-aware show. Configure both panes at once; tabs whose content is
   * empty/absent are hidden. `preferredTab` selects the initial tab if
   * both are available.
   *
   * @param {string} title
   * @param {object} opts
   * @param {?string} opts.helpHtml      HTML for the Help tab (null/empty → hidden)
   * @param {object[]=} opts.examples    Catalog entries to render in the Examples tab
   * @param {(exampleId: string) => void=} opts.onLoadExample
   * @param {'help'|'examples'=} opts.preferredTab
   */
  showWithTabs(title, { helpHtml, examples, onLoadExample, preferredTab } = {}) {
    this._titleEl.textContent = title;

    this._hasHelp = !!helpHtml;
    this._content.innerHTML = this._hasHelp ? helpHtml : '';

    this._hasExamples = Array.isArray(examples) && examples.length > 0;
    this._onLoadExample = onLoadExample || null;
    this._examplesPane.innerHTML = this._hasExamples
      ? this._renderExamplesList(examples)
      : '';

    this._updateTabVisibility();

    // Tab selection priority:
    //   1. Panel currently visible AND current tab still has content → keep it.
    //      (Avoids stomping on the user's tab choice when a deferred help
    //       fetch resolves and triggers a second showWithTabs.)
    //   2. preferredTab if it has content.
    //   3. 'help' if available, else 'examples'.
    let target;
    if (this.isVisible() && this._tabHasContent(this._activeTab)) {
      target = this._activeTab;
    } else if (preferredTab && this._tabHasContent(preferredTab)) {
      target = preferredTab;
    } else {
      target = this._hasHelp ? 'help' : 'examples';
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

  // ─── Internal ─────────────────────────────────────────────

  _setActiveTab(tab) {
    if (tab !== 'help' && tab !== 'examples') return;
    if (!this._tabHasContent(tab)) return;
    this._activeTab = tab;

    this._container.querySelectorAll('.help-panel__tab').forEach(b => {
      const active = b.dataset.tab === tab;
      b.classList.toggle('help-panel__tab--active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    this._content.hidden     = tab !== 'help';
    this._examplesPane.hidden = tab !== 'examples';
  }

  _tabHasContent(tab) {
    if (tab === 'help') return this._hasHelp;
    if (tab === 'examples') return this._hasExamples;
    return false;
  }

  _updateTabVisibility() {
    const tabs = this._container.querySelector('.help-panel__tabs');
    const bothVisible = this._hasHelp && this._hasExamples;
    tabs.style.display = bothVisible ? '' : 'none';
  }

  _renderExamplesList(examples) {
    const lang = this._i18n.getLanguage();
    const t = (k) => this._i18n.t(k);
    const esc = htmlEscape;

    const items = examples.map(ex => {
      const title = ex.title?.[lang] || ex.title?.en || ex.id;
      const desc  = ex.description?.[lang] || ex.description?.en || '';
      const source = ex.source ? `<div class="help-panel__example-meta">${t('moduleHelp.source')}: ${esc(ex.source)}</div>` : '';
      const typeBadge = `<span class="help-panel__example-badge help-panel__example-badge--${ex.type}">${t(`moduleHelp.type.${ex.type}`)}</span>`;
      return `
        <div class="help-panel__example">
          <div class="help-panel__example-head">
            <span class="help-panel__example-title">${esc(title)}</span>
            ${typeBadge}
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
}

function htmlEscape(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}
