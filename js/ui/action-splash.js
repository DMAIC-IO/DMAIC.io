/**
 * D.Mike — Action splash (ui/action-splash.js)
 * Full-screen progress overlay shown while an action URL verb runs
 * (e.g. loading a scenario). Mirrors the pre-JS #app-loading styling.
 *
 * Instance contract: createActionSplash() holds NO module-level state — every
 * call returns an independent controller closed over its own overlay node.
 * Two instances never collide, so a caller MAY create one instance and pass
 * the returned handle around (e.g. through buildFrame(kernel, ui)) so every
 * consumer shares the same overlay; calling the factory again is also safe
 * and simply produces a second, fully independent overlay.
 */

import { h } from '../core/dom.js';

/**
 * Create the splash controller. The overlay node is created on first show()
 * and removed on hide(). Safe to call hide() without a prior show(), and
 * safe to call show() repeatedly — the existing overlay node is reused.
 * @param {{ i18n: object }} deps
 * @returns {{ show: (o: {title: string, subtitle?: string}) => void,
 *             update: (text: string) => void, hide: () => void }}
 */
export function createActionSplash({ i18n }) {
  let el = null;
  let titleEl = null;
  let subtitleEl = null;
  let progressEl = null;

  function build() {
    titleEl = h('div', { class: 'action-splash__title' });
    subtitleEl = h('div', { class: 'action-splash__subtitle' });
    progressEl = h('div', { class: 'action-splash__progress' });
    el = h('div', {
      class: 'action-splash', role: 'status', 'aria-live': 'polite',
      'aria-label': i18n.t('actions.splashLabel'),
    },
    h('div', { class: 'action-splash__box' },
      h('div', { class: 'app-loading__spinner' }),
      titleEl, subtitleEl, progressEl,
    ));
    document.body.appendChild(el);
  }

  return {
    /**
     * Show the overlay, mounting it on first call and reusing the same
     * node on subsequent calls (safe to call while already visible).
     * @param {{ title: string, subtitle?: string }} o
     */
    show({ title, subtitle = '' }) {
      if (!el) build();
      titleEl.textContent = title;
      subtitleEl.textContent = subtitle;
      progressEl.textContent = '';
    },
    /**
     * Replace the progress line only, leaving title/subtitle untouched.
     * No-op if the overlay is not currently shown.
     * @param {string} text
     */
    update(text) {
      if (progressEl) progressEl.textContent = text;
    },
    /**
     * Remove the overlay from the document. Safe to call at any time,
     * including without a prior show() or after an action failed midway —
     * this is the escape hatch that guarantees the page stays usable.
     */
    hide() {
      el?.remove();
      el = null;
      titleEl = null;
      subtitleEl = null;
      progressEl = null;
    },
  };
}
