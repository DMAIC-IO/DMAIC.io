/**
 * D.Mike — Kachel der Prozessfähigkeit: Einstellungen.
 */
import { defineSettings, boolean, oneOf } from '../../../core/model.js';

export const Settings = defineSettings({
  ppmBasis: oneOf(['overall', 'within', 'observed'], { default: 'overall' }),
  showChart: boolean({ default: true }),
});
