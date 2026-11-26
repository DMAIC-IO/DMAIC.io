/**
 * D.Mike — Einheitenumrechner: Anzeige.
 *
 * Reine Funktionen: Zahlen in Stufen (Exponent, gerundet, signifikante
 * Stellen) mit den Trennzeichen der App-Sprache, Formeltext, Uhrzeit und
 * Datum der Zeitzonen in der Sprache (`de-DE`, sonst `en-US`), das Kürzel
 * einer Zeitzone.
 */
import { formatNumber, decimalSeparator, roundTo } from '../../../core/number-format.js';
import { formatTzDiff, tzOffsetMinutes } from '../domain/convert.js';

/** Strich für „kein Wert“. */
export const DASH = '—';

/**
 * Das Gebietsschema für Datum und Uhrzeit: Deutsch `de-DE`, sonst `en-US`.
 * @param {string} lang @returns {string}
 */
export const localeOf = (lang) => (lang === 'de' ? 'de-DE' : 'en-US');

/**
 * Eine Zahl in Anzeigeform: ab 1e12 und unter 1e-6 als Exponent mit sechs
 * Stellen, ab 1e6 höchstens zwei Nachkommastellen, ab 1 zehn signifikante
 * und höchstens sechs Nachkommastellen, darunter acht signifikante Stellen.
 * @param {number|null} n @param {string} lang
 * @returns {string} ein Strich für keine oder keine endliche Zahl
 */
export function fmtUnit(n, lang) {
  if (n === null || !Number.isFinite(n)) return DASH;
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e12 || abs < 1e-6) return n.toExponential(6).replace('.', decimalSeparator(lang));
  if (abs >= 1e6) return formatNumber(roundTo(n, 2), lang);
  if (abs >= 1) return formatNumber(roundTo(Number(n.toPrecision(10)), 6), lang);
  return formatNumber(Number(n.toPrecision(8)), lang);
}

/**
 * Das Ergebnis unter dem Ausgang.
 * @param {boolean} hasInput ergibt die Eingabe eine Zahl?
 * @param {number|null} value @param {string} lang @param {(k: string) => string} t
 * @returns {string}
 */
export function resultText(hasInput, value, lang, t) {
  if (!hasInput) return DASH;
  return value === null ? t('undefined') : fmtUnit(value, lang);
}

/**
 * Die Formel: `1 <von> = <Faktor> <nach>`, ohne festen Faktor die
 * logarithmische Umrechnung.
 * @param {boolean} hasInput @param {number|null} factor @param {string} from @param {string} to
 * @param {string} lang @param {(k: string) => string} t
 * @returns {string}
 */
export function formulaText(hasInput, factor, from, to, lang, t) {
  if (!hasInput) return DASH;
  return factor === null ? `${t('logConversion')} (${from} → ${to})` : `1 ${from} = ${fmtUnit(factor, lang)} ${to}`;
}

/**
 * Uhrzeit (HH:MM, 24 h) eines Zeitpunkts in einer Zone.
 * @param {Date} date @param {string} tz @param {string} lang @param {boolean} [seconds]
 * @returns {string}
 */
export function zoneTime(date, tz, lang, seconds = false) {
  return new Intl.DateTimeFormat(localeOf(lang), {
    timeZone: tz, hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}), hour12: false,
  }).format(date);
}

/**
 * Datum mit Wochentag eines Zeitpunkts in einer Zone.
 * @param {Date} date @param {string} tz @param {string} lang
 * @returns {string}
 */
export function zoneDate(date, tz, lang) {
  return new Intl.DateTimeFormat(localeOf(lang), {
    timeZone: tz, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

/**
 * Das Kürzel einer Zeitzone an einem Zeitpunkt (`CET`, `EDT`, `GMT+9`).
 * @param {string} tz @param {Date} date
 * @returns {string}
 */
export function tzAbbr(tz, date) {
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
      .formatToParts(date).find((x) => x.type === 'timeZoneName');
    return p ? p.value : '';
  } catch { return ''; }
}

/**
 * Der Zeitunterschied mit den Kürzeln beider Zonen, etwa `-6h (CET → EST)`.
 * @param {{ utc: Date, fromOffset: number, fromTz: string }|null} input @param {string|undefined} toTz
 * @returns {string}
 */
export function tzDiffText(input, toTz) {
  if (!input || !toTz) return DASH;
  const diff = tzOffsetMinutes(toTz, input.utc) - input.fromOffset;
  return `${formatTzDiff(diff)} (${tzAbbr(input.fromTz, input.utc)} → ${tzAbbr(toTz, input.utc)})`;
}
