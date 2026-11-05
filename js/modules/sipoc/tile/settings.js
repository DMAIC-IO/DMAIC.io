/**
 * D.Mike — SIPOC-Kachel: Einstellungen.
 */
import { defineSettings, number } from '../../../core/model.js';

export const Settings = defineSettings({
  topN: number({ integer: true, min: 1, max: 10, default: 3 }),
});
