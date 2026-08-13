import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateHelicopterData } from './hubschrauber-flyer.mjs';

test('generates 18 runs across 3 blocks × 3 clip levels × 2 replicates', () => {
  const { runs } = generateHelicopterData();
  assert.equal(runs.length, 18);
  const uniqueCells = new Set(runs.map((r) => `${r.L},${r.C}`));
  assert.equal(uniqueCells.size, 9);
});

test('block order is L=8 → L=6 → L=4 (never mixed)', () => {
  const { runs } = generateHelicopterData();
  const blockOfRun = runs.map((r) => r.L);
  const firstBlockEnd = blockOfRun.lastIndexOf(8);
  const secondBlockStart = blockOfRun.indexOf(6);
  const secondBlockEnd = blockOfRun.lastIndexOf(6);
  const thirdBlockStart = blockOfRun.indexOf(4);
  assert.ok(firstBlockEnd < secondBlockStart, 'L=8 must precede L=6');
  assert.ok(secondBlockEnd < thirdBlockStart, 'L=6 must precede L=4');
  // 3 blocks of exactly 6 rows each.
  assert.deepEqual(runs.slice(0, 6).map((r) => r.block), Array(6).fill(1));
  assert.deepEqual(runs.slice(6, 12).map((r) => r.block), Array(6).fill(2));
  assert.deepEqual(runs.slice(12, 18).map((r) => r.block), Array(6).fill(3));
});

test('deterministic with seed 1305', () => {
  const a = generateHelicopterData(1305);
  const b = generateHelicopterData(1305);
  assert.deepEqual(a.runs, b.runs);
  assert.deepEqual(a.baselineRuns, b.baselineRuns);
  assert.deepEqual(a.confirmationRuns, b.confirmationRuns);
});

test('cell means match physics model within 0.20s tolerance (18 runs, σ=0.12)', () => {
  const { runs } = generateHelicopterData();
  const expected = {
    '4,0': 2.10, '4,1': 2.44, '4,2': 2.10,
    '6,0': 2.42, '6,1': 2.76, '6,2': 2.42,
    '8,0': 2.42, '8,1': 2.76, '8,2': 2.42,
  };
  for (const [key, exp] of Object.entries(expected)) {
    const [L, C] = key.split(',').map(Number);
    const cell = runs.filter((r) => r.L === L && r.C === C);
    const mean = cell.reduce((s, r) => s + r.flightTime, 0) / cell.length;
    assert.ok(Math.abs(mean - exp) < 0.20,
      `cell L=${L},C=${C}: mean ${mean.toFixed(3)}, expected ~${exp}, diff > 0.20`);
  }
});

test('all flight times are positive and reasonable (0.5s to 5s)', () => {
  const { runs, baselineRuns, confirmationRuns } = generateHelicopterData();
  for (const r of [...runs, ...baselineRuns, ...confirmationRuns]) {
    assert.ok(r.flightTime > 0.5 && r.flightTime < 5.0,
      `flightTime ${r.flightTime} out of range`);
  }
});

test('baseline: 10 runs, all at (L=8, C=0), mean near 2.42s', () => {
  const { baselineRuns } = generateHelicopterData();
  assert.equal(baselineRuns.length, 10);
  for (const r of baselineRuns) {
    assert.equal(r.L, 8);
    assert.equal(r.C, 0);
  }
  const mean = baselineRuns.reduce((s, r) => s + r.flightTime, 0) / baselineRuns.length;
  assert.ok(Math.abs(mean - 2.42) < 0.15,
    `baseline mean ${mean.toFixed(3)}, expected ~2.42`);
  const variance = baselineRuns.reduce((s, r) => s + (r.flightTime - mean) ** 2, 0) / baselineRuns.length;
  const sigma = Math.sqrt(variance);
  assert.ok(Math.abs(sigma - 0.12) < 0.1,
    `baseline sigma ${sigma.toFixed(3)}, expected ~0.12`);
});

test('confirmation: 5 runs, all at (L=6, C=1), mean near 2.76s', () => {
  const { confirmationRuns } = generateHelicopterData();
  assert.equal(confirmationRuns.length, 5);
  for (const r of confirmationRuns) {
    assert.equal(r.L, 6);
    assert.equal(r.C, 1);
  }
  const mean = confirmationRuns.reduce((s, r) => s + r.flightTime, 0) / confirmationRuns.length;
  assert.ok(Math.abs(mean - 2.76) < 0.20,
    `confirmation mean ${mean.toFixed(3)}, expected ~2.76`);
});

test('worksheet payload has 3 sheets (baseline, doe, confirmation) with matching row counts', () => {
  const { worksheet, runs, baselineRuns, confirmationRuns } = generateHelicopterData();
  assert.ok(Array.isArray(worksheet.sheets));
  assert.equal(worksheet.sheets.length, 3);

  const byId = Object.fromEntries(worksheet.sheets.map((s) => [s.id, s]));
  const baselineSheet = byId['sheet-hubschrauber-baseline'];
  const doeSheet = byId['sheet-hubschrauber-doe'];
  const confirmationSheet = byId['sheet-hubschrauber-confirmation'];
  assert.ok(baselineSheet && doeSheet && confirmationSheet, 'all 3 sheet ids present');

  assert.equal(baselineSheet.state.rowCount, baselineRuns.length);
  assert.equal(doeSheet.state.rowCount, runs.length);
  assert.equal(confirmationSheet.state.rowCount, confirmationRuns.length);

  for (const sheet of worksheet.sheets) {
    assert.ok(Array.isArray(sheet.state.columns) && sheet.state.columns.length > 0);
    for (const col of sheet.state.columns) {
      assert.equal(col.values.length, sheet.state.rowCount,
        `column ${col.id} in ${sheet.id} must have rowCount values`);
    }
  }

  // doe sheet's flight-time column must equal the raw runs, in order.
  const doeFlugzeit = doeSheet.state.columns.find((c) => c.id === 'c-flugzeit');
  assert.deepEqual(doeFlugzeit.values, runs.map((r) => r.flightTime));
});
