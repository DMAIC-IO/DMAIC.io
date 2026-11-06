/**
 * D.Mike — Kalender-Kachel: Einstellungen.
 */
import { defineSettings, number, oneOf } from '../../../core/model.js';

export const Settings = defineSettings({
  topN: number({ integer: true, min: 1, max: 10, default: 5 }),
  horizon: oneOf(['7', '14', '30'], { default: '14' }),
});
