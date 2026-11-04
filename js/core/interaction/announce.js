/**
 * Geteilte aria-live-Region und Bedienhinweis für Gesten (Spec C §4.4).
 * Eine Region je Dokument; `ui/draggable-list.js` sagt in derselben an.
 */

const REGION_ID = 'dmike-live-region';
const INSTRUCTIONS_ID = 'dmike-gesture-instructions';

/**
 * Eine Meldung höflich ansagen; gleicher Text wird erneut angesagt.
 * @param {Document} doc @param {string} message @returns {void}
 */
export function announce(doc, message) {
  let region = doc.getElementById(REGION_ID);
  if (!region) {
    region = doc.createElement('div');
    region.id = REGION_ID;
    region.className = 'dmike-sr-only';
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('role', 'status');
    doc.body.appendChild(region);
  }
  // Re-setting identical text does not re-announce — clear first.
  region.textContent = '';
  region.textContent = message;
}

/**
 * Das versteckte Element mit dem Bedienhinweis sicherstellen (Ziel von
 * `aria-describedby` an jedem Griff).
 * @param {Document} doc @param {string} text in der aktiven Sprache
 * @returns {string} die id des Elements
 */
export function instructionsId(doc, text) {
  let el = doc.getElementById(INSTRUCTIONS_ID);
  if (!el) {
    el = doc.createElement('div');
    el.id = INSTRUCTIONS_ID;
    el.className = 'dmike-sr-only';
    doc.body.appendChild(el);
  }
  if (el.textContent !== text) el.textContent = text;
  return INSTRUCTIONS_ID;
}
