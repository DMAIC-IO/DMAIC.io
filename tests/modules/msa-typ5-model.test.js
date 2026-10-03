import { suite, test, assertEqual } from '../test-utils.js';
import { State, RULESET_OPTIONS, formatP, formatNum, formatPct } from '../../js/modules/msa-typ5/msa-typ5-model.js';

suite('MSA Typ 5 Model — ruleSet', () => {
  test('new State defaults to aiag', () => {
    assertEqual(new State().params.ruleSet, 'aiag');
    assertEqual(RULESET_OPTIONS.join(), 'aiag,bosch');
  });

  test('saved study without ruleSet loads as aiag', () => {
    assertEqual(State.fromJSON({ params: { type: 'binary', alpha: '0.05' } }).params.ruleSet, 'aiag');
  });

  test('unknown ruleSet falls back to aiag', () => {
    assertEqual(State.fromJSON({ params: { ruleSet: 'vda' } }).params.ruleSet, 'aiag');
    assertEqual(State.fromJSON({ params: { ruleSet: 42 } }).params.ruleSet, 'aiag');
  });

  test('bosch survives a JSON round trip', () => {
    const s = new State();
    s.params.ruleSet = 'bosch';
    const back = State.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
    assertEqual(back.params.ruleSet, 'bosch');
  });
});

suite('MSA Typ 5 Model — formatP', () => {
  test('tiny p shows as "< 0,001" / "< 0.001", never 0.000 or exponent form', () => {
    assertEqual(formatP(1e-70, 'de'), '< 0,001');
    assertEqual(formatP(0.000999, 'en'), '< 0.001');
  });

  test('otherwise three decimals with the language decimal separator', () => {
    assertEqual(formatP(0.001, 'de'), '0,001');
    assertEqual(formatP(0.0421, 'en'), '0.042');
    assertEqual(formatP(1, 'de'), '1,000');
  });

  test('non-finite → dash', () => {
    assertEqual(formatP(NaN, 'de'), '—');
    assertEqual(formatP(undefined, 'en'), '—');
  });
});

suite('MSA Typ 5 Model — wide layout', () => {
  const ref = (columnId) => ({ instanceId: 'ws', sheetId: 's1', columnId });

  test('new State is long layout, 2 trials, no rating columns', () => {
    const s = new State();
    assertEqual(s.params.layout, 'long');
    assertEqual(s.params.trials, '2');
    assertEqual(JSON.stringify(s.columns.ratings), '[]');
  });

  test('saved study without layout loads as long', () => {
    const s = State.fromJSON({ params: { type: 'binary' }, columns: {} });
    assertEqual(s.params.layout, 'long');
    assertEqual(s.params.trials, '2');
    assertEqual(JSON.stringify(s.columns.ratings), '[]');
  });

  test('wide layout, trials and rating columns survive a JSON round trip', () => {
    const s = new State();
    s.params.layout = 'wide';
    s.params.trials = '3';
    s.columns.ratings = [ref('c1'), ref('c2')];
    const back = State.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
    assertEqual(back.params.layout, 'wide');
    assertEqual(back.params.trials, '3');
    assertEqual(JSON.stringify(back.columns.ratings), JSON.stringify([ref('c1'), ref('c2')]));
  });

  test('unknown layout falls back to long; malformed refs are dropped', () => {
    const s = State.fromJSON({ params: { layout: 'pivot', trials: 4 }, columns: { ratings: [ref('c1'), null, { columnId: 'x' }] } });
    assertEqual(s.params.layout, 'long');
    assertEqual(s.params.trials, '4');
    assertEqual(s.columns.ratings.length, 1);
  });

  test('selected rating columns count as content', () => {
    const s = new State();
    s.columns.ratings = [ref('c1')];
    assertEqual(s.hasContent(), true);
  });
});

suite('MSA Typ 5 Model — formatNum / formatPct', () => {
  test('κ uses the language decimal separator, like p', () => {
    assertEqual(formatNum(0.9224, 3, 'de'), '0,922');
    assertEqual(formatNum(0.9224, 3, 'en'), '0.922');
    assertEqual(formatNum(-0.0444, 3, 'de'), '-0,044');
    assertEqual(formatNum(30.27, 1, 'de'), '30,3');
  });

  test('rates as percent with one decimal and the language separator', () => {
    assertEqual(formatPct(0.9778, 'de'), '97,8 %');
    assertEqual(formatPct(0.9778, 'en'), '97.8 %');
    assertEqual(formatPct(0, 'de'), '0,0 %');
  });

  test('non-finite → dash', () => {
    assertEqual(formatNum(NaN, 3, 'de'), '—');
    assertEqual(formatNum(null, 3, 'en'), '—');
    assertEqual(formatPct(undefined, 'de'), '—');
  });
});
