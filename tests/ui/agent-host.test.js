/**
 * Tests für ui/agent-host.js — der Port, über den die DOM-freie
 * Agentenschicht an Router und Workspace kommt. Derselbe Weg wie
 * die UI, kein zweiter Routingpfad.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import { createAgentHost } from '../../js/ui/agent-host.js';
import { createRevisionTracker } from '../../js/core/agent/agent-revisions.js';

const DEFS = {
  'five-why': { id: 'five-why', phase: 'define', cycles: { dmaic: { phase: 'define', allowedPhases: ['measure'] } } },
  'worksheet': { id: 'worksheet', phase: 'data' },
};

function makeHost({ notify = () => {}, i18n = null, phases, activeInstance = null, completed = false, ready = null, route = null,
                   activeId = null, pending = [] } = {}) {
  const state = structuredClone(phases ?? {
    data: [],
    define: [{ instanceId: 'fw-1', moduleId: 'five-why', order: 0 }],
    measure: [],
  });
  const calls = [];
  const moduleStates = new Map();
  const stateManager = {
    getActiveProjectId: () => 'p-1',
    isCompleted: () => completed,
    get: (path) => (path === 'phases' ? state : path.startsWith('phases.') ? state[path.slice(7)] : undefined),
    // Wie der echte stateManager: im abgeschlossenen Projekt verschwindet
    // jeder Nicht-`settings.`-Schreibzugriff STILL (core/state-manager.js).
    set: (path, value) => { if (!completed) state[path.slice(7)] = value; },
    removeModuleState: () => {},
    // Der Modulzustand wie im Cache des echten stateManager; die Revision
    // hängt am Inhalt (core/state-manager.js:getModuleRevision).
    setModuleState: (id, s) => { calls.push(['persist', id, s]); moduleStates.set(id, structuredClone(s)); },
    getModuleState: (id) => moduleStates.get(id) ?? null,
    getModuleRevision: (id) => (moduleStates.has(id) ? JSON.stringify(moduleStates.get(id)) : undefined),
    getStructureRevision: () => JSON.stringify(state),
  };
  const moduleRegistry = { get: (id) => DEFS[id], getActiveCycle: () => 'dmaic' };
  const eventBus = { emit: (name, payload) => calls.push(['emit', name, payload]) };
  const mounted = new Map();
  const workspace = {
    getActiveModuleInfo: () => activeInstance,
    getActiveInstanceId: () => activeId,
    getLiveViewmodel: (id) => mounted.get(id)?.getActionData?.() ?? null,
    isPending: (id) => pending.includes(id),
    getInstance: (id) => mounted.get(id) ?? null,
    // Wie der echte Workspace: der Griff auf das Viewmodel wartet das
    // Einhängen ab (ui/workspace.js:whenInstanceReady).
    whenInstanceReady: async (id) => mounted.get(id) ?? ready?.(id) ?? null,
    removeInstance: async (id) => { calls.push(['removeInstance', id]); return !completed; },
    restoreInstance: (entry) => { calls.push(['restoreInstance', entry]); return !completed; },
  };
  const router = {
    navigate: async (r) => { calls.push(['navigate', r]); },
    getCurrentRoute: () => route,
  };
  return {
    host: createAgentHost({
      stateManager, moduleRegistry, eventBus, router, workspace, notify,
      i18n: i18n ?? { t: (key, params) => `${key}|${JSON.stringify(params ?? {})}` },
      nextTick: (cb) => { calls.push(['tick']); cb(); },
    }),
    calls, state, mounted, stateManager, moduleStates,
  };
}

suite('agent host — current view', () => {
  test('liefert null, wenn kein Modul angezeigt wird', () => {
    assertEqual(makeHost().host.getCurrentView(), null);
  });

  test('liefert Instanz, Modul und Phase des angezeigten Moduls', () => {
    const { host } = makeHost({ activeInstance: { instanceId: 'fw-1', moduleId: 'five-why', instance: {} } });
    assertDeepEqual(host.getCurrentView(), { instanceId: 'fw-1', module: 'five-why', phase: 'define' });
  });
});

suite('agent host — add', () => {
  test('legt über createInstance an und liefert Id und Phase', async () => {
    const { host, state } = makeHost();
    const r = await host.addInstance('five-why');
    assertDeepEqual(Object.keys(r).sort(), ['instanceId', 'module', 'phase']);
    assertEqual(r.phase, 'define');
    assertEqual(r.module, 'five-why');
    assertTrue(typeof r.instanceId === 'string' && r.instanceId.length > 0);
    assertEqual(state.define.length, 2);
  });

  test('ein Phasen-Override landet in der genannten Phase', async () => {
    const { host, state } = makeHost();
    const r = await host.addInstance('five-why', 'measure');
    assertEqual(r.phase, 'measure');
    assertEqual(state.measure.length, 1);
    assertEqual(state.define.length, 1);
  });

  test('emittiert module:added wie der Router', async () => {
    const { host, calls } = makeHost();
    const r = await host.addInstance('worksheet');
    const added = calls.find(c => c[0] === 'emit' && c[1] === 'module:added');
    assertTrue(Boolean(added), 'module:added fehlt');
    assertEqual(added[2].instanceId, r.instanceId);
    assertEqual(added[2].phase, 'data');
  });
});

suite('agent host — open and viewmodel', () => {
  test('open navigiert auf die Modulroute des aktiven Projekts', async () => {
    const { host, calls } = makeHost();
    const r = await host.openInstance('fw-1');
    assertDeepEqual(r, { instanceId: 'fw-1', module: 'five-why', phase: 'define' });
    assertDeepEqual(calls, [['navigate', { kind: 'module', projectId: 'p-1', instanceId: 'fw-1' }]]);
  });

  test('open einer unbekannten Instanz liefert null und navigiert nicht', async () => {
    const { host, calls } = makeHost();
    assertEqual(await host.openInstance('nope'), null);
    assertDeepEqual(calls, []);
  });

  test('getViewmodel öffnet die Instanz und liefert getActionData()', async () => {
    const { host, calls, mounted } = makeHost();
    const data = { read: () => ({}) };
    mounted.set('fw-1', { getActionData: () => data });
    assertEqual(await host.getViewmodel('fw-1'), data);
    assertTrue(calls.some(c => c[0] === 'navigate'), 'die Instanz wurde geöffnet');
  });

  test('getViewmodel liefert null, wenn die Instanz nicht live wird', async () => {
    const { host } = makeHost();
    assertEqual(await host.getViewmodel('fw-1'), null);
  });

  test('remove delegiert an den bestätigungsfreien Workspace-Pfad', async () => {
    const { host, calls } = makeHost();
    assertEqual(await host.removeInstance('fw-1'), true);
    assertDeepEqual(calls, [['removeInstance', 'fw-1']]);
  });
});

// ── Review-Befund I2 ───────────────────────────────────────────────
// Der Rückfall `locate(instanceId) ?? { instanceId, module, phase: … }` hat
// im abgeschlossenen Projekt eine Instanz-Id erfunden, die es nicht gibt:
// `stateManager.set` verwirft den Schreibzugriff still, `locate()` findet
// nichts — und der Agent bekam `ok: true` mit dieser Id.
suite('agent host — der abgeschlossene Projektzustand', () => {
  test('isCompleted spiegelt den stateManager', () => {
    assertEqual(makeHost().host.isCompleted(), false);
    assertEqual(makeHost({ completed: true }).host.isCompleted(), true);
  });

  test('addInstance liefert null statt einer erfundenen Id', async () => {
    const { host, state } = makeHost({ completed: true });
    assertEqual(await host.addInstance('five-why'), null);
    assertEqual(state.define.length, 1, 'nichts wurde geschrieben');
  });

  test('addInstance fasst den Workspace im abgeschlossenen Projekt gar nicht an', async () => {
    const { host, calls } = makeHost({ completed: true });
    await host.addInstance('five-why');
    assertDeepEqual(calls, [], 'kein module:added für eine Instanz, die es nicht gibt');
  });

  test('removeInstance liefert false und ruft den Workspace nicht', async () => {
    const { host, calls } = makeHost({ completed: true });
    assertEqual(await host.removeInstance('fw-1'), false);
    assertDeepEqual(calls, []);
  });
});

suite('agent host — Persistenz abwarten (Lesen vor Schreiben)', () => {
  test('addInstance legt den Ausgangszustand der neuen Instanz einmal ab', async () => {
    const { host, calls } = makeHost({ ready: () => ({ getState: () => ({ problem: '' }) }) });
    const r = await host.addInstance('five-why');
    assertDeepEqual(calls.filter(c => c[0] === 'persist'), [['persist', r.instanceId, { problem: '' }]]);
  });

  test('addInstance ohne lebendes Modul legt nichts ab', async () => {
    const { host, calls } = makeHost();
    await host.addInstance('five-why');
    assertEqual(calls.some(c => c[0] === 'persist'), false);
  });

  test('addInstance legt den Zustand erst nach dem Einhängen ab, nicht davor', async () => {
    // Das `init()` des Moduls normalisiert sein Model während des Einhängens:
    // abgelegt werden muss der Stand DANACH.
    let model = { raw: true };
    const { host, calls } = makeHost({
      ready: async () => {
        await Promise.resolve();
        model = { normalized: true };
        return { getState: () => model };
      },
    });
    const r = await host.addInstance('five-why');
    assertDeepEqual(calls.filter(c => c[0] === 'persist'), [['persist', r.instanceId, { normalized: true }]]);
  });

  test('settle wartet einen Alpine-Tick ab', async () => {
    const { host, calls } = makeHost();
    await host.settle();
    assertDeepEqual(calls.filter(c => c[0] === 'tick'), [['tick']]);
  });

  test('settle(id) legt den Zustand einer Instanz ohne gespeicherten Zustand ab', async () => {
    const { host, calls, mounted } = makeHost();
    mounted.set('fw-1', { getState: () => ({ problem: 'x' }) });
    await host.settle('fw-1');
    assertDeepEqual(calls.filter(c => c[0] === 'persist'), [['persist', 'fw-1', { problem: 'x' }]]);
  });

  test('settle(id) schreibt nichts, wenn der gespeicherte Zustand dem lebenden gleicht', async () => {
    const { host, calls, mounted, stateManager } = makeHost();
    stateManager.setModuleState('fw-1', { problem: 'x' });
    mounted.set('fw-1', { getState: () => ({ problem: 'x' }) });
    await host.settle('fw-1');
    assertEqual(calls.filter(c => c[0] === 'persist').length, 1, 'nur der Aufbau oben');
  });

  test('settle(id) legt den lebenden Zustand ab, wenn er vom gespeicherten abweicht', async () => {
    // Ein `init()` normalisiert einen gespeicherten Zustand, oder das Modul
    // schreibt erst später (Entpreller): beides ist eine eigene Änderung.
    const { host, calls, mounted, stateManager } = makeHost();
    stateManager.setModuleState('fw-1', { problem: 'x' });
    mounted.set('fw-1', { getState: () => ({ problem: 'x', format: {} }) });
    await host.settle('fw-1');
    assertDeepEqual(calls.filter(c => c[0] === 'persist').at(-1), ['persist', 'fw-1', { problem: 'x', format: {} }]);
  });

  test('settle(id) zieht die aufgeschobene Arbeit des Moduls vor, bevor es den Zustand vergleicht', async () => {
    let model = { design: null };
    const { host, calls, mounted, stateManager } = makeHost();
    stateManager.setModuleState('fw-1', { design: null });
    mounted.set('fw-1', {
      getState: () => model,
      getActionData: () => ({ flushPendingWork: () => { model = { design: 'erzeugt' }; } }),
    });
    await host.settle('fw-1');
    assertDeepEqual(calls.filter(c => c[0] === 'persist').at(-1), ['persist', 'fw-1', { design: 'erzeugt' }]);
  });

  test('settle(id) wartet auf laufende auto-Abläufe (20000 ms), dann wird abgelegt', async () => {
    const seen = [];
    const { host, calls, mounted } = makeHost();
    mounted.set('fw-1', {
      getState: () => ({ a: 1 }),
      getActionData: () => ({ _asyncTaskHost: { settle: async (ms) => { seen.push([ms, calls.filter(c => c[0] === 'persist').length]); return true; } } }),
    });
    await host.settle('fw-1');
    assertDeepEqual(seen, [[20000, 0]]);
    assertEqual(calls.filter(c => c[0] === 'persist').length, 1);
  });

  test('gespeichert, gelesen, dann normalisiert ein Ansichtswechsel: die Instanz bleibt aktuell', async () => {
    const { host, mounted, stateManager } = makeHost();
    stateManager.setModuleState('fw-1', { problem: 'x' });
    mounted.set('fw-1', { getState: () => ({ problem: 'x', roleManual: false }) });
    const revisions = createRevisionTracker(stateManager);
    await host.settle('fw-1');
    revisions.markInstance('fw-1');
    stateManager.setModuleState('fw-1', { problem: 'x', roleManual: false });
    assertTrue(revisions.isInstanceCurrent('fw-1'));
  });

  test('gelesen ohne gespeicherten Zustand, dann ein Ansichtswechsel: die Instanz bleibt aktuell (R2)', async () => {
    const { host, mounted, stateManager } = makeHost();
    mounted.set('fw-1', { getState: () => ({ problem: 'x' }) });
    const revisions = createRevisionTracker(stateManager);
    // Was die Laufzeit nach einem `read` tut: settle(id), dann vermerken.
    await host.settle('fw-1');
    revisions.markInstance('fw-1');
    // Der Ansichtswechsel (`_persistAllModuleStates`) schreibt denselben Inhalt.
    stateManager.setModuleState('fw-1', { problem: 'x' });
    assertTrue(revisions.isInstanceCurrent('fw-1'), 'ein unveränderter Inhalt ist keine fremde Änderung');
  });
});

suite('agent host — gemountet und angezeigt', () => {
  test('isMounted: ein lebendes Viewmodel heißt gemountet', () => {
    const { host, mounted } = makeHost();
    assertEqual(host.isMounted('fw-1'), false);
    mounted.set('fw-1', { getActionData: () => ({ model: {} }) });
    assertEqual(host.isMounted('fw-1'), true);
  });

  test('isMounted: ein laufendes Einhängen zählt als gemountet', () => {
    const { host } = makeHost({ pending: ['fw-1'] });
    assertEqual(host.isMounted('fw-1'), true);
  });

  test('isDisplayed: aktive Instanz auf der Modulroute', () => {
    const route = { kind: 'module', projectId: 'p-1', instanceId: 'fw-1' };
    assertEqual(makeHost({ route, activeId: 'fw-1' }).host.isDisplayed('fw-1'), true);
    assertEqual(makeHost({ route, activeId: 'fw-2' }).host.isDisplayed('fw-1'), false);
  });

  test('isDisplayed: nach module.add steht die Route nicht auf dem Modul — die aktive Instanz ist trotzdem sichtbar', () => {
    // Der Workspace schaltet auf die neue Instanz, ohne die Route zu setzen.
    for (const route of [null, { kind: 'project', projectId: 'p-1' }, { kind: 'phase', projectId: 'p-1', phaseId: 'define' }]) {
      assertEqual(makeHost({ route, activeId: 'fw-1' }).host.isDisplayed('fw-1'), true, JSON.stringify(route));
    }
  });

  test('isDisplayed: unter einer geöffneten Seite ist auch die aktive Instanz nicht angezeigt', () => {
    const { host } = makeHost({ route: { kind: 'page', pageId: 'settings' }, activeId: 'fw-1' });
    assertEqual(host.isDisplayed('fw-1'), false);
  });
});

suite('agent host — Toast für Änderungen im Hintergrund', () => {
  function withToast(phases) {
    const toasts = [];
    const made = makeHost({
      phases,
      notify: (msg, type, icon, opts) => toasts.push({ msg, type, icon, opts }),
    });
    return { ...made, toasts };
  }

  test('eine Instanz mit Namen: one mit Modul und Name', () => {
    const { host, toasts } = withToast({ define: [{ instanceId: 'fw-1', moduleId: 'five-why', order: 0, customName: 'Linie 3' }] });
    host.notifyBackgroundChange(['fw-1']);
    assertEqual(toasts.length, 1);
    assertEqual(toasts[0].msg, 'agent.backgroundChange.one|{"module":"modules.five-why.name|{}","name":"Linie 3"}');
    assertEqual(toasts[0].type, 'info');
  });

  test('ohne customName: oneUnnamed', () => {
    const { host, toasts } = withToast();
    host.notifyBackgroundChange(['fw-1']);
    assertEqual(toasts[0].msg, 'agent.backgroundChange.oneUnnamed|{"module":"modules.five-why.name|{}"}');
  });

  test('mehrere: many mit Anzahl', () => {
    const { host, toasts } = withToast({ define: [
      { instanceId: 'a', moduleId: 'five-why', order: 0 },
      { instanceId: 'b', moduleId: 'five-why', order: 1 },
      { instanceId: 'c', moduleId: 'five-why', order: 2 },
    ] });
    host.notifyBackgroundChange(['a', 'b', 'c']);
    assertEqual(toasts[0].msg, 'agent.backgroundChange.many|{"n":3}');
  });

  test('keine ids: kein Toast', () => {
    const { host, toasts } = withToast();
    host.notifyBackgroundChange([]);
    assertEqual(toasts.length, 0);
  });

  test('der Knopf Anzeigen öffnet die erste Instanz', async () => {
    const { host, toasts, calls } = withToast();
    host.notifyBackgroundChange(['fw-1', 'x']);
    assertEqual(toasts[0].opts.action.label, 'agent.backgroundChange.show|{}');
    await toasts[0].opts.action.onClick();
    assertDeepEqual(calls.filter(c => c[0] === 'navigate').at(-1),
      ['navigate', { kind: 'module', projectId: 'p-1', instanceId: 'fw-1' }]);
  });

  test('der Knopf Anzeigen: ein scheiterndes Öffnen wird gemeldet, nicht verworfen', async () => {
    const { host, toasts } = withToast();
    host.notifyBackgroundChange(['fw-1']);
    host.openInstance = async () => { throw new Error('kaputt'); };
    const warned = [];
    const warn = console.warn;
    console.warn = (...args) => warned.push(args);
    try {
      await toasts[0].opts.action.onClick();
    } finally {
      console.warn = warn;
    }
    assertEqual(warned.length, 1);
    assertEqual(warned[0][1].message, 'kaputt');
  });

  test('nur entfernte Instanzen: kein Toast', () => {
    const { host, toasts } = withToast();
    host.notifyBackgroundChange(['weg']);
    assertEqual(toasts.length, 0);
  });

  test('entfernte ids zählen nicht mit: eine übrige Instanz ergibt oneUnnamed', () => {
    const { host, toasts } = withToast();
    host.notifyBackgroundChange(['weg', 'fw-1']);
    assertEqual(toasts[0].msg, 'agent.backgroundChange.oneUnnamed|{"module":"modules.five-why.name|{}"}');
  });
});

suite('agent host — Rücknahme', () => {
  /** Eine eingehängte Instanz, die mitschreibt, was sie bekommt. */
  function liveInstance(got, { alive = true } = {}) {
    return {
      getActionData: () => (alive ? { model: {} } : null),
      applyRemoteState: (state) => got.push(state),
    };
  }

  test('restoreInstance delegiert an den Workspace', async () => {
    const { host, calls } = makeHost();
    const entry = { instanceId: 'fw-9', module: 'five-why', phase: 'define', state: { a: 1 } };
    await host.restoreInstance(entry);
    assertDeepEqual(calls, [['restoreInstance', entry]]);
  });

  test('applyLiveState schreibt den Stand in eine eingehängte Instanz', () => {
    const got = [];
    const { host, mounted } = makeHost();
    mounted.set('ws1', liveInstance(got));
    host.applyLiveState('ws1', { rows: 1 });
    assertDeepEqual(got, [{ rows: 1 }]);
  });

  test('applyLiveState lässt eine nicht eingehängte Instanz in Ruhe', () => {
    const got = [];
    const { host, mounted } = makeHost();
    mounted.set('ws1', liveInstance(got, { alive: false }));
    host.applyLiveState('ws1', { rows: 1 });
    host.applyLiveState('nope', { rows: 1 });
    assertDeepEqual(got, []);
  });

  test('applyLiveState ohne Stand tut nichts', () => {
    const got = [];
    const { host, mounted } = makeHost();
    mounted.set('ws1', liveInstance(got));
    host.applyLiveState('ws1', null);
    assertDeepEqual(got, []);
  });

  test('ein werfendes applyRemoteState hält die Rücknahme nicht auf', () => {
    const { host, mounted } = makeHost();
    mounted.set('ws1', { getActionData: () => ({ model: {} }), applyRemoteState: () => { throw new Error('boom'); } });
    const warn = console.warn;
    const warned = [];
    console.warn = (...args) => warned.push(args);
    try {
      host.applyLiveState('ws1', { rows: 1 });
    } finally {
      console.warn = warn;
    }
    assertEqual(warned.length, 1);
  });
});

suite('agent host — Verlaufsgruppen', () => {
  function hooked(got, { alive = true, hooks = true } = {}) {
    return {
      getActionData: () => (alive ? { model: {} } : null),
      ...(hooks ? {
        historyBegin: () => got.push('begin'),
        historyEnd: () => got.push('end'),
      } : {}),
    };
  }

  test('historyBegin und historyEnd gehen an die eingehängte Instanz', () => {
    const got = [];
    const { host, mounted } = makeHost();
    mounted.set('ws1', hooked(got));
    host.historyBegin('ws1');
    host.historyEnd('ws1');
    assertDeepEqual(got, ['begin', 'end']);
  });

  test('nicht eingehängt, unbekannt oder ohne Haken: nichts', () => {
    const got = [];
    const { host, mounted } = makeHost();
    mounted.set('ws1', hooked(got, { alive: false }));
    mounted.set('ws2', hooked(got, { hooks: false }));
    host.historyBegin('ws1');
    host.historyEnd('ws1');
    host.historyBegin('ws2');
    host.historyEnd('ws2');
    host.historyBegin('nope');
    host.historyEnd('nope');
    assertDeepEqual(got, []);
  });

  test('ein werfender Haken hält den Lauf nicht auf', () => {
    const { host, mounted } = makeHost();
    mounted.set('ws1', { getActionData: () => ({ model: {} }),
      historyBegin: () => { throw new Error('boom'); }, historyEnd: () => { throw new Error('boom'); } });
    const warn = console.warn;
    const warned = [];
    console.warn = (...args) => warned.push(args);
    try {
      host.historyBegin('ws1');
      host.historyEnd('ws1');
    } finally {
      console.warn = warn;
    }
    assertEqual(warned.length, 2);
  });
});
