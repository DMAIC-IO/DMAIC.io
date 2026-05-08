/**
 * Tests for js/core/cycles/cycles.js
 */
import { suite, test, assertEqual } from '../test-utils.js';
import {
  CYCLES,
  VIRTUAL_PHASES,
  DEFAULT_CYCLE,
  getCycle,
  getPhaseIds,
  getAllPhaseIds,
  getPhaseDef,
  isValidPhase,
} from '../../js/core/cycles/cycles.js';

suite('Cycles', () => {
  // ─── Constants ────────────────────────────────────────────────

  test('DEFAULT_CYCLE is dmaic', () => {
    assertEqual(DEFAULT_CYCLE, 'dmaic');
  });

  test('CYCLES is frozen (immutable top level)', () => {
    assertEqual(Object.isFrozen(CYCLES), true);
  });

  test('VIRTUAL_PHASES has leading data and trailing extras', () => {
    assertEqual(VIRTUAL_PHASES.data.position, 'leading');
    assertEqual(VIRTUAL_PHASES.extras.position, 'trailing');
    assertEqual(VIRTUAL_PHASES.data.virtual, true);
    assertEqual(VIRTUAL_PHASES.extras.virtual, true);
  });

  // ─── getCycle ─────────────────────────────────────────────────

  test('getCycle returns DMAIC definition', () => {
    const c = getCycle('dmaic');
    assertEqual(c.id, 'dmaic');
    assertEqual(c.phases.length, 5);
  });

  test('getCycle returns DMADV definition', () => {
    const c = getCycle('dmadv');
    assertEqual(c.id, 'dmadv');
    assertEqual(c.phases.length, 5);
  });

  test('getCycle falls back to DEFAULT for unknown cycle id', () => {
    assertEqual(getCycle('does-not-exist').id, DEFAULT_CYCLE);
  });

  test('getCycle falls back to DEFAULT for null/undefined', () => {
    assertEqual(getCycle(null).id, DEFAULT_CYCLE);
    assertEqual(getCycle(undefined).id, DEFAULT_CYCLE);
  });

  // ─── getPhaseIds ──────────────────────────────────────────────

  test('getPhaseIds returns DMAIC methodology phases in order', () => {
    assertEqual(
      getPhaseIds('dmaic').join(','),
      'define,measure,analyze,improve,control',
    );
  });

  test('getPhaseIds returns DMADV phases incl. design + verify', () => {
    assertEqual(
      getPhaseIds('dmadv').join(','),
      'define,measure,analyze,design,verify',
    );
  });

  test('getPhaseIds excludes virtual frame tiles (data, extras)', () => {
    const ids = getPhaseIds('dmaic');
    assertEqual(ids.includes('data'), false);
    assertEqual(ids.includes('extras'), false);
  });

  // ─── getAllPhaseIds ───────────────────────────────────────────

  test('getAllPhaseIds wraps methodology with data + extras', () => {
    assertEqual(
      getAllPhaseIds('dmaic').join(','),
      'data,define,measure,analyze,improve,control,extras',
    );
  });

  test('getAllPhaseIds for DMADV', () => {
    assertEqual(
      getAllPhaseIds('dmadv').join(','),
      'data,define,measure,analyze,design,verify,extras',
    );
  });

  // ─── getPhaseDef ──────────────────────────────────────────────

  test('getPhaseDef returns DMAIC phase with letter + i18nKey', () => {
    const def = getPhaseDef('dmaic', 'measure');
    assertEqual(def.id, 'measure');
    assertEqual(def.letter, 'M');
    assertEqual(def.i18nKey, 'phases.measure');
  });

  test('getPhaseDef returns DMADV design with explicit color', () => {
    const def = getPhaseDef('dmadv', 'design');
    assertEqual(def.letter, 'D');
    assertEqual(def.color, '#5e35b1');
  });

  test('getPhaseDef returns DMADV verify with explicit color', () => {
    const def = getPhaseDef('dmadv', 'verify');
    assertEqual(def.letter, 'V');
    assertEqual(def.color, '#00897b');
  });

  test('getPhaseDef returns virtual data tile for any cycle', () => {
    const def = getPhaseDef('dmadv', 'data');
    assertEqual(def.id, 'data');
    assertEqual(def.virtual, true);
    assertEqual(def.position, 'leading');
  });

  test('getPhaseDef returns virtual extras tile for any cycle', () => {
    const def = getPhaseDef('dmaic', 'extras');
    assertEqual(def.id, 'extras');
    assertEqual(def.virtual, true);
    assertEqual(def.position, 'trailing');
  });

  test('getPhaseDef returns null for phase not in this cycle', () => {
    // design only exists in DMADV, not DMAIC
    assertEqual(getPhaseDef('dmaic', 'design'), null);
    // improve only exists in DMAIC, not DMADV
    assertEqual(getPhaseDef('dmadv', 'improve'), null);
  });

  test('getPhaseDef returns null for unknown phase id', () => {
    assertEqual(getPhaseDef('dmaic', 'foo'), null);
  });

  // ─── isValidPhase ─────────────────────────────────────────────

  test('isValidPhase: DMAIC accepts its own phases + frame tiles', () => {
    assertEqual(isValidPhase('dmaic', 'define'), true);
    assertEqual(isValidPhase('dmaic', 'control'), true);
    assertEqual(isValidPhase('dmaic', 'data'), true);
    assertEqual(isValidPhase('dmaic', 'extras'), true);
  });

  test('isValidPhase: DMAIC rejects DMADV-only phases', () => {
    assertEqual(isValidPhase('dmaic', 'design'), false);
    assertEqual(isValidPhase('dmaic', 'verify'), false);
  });

  test('isValidPhase: DMADV rejects DMAIC-only phases', () => {
    assertEqual(isValidPhase('dmadv', 'improve'), false);
    assertEqual(isValidPhase('dmadv', 'control'), false);
  });

  test('isValidPhase: data + extras valid in every known cycle', () => {
    for (const cycleId of Object.keys(CYCLES)) {
      assertEqual(isValidPhase(cycleId, 'data'), true);
      assertEqual(isValidPhase(cycleId, 'extras'), true);
    }
  });

  test('isValidPhase: rejects unknown phase id', () => {
    assertEqual(isValidPhase('dmaic', 'foo'), false);
  });
});
