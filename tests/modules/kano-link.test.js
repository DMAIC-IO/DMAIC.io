/**
 * D.Mike — Kano Link Tests (kano-link.test.js)
 * Anbindung an das voc-ctx-tree-Modul: Instanzen finden, Baum flach klopfen,
 * Diff bilden. Reine Funktionen, kein DOM.
 * Spec: docs/superpowers/specs/2026-07-25-kano-modul-design.md
 */

import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { listTrees, flatten, diff, applyDiff } from '../../js/modules/kano/kano-link.js';

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
    const result = listTrees(sm);
    assertDeepEqual(result.map(t => t.instanceId), ['b', 'c']);
    // Important 1: Prüfe, dass state-Feld tatsächlich durchgereicht wird
    assertEqual(result[0].state, TREE);
    assertEqual(result[1].state, null);
  });

  test('ohne Phasen oder ohne Baum: leeres Array', () => {
    assertDeepEqual(listTrees(fakeSM({})), []);
    assertDeepEqual(listTrees(null), []);
  });

  test('fehlende phases (undefined) liefert leeres Array', () => {
    // Important 2: Prüfe, dass || {}-Fallback greift, wenn get('phases') wirklich undefined ist
    const smUndef = { get: () => undefined, getModuleState: () => null };
    assertDeepEqual(listTrees(smUndef), []);
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

  test('flatten mutiert die Eingabe nicht', () => {
    // Important 3: Prüfe, dass Eingaben nicht mutiert werden
    const input = {
      vocs: [{
        id: 'v', text: 'x',
        needs: [{ id: 'n', text: 'y', drivers: [{ id: 'd', text: 'z', requirements: [] }] }],
      }],
    };
    const before = JSON.stringify(input);
    flatten(input, 'driver');
    const after = JSON.stringify(input);
    assertEqual(before, after);
  });

  test('listTrees mutiert den stateManager nicht', () => {
    // Important 3: Prüfe, dass listTrees den stateManager nicht ändert
    const phases = {
      define: [{ instanceId: 'a', moduleId: 'voc-ctx-tree' }],
    };
    const states = { a: TREE };
    const sm = fakeSM(phases, states);
    const before = JSON.stringify({ phases, states });
    listTrees(sm);
    const after = JSON.stringify({ phases, states });
    assertEqual(before, after);
  });
});

const ITEMS = [
  { id: 'k1', nodeId: 'n1', label: 'Schnelle Lieferung', path: 'VoC', missing: false },
  { id: 'k2', nodeId: 'n2', label: 'Alter Text',        path: 'VoC', missing: false },
  { id: 'k3', nodeId: 'n9', label: 'Weg aus dem Baum',  path: 'VoC', missing: false },
  { id: 'k4', nodeId: null, label: 'Losgelöst',         path: '',    missing: false },
];
const CANDIDATES = [
  { nodeId: 'n1', label: 'Schnelle Lieferung', path: 'VoC' },
  { nodeId: 'n2', label: 'Neuer Text',         path: 'VoC' },
  { nodeId: 'n3', label: 'Ganz neu',           path: 'VoC' },
];

suite('kano-link — diff', () => {
  test('added: Kandidat ohne Item', () => {
    assertDeepEqual(diff(ITEMS, CANDIDATES).added.map(c => c.nodeId), ['n3']);
  });

  test('renamed: gleiche nodeId, anderer Text', () => {
    const r = diff(ITEMS, CANDIDATES).renamed;
    assertEqual(r.length, 1);
    assertEqual(r[0].item.id, 'k2');
    assertEqual(r[0].candidate.label, 'Neuer Text');
  });

  test('missing: Item mit nodeId ohne Kandidat', () => {
    assertDeepEqual(diff(ITEMS, CANDIDATES).missing.map(i => i.id), ['k3']);
  });

  test('losgelöste Items tauchen in keiner Kategorie auf', () => {
    const d = diff(ITEMS, CANDIDATES);
    const all = [...d.added, ...d.renamed.map(r => r.item), ...d.missing];
    assertEqual(all.some(x => x.id === 'k4'), false);
  });

  test('bereits verwaistes Item, das zurückkehrt, gilt nicht mehr als missing', () => {
    const items = [{ id: 'k1', nodeId: 'n1', label: 'A', path: '', missing: true }];
    const d = diff(items, [{ nodeId: 'n1', label: 'A', path: '' }]);
    assertEqual(d.missing.length, 0);
  });

  test('presentNodeIds enthält alle nodeIds der Kandidaten', () => {
    const d = diff(ITEMS, CANDIDATES);
    assertEqual(d.presentNodeIds.has('n1'), true);
    assertEqual(d.presentNodeIds.has('n2'), true);
    assertEqual(d.presentNodeIds.has('n3'), true);
    assertEqual(d.presentNodeIds.has('n9'), false);
  });

  test('zwei aufeinanderfolgende Zyklen: dauerhaft fehlendes Item bleibt missing, wird nicht erneut gemeldet', () => {
    // Zyklus 1: n9 verschwindet
    const items1 = [{ id: 'k9', nodeId: 'n9', label: 'X', path: '', missing: false }];
    const cands1 = [];
    const d1 = diff(items1, cands1);
    assertDeepEqual(d1.missing.map(i => i.id), ['k9']);

    // Zyklus 2: n9 ist immer noch weg
    const items2 = applyDiff(items1, d1, () => 'x');
    assertEqual(items2[0].missing, true, 'Nach Zyklus 1 ist Item als missing markiert');

    const cands2 = [];
    const d2 = diff(items2, cands2);
    assertEqual(d2.missing.length, 0, 'In Zyklus 2 wird der dauerhafte Verlust nicht erneut gemeldet');
  });

  test('verwaistes Item, dessen Knoten zurückkehrt, wird entmarkiert', () => {
    const items = [{ id: 'k1', nodeId: 'n1', label: 'A', path: '', missing: true }];
    const cands = [{ nodeId: 'n1', label: 'A', path: '' }];
    const result = applyDiff(items, diff(items, cands), () => 'x');
    assertEqual(result[0].missing, false);
  });

  test('losgelöstes Item behält sein Flag unverändert', () => {
    const items = [{ id: 'k1', nodeId: null, label: 'Losgelöst', path: '', missing: true }];
    const cands = [];
    const result = applyDiff(items, diff(items, cands), () => 'x');
    assertEqual(result[0].missing, true, 'Losgelöstes Item behält missing: true');
  });
});

suite('kano-link — applyDiff', () => {
  test('hängt neue Items an und vergibt frische IDs', () => {
    let i = 0;
    const next = applyDiff(ITEMS, diff(ITEMS, CANDIDATES), () => `new-${++i}`);
    assertEqual(next.length, 5);
    assertEqual(next[4].id, 'new-1');
    assertEqual(next[4].nodeId, 'n3');
  });

  test('aktualisiert Label und Pfad umbenannter Items, ID bleibt', () => {
    const next = applyDiff(ITEMS, diff(ITEMS, CANDIDATES), () => 'x');
    const k2 = next.find(i => i.id === 'k2');
    assertEqual(k2.label, 'Neuer Text');
  });

  test('setzt missing statt zu löschen', () => {
    const next = applyDiff(ITEMS, diff(ITEMS, CANDIDATES), () => 'x');
    assertEqual(next.find(i => i.id === 'k3').missing, true);
    assertEqual(next.find(i => i.id === 'k1').missing, false);
  });

  test('nimmt missing zurück, wenn der Knoten wieder da ist', () => {
    const items = [{ id: 'k1', nodeId: 'n1', label: 'A', path: '', missing: true }];
    const cands = [{ nodeId: 'n1', label: 'A', path: '' }];
    assertEqual(applyDiff(items, diff(items, cands), () => 'x')[0].missing, false);
  });

  test('mutiert die Eingabeliste nicht', () => {
    const snapshot = JSON.stringify(ITEMS);
    applyDiff(ITEMS, diff(ITEMS, CANDIDATES), () => 'x');
    assertEqual(JSON.stringify(ITEMS), snapshot);
  });

  test('robust gegen fehlende presentNodeIds: Flag bleibt unverändert', () => {
    const items = [{ id: 'k1', nodeId: 'n1', label: 'A', path: '', missing: true }];
    // diffResult von Hand gebaut, ohne presentNodeIds
    const manualDiffResult = { added: [], renamed: [], missing: [] };
    const result = applyDiff(items, manualDiffResult, () => 'x');
    assertEqual(result[0].missing, true, 'missing bleibt true wenn presentNodeIds fehlt');
  });
});
