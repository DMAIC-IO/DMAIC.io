/**
 * D.Mike — Pfade aus einer JSON-Form entfernen (view-fields.js)
 *
 * Ansichtszustände sind gespeichert, sagen aber nichts über den Inhalt
 * (`static VIEW_FIELDS` am Model, `viewFields` in `AGENT_REGISTRY`). Dieser
 * Helfer nimmt sie aus der Revision (`stateManager.getModuleRevision`) und aus
 * `read()` (`core/agent/agent-ops.js`). Er kennt den Agenten nicht.
 *
 * Grammatik: `a.b` Unterschlüssel, `a[].b` je Element, `a[]**.b` je Element und
 * rekursiv über dessen `children`. Dieselbe Grammatik prüft der Generator
 * (`tools/build/agent-data.mjs`, `VIEW_PATH`): zwei Deklarationen, weil der
 * Build nicht aus `js/` importiert.
 *
 * Rein: kein DOM, kein `window`.
 */

const TOKEN = /\[\]\*\*|\[\]|[A-Za-z_$][\w$]*/g;

/**
 * Eine Kopie von `json` ohne die Werte unter `paths`; das Original bleibt
 * unverändert, die Schlüsselfolge erhalten. Ein Pfad, der nicht zur Form der
 * Daten passt, trifft nichts.
 * @param {any} json
 * @param {string[]|undefined} paths
 * @returns {any} ohne Pfade `json` selbst
 */
export function stripPaths(json, paths) {
  if (!Array.isArray(paths) || paths.length === 0) return json;
  return paths.reduce((acc, path) => strip(acc, path.match(TOKEN) ?? [], 0), json);
}

/** Ein Schritt von `stripPaths`. */
function strip(node, tokens, i) {
  if (node === null || typeof node !== 'object') return node;
  const token = tokens[i];
  if (token === '[]' || token === '[]**') {
    if (!Array.isArray(node)) return node;
    return node.map((item) => {
      const next = strip(item, tokens, i + 1);
      if (token === '[]' || next === null || typeof next !== 'object' || !Array.isArray(next.children)) return next;
      return { ...next, children: strip(next.children, tokens, i) };
    });
  }
  if (Array.isArray(node) || !Object.hasOwn(node, token)) return node;
  if (i < tokens.length - 1) return { ...node, [token]: strip(node[token], tokens, i + 1) };
  const { [token]: _removed, ...rest } = node;
  return rest;
}
