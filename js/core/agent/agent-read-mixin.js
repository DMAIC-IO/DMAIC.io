/**
 * D.Mike — Lesezustand der Altform-Module (agent-read-mixin.js)
 *
 * Freigabe verlangt an jedem freigegebenen Viewmodel eine `read()`-Aktion,
 * die den vollständigen Lesezustand liefert. In der Zielform (`createModule`
 * mit `defineModel`) liefert sie der Kern aus dem Schema
 * (`agent-schema.js`). Die übrigen Altform-Module erklären ihre Lesefläche
 * über `@typedef {object} AgentRead` und schreiben ihr eigenes `read()`, das
 * `readAgentState()` hier aufruft.
 *
 * Das geteilte `agentReadMixin()` (`...agentReadMixin(module)` im
 * `data()`-Literal) ist mit seinem letzten Nutzer `process-map` entfallen;
 * der Dateiname bleibt, damit die Importe der Altform-Module gleich bleiben.
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
 * @throws {Error} wenn `options` kaputt ist (`rows: { from: 5, to: 2 }`) —
 *   siehe unten
 */
export function readAgentState(moduleId, snapshot, options) {
  const schema = AGENT_REGISTRY[moduleId]?.fields ?? {};
  const out = projectReadState(snapshot, schema, options ?? {});
  // Ein kaputter Bereich ist ein kaputter AUFRUF, kein Lesezustand.
  // `projectReadState` ist rein und kennt `i18n` nicht, es gibt die Meldung
  // deshalb als `{ $invalidCall }` zurück. Hier wird daraus ein Wurf: der
  // Fang-Punkt von `instance.call` (`agent-ops.js`) macht einen benannten
  // AXI-Fehler (`call_failed`) samt Meldung daraus — statt dass der Marker
  // beim Agenten als Daten ankommt. Einen EIGENEN Code trägt der Marker
  // nicht: der Code der Fläche entsteht genau hier am Fang-Punkt, ein
  // zweiter daneben wäre toter Inhalt (kein Konsument liest ihn).
  if (out && typeof out.$invalidCall === 'string') throw new Error(out.$invalidCall);
  return out;
}
