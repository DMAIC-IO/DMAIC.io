/**
 * D.Mike — Header Overlay Menu (frame/header/overlay-menu.js)
 * Wires the header glossary button (opens the help-panel glossary catalog,
 * mutually exclusive with other overlays) and the global delegated
 * `[data-glossary-term]` click that routes inline glossary refs into the
 * help-panel term view.
 */

import { isGlossaryInlineEnabled } from '../../core/glossary-inline.js';

/**
 * Initialize the header glossary button and the global delegated
 * `[data-glossary-term]` click handler.
 *
 * @param {object} services
 * @param {object} services.eventBus - Global event bus.
 * @param {object} services.glossaryRegistry - Glossary term registry.
 * @param {object} ui
 * @param {object} ui.helpPanel - Help panel instance.
 */
export function initGlossaryInline(_services, { helpPanel }) {
  // The standalone glossary catalog button has been removed — the glossary is
  // now a tab inside the module-help panel (help / examples / glossary), and
  // searching it surfaces the full catalog. This wiring is only the global
  // delegated handler for inline `[data-glossary-term]` refs.

  // Global delegated click handler for inline glossary refs — covers
  // stats-panel headers, module-help cross-refs, and any future caller
  // that emits `[data-glossary-term="..."]`.
  document.body.addEventListener('click', (e) => {
    if (!isGlossaryInlineEnabled()) return;
    const el = e.target.closest('[data-glossary-term]');
    if (!el) return;
    // Don't steal clicks inside the glossary tab itself — its own handlers
    // route via `data-glossary-seealso`/`data-glossary-id`.
    if (el.closest('.help-panel__glossary')) return;
    const id = el.dataset.glossaryTerm;
    if (!id) return;
    e.preventDefault();
    helpPanel.openGlossaryTerm(id);
  });
}

/**
 * Mutual exclusivity for the header icon menu (Dashboard, AlgoLab,
 * Fragezeichen, Glossar, Schulungen): only one button is blue at a time.
 *
 * Dashboard / AlgoLab / Schulungen already participate via `overlay:opened`
 * (each one closes the others). The help-panel (Fragezeichen + Glossar)
 * is wired in here: when any other overlay opens, the panel hides; its
 * MutationObservers then clear `btn--active` on the two buttons.
 *
 * Both Fragezeichen and Glossar emit `overlay:opened='help-panel'` in their
 * click handlers, so opening either one also closes Dashboard/AlgoLab/
 * Schulungen via their existing `overlay:opened` listeners.
 *
 * @param {object} kernel
 * @param {object} kernel.eventBus - Global event bus.
 * @param {object} ui
 * @param {object} ui.helpPanel - Help panel instance.
 */
export function initHeaderCoordinator({ eventBus }, { helpPanel }) {
  eventBus.on('overlay:opened', (id) => {
    if (id === 'help-panel') return;
    if (helpPanel.isVisible()) helpPanel.hide();
  });
}
