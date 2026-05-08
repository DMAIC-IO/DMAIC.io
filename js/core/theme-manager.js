/**
 * D.Mike — Theme Manager (theme-manager.js)
 * Manages dark/light mode switching.
 * Applies theme via data-theme attribute on <html>.
 * Persists preference via StateManager.
 * Detects system preference on first visit.
 */

export class ThemeManager {
  /**
   * @param {import('./state-manager.js').StateManager} stateManager
   * @param {import('./event-bus.js').EventBus} eventBus
   */
  constructor(stateManager, eventBus) {
    this._stateManager = stateManager;
    this._eventBus = eventBus;
    this._userHasExplicitPreference = false;
  }

  /**
   * Initialize: load saved preference or detect system theme.
   */
  init() {
    const saved = this._stateManager.get('settings.theme');
    if (saved) {
      this._userHasExplicitPreference = true;
      this._apply(saved);
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      this._apply(prefersDark ? 'dark' : 'light');
    }

    // Optionally follow system changes (only if no explicit user preference)
    window.matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', (e) => {
        if (!this._userHasExplicitPreference) {
          this._apply(e.matches ? 'dark' : 'light');
        }
      });
  }

  /**
   * Get the current theme.
   * @returns {'light' | 'dark'}
   */
  getTheme() {
    return document.documentElement.dataset.theme || 'light';
  }

  /**
   * Set the theme, save preference, emit event.
   * @param {'light' | 'dark'} theme
   */
  setTheme(theme) {
    this._userHasExplicitPreference = true;
    this._apply(theme);
    this._stateManager.set('settings.theme', theme);
    this._eventBus.emit('theme:changed', { theme });
  }

  /**
   * Toggle between light and dark.
   */
  toggle() {
    this.setTheme(this.getTheme() === 'dark' ? 'light' : 'dark');
  }

  // ─── Internal ───────────────────────────────────────────────

  _apply(theme) {
    document.documentElement.dataset.theme = theme;
  }
}
