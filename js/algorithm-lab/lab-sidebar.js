/**
 * Algorithm Lab — Sidebar Navigation
 * Category tree with collapsible groups, status dots, search filtering.
 */

import { statusDotHTML } from './lab-renderer.js';

export class LabSidebar {
  /**
   * @param {HTMLElement} container
   * @param {object} opts
   * @param {function(string): void} opts.onAlgoSelect
   * @param {import('../core/i18n.js').I18n} opts.i18n
   */
  constructor(container, { onAlgoSelect, i18n, loc }) {
    this._container = container;
    this._onAlgoSelect = onAlgoSelect;
    this._i18n = i18n;
    this._loc = loc || ((v) => (typeof v === 'string' ? v : ''));
    this._activeId = null;
  }

  /**
   * Render the sidebar with categories and algorithms.
   * @param {Array<{id: string, name: string}>} categories
   * @param {Map<string, object[]>} grouped - categoryId → algorithm[]
   */
  render(categories, grouped) {
    this._categories = categories;
    this._grouped = grouped;

    this._container.innerHTML = '';
    this._container.className = 'lab__sidebar';

    // Header with search
    const header = document.createElement('div');
    header.className = 'lab__sidebar-header';
    header.innerHTML = `
      <div class="lab__sidebar-title">${this._i18n.t('lab.title')}</div>
      <input class="field lab__search"
             type="text"
             placeholder="${this._i18n.t('lab.search')}"
             aria-label="${this._i18n.t('lab.search')}">
    `;
    this._container.append(header);

    this._searchInput = header.querySelector('.lab__search');
    this._searchInput.addEventListener('input', () => this._onSearch());

    // Navigation
    const nav = document.createElement('div');
    nav.className = 'lab__sidebar-nav';
    this._navEl = nav;

    for (const cat of categories) {
      const algos = grouped.get(cat.id) || [];
      if (algos.length === 0) continue;
      nav.append(this._buildCategory(cat, algos));
    }

    this._container.append(nav);

    // Event delegation for clicks
    nav.addEventListener('click', (e) => {
      const toggle = e.target.closest('.lab__category-toggle');
      if (toggle) {
        const cat = toggle.closest('.lab__category');
        cat.classList.toggle('lab__category--open');
        return;
      }

      const item = e.target.closest('.lab__algo-item');
      if (item) {
        this._onAlgoSelect(item.dataset.algoId);
      }
    });
  }

  /**
   * Set the active algorithm in the sidebar.
   * @param {string} algoId
   */
  setActive(algoId) {
    this._activeId = algoId;
    const items = this._navEl.querySelectorAll('.lab__algo-item');
    items.forEach(item => {
      item.classList.toggle('lab__algo-item--active', item.dataset.algoId === algoId);
    });

    // Ensure the category containing this algo is open
    const activeItem = this._navEl.querySelector(`.lab__algo-item[data-algo-id="${algoId}"]`);
    if (activeItem) {
      const cat = activeItem.closest('.lab__category');
      if (cat) cat.classList.add('lab__category--open');
    }
  }

  // ── Internal ──

  _buildCategory(cat, algos) {
    const div = document.createElement('div');
    div.className = 'lab__category lab__category--open';
    div.dataset.categoryId = cat.id;

    div.innerHTML = `
      <button class="lab__category-toggle">
        <svg class="lab__category-chevron" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 1.5L7 5L3 8.5"/></svg>
        ${this._loc(cat.name)}
        <span class="lab__category-count">${algos.length}</span>
      </button>
      <div class="lab__category-items"></div>
    `;

    const items = div.querySelector('.lab__category-items');
    for (const algo of algos) {
      const btn = document.createElement('button');
      btn.className = 'lab__algo-item';
      btn.dataset.algoId = algo.id;
      btn.innerHTML = `${statusDotHTML(algo.status)} ${this._loc(algo.name)}`;
      items.append(btn);
    }

    return div;
  }

  _onSearch() {
    const q = this._searchInput.value.toLowerCase().trim();
    const categories = this._navEl.querySelectorAll('.lab__category');

    categories.forEach(catEl => {
      const items = catEl.querySelectorAll('.lab__algo-item');
      let visibleCount = 0;

      items.forEach(item => {
        const text = item.textContent.toLowerCase();
        const id = item.dataset.algoId.toLowerCase();
        const match = !q || text.includes(q) || id.includes(q);
        item.classList.toggle('lab__algo-item--hidden', !match);
        if (match) visibleCount++;
      });

      // Hide empty categories
      catEl.style.display = visibleCount === 0 ? 'none' : '';
      // Auto-open if searching
      if (q && visibleCount > 0) {
        catEl.classList.add('lab__category--open');
      }
    });
  }
}
