/**
 * D.Mike — SPC-Kachel der Regelkarte: Einstellungen.
 */
import { defineSettings, number, boolean } from '../../../core/model.js';

export const Settings = defineSettings({
  lastN: number({ integer: true, min: 0, max: 500, default: 0 }),
  showChart: boolean({ default: true }),
});
