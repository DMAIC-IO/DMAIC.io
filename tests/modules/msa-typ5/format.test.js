import { suite, test, assertEqual } from '../../test-utils.js';
import {
  fmt, fmtP, fmtPct, fmtCI, fmtCriterion, verdictClass, levelClass, kappaClass,
} from '../../../js/modules/msa-typ5/domain/format.js';

suite('MSA Typ 5 — Formatierung', () => {
  test('fmt folgt der Sprache, nicht endlich → Strich', () => {
    assertEqual(fmt(0.8571, 3, 'de'), '0,857');
    assertEqual(fmt(0.8571, 3, 'en'), '0.857');
    assertEqual(fmt(NaN, 3, 'de'), '—');
  });
  test('fmtP', () => {
    assertEqual(fmtP(0.0001, 'de'), '< 0,001');
    assertEqual(fmtP(0.0456, 'en'), '0.046');
    assertEqual(fmtP(NaN, 'en'), '—');
  });
  test('fmtPct', () => {
    assertEqual(fmtPct(0.978, 'de'), '97,8 %');
    assertEqual(fmtPct(0.978, 'en'), '97.8 %');
  });
  test('fmtCI: Trennzeichen je Sprache', () => {
    assertEqual(fmtCI([0.5, 0.75], 'de'), '[0,500; 0,750]');
    assertEqual(fmtCI([0.5, 0.75], 'en'), '[0.500, 0.750]');
  });
  test('fmtCriterion: κ drei Stellen, Raten Prozent', () => {
    assertEqual(fmtCriterion('fleissKappa', 0.9, 'en'), '0.900');
    assertEqual(fmtCriterion('effectiveness', 0.9, 'en'), '90.0 %');
  });
  test('Klassen', () => {
    assertEqual(verdictClass('good'), 'dmike-kpi--good');
    assertEqual(verdictClass('marginal'), 'dmike-kpi--warn');
    assertEqual(verdictClass('x'), 'dmike-kpi--bad');
    assertEqual(levelClass('unacceptable'), 'dmike-kpi--bad');
    assertEqual(levelClass('?'), '');
    assertEqual(kappaClass(0.95, 'aiag'), 'dmike-kpi--good');
    assertEqual(kappaClass(0.2, 'aiag'), 'dmike-kpi--bad');
  });
});
