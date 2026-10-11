/**
 * D.Mike — voc-ctx-tree phase lookup (voc-ctx-tree-phase.js)
 *
 * Pure helper shared by kano and survey-builder. Reads the static manifest
 * (plain data, no bootstrap side effects) because the module context carries
 * no module registry.
 */

import manifest from '../manifest.js';

/**
 * Phase in which a freshly provisioned `voc-ctx-tree` instance belongs in the
 * given cycle. The tree is cycle-dependent (`js/modules/manifest.js`): under
 * DMAIC/DMADV it lives in `define`, under 8D in `problem` (8D has no `define`).
 *
 * @param {string} cycleId
 * @returns {string}
 */
export function treePhaseForCycle(cycleId) {
  const def = manifest.find((m) => m.id === 'voc-ctx-tree');
  return def?.cycles?.[cycleId]?.phase || def?.phase || 'define';
}
