/**
 * VoC → CTx Tree: Beispiele.
 *
 * Beide Beispiele liegen in der Modulablage, bleiben in der Form ohne
 * `_schema`, laden streng und ohne Reparatur, behalten ihre ids, und ihr
 * `read()` gleicht dem gespeicherten Baum; neu sind nur leere Ziel- und
 * Messfelder statt fehlender und die Vorgabefarben statt `styles: {}`.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { setModelName } from '../../../js/core/model.js';
import { schemaAgentEntry, readSchemaModel } from '../../../js/core/agent/agent-schema.js';
import { State } from '../../../js/modules/voc-ctx-tree/domain/model.js';
import { DEFAULT_COLORS } from '../../../js/modules/voc-ctx-tree/domain/tree.js';

setModelName(State, 'voc-ctx-tree');

const BASE = '../../../js/modules/voc-ctx-tree/resources/examples/';
const PIZZA = 'projects/voc-ctx-pizza-lieferung.json';
const FLYER = 'projects/voc-ctx-tree-hubschrauber-flyer.json';

/** @param {string} relPath */
async function fetchJson(relPath) {
  const res = await fetch(new URL(BASE + relPath, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

const plain = (v) => JSON.parse(JSON.stringify(v));

/** Der gespeicherte Baum mit leeren statt fehlenden Ziel- und Messfeldern. @param {any[]} vocs */
const filled = (vocs) => vocs.map((v) => ({
  id: v.id, text: v.text, source: v.source ?? '',
  needs: (v.needs ?? []).map((n) => ({
    id: n.id, text: n.text,
    drivers: (n.drivers ?? []).map((d) => ({
      id: d.id, text: d.text, type: d.type,
      requirements: (d.requirements ?? []).map((r) => ({ id: r.id, text: r.text, target: r.target ?? '', measure: r.measure ?? '' })),
    })),
  })),
}));

/** Lädt streng und mit Reparatur; liefert das Model und die reparierten Felder. @param {object} raw */
function load(raw) {
  State.fromJSON(plain(raw));
  /** @type {string[]} */
  const repairs = [];
  const m = State.fromJSON(plain(raw), { repair: true, onRepair: (f) => repairs.push(f) });
  return { m, repairs };
}

suite('voc-ctx-tree: Beispiele', () => {
  test('beide Beispiele stehen in der Modulablage', async () => {
    const own = await fetchJson('examples.json');
    assertDeepEqual(own.examples.map((e) => e.id), ['voc-ctx-pizza-lieferung', 'voc-ctx-tree-hubschrauber-flyer']);
    assertDeepEqual(own.examples.map((e) => e.file), [PIZZA, FLYER]);
    for (const e of own.examples) {
      assertEqual(e.type, 'project');
      assertEqual(e.format, 'json');
      assertEqual(e.modules, undefined);
      assertTrue(!!e.title.de && !!e.title.en, `Titel fehlt: ${e.id}`);
      assertTrue(!!e.description.de && !!e.description.en, `Beschreibung fehlt: ${e.id}`);
    }
  });

  for (const [name, file] of [['voc-ctx-pizza-lieferung', PIZZA], ['voc-ctx-tree-hubschrauber-flyer', FLYER]]) {
    test(`${name}: ohne _schema, streng ohne Reparatur, read() gleich dem gespeicherten Baum`, async () => {
      const raw = await fetchJson(file);
      assertEqual(raw._schema, undefined);
      const { m, repairs } = load(raw);
      assertDeepEqual(repairs, []);
      assertEqual(m.activeVocId, raw.activeVocId);
      const out = plain(readSchemaModel(schemaAgentEntry(State), m, { fields: ['vocs', 'styles'] }));
      assertEqual(JSON.stringify(out.vocs), JSON.stringify(filled(raw.vocs)));
      assertDeepEqual(out.styles, { borderWidth: 1, colors: { ...DEFAULT_COLORS } });
      const desc = plain(readSchemaModel(schemaAgentEntry(State), m));
      assertEqual(desc.vocs.$bulk, true);
      assertEqual(desc.vocs.nodeCount, raw.vocs.length);
    });
  }
});
