/**
 * D.Mike — Einheitenumrechner: Rechnung.
 *
 * Reine Funktionen über die Tabellen aus `units.js`: verträgliche Einheiten,
 * Vorgaben je Größenart, Umrechnung, Faktor, Schnellreferenz und die
 * Zeitzonenrechnung (Versatz über `Intl`, Sommerzeit am gewählten Datum).
 * Liefert Zahlen und Schlüssel, keine Anzeigetexte.
 */
import { CATEGORIES, TIMEZONES } from './units.js';

/** "HH:MM" mit Stunde 0..23 und Minute 0..59 — die Form des Zeitfelds. */
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Die Größenart, mit der eine neue Umrechnung beginnt. */
export const DEFAULT_CAT = 'laenge';

/**
 * Alle Einheiten, die zu einer Einheit passen: dieselbe Gruppe, oder alle
 * Einheiten der Größenart, wenn sie keine Gruppen hat.
 * @param {string} catKey
 * @param {string} unitKey
 * @returns {string[]}
 */
export function groupMembers(catKey, unitKey) {
  const cat = CATEGORIES[catKey];
  if (!cat) return [];
  if (!cat.groups) return Object.keys(cat.units);
  for (const members of Object.values(cat.groups)) {
    if (members.includes(unitKey)) return members;
  }
  return Object.keys(cat.units);
}

/**
 * Die Einheitenschlüssel einer Größenart; leer bei unbekannter Größenart.
 * @param {string} catKey
 * @returns {string[]}
 */
export function unitKeysOf(catKey) {
  const cat = CATEGORIES[catKey];
  return cat ? Object.keys(cat.units) : [];
}

/**
 * Die ersten zwei verschiedenen Einheiten einer Größenart (innerhalb der
 * Gruppe der ersten).
 * @param {string} catKey
 * @returns {{ from: string, to: string }}
 */
export function defaultUnits(catKey) {
  const keys = unitKeysOf(catKey);
  const from = keys[0] || '';
  const to = groupMembers(catKey, from).find((k) => k !== from) || keys[1] || from;
  return { from, to };
}

/**
 * Die Zieleinheit, die zur Ausgangseinheit passt: die bevorzugte, wenn sie
 * passt und nicht die Ausgangseinheit ist; sonst die bisherige, wenn sie
 * passt; sonst die erste andere verträgliche.
 * @param {string} catKey
 * @param {string} from
 * @param {string} current bisherige Zieleinheit
 * @param {string} [preferred]
 * @returns {string}
 */
export function compatibleTo(catKey, from, current, preferred) {
  const compatible = groupMembers(catKey, from);
  if (preferred && compatible.includes(preferred) && preferred !== from) return preferred;
  if (compatible.includes(current) && current !== from) return current;
  return compatible.find((k) => k !== from) || compatible[0] || from;
}

/**
 * Einen Wert umrechnen.
 * @param {string} catKey @param {string} from @param {string} to @param {number} num
 * @returns {number|null} null bei unbekannter Einheit oder nicht endlichem Ergebnis
 */
export function convert(catKey, from, to, num) {
  const units = CATEGORIES[catKey]?.units;
  const uf = units?.[from];
  const ut = units?.[to];
  if (!uf || !ut || !Number.isFinite(num)) return null;
  const r = ut.fromBase(uf.toBase(num));
  return Number.isFinite(r) ? r : null;
}

/**
 * Der Umrechnungsfaktor (eine Ausgangseinheit in der Zieleinheit).
 * @param {string} catKey @param {string} from @param {string} to
 * @returns {number|null} null bei unbekannter Einheit oder logarithmischer Größe
 */
export function factor(catKey, from, to) {
  return convert(catKey, from, to, 1);
}

/**
 * Die Zeilen der Schnellreferenz einer Größenart.
 * @param {string} catKey
 * @returns {Array<{ val: number, from: string, to: string, result: number|null }>}
 */
export function refRows(catKey) {
  const cat = CATEGORIES[catKey];
  return (cat?.refs || []).map(([val, from, to]) => ({ val, from, to, result: convert(catKey, from, to, val) }));
}

/**
 * Einen `shortOffset`-Zonennamen von `Intl.DateTimeFormat` (`GMT`, `GMT+1`,
 * `GMT+5:30`, `GMT-0:30`) in Minuten lesen. Das Vorzeichen kommt aus dem
 * Text, nicht aus den Stunden, damit `GMT-0:30` −30 ergibt.
 * @param {string} str
 * @returns {number} Versatz zu UTC in Minuten; 0, wenn der Text nicht lesbar ist
 */
export function parseGmtOffset(str) {
  const m = String(str).match(/GMT(?:([+-]?)(\d+))?(?::(\d+))?/);
  if (!m) return 0;
  const total = parseInt(m[2] || '0', 10) * 60 + parseInt(m[3] || '0', 10);
  return m[1] === '-' ? -total : total;
}

/**
 * Einen Zeitunterschied in Minuten als Stunden und Minuten schreiben, etwa
 * `+5h 30min`, `+0h`, `-1h`, `-0h 30min`. Das Vorzeichen kommt aus dem
 * Unterschied selbst, damit Unterschiede unter einer Stunde ihr Minus behalten.
 * @param {number} diffMinutes Ziel minus Ausgang
 * @returns {string}
 */
export function formatTzDiff(diffMinutes) {
  const sign = diffMinutes < 0 ? '-' : '+';
  const abs = Math.abs(diffMinutes);
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  return `${sign}${hours}h${mins ? ` ${mins}min` : ''}`;
}

/**
 * Der Versatz einer Zeitzone zu UTC an einem Zeitpunkt.
 * @param {string} tz IANA-Name
 * @param {Date} date
 * @returns {number} Minuten
 */
export function tzOffsetMinutes(tz, date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(date);
  const p = parts.find((x) => x.type === 'timeZoneName');
  return p ? parseGmtOffset(p.value) : 0;
}

/**
 * Der Zeitpunkt, den Uhrzeit und Datum in der Ausgangszone meinen.
 * @param {number} tzFrom Position der Ausgangszone in `TIMEZONES`
 * @param {string} time `HH:MM`
 * @param {string} date `YYYY-MM-DD`
 * @returns {{ utc: Date, fromOffset: number, fromTz: string }|null} null, solange Zone, Uhrzeit oder Datum fehlen
 */
export function utcFromInput(tzFrom, time, date) {
  const fromTz = TIMEZONES[tzFrom]?.tz;
  if (!fromTz || !time || !date) return null;
  const temp = new Date(`${date}T${time}:00Z`);
  if (Number.isNaN(temp.getTime())) return null;
  const fromOffset = tzOffsetMinutes(fromTz, temp);
  return { utc: new Date(temp.getTime() - fromOffset * 60000), fromOffset, fromTz };
}

/**
 * Datum und Uhrzeit eines Zeitpunkts in einer Zone, als `YYYY-MM-DD` und
 * `HH:MM`. Mitternacht, die manche Umgebungen als Stunde 24 liefern, wird 00.
 * @param {string} tz IANA-Name
 * @param {Date} date
 * @returns {{ date: string, time: string }}
 */
export function zonedParts(tz, date) {
  /** @type {Record<string, string>} */
  const p = {};
  new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date).forEach((x) => { p[x.type] = x.value; });
  const hour = p.hour === '24' ? '00' : p.hour;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${hour}:${p.minute}` };
}

/**
 * Die Zeitzonenumrechnung: Uhrzeit und Datum in der Zielzone und der
 * Unterschied der beiden Zonen.
 * @param {number} tzFrom @param {number} tzTo @param {string} time @param {string} date
 * @returns {{ time: string|null, date: string|null, diffHours: number|null }}
 */
export function convertTimezone(tzFrom, tzTo, time, date) {
  const input = utcFromInput(tzFrom, time, date);
  const toTz = TIMEZONES[tzTo]?.tz;
  if (!input || !toTz) return { time: null, date: null, diffHours: null };
  const out = zonedParts(toTz, input.utc);
  const diff = tzOffsetMinutes(toTz, input.utc) - input.fromOffset;
  return { time: out.time, date: out.date, diffHours: diff / 60 };
}
