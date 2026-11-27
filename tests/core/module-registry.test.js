/**
 * Tests for js/core/module-registry.js
 */
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { ModuleRegistry } from '../../js/core/module-registry.js';
import { DEFAULT_CYCLE } from '../../js/core/cycles/cycles.js';

const noopLoad = () => Promise.resolve({ default: {} });

suite('ModuleRegistry', () => {
  // ─── Basics ───────────────────────────────────────────────────

  test('register + get: round-trips a module definition', () => {
    const reg = new ModuleRegistry();
    reg.register({ id: 'm1', phase: 'analyze', load: noopLoad });
    assertEqual(reg.get('m1').id, 'm1');
  });

  test('register: warns and ignores duplicate id', () => {
    const reg = new ModuleRegistry();
    reg.register({ id: 'dup', phase: 'analyze', load: noopLoad });
    reg.register({ id: 'dup', phase: 'improve', load: noopLoad });
    // First registration wins.
    assertEqual(reg.get('dup').phase, 'analyze');
  });

  test('getAll: returns every registered module', () => {
    const reg = new ModuleRegistry();
    reg.register({ id: 'a', phase: 'analyze', load: noopLoad });
    reg.register({ id: 'b', phase: 'improve', load: noopLoad });
    assertEqual(reg.getAll().length, 2);
  });

  // ─── Backwards-compat shim (legacy → cycles map) ──────────────

  test('shim: legacy entry without cycles → DMAIC-only mapping', () => {
    const reg = new ModuleRegistry();
    reg.register({
      id: 'legacy',
      phase: 'analyze',
      allowedPhases: ['analyze', 'improve'],
      load: noopLoad,
    });
    const d = reg.get('legacy');
    assertEqual(d.cycles[DEFAULT_CYCLE].phase, 'analyze');
    assertEqual(d.cycles[DEFAULT_CYCLE].allowedPhases.join(','), 'analyze,improve');
  });

  test('shim: data module stays cycle-independent (no cycles map)', () => {
    const reg = new ModuleRegistry();
    reg.register({ id: 'data-mod', phase: 'data', load: noopLoad });
    assertEqual(reg.get('data-mod').cycles, undefined);
  });

  test('shim: explicit cycles map is preserved as-is', () => {
    const reg = new ModuleRegistry();
    reg.register({
      id: 'multi',
      phase: 'improve',
      load: noopLoad,
      cycles: {
        dmaic: { phase: 'improve' },
        dmadv: { phase: 'design' },
      },
    });
    const d = reg.get('multi');
    assertEqual(d.cycles.dmaic.phase, 'improve');
    assertEqual(d.cycles.dmadv.phase, 'design');
  });

  // ─── Active cycle ─────────────────────────────────────────────

  test('active cycle defaults to dmaic', () => {
    const reg = new ModuleRegistry();
    assertEqual(reg.getActiveCycle(), 'dmaic');
  });

  test('setActiveCycle: stores given id', () => {
    const reg = new ModuleRegistry();
    reg.setActiveCycle('dmadv');
    assertEqual(reg.getActiveCycle(), 'dmadv');
  });

  test('setActiveCycle: empty/null falls back to default cycle', () => {
    const reg = new ModuleRegistry();
    reg.setActiveCycle('dmadv');
    reg.setActiveCycle(null);
    assertEqual(reg.getActiveCycle(), 'dmaic');
  });

  // ─── getByCycleAndPhase ───────────────────────────────────────

  test('getByCycleAndPhase: matches modules by cycles[cycleId].phase', () => {
    const reg = new ModuleRegistry();
    reg.register({
      id: 'doe-planner',
      load: noopLoad,
      cycles: { dmaic: { phase: 'improve' }, dmadv: { phase: 'design' } },
    });
    assertEqual(reg.getByCycleAndPhase('dmaic', 'improve').length, 1);
    assertEqual(reg.getByCycleAndPhase('dmadv', 'design').length, 1);
    assertEqual(reg.getByCycleAndPhase('dmadv', 'improve').length, 0);
  });

  test('getByCycleAndPhase("data"): returns all data modules in any cycle', () => {
    const reg = new ModuleRegistry();
    reg.register({ id: 'wks', phase: 'data', load: noopLoad });
    reg.register({ id: 'plt', phase: 'data', load: noopLoad });
    reg.register({ id: 'mtd', phase: 'analyze', load: noopLoad });
    assertEqual(reg.getByCycleAndPhase('dmaic', 'data').length, 2);
    assertEqual(reg.getByCycleAndPhase('dmadv', 'data').length, 2);
  });

  test('getByCycleAndPhase("extras"): catches non-data modules without cycle mapping', () => {
    const reg = new ModuleRegistry();
    reg.register({
      id: 'mapped',
      load: noopLoad,
      cycles: { dmaic: { phase: 'analyze' } },  // no dmadv mapping
    });
    reg.register({ id: 'data-tool', phase: 'data', load: noopLoad });
    // In dmaic: 'mapped' is in 'analyze', extras is empty.
    assertEqual(reg.getByCycleAndPhase('dmaic', 'extras').length, 0);
    // In dmadv: 'mapped' has no mapping → lands in extras.
    // 'data-tool' is data → never in extras.
    const extras = reg.getByCycleAndPhase('dmadv', 'extras');
    assertEqual(extras.length, 1);
    assertEqual(extras[0].id, 'mapped');
  });

  test('getByCycleAndPhase: unknown phase returns empty array', () => {
    const reg = new ModuleRegistry();
    reg.register({
      id: 'm',
      load: noopLoad,
      cycles: { dmaic: { phase: 'improve' } },
    });
    assertEqual(reg.getByCycleAndPhase('dmaic', 'nope').length, 0);
  });

  // ─── getByPhase delegates to active cycle ─────────────────────

  test('getByPhase: delegates to active cycle', () => {
    const reg = new ModuleRegistry();
    reg.register({
      id: 'doe',
      load: noopLoad,
      cycles: { dmaic: { phase: 'improve' }, dmadv: { phase: 'design' } },
    });
    // Default active cycle is dmaic
    assertEqual(reg.getByPhase('improve').length, 1);
    assertEqual(reg.getByPhase('design').length, 0);
    // Switch to dmadv
    reg.setActiveCycle('dmadv');
    assertEqual(reg.getByPhase('improve').length, 0);
    assertEqual(reg.getByPhase('design').length, 1);
  });
  test('loadModule lädt den Default-Export einmal', async () => {
    const reg = new ModuleRegistry();
    let loads = 0;
    const exported = { id: 'lm' };
    reg.register({ id: 'lm', phase: 'define', load: async () => { loads += 1; return { default: exported }; } });
    assertEqual(await reg.loadModule('lm'), exported);
    assertEqual(await reg.loadModule('lm'), exported);
    assertEqual(loads, 1);
  });

  test('getLoaded: null vor dem Laden und für Unbekannte, danach das Modul', async () => {
    const reg = new ModuleRegistry();
    const exported = { id: 'gl' };
    reg.register({ id: 'gl', phase: 'define', load: async () => ({ default: exported }) });
    assertEqual(reg.getLoaded('gl'), null);
    assertEqual(reg.getLoaded('nope'), null);
    await reg.loadModule('gl');
    assertEqual(reg.getLoaded('gl'), exported);
  });

  test('loadModule mit unbekannter Id wirft', async () => {
    const reg = new ModuleRegistry();
    let msg = '';
    try { await reg.loadModule('nope'); } catch (e) { msg = e.message; }
    assertEqual(msg, '[ModuleRegistry] Unknown module: "nope"');
  });
});

suite('ModuleRegistry redact', () => {
  const hide = (s) => ({ ...s, token: '••••' });
  test('redactorOf: ohne Haken null, nach loadRedactors die Funktion', async () => {
    const reg = new ModuleRegistry();
    let calls = 0;
    reg.register({ id: 'a', phase: 'data', load: noopLoad, redact: () => { calls++; return Promise.resolve({ default: hide }); } });
    reg.register({ id: 'b', phase: 'data', load: noopLoad });
    assertEqual(reg.redactorOf('b'), null);
    assertEqual(reg.redactorOf('unbekannt'), null);
    let err = null;
    try { reg.redactorOf('a'); } catch (e) { err = e; }
    assertEqual(err?.message, '[ModuleRegistry] a: redact nicht geladen');
    await reg.loadRedactors();
    await reg.loadRedactors();
    assertEqual(reg.redactorOf('a'), hide);
    assertEqual(calls, 1, 'einmal geladen');
    assertEqual(await reg.loadRedactor('b'), null);
    assertEqual(await reg.loadRedactor('a'), hide);
  });

  test('loadRedactors: ein Haken, der nicht lädt, hält den Start nicht an; redactorOf wirft, erneuter Versuch lädt', async () => {
    const reg = new ModuleRegistry();
    let fail = true;
    reg.register({ id: 'a', phase: 'data', load: noopLoad, redact: () => (fail ? Promise.reject(new Error('chunk')) : Promise.resolve({ default: hide })) });
    reg.register({ id: 'b', phase: 'data', load: noopLoad, redact: () => Promise.resolve({ default: hide }) });
    const origError = console.error;
    const logged = [];
    console.error = (...args) => { logged.push(args[0]); };
    try {
      await reg.loadRedactors();
    } finally {
      console.error = origError;
    }
    assertDeepEqual(logged, ['[ModuleRegistry] a: redact nicht geladen']);
    assertEqual(reg.redactorOf('b'), hide, 'die übrigen Haken sind geladen');
    let err = null;
    try { reg.redactorOf('a'); } catch (e) { err = e; }
    assertEqual(err?.message, '[ModuleRegistry] a: redact nicht geladen');
    fail = false;
    await reg.loadRedactors();
    assertEqual(reg.redactorOf('a'), hide);
  });

  test('loadRedactor: Ziel ohne Default-Funktion wird abgelehnt', async () => {
    const reg = new ModuleRegistry();
    reg.register({ id: 'a', phase: 'data', load: noopLoad, redact: () => Promise.resolve({ default: 5 }) });
    let err = null;
    try { await reg.loadRedactor('a'); } catch (e) { err = e; }
    assertEqual(err?.message, '[ModuleRegistry] a: redact muss eine Funktion exportieren (default)');
  });
});
