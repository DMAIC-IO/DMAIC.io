import { suite, test, assertEqual } from '../test-utils.js';
import { computeSwitchImpact } from '../../js/pages/cycle/cycle.js';

// Fake registry: id → def. project-charter maps to dmadv; triz only to eightd.
const registry = {
  get: (id) => ({
    'project-charter': { cycles: { dmaic: { phase: 'define' }, dmadv: { phase: 'define' } } },
    'triz-9-windows':  { cycles: { eightd: { phase: 'corrective' } } },
  }[id] || null),
};

suite('computeSwitchImpact', () => {
  test('DMAIC → DMADV loses I/C and adds design/verify', () => {
    const r = computeSwitchImpact('dmaic', 'dmadv', {}, registry);
    assertEqual(r.lostPhases.join(','), 'improve,control');
    assertEqual(r.newAdded.join(','), 'design,verify');
    assertEqual(r.mapped, 0);
    assertEqual(r.fallback, 0);
  });

  test('counts a mapped instance (project-charter → dmadv.define)', () => {
    const phases = { define: [{ moduleId: 'project-charter' }] };
    const r = computeSwitchImpact('dmaic', 'dmadv', phases, registry);
    assertEqual(r.mapped, 1);
    assertEqual(r.fallback, 0);
  });

  test('a phase-placed instance with no target mapping is fallback', () => {
    // triz has only an eightd mapping → switching 8D→DMADV, the corrective
    // instance has no dmadv mapping → else-branch fallback++.
    const phases = { corrective: [{ moduleId: 'triz-9-windows' }] };
    const r = computeSwitchImpact('eightd', 'dmadv', phases, registry);
    assertEqual(r.mapped, 0);
    assertEqual(r.fallback, 1);
  });

  test('extras are always fallback', () => {
    const phases = { extras: [{ moduleId: 'triz-9-windows' }, { moduleId: 'x' }] };
    const r = computeSwitchImpact('dmaic', 'dmadv', phases, registry);
    assertEqual(r.fallback, 2);
  });

  test('unknown moduleId (no def) counts as fallback', () => {
    const phases = { define: [{ moduleId: 'does-not-exist' }] };
    const r = computeSwitchImpact('dmaic', 'dmadv', phases, registry);
    assertEqual(r.fallback, 1);
    assertEqual(r.mapped, 0);
  });
});
