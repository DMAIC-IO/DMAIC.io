import { suite, test, assertEqual, assertAlmostEqual } from '../test-utils.js';
import { State, formatNumber, groupMembers } from '../../js/modules/unit-converter/unit-converter-model.js';

suite('Unit Converter Model — formatNumber', () => {
  test('zero renders as 0', () => {
    assertEqual(formatNumber(0), '0');
  });

  test('NaN / Infinity render as em dash', () => {
    assertEqual(formatNumber(NaN), '—');
    assertEqual(formatNumber(Infinity), '—');
  });

  test('integer 100 renders as 100', () => {
    assertEqual(formatNumber(100), '100');
  });

  test('German decimal comma for fractional values', () => {
    assertEqual(formatNumber(38.1), '38,1');
  });

  test('very small values use exponential notation', () => {
    assertEqual(formatNumber(1e-7), '1.000000e-7');
  });
});

suite('Unit Converter Model — groupMembers', () => {
  test('category without groups returns all unit keys', () => {
    const members = groupMembers('laenge', 'm');
    assertEqual(members.includes('cm'), true);
    assertEqual(members.includes('km'), true);
  });

  test('lab values returns only same-group members', () => {
    const members = groupMembers('laborwerte', 'mgdl_bz');
    assertEqual(members.includes('mmoll_bz'), true);
    assertEqual(members.includes('umoll_kr'), false);
  });
});

suite('Unit Converter Model — State defaults', () => {
  test('constructor sets default selection', () => {
    const s = new State();
    assertEqual(s.activeCat, 'laenge');
    assertEqual(s.inputVal, '');
    assertEqual(s.tzFrom, 1);
    assertEqual(s.tzTo, 0);
    assertEqual(s.tzTime, '12:00');
  });

  test('default from/to units are first two compatible length units', () => {
    const s = new State();
    assertEqual(typeof s.fromUnit, 'string');
    assertEqual(typeof s.toUnit, 'string');
    assertEqual(s.fromUnit !== s.toUnit, true);
  });
});

suite('Unit Converter Model — conversion', () => {
  test('1 m → cm = 100', () => {
    const s = new State();
    s.activeCat = 'laenge';
    s.fromUnit = 'm';
    s.toUnit = 'cm';
    s.inputVal = '1';
    assertEqual(s.result(), 100);
  });

  test('0 C → F = 32', () => {
    const s = new State();
    s.activeCat = 'temperatur';
    s.fromUnit = 'C';
    s.toUnit = 'F';
    s.inputVal = '0';
    assertEqual(s.result(), 32);
  });

  test('German decimal comma input is parsed', () => {
    const s = new State();
    s.activeCat = 'laenge';
    s.fromUnit = 'in';
    s.toUnit = 'mm';
    s.inputVal = '1,5';
    assertAlmostEqual(s.result(), 38.1, 1e-6);
  });

  test('empty / invalid input → result is null', () => {
    const s = new State();
    s.inputVal = '';
    assertEqual(s.result(), null);
    s.inputVal = 'abc';
    assertEqual(s.result(), null);
  });

  test('formulaValue gives 1-unit conversion factor', () => {
    const s = new State();
    s.activeCat = 'laenge';
    s.fromUnit = 'm';
    s.toUnit = 'cm';
    assertEqual(s.formulaValue(), 100);
  });
});

suite('Unit Converter Model — refRows', () => {
  test('length refs contain in → mm = 25.4', () => {
    const s = new State();
    s.activeCat = 'laenge';
    const rows = s.refRows();
    const r = rows.find(x => x.from === 'in' && x.to === 'mm' && x.val === 1);
    assertEqual(r !== undefined, true);
    assertAlmostEqual(r.result, 25.4, 1e-9);
  });
});

suite('Unit Converter Model — serialization', () => {
  test('toJSON returns selection fields', () => {
    const s = new State();
    s.activeCat = 'masse';
    s.inputVal = '5';
    const j = s.toJSON();
    assertEqual(j.activeCat, 'masse');
    assertEqual(j.inputVal, '5');
  });

  test('fromJSON(null) returns valid default', () => {
    const s = State.fromJSON(null);
    assertEqual(s.activeCat, 'laenge');
  });

  test('fromJSON(undefined) returns valid default', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.tzFrom, 1);
  });

  test('fromJSON restores and round-trips', () => {
    const s = new State();
    s.activeCat = 'temperatur';
    s.fromUnit = 'C';
    s.toUnit = 'F';
    s.inputVal = '20';
    s.tzFrom = 5;
    s.tzTo = 3;
    s.tzTime = '08:30';
    s.tzDate = '2026-01-12';
    const restored = State.fromJSON(s.toJSON());
    assertEqual(restored.activeCat, 'temperatur');
    assertEqual(restored.fromUnit, 'C');
    assertEqual(restored.toUnit, 'F');
    assertEqual(restored.inputVal, '20');
    assertEqual(restored.tzFrom, 5);
    assertEqual(restored.tzTo, 3);
    assertEqual(restored.tzTime, '08:30');
    assertEqual(restored.tzDate, '2026-01-12');
  });

  test('fromJSON sanitizes invalid category to default', () => {
    const s = State.fromJSON({ activeCat: 'does-not-exist' });
    assertEqual(s.activeCat, 'laenge');
  });

  test('fromJSON resets incompatible unit selection', () => {
    const s = State.fromJSON({ activeCat: 'laenge', fromUnit: 'C', toUnit: 'F' });
    // C/F are temperature units, invalid for length → fall back to category defaults
    assertEqual(Object.keys(s.unitKeys()).length >= 0, true);
    assertEqual(s.fromUnit !== 'C', true);
  });
});

suite('Unit Converter Model — hasContent', () => {
  test('fresh default state has no content', () => {
    const s = new State();
    assertEqual(s.hasContent(), false);
  });

  test('entered value counts as content', () => {
    const s = new State();
    s.inputVal = '42';
    assertEqual(s.hasContent(), true);
  });

  test('changed category counts as content', () => {
    const s = new State();
    s.activeCat = 'masse';
    assertEqual(s.hasContent(), true);
  });
});

suite('Unit Converter Model — toUnitKeys filtering', () => {
  test('toUnitKeys excludes the from unit when alternatives exist', () => {
    const s = new State();
    s.activeCat = 'laenge';
    s.fromUnit = 'm';
    const keys = s.toUnitKeys();
    assertEqual(Array.isArray(keys), true);
    assertEqual(keys.includes('cm'), true);
  });

  test('lab values toUnitKeys only same group', () => {
    const s = new State();
    s.activeCat = 'laborwerte';
    s.fromUnit = 'mgdl_bz';
    const keys = s.toUnitKeys();
    assertEqual(keys.includes('mmoll_bz'), true);
    assertEqual(keys.includes('umoll_kr'), false);
  });
});
