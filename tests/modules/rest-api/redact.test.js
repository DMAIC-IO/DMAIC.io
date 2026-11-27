/**
 * REST API: Maskierung der Header-Tokens in Lesefläche und Export (B6).
 * Der Deskriptor-Haken `redact` (domain/redact.js) über den Kern:
 * Export maskiert, Speichern und Reload behalten das Token, Import eines
 * maskierten Exports übernimmt den Platzhalter nicht als Token.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import descriptor from '../../../js/modules/rest-api/module.js';
import redact from '../../../js/modules/rest-api/domain/redact.js';
import { MASK } from '../../../js/modules/rest-api/domain/headers.js';
import { State } from '../../../js/modules/rest-api/domain/model.js';
import { setModelName } from '../../../js/core/model.js';
import { loadModel } from '../../../js/core/initial-model.js';
import { fromDescriptor } from '../../../js/core/module-catalog.js';
import { ModuleRegistry } from '../../../js/core/module-registry.js';
import { StateManager } from '../../../js/core/state-manager.js';
import { EventBus } from '../../../js/core/event-bus.js';
import { createInstances } from '../../../js/core/instances.js';

setModelName(State, 'rest-api');

const SCHED = { enabled: false, intervalValue: 5, intervalUnit: 'minutes' };
const STATE = {
  _schema: { name: 'rest-api', version: '1.0' },
  endpoints: [{
    id: 'ep1', name: 'Linie 1', url: 'https://x.test/api', writeMode: 'replace', schedule: { ...SCHED }, mappings: [],
    headers: [{ key: 'Authorization', value: 'Bearer geheim' }, { key: 'Accept', value: 'application/json' }, { key: 'X-Token', value: '' }],
  }],
  activeId: 'ep1',
};
const PHASES = { data: [{ instanceId: 'r1', moduleId: 'rest-api' }] };

/** Ein Adapter über einem Dokument; `put` schreibt ins Dokument (Reload liest es). */
function memoryAdapter(doc) {
  return {
    supportsMultiProject: false,
    doc,
    subscribe() { return () => {}; },
    async loadProjectDoc() { return structuredClone(this.doc); },
    listProjects() { return [{ id: 'p', name: 'P', cycle: 'dmaic', status: 'active' }]; },
    getActiveProjectId() { return 'p'; },
    setActiveProjectId() {}, createProject() { return 'p'; },
    saveProjectMeta() {},
    putModule(_p, iid, s) { this.doc.moduleStates[iid] = structuredClone(s); },
    removeModule() {}, dropPending() {}, addProjectEntry() {}, updateProjectEntry() {},
    setProjectStatus() {}, reorderProjects() {}, async deleteProject() {}, async flush() {},
    async exportProjectDocs() { return [{ id: 'p', ...structuredClone(this.doc) }]; }, async importProjectDoc() {},
  };
}
const projectDoc = () => ({
  projectMeta: { name: 'P', cycle: 'dmaic' }, phases: structuredClone(PHASES), phaseAchievement: {},
  phaseAchievementHistory: {}, dashboard: {}, version: '1.0.0', moduleStates: { r1: structuredClone(STATE) },
});

async function setupManager(doc = projectDoc()) {
  const reg = new ModuleRegistry();
  reg.register(fromDescriptor(descriptor));
  await reg.loadRedactors();
  const adapter = memoryAdapter(doc);
  const sm = new StateManager(new EventBus(), adapter);
  sm.setModuleRegistry(reg);
  await sm.load();
  return { sm, reg, adapter };
}

suite('rest-api: redact (B6)', () => {
  test('Deskriptor lädt domain/redact.js', async () => {
    assertEqual((await descriptor.redact()).default, redact);
  });

  test('redact: geheime Header-Werte als Platzhalter, Rest und Eingabe unverändert', () => {
    const before = structuredClone(STATE);
    const out = redact(STATE);
    assertDeepEqual(out.endpoints[0].headers, [
      { key: 'Authorization', value: MASK }, { key: 'Accept', value: 'application/json' }, { key: 'X-Token', value: '' },
    ]);
    assertEqual(out.endpoints[0].url, 'https://x.test/api');
    assertEqual(out.activeId, 'ep1');
    assertDeepEqual(STATE, before, 'Eingabe nicht verändert');
  });

  test('redact: tolerant gegen Teil- und Altstände', () => {
    assertDeepEqual(redact({ asyncTasks: {} }), { asyncTasks: {} });
    assertDeepEqual(redact({ endpoints: [null, { id: 'x' }] }), { endpoints: [null, { id: 'x' }] });
    const odd = redact({ endpoints: [{ headers: [{ key: 'Cookie', value: 's=1' }, 'kaputt', { key: 3, value: 'v' }] }] });
    assertEqual(odd.endpoints[0].headers[0].value, MASK);
    assertEqual(odd.endpoints[0].headers[1], 'kaputt');
  });

  test('Projekt-Export maskiert; Speicher und Reload behalten das Token', async () => {
    const { sm, adapter } = await setupManager();
    sm.setModuleState('r1', STATE);
    const exported = JSON.parse(sm.exportJSON());
    assertEqual(exported.moduleStates.r1.endpoints[0].headers[0].value, MASK);
    const all = JSON.parse(await sm.exportAllJSON());
    assertEqual(all.projects[0].moduleStates.r1.endpoints[0].headers[0].value, MASK);
    assertEqual(adapter.doc.moduleStates.r1.endpoints[0].headers[0].value, 'Bearer geheim', 'gespeichert ungekürzt');
    const reloaded = new StateManager(new EventBus(), adapter);
    await reloaded.load();
    assertEqual(reloaded.getModuleState('r1').endpoints[0].headers[0].value, 'Bearer geheim', 'Reload behält das Token');
  });

  test('Import eines maskierten Exports: Platzhalter wird beim Laden leer', async () => {
    const { sm } = await setupManager();
    const exported = sm.exportJSON();
    await sm.importJSON(exported);
    const model = loadModel(State, sm.getModuleState('r1'));
    assertEqual(model.endpoints[0].headers[0].value, '', 'kein Platzhalter als Token');
    assertEqual(model.endpoints[0].headers[1].value, 'application/json');
  });

  test('read() über instances maskiert, Speicher ungekürzt', async () => {
    const { sm, reg } = await setupManager();
    const mod = {
      Model: State,
      loadDetached: (json) => loadModel(State, json),
      readDetached: (model) => model.toJSON(),
    };
    const moduleRegistry = { loadModule: async () => mod, getLoaded: () => mod,
      loadRedactor: (id) => reg.loadRedactor(id), redactorOf: (id) => reg.redactorOf(id) };
    const workspace = { getLiveViewmodel: () => null, isPending: () => false };
    const svc = createInstances({ stateManager: sm, moduleRegistry, workspace, eventBus: new EventBus(),
      createSource: () => ({ read: () => ({}), list: () => [] }) });
    const out = await svc.read('r1');
    assertEqual(out.endpoints[0].headers[0].value, MASK);
    assertEqual(svc.readSync('r1').endpoints[0].headers[0].value, MASK);
    assertTrue(sm.getModuleState('r1').endpoints[0].headers[0].value === 'Bearer geheim');
  });
});
