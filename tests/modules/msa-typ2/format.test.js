import { suite, test, assertEqual } from '../../test-utils.js';
import { fmt, fmtP } from '../../../js/modules/msa-typ2/domain/format.js';

suite('MSA Typ 2 — Formatierer', () => {
  test('fmt: vier Stellen, Strich für null/NaN/Infinity', () => {
    assertEqual(fmt(1.23456789, 4, 'en'), '1.2346');
    assertEqual(fmt(1.5, 1, 'en'), '1.5');
    assertEqual(fmt(null, 4, 'en'), '–');
    assertEqual(fmt(NaN, 4, 'en'), '–');
    assertEqual(fmt(Infinity, 4, 'en'), '–');
  });
  test('fmtP: kleine p-Werte, drei Stellen, Strich', () => {
    assertEqual(fmtP(0.0004, 'en'), '< 0.001');
    assertEqual(fmtP(0.04567, 'en'), '0.046');
    assertEqual(fmtP(null, 'en'), '–');
    assertEqual(fmtP(NaN, 'en'), '–');
  });
  test('fmt/fmtP: deutsches Dezimalkomma', () => {
    assertEqual(fmt(1.23456789, 4, 'de'), '1,2346');
    assertEqual(fmt(1234.5, 2, 'de'), '1.234,50');
    assertEqual(fmtP(0.0004, 'de'), '< 0,001');
    assertEqual(fmtP(0.04567, 'de'), '0,046');
  });
});
