/**
 * Tests for core/agent/agent-runtime.js — the consent gate, the batch
 * semantics from Spec §4 (abort on first runtime error, return partials) and
 * the seven ops from Spec §7.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../../test-utils.js';
import { createAgentRuntime } from '../../../js/core/agent/agent-runtime.js';
import { OPS } from '../../../js/core/agent/agent-contract.js';

const DEFS = [
  { id: 'worksheet', phase: 'data' },
  { id: 'five-why', phase: 'define', cycles: { dmaic: { phase: 'define' } } },
  { id: 'sipoc', phase: 'define', cycles: { dmaic: { phase: 'define' } } },
];

const REGISTRY = {
  worksheet: { tagged: true, available: true, violations: [],
               actions: { read: { params: [], returns: 'object', help: 'liest' },
                          importCsv: { params: [{ name: 'csv', type: 'string', optional: false, help: '' }],
                                       returns: 'boolean', help: '' } },
               fields: {} },
  'five-why': { tagged: false, available: false, violations: [], actions: {}, fields: {} },
  sipoc:      { tagged: false, available: false, violations: [], actions: {}, fields: {} },
};

const I18N = {
  getLanguage: () => 'de',
  exists: () => false,
  t: (key, params) => (params ? `${key}|${Object.values(params).join(',')}` : key),
};

/** Yield the event loop a few times — enough for an unserialized interleave. */
async function tick(times = 3) {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

/** A runtime with every port faked; `log` records the side effects in order. */
function makeRuntime({ denied = false, viewmodel = null, completed = false, slowAdd = false } = {}) {
  const log = [];
  const phases = { data: [], define: [{ instanceId: 'fw-1', moduleId: 'five-why', order: 0 }], extras: [] };
  const stateManager = {
    getActiveProjectId: () => 'p-1',
    get: (path) => (path === 'phases' ? phases : path.startsWith('phases.') ? phases[path.slice(7)] : undefined),
    set: (path, value) => { phases[path.slice(7)] = value; },
  };
  const runtime = createAgentRuntime({
    stateManager,
    moduleRegistry: { getAll: () => DEFS, get: (id) => DEFS.find(d => d.id === id), getActiveCycle: () => 'dmaic' },
    i18n: I18N,
    registry: REGISTRY,
    getHelp: async () => null,
    appVersion: '1.2.3',
    consent: {
      ensure: async () => {
        log.push('consent');
        return denied ? { ok: false, error: 'consent_denied', message: 'denied' } : { ok: true };
      },
    },
    host: {
      isCompleted: () => completed,
      getCurrentView: () => ({ instanceId: 'fw-1', module: 'five-why', phase: 'define' }),
      openInstance: async (id) => { log.push(`open:${id}`); return { instanceId: id, module: 'five-why', phase: 'define' }; },
      getViewmodel: async (id) => { log.push(`vm:${id}`); return viewmodel; },
      addInstance: async (moduleId, phase) => {
        log.push(`add-start:${moduleId}:${phase ?? '-'}`);
        // Ein echter Host ist nicht atomar (router.navigate, IndexedDB).
        // Der künstliche Aufschub macht ein Verschränken zweier Stapel
        // sichtbar — siehe die Serialisierungs-Suite.
        if (slowAdd) await tick();
        const target = phase ?? (moduleId === 'worksheet' ? 'data' : 'define');
        const instanceId = `${moduleId}-new`;
        phases[target] = [...(phases[target] ?? []), { instanceId, moduleId, order: 0 }];
        log.push(`add-end:${moduleId}`);
        return { instanceId, module: moduleId, phase: target };
      },
      removeInstance: async (id) => { log.push(`remove:${id}`); return true; },
    },
  });
  return { runtime, log, phases };
}

suite('agent runtime — consent gate', () => {
  test('the parameterless call also passes the gate', async () => {
    const { runtime, log } = makeRuntime();
    const out = await runtime.interact();
    assertEqual(out.ok, true);
    assertDeepEqual(log, ['consent']);
  });

  test('a denied gate yields consent_denied and NO information', async () => {
    const { runtime } = makeRuntime({ denied: true });
    const out = await runtime.interact();
    assertEqual(out.ok, false);
    assertEqual(out.error, 'consent_denied');
    assertEqual(out.catalog, undefined);
    assertEqual(out.usage, undefined);
    assertEqual(out.instances, undefined);
  });

  test('a denied gate also blocks an action batch without side effects', async () => {
    const { runtime, log } = makeRuntime({ denied: true });
    const out = await runtime.interact([{ op: 'module.add', module: 'worksheet' }]);
    assertEqual(out.error, 'consent_denied');
    assertDeepEqual(log, ['consent']);
  });
});

suite('agent runtime — the surface description', () => {
  test('carries usage, full catalog, instances and the current view', async () => {
    const out = await makeRuntime().runtime.interact();
    assertEqual(out.contract, 1);
    assertEqual(out.appVersion, '1.2.3');
    assertEqual(out.language, 'de');
    assertEqual(out.usage.contract, 1);
    assertDeepEqual(out.catalog.map(m => m.id), ['worksheet', 'five-why', 'sipoc']);
    assertDeepEqual(out.instances.map(i => i.id), ['fw-1']);
    assertDeepEqual(out.view, { instanceId: 'fw-1', module: 'five-why', phase: 'define' });
  });

  test('the catalog lists unreleased modules too', async () => {
    const out = await makeRuntime().runtime.interact();
    assertEqual(out.catalog.find(m => m.id === 'five-why').available, false);
    assertEqual(out.catalog.find(m => m.id === 'worksheet').available, true);
  });
});

suite('agent runtime — validation happens before any side effect', () => {
  test('an unknown op in the LAST entry prevents the first from running', async () => {
    const { runtime, log } = makeRuntime();
    const out = await runtime.interact([
      { id: 'a1', op: 'module.add', module: 'worksheet' },
      { id: 'a2', op: 'nope' },
    ]);
    assertEqual(out.ok, false);
    assertEqual(out.error, 'validation_failed');
    assertEqual(out.index, 1);
    assertEqual(out.cause.error, 'unknown_op');
    assertDeepEqual(log, ['consent'], 'no action ran');
    assertEqual(out.results, undefined, 'a validation error carries no partial results');
  });
});

suite('agent runtime — batch semantics', () => {
  test('a single action object returns the same envelope as a batch', async () => {
    const out = await makeRuntime().runtime.interact({ op: 'project.read' });
    assertEqual(out.ok, true);
    assertEqual(out.results.length, 1);
    assertEqual(out.results[0].ok, true);
  });

  test('results carry the agent-assigned id', async () => {
    const out = await makeRuntime().runtime.interact([{ id: 'r1', op: 'catalog.read' }]);
    assertEqual(out.results[0].id, 'r1');
  });

  test('a reference resolves against a previous result', async () => {
    const { runtime, log } = makeRuntime();
    const out = await runtime.interact([
      { id: 'a1', op: 'module.add', module: 'worksheet', phase: 'data' },
      { id: 'a2', op: 'instance.open', instance: { $from: 'a1', path: 'instanceId' } },
    ]);
    assertEqual(out.ok, true);
    assertEqual(out.results[1].result.instanceId, 'worksheet-new');
    assertDeepEqual(log, ['consent', 'add-start:worksheet:data', 'add-end:worksheet', 'open:worksheet-new']);
  });

  test('execution aborts at the first runtime error and returns the partials', async () => {
    const { runtime } = makeRuntime();
    const out = await runtime.interact([
      { id: 'a1', op: 'catalog.read' },
      { id: 'a2', op: 'module.describe', module: 'five-why', sections: ['nope'] },
      { id: 'a3', op: 'project.read' },
    ]);
    assertEqual(out.ok, false);
    assertEqual(out.results.length, 2, 'the third action never ran');
    assertEqual(out.results[0].ok, true);
    assertEqual(out.results[1].ok, false);
    assertEqual(out.results[1].error, 'unknown_section');
  });

  test('an unresolvable reference at runtime reports unresolved_ref', async () => {
    const { runtime } = makeRuntime();
    // project.read declares `instances` in its shape, so this passes
    // validation (the shape check only looks at the FIRST array slot); at
    // runtime the read fails because index 9 does not exist in the actual
    // one-element instance list.
    const out = await runtime.interact([
      { id: 'r1', op: 'project.read' },
      { id: 'r2', op: 'instance.open', instance: { $from: 'r1', path: 'instances.9.id' } },
    ]);
    assertEqual(out.ok, false);
    assertEqual(out.results[1].error, 'unresolved_ref');
  });
});

suite('agent runtime — the seven ops', () => {
  test('project.read returns the view and a flat instance list, nothing more', async () => {
    const out = await makeRuntime().runtime.interact({ op: 'project.read' });
    assertDeepEqual(Object.keys(out.results[0].result).sort(),
      ['appVersion', 'contract', 'instances', 'language', 'view']);
  });

  test('catalog.read returns every module', async () => {
    const out = await makeRuntime().runtime.interact({ op: 'catalog.read' });
    assertEqual(out.results[0].result.modules.length, 3);
  });

  test('module.describe without sections carries no prose', async () => {
    const out = await makeRuntime().runtime.interact({ op: 'module.describe', module: 'worksheet' });
    assertEqual(out.results[0].result.prose, null);
    assertDeepEqual(out.results[0].result.actions.map(a => a.name).sort(), ['importCsv', 'read']);
  });

  test('module.add returns a lean result: id, module, phase', async () => {
    const out = await makeRuntime().runtime.interact({ op: 'module.add', module: 'five-why' });
    assertDeepEqual(out.results[0].result, { instanceId: 'five-why-new', module: 'five-why', phase: 'define' });
  });

  test('module.remove delegates to the host', async () => {
    const { runtime, log } = makeRuntime();
    const out = await runtime.interact({ op: 'module.remove', instance: 'fw-1' });
    assertDeepEqual(out.results[0].result, { instanceId: 'fw-1', removed: true });
    assertTrue(log.includes('remove:fw-1'));
  });

  test('instance.open returns id, module and phase', async () => {
    const out = await makeRuntime().runtime.interact({ op: 'instance.open', instance: 'fw-1' });
    assertDeepEqual(out.results[0].result, { instanceId: 'fw-1', module: 'five-why', phase: 'define' });
  });

  // Review-Befund (Important): nur `instance.call` hatte einen eigenen
  // `try/catch` um den Host-Aufruf. Ein Wurf aus `host.openInstance` (z. B.
  // eine `router.navigate`-Rejection) darf trotzdem nicht unbehandelt aus
  // `interact()` fallen — die Laufzeit muss ihn in einen AXI-Fehler
  // übersetzen, egal welche Op betroffen ist.
  test('a throwing host method becomes op_failed, not an unhandled rejection', async () => {
    // `fw-1` must be a KNOWN instance so the validator (stage 5) lets the
    // action through — the throw has to happen inside the op, at runtime,
    // not be pre-empted by validation.
    const phases = { data: [], define: [{ instanceId: 'fw-1', moduleId: 'five-why', order: 0 }], extras: [] };
    const stateManager = {
      getActiveProjectId: () => 'p-1',
      get: (path) => (path === 'phases' ? phases : path.startsWith('phases.') ? phases[path.slice(7)] : undefined),
      set: () => {},
    };
    const runtime = createAgentRuntime({
      stateManager,
      moduleRegistry: { getAll: () => DEFS, get: (id) => DEFS.find(d => d.id === id), getActiveCycle: () => 'dmaic' },
      i18n: I18N,
      registry: REGISTRY,
      getHelp: async () => null,
      appVersion: '1.2.3',
      consent: { ensure: async () => ({ ok: true }) },
      host: {
        isCompleted: () => false,
        getCurrentView: () => null,
        openInstance: async () => { throw new Error('router rejected'); },
        getViewmodel: async () => null,
        addInstance: async () => ({ instanceId: 'x', module: 'x', phase: 'define' }),
        removeInstance: async () => true,
      },
    });
    const out = await runtime.interact({ op: 'instance.open', instance: 'fw-1' });
    assertEqual(out.ok, false);
    assertEqual(out.results.length, 1);
    assertEqual(out.results[0].ok, false);
    assertEqual(out.results[0].error, 'op_failed');
  });

  // Ruling K1: with a LITERAL `instance`, the target module is statically
  // known, so stage 5 of the validator rejects the whole batch before any
  // op runs. The return shape is the validator's, not the ops' — there is
  // no `results` array to index into.
  test('instance.call on an unreleased module reports module_not_agent_ready (validator path)', async () => {
    const out = await makeRuntime().runtime.interact({ op: 'instance.call', instance: 'fw-1', method: 'read' });
    assertEqual(out.ok, false);
    assertEqual(out.error, 'validation_failed');
    assertEqual(out.cause.error, 'module_not_agent_ready');
    assertEqual(out.results, undefined, 'a validation error carries no partial results');
  });

  // Same failure, but reached through the RUNTIME branch in agent-ops.js:
  // the target instance arrives as a reference into a `project.read` result
  // (not a `module.add`), so `staticTargetModule` in the validator returns
  // null and stage 5 cannot decide it in advance.
  test('instance.call whose target module is NOT statically known fails at runtime instead', async () => {
    const { runtime } = makeRuntime();
    const out = await runtime.interact([
      { id: 'r1', op: 'project.read' },
      { id: 'r2', op: 'instance.call', instance: { $from: 'r1', path: 'instances.0.id' }, method: 'read' },
    ]);
    assertEqual(out.ok, false);
    assertEqual(out.results.length, 2);
    assertEqual(out.results[0].ok, true);
    assertEqual(out.results[1].ok, false);
    assertEqual(out.results[1].error, 'module_not_agent_ready');
  });

  test('instance.call on a released module invokes the live viewmodel method', async () => {
    const calls = [];
    const { runtime } = makeRuntime({ viewmodel: { importCsv: (csv) => { calls.push(csv); return true; } } });
    const out = await runtime.interact([
      { id: 'a1', op: 'module.add', module: 'worksheet', phase: 'data' },
      { id: 'a2', op: 'instance.call', instance: { $from: 'a1', path: 'instanceId' },
                  method: 'importCsv', args: ['a,b\n1,2'] },
    ]);
    assertEqual(out.ok, true, JSON.stringify(out));
    assertDeepEqual(calls, ['a,b\n1,2']);
    assertEqual(out.results[1].result.value, true);
  });

  test('a throwing viewmodel method becomes call_failed, not an unhandled rejection', async () => {
    const { runtime } = makeRuntime({ viewmodel: { importCsv: () => { throw new Error('bad csv'); } } });
    const out = await runtime.interact([
      { id: 'a1', op: 'module.add', module: 'worksheet', phase: 'data' },
      { id: 'a2', op: 'instance.call', instance: { $from: 'a1', path: 'instanceId' },
                  method: 'importCsv', args: ['x'] },
    ]);
    assertEqual(out.results[1].ok, false);
    assertEqual(out.results[1].error, 'call_failed');
  });

  test('a method missing from the LIVE viewmodel reports unknown_method with what is there', async () => {
    const { runtime } = makeRuntime({ viewmodel: { somethingElse: () => 1 } });
    const out = await runtime.interact([
      { id: 'a1', op: 'module.add', module: 'worksheet', phase: 'data' },
      { id: 'a2', op: 'instance.call', instance: { $from: 'a1', path: 'instanceId' }, method: 'read' },
    ]);
    assertEqual(out.results[1].error, 'unknown_method');
    assertDeepEqual(out.results[1].available, ['somethingElse']);
  });
});

suite('agent runtime — result shapes match the contract (Ruling K5)', () => {
  test('every op\'s actual result carries exactly the keys OPS declares', async () => {
    const { runtime } = makeRuntime({ viewmodel: { read: () => 'ok' } });
    const out = await runtime.interact([
      { id: 'pr', op: 'project.read' },
      { id: 'cr', op: 'catalog.read' },
      { id: 'md', op: 'module.describe', module: 'worksheet' },
      { id: 'ma', op: 'module.add', module: 'worksheet', phase: 'data' },
      { id: 'io', op: 'instance.open', instance: 'fw-1' },
      { id: 'ic', op: 'instance.call', instance: { $from: 'ma', path: 'instanceId' }, method: 'read' },
      { id: 'mr', op: 'module.remove', instance: 'fw-1' },
    ]);
    assertEqual(out.ok, true, JSON.stringify(out));
    const resultById = Object.fromEntries(out.results.map(r => [r.id, r.result]));
    const opOfId = {
      pr: 'project.read', cr: 'catalog.read', md: 'module.describe',
      ma: 'module.add', io: 'instance.open', ic: 'instance.call', mr: 'module.remove',
    };
    for (const [id, op] of Object.entries(opOfId)) {
      assertDeepEqual(
        Object.keys(resultById[id]).sort(),
        Object.keys(OPS[op].result).sort(),
        `${op}: actual result keys must match OPS['${op}'].result`,
      );
    }
  });
});

// ── Review-Befund C1 ───────────────────────────────────────────────
// Stufe 3 überspringt den Typ-Check für Referenzen („wird zur Laufzeit
// geprüft") — die Laufzeitprüfung existierte nicht. Ein `module.describe`-
// Anzeigename als `phase` kam ungeprüft bis in `createInstance` und legte
// einen persistierten Phasen-Eimer an, den kein Zyklus kennt. Still, mit
// `ok: true`.
suite('agent runtime — a resolved reference is type-checked (C1)', () => {
  test('a reference that resolves to a NON-phase string is rejected, not persisted', async () => {
    const { runtime, log, phases } = makeRuntime();
    const out = await runtime.interact([
      { id: 'd1', op: 'module.describe', module: 'five-why' },
      { id: 'a1', op: 'module.add', module: 'five-why', phase: { $from: 'd1', path: 'name' } },
    ]);
    assertEqual(out.ok, false);
    assertEqual(out.results.length, 2);
    assertEqual(out.results[1].ok, false);
    assertEqual(out.results[1].error, 'unknown_phase');
    assertTrue(!log.some(e => e.startsWith('add-start:')), 'no instance was created');
    assertDeepEqual(Object.keys(phases).sort(), ['data', 'define', 'extras'],
      'no phantom phase bucket was persisted');
  });

  test('a reference that resolves to a WRONG TYPE is rejected by the re-run of stage 3', async () => {
    const { runtime, log } = makeRuntime();
    const out = await runtime.interact([
      { id: 'r1', op: 'project.read' },
      // `contract` is a number; `module.add`'s `module` must be a string.
      { id: 'a1', op: 'module.add', module: { $from: 'r1', path: 'contract' } },
    ]);
    assertEqual(out.ok, false);
    assertEqual(out.results[1].error, 'wrong_type');
    assertTrue(!log.some(e => e.startsWith('add-start:')), 'no instance was created');
  });

  test('a reference that resolves to a VALID phase of the module still works', async () => {
    const { runtime } = makeRuntime();
    const out = await runtime.interact([
      { id: 'r1', op: 'project.read' },
      { id: 'a1', op: 'module.add', module: 'five-why', phase: { $from: 'r1', path: 'view.phase' } },
    ]);
    assertEqual(out.ok, true, JSON.stringify(out));
    assertEqual(out.results[1].result.phase, 'define');
  });
});

// ── Review-Befund I1 ───────────────────────────────────────────────
// Die Singleton-Regel stand ausschließlich in `ui/dmaic-tiles.js:_canAdd`;
// der Agentenpfad ging über `createInstance` daran vorbei und konnte eine
// zweite Instanz anlegen — etwas, was die UI verbietet (Spec §2).
suite('agent runtime — the singleton rule applies to the agent path (I1)', () => {
  const SINGLETON_DEFS = [
    ...DEFS,
    { id: 'project-charter', phase: 'define', singleton: true, cycles: { dmaic: { phase: 'define' } } },
  ];

  /** A runtime whose project already holds one instance of a singleton module. */
  function makeSingletonRuntime({ withExisting = true } = {}) {
    const log = [];
    const phases = {
      data: [],
      define: withExisting ? [{ instanceId: 'pc-1', moduleId: 'project-charter', order: 0 }] : [],
      extras: [],
    };
    const stateManager = {
      getActiveProjectId: () => 'p-1',
      get: (path) => (path === 'phases' ? phases : path.startsWith('phases.') ? phases[path.slice(7)] : undefined),
      set: (path, value) => { phases[path.slice(7)] = value; },
    };
    const runtime = createAgentRuntime({
      stateManager,
      moduleRegistry: {
        getAll: () => SINGLETON_DEFS,
        get: (id) => SINGLETON_DEFS.find(d => d.id === id),
        getActiveCycle: () => 'dmaic',
      },
      i18n: I18N,
      registry: { ...REGISTRY, 'project-charter': { tagged: false, available: false, violations: [], actions: {}, fields: {} } },
      getHelp: async () => null,
      appVersion: '1.2.3',
      consent: { ensure: async () => ({ ok: true }) },
      host: {
        isCompleted: () => false,
        getCurrentView: () => null,
        openInstance: async () => null,
        getViewmodel: async () => null,
        addInstance: async (moduleId, phase) => {
          log.push(`add:${moduleId}`);
          const target = phase ?? 'define';
          const instanceId = `${moduleId}-new`;
          phases[target] = [...(phases[target] ?? []), { instanceId, moduleId, order: 0 }];
          return { instanceId, module: moduleId, phase: target };
        },
        removeInstance: async () => true,
      },
    });
    return { runtime, log };
  }

  test('a second instance of a singleton module is refused by the validator', async () => {
    const { runtime, log } = makeSingletonRuntime();
    const out = await runtime.interact({ op: 'module.add', module: 'project-charter' });
    assertEqual(out.ok, false);
    assertEqual(out.error, 'validation_failed');
    assertEqual(out.cause.error, 'module_singleton');
    assertDeepEqual(log, [], 'no side effect happened');
  });

  test('the FIRST instance of a singleton module is allowed', async () => {
    const { runtime } = makeSingletonRuntime({ withExisting: false });
    const out = await runtime.interact({ op: 'module.add', module: 'project-charter' });
    assertEqual(out.ok, true, JSON.stringify(out));
  });

  test('two module.add of the same singleton in ONE batch: the second fails at runtime', async () => {
    // The validator checks against a snapshot taken BEFORE execution, which
    // cannot know about the instance the first action is about to create —
    // only the defence in agent-ops.js sees it.
    const { runtime, log } = makeSingletonRuntime({ withExisting: false });
    const out = await runtime.interact([
      { id: 'a1', op: 'module.add', module: 'project-charter' },
      { id: 'a2', op: 'module.add', module: 'project-charter' },
    ]);
    assertEqual(out.ok, false);
    assertEqual(out.results.length, 2);
    assertEqual(out.results[0].ok, true);
    assertEqual(out.results[1].error, 'module_singleton');
    assertDeepEqual(log, ['add:project-charter'], 'only one instance was created');
  });

  test('a NON-singleton module may be added twice', async () => {
    const { runtime } = makeSingletonRuntime({ withExisting: false });
    const out = await runtime.interact([
      { id: 'a1', op: 'module.add', module: 'sipoc', phase: 'define' },
      { id: 'a2', op: 'module.add', module: 'sipoc', phase: 'define' },
    ]);
    assertEqual(out.ok, true, JSON.stringify(out));
  });
});

// ── Review-Befunde I2 / I3c ────────────────────────────────────────
// Im abgeschlossenen Projekt verwirft `stateManager.set` jeden
// Nicht-`settings.`-Schreibzugriff still. `module.add` meldete daraufhin
// `ok: true` mit einer Phantom-Id, und `module.remove` antwortete mit
// `unknown_instance` MIT dieser Instanz-Id in `available`.
suite('agent runtime — the completed project is an honest error (I2 / I3c)', () => {
  test('module.add reports project_completed instead of a phantom instance', async () => {
    const { runtime, log } = makeRuntime({ completed: true });
    const out = await runtime.interact({ op: 'module.add', module: 'worksheet', phase: 'data' });
    assertEqual(out.ok, false);
    assertEqual(out.results[0].error, 'project_completed');
    assertEqual(out.results[0].result, undefined, 'no invented instanceId');
    assertDeepEqual(log, ['consent'], 'the host was never asked to write');
  });

  test('module.remove reports project_completed, not a self-contradicting unknown_instance', async () => {
    const { runtime } = makeRuntime({ completed: true });
    const out = await runtime.interact({ op: 'module.remove', instance: 'fw-1' });
    assertEqual(out.ok, false);
    assertEqual(out.results[0].error, 'project_completed');
    assertEqual(out.results[0].available, undefined,
      'the old answer listed the very instance it called unknown');
  });

  test('every completed-project error still carries the contract version', async () => {
    const { runtime } = makeRuntime({ completed: true });
    const out = await runtime.interact({ op: 'module.add', module: 'worksheet', phase: 'data' });
    assertEqual(out.contract, 1);
  });

  test('a host that cannot find the new instance reports op_failed, not an invented id', async () => {
    const { runtime } = makeRuntime();
    const out = await runtime.interact({ op: 'module.add', module: 'worksheet', phase: 'data' });
    assertEqual(out.ok, true, 'control: the normal path still works');
    // Now the same action against a host whose write silently vanished.
    const broken = createAgentRuntime({
      stateManager: { getActiveProjectId: () => 'p-1', get: () => ({}), set: () => {} },
      moduleRegistry: { getAll: () => DEFS, get: (id) => DEFS.find(d => d.id === id), getActiveCycle: () => 'dmaic' },
      i18n: I18N,
      registry: REGISTRY,
      getHelp: async () => null,
      appVersion: '1.2.3',
      consent: { ensure: async () => ({ ok: true }) },
      host: {
        isCompleted: () => false,
        getCurrentView: () => null,
        openInstance: async () => null,
        getViewmodel: async () => null,
        addInstance: async () => null,          // locate() found nothing
        removeInstance: async () => true,
      },
    });
    const out2 = await broken.interact({ op: 'module.add', module: 'worksheet', phase: 'data' });
    assertEqual(out2.ok, false);
    assertEqual(out2.results[0].error, 'op_failed');
    assertEqual(out2.results[0].result, undefined);
  });
});

// ── Review-Befund I7 ───────────────────────────────────────────────
// Das Tor dedupliziert den Dialog, die Laufzeit nichts: Stapel B prüfte gegen
// eine `world`-Momentaufnahme ohne die laufenden Effekte von Stapel A — ein
// TOCTOU zwischen Prüfung und Ausführung (Spec §5).
suite('agent runtime — concurrent calls are serialized (I7)', () => {
  test('two overlapping batches do not interleave their side effects', async () => {
    const { runtime, log } = makeRuntime({ slowAdd: true });
    const first = runtime.interact({ op: 'module.add', module: 'worksheet', phase: 'data' });
    const second = runtime.interact({ op: 'module.add', module: 'sipoc', phase: 'define' });
    const [a, b] = await Promise.all([first, second]);
    assertEqual(a.ok, true, JSON.stringify(a));
    assertEqual(b.ok, true, JSON.stringify(b));
    assertDeepEqual(log, [
      'consent', 'add-start:worksheet:data', 'add-end:worksheet',
      'consent', 'add-start:sipoc:define', 'add-end:sipoc',
    ], 'the second batch starts only after the first has finished');
  });

  test('a failing batch does not poison the queue for the next caller', async () => {
    const { runtime } = makeRuntime({ slowAdd: true });
    const bad = runtime.interact({ op: 'nope' });
    const good = runtime.interact({ op: 'catalog.read' });
    const [a, b] = await Promise.all([bad, good]);
    assertEqual(a.ok, false);
    assertEqual(b.ok, true, JSON.stringify(b));
  });
});

// ── Review-Befund I8 ───────────────────────────────────────────────
// Die Doku sagt, `interact()` gebe „nie eine unbehandelte Ausnahme nach
// außen" — der `try/catch` lag aber nur um den Op-Aufruf. Außerhalb lagen
// `consent.ensure()`, `buildWorld`, `validateBatch`, `resolveRefs` und
// `describeSurface()`.
suite('agent runtime — no raw exception ever leaves interact() (I8)', () => {
  /** A runtime whose consent gate throws (a blocked `stateManager.set`). */
  function makeThrowing(where) {
    const throwing = () => { throw new Error(`boom in ${where}`); };
    return createAgentRuntime({
      stateManager: { getActiveProjectId: () => 'p-1', get: () => (where === 'world' ? throwing() : ({})), set: () => {} },
      moduleRegistry: {
        getAll: () => (where === 'world' ? throwing() : DEFS),
        get: (id) => DEFS.find(d => d.id === id),
        getActiveCycle: () => 'dmaic',
      },
      i18n: I18N,
      registry: REGISTRY,
      getHelp: async () => null,
      appVersion: '1.2.3',
      consent: { ensure: async () => (where === 'consent' ? throwing() : { ok: true }) },
      host: {
        isCompleted: () => false,
        getCurrentView: () => (where === 'view' ? throwing() : null),
        openInstance: async () => null,
        getViewmodel: async () => null,
        addInstance: async () => null,
        removeInstance: async () => true,
      },
    });
  }

  test('a throwing consent gate becomes surface_failed with the contract version', async () => {
    const out = await makeThrowing('consent').interact();
    assertEqual(out.ok, false);
    assertEqual(out.error, 'surface_failed');
    assertEqual(out.contract, 1);
    assertTrue(out.message.includes('boom in consent'), out.message);
  });

  test('a throwing host.getCurrentView in the surface description becomes surface_failed', async () => {
    const out = await makeThrowing('view').interact();
    assertEqual(out.ok, false);
    assertEqual(out.error, 'surface_failed');
    assertEqual(out.contract, 1);
  });

  test('a throwing buildWorld becomes surface_failed', async () => {
    const out = await makeThrowing('world').interact({ op: 'catalog.read' });
    assertEqual(out.ok, false);
    assertEqual(out.error, 'surface_failed');
    assertEqual(out.contract, 1);
  });
});

// ── Review-Befund M2 ──────────────────────────────────────────────
// Die Laufzeit nannte bei einem Referenzfehler nur `{ id }` und verwarf
// `segment`/`path`, obwohl `resolveRefs` sie liefert — und `available`
// bedeutete in den zwei Fällen etwas Verschiedenes, ohne das zu sagen.
suite('agent runtime — reference diagnostics name path and segment (M2)', () => {
  test('a path error names path AND the guilty segment, not just the id', async () => {
    const { runtime } = makeRuntime();
    // `instances` exists in the declared shape, so stage 4 lets this pass
    // (the shape check only looks at the FIRST array slot); index 9 does not
    // exist in the actual one-element list, so it fails at runtime.
    const out = await runtime.interact([
      { id: 'r1', op: 'project.read' },
      { id: 'r2', op: 'instance.open', instance: { $from: 'r1', path: 'instances.9.id' } },
    ]);
    assertEqual(out.results[1].error, 'unresolved_ref');
    // I18N here renders `key|<values joined>`: id, path, segment.
    assertEqual(out.results[1].message, 'agent.errors.unresolvedRefPath|r1,instances.9.id,9');
  });

  test('the two meanings of available are separated by the message key', async () => {
    const { runtime } = makeRuntime();
    // A path error on an OBJECT level: `available` are the keys of that
    // level, and the message says so — unlike the id case, where the same
    // field holds the action ids.
    const out = await runtime.interact([
      { id: 'r1', op: 'module.describe', module: 'worksheet' },
      { id: 'r2', op: 'instance.open', instance: { $from: 'r1', path: 'prose.nope' } },
    ]);
    assertEqual(out.results[1].error, 'unresolved_ref');
    assertTrue(out.results[1].message.startsWith('agent.errors.unresolvedRefPath|'), out.results[1].message);
  });
});
