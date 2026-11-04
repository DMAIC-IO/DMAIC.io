/**
 * createModule in der neuen Form: `descriptor` (module.js) statt id/version/
 * icon/phase/engine in config; Template-Schlüssel js/modules/<id>/resources/view.html.
 */
import { suite, test, assertEqual, assertTrue, assertThrows } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { createModule } from '../../js/core/template-module.js';
import { defineModel, text } from '../../js/core/model.js';

const ID = 'descriptor-test';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const Note = defineModel({ fields: { title: text() }, view: {}, commands: {} });
const DESCRIPTOR = { id: ID, version: '2.1.0', icon: 'module.sipoc', phase: 'define', allowedPhases: ['define'],
  load: () => Promise.resolve({ default: {} }) };

function ensureTemplate() {
  if (!Alpine.version) Alpine.start();
  if (document.querySelector(`template[data-tpl="${TPL_KEY}"]`)) return;
  const tpl = document.createElement('template');
  tpl.setAttribute('data-tpl', TPL_KEY);
  tpl.innerHTML = '<div x-data="descriptorTest"><span class="dt-title" x-text="model.title"></span></div>';
  document.body.append(tpl);
}

function fakeContext(saved) {
  return {
    instanceId: 'dt-1',
    stateManager: { getModuleState: () => saved, setModuleState: () => {} },
    i18n: { t: (k) => k, tf: () => (k) => k, getLanguage: () => 'de' },
    eventBus: { on: () => {}, emit: () => {} },
    theme: 'light',
    language: 'de',
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

suite('createModule mit descriptor (neue Form)', () => {
  test('Felder aus module.js an der Instanz, Template aus resources/view.html', async () => {
    ensureTemplate();
    const mod = createModule({ descriptor: DESCRIPTOR, config: { actions: [] }, Model: Note, data: () => ({}) });
    assertEqual(mod.id, ID);
    assertEqual(mod.version, '2.1.0');
    assertEqual(mod.icon, 'module.sipoc');
    assertEqual(mod.phase, 'define');
    assertEqual(mod.i18nKey, `modules.${ID}`);
    const container = document.createElement('div');
    document.body.append(container);
    await mod.init(container, fakeContext({ title: 'Hallo' }));
    await flush();
    assertEqual(container.querySelector('.dt-title').textContent, 'Hallo');
    assertTrue(container.id.startsWith(`${ID}-`));
    container.remove();
  });

  test('config mit Feldern aus module.js oder engine/meta/templateUrl wirft', () => {
    for (const key of ['id', 'version', 'icon', 'phase', 'allowedPhases', 'engine', 'meta', 'templateUrl']) {
      assertThrows(
        () => createModule({ descriptor: DESCRIPTOR, config: { [key]: 'x' }, Model: Note, data: () => ({}) }),
        new RegExp(`^createModule ${ID}: config\\.${key} `),
      );
    }
  });

  test('alte Form unverändert: ohne descriptor zählt config', () => {
    const mod = createModule({ config: { id: 'alt-form', engine: 'alpine', version: '1.0.0', phase: 'data',
      templateUrl: new URL(TPL_KEY, document.baseURI).href }, Model: Note, data: () => ({}) });
    assertEqual(mod.id, 'alt-form');
    assertEqual(mod.engine, 'alpine');
  });
});
