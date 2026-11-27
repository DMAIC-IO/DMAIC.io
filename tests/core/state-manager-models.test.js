/**
 * StateManager: Übernahme der Projektschlüssel `models`/`optimizations` in die
 * Besitzer-Instanzen (Regel D5, `core/project-models.js`) beim Laden, bei
 * beiden Importen und bei einer fremden Änderung. DOM-frei (Node-Lauf mit
 * localStorage-Ersatz), mit einem Testadapter, der die Reihenfolge seiner
 * Aufrufe mitschreibt.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import { EventBus } from '../../js/core/event-bus.js';
import { StateManager } from '../../js/core/state-manager.js';
import { ModuleRegistry } from '../../js/core/module-registry.js';
import { VERSION } from '../../js/core/version.js';

const MODEL = { id: 'm-a', name: 'Lieferzeit', coef: [1, 2], dataHash: 'abc', createdFromInstanceId: 'reg-1' };
const ORPHAN = { id: 'm-c', name: 'Waise', coef: [3], createdFromInstanceId: 'gone' };

/** Ein Altstand: Besitzer `reg-1` trägt `m-a`, `m-c` hat keinen Besitzer mehr. */
function legacyDoc() {
  return {
    projectMeta: { name: 'Alt', cycle: 'dmaic' },
    phases: { data: [], improve: [{ instanceId: 'reg-1', moduleId: 'regression', order: 0 }] },
    phaseAchievement: {}, phaseAchievementHistory: {}, chartEdits: {}, dashboard: null, version: VERSION,
    models: { 'm-a': { ...MODEL }, 'm-c': { ...ORPHAN } },
    optimizations: {},
    moduleStates: { 'reg-1': { savedModelId: 'm-a', savedModelName: 'Lieferzeit' } },
  };
}

/** Testadapter: ein Projekt, Aufrufe in `log`. */
function makeAdapter(initialDoc) {
  let doc = initialDoc;
  let cb = null;
  /** @type {Array<any[]>} */
  const log = [];
  return {
    supportsMultiProject: true,
    log,
    _setDoc(d) { doc = d; },
    _fireRemote() { if (cb) cb(); },
    subscribe(fn) { cb = fn; return () => { cb = null; }; },
    async loadProjectDoc() { return doc ? JSON.parse(JSON.stringify(doc)) : null; },
    listProjects() { return [{ id: 'wb', name: 'WB', cycle: 'dmaic', status: 'active' }]; },
    getActiveProjectId() { return 'wb'; },
    setActiveProjectId() {},
    createProject() { return 'wb'; },
    saveProjectMeta(_id, d) {
      log.push(['meta', JSON.parse(JSON.stringify(d))]);
      // Wie LocalAdapter: gespeichert wird nur, was übergeben wurde.
      doc = { ...(doc ?? {}), ...JSON.parse(JSON.stringify(d)) };
      delete doc.models; delete doc.optimizations;
    },
    putModule(_id, iid, s) {
      log.push(['put', iid, JSON.parse(JSON.stringify(s))]);
      doc = { ...(doc ?? {}), moduleStates: { ...(doc?.moduleStates ?? {}), [iid]: s } };
    },
    removeModule(_id, iid) { log.push(['rm', iid]); },
    dropPending() {}, addProjectEntry(e) { log.push(['entry', e.id]); }, updateProjectEntry() {},
    setProjectStatus() {}, reorderProjects() {},
    async deleteProject() {},
    async flush() { log.push(['flush']); },
    async exportProjectDocs() { return doc ? [{ id: 'wb', ...JSON.parse(JSON.stringify(doc)) }] : []; },
    async importProjectDoc(id, d) { log.push(['import', id, JSON.parse(JSON.stringify(d))]); },
  };
}

/** Register mit den Phasen der Regression im Zyklus `dmaic`. */
function registry() {
  const reg = new ModuleRegistry();
  reg.register({ id: 'regression', phase: 'improve', cycles: { dmaic: { phase: 'improve' } }, load: async () => ({}) });
  reg.register({ id: 'glm-regression', phase: 'improve', cycles: { dmaic: { phase: 'analyze' } }, load: async () => ({}) });
  return reg;
}

suite('StateManager: Projektmodelle beim Laden', () => {
  test('load(): Besitzer und Waise erst in IndexedDB, dann die Projektdaten ohne Altschlüssel', async () => {
    const adapter = makeAdapter(legacyDoc());
    const sm = new StateManager(new EventBus(), adapter);
    sm.setModuleRegistry(registry());
    await sm.load();

    const kinds = adapter.log.map((e) => (e[0] === 'put' ? `put:${e[1]}` : e[0]));
    assertDeepEqual(kinds, ['put:reg-1', 'put:gone', 'flush', 'meta'], 'Reihenfolge');
    const meta = adapter.log.find((e) => e[0] === 'meta')[1];
    assertTrue(!('models' in meta) && !('optimizations' in meta), 'Projektdaten ohne Altschlüssel');
    assertEqual(sm.get('models'), undefined);
    assertEqual(sm.get('optimizations'), undefined);
    assertEqual(sm.getModuleState('reg-1').savedModel.id, 'm-a');
    // Die Waise steht in der Vorgabephase ihres Moduls, mit dem Modellnamen.
    const orphan = sm.get('phases').improve.find((e) => e.instanceId === 'gone');
    assertEqual(orphan.customName, 'Waise');
    assertEqual(sm.getModuleState('gone').savedModelId, 'm-c');
  });

  test('ein zweites load() ändert nichts', async () => {
    const adapter = makeAdapter(legacyDoc());
    const sm = new StateManager(new EventBus(), adapter);
    sm.setModuleRegistry(registry());
    await sm.load();
    adapter.log.length = 0;
    await sm.load();
    assertDeepEqual(adapter.log, []);
    assertEqual(sm.getModuleState('reg-1').savedModel.id, 'm-a');
  });

  test('ohne Altschlüssel schreibt load() nichts', async () => {
    const doc = legacyDoc();
    delete doc.models; delete doc.optimizations;
    const adapter = makeAdapter(doc);
    const sm = new StateManager(new EventBus(), adapter);
    await sm.load();
    assertDeepEqual(adapter.log, []);
  });

  test('ohne Register landet die Waise in der ersten Methodenphase', async () => {
    const doc = legacyDoc();
    doc.phases = { data: [], define: [], improve: doc.phases.improve };
    const adapter = makeAdapter(doc);
    const sm = new StateManager(new EventBus(), adapter);
    await sm.load();
    assertTrue(sm.get('phases').define.some((e) => e.instanceId === 'gone'));
  });
});

suite('StateManager: Projektmodelle bei Importen und fremden Änderungen', () => {
  test('importJSON übernimmt die Modelle eines Einzelexports (Altfehler K3)', async () => {
    const adapter = makeAdapter(null);
    const sm = new StateManager(new EventBus(), adapter);
    sm.setModuleRegistry(registry());
    await sm.load();
    const { models: _m, optimizations: _o, ...rest } = legacyDoc();
    const file = { appVersion: VERSION, settings: sm.get('settings'), ...rest, models: legacyDoc().models };
    await sm.importJSON(JSON.stringify(file));
    assertEqual(sm.getModuleState('reg-1').savedModel.id, 'm-a');
    assertEqual(sm.getModuleState('gone').savedModel.id, 'm-c');
    assertTrue(sm.get('phases').improve.some((e) => e.instanceId === 'gone'));
    assertEqual(sm.get('models'), undefined);
    assertTrue(!('models' in JSON.parse(sm.exportJSON())), 'Export ohne models');
  });

  test('importAllJSON schreibt die Projekte ohne Altschlüssel, Modelle beim Besitzer', async () => {
    const adapter = makeAdapter(null);
    const sm = new StateManager(new EventBus(), adapter);
    sm.setModuleRegistry(registry());
    await sm.load();
    const { moduleStates, ...proj } = legacyDoc();
    await sm.importAllJSON(JSON.stringify({ appVersion: VERSION, projects: [{ ...proj, moduleStates }] }));
    const imp = adapter.log.find((e) => e[0] === 'import')[2];
    assertTrue(!('models' in imp) && !('optimizations' in imp));
    assertEqual(imp.moduleStates['reg-1'].savedModel.id, 'm-a');
    assertEqual(imp.moduleStates['gone'].savedModelId, 'm-c');
  });

  test('exportAllJSON übernimmt die Modelle eines nie geöffneten Projekts', async () => {
    const adapter = makeAdapter(null);
    const sm = new StateManager(new EventBus(), adapter);
    await sm.load();
    adapter._setDoc(legacyDoc());
    const out = JSON.parse(await sm.exportAllJSON());
    const p = out.projects[0];
    assertTrue(!('models' in p));
    assertEqual(p.moduleStates['reg-1'].savedModel.id, 'm-a');
  });

  test('fremde Änderung mit Altschlüsseln: übernommen, ohne Zurückschreiben', async () => {
    const doc = legacyDoc();
    delete doc.models; delete doc.optimizations;
    const adapter = makeAdapter(doc);
    const sm = new StateManager(new EventBus(), adapter);
    sm.setModuleRegistry(registry());
    await sm.load();
    adapter.log.length = 0;
    adapter._setDoc(legacyDoc());
    adapter._fireRemote();
    await Promise.resolve(); await Promise.resolve();
    assertEqual(sm.getModuleState('reg-1').savedModel.id, 'm-a');
    assertEqual(sm.get('models'), undefined);
    assertDeepEqual(adapter.log, [], 'kein Zurückschreiben');
  });
});
