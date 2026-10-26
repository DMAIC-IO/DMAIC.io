/**
 * D.Mike — Core-Handles aus der Reaktivität heraushalten.
 *
 * Alpine (`@alpinejs/csp`, intern `@vue/reactivity`) macht alles, was in den
 * Daten eines Viewmodels landet, reaktiv: liest das Modul `this._chart`, kommt
 * ein Proxy zurück, nicht das Objekt, das die Fabrik geliefert hat. Für
 * Laufzeit-Handles (Diagramme, DataGrids, Spalten-/Datensatz-Picker) ist das
 * doppelt falsch:
 * - Identität: Core-Code führt die Handles in Set/Map/WeakMap. Ein Proxy
 *   verfehlt den Eintrag des Rohobjekts — `chartManager.destroy(proxy)` ließ
 *   das Diagramm für die ganze Sitzung im Set (Bug 14).
 * - Kosten: Methoden laufen mit `this` = Proxy, jeder interne Zugriff wird
 *   verfolgt, obwohl kein Template diese Zustände liest.
 *
 * `@vue/reactivity` überspringt Objekte mit gesetztem `__v_skip`
 * (`getTargetType` → INVALID, `markRaw` setzt dieselbe Eigenschaft), und
 * Alpines `initInterceptors` steigt nicht in sie hinab. Deshalb hier ohne
 * Alpine-Import: die Eigenschaft wird direkt gesetzt, nicht aufzählbar (taucht
 * in Object.keys/JSON nicht auf) und nicht beschreibbar.
 *
 * Regel: jede Core-Fabrik, die ein Laufzeit-Handle an Module zurückgibt,
 * markiert ihre Rückgabe mit `nonReactive` — aus den beiden Gründen oben.
 */

/**
 * Markiert ein Objekt als nicht reaktiv und gibt es unverändert zurück.
 * Mehrfaches Markieren ist harmlos; null/undefined und nicht erweiterbare
 * Objekte kommen unverändert zurück.
 * @template T
 * @param {T} obj
 * @returns {T}
 */
export function nonReactive(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Object.prototype.hasOwnProperty.call(obj, '__v_skip') || !Object.isExtensible(obj)) return obj;
  Object.defineProperty(obj, '__v_skip', { value: true, enumerable: false, writable: false, configurable: false });
  return obj;
}
