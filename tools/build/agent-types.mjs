/**
 * agent-types — die Typkarte der Agentenfläche
 * (js/core/agent/agent-types.generated.js).
 *
 * Aus der Agenten-Registry (`collectAgentData`) entsteht je Modul und Aktion
 * ein JSDoc-Typ für `instance.call` (Argumente als Tupel aus den Parametern)
 * und je Modul mit Model einer für `instance.set` (Felder aus
 * `domain/model.types.js`). `ModuleStack` fasst alles zusammen; ein Modul,
 * das `ctx.instances.interact` einen Stapel mit falschem Methodennamen oder
 * Argumenttyp gibt, fällt so in `npm run typecheck` auf.
 *
 * Aufgenommen werden die Aktionen der Altform und der Zielform nur
 * `target: 'model'` und `read`: Viewmodel-Kommandos und `asyncTask`s sind
 * für Module nicht erreichbar.
 *
 * Typtexte der Altform sind JSDoc. Übernommen werden Literale, `string`,
 * `number`, `boolean`, `object`, `null`, `any`, Arrays und Unions daraus;
 * alles andere (fremde Typedef-Namen, Objektliterale, `unknown`) wird `any`.
 */

/** Einfache Typen, die in der erzeugten Datei ohne Import gelten. */
const PRIMITIVES = new Set(['string', 'number', 'boolean', 'object', 'null', 'undefined', 'any', 'true', 'false']);

/** Der Anfang eines Importausdrucks; zusammengesetzt, damit die Grenzprüfung ihn nicht als Import liest. */
const IMPORT = ['im', 'port'].join('');

/**
 * Teilt `text` an `sep` auf oberster Ebene (nicht in Klammern).
 * @param {string} text @param {string} sep
 * @returns {string[]}
 */
function splitTop(text, sep) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if ('([{<'.includes(c)) depth++;
    else if (')]}>'.includes(c)) depth--;
    else if (c === sep && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out.map((s) => s.trim());
}

/** `T[]`, eine Union in Klammern. @param {string} inner @returns {string} */
const arrayOf = (inner) => (splitTop(inner, '|').length > 1 ? `(${inner})[]` : `${inner}[]`);

/**
 * Ein Glied ohne Union auflösen.
 * @param {string} t
 * @returns {string|null} null, wenn nicht auflösbar
 */
function resolvePart(t) {
  if (PRIMITIVES.has(t)) return t;
  if (/^'[^'\\]*'$/.test(t)) return t;
  if (/^"[^"\\]*"$/.test(t)) return `'${t.slice(1, -1).replace(/'/g, "\\'")}'`;
  if (/^-?\d+(\.\d+)?$/.test(t)) return t;
  if (t.startsWith('?')) {
    const inner = resolveUnion(t.slice(1).trim());
    return inner === null ? null : `${inner}|null`;
  }
  if (t.endsWith('[]')) {
    const inner = resolveUnion(t.slice(0, -2).trim());
    return inner === null ? null : `${arrayOf(inner)}`;
  }
  const array = /^Array<(.+)>$/.exec(t);
  if (array) {
    const inner = resolveUnion(array[1].trim());
    return inner === null ? null : `${arrayOf(inner)}`;
  }
  if (t.startsWith('(') && t.endsWith(')')) {
    const inner = resolveUnion(t.slice(1, -1).trim());
    return inner === null ? null : `(${inner})`;
  }
  return null;
}

/**
 * Eine Union auflösen: nur wenn jedes Glied auflösbar ist.
 * @param {string} t
 * @returns {string|null}
 */
function resolveUnion(t) {
  const parts = splitTop(t, '|').map(resolvePart);
  return parts.some((x) => x === null) ? null : parts.join('|');
}

/**
 * Ein JSDoc-Typtext als Typ der Typkarte.
 * @param {string|undefined} text
 * @returns {string} der Typ oder `any`
 */
export function resolveTypeText(text) {
  if (typeof text !== 'string' || text.trim() === '') return 'any';
  return resolveUnion(text.trim()) ?? 'any';
}

/** `msa-typ2` → `msaTyp2`. @param {string} id @returns {string} */
const camel = (id) => id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
/** @param {string} s @returns {string} */
const pascal = (s) => s.charAt(0).toUpperCase() + s.slice(1);
/** Typedef-Name aus Modul und Aktion (`factors.addFactor` → `factors_addFactor`). */
const callName = (id, action) => `ModuleCall_${camel(id)}_${action.replace(/[^\w$]/g, '_')}`;
/** Ein Zeichenkettenliteral. @param {string} s @returns {string} */
const lit = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/**
 * Das Argument-Tupel einer Altform-Aktion. Ein optionaler Parameter vor einem
 * Pflichtparameter bleibt Pflicht im Tupel (`|undefined`), sonst wäre das Tupel ungültig.
 * @param {Array<{ type?: string, optional?: boolean }>} params
 * @returns {string}
 */
function legacyTuple(params) {
  const parts = params.map((prm, i) => {
    const type = resolveTypeText(prm.type);
    if (!prm.optional) return type;
    const tailOptional = params.slice(i + 1).every((q) => q.optional);
    return tailOptional ? `${type}?` : `${type}|undefined`;
  });
  return `[${parts.join(', ')}]`;
}

/**
 * Der Importausdruck für `domain/model.types.js` eines Moduls, aus Sicht von
 * `js/core/agent/`.
 * @param {string} id
 * @returns {string}
 */
function modelTypes(id) {
  return `${IMPORT}('../../modules/${id}/domain/model.types.js')`;
}

/** @param {string} name @param {string} type @returns {string[]} */
const typedef = (name, type) => ['/**', ` * @typedef {${type}} ${name}`, ' */', ''];

/**
 * Den Inhalt von `js/core/agent/agent-types.generated.js` erzeugen.
 * @param {Record<string, { available?: boolean, schema?: boolean, actions?: Record<string, object> }>} modules
 *   Registry aus `collectAgentData`
 * @param {{ modelNames?: Record<string, string> }} [options] Name der Model-Klasse je
 *   Modul mit Schema (Vorgabe `State`), bestimmt `<Name>Fields`
 * @returns {string}
 */
export function renderAgentTypes(modules, { modelNames = {} } = {}) {
  const ids = Object.keys(modules).sort();
  const lines = [
    '// AUTO-GENERATED by tools/build/agent-types.mjs — do not edit.',
    '// Typkarte der Agentenfläche: Stapel für ctx.instances.interact, geprüft mit tsc --checkJs.',
    '',
    ...typedef('InstanceRef', 'string | { $from: string, path: string }'),
  ];
  const members = [];
  for (const id of ids) {
    const entry = modules[id];
    if (!entry?.available) continue;
    const mod = lit(id);
    for (const [action, def] of Object.entries(entry.actions ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
      let args;
      if (def.target === 'model') args = `[${modelTypes(id)}.${pascal(def.keysOf ?? action)}Command]`;
      else if (def.target === undefined) args = legacyTuple(def.params ?? []);
      else continue;
      const name = callName(id, action);
      lines.push(...typedef(name, `{ op: 'instance.call', id?: string, module: ${mod}, instance: InstanceRef, method: ${lit(action)}, args?: ${args} }`));
      members.push(name);
    }
    if (entry.schema) {
      const name = `ModuleSet_${camel(id)}`;
      const fields = `${modelTypes(id)}.${modelNames[id] ?? 'State'}Fields`;
      lines.push(...typedef(name, `{ op: 'instance.set', id?: string, module: ${mod}, instance: InstanceRef, values: Partial<${fields}> }`));
      members.push(name);
    }
  }
  const add = `{ op: 'module.add', id?: string, module: ${ids.map(lit).join('|') || 'never'}, phase?: string }`;
  const remove = "{ op: 'module.remove', id?: string, instance: string }";
  lines.push(...typedef('ModuleAction', [...members, add, remove].join(' | ')));
  lines.push(...typedef('ModuleStack', 'ModuleAction[]'));
  lines.push('export {};', '');
  return lines.join('\n');
}
