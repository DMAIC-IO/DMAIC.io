/**
 * D.Mike — REST API: geheime Header-Werte.
 *
 * Zugangsdaten (Tokens, Schlüssel, Cookies) stehen in Header-Werten. Das
 * Model hält sie im Klartext, damit der Abruf sie senden kann; die Lesefläche
 * des Agenten und der Projekt-Export zeigen sie nur als Platzhalter `MASK`.
 * Ein Platzhalter ist nie ein gültiger Wert: kommt er mit einem importierten
 * Projekt zurück, bleibt das Feld leer und das Token muss neu eingetragen
 * werden. Geheim ist ein Header, dessen Name (ohne Rand, ohne Groß/klein)
 * einer der festen Namen ist oder `token`, `secret`, `key` oder `auth` enthält.
 */

/** Der Platzhalter für einen maskierten Wert. */
export const MASK = '••••';

/** Header-Namen, die immer als geheim gelten (klein geschrieben). */
export const SECRET_HEADER_NAMES = Object.freeze(['authorization', 'proxy-authorization', 'cookie', 'x-api-key']);

/** Namensteile, die einen Header als geheim kennzeichnen (klein geschrieben). */
export const SECRET_NAME_PARTS = Object.freeze(['token', 'secret', 'key', 'auth']);

/**
 * Ob ein Header nach seinem Namen Zugangsdaten trägt.
 * @param {string} name
 * @returns {boolean}
 */
export function isSecretHeader(name) {
  const n = name.trim().toLowerCase();
  if (n === '') return false;
  return SECRET_HEADER_NAMES.includes(n) || SECRET_NAME_PARTS.some((p) => n.includes(p));
}

/**
 * Header für Lesen und Export: Werte geheimer Header (nicht leer) werden
 * `MASK`, alle anderen bleiben. Immer eine Kopie.
 * @param {ReadonlyArray<{ key: string, value: string }>} headers
 * @returns {Array<{ key: string, value: string }>}
 */
export function redactHeaders(headers) {
  return headers.map((h) => ({ key: h.key, value: isSecretHeader(h.key) && h.value !== '' ? MASK : h.value }));
}

/**
 * Endpunkte für Lesen und Export, je mit maskierten Headern. Immer eine Kopie
 * der Endpunkte; die übrigen Felder bleiben unverändert.
 * @template {{ headers: ReadonlyArray<{ key: string, value: string }> }} E
 * @param {ReadonlyArray<E>} endpoints
 * @returns {E[]}
 */
export function redactEndpoints(endpoints) {
  return endpoints.map((ep) => ({ ...ep, headers: redactHeaders(ep.headers) }));
}

/**
 * Ein gespeicherter Header-Wert ohne Platzhalter: `MASK` wird leer.
 * @param {string} value
 * @returns {string}
 */
export function unmaskedValue(value) {
  return value === MASK ? '' : value;
}
