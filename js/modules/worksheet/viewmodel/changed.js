/**
 * D.Mike — Arbeitsblatt: Ereignis `worksheet:dataChanged` (viewmodel/changed.js)
 *
 * Nach jeder Änderung des Models (auch Rückgängig, auch ein geladener
 * Fremdstand) und einmal beim Einhängen eines neuen oder migrierten Stands
 * sendet das Modul `worksheet:dataChanged { instanceId }`, zusammengefasst je
 * Frame. Ansichtskommandos senden nicht. Den Revisionszähler der Leser
 * (`core/source.js`) erhöht es sofort, nicht erst mit dem Ereignis: ein
 * `read()` gleich nach dem Kommando (auch im selben Agentenstapel) liest so
 * schon den neuen Stand.
 */
import { bumpWorksheetRevision } from '../../../core/source.js';

/**
 * Kommandos ohne eigenes `worksheet:dataChanged`: die Ansichtskommandos. Ein
 * Verlaufsschritt des Kerns ist kein Kommando; er führt Umkehr-Kommandos aus,
 * die selbst melden.
 */
const VIEW_ONLY = new Set(['switchSheet', 'gridView', 'exportAs', 'openFormulaEditor', 'suggestChart']);

/** Instanzen mit Änderung im laufenden Frame → ihr Bus. */
const pending = new Map();
let scheduled = false;

/** Die gesammelten Änderungen senden: je Instanz ein Ereignis. */
function flushChanged() {
  scheduled = false;
  const due = [...pending];
  pending.clear();
  for (const [instanceId, eventBus] of due) eventBus?.emit?.('worksheet:dataChanged', { instanceId });
}

/**
 * Nach einem Kommando des Models (auch Rückgängig, auch ein geladener
 * Fremdstand mit `name` null): sofort den Revisionszähler der Instanz,
 * `worksheet:dataChanged` im nächsten Frame, ohne DOM im nächsten Mikrotask. Mehrere Kommandos eines Frames ergeben ein
 * Ereignis je Instanz.
 * @param {string|null} name Kommando @param {{ instanceId: string, eventBus: any }} ctx
 * @returns {void}
 */
export function worksheetChanged(name, { instanceId, eventBus }) {
  if (name !== null && VIEW_ONLY.has(name)) return;
  bumpWorksheetRevision(instanceId);
  pending.set(instanceId, eventBus);
  if (scheduled) return;
  scheduled = true;
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flushChanged);
  else queueMicrotask(flushChanged);
}
