/**
 * D.Mike — Ishikawa: Datumsangaben in der Oberfläche.
 *
 * Eine Regel für das ganze Modul: Deutsch schreibt `de-DE` (Tag vor Monat),
 * jede andere Sprache `en-US` (Monat vor Tag). So zeigen Snapshot-Liste, Vorgabename
 * eines Snapshots, Trend, Zeitplan und Kostenverlauf dasselbe Format.
 */

/** @param {string} lang Sprache der App @returns {'de-DE'|'en-US'} */
export function localeOf(lang) {
  return lang === 'de' ? 'de-DE' : 'en-US';
}

/** @param {Date|number|string} value @returns {Date|null} gültiges Datum oder `null` */
function toDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Tag und Monat zweistellig (Teilstriche, Stände im Trend): `09.03.` bzw. `03/09`.
 * @param {Date|number|string} value @param {string} lang
 * @returns {string} leer bei ungültigem Datum
 */
export function dayMonth(value, lang) {
  const d = toDate(value);
  return d ? d.toLocaleDateString(localeOf(lang), { day: '2-digit', month: '2-digit' }) : '';
}

/**
 * Datum: `9.3.2026` bzw. `3/9/2026`.
 * @param {Date|number|string} value @param {string} lang
 * @returns {string} leer bei ungültigem Datum
 */
export function dateText(value, lang) {
  const d = toDate(value);
  return d ? d.toLocaleDateString(localeOf(lang)) : '';
}

/**
 * Datum und Uhrzeit (Stunde und Minute): `9.3.2026 14:05` bzw. `3/9/2026 02:05 PM`.
 * @param {Date|number|string} value @param {string} lang
 * @returns {string} leer bei ungültigem Datum
 */
export function dateTimeText(value, lang) {
  const d = toDate(value);
  if (!d) return '';
  const locale = localeOf(lang);
  return `${d.toLocaleDateString(locale)} ${d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`;
}
