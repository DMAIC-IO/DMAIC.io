/**
 * D.Mike — Process Map: Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js (das Schema darf sich ändern, die Migration nicht).
 */

/** Wertarten im Formatstand 1.0. */
const VALUE_TYPES_1_0 = ['va', 'bnva', 'nva'];
/** Input-Typen im Formatstand 1.0. */
const INPUT_TYPES_1_0 = ['param', 'noise'];

/** @param {unknown} v @returns {string} der Text, sonst leer */
function str(v) {
  return typeof v === 'string' ? v : '';
}

/** @param {unknown} v @returns {v is Record<string, any>} ein Objekt, keine Liste */
function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** @param {unknown} v @returns {Record<string, any>[]} die Objekte einer Liste, sonst leer */
function objects(v) {
  return Array.isArray(v) ? v.filter(isObject) : [];
}

/**
 * Eine vorhandene id bleibt unverändert; fehlt sie, gilt `fallback`, bei Kollision mit `taken` um `_` ergänzt
 * und in `taken` eingetragen.
 * @param {unknown} id @param {string} fallback @param {Set<string>} taken @returns {string}
 */
function idOrFallback(id, fallback, taken) {
  if (typeof id === 'string' && id !== '') return id;
  let out = fallback;
  while (taken.has(out)) out += '_';
  taken.add(out);
  return out;
}

/** Alle vorhandenen ids der Altform (Schritte, Unterschritte, IO, Loop-Schritte). @param {Record<string, any>[]} steps @returns {Set<string>} */
function takenIds(steps) {
  const taken = new Set();
  const add = (/** @type {any} */ x) => { if (typeof x?.id === 'string' && x.id !== '') taken.add(x.id); };
  for (const s of steps) {
    add(s);
    for (const key of ['substeps', 'inputs', 'outputs']) objects(s[key]).forEach(add);
    if (isObject(s.loop)) objects(s.loop.steps).forEach(add);
  }
  return taken;
}

/**
 * '0→1.0': Altstände ohne `_schema`. Nicht-Objekte in den Listen entfallen;
 * vorhandene ids bleiben, fehlende entstehen fest aus der Position
 * (`s0m<i>`, `ss0m<i>_<k>`, `io0m<i>_<k>`, `o0m<i>_<k>`, `ls0m<i>_<k>`, bei
 * Kollision mit `_` ergänzt). Texte werden Text oder leer; `valueType` und
 * `inputType` außerhalb ihrer Liste werden `null`, `inputType` an Outputs
 * entfällt. Ein Loop-Objekt wird normalisiert; ein anderer wahrer Wert wird
 * wie in der Altform ein leerer Loop, ein falscher `null`. `expanded: true`
 * wandert als id nach `expanded` (Ansichtsfeld). Unbekannte Schlüssel
 * entfallen. Ungültige Loop-Ziele heilt die Invariante `loopTargetBefore`.
 * @param {Record<string, any>} json Kopie des gespeicherten Zustands
 * @returns {{ steps: object[], expanded: string[] }}
 */
export function from0(json) {
  const source = objects(json.steps);
  const taken = takenIds(source);
  const steps = [];
  const expanded = [];
  source.forEach((raw, i) => {
    const id = idOrFallback(raw.id, `s0m${i}`, taken);
    const loop = raw.loop;
    steps.push({
      id,
      title: str(raw.title),
      description: str(raw.description),
      valueType: VALUE_TYPES_1_0.includes(raw.valueType) ? raw.valueType : null,
      inputs: objects(raw.inputs).map((io, k) => ({
        id: idOrFallback(io.id, `io0m${i}_${k}`, taken),
        name: str(io.name),
        inputType: INPUT_TYPES_1_0.includes(io.inputType) ? io.inputType : null,
      })),
      outputs: objects(raw.outputs).map((io, k) => ({
        id: idOrFallback(io.id, `o0m${i}_${k}`, taken),
        name: str(io.name),
      })),
      substeps: objects(raw.substeps).map((ss, k) => ({
        id: idOrFallback(ss.id, `ss0m${i}_${k}`, taken),
        title: str(ss.title),
      })),
      loop: loop ? {
        targetStepId: isObject(loop) && typeof loop.targetStepId === 'string' && loop.targetStepId !== ''
          ? loop.targetStepId : null,
        condition: isObject(loop) ? str(loop.condition) : '',
        steps: isObject(loop)
          ? objects(loop.steps).map((ls, k) => ({ id: idOrFallback(ls.id, `ls0m${i}_${k}`, taken), title: str(ls.title) }))
          : [],
      } : null,
    });
    if (raw.expanded === true && !expanded.includes(id)) expanded.push(id);
  });
  return { steps, expanded };
}
