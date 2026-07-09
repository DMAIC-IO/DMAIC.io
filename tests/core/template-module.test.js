import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { createModule } from '../../js/core/template-module.js';

suite('createModule — dashboardTile pass-through', () => {
  test('forwards a dashboardTile descriptor onto the default export', () => {
    class M { static fromJSON() { return new M(); } toJSON() { return {}; } hasContent() { return false; } }
    const tile = { defaultW: 3, enumerate: () => [], render: () => {} };
    const mod = createModule({
      config: { id: 'x-mod', engine: 'alpine', phase: 'analyze', meta: import.meta, dashboardTile: tile },
      Model: M, data: () => ({}),
    });
    assertEqual(mod.dashboardTile, tile);
    assertEqual(mod.dashboardTile.defaultW, 3);
  });
});

suite('createModule applyRemoteState', () => {
  // Shared Alpine start (idempotent — safe to call again if already started).
  if (!Alpine.version) Alpine.start();

  // Register a minimal <template data-tpl="..."> for the test module id.
  // templateKey() strips up to '/js/' and returns the relative path.
  const TPL_KEY = 'js/modules/ars-test/ars-test.html';
  if (!document.querySelector(`template[data-tpl="${TPL_KEY}"]`)) {
    const tpl = document.createElement('template');
    tpl.setAttribute('data-tpl', TPL_KEY);
    tpl.innerHTML = '<div x-data="arsTest"><span id="ars-val" x-text="model.value"></span></div>';
    document.body.append(tpl);
  }

  class ArsModel {
    constructor() { this.value = 'initial'; }
    static fromJSON(j) { const m = new ArsModel(); if (j?.value !== undefined) m.value = j.value; return m; }
    toJSON() { return { value: this.value }; }
    hasContent() { return true; }
  }

  function fakeContext(persistCalls) {
    return {
      instanceId: 'ars-test-instance',
      stateManager: {
        getModuleState: () => null,
        setModuleState: (...args) => { persistCalls.push(args); },
      },
      i18n: {
        t: k => k,
        tf: () => k => k,
        getLanguage: () => 'en',
      },
      eventBus: { on: () => {}, emit: () => {} },
      theme: 'light',
      language: 'en',
    };
  }

  test('applyRemoteState mutates live Alpine model without destroy/init', async () => {
    const persistCalls = [];
    const mod = createModule({
      config: { id: 'ars-test', engine: 'alpine', phase: 'analyze', meta: import.meta,
                templateUrl: new URL('js/modules/ars-test/ars-test.html', document.baseURI).href },
      Model: ArsModel,
      data: () => ({}),
    });

    const container = document.createElement('div');
    document.body.append(container);
    await mod.init(container, fakeContext(persistCalls));

    // Capture root BEFORE applyRemoteState.
    const rootBefore = container.querySelector('[x-data]');
    assertTrue(rootBefore !== null, 'root element must exist after init');

    await mod.applyRemoteState({ value: 'remote-value' });

    // (1) The [x-data] root element is the SAME node — no destroy/init.
    const rootAfter = container.querySelector('[x-data]');
    assertEqual(rootBefore, rootAfter);

    // (2) getState() reflects the applied state.
    const state = mod.getState();
    assertEqual(state?.value, 'remote-value');

    // (3) applyRemoteState causes ZERO persist calls.
    // Wait one microtask tick for the queueMicrotask guard to reset, then
    // ensure no persist call happened during the apply window.
    await new Promise(r => queueMicrotask(r));
    const persistDuringApply = persistCalls.filter(
      ([id]) => id === 'ars-test-instance'
    );
    assertEqual(persistDuringApply.length, 0);

    // Cleanup.
    await mod.destroy();
    container.remove();
  });
});
