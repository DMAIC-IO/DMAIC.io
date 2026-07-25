/**
 * D.Mike — Kano Link Tests (kano-link.test.js)
 * Anbindung an das voc-ctx-tree-Modul: Instanzen finden, Baum flach klopfen,
 * Diff bilden. Reine Funktionen, kein DOM.
 * Spec: docs/superpowers/specs/2026-07-25-kano-modul-design.md
 */

import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { listTrees, flatten } from '../../js/modules/kano/kano-link.js';

/** Minimaler stateManager-Doppelgänger. */
function fakeSM(phases, states = {}) {
  return {
    get: (path) => {
      if (path === 'phases') return phases;
      const m = /^phases\.(.+)$/.exec(path);
      return m ? (phases[m[1]] ?? []) : undefined;
    },
    getModuleState: (id) => states[id] ?? null,
  };
}

const TREE = {
  vocs: [{
    id: 'v1', text: 'Lieferung dauert zu lange', source: 'Interview',
    needs: [
      {
        id: 'n1', text: 'Schnelle Lieferung',
        drivers: [
          { id: 'd1', text: 'Lieferzeit', type: 'ctq', requirements: [
            { id: 'q1', text: 'Lieferung < 48 h', target: '48 h', measure: 'Stunden' },
          ] },
          { id: 'd2', text: 'Versandkosten', type: 'ctc', requirements: [] },
        ],
      },
      { id: 'n2', text: 'Transparente Preise', drivers: [] },
    ],
  }],
};

suite('kano-link — listTrees', () => {
  test('findet voc-ctx-tree-Instanzen über alle Phasen', () => {
    const sm = fakeSM(
      { define: [{ instanceId: 'a', moduleId: 'worksheet' }, { instanceId: 'b', moduleId: 'voc-ctx-tree' }],
        measure: [{ instanceId: 'c', moduleId: 'voc-ctx-tree' }] },
      { b: TREE, c: null },
    );
    assertDeepEqual(listTrees(sm).map(t => t.instanceId), ['b', 'c']);
  });

  test('ohne Phasen oder ohne Baum: leeres Array', () => {
    assertDeepEqual(listTrees(fakeSM({})), []);
    assertDeepEqual(listTrees(null), []);
  });
});

suite('kano-link — flatten', () => {
  test('Ebene need: ein Eintrag je Need, Pfad ist der VoC-Text', () => {
    const out = flatten(TREE, 'need');
    assertDeepEqual(out.map(o => o.nodeId), ['n1', 'n2']);
    assertEqual(out[0].label, 'Schnelle Lieferung');
    assertEqual(out[0].path, 'Lieferung dauert zu lange');
  });

  test('Ebene driver: Pfad enthält VoC und Need', () => {
    const out = flatten(TREE, 'driver');
    assertDeepEqual(out.map(o => o.nodeId), ['d1', 'd2']);
    assertEqual(out[0].path, 'Lieferung dauert zu lange ▸ Schnelle Lieferung');
  });

  test('Ebene req: nur vorhandene Requirements', () => {
    const out = flatten(TREE, 'req');
    assertDeepEqual(out.map(o => o.nodeId), ['q1']);
    assertEqual(out[0].path, 'Lieferung dauert zu lange ▸ Schnelle Lieferung ▸ Lieferzeit');
  });

  test('leere Zwischenebenen liefern keine Einträge, werfen nicht', () => {
    assertDeepEqual(flatten({ vocs: [{ id: 'v', text: 'x', needs: [] }] }, 'req'), []);
    assertDeepEqual(flatten(null, 'need'), []);
    assertDeepEqual(flatten(TREE, 'unbekannt'), []);
  });
});
