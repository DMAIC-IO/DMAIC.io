import { suite, test, assertEqual } from '../test-utils.js';
import { State } from '../../js/modules/triz-physical-contradiction/triz-physical-contradiction-model.js';

suite('TRIZ Physical Contradiction Model — State', () => {
  test('constructor sets default values', () => {
    const s = new State();
    assertEqual(s.parameter, '');
    assertEqual(s.requirementA, '');
    assertEqual(s.requirementNotA, '');
    assertEqual(s.problemNote, '');
    assertEqual(s.principleNotes.time, '');
    assertEqual(s.principleNotes.space, '');
    assertEqual(s.principleNotes.condition, '');
    assertEqual(s.principleNotes.system, '');
    assertEqual(s.selectedPrinciple, null);
    assertEqual(s.solutionNote, '');
  });

  test('toJSON returns expected shape', () => {
    const s = new State();
    s.parameter = 'Wing length';
    s.requirementA = 'long';
    const json = s.toJSON();
    assertEqual(json.parameter, 'Wing length');
    assertEqual(json.requirementA, 'long');
    assertEqual(json._schema.name, 'triz-physical-contradiction');
    assertEqual(json._schema.version, '1.0');
  });

  test('fromJSON(null) returns defaults', () => {
    const s = State.fromJSON(null);
    assertEqual(s.parameter, '');
    assertEqual(s.selectedPrinciple, null);
  });

  test('fromJSON(undefined) returns defaults', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.parameter, '');
  });

  test('fromJSON restores data correctly', () => {
    const s = State.fromJSON({
      parameter: 'Wing length',
      requirementA: 'long',
      requirementNotA: 'short',
      problemNote: 'textbook example',
      principleNotes: { time: 'fold', space: '', condition: '', system: '' },
      selectedPrinciple: 'time',
      solutionNote: 'swing wing',
    });
    assertEqual(s.parameter, 'Wing length');
    assertEqual(s.requirementA, 'long');
    assertEqual(s.requirementNotA, 'short');
    assertEqual(s.problemNote, 'textbook example');
    assertEqual(s.principleNotes.time, 'fold');
    assertEqual(s.selectedPrinciple, 'time');
    assertEqual(s.solutionNote, 'swing wing');
  });

  test('toJSON → fromJSON round-trip', () => {
    const s1 = new State();
    s1.parameter = 'Wing length';
    s1.requirementA = 'long';
    s1.requirementNotA = 'short';
    s1.problemNote = 'textbook';
    s1.principleNotes.time = 'variable geometry';
    s1.selectedPrinciple = 'time';
    s1.solutionNote = 'swing wing';
    const json = s1.toJSON();
    const s2 = State.fromJSON(json);
    assertEqual(s2.parameter, 'Wing length');
    assertEqual(s2.requirementA, 'long');
    assertEqual(s2.requirementNotA, 'short');
    assertEqual(s2.problemNote, 'textbook');
    assertEqual(s2.principleNotes.time, 'variable geometry');
    assertEqual(s2.selectedPrinciple, 'time');
    assertEqual(s2.solutionNote, 'swing wing');
  });

  test('fromJSON sanitizes invalid selectedPrinciple', () => {
    const s = State.fromJSON({ selectedPrinciple: 'invalid' });
    assertEqual(s.selectedPrinciple, null);
  });

  test('fromJSON handles partial data', () => {
    const s = State.fromJSON({ parameter: 'test' });
    assertEqual(s.parameter, 'test');
    assertEqual(s.requirementA, '');
    assertEqual(s.selectedPrinciple, null);
  });

  test('swap exchanges A and ¬A', () => {
    const s = new State();
    s.requirementA = 'First';
    s.requirementNotA = 'Second';
    s.swap();
    assertEqual(s.requirementA, 'Second');
    assertEqual(s.requirementNotA, 'First');
  });

  test('swap works with empty values', () => {
    const s = new State();
    s.swap();
    assertEqual(s.requirementA, '');
    assertEqual(s.requirementNotA, '');
  });

  test('hasContent returns false for empty state', () => {
    const s = new State();
    assertEqual(s.hasContent(), false);
  });

  test('hasContent returns true when parameter is set', () => {
    const s = new State();
    s.parameter = 'test';
    assertEqual(s.hasContent(), true);
  });

  test('hasContent returns true when requirementA is set', () => {
    const s = new State();
    s.requirementA = 'test';
    assertEqual(s.hasContent(), true);
  });

  test('hasContent returns true when principle has note', () => {
    const s = new State();
    s.principleNotes.time = 'some note';
    assertEqual(s.hasContent(), true);
  });

  test('hasContent returns true when principle selected', () => {
    const s = new State();
    s.selectedPrinciple = 'time';
    assertEqual(s.hasContent(), true);
  });

  test('hasContent returns true when solutionNote is set', () => {
    const s = new State();
    s.solutionNote = 'solution';
    assertEqual(s.hasContent(), true);
  });
});
