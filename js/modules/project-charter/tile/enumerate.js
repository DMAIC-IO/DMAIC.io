/**
 * D.Mike — Project charter: Kachel-Aufzählung.
 *
 * Jede Kachel ist ein Einzelstück mit fester Id (= Art) und gehört zur
 * ersten Charter-Instanz; ohne Instanz gibt es keine Kachel.
 */
import descriptor from '../module.js';

/**
 * @param {string} kind Kachel-Id und Art @param {string} titleKey i18n-Schlüssel des Titels
 * @returns {(ctx: { findInstances: (id: string) => Array<{ instanceId: string }>, i18n: { t: (k: string) => string } }) => Array<{ tileId: string, instanceId: string, title: string }>}
 */
export function enumerateFirst(kind, titleKey) {
  return (ctx) => {
    const inst = ctx.findInstances(descriptor.id)[0] || null;
    return inst ? [{ tileId: kind, instanceId: inst.instanceId, title: ctx.i18n.t(titleKey) }] : [];
  };
}

/** @param {string} key Schlüssel unter `tiles.` @returns {string} */
export const tileTitleKey = (key) => `modules.${descriptor.id}.tiles.${key}.title`;
