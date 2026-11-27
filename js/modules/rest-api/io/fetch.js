/**
 * D.Mike — REST API: der GET-Abruf eines Endpunkts.
 *
 * `buildRequest` und `readResponse` sind rein; `fetchEndpoint` ruft `fetch`
 * (für Tests austauschbar). Antworten mit 4xx/5xx sind Antworten
 * (`ok: false`), kein Fehler. Jeder andere Fehler (Netz, CSP, CORS, ungültiges
 * JSON) wird zur Antwort mit Status 0 und der Fehlermeldung als Inhalt; nur
 * ein Abbruch (`AbortError`) wird weitergeworfen.
 */

/**
 * @typedef {object} Response
 * @property {number} status HTTP-Status, 0 bei Netz- oder Lesefehler
 * @property {string} statusText Statustext, `'Error'` bei Netz- oder Lesefehler
 * @property {boolean} ok ob der Status 200–299 ist
 * @property {string} body Inhalt; JSON mit zwei Leerzeichen eingerückt, sonst Text
 */

/**
 * Adresse und Optionen des Abrufs: GET, Kopfzeilen mit getrimmtem, nicht
 * leerem Namen (Wert unverändert).
 * @param {{ url: string, headers: ReadonlyArray<{ key: string, value: string }> }} endpoint
 * @param {AbortSignal} [signal]
 * @returns {{ url: string, init: RequestInit }}
 */
export function buildRequest(endpoint, signal) {
  /** @type {RequestInit} */
  const init = { method: 'GET' };
  if (endpoint.headers.length > 0) {
    /** @type {Record<string, string>} */
    const headers = {};
    for (const { key, value } of endpoint.headers) {
      if (key.trim()) headers[key.trim()] = value;
    }
    init.headers = headers;
  }
  if (signal) init.signal = signal;
  return { url: endpoint.url, init };
}

/**
 * Die Antwort lesen: Inhaltstyp mit `json` → eingerücktes JSON, sonst Text.
 * @param {{ status: number, statusText: string, ok: boolean, headers: { get(name: string): string|null },
 *   json(): Promise<any>, text(): Promise<string> }} res
 * @returns {Promise<Response>}
 */
export async function readResponse(res) {
  const type = res.headers.get('content-type') || '';
  const body = type.includes('json') ? JSON.stringify(await res.json(), null, 2) : await res.text();
  return { status: res.status, statusText: res.statusText, ok: res.ok, body };
}

/**
 * Antwort bei einem Fehler außer dem Abbruch.
 * @param {unknown} err @returns {Response}
 */
function errorResponse(err) {
  const body = err instanceof Error ? err.message : String(err);
  return { status: 0, statusText: 'Error', ok: false, body };
}

/**
 * Einen Endpunkt abrufen.
 * @param {{ url: string, headers: ReadonlyArray<{ key: string, value: string }> }} endpoint
 * @param {{ signal?: AbortSignal, fetchImpl?: (url: string, init: RequestInit) => Promise<any> }} [opts]
 * @returns {Promise<Response>}
 * @throws {Error} nur beim Abbruch (`name === 'AbortError'`)
 */
export async function fetchEndpoint(endpoint, { signal, fetchImpl = (url, init) => fetch(url, init) } = {}) {
  const { url, init } = buildRequest(endpoint, signal);
  try {
    return await readResponse(await fetchImpl(url, init));
  } catch (err) {
    if (/** @type {any} */ (err)?.name === 'AbortError') throw err;
    return errorResponse(err);
  }
}
