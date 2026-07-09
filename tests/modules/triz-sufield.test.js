import { suite, test, assertEqual } from '../test-utils.js';
import { State, diagnose } from '../../js/modules/triz-sufield/triz-sufield-model.js';

suite('TRIZ Sufield — diagnose()', () => {
  test('partial when s1 is empty', () => {
    const d = diagnose('', 's2', 'M', 'useful');
    assertEqual(d.situation, 'partial');
    assertEqual(d.suggestedClasses.length, 1);
    assertEqual(d.suggestedClasses[0], 1);
  });

  test('partial when s2 is empty', () => {
    const d = diagnose('s1', '', 'M', 'useful');
    assertEqual(d.situation, 'partial');
  });

  test('partial when both substances empty', () => {
    const d = diagnose('', '', '', '');
    assertEqual(d.situation, 'partial');
  });

  test('incomplete when no field selected', () => {
    const d = diagnose('s1', 's2', '', 'useful');
    assertEqual(d.situation, 'incomplete');
    assertEqual(d.suggestedClasses[0], 1);
  });

  test('incomplete when link is missing', () => {
    const d = diagnose('s1', 's2', 'M', 'missing');
    assertEqual(d.situation, 'incomplete');
  });

  test('complete-useful', () => {
    const d = diagnose('s1', 's2', 'M', 'useful');
    assertEqual(d.situation, 'complete-useful');
    assertEqual(JSON.stringify(d.suggestedClasses), JSON.stringify([2, 3]));
  });

  test('complete-insufficient', () => {
    const d = diagnose('s1', 's2', 'T', 'insufficient');
    assertEqual(d.situation, 'complete-insufficient');
    assertEqual(JSON.stringify(d.suggestedClasses), JSON.stringify([2]));
  });

  test('complete-excessive', () => {
    const d = diagnose('s1', 's2', 'E', 'excessive');
    assertEqual(d.situation, 'complete-excessive');
    assertEqual(JSON.stringify(d.suggestedClasses), JSON.stringify([2, 5]));
  });

  test('complete-harmful', () => {
    const d = diagnose('s1', 's2', 'C', 'harmful');
    assertEqual(d.situation, 'complete-harmful');
    assertEqual(JSON.stringify(d.suggestedClasses), JSON.stringify([1, 5]));
  });

  test('incomplete for unknown link', () => {
    const d = diagnose('s1', 's2', 'Mg', '');
    assertEqual(d.situation, 'incomplete');
  });

  test('whitespace-only s1 treated as empty', () => {
    const d = diagnose('  ', 's2', 'M', 'useful');
    assertEqual(d.situation, 'partial');
  });
});

suite('TRIZ Sufield Model — State', () => {
  test('constructor sets default values', () => {
    const s = new State();
    assertEqual(s.s1, '');
    assertEqual(s.s2, '');
    assertEqual(s.field, '');
    assertEqual(s.link, '');
    assertEqual(s.problemNote, '');
    assertEqual(s.filterMode, 'auto');
    assertEqual(s.expandedClasses.length, 0);
    assertEqual(Object.keys(s.notes).length, 0);
    assertEqual(Object.keys(s.selected).length, 0);
  });

  test('hasContent returns false for default state', () => {
    const s = new State();
    assertEqual(s.hasContent(), false);
  });

  test('hasContent returns true when s1 is set', () => {
    const s = new State();
    s.s1 = 'hello';
    assertEqual(s.hasContent(), true);
  });

  test('hasContent returns true when s2 is set', () => {
    const s = new State();
    s.s2 = 'world';
    assertEqual(s.hasContent(), true);
  });

  test('hasContent returns true when field is set', () => {
    const s = new State();
    s.field = 'M';
    assertEqual(s.hasContent(), true);
  });

  test('hasContent returns true when link is set', () => {
    const s = new State();
    s.link = 'useful';
    assertEqual(s.hasContent(), true);
  });

  test('hasContent returns true when problemNote is set', () => {
    const s = new State();
    s.problemNote = 'a problem';
    assertEqual(s.hasContent(), true);
  });

  test('hasContent returns true when notes has entries', () => {
    const s = new State();
    s.notes['42'] = 'some note';
    assertEqual(s.hasContent(), true);
  });

  test('hasContent returns true when selected has entries', () => {
    const s = new State();
    s.selected['7'] = true;
    assertEqual(s.hasContent(), true);
  });

  test('toJSON returns _schema with name and version', () => {
    const s = new State();
    const json = s.toJSON();
    assertEqual(json._schema.name, 'triz-sufield');
    assertEqual(json._schema.version, '1.0');
  });

  test('toJSON serialises all fields', () => {
    const s = new State();
    s.s1 = 'bearing';
    s.s2 = 'housing';
    s.field = 'M';
    s.link = 'useful';
    s.problemNote = 'needs lubrication';
    s.notes['5'] = 'check clearance';
    s.selected['3'] = true;
    s.filterMode = 'all';
    s.expandedClasses = [1, 2];
    const json = s.toJSON();
    assertEqual(json.s1, 'bearing');
    assertEqual(json.s2, 'housing');
    assertEqual(json.field, 'M');
    assertEqual(json.link, 'useful');
    assertEqual(json.problemNote, 'needs lubrication');
    assertEqual(json.notes['5'], 'check clearance');
    assertEqual(json.selected['3'], true);
    assertEqual(json.filterMode, 'all');
    assertEqual(JSON.stringify(json.expandedClasses), JSON.stringify([1, 2]));
    assertEqual(json.notes['5'], 'check clearance');
    assertEqual(json.selected['3'], true);
    assertEqual(json.filterMode, 'all');
    assertEqual(JSON.stringify(json.expandedClasses), JSON.stringify([1, 2]));
  });

  test('toJSON does not leak internal _schema reference', () => {
    const s = new State();
    const json = s.toJSON();
    json._schema.version = 'hacked';
    assertEqual(s._schema.version, '1.0');
  });

  test('toJSON does not leak notes reference', () => {
    const s = new State();
    s.notes['1'] = 'original';
    const json = s.toJSON();
    json.notes['1'] = 'mutated';
    assertEqual(s.notes['1'], 'original');
  });

  test('toJSON does not leak selected reference', () => {
    const s = new State();
    s.selected['2'] = true;
    const json = s.toJSON();
    json.selected['2'] = false;
    assertEqual(s.selected['2'], true);
  });

  test('toJSON does not leak expandedClasses reference', () => {
    const s = new State();
    s.expandedClasses = [1, 2];
    const json = s.toJSON();
    json.expandedClasses.push(3);
    assertEqual(s.expandedClasses.length, 2);
  });

  test('fromJSON restores full state', () => {
    const original = new State();
    original.s1 = 'shaft';
    original.s2 = 'bearing';
    original.field = 'Mg';
    original.link = 'harmful';
    original.problemNote = 'vibration';
    original.notes['10'] = 'check lubrication';
    original.selected['5'] = true;
    original.filterMode = 'all';
    original.expandedClasses = [1, 5];
    const json = original.toJSON();
    const restored = State.fromJSON(json);
    assertEqual(restored.s1, 'shaft');
    assertEqual(restored.s2, 'bearing');
    assertEqual(restored.field, 'Mg');
    assertEqual(restored.link, 'harmful');
    assertEqual(restored.problemNote, 'vibration');
    assertEqual(restored.notes['10'], 'check lubrication');
    assertEqual(restored.selected['5'], true);
    assertEqual(restored.filterMode, 'all');
    assertEqual(JSON.stringify(restored.expandedClasses), JSON.stringify([1, 5]));
  });

  test('fromJSON with null returns default state', () => {
    const s = State.fromJSON(null);
    assertEqual(s.s1, '');
    assertEqual(s.s2, '');
    assertEqual(s.field, '');
    assertEqual(s.link, '');
    assertEqual(s.filterMode, 'auto');
  });

  test('fromJSON with undefined returns default state', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.s1, '');
  });

  test('fromJSON sanitises s1 to string', () => {
    const s = State.fromJSON({ s1: 42 });
    assertEqual(s.s1, '');
  });

  test('fromJSON sanitises field to valid values only', () => {
    const s = State.fromJSON({ field: 'INVALID' });
    assertEqual(s.field, '');
  });

  test('fromJSON preserves valid field values', () => {
    const s = State.fromJSON({ field: 'E' });
    assertEqual(s.field, 'E');
  });

  test('fromJSON sanitises link to valid values only', () => {
    const s = State.fromJSON({ link: 'INVALID' });
    assertEqual(s.link, '');
  });

  test('fromJSON preserves valid link values', () => {
    const s = State.fromJSON({ link: 'excessive' });
    assertEqual(s.link, 'excessive');
  });

  test('fromJSON sanitises filterMode to auto for invalid values', () => {
    const s = State.fromJSON({ filterMode: 'everything' });
    assertEqual(s.filterMode, 'auto');
  });

  test('fromJSON preserves filterMode = all', () => {
    const s = State.fromJSON({ filterMode: 'all' });
    assertEqual(s.filterMode, 'all');
  });

  test('fromJSON sanitises expandedClasses to integer array', () => {
    const s = State.fromJSON({ expandedClasses: [1, 'x', 3, null, 5] });
    assertEqual(JSON.stringify(s.expandedClasses), JSON.stringify([1, 3, 5]));
  });

  test('fromJSON handles non-array expandedClasses', () => {
    const s = State.fromJSON({ expandedClasses: 'invalid' });
    assertEqual(s.expandedClasses.length, 0);
  });

  test('fromJSON empty object returns defaults', () => {
    const s = State.fromJSON({});
    assertEqual(s.s1, '');
    assertEqual(s.s2, '');
    assertEqual(s.field, '');
    assertEqual(s.link, '');
  });

  test('round-trip preserves state', () => {
    const original = new State();
    original.s1 = 'a';
    original.s2 = 'b';
    original.field = 'T';
    original.link = 'insufficient';
    original.problemNote = 'wear';
    original.notes['1'] = 'n1';
    original.selected['2'] = true;
    original.filterMode = 'all';
    original.expandedClasses = [2];
    const json = original.toJSON();
    const restored = State.fromJSON(json);
    assertEqual(restored.s1, 'a');
    assertEqual(restored.s2, 'b');
    assertEqual(restored.field, 'T');
    assertEqual(restored.link, 'insufficient');
    assertEqual(restored.problemNote, 'wear');
    assertEqual(restored.notes['1'], 'n1');
    assertEqual(restored.selected['2'], true);
    assertEqual(restored.filterMode, 'all');
    assertEqual(JSON.stringify(restored.expandedClasses), JSON.stringify([2]));
  });
});
