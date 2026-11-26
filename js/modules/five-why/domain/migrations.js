/**
 * D.Mike — 5-Why: Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js oder tree.js (das Schema darf sich ändern, die
 * Migration nicht).
 */

/** Höchste Ebene im Formatstand 1.0. */
const MAX_LEVEL_1_0 = 5;

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** @param {unknown} v @returns {v is number} eine gültige gespeicherte id */
const isId = (v) => Number.isInteger(v) && /** @type {number} */ (v) >= 1;

/**
 * Die flache Altform (`{ id, level, parent, text }` ohne `children`) als Baum:
 * ein Knoten hängt unter dem ersten Knoten mit der id aus `parent`; fehlt der
 * (0, unbekannt, er selbst, ein Kreis), wird er Wurzel. `text` wird `answer`.
 * Reihenfolge der Geschwister wie in der Quelle.
 * @param {any[]} flat @returns {object[]}
 */
function treeFromFlat(flat) {
  const items = flat.filter(isObject).map((n) => ({
    src: n,
    node: {
      id: n.id,
      answer: typeof n.text === 'string' ? n.text : n.answer,
      collapsed: n.collapsed,
      children: [],
    },
  }));
  /** @type {Map<unknown, { src: any, node: any }>} */
  const byId = new Map();
  for (const it of items) if (!byId.has(it.src.id)) byId.set(it.src.id, it);
  /** @type {Map<any, any>} Knoten → Elternknoten */
  const parentOf = new Map();
  for (const it of items) {
    const p = byId.get(it.src.parent);
    if (!p || p === it) continue;
    // Ein Kreis über die Elternkette macht den Knoten zur Wurzel.
    let up = p;
    while (up && up !== it) up = parentOf.get(up);
    if (up === it) continue;
    parentOf.set(it, p);
  }
  const roots = [];
  for (const it of items) {
    const p = parentOf.get(it);
    if (p) p.node.children.push(it.node);
    else roots.push(it.node);
  }
  return roots;
}

/**
 * '0→1.0': jeder Stand ohne `_schema` (wie ihn das alte `State.toJSON`
 * schrieb, von Hand oder als Beispieldatei; dazu die flache Altform früher
 * Exporte). Je Knoten: ein Nicht-Objekt entfällt samt Teilbaum; eine
 * ganzzahlige id ≥ 1 bleibt, sonst eine neue hinter der größten; `answer`
 * bleibt als Text, sonst leer; `level` und `parentId` aus der Lage;
 * `collapsed: true` (Ebene 1–4) wandert in die Liste `collapsed`; `question`
 * und fremde Schlüssel entfallen. Auf Ebene 5 fehlt `children`; tiefere
 * Knoten rücken in Anzeigereihenfolge als Geschwister direkt hinter ihren
 * Vorfahren auf Ebene 5, ihre Antworten bleiben.
 * @param {unknown} old gespeicherter Zustand ohne `_schema`
 * @returns {{ problem: string, nodes: object[], collapsed: number[] }}
 */
export function from0(old) {
  const o = isObject(old) ? old : {};
  let source = Array.isArray(o.nodes) ? o.nodes : [];
  const flat = source.some((n) => isObject(n) && Object.hasOwn(n, 'parent'))
    && !source.some((n) => isObject(n) && Array.isArray(n.children));
  if (flat) source = treeFromFlat(source);

  let maxId = 0;
  const scan = (list) => {
    for (const n of Array.isArray(list) ? list : []) {
      if (!isObject(n)) continue;
      if (isId(n.id)) maxId = Math.max(maxId, n.id);
      scan(n.children);
    }
  };
  scan(source);

  /** @type {number[]} */
  const collapsed = [];
  /**
   * Ein Knoten und (ab Ebene 5) seine Nachfahren als flache Folge auf Ebene 5.
   * @param {any} n @param {number} level @param {number|null} parentId
   * @returns {object[]}
   */
  const convert = (n, level, parentId) => {
    const id = isId(n.id) ? n.id : ++maxId;
    const answer = typeof n.answer === 'string' ? n.answer : '';
    const kids = (Array.isArray(n.children) ? n.children : []).filter(isObject);
    if (level < MAX_LEVEL_1_0) {
      if (n.collapsed === true && !collapsed.includes(id)) collapsed.push(id);
      return [{ id, level, parentId, answer, children: kids.flatMap((c) => convert(c, level + 1, id)) }];
    }
    return [
      { id, level, parentId, answer },
      ...kids.flatMap((c) => convert(c, MAX_LEVEL_1_0, parentId)),
    ];
  };

  return {
    problem: typeof o.problem === 'string' ? o.problem : '',
    nodes: source.filter(isObject).flatMap((n) => convert(n, 1, null)),
    collapsed,
  };
}
