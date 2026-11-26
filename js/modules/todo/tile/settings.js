/**
 * D.Mike — Todo-Kachel: Einstellungen.
 */
import { defineSettings, number, boolean } from '../../../core/model.js';

export const Settings = defineSettings({
  topN: number({ integer: true, min: 1, max: 10, default: 5 }),
  showDone: boolean({ default: false }),
});
