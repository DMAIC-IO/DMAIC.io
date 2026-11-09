/**
 * D.Mike — Pfade von x-field und x-set (field-path.js)
 *
 * Grammatik (CSP-tauglich, kein Ausdruck wird ausgewertet):
 * `<wurzel>(.<name> | [<bezeichner> | <ganzzahl>])*.<feld>`.
 *
 * - `model.<feld>` — Feld oder Ansichtsfeld; geschrieben über den prüfenden
 *   Setter (Invarianten gelten).
 * - `state.<feld>` — Feld des UI-State (`defineState`), vor dem Schreiben geprüft.
 * - `model.<liste>[i].<feld>` — Pfad statisch gegen das Schema aufgelöst;
 *   Bezeichner in Klammern werden bei jedem Lesen und Schreiben frisch aus
 *   `Alpine.$data(el)` gelesen.
 * - `<eintrag>.<feld>` — `<eintrag>` aus dem `x-for`-Scope, im Model über die
 *   Objektidentität gefunden (auch in verschachtelten Listen).
 *
 * Felder in Listeneinträgen prüft `checkValue` gegen die Element-Spec;
 * Schlüsselfelder, auf die ein `idOf` zeigt, sind nicht beschreibbar.
 */
import { checkInvariantsAfter, checkMapKey, checkValue, contextOf, fieldSpec, parsePath, schemaOf, stateSchemaOf } from './model.js';

const TOKEN = /([A-Za-z_$][\w$]*)|\.([A-Za-z_$][\w$]*)|\[([A-Za-z_$][\w$]*|\d+)\]/y;

/**
 * @typedef {{ kind: 'name', name: string } | { kind: 'index', ref?: string, at?: number }} PathStep
 * @typedef {object} FieldTarget
 * @property {object} spec Spec des Feldes
 * @property {string} name Name in Meldungen (`alpha`, `items[].text`)
 * @property {'model'|'state'|'item'} kind
 * @property {string} helpKey Anker ohne `modules.<id>.` (`fields.alpha.help`, `state.tab.help`, `fields.items.text.help`)
 * @property {() => any} get
 * @property {(raw: any) => void} set prüft und schreibt; wirft bei Ablehnung
 */

/**
 * Einen Pfad zerlegen. Endet er auf `[…]`, ist `field` der letzte Index-Schritt
 * (Eintrag einer Map); ob davor eine Map steht, prüft `resolveTarget`.
 * @param {string} expr @returns {{ root: string, steps: PathStep[], field: string | { kind: 'index', ref?: string, at?: number } }}
 * @throws {Error} wenn der Pfad nicht in die Grammatik passt
 */
export function parseFieldPath(expr) {
  const text = String(expr).trim();
  /** @type {PathStep[]} */
  const steps = [];
  let root = null;
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < text.length) {
    const at = TOKEN.lastIndex;
    const m = TOKEN.exec(text);
    if (!m || (root === null && !m[1]) || (root !== null && m[1])) throw new Error(`invalid field path ${JSON.stringify(expr)} at ${at}`);
    if (m[1]) root = m[1];
    else if (m[2]) steps.push({ kind: 'name', name: m[2] });
    else steps.push(/^\d+$/.test(m[3]) ? { kind: 'index', at: Number(m[3]) } : { kind: 'index', ref: m[3] });
  }
  const last = steps.pop();
  if (root === null || !last) throw new Error(`invalid field path ${JSON.stringify(expr)}; expected <root>.<field>`);
  return { root, steps, field: last.kind === 'name' ? last.name : last };
}

/** `risks[r].actions` → `risks[].actions`. @param {string} path @returns {string} */
function listPathOf(path) {
  return parsePath(path).map((t, i) => (i === 0 ? t.name : t.kind === 'key' ? `.${t.name}` : '[]')).join('');
}

/**
 * Die Schlüsselfelder je Liste: jedes `idOf` in Feldern, Ansichtsfeldern und
 * Kommando-Parametern zeigt mit seinem `key` auf ein Feld der Einträge.
 * @param {{ fields: object, view: object, commands: object }} schema
 * @returns {Map<string, Set<string>>} Listen-Pfad (`events`, `risks[].actions`) → Schlüssel
 */
export function keyFieldsOf(schema) {
  /** @type {Map<string, Set<string>>} */
  const out = new Map();
  const visit = (s) => {
    if (!s || typeof s !== 'object') return;
    if (s.kind === 'idOf') {
      const p = listPathOf(s.path);
      if (!out.has(p)) out.set(p, new Set());
      out.get(p).add(s.key);
    }
    if (s.kind === 'list') visit(s.item);
    if (s.kind === 'record') visit(s.value);
    if (s.kind === 'map') { visit(s.key); visit(s.value); }
    if (s.kind === 'object') Object.values(s.shape).forEach(visit);
  };
  for (const s of Object.values({ ...schema.fields, ...schema.view })) visit(s);
  for (const c of Object.values(schema.commands ?? {})) Object.values(c.params ?? {}).forEach(visit);
  return out;
}

/** @param {object} spec @param {PathStep} step @param {string} where @returns {object} */
function stepSpec(spec, step, where) {
  if (step.kind === 'index' && spec?.kind === 'list') return spec.item;
  if (step.kind === 'index' && spec?.kind === 'map') return spec.value;
  if (step.kind === 'name' && spec?.kind === 'object' && Object.hasOwn(spec.shape, step.name)) return spec.shape[step.name];
  if (step.kind === 'name' && spec?.kind === 'record' && spec.keys.includes(step.name)) return spec.value;
  throw new Error(`${where}: ${step.kind === 'name' ? step.name : `[${step.ref ?? step.at}]`} does not match the schema`);
}

/**
 * Den Eintrag `target` in den Listenfeldern des Models suchen (rekursiv).
 * @returns {{ spec: object, names: string[] }|null} Element-Spec und Listen-Namen (`['risks', 'actions']`)
 */
function findEntry(Alpine, model, schema, target) {
  if (target === null || typeof target !== 'object') return null;
  const raw = (x) => (Alpine.raw ? Alpine.raw(x) : x);
  const same = (a, b) => a === b || raw(a) === raw(b);
  const search = (value, spec, names) => {
    if (spec?.kind !== 'list' || spec.item?.kind !== 'object' || !Array.isArray(value)) return null;
    for (const entry of value) {
      if (same(entry, target)) return { spec: spec.item, names };
      for (const [k, sub] of Object.entries(spec.item.shape)) {
        const hit = search(entry?.[k], sub, [...names, k]);
        if (hit) return hit;
      }
    }
    return null;
  };
  for (const [name, s] of Object.entries({ ...schema.fields, ...schema.view })) {
    const hit = search(model[name], s, [name]);
    if (hit) return hit;
  }
  return null;
}

/**
 * Das Ziel `model.<…>[schlüssel]`: ein Eintrag einer Map. Der Schlüssel wird bei
 * jedem Zugriff frisch aus dem Scope gelesen und als Text verwendet.
 * @param {() => any} scope @param {{ fields: object, view: object }} schema
 * @param {PathStep[]} steps Schritte bis zur Map @param {PathStep} entryStep @param {string} where
 * @returns {FieldTarget}
 */
function mapEntryTarget(scope, schema, steps, entryStep, where) {
  const [first, ...rest] = steps;
  if (first?.kind !== 'name') throw new Error(`${where}: a path starts with a field name`);
  let spec = schema.fields[first.name] ?? schema.view[first.name];
  if (!spec) throw new Error(`${where}: ${first.name} is neither a field nor a view field`);
  let schemaPath = first.name;
  /** @type {object[]} Spec je Schritt von `rest`, vor dem Schritt */
  const before = [];
  for (const st of rest) {
    before.push(spec);
    spec = stepSpec(spec, st, where);
    schemaPath += st.kind === 'index' ? '[]' : `.${st.name}`;
  }
  if (spec?.kind !== 'map') throw new Error(`${where}: [${entryStep.ref ?? entryStep.at}] does not match the schema`);
  const mapSpec = spec;
  const keyOf = (st) => String(st.ref !== undefined ? scope()[st.ref] : st.at);
  const checkKey = (key, keySpec, name, ctx) => checkMapKey({ key: keySpec }, name, key, ctx);
  /** Die Map, die den Eintrag hält; mit `create` werden fehlende Map-Einträge auf dem Weg angelegt. */
  const owner = (create) => {
    let o = scope().model[first.name];
    rest.forEach((st, n) => {
      if (o === null || o === undefined) return;
      if (st.kind === 'name') { o = o[st.name]; return; }
      const outer = before[n];
      const k = outer.kind === 'map' ? keyOf(st) : (st.ref !== undefined ? scope()[st.ref] : st.at);
      if (o[k] === undefined && create) {
        // Nur ein Map-Eintrag, der selbst eine Map ist, entsteht von selbst; sonst bleibt das Model unberührt.
        if (outer.kind !== 'map' || outer.value.kind !== 'map') throw new Error(`${where}: entry [${k}] is missing`);
        const model = scope().model;
        checkKey(k, outer.key, schemaPath, { root: model, context: contextOf(model) });
        o[k] = {};
      }
      o = o[k];
    });
    return o;
  };
  /** Der einzige Ort, der in die Map schreibt. */
  const write = (key, value) => { checkInvariantsAfter(scope().model, first.name, () => { owner(true)[key] = value; }); };
  return {
    spec: mapSpec.value, name: schemaPath, kind: 'model', helpKey: `fields.${schemaPath.replace(/\[\]/g, '')}.help`,
    get: () => owner(false)?.[keyOf(entryStep)],
    set: (raw) => {
      const model = scope().model;
      const ctx = { root: model, context: contextOf(model) };
      const key = keyOf(entryStep);
      checkKey(key, mapSpec.key, schemaPath, ctx);
      write(key, checkValue(mapSpec.value, `${schemaPath}[${key}]`, raw, ctx));
    },
  };
}

/**
 * Das Ziel eines Pfads an einem Element auflösen.
 * @param {any} Alpine @param {HTMLElement} el @param {string} expr @param {string} [directive]
 * @returns {FieldTarget}
 * @throws {Error} beim Einbau: Pfad, Schema, Eintrag, Schlüsselfeld
 */
export function resolveTarget(Alpine, el, expr, directive = 'x-field') {
  const where = `${directive}="${expr}"`;
  const { root, steps, field } = parseFieldPath(expr);
  const data = Alpine.$data(el);
  const scope = () => Alpine.$data(el);
  const entryStep = typeof field === 'object' ? field : null;
  if (entryStep && (root !== 'model' || steps.length === 0)) {
    if (root !== 'model' && steps.length > 0) throw new Error(`${where}: only ${root}.<field> is supported for an entry`);
    throw new Error(`${where}: [${entryStep.ref ?? entryStep.at}] does not match the schema`);
  }

  if (root === 'state') {
    if (steps.length > 0) throw new Error(`${where}: only state.<field> is supported`);
    const spec = data.state && stateSchemaOf(data.state) ? fieldSpec(data.state, field) : undefined;
    if (!spec) throw new Error(`${where}: ${field} is not a field of the UI state (defineState)`);
    return {
      spec, name: field, kind: 'state', helpKey: `state.${field}.help`,
      get: () => scope().state[field],
      set: (raw) => { scope().state[field] = checkValue(spec, field, raw); },
    };
  }

  const schema = schemaOf(data.model);
  if (!schema) throw new Error(`${where}: no defineModel model on this component`);
  if (entryStep) return mapEntryTarget(scope, schema, steps, entryStep, where);

  if (root === 'model' && steps.length === 0) {
    const spec = fieldSpec(data.model, field);
    if (!spec) throw new Error(`${where}: ${field} is neither a field nor a view field`);
    return {
      spec, name: field, kind: 'model', helpKey: `fields.${field}.help`,
      get: () => scope().model[field],
      set: (raw) => { scope().model[field] = raw; },
    };
  }

  let spec;
  let schemaPath;
  let rootField;
  /** @type {() => any} */
  let owner;
  if (root === 'model') {
    const [first, ...rest] = steps;
    if (first.kind !== 'name') throw new Error(`${where}: a path starts with a field name`);
    spec = schema.fields[first.name] ?? schema.view[first.name];
    if (!spec) throw new Error(`${where}: ${first.name} is neither a field nor a view field`);
    schemaPath = first.name;
    rootField = first.name;
    for (const st of rest) {
      if (st.kind === 'index' && spec?.kind === 'map') throw new Error(`${where}: a map entry can only be the last step`);
      spec = stepSpec(spec, st, where);
      schemaPath += st.kind === 'index' ? '[]' : `.${st.name}`;
    }
    owner = () => rest.reduce((o, st) => {
      if (o === null || o === undefined) return o;
      if (st.kind === 'name') return o[st.name];
      return o[st.ref !== undefined ? scope()[st.ref] : st.at];
    }, scope().model[first.name]);
  } else {
    if (steps.length > 0) throw new Error(`${where}: only ${root}.<field> is supported for an entry`);
    const hit = findEntry(Alpine, data.model, schema, data[root]);
    if (!hit) throw new Error(`${where}: ${root} is not an entry of a list field of the model`);
    spec = hit.spec;
    schemaPath = `${hit.names.join('[].')}[]`;
    owner = () => scope()[root];
    rootField = hit.names[0];
  }
  if (spec?.kind !== 'object' || !Object.hasOwn(spec.shape, field)) throw new Error(`${where}: ${field} does not match the schema`);
  const listPath = schemaPath.replace(/\[\]$/, '');
  if (keyFieldsOf(schema).get(listPath)?.has(field)) throw new Error(`${where}: ${field} is the key of ${listPath} and cannot be edited`);
  const fspec = spec.shape[field];
  const name = `${schemaPath}.${field}`;
  return {
    spec: fspec, name, kind: 'item', helpKey: `fields.${listPath.replace(/\[\]/g, '')}.${field}.help`,
    get: () => owner()?.[field],
    set: (raw) => {
      const model = scope().model;
      const next = checkValue(fspec, name, raw, { root: model, context: contextOf(model) });
      checkInvariantsAfter(model, rootField, () => { owner()[field] = next; });
    },
  };
}
