/**
 * D.Mike — Opportunity-Flowchart: Gesten.
 *
 * Kette: ein Schritt wandert am Griff `.of__grip` an eine andere Stelle und
 * auf Wunsch zugleich ins andere Band (`va` oben, `nva` unten). Unterschritte:
 * Umsortieren innerhalb ihres Schritts am Griff `.fc-substep-grip`.
 * Tastatur, Ansage, Abbruch und Ablehnung liefert der Kern.
 */
import { chainGesture } from '../../../core/flowchart/interaction/chain.js';
import { substepGesture } from '../../../core/flowchart/interaction/substeps.js';

export const chain = chainGesture({ handle: '.of__grip', bands: ['va', 'nva'] });
export const substeps = substepGesture({ handle: '.fc-substep-grip' });
