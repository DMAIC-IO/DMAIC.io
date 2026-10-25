/**
 * D.Mike — Ishikawa labels (ishikawa-labels.js)
 *
 * Pure view helpers shared by the shell and the sub-viewmodels: display name
 * and colour of a 6M category. No DOM, no state.
 *
 * Spec: docs/superpowers/specs/2026-10-25-ishikawa-agent-release-design.md (E2)
 */

import { CATS } from './ishikawa-constants.js';

/**
 * Display name of a category: the user's own label, else the translation.
 * @param {{catLabels?: Object<string, string>}} model the State (reads `catLabels`)
 * @param {string} key category key (`man`, `machine`, …)
 * @param {function(string, object=): string} t translation function of the module
 * @returns {string}
 */
export function catLabel(model, key, t) {
  const custom = model && model.catLabels && model.catLabels[key];
  if (custom && custom.trim()) return custom.trim();
  return t(`cat.${key}`);
}

/**
 * Colour of a category; a neutral border colour for none or an unknown key.
 * @param {string} key category key
 * @returns {string} CSS colour
 */
export function catColor(key) {
  const c = CATS.find(cat => cat.key === key);
  return c ? c.color : 'var(--color-border-secondary)';
}
