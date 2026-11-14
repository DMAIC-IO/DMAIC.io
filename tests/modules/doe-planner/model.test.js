/**
 * Tests for js/modules/doe-planner/domain/model.js — fields and defaults,
 * the invariants with their repair, the schema literals against the
 * engine, and the round trip.
 */
import { suite, test, assert, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State, MIN_LEVELS, MIN_RESPONSES, MAX_REPLICATES } from '../../../js/modules/doe-planner/domain/model.js';
import { setFields } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { DESIGN_KEYS } from '../../../js/modules/doe-planner/domain/designs/registry.js';
import { PHASE_DECISIONS, isOptimal, activeTerms, modelTerms } from '../../../js/modules/doe-planner/domain/design.js';

const V1 = { version: '1.0' };

/** @param {() => any} fn @returns {any} the thrown error */
function errorOf(fn) {
  try { fn(); } catch (err) { return err; }
  throw new Error('Expected function to throw');
}

/** A stored 1.0 state: two named factors, the rest default. @param {object} [over] */
function stored(over = {}) {
  const base = new State().toJSON();
  return {
    ...base,
    _schema: V1,
    factors: [
      { id: 1, name: 'Temp', unit: '°C', kind: 'continuous', levels: ['20', '60'] },
      { id: 2, name: 'Druck', unit: 'bar', kind: 'continuous', levels: ['1', '2'] },
    ],
    responses: [{ name: 'Yield', unit: '%' }],
    ...over,
  };
}

const { fields } = /** @type {any} */ (State).schema;

suite('doe-planner Model — Felder und Vorgaben', () => {
  test('Vorgabe: zwei leere Faktoren, eine leere Zielgröße, ohne Inhalt', () => {
    const s = new State();
    assertDeepEqual(s.factors, [
      { id: 1, name: '', unit: '', kind: 'continuous', levels: ['', ''] },
      { id: 2, name: '', unit: '', kind: 'continuous', levels: ['', ''] },
    ]);
    assertDeepEqual(s.responses, [{ name: '', unit: '' }]);
    assertEqual(s.designType, 'full');
    assertEqual(s.seed, 0);
    assertEqual(s.design, null);
    assertEqual(s.activePhaseIdx, -1);
    assertEqual(s.analysisResponseIdx, 0);
    assertEqual(s.options.randomize, true);
    assertEqual(s.options.replicates, 1);
    assertEqual(s.options.ccdCenterPoints, 3);
    assertDeepEqual(s.options.forbiddenVertices, []);
    assertEqual(s.options.optimalActiveTerms, null);
    assertEqual(s.hasContent(), false);
  });

  test('mit einem Namen hat der Plan Inhalt', () => {
    const s = new State();
    s.factors = [{ ...s.factors[0], name: 'Temp' }, s.factors[1]];
    assertEqual(s.hasContent(), true);
    const r = new State();
    r.responses = [{ name: 'Yield', unit: '' }];
    assertEqual(r.hasContent(), true);
  });

  test('mit einem Plan hat der Plan Inhalt, auch ohne Namen', () => {
    const planned = State.fromJSON(stored());
    planned.regenerate();
    const s = new State();
    s.design = planned.toJSON().design;
    assertEqual(s.hasContent(), true);
  });

  test('Grenzen', () => {
    assertEqual(MIN_LEVELS, 2);
    assertEqual(MIN_RESPONSES, 1);
    assertEqual(MAX_REPLICATES, 10);
    const s = new State();
    assert(/replicates/.test(errorOf(() => { s.options = { ...s.options, replicates: 11 }; }).message), 'replicates');
    assert(/ccdCenterPoints/.test(errorOf(() => { s.options = { ...s.options, ccdCenterPoints: 0 }; }).message), 'ccd');
    assert(/bbCenterPoints/.test(errorOf(() => { s.options = { ...s.options, bbCenterPoints: 101 }; }).message), 'bb');
    s.options = { ...s.options, replicates: MAX_REPLICATES };
    assertEqual(s.options.replicates, 10);
  });

  test('gespeicherte Schlüssel ohne previewDirty, evaluation, fid, mit seed', () => {
    const j = new State().toJSON();
    assertDeepEqual(Object.keys(j), ['_schema', 'doeName', 'designType', 'factors', 'responses', 'options', 'seed',
      'selectedRes', 'selectedPBIdx', 'design', 'previewEdits', 'worksheetRef', 'sourceWorksheet', 'projectMode',
      'projectName', 'projectPhases', 'analysisResponseIdx', 'activePhaseIdx']);
  });

  test('Plantypen im Schema gleich dem Register', () => {
    assertDeepEqual([...fields.designType.values], [...DESIGN_KEYS]);
    assertDeepEqual([...fields.design.shape.designType.values], [...DESIGN_KEYS]);
    assertDeepEqual([...fields.projectPhases.item.shape.designType.values], [...DESIGN_KEYS]);
  });

  test('Entscheidungen der Phasen gleich der Liste der Domäne', () => {
    assertDeepEqual([...fields.projectPhases.item.shape.decision.values], [...PHASE_DECISIONS]);
  });

  test('Phasen tragen dieselbe Form von Plan, Faktoren, Optionen und Bindung', () => {
    const ph = fields.projectPhases.item.shape;
    assertDeepEqual(ph.design, fields.design);
    assertDeepEqual(ph.factors.item, fields.factors.item);
    assertDeepEqual(ph.responses.item, fields.responses.item);
    assertDeepEqual(ph.options, fields.options);
    assertDeepEqual(ph.worksheetRef, fields.worksheetRef);
    assertDeepEqual({ ...ph.selectedRes, optional: undefined }, { ...fields.selectedRes, optional: undefined });
    assertDeepEqual({ ...ph.sourceWorksheet, optional: undefined }, { ...fields.sourceWorksheet, optional: undefined });
  });

  test('Plan ohne Matrizen im Lesen, nicht vom Agenten geschrieben', () => {
    assertEqual(fields.design.omitOnRead, true);
    assertEqual(fields.design.agentWrite, false);
    assertEqual(fields.worksheetRef.agentWrite, false);
  });

  test('toJSON → fromJSON verlustfrei', () => {
    const a = State.fromJSON(stored({ doeName: 'Rund', designType: 'dopt', selectedPBIdx: 2, seed: 17 }));
    const b = State.fromJSON(a.toJSON());
    assertEqual(JSON.stringify(b.toJSON()), JSON.stringify(a.toJSON()));
  });
});

suite('doe-planner Model — Invarianten', () => {
  test('minResponses: keine Zielgröße per setFields wird abgelehnt', () => {
    const s = State.fromJSON(stored());
    const err = errorOf(() => setFields(s, { responses: [] }));
    assertEqual(err.invariant, 'minResponses');
    assertDeepEqual(s.responses, [{ name: 'Yield', unit: '%' }]);
  });

  test('minResponses: Laden ohne Zielgröße repariert mit einer leeren', () => {
    const s = State.fromJSON(stored({ responses: [] }), { repair: true });
    assertDeepEqual(s.responses, [{ name: '', unit: '' }]);
  });

  test('validSelection: selectedRes für eine andere Faktorzahl wird beim Laden verworfen', () => {
    const reports = [];
    const s = State.fromJSON(stored({ designType: 'frac', selectedRes: { k: 3, runs: 4, res: 'III', p: 1 } }),
      { repair: true, onRepair: (n) => reports.push(n) });
    assertEqual(s.selectedRes, null);
    assertEqual(s.designType, 'frac');
    assert(reports.includes('selectedRes'), 'gemeldet');
  });

  test('validSelection: passendes selectedRes bleibt', () => {
    const sel = { k: 2, runs: 4, res: 'Full', p: 0 };
    const s = State.fromJSON(stored({ designType: 'frac', selectedRes: sel }));
    assertDeepEqual(s.selectedRes, sel);
  });

  test('validSelection: Faktor mit drei Stufen bei frac/pb fällt auf full zurück', () => {
    const factors = [
      { id: 1, name: 'Temp', unit: '', kind: 'continuous', levels: ['20', '40', '60'] },
      { id: 2, name: 'Druck', unit: '', kind: 'continuous', levels: ['1', '2'] },
    ];
    const s = State.fromJSON(stored({ factors, designType: 'pb', selectedPBIdx: 1 }), { repair: true });
    assertEqual(s.designType, 'full');
    assertEqual(s.selectedPBIdx, null);
    assertEqual(s.selectedRes, null);
  });

  test('validSelection: ein dritter Faktor unter frac wird angenommen, der Plan ist ungültig, Laden repariert', () => {
    const s = State.fromJSON(stored({ designType: 'frac', selectedRes: { k: 2, runs: 4, res: 'Full', p: 0 } }));
    setFields(s, { factors: [...s.factors, { id: 3, name: 'C', unit: '', kind: 'continuous', levels: ['1', '2'] }] });
    assertEqual(s.factors.length, 3);
    const d = evaluateDerived(s, { sheet: () => null, values: () => null });
    assertEqual(d.valid, false);
    assertEqual(d.invalidReason, 'noResolution');
    const again = State.fromJSON(s.toJSON(), { repair: true });
    assertEqual(again.selectedRes, null);
    assertEqual(again.factors.length, 3);
  });

  test('validSelection: drei Stufen unter pb per setFields angenommen, der Plan ist ungültig', () => {
    const s = State.fromJSON(stored({ designType: 'pb', selectedPBIdx: 0 }));
    setFields(s, { factors: [{ ...s.factors[0], levels: ['1', '2', '3'] }, s.factors[1]] });
    assertEqual(evaluateDerived(s, { sheet: () => null, values: () => null }).invalidReason, 'twoLevelOnly');
    assertEqual(State.fromJSON(s.toJSON(), { repair: true }).designType, 'full');
  });

  test('uniqueFactorIds: doppelte id bekommt beim Laden die nächste freie, kein Faktor entfällt', () => {
    const factors = [
      { id: 4, name: 'A', unit: '', kind: 'continuous', levels: ['1', '2'] },
      { id: 4, name: 'B', unit: '', kind: 'continuous', levels: ['1', '2'] },
    ];
    const s = State.fromJSON(stored({ factors }), { repair: true });
    assertDeepEqual(s.factors.map((f) => [f.id, f.name]), [[4, 'A'], [5, 'B']]);
    const err = errorOf(() => setFields(s, { factors }));
    assertEqual(err.invariant, 'uniqueFactorIds');
  });

  test('analysisResponse: Index 5 bei zwei Zielgrößen wird geklemmt, auch beim strengen Laden', () => {
    const s = State.fromJSON(stored({ responses: [{ name: 'Y1', unit: '' }, { name: 'Y2', unit: '' }], analysisResponseIdx: 5 }));
    assertEqual(s.analysisResponseIdx, 1);
    assertEqual(errorOf(() => { s.analysisResponseIdx = 2; }).invariant, 'analysisResponse');
  });

  test('activePhase: ohne Phasen -1, sonst auf die letzte geklemmt', () => {
    assertEqual(State.fromJSON(stored({ activePhaseIdx: 0 })).activePhaseIdx, -1);
    const phase = State.fromJSON(stored()).toJSON();
    const ph = {
      cycleNumber: 1, doeName: 'P1', factors: phase.factors, responses: phase.responses, designType: 'full',
      options: phase.options, design: null, worksheetRef: null, decision: null, completedAt: null, yValues: null,
    };
    assertEqual(State.fromJSON(stored({ projectMode: true, projectPhases: [ph], activePhaseIdx: 4 })).activePhaseIdx, 0);
  });
});

suite('doe-planner Model — Hilfen für die Plantypen', () => {
  test('hasDuplicateFactorNames ohne Groß-/Kleinschreibung, leere Namen zählen nicht', () => {
    const s = State.fromJSON(stored());
    assertEqual(s.hasDuplicateFactorNames(), false);
    s.factors = [{ ...s.factors[0], name: ' temp' }, { ...s.factors[1], name: 'TEMP' }];
    assertEqual(s.hasDuplicateFactorNames(), true);
    s.factors = [{ ...s.factors[0], name: '' }, { ...s.factors[1], name: '' }];
    assertEqual(s.hasDuplicateFactorNames(), false);
  });

  test('getActiveTerms: Vorgabe ohne Auswahl, fremde Indizes entfallen', () => {
    const s = State.fromJSON(stored({ designType: 'dopt' }));
    assertDeepEqual(s.getActiveTerms(), ['M0', 'M1', 'I0_1']);
    s.options = { ...s.options, optimalActiveTerms: ['M0', 'M1', 'M2', 'I0_2', 'M1'] };
    assertDeepEqual(s.getActiveTerms(), ['M0', 'M1']);
  });
});

suite('doe-planner Model — Plantyp und Modellterme', () => {
  test('isOptimal: dopt, aopt und gopt sind optimal, full nicht', () => {
    for (const designType of ['dopt', 'aopt', 'gopt']) assertEqual(isOptimal({ designType }), true);
    assertEqual(isOptimal({ designType: 'full' }), false);
  });

  test('activeTerms ohne Faktoren ist leer', () => {
    assertDeepEqual(activeTerms({ factors: [], options: { optimalActiveTerms: null } }), []);
  });

  test('modelTerms eines 2²-Plans enthält die Wechselwirkung', () => {
    const model = { designType: 'full', factors: [{ kind: 'continuous' }, { kind: 'continuous' }], options: {} };
    const terms = modelTerms(model, { codedMatrix: [[-1, -1], [1, -1], [-1, 1], [1, 1]] });
    assert(terms.includes('I0_1'), `Wechselwirkung fehlt: ${terms.join(', ')}`);
  });
});
