import { suite, test, assertEqual } from '../test-utils.js';
import { State } from '../../js/modules/triz-ifr/triz-ifr-model.js';

suite('TRIZ IFR Model — State', () => {
  test('constructor sets default values', () => {
    const s = new State();
    assertEqual(s.system, '');
    assertEqual(s.usefulFunction, '');
    assertEqual(s.harmfulEffect, '');
    assertEqual(s.ifr1, '');
    assertEqual(s.ifr2, '');
    assertEqual(s.ifr3, '');
    assertEqual(s.obstacles, '');
  });

  test('toJSON returns expected shape', () => {
    const s = new State();
    s.system = 'Test system';
    s.usefulFunction = 'Test function';
    s.ifr2 = 'IFR-2 text';
    const json = s.toJSON();
    assertEqual(json.system, 'Test system');
    assertEqual(json.usefulFunction, 'Test function');
    assertEqual(json.ifr2, 'IFR-2 text');
    assertEqual(json._schema.name, 'triz-ifr');
    assertEqual(json._schema.version, '1.0');
  });

  test('toJSON does not leak _schema reference', () => {
    const s = new State();
    const json = s.toJSON();
    json._schema.version = 'hacked';
    assertEqual(s._schema.version, '1.0');
  });

  test('fromJSON(null) returns valid default', () => {
    const s = State.fromJSON(null);
    assertEqual(s.system, '');
    assertEqual(s.usefulFunction, '');
    assertEqual(s.harmfulEffect, '');
  });

  test('fromJSON(undefined) returns valid default', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.system, '');
  });

  test('fromJSON empty object returns default state', () => {
    const s = State.fromJSON({});
    assertEqual(s.system, '');
    assertEqual(s.usefulFunction, '');
  });

  test('fromJSON restores all fields correctly', () => {
    const s = State.fromJSON({
      system: 'Belt conveyor',
      usefulFunction: 'Transports material',
      harmfulEffect: 'Material jams',
      ifr1: 'System prevents jam',
      ifr2: 'No jam occurs',
      ifr3: 'Gravity resolves jam',
      obstacles: 'Angle too steep',
    });
    assertEqual(s.system, 'Belt conveyor');
    assertEqual(s.usefulFunction, 'Transports material');
    assertEqual(s.harmfulEffect, 'Material jams');
    assertEqual(s.ifr1, 'System prevents jam');
    assertEqual(s.ifr2, 'No jam occurs');
    assertEqual(s.ifr3, 'Gravity resolves jam');
    assertEqual(s.obstacles, 'Angle too steep');
  });

  test('toJSON / fromJSON round-trip is lossless', () => {
    const s = new State();
    s.system = 'Sys';
    s.usefulFunction = 'Func';
    s.harmfulEffect = 'Harm';
    s.ifr1 = 'IFR1';
    s.ifr2 = 'IFR2';
    s.ifr3 = 'IFR3';
    s.obstacles = 'Obs';
    const json = s.toJSON();
    const restored = State.fromJSON(json);
    assertEqual(restored.system, 'Sys');
    assertEqual(restored.usefulFunction, 'Func');
    assertEqual(restored.harmfulEffect, 'Harm');
    assertEqual(restored.ifr1, 'IFR1');
    assertEqual(restored.ifr2, 'IFR2');
    assertEqual(restored.ifr3, 'IFR3');
    assertEqual(restored.obstacles, 'Obs');
  });

  test('invalid data types fall back to defaults', () => {
    const s = State.fromJSON({
      system: 123,
      usefulFunction: null,
      harmfulEffect: undefined,
      ifr1: {},
      ifr2: [],
      ifr3: true,
      obstacles: false,
    });
    assertEqual(s.system, '');
    assertEqual(s.usefulFunction, '');
    assertEqual(s.harmfulEffect, '');
    assertEqual(s.ifr1, '');
    assertEqual(s.ifr2, '');
    assertEqual(s.ifr3, '');
    assertEqual(s.obstacles, '');
  });

  suite('TRIZ IFR Model — hasContent', () => {
    test('returns false for empty state', () => {
      const s = new State();
      assertEqual(s.hasContent(), false);
    });

    test('returns true when system is set', () => {
      const s = new State();
      s.system = 'Test system';
      assertEqual(s.hasContent(), true);
    });

    test('returns true when usefulFunction is set', () => {
      const s = new State();
      s.usefulFunction = 'Test function';
      assertEqual(s.hasContent(), true);
    });

    test('returns true when harmfulEffect is set', () => {
      const s = new State();
      s.harmfulEffect = 'Test harm';
      assertEqual(s.hasContent(), true);
    });

    test('returns true when any ifr field is set', () => {
      const s = new State();
      s.ifr2 = 'IFR text';
      assertEqual(s.hasContent(), true);
    });

    test('returns true when obstacles is set', () => {
      const s = new State();
      s.obstacles = 'Blockers';
      assertEqual(s.hasContent(), true);
    });

    test('returns false after fromJSON of empty data', () => {
      const s = State.fromJSON({});
      assertEqual(s.hasContent(), false);
    });

    test('returns true after fromJSON of filled data', () => {
      const s = State.fromJSON({ ifr3: 'Supersystem resource' });
      assertEqual(s.hasContent(), true);
    });

    test('round-trip preserves hasContent', () => {
      const s = new State();
      s.system = 'Sys';
      s.obstacles = 'Obs';
      const json = s.toJSON();
      const restored = State.fromJSON(json);
      assertEqual(restored.hasContent(), true);
    });
  });
});
