/**
 * Tests for js/startup/worksheet-preload.js — Vorladen des Arbeitsblatt-Codes,
 * damit `readSync` (und damit die Fassade) Daten liefert, ohne dass ein
 * Arbeitsblatt eingehängt ist.
 */
import { suite, test, assertEqual } from '../test-utils.js';
import { installWorksheetPreload } from '../../js/startup/worksheet-preload.js';

/** Bus mit synchronem emit. */
function makeBus() {
  const handlers = new Map();
  return {
    on(ev, fn) { if (!handlers.has(ev)) handlers.set(ev, []); handlers.get(ev).push(fn); },
    emitted: [],
    emit(ev, p) { this.emitted.push([ev, p]); for (const fn of handlers.get(ev) ?? []) fn(p); },
  };
}

/**
 * @param {{ worksheet?: boolean, loaded?: boolean }} [opts]
 */
function makeCtx({ worksheet = false, loaded = false } = {}) {
  let phases = {
    data: worksheet ? [{ instanceId: 'ws1', moduleId: 'worksheet' }] : [],
    analyze: [{ instanceId: 'h1', moduleId: 'histogram' }],
  };
  const registry = {
    loads: [],
    loadedObj: loaded ? { id: 'worksheet' } : null,
    getLoaded(id) { return id === 'worksheet' ? this.loadedObj : null; },
    async loadModule(id) {
      this.loads.push(id);
      await Promise.resolve();
      this.loadedObj = { id };
      return this.loadedObj;
    },
  };
  const bumps = [];
  return {
    bumps,
    registry,
    setPhases(next) { phases = next; },
    ctx: {
      moduleRegistry: registry,
      eventBus: makeBus(),
      stateManager: {
        get(path) {
          if (path === 'phases') return phases;
          if (path.startsWith('phases.')) return phases[path.slice(7)];
          return undefined;
        },
      },
    },
    bump: () => bumps.push(1),
  };
}

suite('startup/worksheet-preload — dataChanged', () => {
  test('nach dem Laden: je Instanz ein worksheet:dataChanged mit instanceId und reason preload', async () => {
    const h = makeCtx({ worksheet: true });
    await installWorksheetPreload(h.ctx, { bump: h.bump });
    const ev = h.ctx.eventBus.emitted.filter(([e]) => e === 'worksheet:dataChanged');
    assertEqual(JSON.stringify(ev), JSON.stringify([['worksheet:dataChanged', { instanceId: 'ws1', reason: 'preload' }]]));
  });

  test('schon geladen: kein Ereignis', async () => {
    const h = makeCtx({ worksheet: true, loaded: true });
    await installWorksheetPreload(h.ctx, { bump: h.bump });
    assertEqual(h.ctx.eventBus.emitted.length, 0);
  });
});

const settle = () => new Promise((r) => setTimeout(r, 0));

suite('startup/worksheet-preload', () => {
  test('Projekt mit Arbeitsblatt: lädt worksheet einmal, danach ein bump', async () => {
    const t = makeCtx({ worksheet: true });
    await installWorksheetPreload(t.ctx, { bump: t.bump });
    assertEqual(t.registry.loads.length, 1);
    assertEqual(t.registry.loads[0], 'worksheet');
    assertEqual(t.bumps.length, 1);
  });

  test('Projekt ohne Arbeitsblatt: kein Laden, kein bump', async () => {
    const t = makeCtx();
    await installWorksheetPreload(t.ctx, { bump: t.bump });
    assertEqual(t.registry.loads.length, 0);
    assertEqual(t.bumps.length, 0);
  });

  test('module:added { moduleId: worksheet } lädt; andere Module nicht', async () => {
    const t = makeCtx();
    await installWorksheetPreload(t.ctx, { bump: t.bump });
    t.ctx.eventBus.emit('module:added', { moduleId: 'histogram', instanceId: 'h2' });
    await settle();
    assertEqual(t.registry.loads.length, 0);
    t.ctx.eventBus.emit('module:added', { moduleId: 'worksheet', instanceId: 'ws2' });
    await settle();
    assertEqual(t.registry.loads.length, 1);
    assertEqual(t.bumps.length, 1);
  });

  test('schon geladen: kein Laden, kein bump', async () => {
    const t = makeCtx({ worksheet: true, loaded: true });
    await installWorksheetPreload(t.ctx, { bump: t.bump });
    t.ctx.eventBus.emit('module:added', { moduleId: 'worksheet', instanceId: 'ws2' });
    await settle();
    assertEqual(t.registry.loads.length, 0);
    assertEqual(t.bumps.length, 0);
  });

  for (const ev of ['project:switched', 'project:imported', 'project:rehydrated']) {
    test(`${ev}: lädt, wenn das neue Projekt ein Arbeitsblatt hat`, async () => {
      const t = makeCtx();
      await installWorksheetPreload(t.ctx, { bump: t.bump });
      t.ctx.eventBus.emit(ev, {});
      await settle();
      assertEqual(t.registry.loads.length, 0, 'ohne Arbeitsblatt kein Laden');
      t.setPhases({ data: [{ instanceId: 'ws9', moduleId: 'worksheet' }] });
      t.ctx.eventBus.emit(ev, {});
      await settle();
      assertEqual(t.registry.loads.length, 1);
      assertEqual(t.bumps.length, 1);
    });
  }

  test('gleichzeitige Auslöser laden nur einmal', async () => {
    const t = makeCtx();
    await installWorksheetPreload(t.ctx, { bump: t.bump });
    t.ctx.eventBus.emit('module:added', { moduleId: 'worksheet', instanceId: 'a' });
    t.ctx.eventBus.emit('module:added', { moduleId: 'worksheet', instanceId: 'b' });
    await settle();
    assertEqual(t.registry.loads.length, 1);
    assertEqual(t.bumps.length, 1);
  });
});

suite('startup/worksheet-preload — gescheitertes Laden', () => {
  test('loadModule scheitert: kein bump, kein dataChanged; der nächste Auslöser lädt erneut', async () => {
    const t = makeCtx({ worksheet: true });
    let fail = true;
    const realLoad = t.registry.loadModule.bind(t.registry);
    t.registry.loadModule = async (id) => {
      if (fail) { t.registry.loads.push(id); throw new Error('chunk failed'); }
      return realLoad(id);
    };
    const realError = console.error;
    const errors = [];
    console.error = (...a) => errors.push(a);
    try {
      await installWorksheetPreload(t.ctx, { bump: t.bump });
    } finally {
      console.error = realError;
    }
    assertEqual(t.registry.loads.length, 1);
    assertEqual(t.bumps.length, 0);
    assertEqual(t.ctx.eventBus.emitted.filter(([e]) => e === 'worksheet:dataChanged').length, 0);
    assertEqual(errors.length, 1);
    fail = false;
    t.ctx.eventBus.emit('project:rehydrated', {});
    await settle();
    await settle();
    assertEqual(t.registry.loads.length, 2);
    assertEqual(t.bumps.length, 1);
    assertEqual(t.ctx.eventBus.emitted.filter(([e]) => e === 'worksheet:dataChanged').length, 1);
  });
});
