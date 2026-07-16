import { suite, test, assertEqual } from '../test-utils.js';
import { Stakeholder, State, QUAD_ORDER } from '../../js/modules/stakeholder-analysis/stakeholder-analysis-model.js';

suite('Stakeholder Analysis Model — Stakeholder', () => {
  test('constructor sets default values', () => {
    const s = new Stakeholder();
    assertEqual(s.name, '');
    assertEqual(s.role, '');
    assertEqual(s.power, 3);
    assertEqual(s.interest, 3);
    assertEqual(s.support, 'neutral');
    assertEqual(s.category, 'intern');
    assertEqual(s.notes, '');
  });

  test('quadrant: high power + high interest → manage-closely', () => {
    const s = Stakeholder.fromJSON({ name: 'A', power: 5, interest: 5 });
    assertEqual(s.quadrant, 'manage-closely');
  });

  test('quadrant: high power + low interest → keep-satisfied', () => {
    const s = Stakeholder.fromJSON({ name: 'A', power: 5, interest: 1 });
    assertEqual(s.quadrant, 'keep-satisfied');
  });

  test('quadrant: low power + high interest → keep-informed', () => {
    const s = Stakeholder.fromJSON({ name: 'A', power: 1, interest: 5 });
    assertEqual(s.quadrant, 'keep-informed');
  });

  test('quadrant: low power + low interest → monitor', () => {
    const s = Stakeholder.fromJSON({ name: 'A', power: 1, interest: 1 });
    assertEqual(s.quadrant, 'monitor');
  });

  test('quadrant boundary: power=4 interest=4 → manage-closely', () => {
    const s = Stakeholder.fromJSON({ name: 'A', power: 4, interest: 4 });
    assertEqual(s.quadrant, 'manage-closely');
  });

  test('toJSON returns all persistent fields', () => {
    const s = Stakeholder.fromJSON({
      id: 'x1', name: 'Alice', role: 'CEO', power: 5, interest: 4,
      support: 'supporter', category: 'extern', notes: 'hi',
    });
    const j = s.toJSON();
    assertEqual(j.id, 'x1');
    assertEqual(j.name, 'Alice');
    assertEqual(j.role, 'CEO');
    assertEqual(j.power, 5);
    assertEqual(j.interest, 4);
    assertEqual(j.support, 'supporter');
    assertEqual(j.category, 'extern');
    assertEqual(j.notes, 'hi');
  });

  test('fromJSON restores valid data', () => {
    const s = Stakeholder.fromJSON({ id: 'i', name: 'Bob', power: 2, interest: 3, support: 'critic', category: 'kunde' });
    assertEqual(s.name, 'Bob');
    assertEqual(s.power, 2);
    assertEqual(s.support, 'critic');
    assertEqual(s.category, 'kunde');
  });

  test('fromJSON preserves extended support values verbatim (e.g. example "resistor")', () => {
    const s = Stakeholder.fromJSON({ name: 'X', support: 'resistor' });
    assertEqual(s.support, 'resistor');
  });

  test('fromJSON defaults support to neutral only when missing/non-string', () => {
    assertEqual(Stakeholder.fromJSON({ name: 'X' }).support, 'neutral');
    assertEqual(Stakeholder.fromJSON({ name: 'X', support: 42 }).support, 'neutral');
  });

  test('fromJSON preserves extended category values verbatim (e.g. example "Sponsor")', () => {
    const s = Stakeholder.fromJSON({ name: 'X', category: 'Sponsor' });
    assertEqual(s.category, 'Sponsor');
  });

  test('fromJSON defaults category to intern only when missing/non-string', () => {
    assertEqual(Stakeholder.fromJSON({ name: 'X' }).category, 'intern');
    assertEqual(Stakeholder.fromJSON({ name: 'X', category: null }).category, 'intern');
  });

  test('fromJSON clamps power/interest into 1..5', () => {
    const lo = Stakeholder.fromJSON({ name: 'X', power: 0, interest: 99 });
    assertEqual(lo.power, 1);
    assertEqual(lo.interest, 5);
    const bad = Stakeholder.fromJSON({ name: 'X', power: 'abc', interest: null });
    assertEqual(bad.power, 3);
    assertEqual(bad.interest, 3);
  });

  test('fromJSON keeps provided id', () => {
    const s = Stakeholder.fromJSON({ id: 'keep-me', name: 'X' });
    assertEqual(s.id, 'keep-me');
  });

  test('fromJSON generates an id when missing', () => {
    const s = Stakeholder.fromJSON({ name: 'X' });
    assertEqual(typeof s.id, 'string');
    assertEqual(s.id.length > 0, true);
  });

  test('toJSON → fromJSON round-trip is lossless', () => {
    const a = Stakeholder.fromJSON({
      id: 'r1', name: 'Carol', role: 'Lead', power: 4, interest: 2,
      support: 'supporter', category: 'lieferant', notes: 'n',
    });
    const b = Stakeholder.fromJSON(a.toJSON());
    assertEqual(JSON.stringify(b.toJSON()), JSON.stringify(a.toJSON()));
  });
});

suite('Stakeholder Analysis Model — State', () => {
  test('constructor creates empty stakeholder list', () => {
    const s = new State();
    assertEqual(Array.isArray(s.stakeholders), true);
    assertEqual(s.stakeholders.length, 0);
  });

  test('hasContent false when empty', () => {
    assertEqual(new State().hasContent(), false);
  });

  test('hasContent true with at least one stakeholder', () => {
    const s = State.fromJSON({ stakeholders: [{ name: 'A' }] });
    assertEqual(s.hasContent(), true);
  });

  test('fromJSON(null) returns valid empty default', () => {
    const s = State.fromJSON(null);
    assertEqual(s.stakeholders.length, 0);
  });

  test('fromJSON(undefined) returns valid empty default', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.stakeholders.length, 0);
  });

  test('fromJSON restores stakeholders as Stakeholder instances', () => {
    const s = State.fromJSON({ stakeholders: [{ id: '1', name: 'A', power: 5, interest: 5 }] });
    assertEqual(s.stakeholders.length, 1);
    assertEqual(s.stakeholders[0] instanceof Stakeholder, true);
    assertEqual(s.stakeholders[0].quadrant, 'manage-closely');
  });

  test('fromJSON tolerates non-array stakeholders', () => {
    const s = State.fromJSON({ stakeholders: 'oops' });
    assertEqual(s.stakeholders.length, 0);
  });

  test('toJSON → fromJSON round-trip is lossless', () => {
    const a = State.fromJSON({ stakeholders: [
      { id: '1', name: 'A', role: 'r', power: 5, interest: 1, support: 'supporter', category: 'intern', notes: '' },
      { id: '2', name: 'B', role: '', power: 1, interest: 1, support: 'neutral', category: 'kunde', notes: 'x' },
    ] });
    const b = State.fromJSON(a.toJSON());
    assertEqual(JSON.stringify(b.toJSON()), JSON.stringify(a.toJSON()));
  });

  test('QUAD_ORDER lists all four quadrants', () => {
    assertEqual(QUAD_ORDER.length, 4);
    assertEqual(QUAD_ORDER.includes('manage-closely'), true);
    assertEqual(QUAD_ORDER.includes('monitor'), true);
  });
});
