/**
 * D.Mike — Page initialization (pages/index.js)
 * Wires the full-screen pages (settings, algorithm-lab, training, cycle,
 * dashboard) against the kernel. Called once from app.js after the frame is
 * built. Order preserved from the original app.js bootstrap.
 */

import trainingPage     from './training/training.js';
import algorithmLabPage from './algorithm-lab/algorithm-lab.js';
import settingsPage     from './settings/settings.js';
import cyclePage        from './cycle/cycle.js';
import dashboardPage    from './dashboard/dashboard.js';
import licensesPage     from './licenses/licenses.js';

/**
 * Initialize all application pages.
 *
 * @param {object} kernel - bootKernel() services container.
 * @param {object} deps
 * @param {object} deps.modal - Shared modal dialog host (needed by cyclePage).
 * @param {Map<string, object>} deps.actionVerbs - Verb registry (needed by
 *   the settings page's action-URL list, task 12).
 * @param {function} deps.notify - Toast helper (settings' copy-URL feedback).
 */
export async function initPages(kernel, { modal, actionVerbs, notify }) {
  await settingsPage.init({ ...kernel, actionVerbs, notify });
  await licensesPage.init(kernel);
  await algorithmLabPage.init(kernel);
  kernel.eventBus.on('lab:navigate', async (p) => {
    await algorithmLabPage.show();
    algorithmLabPage.mountHandle()?.navigate(p.algoId, p.tab);
  });
  await trainingPage.init(kernel);
  await cyclePage.init({ ...kernel, modal });
  await dashboardPage.init(kernel);

  return new Map([
    ['settings', settingsPage],
    ['licenses', licensesPage],
    ['algorithm-lab', algorithmLabPage],
    ['training', trainingPage],
    ['dashboard', dashboardPage],
  ]);
}
