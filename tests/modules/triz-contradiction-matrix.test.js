import { suite, test, assertEqual } from '../test-utils.js';
import { State } from '../../js/modules/triz-contradiction-matrix/triz-contradiction-matrix-model.js';

suite('TRIZ Contradiction Matrix Model — State', () => {
  test('constructor sets default values', () => {
    const s = new State();
    assertEqual(s.improving, null);
    assertEqual(s.worsening, null);
    assertEqual(s.problemNote, '');
    assertEqual(s.showMatrix, false);
  });

  test('hasContent returns false for empty state', () => {
    const s = new State();
    assertEqual(s.hasContent(), false);
  });

  test('hasContent returns true when improving is set', () => {
    const s = new State();
    s.improving = 1;
    assertEqual(s.hasContent(), true);
  });

  test('hasContent returns true when worsening is set', () => {
    const s = new State();
    s.worsening = 5;
    assertEqual(s.hasContent(), true);
  });

  test('hasContent returns true when problemNote is set', () => {
    const s = new State();
    s.problemNote = 'some problem';
    assertEqual(s.hasContent(), true);
  });

  test('toJSON returns all fields', () => {
    const s = new State();
    s.improving = 9;
    s.worsening = 39;
    s.problemNote = 'test problem';
    s.showMatrix = true;
    const json = s.toJSON();
    assertEqual(json.improving, 9);
    assertEqual(json.worsening, 39);
    assertEqual(json.problemNote, 'test problem');
    assertEqual(json.showMatrix, true);
  });

  test('fromJSON restores valid data', () => {
    const s = State.fromJSON({
      improving: 9,
      worsening: 39,
      problemNote: 'speed vs productivity',
      showMatrix: true,
    });
    assertEqual(s.improving, 9);
    assertEqual(s.worsening, 39);
    assertEqual(s.problemNote, 'speed vs productivity');
    assertEqual(s.showMatrix, true);
  });

  test('fromJSON with string numbers converts to number', () => {
    const s = State.fromJSON({
      improving: '9',
      worsening: '39',
    });
    assertEqual(s.improving, 9);
    assertEqual(s.worsening, 39);
  });

  test('fromJSON with null returns default state', () => {
    const s = State.fromJSON(null);
    assertEqual(s.improving, null);
    assertEqual(s.worsening, null);
    assertEqual(s.problemNote, '');
    assertEqual(s.showMatrix, false);
  });

  test('fromJSON with undefined returns default state', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.improving, null);
    assertEqual(s.worsening, null);
  });

  test('fromJSON sanitises problemNote to string', () => {
    const s = State.fromJSON({ problemNote: 123 });
    assertEqual(s.problemNote, '');
  });

  test('fromJSON with empty data returns default', () => {
    const s = State.fromJSON({});
    assertEqual(s.improving, null);
    assertEqual(s.worsening, null);
    assertEqual(s.problemNote, '');
    assertEqual(s.showMatrix, false);
  });

  test('fromJSON null improving/worsening handled correctly', () => {
    const s = State.fromJSON({
      improving: null,
      worsening: null,
      problemNote: '',
    });
    assertEqual(s.improving, null);
    assertEqual(s.worsening, null);
  });

  test('round-trip toJSON → fromJSON preserves all fields', () => {
    const original = new State();
    original.improving = 1;
    original.worsening = 3;
    original.problemNote = 'stronger but heavier';
    original.showMatrix = true;

    const json = original.toJSON();
    const restored = State.fromJSON(json);
    assertEqual(restored.improving, 1);
    assertEqual(restored.worsening, 3);
    assertEqual(restored.problemNote, 'stronger but heavier');
    assertEqual(restored.showMatrix, true);
  });
});
