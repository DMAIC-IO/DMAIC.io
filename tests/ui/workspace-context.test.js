/**
 * Tests für `ctx.instances` im Modulkontext der Workspace: `interact` bindet
 * den Aufrufer und meldet `surface_failed`, solange die Agentenfläche fehlt.
 */
import { suite, test, assertEqual } from '../test-utils.js';
import { Workspace } from '../../js/ui/workspace.js';

/** Minimaler Workspace: nur der Kontextbau wird geprüft. */
function makeWorkspace() {
  return Object.create(Workspace.prototype);
}

suite('workspace ctx.instances.interact', () => {
  /** Workspace mit Dienst, ohne DOM-Aufbau. */
  function makeCtxWorkspace() {
    const ws = makeWorkspace();
    ws._i18n = { getLanguage: () => 'de' };
    ws._context = {};
    ws._instanceService = { list: () => [], read: async () => ({}) };
    return ws;
  }

  test('ctx.instances.interact passes caller', async () => {
    const ws = makeCtxWorkspace();
    const calls = [];
    ws.setModuleInteract(async (stack, caller) => { calls.push({ stack, caller }); return { ok: true, results: [] }; });
    const ctx = ws._buildContext('i7', {}, 'opportunity-flowchart');
    const stack = [{ action: 'instance.call' }];
    const res = await ctx.instances.interact(stack);
    assertEqual(res.ok, true);
    assertEqual(calls.length, 1);
    assertEqual(calls[0].stack, stack);
    assertEqual(calls[0].caller.instanceId, 'i7');
    assertEqual(calls[0].caller.moduleId, 'opportunity-flowchart');
  });

  test('interact before surface ready returns surface_failed', async () => {
    const ws = makeCtxWorkspace();
    const ctx = ws._buildContext('i7', {}, 'sipoc');
    const res = await ctx.instances.interact([]);
    assertEqual(res.ok, false);
    assertEqual(res.error, 'surface_failed');
    assertEqual(typeof res.message, 'string');
  });

  test('ctx.instances is frozen and keeps list/read', () => {
    const ws = makeCtxWorkspace();
    const ctx = ws._buildContext('i7', {}, 'sipoc');
    assertEqual(Object.isFrozen(ctx.instances), true);
    assertEqual(typeof ctx.instances.list, 'function');
    assertEqual(typeof ctx.instances.read, 'function');
  });
});
