/**
 * Jede `{{ref:id}}` in einem Modulhandbuch muss auf einen Eintrag in
 * `<id>-references.js` desselben Moduls zeigen. Eine unbekannte id rendert
 * stumm als Klartext — ohne diesen Test fiele ein Tippfehler niemandem auf.
 */
import { suite, test, assertEqual } from '../test-utils.js';
import MODULE_MANIFEST from '../../js/modules/manifest.js';
import { REFS } from '../../js/core/references-registry.generated.js';

const REF_TOKEN = /\{\{ref:([a-z0-9-]+)(?:\|[^}]+)?\}\}/gi;

/** Alle Strings einer Hilfedefinition einsammeln. */
function collectStrings(node, out = []) {
  if (node == null) return out;
  if (typeof node === 'string') { out.push(node); return out; }
  if (Array.isArray(node)) { node.forEach(v => collectStrings(v, out)); return out; }
  if (typeof node === 'object') { Object.values(node).forEach(v => collectStrings(v, out)); }
  return out;
}

suite('Hilfetexte: {{ref:…}} zeigt auf einen vorhandenen Eintrag', () => {
  test('keine unbekannte Referenz-ID', async () => {
    const offenders = [];
    for (const entry of MODULE_MANIFEST) {
      let help;
      try {
        help = (await import(`../../js/modules/${entry.id}/${entry.id}-help.js`)).default;
      } catch {
        continue;   // Modul ohne eigenen Hilfetext
      }
      const known = new Set((REFS[entry.id] || []).map(r => r.id));
      for (const value of collectStrings(help)) {
        for (const m of value.matchAll(REF_TOKEN)) {
          if (!known.has(m[1])) offenders.push(`${entry.id}: {{ref:${m[1]}}}`);
        }
      }
    }
    assertEqual(offenders.length, 0,
      `Unbekannte Referenz-IDs in Hilfetexten:\n  ${offenders.join('\n  ')}`);
  });

  test('Referenz-IDs sind innerhalb eines Moduls eindeutig', () => {
    const offenders = [];
    for (const [moduleId, list] of Object.entries(REFS)) {
      const seen = new Set();
      for (const r of list || []) {
        if (seen.has(r.id)) offenders.push(`${moduleId}: ${r.id}`);
        seen.add(r.id);
      }
    }
    assertEqual(offenders.length, 0, `Doppelte Referenz-IDs:\n  ${offenders.join('\n  ')}`);
  });
});
