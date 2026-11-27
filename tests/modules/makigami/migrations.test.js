/**
 * Makigami: Migration '0→1.0' (domain/migrations.js) — jeder Fall des alten
 * `State.fromJSON`, dazu die drei Altinstanzen des Altprojekts (sie laden ohne
 * Reparatur bzw. mit genau der erwarteten).
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { from0 } from '../../../js/modules/makigami/domain/migrations.js';
import { State } from '../../../js/modules/makigami/domain/model.js';
import { createDefaultMudaCategories, createDefaultTimeUnits } from '../../../js/modules/makigami/domain/defaults.js';
import { setModelName } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';

setModelName(State, 'makigami');

const plain = (v) => JSON.parse(JSON.stringify(v));
const IDS = { a: '5b1c7d20-3e4f-4a51-9c62-0d7e8f9a1b01', b: '5b1c7d20-3e4f-4a51-9c62-0d7e8f9a1b02', c: '5b1c7d20-3e4f-4a51-9c62-0d7e8f9a1b03' };

async function legacyStates() {
  const res = await fetch(new URL('./legacy-project.json', import.meta.url), { cache: 'no-cache' });
  return (await res.json()).moduleStates;
}

/** Laden mit Reparatur; meldet die reparierten Felder. @param {object} j */
function load(j) {
  const fields = [];
  const m = State.fromJSON(j, { repair: true, onRepair: (f) => fields.push(f) });
  return { m, fields };
}

suite('makigami Migration 0→1.0', () => {
  test('leerer, fehlender und kaputter Altstand: Vorgaben', () => {
    for (const old of [{}, null, undefined, 42, 'x', []]) {
      assertDeepEqual(from0(old), {
        title: '', roles: [], steps: [], mudaCategories: createDefaultMudaCategories(),
        timeUnits: createDefaultTimeUnits(), collapsed: [],
      }, JSON.stringify(old));
    }
    const out = from0({ roles: 'nope', steps: 42, title: 5, mudaCategories: 'x', timeUnits: {} });
    assertDeepEqual([out.roles, out.steps, out.title], [[], [], '']);
  });
  test('Rollen und Schritte ohne Text-id (auch leer) entfallen, Textfelder werden Text', () => {
    const out = from0({
      roles: [{ id: 'r1', label: 'A' }, { id: 'r2' }, { label: 'ohne' }, { id: 3 }, { id: '' }, null],
      steps: [{ id: 's1', title: 5, processTime: 0, notes: null, fremd: 1 }, { title: 'ohne' }, { id: '' }],
    });
    assertDeepEqual(out.roles, [{ id: 'r1', label: 'A' }, { id: 'r2', label: '' }]);
    assertDeepEqual(out.steps, [{
      id: 's1', title: '5', description: '', roleIds: [], processTime: '', waitTime: '', mudaIds: [], notes: '',
    }]);
  });
  test('roleIds/mudaIds: nur Texte, verwaiste entfallen, Doppel bleiben wie in der Altform', () => {
    const out = from0({
      roles: [{ id: 'r1', label: '' }],
      steps: [{ id: 's1', roleIds: ['r1', 'r-weg', 7, 'r1'], mudaIds: ['muda-waiting', 'muda-weg', null] }],
    });
    assertDeepEqual(out.steps[0].roleIds, ['r1', 'r1']);
    assertDeepEqual(out.steps[0].mudaIds, ['muda-waiting']);
  });
  test('expanded === false wird die id in collapsed, jeder andere Wert aufgeklappt', () => {
    const out = from0({ steps: [
      { id: 'a', expanded: false }, { id: 'b', expanded: true }, { id: 'c', expanded: 'nein' }, { id: 'd' }, { id: 'a', expanded: false },
    ] });
    assertDeepEqual(out.collapsed, ['a']);
    assertEqual(Object.hasOwn(out.steps[0], 'expanded'), false);
  });
  test('Arten: leer oder fehlend → Vorgaben; id fehlend → muda-<Position>; Farbe fehlend → #888888; fremder labelKey entfällt', () => {
    assertDeepEqual(from0({ mudaCategories: [] }).mudaCategories, createDefaultMudaCategories());
    const out = from0({ mudaCategories: [
      { id: 'muda-fremd', code: 'F', labelKey: 'muda.fremd', label: '', color: '#aa0000' },
      { code: 'X', label: 'ohne id' },
      { id: 'muda-transport', code: 'T', labelKey: 'muda.transport', label: 'Botengang', color: '#4a90e2' },
      null,
      { id: 7, code: 3 },
    ] });
    assertDeepEqual(out.mudaCategories, [
      { id: 'muda-fremd', code: 'F', label: '', color: '#aa0000' },
      { id: 'muda-2', code: 'X', label: 'ohne id', color: '#888888' },
      { id: 'muda-transport', code: 'T', label: 'Botengang', color: '#4a90e2', labelKey: 'muda.transport' },
      { id: '7', code: '3', label: '', color: '#888888' },
    ]);
  });
  test('Ersatz-id kollidiert nicht mit einer vorhandenen', () => {
    const out = from0({ mudaCategories: [{ id: 'muda-2' }, { code: 'X' }], timeUnits: [{ id: 'unit-2', factorSeconds: 1 }, { factorSeconds: 2 }] });
    assertDeepEqual(out.mudaCategories.map((c) => c.id), ['muda-2', 'muda-2_']);
    assertDeepEqual(out.timeUnits.map((u) => u.id), ['unit-2', 'unit-2_']);
  });
  test('Einheiten: Faktor nicht endlich oder ≤ 0 entfällt, Text-Faktor wird Zahl, keine übrig → Vorgaben', () => {
    const out = from0({ timeUnits: [
      { id: 'u1', label: 'ok', factorSeconds: 60 },
      { id: 'u2', label: 'neg', factorSeconds: -5 },
      { id: 'u3', label: 'txt', factorSeconds: 'x' },
      { id: 'u4', label: 'null', factorSeconds: 0 },
      { label: 'str', factorSeconds: '120' },
    ] });
    assertDeepEqual(out.timeUnits, [{ id: 'u1', label: 'ok', factorSeconds: 60 }, { id: 'unit-5', label: 'str', factorSeconds: 120 }]);
    assertDeepEqual(from0({ timeUnits: [{ id: 'u', factorSeconds: 0 }] }).timeUnits, createDefaultTimeUnits());
    assertDeepEqual(from0({ timeUnits: [] }).timeUnits, createDefaultTimeUnits());
  });
  test('settingsOpen nur als Wahrheitswert, fremde Schlüssel entfallen', () => {
    assertEqual(from0({ settingsOpen: true }).settingsOpen, true);
    assertEqual(from0({ settingsOpen: false }).settingsOpen, false);
    assertEqual(Object.hasOwn(from0({ settingsOpen: 'ja' }), 'settingsOpen'), false);
    assertEqual(Object.hasOwn(from0({ fremd: 1, _idCounter: 3 }), 'fremd'), false);
  });
});

suite('makigami Migration — Altprojekt', () => {
  test('(a) lädt ohne Reparatur, alle Altwerte, Karte s-2 zugeklappt, Kennzahlen wie die Altform', async () => {
    const states = await legacyStates();
    const { m, fields } = load(plain(states[IDS.a]));
    assertDeepEqual(fields, []);
    const j = plain(m.toJSON());
    assertEqual(j.title, 'Reklamation & Gutschrift <Q4>');
    assertDeepEqual(j.collapsed, ['s-2']);
    assertEqual(j.settingsOpen, true);
    assertDeepEqual(j.steps.map((s) => s.mudaIds), [['muda-motion', 'muda-medien'], ['muda-waiting'], [], ['muda-defects', 'muda-overprocessing']]);
    assertDeepEqual(j.mudaCategories.at(-1), { id: 'muda-medien', code: 'B', label: 'Medienbruch', color: '#336699' });
    assertDeepEqual(j.timeUnits.at(-1), { id: 'unit-wk', label: 'wk', factorSeconds: 144000 });
    const d = evaluateDerived(m, /** @type {any} */ (undefined), ['kpi', 'invalidTimes']);
    assertDeepEqual([d.kpi.process, d.kpi.wait, d.kpi.lead], [6900, 219600, 226500]);
    assertDeepEqual(d.invalidTimes, [{ stepId: 's-3', field: 'processTime' }]);
  });
  test('(b) doppelte Schritt-id: die spätere entfällt (Reparatur uniqueIds), verwaiste Bezüge entfallen, leere Arten → Vorgaben', async () => {
    const states = await legacyStates();
    const { m, fields } = load(plain(states[IDS.b]));
    assertTrue(fields.includes('steps'), JSON.stringify(fields));
    const j = plain(m.toJSON());
    assertDeepEqual(j.roles.map((r) => r.id), ['r-1', 'r-2']);
    assertDeepEqual(j.steps.map((s) => [s.id, s.title, s.roleIds, s.mudaIds]), [
      ['s-1', 'Kommissionieren', ['r-1'], ['muda-waiting']],
      ['s-2', 'Verpacken', ['r-2'], ['muda-motion']],
    ]);
    assertDeepEqual(j.mudaCategories, createDefaultMudaCategories());
    assertDeepEqual(j.timeUnits.map((u) => [u.id, u.label]), [['unit-s', 's'], ['unit-3', 'min'], ['unit-h', 'h']]);
    const d = evaluateDerived(m, /** @type {any} */ (undefined), ['kpi']);
    assertDeepEqual([d.kpi.process, d.kpi.wait, d.kpi.lead], [2400, 10800, 13200]);
  });
  test('(c) fremder labelKey entfällt, Art ohne id → muda-2, leere Einheiten → Vorgaben, expanded: "nein" aufgeklappt', async () => {
    const states = await legacyStates();
    const { m, fields } = load(plain(states[IDS.c]));
    assertDeepEqual(fields, []);
    const j = plain(m.toJSON());
    assertDeepEqual(j.mudaCategories.map((c) => [c.id, c.labelKey ?? null]), [['muda-fremd', null], ['muda-2', null], ['muda-transport', 'muda.transport']]);
    assertDeepEqual(j.timeUnits, createDefaultTimeUnits());
    assertDeepEqual(j.collapsed, []);
    assertEqual(j.settingsOpen, false);
  });
});
