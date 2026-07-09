// app/dev/tests/core/router/router.test.js
import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import { Router } from '../../../js/core/router/router.js';

function harness(initialHash = '') {
  const emitted = [];
  const fakeWin = {
    location: { hash: initialHash },
    history: {
      pushState(s, t, url) { fakeWin.location.hash = url.replace(/^[^#]*/, ''); fakeWin._last = 'push'; },
      replaceState(s, t, url) { fakeWin.location.hash = url.replace(/^[^#]*/, ''); fakeWin._last = 'replace'; },
    },
    _listeners: {},
    addEventListener(evt, fn) { fakeWin._listeners[evt] = fn; },
    _last: null,
  };

  let activePhase = null;
  let activeModule = null;
  const deps = {
    stateManager: {
      _phases: { define: [{ instanceId: 'i1', moduleId: 'sipoc' }], measure: [] },
      get(key) {
        if (key === 'phases') return Object.fromEntries(Object.keys(this._phases).map(k => [k, this._phases[k]]));
        const m = key.match(/^phases\.(.+)$/);
        if (m) return this._phases[m[1]] ?? null;
        return null;
      },
      set(key, val) {
        const m = key.match(/^phases\.(.+)$/);
        if (m) this._phases[m[1]] = val;
      },
      switchProject() {},
      getProjectCycle() { return 'dmaic'; },
    },
    moduleRegistry: {
      setActiveCycle() {},
      getActiveCycle() { return 'dmaic'; },
    },
    eventBus: {
      emit(name, payload) { emitted.push({ n: name, p: payload }); },
      on() {},
      off() {},
    },
    dmaicTiles: {
      selectPhase(p) { activePhase = p; },
      getActivePhase() { return activePhase; },
    },
    workspace: {
      getActiveModuleInfo: () => activeModule,
    },
    pages: new Map([['settings', { shown: false, async show() { this.shown = true; }, hide() { this.shown = false; } }]]),
    Alpine: { store: () => ({}) },
    win: fakeWin,
  };
  return {
    deps, emitted, fakeWin,
    getActivePhase: () => activePhase,
    setActiveModule: (m) => { activeModule = m; },
  };
}

suite('router/Router', () => {
  test('navigate(module): selects derived phase emits module:activated', async () => {
    const h = harness();
    const r = new Router(h.deps);
    await r.navigate({ kind: 'module', projectId: 'ab12', instanceId: 'i1', sub: ['scatter'] });
    assertEqual(h.getActivePhase(), 'define'); // derived from i1's phase
    assertTrue(h.emitted.some(e => e.n === 'module:activated' && e.p.instanceId === 'i1'));
    assertEqual(h.fakeWin.location.hash, '#/project/ab12/module/i1/scatter');
  });

  test('navigate(module): already-active module → sub change only, no re-activation', async () => {
    const h = harness();
    h.setActiveModule({ instanceId: 'i1', moduleId: 'sipoc', instance: {} });
    const r = new Router(h.deps);
    await r.navigate({ kind: 'module', projectId: 'ab12', instanceId: 'i1', sub: ['residuals'] });
    // Hash (sub) still updates, but no module:activated re-emit (no re-render).
    assertEqual(h.fakeWin.location.hash, '#/project/ab12/module/i1/residuals');
    assertEqual(h.emitted.some(e => e.n === 'module:activated'), false);
  });

  test('navigate(phase): selects phase, no module event', async () => {
    const h = harness();
    const r = new Router(h.deps);
    await r.navigate({ kind: 'phase', projectId: 'ab12', phaseId: 'measure' });
    assertEqual(h.getActivePhase(), 'measure');
    assertEqual(h.fakeWin.location.hash, '#/project/ab12/phase/measure');
  });

  test('navigate(page): shows page overlay', async () => {
    const h = harness();
    const r = new Router(h.deps);
    await r.navigate({ kind: 'page', projectId: 'ab12', pageId: 'settings', sub: [] });
    assertTrue(h.deps.pages.get('settings').shown);
    assertEqual(h.fakeWin.location.hash, '#/project/ab12/page/settings');
  });

  test('navigate replace=true uses replaceState', async () => {
    const h = harness();
    const r = new Router(h.deps);
    await r.navigate({ kind: 'phase', projectId: 'ab12', phaseId: 'measure' }, { replace: true });
    assertEqual(h.fakeWin._last, 'replace');
  });

  test('navigate replace=false (default) uses pushState', async () => {
    const h = harness();
    const r = new Router(h.deps);
    await r.navigate({ kind: 'phase', projectId: 'ab12', phaseId: 'measure' });
    assertEqual(h.fakeWin._last, 'push');
  });

  test('applyHash: parses hash and applies route without writing', async () => {
    const h = harness('#/project/ab12/phase/measure');
    const r = new Router(h.deps);
    await r.applyHash();
    assertEqual(h.getActivePhase(), 'measure');
    // hash must not be changed
    assertEqual(h.fakeWin.location.hash, '#/project/ab12/phase/measure');
    assertEqual(h.fakeWin._last, null);
  });

  test('start: registers hashchange listener and applies initial hash', async () => {
    const h = harness('#/project/ab12/phase/define');
    const r = new Router(h.deps);
    await r.start();
    assertEqual(h.getActivePhase(), 'define');
    assertTrue(typeof h.fakeWin._listeners['hashchange'] === 'function');
  });

  test('re-entrancy guard: nested navigate is ignored', async () => {
    const h = harness();
    // Intercept selectPhase to trigger a nested navigate
    let nested = false;
    const origSelect = h.deps.dmaicTiles.selectPhase.bind(h.deps.dmaicTiles);
    const r = new Router(h.deps);
    h.deps.dmaicTiles.selectPhase = async (p) => {
      origSelect(p);
      if (!nested) {
        nested = true;
        // This inner navigate should be silently dropped
        await r.navigate({ kind: 'phase', projectId: 'ab12', phaseId: 'control' });
      }
    };
    await r.navigate({ kind: 'phase', projectId: 'ab12', phaseId: 'measure' });
    // Phase must be 'measure' — 'control' was dropped by guard
    assertEqual(h.getActivePhase(), 'measure');
  });

  test('navigate(module-new): creates instance and replaceState-redirects to module/<id>', async () => {
    const h = harness();
    // make registry return a real def for 'ce-matrix' and an empty 'extras' bucket
    h.deps.moduleRegistry.get = (id) => (id === 'ce-matrix' ? { phase: 'analyze', cycles: { dmaic: { phase: 'analyze' } } } : undefined);
    h.deps.stateManager._phases.analyze = [];
    const r = new Router(h.deps);
    await r.navigate({ kind: 'module-new', projectId: 'ab12', moduleType: 'ce-matrix' });
    assertEqual(h.deps.stateManager._phases.analyze.length, 1);
    const newId = h.deps.stateManager._phases.analyze[0].instanceId;
    assertEqual(h.fakeWin.location.hash, `#/project/ab12/module/${newId}`);
    assertEqual(h.fakeWin._last, 'replace');           // redirect must not push history
  });

  test('navigate(module-new): unknown type → project landing (replace)', async () => {
    const h = harness();
    h.deps.moduleRegistry.get = () => undefined;
    const r = new Router(h.deps);
    await r.navigate({ kind: 'module-new', projectId: 'ab12', moduleType: 'bogus' });
    assertEqual(h.fakeWin.location.hash, '#/project/ab12');
    assertEqual(h.fakeWin._last, 'replace');
  });

  test('_hideAllPages: navigate(phase) hides open page overlays', async () => {
    const h = harness();
    // Open the settings page first
    h.deps.pages.get('settings').shown = true;
    const r = new Router(h.deps);
    await r.navigate({ kind: 'phase', projectId: 'ab12', phaseId: 'define' });
    // The settings page must have been hidden
    assertEqual(h.deps.pages.get('settings').shown, false);
  });

  test('navigate(phase): forwards (replace) to the first module when the phase has one', async () => {
    const h = harness();
    h.deps.stateManager._phases.measure = [{ instanceId: 'm1', moduleId: 'process-capability' }];
    const r = new Router(h.deps);
    await r.navigate({ kind: 'phase', projectId: 'ab12', phaseId: 'measure' });
    assertEqual(h.getActivePhase(), 'measure');                 // phase still selected
    assertEqual(h.fakeWin.location.hash, '#/project/ab12/module/m1');
    assertEqual(h.fakeWin._last, 'replace');
  });

  test('navigate(phase): empty phase stays on the phase URL (no forward)', async () => {
    const h = harness();
    h.deps.stateManager._phases.measure = [];
    const r = new Router(h.deps);
    await r.navigate({ kind: 'phase', projectId: 'ab12', phaseId: 'measure' });
    assertEqual(h.fakeWin.location.hash, '#/project/ab12/phase/measure');
  });

  test('navigate(module-new): always creates a NEW instance even when one of the type exists', async () => {
    const h = harness();
    h.deps.moduleRegistry.get = (id) => (id === 'sipoc' ? { phase: 'define', cycles: { dmaic: { phase: 'define' } } } : undefined);
    // seed an existing sipoc instance
    h.deps.stateManager._phases.define = [{ instanceId: 'old', moduleId: 'sipoc' }];
    const r = new Router(h.deps);
    await r.navigate({ kind: 'module-new', projectId: 'ab12', moduleType: 'sipoc' });
    // a second sipoc instance must now exist (2 total), and the hash points at the NEW one
    assertEqual(h.deps.stateManager._phases.define.length, 2);
    const ids = h.deps.stateManager._phases.define.map(i => i.instanceId);
    const newId = ids.find(id => id !== 'old');
    assertEqual(h.fakeWin.location.hash, `#/project/ab12/module/${newId}`);
    assertEqual(h.fakeWin._last, 'replace');
  });
});
