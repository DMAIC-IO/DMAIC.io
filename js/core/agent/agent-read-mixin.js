/**
 * D.Mike — Das geteilte read() der Agentenfläche (agent-read-mixin.js)
 *
 * Spec §9 Migrationsschritt 3 verlangt an jedem freigegebenen Viewmodel eine
 * `read()`-Aktion, die den vollständigen Lesezustand liefert. Für jedes Modul,
 * dessen Lesefläche die persistierte Model-Form IST (Spec §8), ist dieses
 * `read()` wortgleich — es steht deshalb genau hier und wird per Spread in die
 * `data()`-Funktion geholt:
 *
 *   data(module, _t) {
 *     return {
 *       ...agentReadMixin(module),
 *       …
 *     };
 *   }
 *
 * Der Generator löst den Spread auf (`tools/build/agent-resolve.mjs`) und liest
 * Marke und Schema am Mitglied dieser Datei. Eine Kopie pro Modul wäre 72-mal
 * dieselbe Methode — und 72 Gelegenheiten, sie unterschiedlich falsch zu
 * schreiben.
 *
 * Module, deren Lesefläche NICHT die persistierte Form ist, deklarieren sie
 * über `@typedef {object} AgentRead` und schreiben ihr eigenes `read()`; sie
 * benutzen dann `readAgentState()` direkt und spreaden das Mixin nicht.
 *
 * Rein: kein DOM, kein `window`.
 */
import { projectReadState } from './agent-read.js';
import { AGENT_REGISTRY } from './agent-registry.generated.js';

/**
 * Projiziere eine Zustands-Momentaufnahme durch das Feldschema eines Moduls.
 *
 * @param {string} moduleId  Modul-Id, Schlüssel in der generierten Registry
 * @param {object} snapshot  der zu projizierende Zustand (plain object)
 * @param {{ fields?: string[], rows?: { from: number, to: number } }} [options]
 * @returns {object} die Projektion (Massenfelder als Umfangs-Deskriptor,
 *   solange sie nicht in `options.fields` genannt sind)
 */
export function readAgentState(moduleId, snapshot, options) {
  const schema = AGENT_REGISTRY[moduleId]?.fields ?? {};
  return projectReadState(snapshot, schema, options ?? {});
}

/**
 * Das geteilte `read()` für Module, deren Lesefläche die Model-Form ist.
 *
 * @param {{ id: string }} module  das Modulobjekt aus `createModule`
 * @returns {{ read: (options?: object) => object }}
 */
export function agentReadMixin(module) {
  return {
    /**
     * Den vollständigen Lesezustand dieser Instanz liefern.
     *
     * Ohne Parameter bleiben Massendaten draußen und erscheinen als
     * Umfangs-Deskriptor (`{ $bulk: true, rowCount, columns }`), damit ein
     * Agent gezielt nachfragen kann statt 5000 Zeilen durch sein
     * Kontextfenster zu schieben.
     *
     * @agent
     * @param {object} [options] `{ fields?: string[], rows?: { from: number, to: number } }`
     *   — `fields` nennt die Massenfelder, die vollständig geliefert werden
     *   sollen; `rows` schneidet jedes davon auf `[from, to)` zu.
     * @returns {object} der Lesezustand
     */
    read(options) {
      return readAgentState(module.id, this.model?.toJSON?.() ?? {}, options);
    },
  };
}
