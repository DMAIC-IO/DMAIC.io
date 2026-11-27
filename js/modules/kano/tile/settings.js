/**
 * D.Mike — Kano-Kachel: Einstellungen.
 */
import { defineSettings, boolean } from '../../../core/model.js';

export const Settings = defineSettings({
  showChart: boolean({ default: true }),
});
