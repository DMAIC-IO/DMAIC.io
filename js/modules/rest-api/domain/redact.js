/**
 * D.Mike — REST API: Lese-/Export-Umformung (Deskriptor-Haken `redact`).
 *
 * Der Kern (`core/redact.js`) ruft die Funktion für Agent-`read()` und
 * Projekt-Export, nie beim Speichern: geheime Header-Werte erscheinen dort nur
 * als Platzhalter (`redactEndpoints`, `domain/headers.js`). Sie bekommt den
 * gespeicherten Stand (auch einen der Altform) oder die Lesefläche und nimmt
 * fehlende oder fremd geformte Teile hin: ein Endpunkt, dessen Header nicht
 * die Form `{ key, value }` mit Texten haben, wird je Header geprüft, ein
 * unlesbarer Header bleibt, wie er ist.
 */
import { redactEndpoints, redactHeaders } from './headers.js';

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** @param {unknown} h @returns {h is { key: string, value: string }} */
const isHeader = (h) => isObject(h) && typeof h.key === 'string' && typeof h.value === 'string';

/**
 * Ein Endpunkt mit maskierten Headern; ohne Header-Liste derselbe Wert.
 * @param {unknown} ep
 * @returns {unknown}
 */
function redactEndpoint(ep) {
  if (!isObject(ep) || !Array.isArray(ep.headers)) return ep;
  if (ep.headers.every(isHeader)) return redactEndpoints([/** @type {{ headers: { key: string, value: string }[] }} */ (ep)])[0];
  return { ...ep, headers: ep.headers.map((h) => (isHeader(h) ? redactHeaders([h])[0] : h)) };
}

/**
 * Der Stand bzw. die Lesefläche mit maskierten Header-Werten. Immer eine
 * Kopie, wenn `endpoints` eine Liste ist; sonst derselbe Wert.
 * @param {any} state
 * @returns {any}
 */
export default function redact(state) {
  if (!isObject(state) || !Array.isArray(state.endpoints)) return state;
  return { ...state, endpoints: state.endpoints.map(redactEndpoint) };
}
