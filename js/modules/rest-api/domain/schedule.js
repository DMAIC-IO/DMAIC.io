/**
 * D.Mike — REST API: Zeitplan als reine Funktionen.
 *
 * Ein Endpunkt mit eingeschaltetem Zeitplan und gesetzter URL wird im
 * Abstand `intervalValue` × Einheit abgerufen. Die Ansicht hält die
 * Zeitgeber; hier steht nur, wann einer laufen soll, wie lang sein Abstand
 * ist und was sich zwischen zwei Ständen der Endpunktliste geändert hat.
 * Ohne DOM, ohne Zeitgeber, ohne i18n.
 */

/** Die Einheiten des Abstands, in Anzeigereihenfolge. */
export const SCHEDULE_UNITS = Object.freeze(['minutes', 'hours']);

/** Die Schreibmodi der Spaltenzuordnungen, in Anzeigereihenfolge. */
export const WRITE_MODES = Object.freeze(['replace', 'append', 'prepend']);

/** Millisekunden je Einheit. */
const UNIT_MS = Object.freeze({ minutes: 60_000, hours: 3_600_000 });

/**
 * @typedef {object} Schedule
 * @property {boolean} enabled
 * @property {number} intervalValue
 * @property {'minutes'|'hours'} intervalUnit
 */

/**
 * @typedef {object} ScheduleEntry
 * @property {string} id die id des Endpunkts
 * @property {number} ms der Abstand in Millisekunden
 */

/**
 * Der Abstand eines Zeitplans in Millisekunden.
 * @param {Schedule} schedule
 * @returns {number}
 */
export function intervalMs(schedule) {
  return schedule.intervalValue * UNIT_MS[schedule.intervalUnit];
}

/**
 * Zeitpunkt des nächsten Abrufs: ein Abstand nach dem letzten Abruf, ohne
 * bisherigen Abruf ein Abstand nach dem Start des Zeitgebers.
 * @param {number|null} lastAt letzter Abruf (ms seit Epoche) oder null
 * @param {number} startedAt Start des Zeitgebers (ms seit Epoche)
 * @param {Schedule} schedule
 * @returns {number}
 */
export function nextRunAt(lastAt, startedAt, schedule) {
  return (lastAt ?? startedAt) + intervalMs(schedule);
}

/**
 * Ob für einen Endpunkt ein Zeitgeber laufen soll: Zeitplan an und URL gesetzt.
 * @param {{ url: string, schedule: Schedule }} ep
 * @returns {boolean}
 */
export function wantsTimer(ep) {
  return ep.schedule.enabled && ep.url !== '';
}

/**
 * Die Zeitgeber, die laufen sollen, je Endpunkt mit Abstand.
 * @param {ReadonlyArray<{ id: string, url: string, schedule: Schedule }>} endpoints
 * @returns {ScheduleEntry[]}
 */
export function scheduleEntries(endpoints) {
  return endpoints.filter(wantsTimer).map((ep) => ({ id: ep.id, ms: intervalMs(ep.schedule) }));
}

/**
 * Abgleich laufender Zeitgeber mit den gewünschten: was zu starten, zu
 * stoppen und mit neuem Abstand neu zu starten ist. Eine geänderte URL
 * ändert nichts (der Abruf liest sie frisch).
 * @param {ReadonlyMap<string, number>} running id → Abstand der laufenden Zeitgeber
 * @param {ReadonlyArray<ScheduleEntry>} wanted
 * @returns {{ start: ScheduleEntry[], stop: string[], restart: ScheduleEntry[] }}
 */
export function diffSchedules(running, wanted) {
  const wantedIds = new Set(wanted.map((w) => w.id));
  return {
    start: wanted.filter((w) => !running.has(w.id)),
    stop: [...running.keys()].filter((id) => !wantedIds.has(id)),
    restart: wanted.filter((w) => running.has(w.id) && running.get(w.id) !== w.ms),
  };
}

/**
 * Endpunkte, deren Schalter `enabled` sich gegenüber dem vorigen Stand
 * geändert hat (nur solche, die es in beiden Ständen gibt). Für die Hinweise
 * „Zeitplan gestartet/gestoppt“.
 * @param {ReadonlyMap<string, boolean>} before id → enabled des vorigen Stands
 * @param {ReadonlyArray<{ id: string, schedule: Schedule }>} endpoints
 * @returns {Array<{ id: string, enabled: boolean }>}
 */
export function toggledSchedules(before, endpoints) {
  return endpoints
    .filter((ep) => before.has(ep.id) && before.get(ep.id) !== ep.schedule.enabled)
    .map((ep) => ({ id: ep.id, enabled: ep.schedule.enabled }));
}

/**
 * Der Anzeigename eines Endpunkts für Rückfrage und Hinweise: Name, sonst
 * URL, sonst der Ersatztext.
 * @param {{ name: string, url: string }} ep
 * @param {string} unnamed Ersatztext ohne Name und URL
 * @returns {string}
 */
export function endpointLabel(ep, unnamed) {
  return ep.name || ep.url || unnamed;
}
