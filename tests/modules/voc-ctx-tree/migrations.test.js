/**
 * Tests for modules/voc-ctx-tree/domain/migrations.js — '0→1.0' übernimmt
 * jeden Stand des alten `State.fromJSON`: Baum über vier Ebenen ohne fremde
 * Schlüssel, Nicht-Objekte entfallen samt Teilbaum, fehlende Listen und Texte
 * werden leer, unbekannte Art wird ctq, ids bleiben oder werden fest aus der
 * Position ergänzt, Doppel bekommen `_`; Randstärke geklemmt und auf 0,5
 * gerundet, Farben je Schlüssel geprüft, `activeVocId` als Text. Dazu die
 * Golden-Fixtures, beide Beispiele, die Kano-Beispielbäume und das
 * Altprojekt der E2E-Fixture, jeweils über das Model ohne Reparatur.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { from0 } from '../../../js/modules/voc-ctx-tree/domain/migrations.js';
import { State } from '../../../js/modules/voc-ctx-tree/domain/model.js';
import { DEFAULT_COLORS, allIds } from '../../../js/modules/voc-ctx-tree/domain/tree.js';
import { setModelName } from '../../../js/core/model.js';
import { loadModel } from '../../../js/core/initial-model.js';

setModelName(State, 'voc-ctx-tree');

const SCHEMA = { _schema: { name: 'voc-ctx-tree', version: '1.0' } };
const FIXTURES = new URL('../../fixtures/exports/', import.meta.url);
const EXAMPLES = new URL('../../../examples/projects/', import.meta.url);
const json = (v) => JSON.stringify(v);
const plain = (v) => JSON.parse(JSON.stringify(v));
const DEFAULT_STYLES = { borderWidth: 1, colors: { ...DEFAULT_COLORS } };

/** @param {URL} url @returns {Promise<any>} */
async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${url}: HTTP ${res.status}`);
  return res.json();
}

/** Laden mit Reparatur; meldet die reparierten Felder. @param {object} j */
function repaired(j) {
  const fields = [];
  const m = State.fromJSON(j, { repair: true, onRepair: (f) => fields.push(f) });
  return { m, fields };
}

/** Alle Baumzustände eines Exports. @param {any} v @param {any[]} [acc] @returns {any[]} */
function treeStates(v, acc = []) {
  if (Array.isArray(v)) v.forEach((x) => treeStates(x, acc));
  else if (v && typeof v === 'object') {
    if (v.phases && v.moduleStates) {
      for (const list of Object.values(v.phases)) {
        for (const e of Array.isArray(list) ? list : []) {
          if (e?.moduleId === 'voc-ctx-tree') acc.push(v.moduleStates[e.instanceId] ?? e.state);
        }
      }
    }
    Object.values(v).forEach((x) => treeStates(x, acc));
  }
  return acc;
}

/** Zustand des Baums aus der Fixture „Altprojekt“ (`legacy-project.json`), ohne `_schema`. */
const LEGACY_OLD = {
  vocs: [
    { id: 'v-alt-1', text: 'Die Größe der Pizza schwankt & <stört> mich', source: 'Umfrage Q3 > Filiale Süd' },
    { id: 'v-alt-2', text: 'Die Lieferung dauert zu lange – über 45 Minuten', source: 'Beschwerde-Hotline', needs: [
      { id: 'n-alt-1', text: 'Schnelle Lieferung', drivers: [
        { id: 'd-alt-1', text: 'Lieferzeit ab Bestellung', type: 'ctq', requirements: [
          { id: 'r-alt-1', text: '≤ 30 Minuten in 95 % der Fälle', target: '30 min', measure: 'Zeitstempel Kasse → Übergabe' },
          { id: 'r-alt-2', text: 'Fahrer meldet Übergabe sofort' },
        ] },
        { id: 'd-alt-2', text: 'Treiber mit unbekannter Art', type: 'xyz', requirements: [] },
      ] },
      { text: 'Verlässliche Zusage', drivers: [
        { id: 'd-alt-3', text: 'Zugesagtes Lieferfenster', type: 'ctq', requirements: [
          { id: 'r-alt-3', text: 'Abweichung ≤ 5 min', target: '5 min', measure: 'GPS-Protokoll' },
        ] },
      ] },
    ] },
  ],
  activeVocId: 'v-alt-2',
  styles: { borderWidth: 3.7, colors: {
    voc: 'rgba(200,90,20,1)', need: 'rgba(10,120,200,1)', ctq: 'rgba(30,150,80,1)', ctd: '#336699', ctc: 'rgb(300,0,0)',
  } },
};

suite('voc-ctx-tree Migration 0→1.0 — Form', () => {
  test('leer, kein Objekt oder ohne Liste → leerer Baum, Vorgabestil, keine Auswahl', () => {
    for (const old of [{}, null, 7, [], { vocs: 'x' }]) {
      assertEqual(json(from0(old)), json({ vocs: [], styles: DEFAULT_STYLES, activeVocId: null }), json(old));
    }
  });
  test('Nicht-Objekte entfallen samt Teilbaum, fehlende Listen und Texte werden leer, fremde Schlüssel entfallen', () => {
    const out = from0({ vocs: [
      7, { id: 'a', text: 'A', extra: 1, needs: [null, { id: 'n', drivers: [[], { id: 'd', type: 'ctd', requirements: ['x', { id: 'r', text: 5 }] }] }] },
    ] });
    assertEqual(json(out.vocs), json([
      { id: 'a', text: 'A', source: '', needs: [
        { id: 'n', text: '', drivers: [
          { id: 'd', text: '', type: 'ctd', requirements: [{ id: 'r', text: '', target: '', measure: '' }] },
        ] },
      ] },
    ]));
  });
  test('unbekannte Art wird ctq', () => {
    const out = from0({ vocs: [{ id: 'a', needs: [{ id: 'n', drivers: [{ id: 'd', type: 'xyz' }, { id: 'e' }, { id: 'f', type: 'ctc' }] }] }] });
    assertDeepEqual(out.vocs[0].needs[0].drivers.map((d) => d.type), ['ctq', 'ctq', 'ctc']);
  });
});

suite('voc-ctx-tree Migration 0→1.0 — ids', () => {
  test('vorhandene ids bleiben, fehlende fest aus der Position (ab 1)', () => {
    const old = { vocs: [{ text: 'A' }, { id: 'b', needs: [{}, { drivers: [{ requirements: [{}, { id: 'keep' }] }] }] }] };
    const out = from0(old);
    assertDeepEqual(allIds(out.vocs), ['v1', 'b', 'n2_1', 'n2_2', 'd2_2_1', 'r2_2_1_1', 'keep']);
    assertEqual(json(from0(old)), json(out), 'bei jedem Lesen dieselben ids');
  });
  test('spätere doppelte id und kollidierender Ersatz bekommen _; vorhandene ids nie umbenannt', () => {
    const out = from0({ vocs: [{ id: 'x' }, { id: 'x' }, {}, { id: 'v3' }] });
    assertDeepEqual(out.vocs.map((v) => v.id), ['x', 'x_', 'v3_', 'v3']);
  });
  test('Doppel über Ebenen hinweg', () => {
    const out = from0({ vocs: [{ id: 'a', needs: [{ id: 'a' }, { id: '' }] }] });
    assertDeepEqual(allIds(out.vocs), ['a', 'a_', 'n1_2']);
  });
  test('eine id, die kein Text ist, wird ersetzt', () => {
    assertDeepEqual(from0({ vocs: [{ id: 5 }] }).vocs.map((v) => v.id), ['v1']);
  });
});

suite('voc-ctx-tree Migration 0→1.0 — Stil und Auswahl', () => {
  test('Randstärke: −1 → 0, 3.7 → 3.5, 9 → 4, Text und NaN → 1, 2.5 bleibt', () => {
    const bw = (v) => from0({ styles: { borderWidth: v } }).styles.borderWidth;
    assertEqual(bw(-1), 0);
    assertEqual(bw(3.7), 3.5);
    assertEqual(bw(9), 4);
    assertEqual(bw('2'), 1);
    assertEqual(bw(NaN), 1);
    assertEqual(bw(Infinity), 1);
    assertEqual(bw(2.5), 2.5);
    assertEqual(bw(undefined), 1);
  });
  test('Farben: gültige bleiben, Hex, Überlauf, Fehlendes → Vorgabe; fremde Schlüssel entfallen', () => {
    const out = from0({ styles: { colors: { voc: 'rgba(1,2,3,1.00)', need: '#336699', ctq: 'rgb(300,0,0)', edge: '#000' } } });
    assertEqual(json(out.styles.colors), json({ ...DEFAULT_COLORS, voc: 'rgba(1,2,3,1.00)' }));
    assertEqual(json(from0({ styles: { colors: 'x' } }).styles.colors), json(DEFAULT_COLORS));
  });
  test('activeVocId: Text bleibt (auch unbekannt), sonst null', () => {
    assertEqual(from0({ activeVocId: 'zz' }).activeVocId, 'zz');
    assertEqual(from0({ activeVocId: 3 }).activeVocId, null);
  });
  test('unbekannte Auswahl heilt beim Laden still auf null', () => {
    const { m, fields } = repaired({ vocs: [{ id: 'a', text: 'A' }], activeVocId: 'zz' });
    assertEqual(m.activeVocId, null);
    assertDeepEqual(fields, []);
    assertEqual(State.fromJSON({ vocs: [{ id: 'a', text: 'A' }], activeVocId: 'zz' }).activeVocId, null, 'auch streng');
  });
});

suite('voc-ctx-tree Migration 0→1.0 — Altprojekt', () => {
  test('Baum, ids, Arten, Farben, Randstärke und Auswahl', () => {
    const m = State.fromJSON(plain(LEGACY_OLD));
    const out = m.toJSON();
    assertDeepEqual(allIds(out.vocs), ['v-alt-1', 'v-alt-2', 'n-alt-1', 'd-alt-1', 'r-alt-1', 'r-alt-2', 'd-alt-2', 'n2_2', 'd-alt-3', 'r-alt-3']);
    assertDeepEqual(out.vocs[0].needs, []);
    assertEqual(out.vocs[1].needs[0].drivers[1].type, 'ctq');
    assertDeepEqual(out.vocs[1].needs[0].drivers[0].requirements[1], { id: 'r-alt-2', text: 'Fahrer meldet Übergabe sofort', target: '', measure: '' });
    assertEqual(json(out.styles), json({ borderWidth: 3.5, colors: {
      voc: 'rgba(200,90,20,1)', need: 'rgba(10,120,200,1)', ctq: 'rgba(30,150,80,1)',
      ctd: DEFAULT_COLORS.ctd, ctc: DEFAULT_COLORS.ctc, req: DEFAULT_COLORS.req,
    } }));
    assertEqual(out.activeVocId, 'v-alt-2');
    assertDeepEqual(out._schema, SCHEMA._schema);
  });
  test('Laden wie beim Einhängen: ohne Reparatur, derselbe Stand', () => {
    const { fields } = repaired(plain(LEGACY_OLD));
    assertDeepEqual(fields, []);
    assertEqual(json(loadModel(State, plain(LEGACY_OLD)).toJSON()), json(State.fromJSON(plain(LEGACY_OLD)).toJSON()));
  });
});

suite('voc-ctx-tree Migration 0→1.0 — Golden-Fixtures, Beispiele, Kano-Bäume', () => {
  test('Golden-Fixtures v0.3.0 laden streng; fremde Form (name, cxs) wird leer', async () => {
    let n = 0;
    for (const f of ['v0.3.0_single_project.json', 'v0.3.0_all_projects.json']) {
      for (const st of treeStates(await fetchJSON(new URL(f, FIXTURES)))) {
        const m = State.fromJSON(plain(st));
        const { fields } = repaired(plain(st));
        assertDeepEqual(fields, [], f);
        assertDeepEqual(m.vocs.map((v) => v.id), st.vocs.map((v) => v.id), f);
        assertTrue(m.vocs.every((v) => v.text === '' && v.needs.length === 0), f);
        assertEqual(json(m.styles.colors), json(DEFAULT_COLORS), f);
        n++;
      }
    }
    assertTrue(n >= 2, `${n} Bäume`);
  });
  test('beide Beispiele laden streng, Inhalt und ids bleiben', async () => {
    for (const f of ['voc-ctx-pizza-lieferung.json', 'voc-ctx-tree-hubschrauber-flyer.json']) {
      const old = await fetchJSON(new URL(f, EXAMPLES));
      const m = State.fromJSON(plain(old));
      assertDeepEqual(repaired(plain(old)).fields, [], f);
      assertDeepEqual(m.vocs.map((v) => [v.id, v.text]), old.vocs.map((v) => [v.id, v.text]), f);
      assertEqual(allIds(m.vocs).length, new Set(allIds(m.vocs)).size, f);
    }
  });
  test('Kano-Beispielbäume (styles leer) laden streng, ids bleiben, Farben aus der Vorgabe', async () => {
    for (const f of ['kano-lieferservice.json', 'kano-hubschrauber-flyer.json']) {
      const { tree } = await fetchJSON(new URL(f, EXAMPLES));
      const m = State.fromJSON(plain(tree));
      assertDeepEqual(repaired(plain(tree)).fields, [], f);
      const oldIds = [];
      for (const v of tree.vocs) {
        oldIds.push(v.id);
        for (const n of v.needs || []) {
          oldIds.push(n.id);
          for (const d of n.drivers || []) { oldIds.push(d.id); for (const r of d.requirements || []) oldIds.push(r.id); }
        }
      }
      assertDeepEqual(allIds(m.vocs), oldIds, f);
      assertEqual(json(m.styles.colors), json(DEFAULT_COLORS), f);
    }
  });
});
