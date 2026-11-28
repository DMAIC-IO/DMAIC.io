/**
 * Tests for js/modules/doe-planner/domain/migrations.js — step '0→1.0' from
 * every stored form (version 3 and older), the examples and the golden
 * export fixtures; signatures and snapshot of migrated plans.
 */
import { suite, test, assert, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { from0 } from '../../../js/modules/doe-planner/domain/migrations.js';
import { State } from '../../../js/modules/doe-planner/domain/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { storedSource } from '../../helpers/stored-source.js';
import { configSignature, designSignature } from '../../../js/modules/doe-planner/domain/signatures.js';
import { snapshotOf } from '../../../js/modules/doe-planner/domain/experiment.js';
import { generateDesign } from '../../../js/engines/doe-planner-engine.js';
import { EXAMPLES } from './cases.js';

/** The design signature the earlier planner stored (responses included). @param {any} m @returns {string} */
function legacyDesignSignature(m) {
  return [
    m.design.designType,
    m.design.codedMatrix.length,
    m.responses.length,
    m.responses.map((r) => `${r.name}|${r.unit}`).join('||'),
    m.design.codedMatrix.map((r) => r.join(',')).join(';'),
  ].join('#');
}

const FIXTURES = new URL('../../fixtures/exports/', import.meta.url);
const PROJECTS = new URL('../../../js/modules/doe-planner/resources/examples/projects/', import.meta.url);
const FILES = [
  'v0.2.0_all_projects.json', 'v0.2.0_single_project.json', 'v0.3.0_all_projects.json', 'v0.3.0_single_project.json',
  'v0.5.0_8d_project.json', 'v0.9.0_single_project.json', 'v1.0.0_single_project.json', 'v1.1.0_single_project.json',
  'v1.2.0_single_project.json', 'v1.3.0_single_project.json', 'v1.4.0_single_project.json', 'v1.5.0_single_project.json',
];

/** @param {URL} base @param {string} file @returns {Promise<any>} */
async function fetchJSON(base, file) {
  const res = await fetch(new URL(file, base), { cache: 'no-cache' });
  return res.json();
}

/** Every planner state (factors and designType) in a project export. @param {any} v @param {any[]} [acc] @returns {any[]} */
function plannerStates(v, acc = []) {
  if (Array.isArray(v)) v.forEach((x) => plannerStates(x, acc));
  else if (v && typeof v === 'object') {
    if (Array.isArray(v.factors) && 'designType' in v && ('responses' in v || 'options' in v)) acc.push(v);
    else Object.values(v).forEach((x) => plannerStates(x, acc));
  }
  return acc;
}

/** @param {any} s stored state @returns {{ m: any, reports: string[] }} */
function load(s) {
  const reports = [];
  const m = State.fromJSON(JSON.parse(JSON.stringify(s)), { onRepair: (name) => reports.push(name) });
  return { m, reports };
}

/** The derived values of a model, without worksheet. @param {any} m @param {any} [data] */
const derived = (m, data = emptyData()) => evaluateDerived(m, data);

/** A reader (`Source`) without worksheets. */
function emptyData() {
  return storedSource({});
}

/** A reader (`Source`) over one sheet. @param {string} instanceId @param {string} sheetId @param {Record<string, any[]>} columns */
function sheetData(instanceId, sheetId, columns, rowCount = 4) {
  return storedSource({ [instanceId]: { sheets: [{ id: sheetId, name: sheetId, state: {
    rowCount, columns: Object.entries(columns).map(([id, values]) => ({ id, name: id, type: 'numeric', values })),
  } }] } });
}

/** A version-3 plan with a 2² design generated as the earlier planner did. */
function legacyPlan() {
  const factors = [
    { id: 1, name: 'Temp', unit: '°C', kind: 'continuous', levels: ['20', '60'] },
    { id: 2, name: 'Druck', unit: 'bar', kind: 'continuous', levels: ['1', '2'] },
  ];
  const responses = [{ name: 'Yield', unit: '%' }];
  const design = generateDesign(factors, { designType: 'full', randomize: false, replicates: 1, forbiddenVertices: [] });
  return {
    version: 3,
    doeName: 'Ofen',
    designType: 'full',
    factors,
    responses,
    options: { randomize: false, centerPoints: false, replicates: 1, alphaType: 'rotatable', ccdCenterPoints: 3,
      bbCenterPoints: 3, taguchiArray: '', optimalRuns: 0, optimalActiveTerms: null, forbiddenVertices: [] },
    selectedRes: null,
    selectedPBIdx: null,
    design,
    previewEdits: null,
    previewDirty: true,
    worksheetRef: null,
    sourceWorksheet: null,
    evaluation: { efficiency: {}, vif: [], aliasStructure: null, power: [] },
    analysisResponseIdx: 0,
    fid: 2,
    projectMode: false,
    projectName: '',
    projectPhases: [],
    activePhaseIdx: -1,
  };
}

/** A binding of `plan` with `designSignature`. @param {string|undefined} sig */
function binding(sig) {
  const ref = {
    instanceId: 'ws-1', sheetId: 's-1', factorColumnIds: ['f1', 'f2'], responseColumnIds: ['y1'],
    meanColumnIds: [], lnVarColumnIds: [], runOrderColumnId: 'run', stdOrderColumnId: 'std', experimentId: 'exp-1',
  };
  if (sig !== undefined) ref.designSignature = sig;
  return ref;
}

suite('doe-planner Migration — Beispiele und goldene Fixtures', () => {
  test('die fünf Beispiele laden ohne Reparatur, Faktor-ids unverändert', async () => {
    for (const name of EXAMPLES) {
      const states = plannerStates(await fetchJSON(PROJECTS, `${name}.json`));
      assert(states.length > 0, `${name}: Planerzustand gefunden`);
      for (const s of states) {
        const { m, reports } = load(s);
        assertDeepEqual(reports, [], name);
        assertDeepEqual(m.factors.map((f) => f.id), s.factors.map((f) => f.id), name);
        assertDeepEqual(m.factors.map((f) => f.levels), s.factors.map((f) => f.levels), name);
        assertEqual(m.seed, 0);
      }
    }
  });

  test('alle Planerzustände der Exporte laden ohne Reparatur; fehlende ids werden 1 … n', async () => {
    let count = 0;
    for (const file of FILES) {
      for (const s of plannerStates(await fetchJSON(FIXTURES, file))) {
        count += 1;
        const { m, reports } = load(s);
        assertDeepEqual(reports, [], file);
        assertEqual(m.factors.length, s.factors.length, file);
        assertDeepEqual(m.factors.map((f) => f.id), s.factors.map((_, i) => i + 1), file);
        assertDeepEqual(m.responses.map((r) => r.name), s.responses.map((r) => r.name), file);
        assertEqual(m.activePhaseIdx, -1, `${file}: Phase ohne Phasen geheilt`);
      }
    }
    assert(count >= 15, `Exporte mit Planerzuständen (${count})`);
  });

  test('Mittelpunkt-Anzahl der Exporte wird der Schalter, fremde Optionen entfallen', async () => {
    const [s] = plannerStates(await fetchJSON(FIXTURES, 'v0.3.0_single_project.json'));
    const m = State.fromJSON(s);
    assertEqual(m.options.centerPoints, true);
    assertEqual(m.options.randomize, true);
    assertEqual(m.options.replicates, 1);
    assertEqual('seed' in m.options || 'blockCount' in m.options, false);
    assertEqual(m.selectedPBIdx, 0);
  });

  test('das Beispiel mit Plan: Plan bleibt, gilt als aktuell, Matrix als Text', async () => {
    const [s] = plannerStates(await fetchJSON(PROJECTS, 'doe-planner-hubschrauber-flyer.json'));
    const m = State.fromJSON(s);
    assertDeepEqual(m.design.codedMatrix, s.design.codedMatrix);
    assertDeepEqual(m.design.actualMatrix, s.design.actualMatrix.map((row) => row.map(String)));
    assertEqual(m.design.configSignature, configSignature(m));
    assertEqual(derived(m).pending, false);
    assertDeepEqual(m.previewEdits, s.previewEdits);
  });

  test('der Fixture-Satz doe-planner.fixtures.json hat keine Planerzustände', async () => {
    const data = await fetchJSON(new URL('../../fixtures/doe/', import.meta.url), 'doe-planner.fixtures.json');
    assertDeepEqual(plannerStates(data), []);
  });
});

suite('doe-planner Migration — Altformen', () => {
  test('version 3, Assistentenfelder, evaluation, previewDirty, fid entfallen', () => {
    const out = from0({ ...legacyPlan(), currentStep: 2, maxVisitedStep: 3 });
    for (const key of ['version', 'currentStep', 'maxVisitedStep', 'evaluation', 'previewDirty', 'fid']) {
      assertEqual(key in out, false, key);
    }
    const m = State.fromJSON(out);
    assertEqual('version' in m.toJSON(), false);
    assertEqual(m.doeName, 'Ofen');
  });

  test('lo/hi werden Stufen, fehlende Art ist stetig, kategorisch bleibt', () => {
    const m = State.fromJSON({
      factors: [
        { id: 1, name: 'A', unit: '', lo: '10', hi: 20 },
        { id: 2, name: 'B', kind: 'categorical', levels: ['x', 'y'] },
      ],
    });
    assertDeepEqual(m.factors[0].levels, ['10', '20']);
    assertEqual('lo' in m.factors[0] || 'hi' in m.factors[0], false);
    assertEqual(m.factors[0].kind, 'continuous');
    assertEqual(m.factors[1].kind, 'categorical');
  });

  test('vorhandene ids bleiben, nur fehlende werden ergänzt', () => {
    const m = State.fromJSON({ factors: [{ id: 7, name: 'A', levels: ['1', '2'] }, { name: 'B', levels: ['1', '2'] }, { id: 3, name: 'C', levels: ['1', '2'] }] });
    assertDeepEqual(m.factors.map((f) => f.id), [7, 8, 3]);
  });

  test('optimalQuadratic/optimalExcludedInteractions werden aktive Terme', () => {
    const m = State.fromJSON({
      factors: [{ id: 1, name: 'A', levels: ['1', '2'] }, { id: 2, name: 'B', levels: ['1', '2'] }],
      options: { optimalQuadratic: true, optimalExcludedInteractions: [] },
    });
    assert(Array.isArray(m.options.optimalActiveTerms), 'aktive Terme');
    assertEqual('optimalQuadratic' in m.options || 'optimalExcludedInteractions' in m.options, false);
  });

  test('fehlende Optionen bekommen ihre Vorgabe', () => {
    const m = State.fromJSON({ options: { optimalRuns: 7 } });
    assertEqual(m.options.optimalRuns, 7);
    assertEqual(m.options.randomize, true);
    assertEqual(m.options.replicates, 1);
  });

  test('ohne Faktoren und Zielgrößen die Vorgabe eines frischen Planers', () => {
    const m = State.fromJSON({ factors: [], responses: [] });
    assertEqual(m.factors.length, 2);
    assertEqual(m.responses.length, 1);
    assertEqual(m.hasContent(), false);
  });

  test('worksheetRef.experimentId und projectPhases[].evaluation entfallen', () => {
    const plan = legacyPlan();
    plan.worksheetRef = binding(undefined);
    plan.projectMode = true;
    plan.projectPhases = [{
      cycleNumber: 1, doeName: 'P1', factors: plan.factors, responses: plan.responses, designType: 'full',
      options: plan.options, design: plan.design, worksheetRef: binding(undefined), evaluation: { vif: [] },
      decision: 'repeat', completedAt: '2026-01-01T00:00:00.000Z', yValues: [10, '12,5', null, 20],
    }];
    plan.activePhaseIdx = 0;
    const { m, reports } = load(plan);
    assertDeepEqual(reports, []);
    assertEqual('experimentId' in m.worksheetRef, false);
    const ph = m.projectPhases[0];
    assertEqual('evaluation' in ph, false);
    assertEqual('experimentId' in ph.worksheetRef, false);
    assertDeepEqual(ph.yValues, [[10, 12.5, null, 20]]);
    assertEqual(ph.design.configSignature, m.design.configSignature);
    assertEqual(m.activePhaseIdx, 0);
  });

  test('unlesbare Werte bleiben stehen; Laden mit Reparatur verwirft nur sie', () => {
    const plan = legacyPlan();
    plan.factors = [...plan.factors, { id: 3, name: { x: 1 }, levels: ['1', '2'] }];
    const out = from0(JSON.parse(JSON.stringify(plan)));
    assertDeepEqual(out.factors[2].name, { x: 1 });
    assertEqual(out.design.configSignature, '');
    const m = State.fromJSON(plan, { repair: true });
    assertDeepEqual(m.factors.map((f) => f.name), ['Temp', 'Druck']);
    assertEqual(m.doeName, 'Ofen');
  });

  test('Quellblatt eines Beispiels: der Platzhalter wird das bereitgestellte Blatt, exampleWorksheetId entfällt', async () => {
    const [example] = plannerStates(await fetchJSON(PROJECTS, 'doe-optimal-augment-3f.json'));
    const { sourceWorksheetData, ...stored } = example;
    assertEqual(sourceWorksheetData.activeSheetId, stored.sourceWorksheet.sheetId);
    const { m, reports } = load({ ...stored, exampleWorksheetId: 'ws-1' });
    assertDeepEqual(reports, []);
    assertDeepEqual(m.sourceWorksheet, { instanceId: 'ws-1', sheetId: 'sheet-augment-data' });
    assertEqual('exampleWorksheetId' in m.toJSON(), false);
    const plain = legacyPlan();
    plain.sourceWorksheet = { instanceId: 'ws-9', sheetId: 's1' };
    assertDeepEqual(load({ ...plain, exampleWorksheetId: 'ws-1' }).m.sourceWorksheet, { instanceId: 'ws-9', sheetId: 's1' });
  });

  test('Quellblatt eines Beispiels ohne bereitgestelltes Blatt: kein Quellblatt', async () => {
    const [example] = plannerStates(await fetchJSON(PROJECTS, 'doe-optimal-augment-3f.json'));
    const { sourceWorksheetData: _sourceWorksheetData, ...stored } = example;
    assertEqual(stored.sourceWorksheet.instanceId, '__source__');
    const { m } = load({ ...stored });
    assertEqual(m.sourceWorksheet, null);
  });

  test('seed ist 0; design.configSignature ist die Signatur des migrierten Plans', () => {
    const m = State.fromJSON(legacyPlan());
    assertEqual(m.seed, 0);
    assertEqual(m.design.configSignature, configSignature(m));
    assertEqual(derived(m).pending, false);
    assertEqual(derived(m).evaluation !== null, true);
  });
});

suite('doe-planner Migration — Bindung und Momentaufnahme', () => {
  test('Alt-designSignature mit Zielgrößen wird umgeschrieben, das Blatt gilt als gebunden', () => {
    const plan = legacyPlan();
    plan.worksheetRef = binding(legacyDesignSignature(plan));
    const m = State.fromJSON(plan);
    assertEqual(m.worksheetRef.designSignature, designSignature(m));
    const data = sheetData('ws-1', 's-1', { y1: [1, 2, 3, 4] });
    assertEqual(derived(m, data).staleness, 'bound');
  });

  test('die eingefrorene Altformel: wörtlich gespeicherte Signatur wird umgeschrieben', () => {
    const plan = legacyPlan();
    plan.worksheetRef = binding('full#4#1#Yield|%#-1,-1;-1,1;1,-1;1,1');
    assertEqual(State.fromJSON(plan).worksheetRef.designSignature, designSignature(State.fromJSON(plan)));
    plan.worksheetRef = binding('full#4#1#Yield|kg#-1,-1;-1,1;1,-1;1,1');
    assertEqual(State.fromJSON(plan).worksheetRef.designSignature, 'full#4#1#Yield|kg#-1,-1;-1,1;1,-1;1,1');
  });

  test('eine abweichende Signatur bleibt, das Blatt bleibt veraltet', () => {
    const plan = legacyPlan();
    plan.worksheetRef = binding('full#4#1#Other|%#…');
    const m = State.fromJSON(plan);
    assertEqual(m.worksheetRef.designSignature, 'full#4#1#Other|%#…');
    assertEqual(m.worksheetRef.snapshot, null);
    const d = derived(m, sheetData('ws-1', 's-1', { y1: [1, 2, 3, 4] }));
    assertEqual(d.staleness, 'stale');
    assertEqual(d.experiment, null);
  });

  test('Bindung ohne Momentaufnahme mit passendem Plan bekommt sie aus dem Plan', () => {
    const plan = legacyPlan();
    plan.worksheetRef = binding(legacyDesignSignature(plan));
    const m = State.fromJSON(plan);
    assertDeepEqual(m.worksheetRef.snapshot, snapshotOf(m, m.design));
    const d = derived(m, sheetData('ws-1', 's-1', { y1: [1, 2, 3, 4] }));
    assertEqual(d.experiment.name, 'Ofen');
    assertDeepEqual(d.experiment.runMatrix.columnTags.responses, ['y1']);
  });

  test('Bindung ohne Signatur übernimmt die des Plans', () => {
    const plan = legacyPlan();
    plan.worksheetRef = binding(undefined);
    const m = State.fromJSON(plan);
    assertEqual(m.worksheetRef.designSignature, designSignature(m));
    assert(m.worksheetRef.snapshot !== null, 'Momentaufnahme');
  });

  test('Bindung ohne Plan: Signatur und Momentaufnahme leer, kein Versuch', () => {
    const plan = legacyPlan();
    plan.design = null;
    plan.worksheetRef = binding('irgendwas');
    const m = State.fromJSON(plan);
    assertEqual(m.worksheetRef.snapshot, null);
    assertEqual(derived(m, sheetData('ws-1', 's-1', { y1: [1, 2, 3, 4] })).experiment, null);
  });
});
