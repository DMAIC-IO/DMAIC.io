/**
 * D.Mike — Help Panel (help-panel.js)
 * Right-side panel for module handbooks.
 * Shown/hidden based on module activation and help availability.
 */

export class HelpPanel {
  /**
   * @param {HTMLElement} container
   * @param {import('../core/i18n.js').I18n} i18n
   */
  constructor(container, i18n) {
    this._container = container;
    this._i18n = i18n;
  }

  /**
   * Render the help panel shell.
   */
  render() {
    this._container.className = 'help-panel help-panel--hidden';
    this._container.innerHTML = `
      <div class="help-panel__header">
        <span class="help-panel__title">Help</span>
        <button class="btn btn--icon btn--ghost" id="help-close-btn" aria-label="${this._i18n.t('common.close')}">✕</button>
      </div>
      <div class="help-panel__content"></div>
    `;

    this._content = this._container.querySelector('.help-panel__content');
    this._container.querySelector('#help-close-btn').addEventListener('click', () => this.hide());
  }

  /**
   * Show help content for a module.
   * @param {string} title
   * @param {string} html
   */
  show(title, html) {
    this._container.querySelector('.help-panel__title').textContent = title;
    this._content.innerHTML = html;
    this._container.classList.remove('help-panel--hidden');
  }

  /**
   * Hide the panel.
   */
  hide() {
    this._container.classList.add('help-panel--hidden');
  }

  /**
   * Check if panel is visible.
   * @returns {boolean}
   */
  isVisible() {
    return !this._container.classList.contains('help-panel--hidden');
  }
}
