/**
 * D.Mike — VoC → CTx-Kachel: Einstellungen.
 */
import { defineSettings, number, boolean } from '../../../core/model.js';

export const Settings = defineSettings({
  topN: number({ integer: true, min: 1, max: 20, default: 6 }),
  showLegend: boolean({ default: true }),
});
