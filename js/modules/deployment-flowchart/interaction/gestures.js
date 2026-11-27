/**
 * D.Mike — Deployment-Flowchart: Gesten.
 *
 * Kette: ein Schritt wandert am Griff `.df__grip` (seine Nummer) an eine
 * andere Stelle und auf Wunsch zugleich in eine andere Bahn; die Bahnen
 * kommen aus den Nutzerdaten, darum liest die Geste sie aus den Slots der
 * Spalte (`bands: 'dom'`) und setzt die Bahn als `laneId`. Unterschritte:
 * Umsortieren innerhalb ihres Schritts am Griff `.fc-substep-grip`.
 * Tastatur, Ansage, Abbruch und Ablehnung liefert der Kern.
 */
import { chainGesture } from '../../../core/flowchart/interaction/chain.js';
import { substepGesture } from '../../../core/flowchart/interaction/substeps.js';

export const chain = chainGesture({ handle: '.df__grip', bands: 'dom', bandParam: 'laneId' });
export const substeps = substepGesture({ handle: '.fc-substep-grip' });
