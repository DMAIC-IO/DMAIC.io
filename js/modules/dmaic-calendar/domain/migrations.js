/**
 * D.Mike — Projektkalender: Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js.
 */
import { uid } from '../../../core/uid.js';
import { isIsoDate } from '../../../core/local-date.js';
import { CYCLES, getPhaseIds } from '../../../core/cycles/cycles.js';

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
/** Ansichtswerte, die im Formatstand 0 neben `events` standen. */
const VIEW_KEYS_0 = ['viewMode', 'axisFrom', 'axisTo', 'dayFrom', 'dayTo'];
/** Fehlende Phase im Formatstand 0 — so las sie der alte Lader. */
const PHASE_0 = 'define';

/**
 * '0→1.1': Altstände ohne `_schema` — gleiche Feldnamen. Repariert, was der
 * alte Lader still hinnahm: Termine ohne gültiges Datum fallen weg, ein
 * leerer Titel wird `—`, eine Zeit außerhalb des 5-Minuten-Rasters wird
 * abgerundet, eine unbekannte Phase wird `define`. Spiegeltermine der
 * Aufgabenliste (`source: 'todo'`) fallen weg: der Kalender liest die
 * Aufgaben heute aus der Aufgabenliste.
 * @param {object} json Kopie des gespeicherten Zustands
 * @returns {object}
 */
export function from0(json) {
  const known = new Set(Object.keys(CYCLES).flatMap((c) => getPhaseIds(c)));
  const events = (Array.isArray(json.events) ? json.events : [])
    .filter((e) => e !== null && typeof e === 'object' && isIsoDate(e.date) && e.source !== 'todo')
    .map((e) => {
      const m = TIME.exec(typeof e.time === 'string' ? e.time : '');
      const minutes = m ? Number(m[1]) * 60 + Number(m[2]) : 9 * 60;
      const snapped = minutes - (minutes % 5);
      return {
        id: typeof e.id === 'string' && e.id !== '' ? e.id : uid(),
        title: typeof e.title === 'string' && e.title.trim() !== '' ? e.title.trim() : '—',
        date: e.date,
        time: `${String(Math.floor(snapped / 60)).padStart(2, '0')}:${String(snapped % 60).padStart(2, '0')}`,
        duration: Number.isInteger(e.duration) && e.duration >= 5 ? e.duration : 60,
        desc: typeof e.desc === 'string' ? e.desc : '',
        phase: typeof e.phase === 'string' && known.has(e.phase) ? e.phase : PHASE_0,
      };
    });
  const out = { events };
  for (const k of VIEW_KEYS_0) if (Object.hasOwn(json, k)) out[k] = json[k];
  return out;
}

/**
 * '1.0→1.1': Spiegeltermine der Aufgabenliste (`source: 'todo'`) fallen weg;
 * bei den übrigen Terminen entfällt der Schlüssel `source`.
 * @param {Record<string, any>} json
 * @returns {Record<string, any>}
 */
export function from10(json) {
  if (!Array.isArray(json.events)) return json;
  return {
    ...json,
    events: json.events
      .filter((e) => !(e && typeof e === 'object' && e.source === 'todo'))
      .map((e) => {
        if (!e || typeof e !== 'object' || !Object.hasOwn(e, 'source')) return e;
        const { source: _source, ...rest } = e;
        return rest;
      }),
  };
}
