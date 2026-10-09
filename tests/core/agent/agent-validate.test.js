/**
 * Tests for core/agent/agent-validate.js — the five validation stages from
 * Spec §5. The contract under test: a failing stage executes NOTHING, and the
 * error names the offending entry plus the valid alternatives (Spec §6).
 *
 * Ruling K6: a `phase` is checked twice — first against the active cycle's
 * known phase ids (`world.phases`), then (only if the cycle knows it) against
 * the target module's `allowedPhases`. Both failures report
 * `ERRORS.UNKNOWN_PHASE` (the contract has only one phase-related code), but
 * with different messages and a different `available` list — see the two
 * tests tagged "Ruling K6" below.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../../test-utils.js';
import { validateBatch } from '../../../js/core/agent/agent-validate.js';

/** `t` stand-in: returns "key|param=value,…" so assertions stay language-free. */
function t(key, params) {
  const tail = params ? Object.entries(params).map(([k, v]) => `${k}=${v}`).join(',') : '';
  return tail ? `${key}|${tail}` : key;
}

function makeWorld(overrides = {}) {
  return {
    t,
    // "nowhere" is part of the active cycle but not allowed for any module
    // below — it exists so Stufe 5's module-level phase test (not the
    // cycle-level one) can exercise the "known to the cycle but not allowed
    // for this module" branch.
    phases: ['data', 'define', 'measure', 'analyze', 'improve', 'control', 'extras', 'nowhere'],
    modules: new Map([
      ['worksheet',  { available: true,  methods: ['read', 'importCsv', 'setCell'], allowedPhases: ['data'] }],
      ['five-why',   { available: true,  methods: ['read', 'setProblem', 'addWhy'], allowedPhases: ['define'] }],
      ['regression', { available: true,  methods: ['read', 'setSource', 'run'],     allowedPhases: ['analyze', 'measure'] }],
      ['sipoc',      { available: false, methods: null,                             allowedPhases: ['define'] }],
    ]),
    instances: new Map([
      ['fw-1', { module: 'five-why', phase: 'define' }],
    ]),
    ...overrides,
  };
}

suite('agent validate — Stufe 1: Form', () => {
  test('a single action object is accepted and normalised to a one-entry array', () => {
    const r = validateBatch({ op: 'project.read' }, makeWorld());
    assertTrue(r.ok, JSON.stringify(r));
    assertEqual(r.actions.length, 1);
  });

  test('a non-object entry is rejected', () => {
    const r = validateBatch(['project.read'], makeWorld());
    assertEqual(r.ok, false);
    assertEqual(r.cause.error, 'bad_shape');
    assertEqual(r.index, 0);
  });

  test('a missing op is rejected', () => {
    const r = validateBatch([{ module: 'worksheet' }], makeWorld());
    assertEqual(r.ok, false);
    assertEqual(r.cause.error, 'missing_op');
    assertEqual(r.index, 0);
  });

  test('duplicate ids are rejected', () => {
    const r = validateBatch(
      [{ id: 'a1', op: 'project.read' }, { id: 'a1', op: 'catalog.read' }], makeWorld());
    assertEqual(r.ok, false);
    assertEqual(r.cause.error, 'duplicate_id');
    assertEqual(r.index, 1);
    assertEqual(r.id, 'a1');
  });
});

suite('agent validate — Stufe 2: op existiert', () => {
  test('an unknown op lists every valid op', () => {
    const r = validateBatch([{ op: 'worksheet.import' }], makeWorld());
    assertEqual(r.ok, false);
    assertEqual(r.cause.error, 'unknown_op');
    assertTrue(r.cause.available.includes('instance.call'));
    assertEqual(r.cause.available.length, 7);
  });

  test('nothing in the batch validates once one op is unknown — the LAST entry counts too', () => {
    const r = validateBatch([
      { id: 'a1', op: 'module.add', module: 'worksheet' },
      { id: 'a2', op: 'module.add', module: 'five-why' },
      { id: 'a3', op: 'nope.nope' },
    ], makeWorld());
    assertEqual(r.ok, false);
    assertEqual(r.index, 2);
    assertEqual(r.cause.error, 'unknown_op');
  });
});

suite('agent validate — Stufe 3: Parameter', () => {
  test('a missing required param is rejected', () => {
    const r = validateBatch([{ op: 'module.add' }], makeWorld());
    assertEqual(r.ok, false);
    assertEqual(r.cause.error, 'missing_param');
  });

  test('an unknown field is an error, not silently ignored', () => {
    const r = validateBatch([{ op: 'module.add', module: 'worksheet', phaseId: 'data' }], makeWorld());
    assertEqual(r.ok, false);
    assertEqual(r.cause.error, 'unknown_param');
    assertTrue(r.cause.available.includes('phase'));
  });

  test('id and op are never reported as unknown fields', () => {
    const r = validateBatch([{ id: 'a1', op: 'module.add', module: 'worksheet' }], makeWorld());
    assertTrue(r.ok, JSON.stringify(r));
  });

  test('a wrong param type is rejected', () => {
    const r = validateBatch([{ op: 'module.add', module: 7 }], makeWorld());
    assertEqual(r.ok, false);
    assertEqual(r.cause.error, 'wrong_type');
  });

  test('an array param accepts an array and rejects a string', () => {
    assertTrue(validateBatch(
      [{ op: 'module.describe', module: 'five-why', sections: ['overview'] }], makeWorld()).ok);
    assertEqual(validateBatch(
      [{ op: 'module.describe', module: 'five-why', sections: 'overview' }], makeWorld()).ok, false);
  });

  test('a reference satisfies a typed param without a type complaint', () => {
    const r = validateBatch([
      { id: 'a1', op: 'module.add', module: 'five-why' },
      { id: 'a2', op: 'instance.open', instance: { $from: 'a1', path: 'instanceId' } },
    ], makeWorld());
    assertTrue(r.ok, JSON.stringify(r));
  });
});

suite('agent validate — Stufe 4: Referenzgraph', () => {
  test('a forward reference is rejected', () => {
    const r = validateBatch([
      { id: 'a1', op: 'instance.open', instance: { $from: 'a2', path: 'instanceId' } },
      { id: 'a2', op: 'module.add', module: 'five-why' },
    ], makeWorld());
    assertEqual(r.ok, false);
    assertEqual(r.cause.error, 'forward_ref');
  });

  test('a self reference is rejected', () => {
    const r = validateBatch([
      { id: 'a1', op: 'instance.open', instance: { $from: 'a1', path: 'instanceId' } },
    ], makeWorld());
    assertEqual(r.ok, false);
    assertEqual(r.cause.error, 'forward_ref');
  });

  test('a reference to an unknown id is rejected', () => {
    const r = validateBatch([
      { id: 'a1', op: 'module.add', module: 'five-why' },
      { id: 'a2', op: 'instance.open', instance: { $from: 'zz', path: 'instanceId' } },
    ], makeWorld());
    assertEqual(r.ok, false);
    assertEqual(r.cause.error, 'unresolved_ref');
    assertDeepEqual(r.cause.available, ['a1']);
  });

  test('a path missing from the declared result shape is rejected at validation time', () => {
    const r = validateBatch([
      { id: 'a1', op: 'module.add', module: 'five-why' },
      { id: 'a2', op: 'instance.open', instance: { $from: 'a1', path: 'instanceID' } },
    ], makeWorld());
    assertEqual(r.ok, false);
    assertEqual(r.cause.error, 'bad_shape');
    assertTrue(r.cause.available.includes('instanceId'));
  });

  test('a path into a read result validates against project.read’s shape', () => {
    const r = validateBatch([
      { id: 'r1', op: 'project.read' },
      { id: 'r2', op: 'instance.open', instance: { $from: 'r1', path: 'instances.0.id' } },
    ], makeWorld());
    assertTrue(r.ok, JSON.stringify(r));
  });
});

suite('agent validate — Stufe 5: literale Bezeichner', () => {
  test('an unknown module lists the known module ids', () => {
    const r = validateBatch([{ op: 'module.add', module: 'five-whys' }], makeWorld());
    assertEqual(r.ok, false);
    assertEqual(r.cause.error, 'unknown_module');
    assertTrue(r.cause.available.includes('five-why'));
  });

  test('an unknown phase lists the valid phases for that module', () => {
    const r = validateBatch([{ op: 'module.add', module: 'five-why', phase: 'nowhere' }], makeWorld());
    assertEqual(r.ok, false);
    assertEqual(r.cause.error, 'unknown_phase');
    assertDeepEqual(r.cause.available, ['define']);
  });

  // Ruling K6 — Stufe 5 prüft `phase` zusätzlich gegen `world.phases` (die
  // Phasen des aktiven Zyklus), bevor überhaupt gegen das Modul geprüft wird.
  test('[K6] a phase unknown to the active cycle is rejected, listing the cycle’s phases', () => {
    const r = validateBatch([{ op: 'module.add', module: 'five-why', phase: 'phantom' }], makeWorld());
    assertEqual(r.ok, false);
    assertEqual(r.cause.error, 'unknown_phase');
    assertDeepEqual(r.cause.available, ['data', 'define', 'measure', 'analyze', 'improve', 'control', 'extras', 'nowhere']);
  });

  test('[K6] a phase known to the cycle but not allowed for the module is rejected, listing the module’s phases', () => {
    const r = validateBatch([{ op: 'module.add', module: 'worksheet', phase: 'nowhere' }], makeWorld());
    assertEqual(r.ok, false);
    assertEqual(r.cause.error, 'unknown_phase');
    assertDeepEqual(r.cause.available, ['data']);
  });

  test('an unknown instance lists the existing instance ids', () => {
    const r = validateBatch([{ op: 'instance.open', instance: 'nope' }], makeWorld());
    assertEqual(r.ok, false);
    assertEqual(r.cause.error, 'unknown_instance');
    assertDeepEqual(r.cause.available, ['fw-1']);
  });

  test('an unknown method on an existing instance lists the available methods', () => {
    const r = validateBatch([{ op: 'instance.call', instance: 'fw-1', method: 'setProblemText' }], makeWorld());
    assertEqual(r.ok, false);
    assertEqual(r.cause.error, 'unknown_method');
    assertDeepEqual(r.cause.available, ['read', 'setProblem', 'addWhy']);
  });

  test('method is checked statically through a module.add with a literal module', () => {
    const r = validateBatch([
      { id: 'a1', op: 'module.add', module: 'regression' },
      { id: 'a2', op: 'instance.call', instance: { $from: 'a1', path: 'instanceId' }, method: 'strt' },
    ], makeWorld());
    assertEqual(r.ok, false);
    assertEqual(r.cause.error, 'unknown_method');
    assertDeepEqual(r.cause.available, ['read', 'setSource', 'run']);
  });

  test('method is NOT checked when the module identity only exists at runtime', () => {
    const r = validateBatch([
      { id: 'r1', op: 'project.read' },
      { id: 'r2', op: 'instance.call', instance: { $from: 'r1', path: 'instances.0.id' }, method: 'whatever' },
    ], makeWorld());
    assertTrue(r.ok, 'runtime-only module identity must pass validation');
  });

  test('a call on a module without the agent release is rejected', () => {
    const r = validateBatch([
      { id: 'a1', op: 'module.add', module: 'sipoc' },
      { id: 'a2', op: 'instance.call', instance: { $from: 'a1', path: 'instanceId' }, method: 'read' },
    ], makeWorld());
    assertEqual(r.ok, false);
    assertEqual(r.cause.error, 'module_not_agent_ready');
  });

  test('module.add on a not-yet-released module is allowed (only calls are blocked)', () => {
    assertTrue(validateBatch([{ op: 'module.add', module: 'sipoc' }], makeWorld()).ok);
  });

  test('the full Spec §4 example batch validates', () => {
    const r = validateBatch([
      { id: 'a1', op: 'module.add', module: 'worksheet', phase: 'data' },
      { id: 'a2', op: 'instance.call', instance: { $from: 'a1', path: 'instanceId' },
                  method: 'importCsv', args: ['a,b\n1,2'] },
      { id: 'a3', op: 'module.add', module: 'regression', phase: 'analyze' },
      { id: 'a4', op: 'instance.call', instance: { $from: 'a3', path: 'instanceId' },
                  method: 'setSource', args: [{ $from: 'a1', path: 'instanceId' }] },
    ], makeWorld());
    assertTrue(r.ok, JSON.stringify(r));
    assertEqual(r.actions.length, 4);
  });
});

// ── Review-Befund I1 ───────────────────────────────────────────────
// Die Singleton-Regel lebte nur in `ui/dmaic-tiles.js:_canAdd`. Hier im
// Prüfer kostet sie keinen Seiteneffekt; `def.singleton` wird dabei an
// genau EINER Stelle gelesen (`isSingleton` in agent-catalog.js, über
// `buildWorld`).
suite('agent validate — Stufe 5: die Singleton-Regel', () => {
  /** A world with one singleton module, optionally already instantiated. */
  function singletonWorld({ instantiated = true } = {}) {
    const world = makeWorld();
    world.modules.set('project-charter',
      { available: false, methods: null, allowedPhases: ['define'], singleton: true });
    if (instantiated) world.instances.set('pc-1', { module: 'project-charter', phase: 'define' });
    return world;
  }

  test('a second instance of a singleton module is rejected and names the existing one', () => {
    const r = validateBatch([{ op: 'module.add', module: 'project-charter' }], singletonWorld());
    assertEqual(r.ok, false);
    assertEqual(r.cause.error, 'module_singleton');
    assertEqual(r.cause.message, 'agent.errors.moduleSingleton|module=project-charter,instance=pc-1');
  });

  test('the first instance of a singleton module passes', () => {
    const r = validateBatch([{ op: 'module.add', module: 'project-charter' }],
      singletonWorld({ instantiated: false }));
    assertTrue(r.ok, JSON.stringify(r));
  });

  test('a non-singleton module may be added even though an instance exists', () => {
    const r = validateBatch([{ op: 'module.add', module: 'five-why', phase: 'define' }], singletonWorld());
    assertTrue(r.ok, JSON.stringify(r));
  });

  test('the rule applies to module.add only — describing a singleton stays allowed', () => {
    const r = validateBatch([{ op: 'module.describe', module: 'project-charter' }], singletonWorld());
    assertTrue(r.ok, JSON.stringify(r));
  });
});

suite('agent validate — Stufe 6: abgeschlossenes Projekt', () => {
  test('a write op is rejected before anything runs', () => {
    const r = validateBatch(
      [{ op: 'module.add', module: 'five-why', phase: 'define' }],
      makeWorld({ completed: true }),
    );
    assertEqual(r.ok, false);
    assertEqual(r.cause.error, 'project_completed');
    assertEqual(r.index, 0);
  });

  test('instance.call counts as a write op', () => {
    const r = validateBatch(
      [{ op: 'instance.call', instance: 'fw-1', method: 'read' }],
      makeWorld({ completed: true }),
    );
    assertEqual(r.ok, false);
    assertEqual(r.cause.error, 'project_completed');
  });

  test('reading ops stay allowed in a completed project', () => {
    const r = validateBatch(
      [{ op: 'project.read' }, { op: 'catalog.read' },
       { op: 'module.describe', module: 'five-why' }],
      makeWorld({ completed: true }),
    );
    assertTrue(r.ok, JSON.stringify(r));
  });

  test('the write op of a LATER entry blocks the whole batch', () => {
    const r = validateBatch(
      [{ op: 'project.read' }, { op: 'module.remove', instance: 'fw-1' }],
      makeWorld({ completed: true }),
    );
    assertEqual(r.ok, false);
    assertEqual(r.index, 1);
  });
});
