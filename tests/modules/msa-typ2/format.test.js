import { suite, test, assertEqual } from '../../test-utils.js';
import { fmt, fmtP } from '../../../js/modules/msa-typ2/domain/format.js';

suite('MSA Typ 2 — Formatierer', () => {
  test('fmt: vier Stellen, Strich für null/NaN/Infinity', () => {
    assertEqual(fmt(1.23456789), '1.2346');
    assertEqual(fmt(1.5, 1), '1.5');
    assertEqual(fmt(null), '–');
    assertEqual(fmt(NaN), '–');
    assertEqual(fmt(Infinity), '–');
  });
  test('fmtP: kleine p-Werte, drei Stellen, Strich', () => {
    assertEqual(fmtP(0.0004), '< 0.001');
    assertEqual(fmtP(0.04567), '0.046');
    assertEqual(fmtP(null), '–');
    assertEqual(fmtP(NaN), '–');
  });
});
