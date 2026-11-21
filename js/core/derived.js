/**
 * Ableitungen im Model (`derived`): Namen, Zugriffsobjekt `d` und die Auswertung
 * ohne gemountetes Viewmodel.
 * @module core/derived
 */
import { schemaOf } from './model.js';

/**
 * Die Namen der Ableitungen einer Model-Klasse in Deklarationsreihenfolge.
 * @param {any} Model Klasse aus `defineModel`
 * @returns {string[]}
 */
export function derivedNames(Model) {
  return Object.keys(schemaOf(Model)?.derived ?? {});
}

/**
 * Eingefrorenes Objekt mit einem Getter je Name: so liest eine Ableitung eine andere.
 * @param {string[]} names
 * @param {(name: string) => any} get liefert den Wert zu einem Namen
 * @returns {Readonly<Record<string, any>>}
 */
export function derivedAccessor(names, get) {
  const d = {};
  for (const name of names) Object.defineProperty(d, name, { get: () => get(name), enumerable: true });
  return Object.freeze(d);
}

/** Ersatz-Übersetzer, wenn der Aufrufer keinen `t` liefert. */
const noT = () => { throw new Error('derived: t not available'); };

/**
 * Lesefunktion über die Ableitungen eines Models mit gemeinsamem Memo: jeder
 * Eintrag läuft höchstens einmal je Leser, auch wenn mehrere andere ihn lesen.
 * Ein Fehler (auch ein Zyklus) wirft bei jedem Lesen dieses Eintrags erneut.
 * @param {any} model Instanz aus `defineModel`
 * @param {import('./source-reader.js').Source} src Leser fremder Instanzen; geht unverändert als erstes Argument an jeden Eintrag
 * @param {(key: string, params?: object) => string} [t] Übersetzer; geht als drittes Argument an jeden Eintrag, ohne `t` wirft der Ersatz
 * @returns {(name: string) => any}
 */
export function derivedReader(model, src, t = noT) {
  const defs = schemaOf(model)?.derived ?? {};
  /** @type {Map<string, { value?: any, error?: string }>} */
  const memo = new Map();
  /** @type {string[]} */
  const stack = [];
  /** @param {string} name */
  const read = (name) => {
    const hit = memo.get(name);
    if (hit) {
      if ('error' in hit) throw new Error(hit.error);
      return hit.value;
    }
    const at = stack.indexOf(name);
    if (at !== -1) throw new Error(`derived cycle: ${[...stack.slice(at), name].join(' → ')}`);
    stack.push(name);
    try {
      const value = defs[name].call(model, src, d, t);
      memo.set(name, { value });
      return value;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      memo.set(name, { error });
      throw new Error(error);
    } finally {
      stack.pop();
    }
  };
  const d = derivedAccessor(Object.keys(defs), read);
  return read;
}

/**
 * Wertet Ableitungen eines Models ohne Mount aus. Jeder Eintrag läuft höchstens einmal je Aufruf,
 * ein Fehler (auch ein Zyklus) wird zu `{ error }` und pflanzt sich in lesende Einträge fort.
 * @param {any} model Instanz aus `defineModel`
 * @param {import('./source-reader.js').Source} src Leser fremder Instanzen; geht unverändert als erstes Argument an jeden Eintrag
 * @param {string[]} [names] nur diese Einträge (Verkettungen werden bei Bedarf mit ausgewertet)
 * @param {(key: string, params?: object) => string} [t] Übersetzer; geht als drittes Argument an jeden Eintrag
 * @returns {Record<string, any>}
 * @throws {Error} `unknown derived: <name>`, wenn `names` einen Namen ohne Eintrag nennt
 */
export function evaluateDerived(model, src, names = derivedNames(model.constructor), t) {
  const defs = schemaOf(model)?.derived ?? {};
  for (const name of names) if (!Object.hasOwn(defs, name)) throw new Error(`unknown derived: ${name}`);
  const read = derivedReader(model, src, t);
  const out = {};
  for (const name of names) {
    try { out[name] = read(name); } catch (err) { out[name] = { error: /** @type {Error} */ (err).message }; }
  }
  return out;
}
