/**
 * FMEA: '0→1.0' (domain/migrations.js) übernimmt jeden Stand des alten
 * `State.fromJSON`: fehlendes `method` → rpn, S/O/D aus Ganzzahltext → Zahl,
 * auf 1–10 geklemmt, sonst null (A9), Senkungen aus Ganzzahltext oder Zahl,
 * auf 0–9 geklemmt, ids fest aus der
 * Position (`x<n>`, `a<n>`), `collapsed` als id-Liste, Skalentexte nur unter
 * bekannten Schlüsseln. Dazu Altprojekt, goldene Fixtures und Beispiel.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { from0 } from '../../../js/modules/fmea/domain/migrations.js';
import { State } from '../../../js/modules/fmea/domain/model.js';
import { setModelName } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { LEGACY_STATE } from './legacy.js';

setModelName(State, 'fmea');

const FIXTURES = new URL('../../fixtures/exports/', import.meta.url);
const EXAMPLE = new URL('../../../js/modules/fmea/resources/examples/projects/fmea-pizza-lieferprozess.json', import.meta.url);
const plain = (v) => JSON.parse(JSON.stringify(v));

/** @param {URL} url */
async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${url}: HTTP ${res.status}`);
  return res.json();
}

/** Alle FMEA-Zustände eines Exports. @param {any} v @param {any[]} [acc] */
function fmeaStates(v, acc = []) {
  if (Array.isArray(v)) v.forEach((x) => fmeaStates(x, acc));
  else if (v && typeof v === 'object') {
    if (v.phases && v.moduleStates) {
      for (const list of Object.values(v.phases)) {
        for (const e of Array.isArray(list) ? list : []) {
          if (e?.moduleId === 'fmea') acc.push(v.moduleStates[e.instanceId] ?? e.state);
        }
      }
    }
    Object.values(v).forEach((x) => fmeaStates(x, acc));
  }
  return acc;
}

/** Laden mit Reparatur; meldet die reparierten Felder. */
function repaired(j) {
  const fields = [];
  const m = State.fromJSON(j, { repair: true, onRepair: (f) => fields.push(f) });
  return { m, fields };
}

const risk = (over = {}) => ({ step: '', failureMode: '', effect: '', cause: '', prevention: '', control: '',
  specialChar: '', justification: '', sev: '', occ: '', det: '', actions: [], ...over });

suite('fmea from0: Kopf', () => {
  test('fehlendes oder fremdes method → rpn, bekanntes bleibt; fmeaType fremd → process', () => {
    assertEqual(from0({}).method, 'rpn');
    assertEqual(from0({ method: 'xyz' }).method, 'rpn');
    assertEqual(from0({ method: 'ap' }).method, 'ap');
    assertEqual(from0({ fmeaType: 'design' }).fmeaType, 'design');
    assertEqual(from0({ fmeaType: 7 }).fmeaType, 'process');
  });
  test('Nicht-Objekt und fehlende Liste ergeben leere Risiken', () => {
    assertDeepEqual(from0(null), { method: 'rpn', fmeaType: 'process', risks: [], scales: {}, collapsed: [] });
    assertDeepEqual(from0({ risks: 'x' }).risks, []);
  });
  test('zweimal gleich (feste ids)', () => {
    assertDeepEqual(from0(LEGACY_STATE), from0(LEGACY_STATE));
  });
});

suite('fmea from0: Risiken', () => {
  test('S/O/D: Ganzzahltext (auch mit Rand) wird Zahl, außerhalb 1–10 geklemmt, sonst null (A9)', () => {
    const [r] = from0({ risks: [risk({ sev: '15', occ: '7abc', det: ' 7 ' })] }).risks;
    assertEqual(r.sev, 10); assertEqual(r.occ, null); assertEqual(r.det, 7);
    const [z] = from0({ risks: [risk({ sev: 7, occ: '0', det: '10' })] }).risks;
    assertEqual(z.sev, null, 'Zahl las das alte fromJSON als leer');
    assertEqual(z.occ, 1); assertEqual(z.det, 10);
    const [n] = from0({ risks: [risk({ sev: '-3', occ: '', det: '7.5' })] }).risks;
    assertEqual(n.sev, 1); assertEqual(n.occ, null); assertEqual(n.det, null);
  });
  test('Senkungen: Ganzzahltext oder ganze Zahl, auf 0–9 geklemmt, sonst 0', () => {
    const [r] = from0({ risks: [risk({ actions: [{ deltaS: '3', deltaO: 2, deltaD: '12' }, { deltaS: 'x', deltaO: 1.5, deltaD: null }, { deltaS: -2, deltaO: 14, deltaD: '-1' }] })] }).risks;
    assertDeepEqual(r.actions.map((a) => [a.deltaS, a.deltaO, a.deltaD]), [[3, 2, 9], [0, 0, 0], [0, 9, 0]]);
  });
  test('Texte nur als Text, Merkmal nur CC/SC, Nicht-Objekt wird leeres Risiko', () => {
    const { risks } = from0({ risks: [risk({ step: 5, failureMode: 'F', specialChar: 'XX' }), 'kaputt'] });
    assertEqual(risks[0].step, ''); assertEqual(risks[0].failureMode, 'F'); assertEqual(risks[0].specialChar, '');
    assertEqual(risks[1].id, 'x2'); assertEqual(risks[1].actions.length, 0);
  });
  test('ids: vorhandene bleiben, fehlende und doppelte → x<n>, Maßnahmen a<n> je Risiko', () => {
    const { risks } = from0({ risks: [risk({ id: 'r1', actions: [{}, { id: 'k' }] }), risk(), risk({ id: 'r1' }), risk({ id: 'x2' })] });
    assertDeepEqual(risks.map((r) => r.id), ['r1', 'x2_', 'x3', 'x2']);
    assertDeepEqual(risks[0].actions.map((a) => a.id), ['a1', 'k']);
  });
  test('collapsed: true wird die id in collapsed', () => {
    const out = from0({ risks: [risk({ id: 'r1', collapsed: true }), risk({ collapsed: 'ja' }), risk({ collapsed: true })] });
    assertDeepEqual(out.collapsed, ['r1', 'x3']);
  });
});

suite('fmea from0: Skalen', () => {
  test('bekannte Schlüssel mit Text bleiben, Zahl wird Text, Rest entfällt', () => {
    const out = from0({ scales: { sevHigh: 'A', occLowRate: 5, 'ap.design.det.3.criterion': 'B', legacy: 'x', sevMod: null } });
    assertDeepEqual(out.scales, { sevHigh: 'A', occLowRate: '5', 'ap.design.det.3.criterion': 'B' });
    assertDeepEqual(from0({ scales: null }).scales, {});
    assertDeepEqual(from0({ scales: ['x'] }).scales, {});
  });
});

suite('fmea from0: Altprojekt, Fixtures, Beispiel', () => {
  test('Altprojekt aus Task 0: ids, Stufen, Senkungen, collapsed, Skalen', () => {
    const m = State.fromJSON(LEGACY_STATE);
    const j = plain(m.toJSON());
    assertEqual(j.method, 'rpn');
    assertEqual(j.fmeaType, 'design');
    assertDeepEqual(j.risks.map((r) => r.id), ['r1', 'x2', 'r3']);
    assertDeepEqual(j.risks.map((r) => [r.sev, r.occ, r.det]), [[9, 4, 6], [10, 3, 2], [7, 7, 7]]);
    assertDeepEqual(j.risks[0].actions.map((a) => [a.id, a.deltaO, a.deltaD, a.done, a.date]),
      [['a1', 2, 3, true, '2026-03-02'], ['a2', 1, 0, false, '2026-04-15']]);
    assertDeepEqual(j.risks[1].actions.map((a) => [a.id, a.deltaD]), [['a1', 3]]);
    assertDeepEqual(j.collapsed, ['r3']);
    assertDeepEqual(j.scales, { sevHigh: 'Kunde verärgert (eigener Text)', 'ap.design.sev.10.meaning': 'Gefahr für Leib und Leben (eigener Text)' });
    assertTrue(!('legacyNote' in j.scales));
  });
  test('Altprojekt lädt ohne Reparatur; Kennzahlen bis auf S 15 → 10 wie die Altform', () => {
    const { m, fields } = repaired(LEGACY_STATE);
    assertDeepEqual(fields, []);
    const d = evaluateDerived(m, /** @type {any} */ (undefined));
    // Altform: RPN 216/90/343, Ø 216, S ≥ 9 2 — S '15' wird auf 10 geklemmt (A9):
    // RPN 10·3·2 = 60, Ziel 10·3·1 = 30, Ø 206, S ≥ 9 bleibt 2.
    assertDeepEqual(plain(d.stats), { kind: 'rpn', total: 3, critical: 2, high: 0, medium: 1, low: 0, highSeverity: 2, avg: 206, max: 343 });
    assertDeepEqual(d.riskRatings.map((r) => [r.riskId, r.rpn, r.projRpn, r.ap, r.projAp]),
      [['r1', 216, 27, 'H', 'L'], ['x2', 60, 30, 'L', 'L'], ['r3', 343, 343, 'H', 'H']]);
  });
  test('goldene Fixtures: fremde Form lädt, Risiken bleiben mit id und leer', async () => {
    const files = ['v0.2.0_all_projects.json', 'v0.2.0_single_project.json', 'v0.3.0_all_projects.json',
      'v0.3.0_single_project.json', 'v0.5.0_8d_project.json'];
    let n = 0;
    for (const f of files) {
      for (const st of fmeaStates(await fetchJSON(new URL(f, FIXTURES)))) {
        n++;
        const { m, fields } = repaired(st);
        assertDeepEqual(fields, [], f);
        assertTrue(m.risks.length > 0, f);
        for (const r of m.risks) {
          assertTrue(r.id !== '', f);
          assertEqual(r.failureMode, '', f);
          assertEqual(r.sev, null, f);
        }
        assertEqual(m.method, 'rpn', f);
      }
    }
    assertEqual(n, 5);
  });
  test('Beispiel lädt ohne Reparatur; Kennzahlen und Bewertungen gleich der Altform', async () => {
    const ex = await fetchJSON(EXAMPLE);
    const { m, fields } = repaired(ex);
    assertDeepEqual(fields, []);
    assertDeepEqual(m.risks.map((r) => r.id), ['r1', 'r2', 'r3', 'r4', 'r5']);
    assertDeepEqual(m.risks.map((r) => r.actions.map((a) => a.id)), [['a1', 'a2'], ['a1', 'a2'], ['a1', 'a2'], ['a1', 'a2'], []]);
    const d = evaluateDerived(m, /** @type {any} */ (undefined));
    assertDeepEqual(plain(d.stats), { kind: 'ap', total: 5, rated: 5, high: 2, medium: 3, low: 0, unjustified: 0 });
    assertDeepEqual(plain(d.riskRatings), [
      { riskId: 'r1', rpn: 140, ap: 'M', projRpn: 28, projAp: 'L', needsJustification: false },
      { riskId: 'r2', rpn: 144, ap: 'M', projRpn: 45, projAp: 'L', needsJustification: false },
      { riskId: 'r3', rpn: 320, ap: 'H', projRpn: 48, projAp: 'L', needsJustification: false },
      { riskId: 'r4', rpn: 210, ap: 'M', projRpn: 45, projAp: 'L', needsJustification: false },
      { riskId: 'r5', rpn: 216, ap: 'H', projRpn: 216, projAp: 'H', needsJustification: false },
    ]);
    m.method = 'rpn';
    assertDeepEqual(plain(evaluateDerived(m, /** @type {any} */ (undefined), ['stats']).stats),
      { kind: 'rpn', total: 5, critical: 3, high: 2, medium: 0, low: 0, highSeverity: 1, avg: 206, max: 320 });
  });
});
