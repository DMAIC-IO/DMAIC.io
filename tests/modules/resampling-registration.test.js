/**
 * D.Mike — Resampling module registration: manifest entry, complete de/en
 * strings for every key the template and the analysis layer use, icon ids.
 */

import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import manifest from '../../js/modules/manifest.js';

async function loadText(path) {
  const resp = await fetch(new URL(path, import.meta.url));
  return resp.text();
}

const RESAMPLING_I18N_KEYS = [
  'name', 'description',
  'sectionMode', 'modeOne', 'modeTwo', 'modePaired', 'modeK',
  'sectionData', 'sampleColumn', 'group1Column', 'group2Column', 'pairedXColumn', 'pairedYColumn', 'kColumns',
  'sectionStatistic', 'statistic', 'statMean', 'statMedian', 'statStddev', 'statVariance',
  'statTrimmedMean', 'statQuantile', 'statCv', 'statPpk', 'trim', 'quantileP', 'lsl', 'usl',
  'contrast', 'contrastDifference', 'contrastRatio', 'direction', 'twoSided', 'greater', 'less',
  'target', 'targetPh',
  'sectionSettings', 'B', 'seed', 'rollSeed', 'confidence', 'ciMethod', 'ciBca', 'ciPercentile',
  'compute', 'cancel', 'stale', 'placeholderText',
  'sectionResult', 'estimate', 'se', 'bias', 'interval', 'bcaFallback', 'decision',
  'decisionReject', 'decisionRetain', 'pValue', 'exact', 'monteCarlo', 'permutations', 'observedT',
  'sectionBootChart', 'sectionPermChart', 'sectionGroups', 'group', 'sectionPosthoc', 'pair',
  'pRaw', 'pHolm', 'pMethod', 'chartBootX', 'chartPermX', 'ciLabel',
  'errStatisticMode', 'errTrim', 'errQuantileP', 'errLimitsMissing', 'errLimitsOrder', 'errConfidence',
  'errB', 'errSeed', 'errTarget', 'errMinGroups', 'errMinValues', 'errMinPpk', 'errRatioPositive', 'errRatioStatistic',
  'errOptions', 'errDegenerateStatistic', 'errUnexpected',
  'stmtTwoSig', 'stmtTwoSigGreater', 'stmtTwoSigLess', 'stmtTwoNot', 'stmtTwoNotGreater', 'stmtTwoNotLess',
  'stmtDiffAbove', 'stmtDiffBelow', 'stmtDiffEqual', 'stmtRatio', 'stmtIntervalDiff', 'stmtIntervalRatio',
  'stmtPairedSig', 'stmtPairedSigGreater', 'stmtPairedSigLess',
  'stmtPairedNot', 'stmtPairedNotGreater', 'stmtPairedNotLess', 'stmtPairedEstimate',
  'stmtOneEstimate', 'stmtOneReject', 'stmtOneRetain',
  'stmtKSig', 'stmtKNot', 'stmtKPairs', 'stmtKNoPair',
  'stmtStatMean', 'stmtStatMedian', 'stmtStatStddev', 'stmtStatVariance',
  'stmtStatTrimmedMean', 'stmtStatQuantile', 'stmtStatCv', 'stmtStatPpk',
];

suite('resampling — registration', () => {
  test('manifest entry: statistics group, analyze (+ improve), same DMADV/8D phases as hypothesis-test', () => {
    const entry = manifest.find((m) => m.id === 'resampling');
    assertTrue(Boolean(entry), 'manifest has resampling');
    assertEqual(entry.phase, 'analyze');
    assertEqual(entry.group, 'statistics');
    assertEqual(typeof entry.load, 'function');
    assertDeepEqual(entry.cycles, {
      dmaic: { phase: 'analyze', allowedPhases: ['analyze', 'improve'] },
      dmadv: { phase: 'analyze', allowedPhases: ['analyze', 'verify'] },
      eightd: { phase: 'rootcause', allowedPhases: ['rootcause', 'implementation'] },
    });
  });

  test('de and en define every key, non-empty, nothing extra', async () => {
    for (const lang of ['de', 'en']) {
      const dict = JSON.parse(await loadText(`../../i18n/${lang}.json`)).modules.resampling;
      assertTrue(Boolean(dict), `${lang}: modules.resampling exists`);
      for (const key of RESAMPLING_I18N_KEYS) {
        assertTrue(typeof dict[key] === 'string' && dict[key].trim() !== '', `${lang}: ${key}`);
      }
      assertEqual(Object.keys(dict).filter((k) => !RESAMPLING_I18N_KEYS.includes(k)).join(','), '', `${lang}: no unused keys`);
    }
  });

  test('every literal t(\'…\') key in the template is in the key list', async () => {
    const html = await loadText('../../js/modules/resampling/resampling.html');
    const used = [...html.matchAll(/\bt\('([A-Za-z0-9]+)'\)/g)].map((m) => m[1]);
    assertTrue(used.length > 40, 'template uses i18n keys');
    const missing = [...new Set(used)].filter((k) => !RESAMPLING_I18N_KEYS.includes(k));
    assertEqual(missing.join(','), '');
  });

  test('icon map has the module icon and the seed dice', async () => {
    const map = JSON.parse(await loadText('../../assets/icons/icon-map.json'));
    assertEqual(map['module.resampling'], 'lucide:repeat');
    assertEqual(map['action.roll-seed'], 'lucide:dices');
  });
});
