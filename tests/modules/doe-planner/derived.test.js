/**
 * Tests for the derivations of js/modules/doe-planner/domain/model.js —
 * validity, pending design, evaluation, datasheet state and progress, the
 * experiment from the snapshot, the run table and EVOP — over a fake of
 * reader of the worksheets (`src`).
 */
import { suite, test, assert, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/doe-planner/domain/model.js';
import { setFields } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { configSignature, designSignature } from '../../../js/modules/doe-planner/domain/signatures.js';
import { snapshotOf } from '../../../js/modules/doe-planner/domain/experiment.js';
import { withEdit } from '../../../js/modules/doe-planner/domain/runtable.js';
import { actualRows } from '../../../js/modules/doe-planner/domain/design.js';
import { storedSource } from '../../helpers/stored-source.js';
import { spySource } from '../../helpers/sheet-source.js';

const V1 = { version: '1.0' };

/**
 * A reader (`Source`) over sheets of one worksheet instance.
 * @param {Record<string, { rowCount: number, columns: Record<string, any[]> }>} sheets
 * @param {string} [instanceId]
 */
function fakeData(sheets = {}, instanceId = 'ws-1') {
  return storedSource({ [instanceId]: { sheets: Object.entries(sheets).map(([sid, sh]) => ({
    id: sid, name: sid,
    state: { rowCount: sh.rowCount, columns: Object.entries(sh.columns).map(([id, values]) => ({ id, name: id, type: 'numeric', values })) },
  })) } });
}

/** A valid 2² plan without a design. @param {object} [over] */
function planned(over = {}) {
  const base = new State().toJSON();
  return State.fromJSON({
    ...base,
    _schema: V1,
    factors: [
      { id: 1, name: 'Temp', unit: 'C', kind: 'continuous', levels: ['20', '40'] },
      { id: 2, name: 'Druck', unit: 'bar', kind: 'continuous', levels: ['1', '5'] },
    ],
    responses: [{ name: 'Yield', unit: '' }],
    ...over,
  });
}

/** Adds an unrandomised 2² design in standard order, current for the configuration. @param {any} s */
function withDesign(s) {
  const design = {
    designType: 'full',
    codedMatrix: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    actualMatrix: [['20', '1'], ['40', '1'], ['20', '5'], ['40', '5']],
    runOrder: [1, 2, 3, 4], stdOrder: [1, 2, 3, 4], replicateIds: [1, 1, 1, 1],
    resolution: 'Full', p: 0,
    configSignature: '',
  };
  design.configSignature = configSignature(s);
  s.design = design;
  return s;
}

/** Binds sheet ws-1/s-1 with response column c-y holding `values`, matching the design. @param {any} s @param {any[]} values */
function link(s, values) {
  s.worksheetRef = {
    instanceId: 'ws-1', sheetId: 's-1', factorColumnIds: ['c-a', 'c-b'], responseColumnIds: ['c-y'],
    meanColumnIds: [], lnVarColumnIds: [], runOrderColumnId: 'c-run', stdOrderColumnId: 'c-std',
    designSignature: designSignature(s), snapshot: snapshotOf(s, s.design),
  };
  return fakeData({ 's-1': { rowCount: values.length, columns: { 'c-y': values } } });
}

/** @param {any} m @param {any} [data] */
const read = (m, data = fakeData()) => evaluateDerived(m, data);

suite('doe-planner derived — Plan', () => {
  test('gültiger Plan ohne Entwurf: wartet auf Erzeugung', () => {
    const d = read(planned());
    assertEqual(d.valid, true);
    assertEqual(d.invalidReason, null);
    assertEqual(d.pending, true);
    assertDeepEqual(d.summary, { runs: 4, resolution: 'Full', generatedRuns: 0 });
    assertDeepEqual(d.runs, []);
    assertEqual(d.evaluation, null);
    assertEqual(d.staleness, 'none');
    assertEqual(d.progress, null);
    assertEqual(d.experiment, null);
    assertEqual(d.evop, null);
  });

  test('ungültiger Plan nennt den Grund und wartet auf nichts', () => {
    let d = read(planned({ responses: [{ name: '', unit: '' }] }));
    assertEqual(d.valid, false);
    assertEqual(d.invalidReason, 'unnamedResponse');
    assertEqual(d.pending, false);
    d = read(planned({ designType: 'frac' }));
    assertEqual(d.invalidReason, 'noResolution');
    assertEqual(d.summary.runs, null);
  });

  test('Empfehlung nach Faktorzahl und Stufen', () => {
    assertEqual(read(planned()).recommendation, 'full');
    const three = planned({ factors: [
      { id: 1, name: 'A', unit: '', kind: 'continuous', levels: ['1', '2', '3'] },
      { id: 2, name: 'B', unit: '', kind: 'continuous', levels: ['1', '2'] },
      { id: 3, name: 'C', unit: '', kind: 'continuous', levels: ['1', '2'] },
    ] });
    assertEqual(read(three).recommendation, 'bb');
  });

  test('Quelle eines optimalen Plans: Zeilenzahl aus dem Blatt', () => {
    const s = planned({ designType: 'dopt', sourceWorksheet: { instanceId: 'ws-1', sheetId: 'src' } });
    s.options = { ...s.options, optimalRuns: 1 };
    const noRows = read(s, fakeData({ src: { rowCount: 0, columns: {} } }));
    const rows = read(s, fakeData({ src: { rowCount: 20, columns: {} } }));
    assertEqual(noRows.invalidReason, 'tooFewOptimalRuns');
    assertEqual(read(s, fakeData()).invalidReason, 'source-not-found');
    assertEqual(rows.valid, true);
  });
});

suite('doe-planner derived — aktueller Plan', () => {
  test('Plan passt zur Konfiguration: Bewertung und Läufe', () => {
    const s = withDesign(planned());
    const d = read(s);
    assertEqual(d.pending, false);
    assertEqual(d.summary.generatedRuns, 4);
    assert(d.evaluation !== null, 'Bewertung');
    assertDeepEqual(Object.keys(d.evaluation), ['efficiency', 'vif', 'alias', 'power']);
    assertEqual(d.evaluation.efficiency.dEfficiency > 99, true);
    assertDeepEqual(d.evaluation.alias, { generators: [], aliases: [] });
    assertEqual(d.evaluation.power.length > 0, true);
    assertEqual(d.runs.length, 4);
    assertDeepEqual(d.runs[1].factors, { Temp: 40, Druck: 1 });
    assertDeepEqual(d.runs[1].responses, { Yield: null });
  });

  test('die Vorschau mit ihren Änderungen', () => {
    const s = withDesign(planned());
    const view = { ...s.toJSON(), design: { ...s.design, actualMatrix: actualRows(s.design, s.factors) } };
    s.previewEdits = withEdit(view, 1, { kind: 'response', index: 0 }, 12.5).edits;
    assertDeepEqual(read(s).runs[1].responses, { Yield: 12.5 });
  });

  test('Faktor per setFields geändert: wartet, keine Bewertung und Läufe, Versuch bleibt', () => {
    const s = withDesign(planned());
    const data = link(s, [10, 12, 11, 20]);
    const before = read(s, data).experiment;
    assert(before !== null, 'Versuch vor der Änderung');
    setFields(s, { factors: [{ ...s.factors[0], levels: ['20', '60'] }, s.factors[1]] });
    const d = read(s, data);
    assertEqual(d.pending, true);
    assertEqual(d.evaluation, null);
    assertDeepEqual(d.runs, []);
    assertEqual(d.summary.generatedRuns, 0);
    assertEqual(d.staleness, 'stale');
    assertDeepEqual(d.experiment, before);
    assertDeepEqual(d.experiment.factors[0].levels, ['20', '40']);
  });

  test('Name des Plans und leerer neuer Faktor ändern nichts', () => {
    const s = withDesign(planned());
    s.doeName = 'Neu';
    assertEqual(read(s).pending, false);
    s.factors = [...s.factors, { id: 3, name: '', unit: '', kind: 'continuous', levels: ['', ''] }];
    assertEqual(read(s).pending, false);
  });

  test('Bewertung eines Teilfaktorplans in der Leseform mit Generatoren und Aliasen', () => {
    const s = planned({
      designType: 'frac',
      factors: ['A', 'B', 'C'].map((name, i) => ({ id: i + 1, name, unit: '', kind: 'continuous', levels: ['1', '2'] })),
      selectedRes: { k: 3, runs: 4, res: 'III', p: 1 },
    });
    s.design = {
      designType: 'frac', codedMatrix: [[-1, -1, 1], [1, -1, -1], [-1, 1, -1], [1, 1, 1]],
      actualMatrix: [['1', '1', '2'], ['2', '1', '1'], ['1', '2', '1'], ['2', '2', '2']],
      runOrder: [1, 2, 3, 4], stdOrder: [1, 2, 3, 4], replicateIds: [1, 1, 1, 1], resolution: 'III', p: 1, configSignature: '',
    };
    s.design = { ...s.design, configSignature: configSignature(s) };
    const ev = read(s).evaluation;
    assertEqual(ev.alias.generators.length, 1);
    assert(ev.alias.aliases.every((a) => typeof a.term === 'string' && Array.isArray(a.aliasedWith)), 'Aliase');
  });
});

suite('doe-planner derived — Datenblatt', () => {
  test('gebundenes Blatt liefert Werte und Füllstand', () => {
    const s = withDesign(planned());
    const d = read(s, link(s, [10, null, 11, 20]));
    assertEqual(d.staleness, 'bound');
    assertDeepEqual(d.progress, { filled: 3, total: 4, pct: 75, complete: false, missing: [] });
    assertEqual(d.runs[0].responses.Yield, 10);
    assertEqual(d.runs[1].responses.Yield, null);
  });

  test('liest nur über src.read', () => {
    const s = withDesign(planned());
    const d = read(s, spySource(link(s, [10, null, 11, 20])));
    assertEqual(d.staleness, 'bound');
    assertDeepEqual(d.progress, { filled: 3, total: 4, pct: 75, complete: false, missing: [] });
    assertEqual(d.runs[0].responses.Yield, 10);
    const src = planned({ designType: 'dopt', sourceWorksheet: { instanceId: 'ws-1', sheetId: 'src' } });
    src.options = { ...src.options, optimalRuns: 1 };
    assertEqual(read(src, spySource(fakeData({ src: { rowCount: 20, columns: {} } }))).valid, true);
  });

  test('Arbeitsblatt noch nicht geladen: wie ohne Blatt', () => {
    const s = withDesign(planned());
    link(s, [1, 2, 3, 4]);
    const notLoaded = { read() { const e = new Error('not_loaded'); e.code = 'not_loaded'; throw e; }, list: () => [] };
    const d = read(s, notLoaded);
    assertEqual(d.staleness, 'none');
    assertEqual(d.progress, null);
  });

  test('Dezimalkomma zählt, Leerzelle nicht, die Zeile bleibt an ihrem Platz', () => {
    const s = withDesign(planned());
    const d = read(s, link(s, ['2,5', '', '3.5', 4]));
    assertDeepEqual(d.progress, { filled: 3, total: 4, pct: 75, complete: false, missing: [] });
    assertDeepEqual(d.runs.map((r) => r.responses.Yield), [2.5, null, 3.5, 4]);
  });

  test('fehlendes Arbeitsblatt: none, kein Füllstand, kein Versuch', () => {
    const s = withDesign(planned());
    link(s, [1, 2, 3, 4]);
    const d = read(s, fakeData());
    assertEqual(d.staleness, 'none');
    assertEqual(d.progress, null);
    assertEqual(d.experiment, null);
    assertEqual(d.runs[0].responses.Yield, null);
  });

  test('gelöschte Zielgrößenspalte wird als fehlend gemeldet', () => {
    const s = withDesign(planned({ responses: [{ name: 'Y1', unit: '' }, { name: 'Y2', unit: '' }] }));
    link(s, []);
    s.worksheetRef = { ...s.worksheetRef, responseColumnIds: ['c-y1', 'c-y2'] };
    const data = fakeData({ 's-1': { rowCount: 4, columns: { 'c-y2': [1, 2, 3, 4] } } });
    const d = read(s, data);
    assertDeepEqual(d.progress, { filled: 4, total: 8, pct: 50, complete: false, missing: [0] });
    assertDeepEqual(d.runs.map((r) => r.responses), [
      { Y1: null, Y2: 1 }, { Y1: null, Y2: 2 }, { Y1: null, Y2: 3 }, { Y1: null, Y2: 4 },
    ]);
  });

  test('geänderte Faktoren nach dem Anlegen: veraltet, Läufe aus der Vorschau', () => {
    const s = withDesign(planned());
    const data = link(s, [10, 12, 11, 20]);
    s.factors = [{ ...s.factors[0], unit: 'K' }, s.factors[1]];
    s.design = { ...s.design, configSignature: configSignature(s) };
    const d = read(s, data);
    assertEqual(d.staleness, 'stale');
    assertEqual(d.runs[0].responses.Yield, null);
  });

  test('geänderte Zielgröße macht das Blatt nicht veraltet', () => {
    const s = withDesign(planned());
    const data = link(s, [10, 12, 11, 20]);
    s.responses = [{ name: 'Yield', unit: '%' }];
    assertEqual(read(s, data).staleness, 'bound');
  });

  test('Streuungsanalyse nur mit vollem Blatt und Wiederholungen', () => {
    const s = withDesign(planned());
    assertEqual(read(s, link(s, [10, null, 11, 20])).dispersion, null);
    assertEqual(read(s, link(s, [10, 12, 11, 20])).dispersion, null);
    const rep = planned({ options: { ...planned().options, replicates: 2 } });
    rep.design = {
      designType: 'full',
      codedMatrix: [[-1, -1], [1, -1], [-1, 1], [1, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]],
      actualMatrix: [['20', '1'], ['40', '1'], ['20', '5'], ['40', '5'], ['20', '1'], ['40', '1'], ['20', '5'], ['40', '5']],
      runOrder: [1, 2, 3, 4, 5, 6, 7, 8], stdOrder: [1, 2, 3, 4, 1, 2, 3, 4], replicateIds: [1, 1, 1, 1, 2, 2, 2, 2],
      resolution: 'Full', p: 0, configSignature: '',
    };
    rep.design = { ...rep.design, configSignature: configSignature(rep) };
    const d = read(rep, link(rep, ['10', 12, 11, 20, '10,5', 13, 11.5, 22]));
    assert(d.dispersion !== null && d.dispersion.ok === true, 'Analyse');
    assertEqual(d.dispersion.responseName, 'Yield');
  });
});

suite('doe-planner derived — EVOP', () => {
  /** @param {any} s */
  function phaseOf(s, yValues) {
    const j = s.toJSON();
    return {
      cycleNumber: 1, doeName: 'Ofen - Phase 1', factors: j.factors, responses: j.responses, designType: 'full',
      options: j.options, design: j.design, worksheetRef: null, decision: yValues ? 'repeat' : null,
      completedAt: yValues ? '2026-01-01T00:00:00.000Z' : null, yValues,
    };
  }

  test('nur im Projektmodus', () => {
    const s = withDesign(planned());
    assertEqual(read(s).evop, null);
    s.projectName = 'Ofen';
    s.projectPhases = [phaseOf(s, null)];
    s.projectMode = true;
    s.activePhaseIdx = 0;
    const evop = read(s).evop;
    assertEqual(evop.projectMode, true);
    assertEqual(evop.projectName, 'Ofen');
    assertEqual(evop.activePhaseIdx, 0);
    assertDeepEqual(Object.keys(evop.phases[0]).sort(), ['completedAt', 'cycleNumber', 'decision', 'doeName', 'yValues']);
    assertEqual(evop.summary, null);
  });

  test('eine abgeschlossene Phase ergibt die kumulierte Zusammenfassung der ersten Zielgröße', () => {
    const s = withDesign(planned());
    s.projectPhases = [phaseOf(s, [[10, 12, 11, 20]])];
    s.projectMode = true;
    s.activePhaseIdx = 0;
    const sum = read(s).evop.summary;
    assert(sum !== null, 'Zusammenfassung');
    assertEqual(sum.effects.length > 0, true);
    assertEqual(Number.isFinite(sum.effects[0].errorLimit), true);
  });

  test('die gelesene Phase liegt immer in den Phasen', () => {
    const s = withDesign(planned());
    s.projectPhases = [phaseOf(s, null)];
    s.projectMode = true;
    s._v.activePhaseIdx = 3;
    assertEqual(read(s).evop.activePhaseIdx, 0);
  });
});
