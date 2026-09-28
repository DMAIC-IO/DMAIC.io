import { suite, test, assertEqual } from '../test-utils.js';
import { State, RULESET_OPTIONS, formatP } from '../../js/modules/msa-typ5/msa-typ5-model.js';

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
