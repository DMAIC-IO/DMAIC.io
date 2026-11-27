/**
 * Activity-Flowchart: Migration '0→1.0' (domain/migrations.js) — die Fälle des
 * alten `fromJSON` in der neuen Form, die Altinstanzen des Altprojekts gegen
 * das `read()` der Altform (`legacy-read.json`) und Handfälle, die erst die
 * Reparatur heilt.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { from0 } from '../../../js/modules/activity-flowchart/domain/migrations.js';
import { State } from '../../../js/modules/activity-flowchart/domain/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';

async function fetchJson(path) {
  const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

/** @param {() => any} fn @returns {any} der geworfene Fehler */
function errorOf(fn) {
  try { fn(); } catch (err) { return err; }
  throw new Error('Expected function to throw');
}

const plain = (v) => JSON.parse(JSON.stringify(v));
const T = (key, p) => ({ mainPath: 'Hauptpfad', unnamedDecision: '(ohne Frage)', bandLabel: `Nein: ${p?.q}` })[key] ?? key;
const KEYS = ['id', 'title', 'description', 'kind', 'branchId', 'decision', 'substeps'];

/**
 * Ein Schritt aus dem `read()` der Altform in der Zielform: Schlüssel des
 * Schemas, ohne `expanded` und fremde Schlüssel (A5, A8).
 * @param {any} s
 */
function asTarget(s) {
  return Object.fromEntries(KEYS.map((k) => [k, k === 'substeps' ? s.substeps.map(({ id, title }) => ({ id, title })) : s[k]]));
}

suite('Activity-Flowchart Migration 0→1.0', () => {
  test('leerer Altstand und Unlesbares: keine Schritte', () => {
    assertDeepEqual(from0({}), { steps: [], expanded: [] });
    assertDeepEqual(from0({ steps: 'kaputt' }), { steps: [], expanded: [] });
    assertDeepEqual(from0({ steps: [null, 7, 'x', []] }), { steps: [], expanded: [] });
  });

  test('Vorgaben je Schritt: Texte, Art, Band, decision nur bei der Raute', () => {
    const out = from0({ steps: [{ id: 'a', title: 3, kind: 'loop', decision: { label: 'L', noTarget: 'end' } }] });
    assertDeepEqual(out.steps, [{ id: 'a', title: '', description: '', kind: 'activity', branchId: 'main', decision: null, substeps: [] }]);
  });

  test('decision der Raute: next und Fehlendes → end, yesTarget entfällt, Label nur Text', () => {
    const out = from0({ steps: [
      { id: 'a', kind: 'decision', decision: { label: 'Q', noTarget: 'next', yesTarget: 'b' } },
      { id: 'b', kind: 'decision' },
      { id: 'c', kind: 'decision', decision: { label: 5, noTarget: '' } },
    ] });
    assertDeepEqual(out.steps.map((s) => s.decision), [
      { label: 'Q', noTarget: 'end' }, { label: '', noTarget: 'end' }, { label: '', noTarget: 'end' },
    ]);
  });

  test('Ziel auf unbekannte oder eigene id wird end (A9), anderes bleibt', () => {
    const out = from0({ steps: [
      { id: 'a', kind: 'decision', decision: { noTarget: 'a' } },
      { id: 'b', kind: 'decision', decision: { noTarget: 'zz' } },
      { id: 'c', kind: 'decision', decision: { noTarget: 'a' } },
    ] });
    assertDeepEqual(out.steps.map((s) => s.decision.noTarget), ['end', 'end', 'a']);
  });

  test('Bänder: ohne branchId Hauptpfad; Band einer späteren oder fehlenden Raute → main', () => {
    const out = from0({ steps: [
      { id: 'x', branchId: 'no:D' }, { id: 'D', kind: 'decision' }, { id: 'y', branchId: 'no:D' },
      { id: 'z', branchId: 'no:' }, { id: 'w', branchId: 'no:x' }, { id: 'v', branchId: 42 },
    ] });
    assertDeepEqual(out.steps.map((s) => s.branchId), ['main', 'main', 'no:D', 'main', 'main', 'main']);
  });

  test('fehlende ids fest aus der Position, vorhandene bleiben, Kollision mit _', () => {
    const out = from0({ steps: [
      { title: 'A', substeps: [{ title: 'u' }, { id: 'ss0m0_1', title: 'v' }, 'kaputt'] },
      { id: 's0m0', title: 'B' },
      { id: '', title: 'C' },
    ] });
    assertDeepEqual(out.steps.map((s) => s.id), ['s0m0_', 's0m0', 's0m2']);
    assertDeepEqual(out.steps[0].substeps, [{ id: 'ss0m0_0', title: 'u' }, { id: 'ss0m0_1', title: 'v' }]);
  });

  test('expanded: true wird Ansichtsfeld, fremde Schlüssel entfallen', () => {
    const out = from0({ steps: [{ id: 'a', expanded: true, owner: 'x' }, { id: 'b', expanded: 'ja' }] });
    assertDeepEqual(out.expanded, ['a']);
    assertDeepEqual(Object.keys(out.steps[0]), KEYS);
  });

  test('Altprojekt (a) lädt ohne Reparatur und gleicht dem read() der Altform (A5, A8, A9)', async () => {
    const fx = await fetchJson('./legacy-project.json');
    const want = (await fetchJson('./legacy-read.json')).de.a;
    const [rawA] = Object.values(fx.moduleStates);
    const m = State.fromJSON(plain(rawA));
    const steps = want.steps.map(asTarget);
    for (const s of steps) if (s.id === 'a4' || s.id === 'a5') s.decision = { ...s.decision, noTarget: 'end' };
    assertDeepEqual(plain(m.steps), steps);
    assertDeepEqual(plain(m.expanded), ['a1']);
    assertDeepEqual(evaluateDerived(m, null, undefined, T).bands, want.bands);
  });

  test('Altprojekt (b): feste Ersatz-ids statt der Zufalls-ids der Altform, sonst wie read()', async () => {
    const fx = await fetchJson('./legacy-project.json');
    const want = (await fetchJson('./legacy-read.json')).de.b;
    const [, rawB] = Object.values(fx.moduleStates);
    const m = State.fromJSON(plain(rawB));
    const steps = want.steps.map(asTarget);
    steps[0].id = 's0m0';
    steps[0].substeps[0].id = 'ss0m0_0';
    steps[1].id = 's0m1';
    assertDeepEqual(plain(m.steps), steps);
    assertDeepEqual(evaluateDerived(m, null, undefined, T).bands.map((b) => [b.id, b.ownerId, b.label]),
      [['main', null, 'Hauptpfad'], ['no:s0m1', 's0m1', 'Nein: (ohne Frage)']]);
  });

  test('Handfälle mit gleichem Format: doppelte id und decision an einer Aktivität brauchen die Reparatur', () => {
    const raw = { _schema: { version: '1.0' }, steps: [
      { id: 'a', title: '1', description: '', kind: 'activity', branchId: 'main', decision: { label: 'x', noTarget: 'end' }, substeps: [] },
      { id: 'a', title: '2', description: '', kind: 'activity', branchId: 'main', decision: null, substeps: [] },
    ] };
    assertTrue(typeof errorOf(() => State.fromJSON(plain(raw))).invariant === 'string', 'strenges Laden lehnt ab');
    const fields = [];
    const m = State.fromJSON(plain(raw), { repair: true, onRepair: (f) => fields.push(f) });
    assertDeepEqual(m.steps.map((s) => [s.title, s.decision]), [['1', null]]);
    assertTrue(fields.length > 0, 'Reparatur gemeldet');
  });

  test('ein Altstand mit Rauten migriert ohne Reparatur und bleibt nach toJSON gleich', () => {
    const m = State.fromJSON({ steps: [{ id: 'D', kind: 'decision', decision: { label: 'Q', noTarget: 'x' } }, { id: 'x', branchId: 'no:D' }] });
    const again = State.fromJSON(m.toJSON());
    assertDeepEqual(plain(again.steps), plain(m.steps));
    assertEqual(m.steps[1].branchId, 'no:D');
  });
});
