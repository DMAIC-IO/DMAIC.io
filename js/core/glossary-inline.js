/**
 * DMAIC.io — Glossary Inline-Link Augmenter (glossary-inline.js)
 *
 * Walks the DOM and turns every `.glossary-term` marker span into the
 * full hover affordance — appending the button child and the SVG icon.
 *
 * Emitters (stats-panel headers, the {{term:…}}-renderer in module help,
 * any future caller) only emit:
 *
 *   <span class="glossary-term" data-glossary-term="varianz">Varianz</span>
 *
 * Everything visual — icon, aria-label, focus ring, animation — lives in
 * this one file (JS) plus the global CSS in components.css / variables.css.
 * That way visual or behavioural tweaks touch ONE place instead of every
 * help-text and table-rendering call site.
 *
 * The augmenter is idempotent: spans that already carry an injected
 * button are left untouched. A MutationObserver picks up freshly-rendered
 * markup (module switch, stats-panel re-render, dynamically loaded help)
 * without any caller hooks.
 *
 * Aria-label template is set via `setGlossaryInlineConfig({ariaTemplate})`;
 * `{term}` is substituted with the span's visible text.
 */

import { icon } from './icon.js';

const STATE = {
  ariaTemplate: 'Glossar: {term} öffnen',
  observer: null,
  enabled: true,
};

/**
 * Apply config (typically once at bootstrap and on language change).
 * @param {{ariaTemplate?: string, enabled?: boolean}} cfg
 */
export function setGlossaryInlineConfig(cfg = {}) {
  if (typeof cfg.ariaTemplate === 'string' && cfg.ariaTemplate) {
    STATE.ariaTemplate = cfg.ariaTemplate;
  }
  if (typeof cfg.enabled === 'boolean') {
    const was = STATE.enabled;
    STATE.enabled = cfg.enabled;
    if (typeof document !== 'undefined') {
      document.body.classList.toggle('dmike-glossary-inline-off', !cfg.enabled);
    }
    if (!cfg.enabled && was) {
      detachAllButtons();
    } else if (cfg.enabled && !was && typeof document !== 'undefined') {
      // Re-augment all existing marker spans that were stripped earlier.
      augmentGlossaryTerms(document);
    }
  }
}

/** @returns {boolean} */
export function isGlossaryInlineEnabled() {
  return STATE.enabled;
}

/**
 * Augment every `.glossary-term[data-glossary-term]` inside `root` that
 * doesn't already have its button child. Cheap to call repeatedly.
 * @param {ParentNode} root
 */
export function augmentGlossaryTerms(root = document) {
  if (!STATE.enabled || !root || typeof root.querySelectorAll !== 'function') return;
  const spans = root.querySelectorAll('.glossary-term[data-glossary-term]');
  for (const span of spans) {
    augmentOne(span);
  }
}

/**
 * Start a MutationObserver on `document.body` that runs the augmenter
 * for any subtree additions. Safe to call multiple times — only one
 * observer is ever attached.
 */
export function startGlossaryAugmenter() {
  if (STATE.observer || typeof MutationObserver === 'undefined') return;
  // First sweep — pick up everything already in the DOM.
  augmentGlossaryTerms(document);
  STATE.observer = new MutationObserver(handleMutations);
  STATE.observer.observe(document.body, { childList: true, subtree: true });
}

// ─── Internal ──────────────────────────────────────────────────────

function augmentOne(span) {
  if (!span || span.dataset.glossaryAugmented === '1') return;
  // Guard against pre-existing button children from older markup.
  const existing = span.querySelector(':scope > .glossary-term__btn');
  if (existing) existing.remove();

  const termId = span.dataset.glossaryTerm;
  if (!termId) return;
  const label = (span.textContent || termId).trim();
  const aria = STATE.ariaTemplate.replace('{term}', label);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'glossary-term__btn';
  btn.dataset.glossaryTerm = termId;
  btn.setAttribute('aria-label', aria);
  btn.replaceChildren(icon('glossary'));

  span.appendChild(btn);
  span.dataset.glossaryAugmented = '1';
}

function handleMutations(records) {
  if (!STATE.enabled) return;
  for (const rec of records) {
    if (rec.type !== 'childList') continue;
    for (const node of rec.addedNodes) {
      if (node.nodeType !== 1) continue;
      // Fast path: skip our own button injections.
      if (node.classList?.contains('glossary-term__btn')) continue;
      if (node.matches?.('.glossary-term[data-glossary-term]')) {
        augmentOne(node);
      }
      if (node.querySelectorAll) {
        const inner = node.querySelectorAll('.glossary-term[data-glossary-term]');
        for (const span of inner) augmentOne(span);
      }
    }
  }
}

/**
 * Remove all augmenter-added buttons. Used when the inline-links setting
 * is switched off at runtime so existing DOM updates immediately.
 */
function detachAllButtons() {
  document.querySelectorAll('.glossary-term[data-glossary-augmented="1"]').forEach(span => {
    span.querySelectorAll(':scope > .glossary-term__btn').forEach(btn => btn.remove());
    delete span.dataset.glossaryAugmented;
  });
}
