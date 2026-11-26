/**
 * D.Mike — FMEA: Skalenschlüssel.
 *
 * Unter diesen Schlüsseln darf ein eigener Skalentext stehen: die 30 der
 * RPN-Skalen (je Stufe Bedeutung und Beschreibung, beim Auftreten die
 * Fehlerrate) und die 120 der beiden AP-Skalen
 * (`ap.<art>.<dimension>.<stufe>.meaning|criterion`). Ohne DOM, ohne i18n.
 */

/** Die 150 Schlüssel der Skalenzellen, RPN zuerst. */
export const SCALE_KEYS = Object.freeze([
  'sevNone', 'sevNoneDesc', 'sevLow', 'sevLowDesc',
  'sevMod', 'sevModDesc', 'sevHigh', 'sevHighDesc',
  'sevVHigh', 'sevVHighDesc', 'occUnlikely', 'occUnlikelyRate',
  'occLow', 'occLowRate', 'occMod', 'occModRate',
  'occHigh', 'occHighRate', 'occVHigh', 'occVHighRate',
  'detCertain', 'detCertainDesc', 'detHigh', 'detHighDesc',
  'detMod', 'detModDesc', 'detLow', 'detLowDesc',
  'detVLow', 'detVLowDesc',
  'ap.process.sev.1.meaning', 'ap.process.sev.1.criterion',
  'ap.process.sev.2.meaning', 'ap.process.sev.2.criterion',
  'ap.process.sev.3.meaning', 'ap.process.sev.3.criterion',
  'ap.process.sev.4.meaning', 'ap.process.sev.4.criterion',
  'ap.process.sev.5.meaning', 'ap.process.sev.5.criterion',
  'ap.process.sev.6.meaning', 'ap.process.sev.6.criterion',
  'ap.process.sev.7.meaning', 'ap.process.sev.7.criterion',
  'ap.process.sev.8.meaning', 'ap.process.sev.8.criterion',
  'ap.process.sev.9.meaning', 'ap.process.sev.9.criterion',
  'ap.process.sev.10.meaning', 'ap.process.sev.10.criterion',
  'ap.process.occ.1.meaning', 'ap.process.occ.1.criterion',
  'ap.process.occ.2.meaning', 'ap.process.occ.2.criterion',
  'ap.process.occ.3.meaning', 'ap.process.occ.3.criterion',
  'ap.process.occ.4.meaning', 'ap.process.occ.4.criterion',
  'ap.process.occ.5.meaning', 'ap.process.occ.5.criterion',
  'ap.process.occ.6.meaning', 'ap.process.occ.6.criterion',
  'ap.process.occ.7.meaning', 'ap.process.occ.7.criterion',
  'ap.process.occ.8.meaning', 'ap.process.occ.8.criterion',
  'ap.process.occ.9.meaning', 'ap.process.occ.9.criterion',
  'ap.process.occ.10.meaning', 'ap.process.occ.10.criterion',
  'ap.process.det.1.meaning', 'ap.process.det.1.criterion',
  'ap.process.det.2.meaning', 'ap.process.det.2.criterion',
  'ap.process.det.3.meaning', 'ap.process.det.3.criterion',
  'ap.process.det.4.meaning', 'ap.process.det.4.criterion',
  'ap.process.det.5.meaning', 'ap.process.det.5.criterion',
  'ap.process.det.6.meaning', 'ap.process.det.6.criterion',
  'ap.process.det.7.meaning', 'ap.process.det.7.criterion',
  'ap.process.det.8.meaning', 'ap.process.det.8.criterion',
  'ap.process.det.9.meaning', 'ap.process.det.9.criterion',
  'ap.process.det.10.meaning', 'ap.process.det.10.criterion',
  'ap.design.sev.1.meaning', 'ap.design.sev.1.criterion',
  'ap.design.sev.2.meaning', 'ap.design.sev.2.criterion',
  'ap.design.sev.3.meaning', 'ap.design.sev.3.criterion',
  'ap.design.sev.4.meaning', 'ap.design.sev.4.criterion',
  'ap.design.sev.5.meaning', 'ap.design.sev.5.criterion',
  'ap.design.sev.6.meaning', 'ap.design.sev.6.criterion',
  'ap.design.sev.7.meaning', 'ap.design.sev.7.criterion',
  'ap.design.sev.8.meaning', 'ap.design.sev.8.criterion',
  'ap.design.sev.9.meaning', 'ap.design.sev.9.criterion',
  'ap.design.sev.10.meaning', 'ap.design.sev.10.criterion',
  'ap.design.occ.1.meaning', 'ap.design.occ.1.criterion',
  'ap.design.occ.2.meaning', 'ap.design.occ.2.criterion',
  'ap.design.occ.3.meaning', 'ap.design.occ.3.criterion',
  'ap.design.occ.4.meaning', 'ap.design.occ.4.criterion',
  'ap.design.occ.5.meaning', 'ap.design.occ.5.criterion',
  'ap.design.occ.6.meaning', 'ap.design.occ.6.criterion',
  'ap.design.occ.7.meaning', 'ap.design.occ.7.criterion',
  'ap.design.occ.8.meaning', 'ap.design.occ.8.criterion',
  'ap.design.occ.9.meaning', 'ap.design.occ.9.criterion',
  'ap.design.occ.10.meaning', 'ap.design.occ.10.criterion',
  'ap.design.det.1.meaning', 'ap.design.det.1.criterion',
  'ap.design.det.2.meaning', 'ap.design.det.2.criterion',
  'ap.design.det.3.meaning', 'ap.design.det.3.criterion',
  'ap.design.det.4.meaning', 'ap.design.det.4.criterion',
  'ap.design.det.5.meaning', 'ap.design.det.5.criterion',
  'ap.design.det.6.meaning', 'ap.design.det.6.criterion',
  'ap.design.det.7.meaning', 'ap.design.det.7.criterion',
  'ap.design.det.8.meaning', 'ap.design.det.8.criterion',
  'ap.design.det.9.meaning', 'ap.design.det.9.criterion',
  'ap.design.det.10.meaning', 'ap.design.det.10.criterion',
]);

/**
 * Die fünf Zeilen der RPN-Skalen: Stufenbereich und je Dimension der
 * Schlüssel der Bedeutung. Die zweite Spalte trägt denselben Schlüssel mit
 * `Desc` (S, D) bzw. `Rate` (O), siehe `RPN_SECOND`.
 */
export const RPN_ROWS = Object.freeze([
  Object.freeze({ label: '1', sev: 'sevNone', occ: 'occUnlikely', det: 'detCertain' }),
  Object.freeze({ label: '2–3', sev: 'sevLow', occ: 'occLow', det: 'detHigh' }),
  Object.freeze({ label: '4–6', sev: 'sevMod', occ: 'occMod', det: 'detMod' }),
  Object.freeze({ label: '7–8', sev: 'sevHigh', occ: 'occHigh', det: 'detLow' }),
  Object.freeze({ label: '9–10', sev: 'sevVHigh', occ: 'occVHigh', det: 'detVLow' }),
]);

/** Endung des Schlüssels der zweiten Spalte je Dimension. */
export const RPN_SECOND = Object.freeze({ sev: 'Desc', occ: 'Rate', det: 'Desc' });

/**
 * Die Zeile der RPN-Skala zu einer Stufe 1–10 (0 bis 4).
 * @param {number} v Stufe
 * @returns {number}
 */
export function scaleRow(v) {
  if (v <= 1) return 0;
  if (v <= 3) return 1;
  if (v <= 6) return 2;
  if (v <= 8) return 3;
  return 4;
}

/**
 * Ob `key` der Schlüssel einer Skalenzelle ist.
 * @param {unknown} key
 * @returns {boolean}
 */
export function isScaleKey(key) {
  return typeof key === 'string' && SCALE_KEYS.includes(key);
}
