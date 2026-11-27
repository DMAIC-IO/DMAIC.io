/**
 * D.Mike — REST API: Darstellung.
 *
 * Uhrzeiten in der App-Sprache, Klassen und Texte der Statusanzeigen und
 * die Namen fehlender Zugangsdaten. Rein, ohne DOM.
 */

/**
 * Uhrzeit eines Zeitpunkts mit Sekunden, Deutsch `de-DE`, sonst `en-US`.
 * @param {number} ts ms seit Epoche
 * @param {string} lang App-Sprache
 * @returns {string}
 */
export function formatTime(ts, lang) {
  return new Date(ts).toLocaleTimeString(lang === 'de' ? 'de-DE' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * Statuszeile einer Antwort: „200 OK“, bei Fehlern „0 Error“.
 * @param {{ status: number, statusText: string }} res
 * @returns {string}
 */
export function statusText(res) {
  return `${res.status} ${res.statusText}`;
}

/**
 * Die Header-Namen ohne Zugangsdaten eines Endpunkts, ohne Doppel, in
 * Listenreihenfolge.
 * @param {ReadonlyArray<{ endpointId: string, key: string }>} gaps
 * @param {string|null} endpointId
 * @returns {string[]}
 */
export function missingSecretNames(gaps, endpointId) {
  return [...new Set(gaps.filter((g) => g.endpointId === endpointId).map((g) => g.key.trim()))];
}
