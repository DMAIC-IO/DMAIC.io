/**
 * D.Mike — Export Format Migrations (migrations.js)
 * Migration chain for upgrading older export files to the
 * current format. Keyed by MAJOR.MINOR only (PATCH is irrelevant).
 *
 * Add a new entry here whenever a MINOR or MAJOR version bump
 * changes the export data structure.
 */

import { stripPatch } from './version-utils.js';

/** @type {Object.<string, function(object): object>} */
const migrations = {
  /**
   * v0.3 introduces the cycle concept (DMAIC, DMADV, …). Pre-0.3 exports
   * had no cycle field — every project is assumed to be DMAIC, since 0.2
   * had no other model. Within DMAIC, the `phases` and `phaseAchievement`
   * keys are unchanged, so only `projectMeta.cycle` needs to be added.
   *
   * Plan reference: V0.3-MULTI-CYCLE.md §3.7.
   */
  '0.2→0.3': (data) => {
    if (Array.isArray(data?.projects)) {
      // Multi-project export
      for (const proj of data.projects) {
        if (proj.projectMeta && !proj.projectMeta.cycle) {
          proj.projectMeta.cycle = 'dmaic';
        }
      }
    } else if (data?.projectMeta && !data.projectMeta.cycle) {
      // Single-project export
      data.projectMeta.cycle = 'dmaic';
    }
    return data;
  },
};

/**
 * Migrate export data to the latest format.
 * Compares MAJOR.MINOR only — PATCH differences are ignored.
 *
 * @param {object} data - parsed export JSON
 * @param {string} targetVersion - current app version (e.g. '0.1.0')
 * @returns {object} migrated data
 */
export function migrateToLatest(data, targetVersion) {
  let current = stripPatch(data.appVersion || '0.1.0');
  const target = stripPatch(targetVersion);

  if (current === target) return data;

  const steps = Object.keys(migrations);
  for (const step of steps) {
    const [from, to] = step.split('→');
    if (current === from) {
      data = migrations[step](data);
      current = to;
    }
    if (current === target) break;
  }

  data.appVersion = targetVersion;
  return data;
}
