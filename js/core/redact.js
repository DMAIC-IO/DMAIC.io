/**
 * D.Mike — Lese-/Export-Umformung je Modul (redact.js)
 *
 * Ein Modul kann im Deskriptor (`module.js`) einen Haken `redact` erklären:
 * `redact: () => import('./domain/<name>.js')`, dessen Default-Export eine
 * reine Funktion `(state) => state` ist. Der Kern wendet sie auf jeden Weg an,
 * der Modulzustände nach außen gibt (Agent-`read()`, Projekt-Export, Bug-Report),
 * nie auf Speichern, Verlauf oder das eigene Viewmodel. So bleiben etwa
 * Zugangsdaten im Model und im Browser-Speicher, erscheinen außen aber nur als
 * Platzhalter. Die Funktion bekommt den gespeicherten Stand bzw. die
 * Lesefläche (dieselben Feldnamen), muss fehlende Felder hinnehmen, darf die
 * Eingabe nicht verändern und gibt eine Kopie zurück.
 *
 * Hier stehen nur die reinen Helfer; das Laden übernimmt die ModuleRegistry
 * (`loadRedactor`, `loadRedactors`, `redactorOf`).
 */

/**
 * @typedef {(state: any) => any} Redactor
 * @typedef {(moduleId: string) => Redactor|null} RedactorLookup  wirft, wenn ein erklärter Haken nicht geladen ist
 */

/**
 * Instanz → Modul aus dem Phasenbaum eines Projekts.
 * @param {Record<string, unknown>|undefined|null} phases
 * @returns {Map<string, string>}
 */
export function instanceModuleIds(phases) {
  const out = new Map();
  for (const items of Object.values(phases ?? {})) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (item && typeof item.instanceId === 'string' && typeof item.moduleId === 'string') out.set(item.instanceId, item.moduleId);
    }
  }
  return out;
}

/**
 * Ein Zustand nach dem Haken seines Moduls; ohne Haken derselbe Wert.
 * @param {string|undefined} moduleId
 * @param {any} state
 * @param {RedactorLookup} redactorOf
 * @returns {any}
 */
export function redactState(moduleId, state, redactorOf) {
  if (!moduleId || state === null || typeof state !== 'object') return state;
  const fn = redactorOf(moduleId);
  return fn ? fn(state) : state;
}

/**
 * Alle Modulzustände eines Projekts für den Export. Das Modul einer Instanz
 * kommt aus `phases`, sonst aus `_schema.name` des Stands (Zielform).
 * Liefert ein neues Objekt; Stände ohne Haken bleiben dieselben Werte.
 * @param {Record<string, any>|undefined|null} moduleStates
 * @param {Record<string, unknown>|undefined|null} phases
 * @param {RedactorLookup} redactorOf
 * @returns {Record<string, any>}
 */
export function redactModuleStates(moduleStates, phases, redactorOf) {
  const ids = instanceModuleIds(phases);
  /** @type {Record<string, any>} */
  const out = {};
  for (const [instanceId, state] of Object.entries(moduleStates ?? {})) {
    const moduleId = ids.get(instanceId) ?? state?._schema?.name;
    out[instanceId] = redactState(moduleId, state, redactorOf);
  }
  return out;
}
