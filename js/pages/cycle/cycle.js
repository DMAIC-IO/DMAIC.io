/**
 * D.Mike — Cycle page (cycle.js)
 * Event-driven view (spec §4): renders the cycle picker + switch-confirm
 * dialogs in response to bus requests and emits typed replies. Not a toggle
 * page — no header button, no fixed mount point (the dialogs live inside the
 * shared modal overlay). The project switcher (app.js / later frame/) only
 * emits/handles events; this module owns the dialog DOM.
 *
 * Events:
 *   in : cycle:pick-requested   { context:'create'|'switch', currentCycle }
 *        cycle:switch-requested { from, to }
 *   out: cycle:picked           { context, cycleId, scenarioId, projectName }
 *                                (cycleId null = cancel; scenarioId null = empty project;
 *                                 projectName null = none typed / scenario supplies its own)
 *        cycle:switch-confirmed { from, to, confirmed }
 */

import { CYCLES, getPhaseIds, DEFAULT_CYCLE } from '../../core/cycles/cycles.js';
import { buildCyclePickerDialog } from '../../dialogs/cycle-picker/cycle-picker.js';
import { buildCycleSwitchConfirmDialog } from '../../dialogs/cycle-switch-confirm/cycle-switch-confirm.js';

/**
 * Pure module-loss math for a cycle switch. No I/O — `phases` is the already-read
 * `stateManager.get('phases')` object.
 * @param {string} fromCycle
 * @param {string} toCycle
 * @param {object} phases               - { [phaseId]: [{moduleId}], extras: [...] }
 * @param {import('../../core/module-registry.js').ModuleRegistry} moduleRegistry
 * @returns {{ lostPhases: string[], newAdded: string[], mapped: number, fallback: number }}
 */
export function computeSwitchImpact(fromCycle, toCycle, phases, moduleRegistry) {
  const oldPhases = getPhaseIds(fromCycle);
  const newPhases = getPhaseIds(toCycle);
  const lostPhases = oldPhases.filter(p => !newPhases.includes(p));
  const newAdded = newPhases.filter(p => !oldPhases.includes(p));

  let mapped = 0;
  let fallback = 0;
  const phasesObj = phases || {};
  for (const oldPhase of oldPhases) {
    for (const item of (phasesObj[oldPhase] || [])) {
      const def = moduleRegistry.get(item.moduleId);
      if (def && def.cycles && def.cycles[toCycle] && def.cycles[toCycle].phase) mapped++;
      else fallback++;
    }
  }
  fallback += (phasesObj.extras || []).length;

  return { lostPhases, newAdded, mapped, fallback };
}

/**
 * Render the cycle picker modal. Resolves with the picked cycle id, the
 * optional scenario id and the optional project name, or null if cancelled.
 *
 * `context === 'create'` gets the two-step flow: step 1 picks a cycle via the
 * card's "Weiter" button, step 2 offers the empty project (with a name field)
 * and one row per scenario. Both step-2 rows confirm the dialog from inside
 * its own content, so the modal footer's confirm button is hidden there.
 *
 * `context === 'switch'` stays single-step with footer confirmation: picking a
 * scenario while switching an EXISTING project's cycle would be silently
 * discarded by project-switcher.js (only the create branch reads scenarioId),
 * so offering the choice there would be dead UI.
 *
 * @param {string} context 'create'|'switch'
 * @returns {Promise<{cycleId: string, scenarioId: string|null, projectName: string|null}|null>}
 */
function _renderPicker(dialog, modal, i18n, currentCycle, context) {
  const preselected = currentCycle ?? DEFAULT_CYCLE;
  const cycles = Object.values(CYCLES).map(c => ({
    id: c.id,
    name: i18n.t(`${c.i18nKey}.name`),
    short: i18n.t(`${c.i18nKey}.short`),
    description: i18n.t(`${c.i18nKey}.description`),
  }));
  return dialog.open(modal, {
    cycles,
    preselected,
    allowScenarios: context === 'create',
    defaultProjectName: i18n.t('app.defaultProjectName'),
  }, {
    confirmLabel: i18n.t('common.ok'),
    hideConfirm: context === 'create',   // create confirms from its own content
  });
}

/**
 * Render the switch-confirm preview modal. Resolves true if confirmed.
 * (Same DOM/keys as the legacy _confirmCycleSwitch.)
 * @returns {Promise<boolean>}
 */
function _renderConfirm(dialog, modal, i18n, stateManager, moduleRegistry, fromCycle, toCycle) {
  const phases = stateManager.get('phases') || {};
  const { lostPhases, newAdded, mapped, fallback } =
    computeSwitchImpact(fromCycle, toCycle, phases, moduleRegistry);

  const newPhases = getPhaseIds(toCycle);
  const firstNewPhaseLabel = i18n.t(`phases.${newPhases[0]}`);
  const fromName = i18n.t(`cycles.${fromCycle}.name`);
  const toName = i18n.t(`cycles.${toCycle}.name`);

  return dialog.open(modal, {
    lostPhasesText: lostPhases.map(p => i18n.t(`phases.${p}`)).join(', '),
    newAddedText: newAdded.map(p => i18n.t(`phases.${p}`)).join(', '),
    mapped,
    fallback,
    firstNewPhaseLabel,
  }, {
    title: i18n.t('cycles.switchTitle', { from: fromName, to: toName }),
    confirmLabel: i18n.t('cycles.switchConfirm'),
  }).then(result => result === true);  // null (cancel) → false
}

/**
 * Register the cycle picker/confirm dialog handlers.
 * @param {object} ctx - kernel services container, plus `modal` (the shared Modal).
 *   Uses: ctx.eventBus, ctx.i18n, ctx.stateManager, ctx.moduleRegistry, ctx.modal
 */
export default {
  id: 'cycle',

  async init(ctx) {
    const { eventBus, i18n, stateManager, moduleRegistry, modal, examplesRegistry } = ctx;
    const pickerDialog = buildCyclePickerDialog({ i18n, eventBus, examplesRegistry });
    const confirmDialog = buildCycleSwitchConfirmDialog({ i18n, eventBus });
    // Mount both dialog nodes up front so open() has no first-time fetch latency
    // — the picker→confirm hand-off is observed synchronously by the UI/E2E.
    await Promise.all([pickerDialog.prewarm(), confirmDialog.prewarm()]);

    eventBus.on('cycle:pick-requested', async ({ context, currentCycle }) => {
      const picked = await _renderPicker(pickerDialog, modal, i18n, currentCycle ?? null, context);
      eventBus.emit('cycle:picked', {
        context,
        cycleId: picked?.cycleId ?? null,
        scenarioId: picked?.scenarioId || null,
        projectName: picked?.projectName ?? null,
      });
    });

    eventBus.on('cycle:switch-requested', async ({ from, to }) => {
      const confirmed = await _renderConfirm(confirmDialog, modal, i18n, stateManager, moduleRegistry, from, to);
      eventBus.emit('cycle:switch-confirmed', { from, to, confirmed });
    });
  },
};
