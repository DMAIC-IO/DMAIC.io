/**
 * D.Mike — Stakeholder-Kachel: Einstellungen.
 */
import { defineSettings, boolean } from '../../../core/model.js';

export const Settings = defineSettings({
  showCritics: boolean({ default: true }),
});
