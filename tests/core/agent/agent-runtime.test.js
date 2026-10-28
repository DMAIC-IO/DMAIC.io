/**
 * Tests for core/agent/agent-runtime.js — the consent gate, the batch
 * semantics (abort on first runtime error, return partials) and the seven
 * ops.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../../test-utils.js';
import { createAgentRuntime } from '../../../js/core/agent/agent-runtime.js';
import { CONTRACT_VERSION, ERRORS, OPS } from '../../../js/core/agent/agent-contract.js';
import aiAssistantHelp from '../../../js/help/ai-assistant-help.js';
import { AI_ASSISTANT_CHAPTER_ID } from '../../../js/help/help-keys.js';
import { createRevisionTracker } from '../../../js/core/agent/agent-revisions.js';
import { buildInstanceList } from '../../../js/core/agent/agent-catalog.js';

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

/**
 * Ein Merker, für den der Agent schon alles gelesen hat — für Runtimes mit
 * eigenem Fake-`stateManager` ohne Revisionen, die anderes prüfen als Lesen
 * vor Schreiben.
 */
function alreadyReadEverything() {
  return {
    markInstance() {}, markStructure() {}, forgetInstance() {},
    isInstanceCurrent: () => true, isStructureCurrent: () => true,
  };
}

/** Yield the event loop a few times — enough for an unserialized interleave. */
async function tick(times = 3) {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

/** A runtime with every port faked; `log` records the side effects in order. */
function makeRuntime({ denied = false, viewmodel = null, completed = false, slowAdd = false,
                      getHelp = async () => null, stateManager: stateManagerOverrides,
                      registry: registryOverrides, primed = true, instances = [],
                      onSettle = () => {} } = {}) {
  const log = [];
  const settles = [];
  const phases = { data: [...instances], define: [{ instanceId: 'fw-1', moduleId: 'five-why', order: 0 }], extras: [] };
  // Revisionen wie im echten stateManager, nur von Hand gedreht: ein Test
  // simuliert eine fremde Änderung mit `revs.set(id, …)`; eigene Schreib-
  // zugriffe drehen die Revision in der Viewmodel-Methode selbst.
  const revs = new Map();
  let structureRev = 1;
  const stateManager = {
    getActiveProjectId: () => 'p-1',
    get: (path) => (path === 'phases' ? phases : path.startsWith('phases.') ? phases[path.slice(7)] : undefined),
    set: (path, value) => { phases[path.slice(7)] = value; },
    getModuleRevision: (id) => revs.get(id),
    getStructureRevision: () => structureRev,
    saveNow: () => {},
    flushNow: async () => {},
    // Tests that need to observe the flush (Task 1: `ok: true` heißt
    // „liegt auf Platte") override just `flushNow` here instead of
    // rebuilding the whole fake host/registry wiring.
    ...stateManagerOverrides,
  };
  const revisions = createRevisionTracker(stateManager);
  if (primed) {
    // Die Bestandsfälle prüfen anderes als Lesen vor Schreiben: sie starten
    // mit einem Agenten, der Struktur und jede Instanz schon gelesen hat.
    revisions.markStructure();
    for (const { id } of buildInstanceList({ stateManager, i18n: I18N })) revisions.markInstance(id);
  }
  const runtime = createAgentRuntime({
    stateManager,
    moduleRegistry: { getAll: () => DEFS, get: (id) => DEFS.find(d => d.id === id), getActiveCycle: () => 'dmaic' },
    i18n: I18N,
    registry: { ...REGISTRY, ...registryOverrides },
    revisions,
    getHelp,
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
      getViewmodel: async (id) => {
        log.push(`vm:${id}`);
        return typeof viewmodel === 'function' ? viewmodel(id) : viewmodel;
      },
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
        structureRev += 1;
        return { instanceId, module: moduleId, phase: target };
      },
      removeInstance: async (id) => { log.push(`remove:${id}`); structureRev += 1; return true; },
      // Eigenes Protokoll: `log` bleibt das der Seiteneffekte.
      settle: async (id) => { settles.push(id ?? null); onSettle(id); },
    },
  });
  return { runtime, log, settles, phases, revs, bumpStructure: () => { structureRev += 1; } };
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
  test('carries ops, errors, full catalog, instances and the current view — no usage', async () => {
    const out = await makeRuntime().runtime.interact();
    assertEqual(out.contract, CONTRACT_VERSION);
    assertEqual(CONTRACT_VERSION, 2);
    assertDeepEqual(Object.keys(out).sort(), [
      'appVersion', 'briefing', 'catalog', 'contract', 'errors', 'instances',
      'language', 'ok', 'ops', 'view',
    ]);
    assertEqual(out.appVersion, '1.2.3');
    assertEqual(out.language, 'de');
    assertDeepEqual(out.catalog.map(m => m.id), ['worksheet', 'five-why', 'sipoc']);
    assertDeepEqual(out.instances.map(i => i.id), ['fw-1']);
    assertDeepEqual(out.view, { instanceId: 'fw-1', module: 'five-why', phase: 'define' });
  });

  test('ops kommt aus OPS, nicht nebenher aufgeschrieben', async () => {
    const out = await makeRuntime().runtime.interact();
    assertDeepEqual(Object.keys(out.ops).sort(), Object.keys(OPS).sort());
    assertDeepEqual(out.ops['module.add'].params.module, { type: 'string', required: true });
    // Die Nullable-Hülle geht wörtlich hinaus — erklärt wird sie im Briefing.
    assertTrue(Object.hasOwn(out.ops['project.read'].result.view, '$nullable'));
  });

  test('errors nennt jeden Fehlercode, auch stale_revision', async () => {
    const out = await makeRuntime().runtime.interact();
    assertDeepEqual(out.errors, Object.values(ERRORS));
    assertTrue(out.errors.includes('stale_revision'));
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
      saveNow: () => {},
      flushNow: async () => {},
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

  test('eine werfende Modulmethode wird zu einem benannten Fehler, nicht zu ok: true', async () => {
    // Welcher Code greift — `op_failed` aus `runInteract` oder `call_failed`
    // aus `agent-ops.js` — hängt davon ab, wo gefangen wird. Dieser Fall
    // prüft BEIDE und die Meldung, nicht nur den Code.
    const { runtime } = makeRuntime({
      viewmodel: { importCsv: () => { throw new Error('flowchart model has no method "addSubstep"'); } },
    });
    const out = await runtime.interact([
      { id: 'a1', op: 'module.add', module: 'worksheet', phase: 'data' },
      { id: 'a2', op: 'instance.call', instance: { $from: 'a1', path: 'instanceId' },
                  // Ein Argument MUSS übergeben werden: `csv` ist in der
                  // Registry pflichtig, und die Fläche weist einen Aufruf mit
                  // zu wenigen Argumenten ab, bevor die Senke läuft (siehe
                  // den Fall unten). Hier geht es um den Wurf DER SENKE.
                  method: 'importCsv', args: ['x'] },
    ]);
    assertEqual(out.ok, false);
    const entry = out.results[out.results.length - 1];
    assertEqual(['op_failed', 'call_failed'].includes(entry.error), true, `unerwarteter Code: ${entry.error}`);
    assertEqual(/addSubstep/.test(entry.message), true, `die Meldung nennt die Methode nicht: ${entry.message}`);
  });

  test('ein fehlendes Pflichtargument wird abgewiesen, bevor die Senke läuft', async () => {
    // Ruling 55: `agent-ops.js` spreadet `action.args ?? []`, ein
    // weggelassenes Argument kam als `undefined` bei der Senke an und wurde
    // dort wie der dokumentierte Leerwert behandelt — der Aufruf löschte
    // einen Wert und meldete Erfolg. Geprüft wird gegen den Parametersatz der
    // Registry, und zwar VOR dem Aufruf: `calls` bleibt leer.
    const calls = [];
    const { runtime } = makeRuntime({
      viewmodel: { importCsv: (csv) => { calls.push(csv); return true; } },
    });
    const out = await runtime.interact([
      { id: 'a1', op: 'module.add', module: 'worksheet', phase: 'data' },
      { id: 'a2', op: 'instance.call', instance: { $from: 'a1', path: 'instanceId' },
                  method: 'importCsv' },
    ]);
    assertEqual(out.ok, false);
    const entry = out.results[out.results.length - 1];
    assertEqual(entry.error, 'call_failed');
    assertEqual(/missing argument "csv" of importCsv; expected: csv/.test(entry.message), true,
      `unerwartete Meldung: ${entry.message}`);
    assertDeepEqual(calls, []);
  });

  test('ein weggelassenes OPTIONALES Argument bleibt gültig', async () => {
    // Die Gegenprobe zur Arity-Prüfung: wäre sie auf `params.length`
    // gebaut statt auf die Pflichtparameter, bräche sie jede Aktion mit
    // optionalem Parameter — `read(options)` und `addRows(count)` ruft die
    // Oberfläche selbst ohne Argument.
    const calls = [];
    const { runtime } = makeRuntime({
      viewmodel: { addRows: (count) => { calls.push(count); return true; } },
      registry: {
        worksheet: {
          tagged: true, available: true, violations: [], fields: {},
          actions: {
            read: { params: [], returns: 'object', help: 'liest' },
            addRows: { params: [{ name: 'count', type: 'number', optional: true, help: '' }],
                       returns: 'boolean', help: '' },
          },
        },
      },
    });
    const out = await runtime.interact([
      { id: 'a1', op: 'module.add', module: 'worksheet', phase: 'data' },
      { id: 'a2', op: 'instance.call', instance: { $from: 'a1', path: 'instanceId' },
                  method: 'addRows' },
    ]);
    assertEqual(out.ok, true, JSON.stringify(out));
    // Die Senke LIEF, und zwar ohne Argument — genau wie am Leistenknopf.
    assertDeepEqual(calls, [undefined]);
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

  // ── Welcher Satz kommt beim Agenten an? (N1) ───────────────────────
  // Beide Zweige melden `unknown_method` mit derselben `available`-Gestalt —
  // sie sagen aber Verschiedenes: der Katalogwächter weist ein Mitglied ab,
  // das es GIBT und das nur nicht freigegeben ist, der Zweig darunter eine
  // Aktion, die die Registry führt und die lebende Komponente nicht hat.
  // Zugesichert wird darum der i18n-SCHLÜSSEL, nicht die Prosa: das gefakte
  // `I18N.t` gibt `key|params` zurück, also steht der Schlüssel wörtlich am
  // Anfang der Meldung. Ein Vertauschen der beiden Schlüssel zwischen den
  // Zweigen bliebe ohne diese zwei Fälle unbemerkt.

  test('ein vorhandenes, aber nicht freigegebenes Mitglied bekommt den Katalogsatz', async () => {
    // `applyFormula` IST am Viewmodel — der Aufruf scheitert also nicht daran,
    // dass es die Methode nicht gibt, sondern daran, dass sie nicht zur Fläche
    // gehört. Der Weg über ein Leseergebnis ist nötig, damit Prüfstufe 5 das
    // Zielmodul nicht statisch kennt und der Wächter in der Op greift.
    const { runtime } = makeRuntime({
      viewmodel: { read: () => ({}), applyFormula: () => 'geschrieben' },
    });
    await runtime.interact([{ id: 'a1', op: 'module.add', module: 'worksheet', phase: 'data' }]);

    const out = await runtime.interact([
      { id: 'b1', op: 'project.read' },
      { id: 'b2', op: 'instance.call', instance: { $from: 'b1', path: 'instances.0.id' },
                  method: 'applyFormula' },
    ]);
    const last = out.results.at(-1);
    assertEqual(last.error, 'unknown_method');
    assertTrue(last.message.startsWith('agent.errors.methodNotAgentAction|'),
      `der Katalogwächter muss methodNotAgentAction melden, nicht: ${last.message}`);
    assertDeepEqual(last.available, ['importCsv', 'read']);
  });

  test('eine Katalogaktion, die der lebenden Komponente fehlt, behält den alten Satz', async () => {
    const { runtime } = makeRuntime({ viewmodel: { somethingElse: () => 1 } });
    const out = await runtime.interact([
      { id: 'a1', op: 'module.add', module: 'worksheet', phase: 'data' },
      { id: 'a2', op: 'instance.call', instance: { $from: 'a1', path: 'instanceId' }, method: 'read' },
    ]);
    const last = out.results.at(-1);
    assertEqual(last.error, 'unknown_method');
    assertTrue(last.message.startsWith('agent.errors.unknownMethod|'),
      `der Stale-Detektor muss unknownMethod melden, nicht: ${last.message}`);
  });
});

suite('agent runtime — Lesen vor Schreiben (stale_revision)', () => {
  const WS1 = { instanceId: 'ws-1', moduleId: 'worksheet', order: 0 };
  const WS2 = { instanceId: 'ws-2', moduleId: 'worksheet', order: 1 };
  const write = (instance) => ({ op: 'instance.call', instance, method: 'importCsv', args: ['a;b'] });
  const read = (instance) => ({ op: 'instance.call', instance, method: 'read' });

  /**
   * Ein Agent, der noch nichts gelesen hat, und zwei Datensammlungen. Die
   * Schreibmethode dreht die Revision ihrer Instanz — wie der persist-$watch;
   * `sideEffectOn` dreht zusätzlich die einer anderen.
   */
  function setup({ sideEffectOn = null } = {}) {
    let made;
    const viewmodelFor = (id) => ({
      read: () => ({}),
      importCsv: () => {
        made.log.push(`importCsv:${id}`);
        made.revs.set(id, (made.revs.get(id) ?? 0) + 1);
        if (sideEffectOn) made.revs.set(sideEffectOn, (made.revs.get(sideEffectOn) ?? 0) + 1);
        return true;
      },
    });
    made = makeRuntime({ primed: false, viewmodel: viewmodelFor, instances: [WS1, WS2] });
    return made;
  }

  test('schreiben ohne vorheriges Lesen scheitert — ohne Token, ohne available, ohne Seiteneffekt', async () => {
    const { runtime, log } = setup();
    const out = await runtime.interact([write('ws-1')]);
    assertEqual(out.ok, false);
    const r = out.results[0];
    assertEqual(r.error, 'stale_revision');
    assertEqual(r.message, 'agent.errors.staleRevision|ws-1');
    assertDeepEqual(Object.keys(r).sort(), ['error', 'id', 'message', 'ok']);
    assertEqual(log.some(e => e.startsWith('vm:')), false, 'die Op lief nicht');
  });

  test('lesen, dann zwei Schreibzugriffe in getrennten Stapeln: eigene Änderungen sind keine fremden', async () => {
    const { runtime } = setup();
    await runtime.interact([read('ws-1')]);
    assertEqual((await runtime.interact([write('ws-1')])).ok, true);
    assertEqual((await runtime.interact([write('ws-1')])).ok, true);
  });

  test('lesen und schreiben im selben Stapel, mehrere Schreibzugriffe hintereinander', async () => {
    const { runtime } = setup();
    const out = await runtime.interact([read('ws-1'), write('ws-1'), write('ws-1'), write('ws-1')]);
    assertEqual(out.ok, true, JSON.stringify(out));
    assertEqual(out.results.length, 4);
  });

  test('eine fremde Änderung dazwischen macht veraltet; nach erneutem read gelingt es', async () => {
    const { runtime, revs } = setup();
    await runtime.interact([read('ws-1')]);
    revs.set('ws-1', 42);                                    // der Nutzer tippt
    assertEqual((await runtime.interact([write('ws-1')])).results[0].error, 'stale_revision');
    await runtime.interact([read('ws-1')]);
    assertEqual((await runtime.interact([write('ws-1')])).ok, true);
  });

  test('eine Änderung, die erst im Settle landet (persist-$watch), zählt als eigene', async () => {
    let made;
    let deferred = null;
    const viewmodel = (id) => ({
      read: () => ({}),
      importCsv: () => { deferred = () => made.revs.set(id, 7); return true; },
    });
    made = makeRuntime({
      primed: false, viewmodel, instances: [WS1],
      onSettle: () => { deferred?.(); deferred = null; },
    });
    await made.runtime.interact([read('ws-1')]);
    assertEqual((await made.runtime.interact([write('ws-1')])).ok, true);
    assertEqual((await made.runtime.interact([write('ws-1')])).ok, true);
  });

  test('eine Nebenwirkung auf eine andere Instanz macht diese veraltet', async () => {
    const { runtime } = setup({ sideEffectOn: 'ws-2' });
    await runtime.interact([read('ws-1'), read('ws-2')]);
    assertEqual((await runtime.interact([write('ws-1')])).ok, true);
    assertEqual((await runtime.interact([write('ws-2')])).results[0].error, 'stale_revision');
  });

  test('module.add ohne vorheriges Lesen der Struktur scheitert ohne Seiteneffekt', async () => {
    const { runtime, log } = setup();
    const out = await runtime.interact([{ op: 'module.add', module: 'worksheet' }]);
    assertEqual(out.results[0].error, 'stale_revision');
    assertEqual(out.results[0].message, 'agent.errors.staleStructure');
    assertEqual(log.some(e => e.startsWith('add-start')), false);
  });

  test('project.read zählt als Lesen der Struktur; die neue Instanz ist sofort beschreibbar', async () => {
    const { runtime } = setup();
    await runtime.interact([{ op: 'project.read' }]);
    const out = await runtime.interact([
      { id: 'a', op: 'module.add', module: 'worksheet' },
      { op: 'instance.call', instance: { $from: 'a', path: 'instanceId' }, method: 'importCsv', args: ['x'] },
      { op: 'module.remove', instance: 'ws-2' },
    ]);
    assertEqual(out.ok, true, JSON.stringify(out));
  });

  test('interact() ohne Parameter zählt als Lesen der Struktur', async () => {
    const { runtime } = setup();
    await runtime.interact();
    assertEqual((await runtime.interact([{ op: 'module.remove', instance: 'ws-2' }])).ok, true);
  });

  test('eine fremde Strukturänderung macht module.remove veraltet', async () => {
    const { runtime, bumpStructure } = setup();
    await runtime.interact([{ op: 'project.read' }]);
    bumpStructure();                              // der Nutzer legt ein Modul an
    assertEqual((await runtime.interact([{ op: 'module.remove', instance: 'ws-2' }])).results[0].error,
      'stale_revision');
  });

  test('vor jedem Vermerk einer Instanz wartet die Laufzeit settle(id) ab — auch nach read und module.add', async () => {
    const { runtime, settles } = setup();
    await runtime.interact([{ op: 'project.read' }]);
    await runtime.interact([
      read('ws-1'),
      { id: 'a', op: 'module.add', module: 'worksheet' },
      { op: 'module.remove', instance: 'ws-2' },
    ]);
    assertDeepEqual(settles, ['ws-1', 'worksheet-new', null]);
  });

  test('nach module.remove ist die Instanz vergessen', async () => {
    const { runtime } = setup();
    await runtime.interact([{ op: 'project.read' }, read('ws-2')]);
    await runtime.interact([{ op: 'module.remove', instance: 'ws-2' }]);
    // Der Fake-Host entfernt die Instanz nicht aus `phases`; sie existiert
    // also weiter, ist für den Agenten aber nicht mehr gelesen.
    assertEqual((await runtime.interact([write('ws-2')])).results[0].error, 'stale_revision');
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

  test('ein Abstieg nach view.phase wird jetzt STATISCH abgelehnt, nicht erst zur Laufzeit', async () => {
    // Dieser Fall ging früher durch, weil `view` als sicheres Objekt
    // deklariert war. `view` ist zur Laufzeit aber null, wenn kein Modul offen
    // ist — und dann scheiterte derselbe Stapel als `unresolved_ref`. Stufe 4
    // lehnt den Abstieg jetzt ab (Nullable-Form), bevor etwas läuft.
    const { runtime, log } = makeRuntime();
    const out = await runtime.interact([
      { id: 'r1', op: 'project.read' },
      { id: 'a1', op: 'module.add', module: 'five-why', phase: { $from: 'r1', path: 'view.phase' } },
    ]);
    assertEqual(out.ok, false);
    assertEqual(out.cause.error, 'bad_shape');
    assertDeepEqual(out.cause.available, ['instanceId', 'module', 'phase']);
    assertTrue(!log.some(e => e.startsWith('add-start:')), 'no instance was created');
  });

  test('der gültige Weg: view lesen, selbst verzweigen, zweiter Stapel', async () => {
    const { runtime } = makeRuntime();
    const read = await runtime.interact([{ id: 'r1', op: 'project.read' }]);
    assertEqual(read.ok, true, JSON.stringify(read));
    const { view } = read.results[0].result;
    assertDeepEqual(view, { instanceId: 'fw-1', module: 'five-why', phase: 'define' });

    // Der zweite Stapel geht über eine REFERENZ, nicht über ein Literal:
    // sonst hätte diese Suite nur noch negative Referenzfälle und die
    // positive Seite ihrer eigenen Behauptung — ein aufgelöster
    // Referenzwert übersteht den Wiederholungslauf von Stufe 3 — wäre für
    // `phase` nicht mehr gedeckt. `instances.0.phase` ist der nicht-nullbare
    // Zwilling derselben Auskunft: `INSTANCE_ENTRY` führt `phase`, und die
    // Liste ist nie eine Nullable-Hülle. Die Referenz muss im ZWEITEN Stapel
    // ihr eigenes `project.read` haben — `$from` löst nur innerhalb eines
    // Stapels auf, `r1` oben ist hier nicht erreichbar.
    const out = await runtime.interact([
      { id: 'r2', op: 'project.read' },
      { id: 'a1', op: 'module.add', module: 'five-why',
        phase: { $from: 'r2', path: 'instances.0.phase' } },
    ]);
    assertEqual(out.ok, true, JSON.stringify(out));
    assertEqual(out.results[1].result.phase, 'define');
  });
});

// ── Review-Befund I1 ───────────────────────────────────────────────
// Die Singleton-Regel stand ausschließlich in `ui/dmaic-tiles.js:_canAdd`;
// der Agentenpfad ging über `createInstance` daran vorbei und konnte eine
// zweite Instanz anlegen — etwas, was die UI verbietet.
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
      saveNow: () => {},
      flushNow: async () => {},
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
      revisions: alreadyReadEverything(),
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
        settle: async () => {},
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
  // Stufe 6 des Prüfers (agent-validate.js) fängt das abgeschlossene Projekt
  // jetzt VOR jedem Seiteneffekt ab — die Antwort ist deshalb die
  // Stapel-Validierungsform (`cause.error`), nicht mehr ein Pro-Aktion-Fehler
  // in `results[0]`. Die Laufzeitprüfungen in agent-ops.js bleiben als
  // Verteidigung, laufen aber über den normalen `interact()`-Pfad nie mehr an,
  // weil die Prüfung immer zuerst läuft.
  test('module.add reports project_completed instead of a phantom instance', async () => {
    const { runtime, log } = makeRuntime({ completed: true });
    const out = await runtime.interact({ op: 'module.add', module: 'worksheet', phase: 'data' });
    assertEqual(out.ok, false);
    assertEqual(out.cause.error, 'project_completed');
    assertEqual(out.results, undefined, 'no invented instanceId — nothing ran at all');
    assertDeepEqual(log, ['consent'], 'the host was never asked to write');
  });

  test('module.remove reports project_completed, not a self-contradicting unknown_instance', async () => {
    const { runtime } = makeRuntime({ completed: true });
    const out = await runtime.interact({ op: 'module.remove', instance: 'fw-1' });
    assertEqual(out.ok, false);
    assertEqual(out.cause.error, 'project_completed');
    assertEqual(out.cause.available, undefined,
      'the old answer listed the very instance it called unknown');
  });

  test('every completed-project error still carries the contract version', async () => {
    const { runtime } = makeRuntime({ completed: true });
    const out = await runtime.interact({ op: 'module.add', module: 'worksheet', phase: 'data' });
    assertEqual(out.contract, CONTRACT_VERSION);
  });

  test('a host that cannot find the new instance reports op_failed, not an invented id', async () => {
    const { runtime } = makeRuntime();
    const out = await runtime.interact({ op: 'module.add', module: 'worksheet', phase: 'data' });
    assertEqual(out.ok, true, 'control: the normal path still works');
    // Now the same action against a host whose write silently vanished.
    const broken = createAgentRuntime({
      stateManager: { getActiveProjectId: () => 'p-1', get: () => ({}), set: () => {}, saveNow: () => {}, flushNow: async () => {} },
      revisions: alreadyReadEverything(),
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
        settle: async () => {},
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
// TOCTOU zwischen Prüfung und Ausführung.
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
      stateManager: { getActiveProjectId: () => 'p-1', get: () => (where === 'world' ? throwing() : ({})), set: () => {}, saveNow: () => {}, flushNow: async () => {} },
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
    assertEqual(out.contract, CONTRACT_VERSION);
    assertTrue(out.message.includes('boom in consent'), out.message);
  });

  test('a throwing host.getCurrentView in the surface description becomes surface_failed', async () => {
    const out = await makeThrowing('view').interact();
    assertEqual(out.ok, false);
    assertEqual(out.error, 'surface_failed');
    assertEqual(out.contract, CONTRACT_VERSION);
  });

  test('a throwing buildWorld becomes surface_failed', async () => {
    const out = await makeThrowing('world').interact({ op: 'catalog.read' });
    assertEqual(out.ok, false);
    assertEqual(out.error, 'surface_failed');
    assertEqual(out.contract, CONTRACT_VERSION);
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

// ── Task 10 ────────────────────────────────────────────────────────
// Das Rollen-Briefing ist ein Handbuchkapitel und keine JSON-Zeichenkette:
// `interact()` holt es über `getHelp` und flacht es zu Klartext ab.
suite('agent runtime — interact() liefert das Briefing aus dem Handbuchkapitel', () => {
  test('das Briefing kommt in der aktiven Sprache und ohne Renderer-Markup', async () => {
    const asked = [];
    const { runtime } = makeRuntime({
      getHelp: async (id) => { asked.push(id); return id === AI_ASSISTANT_CHAPTER_ID ? aiAssistantHelp : null; },
    });
    const out = await runtime.interact();

    assertDeepEqual(asked, [AI_ASSISTANT_CHAPTER_ID]);
    assertEqual(typeof out.briefing, 'string');
    // I18N.getLanguage() ist 'de' — also der deutsche Abschnittstext.
    assertTrue(out.briefing.includes('Six-Sigma-Black-Belt'), out.briefing.slice(0, 200));
    assertTrue(out.briefing.includes('angewandt, nicht gesichert'), 'der letzte Abschnitt fehlt');
    assertEqual(out.briefing.includes('{{term:'), false);
    assertEqual(out.briefing.includes('**'), false);
  });

  test('ohne Kapitel in der Registry bleibt das Briefing leer, statt zu werfen', async () => {
    const { runtime } = makeRuntime();          // getHelp liefert null
    const out = await runtime.interact();
    assertEqual(out.ok, true, JSON.stringify(out));
    assertEqual(out.briefing, '');
  });

  test('ein werfendes getHelp wird zu surface_failed, nicht zu einer rohen Ausnahme', async () => {
    const { runtime } = makeRuntime({ getHelp: async () => { throw new Error('boom in help'); } });
    const out = await runtime.interact();
    assertEqual(out.ok, false);
    assertEqual(out.error, 'surface_failed');
    assertEqual(out.contract, CONTRACT_VERSION);
  });
});

// ── Task 1 ───────────────────────────────────────────────────────────
// `ok: true` heißt „liegt auf Platte": ein Stapel, der geschrieben hat, muss
// `stateManager.flushNow()` EINMAL rufen, bevor die Antwort rausgeht — ein
// nur lesender Stapel zahlt den Preis nicht — sonst kostete jedes read()
// einen Schreibzugriff auf IndexedDB.
suite('agent runtime — ok heißt „liegt auf Platte" (Task 1)', () => {
  // `five-why` muss hier agent-reif sein (anders als in der geteilten
  // REGISTRY oben), damit `instance.call` gegen `fw-1` die Validierung
  // passiert und der Unterschied lesend/schreibend überhaupt sichtbar wird.
  const FLUSH_REGISTRY = {
    'five-why': { tagged: true, available: true, violations: [],
                  actions: { read: { params: [], returns: 'object', help: 'liest' },
                             setProblem: { params: [{ name: 'text', type: 'string', optional: false, help: '' }],
                                           returns: 'boolean', help: '' } },
                  fields: {} },
  };

  /** Wie `makeRuntime`, aber mit einem zählenden `flushNow`. */
  function makeFlushRuntime(overrides = {}) {
    let flushes = 0;
    const { runtime } = makeRuntime({
      ...overrides,
      registry: { ...FLUSH_REGISTRY, ...overrides.registry },
      stateManager: { flushNow: async () => { flushes += 1; }, ...overrides.stateManager },
    });
    return { runtime, flushesRef: () => flushes };
  }

  test('ein schreibender Stapel speichert beide Hälften: erst saveNow, dann flushNow', async () => {
    const calls = [];
    const { runtime } = makeRuntime({ stateManager: {
      saveNow: () => calls.push('saveNow'),
      flushNow: async () => { calls.push('flushNow'); },
    } });
    const out = await runtime.interact([{ op: 'module.add', module: 'worksheet' }]);
    assertEqual(out.ok, true, JSON.stringify(out));
    assertDeepEqual(calls, ['saveNow', 'flushNow']);
  });

  test('ein nur lesender Stapel speichert nichts', async () => {
    const calls = [];
    const { runtime } = makeRuntime({ stateManager: {
      saveNow: () => calls.push('saveNow'),
      flushNow: async () => { calls.push('flushNow'); },
    } });
    await runtime.interact([{ op: 'project.read' }]);
    assertDeepEqual(calls, []);
  });

  test('ein schreibender Stapel flusht den Zustand, bevor er antwortet', async () => {
    const { runtime, flushesRef } = makeFlushRuntime();
    const res = await runtime.interact([{ op: 'module.add', module: 'five-why' }]);
    assertEqual(res.ok, true, JSON.stringify(res));
    assertEqual(flushesRef(), 1, 'genau ein Flush je Stapel, nicht je Aktion');
  });

  test('zwei Schreibaktionen in einem Stapel flushen EINMAL', async () => {
    const { runtime, flushesRef } = makeFlushRuntime();
    await runtime.interact([
      { op: 'module.add', module: 'worksheet' },
      { op: 'module.remove', instance: 'fw-1' },
    ]);
    assertEqual(flushesRef(), 1);
  });

  test('ein nur lesender Stapel flusht nicht', async () => {
    const { runtime, flushesRef } = makeFlushRuntime();
    await runtime.interact([{ op: 'project.read' }, { op: 'catalog.read' }]);
    assertEqual(flushesRef(), 0, 'ein Lesestapel zahlt den Preis nicht');
  });

  test('instance.call mit method "read" gilt als lesend, jede andere Methode als schreibend', async () => {
    const { runtime, flushesRef } = makeFlushRuntime({ viewmodel: { read: () => 'ok', setProblem: () => true } });

    await runtime.interact([{ op: 'instance.call', instance: 'fw-1', method: 'read', args: [] }]);
    assertEqual(flushesRef(), 0);

    await runtime.interact([{ op: 'instance.call', instance: 'fw-1', method: 'setProblem', args: ['x'] }]);
    assertEqual(flushesRef(), 1);
  });

  test('ein Stapel, der mitten drin scheitert, flusht trotzdem', async () => {
    // Der Stapel gibt Teilergebnisse zurück. Was passiert IST, muss auch auf
    // Platte sein; sonst verliert der Agent genau die Hälfte, die ihm die
    // Antwort als erfolgreich meldet.
    //
    // `nicht-existent` als literaler Bezeichner würde Stufe 5 der Validierung
    // VOR jedem Seiteneffekt abweisen — der ganze Stapel liefe nie
    // an, und der Fall testete nichts über das Flushen. Deshalb hier ein
    // Scheitern, das erst im Vollzug passiert: `setProblem` ist der
    // Registry nach eine gültige Methode, die Viewmodel-Implementierung
    // wirft aber zur Laufzeit (`op_failed`).
    const { runtime, flushesRef } = makeFlushRuntime({
      viewmodel: { setProblem: () => { throw new Error('boom'); } },
    });

    const res = await runtime.interact([
      { op: 'module.add', module: 'worksheet' },
      { op: 'instance.call', instance: 'fw-1', method: 'setProblem', args: ['x'] },
    ]);

    assertEqual(res.ok, false, JSON.stringify(res));
    assertEqual(flushesRef(), 1);
  });

  // ── Fixrunde 1, Important-Befund ────────────────────────────────────
  // `await stateManager.flushNow()` lag ungeschützt in `runInteract`, das
  // unter `.catch(surfaceFailure)` hängt (Serialisierungskette). Lehnte
  // `flushNow()` ab, gingen die bereits gebauten `results` eines
  // erfolgreichen Schreibvorgangs verloren, und der Agent sah nur einen
  // generischen `surface_failed` — und konnte einen bereits gelandeten
  // Schreibvorgang für nicht passiert halten und wiederholen.
  test('ein ablehnendes flushNow meldet flush_failed MIT den bereits gebauten results', async () => {
    const { runtime } = makeFlushRuntime({
      stateManager: { flushNow: async () => { throw new Error('IndexedDB-Quota überschritten'); } },
    });

    const res = await runtime.interact([{ op: 'module.add', module: 'worksheet' }]);

    assertEqual(res.ok, false, JSON.stringify(res));
    assertEqual(res.error, 'flush_failed');
    assertEqual(res.contract, CONTRACT_VERSION);
    assertTrue(res.message.includes('IndexedDB-Quota überschritten'), res.message);
    // Der Schreibvorgang IST gelandet (sonst gäbe es gar kein flushNow) —
    // die results dürfen nicht verloren gehen, sonst hält der Agent ihn für
    // nicht passiert und wiederholt ihn.
    assertEqual(res.results?.length, 1);
    assertEqual(res.results[0].ok, true);
    assertEqual(res.results[0].result.module, 'worksheet');
  });
});
