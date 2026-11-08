/**
 * Ableitungen im view-Block (core/computed.js) — im Browser (Alpine).
 */
import Alpine from '../../vendor/alpinejs/csp.js';
import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue } from '../test-utils.js';
import { defineComputedSlots, bindComputed } from '../../js/core/computed.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

/** Komponente wie createModule sie baut, ohne DOM. */
function makeVm(defs, extra = {}) {
  const comp = { model: { a: 1, b: 2, mode: 'x' }, ...extra };
  defineComputedSlots(comp, Object.keys(defs));
  const vm = Alpine.reactive(comp);
  const release = bindComputed(Alpine, vm, defs);
  return { vm, release };
}

suite('computed', () => {
  test('rechnet nur bei Änderung einer gelesenen Abhängigkeit', async () => {
    let runs = 0;
    const { vm, release } = makeVm({ sum() { runs += 1; return this.model.a + this.model.b; } });
    assertEqual(vm.sum, 3);
    assertEqual(runs, 1);
    vm.model.mode = 'y';
    await flush();
    assertEqual(runs, 1, 'mode wird nicht gelesen');
    vm.model.a = 10;
    await flush();
    assertEqual(vm.sum, 12);
    assertEqual(runs, 2);
    release();
  });

  test('folgt Verzweigungen', async () => {
    let runs = 0;
    const { vm, release } = makeVm({
      pick() { runs += 1; return this.model.mode === 'x' ? this.model.a : this.model.b; },
    });
    vm.model.b = 5;
    await flush();
    assertEqual(runs, 1, 'b ist im Zweig x nicht gelesen');
    vm.model.mode = 'y';
    await flush();
    assertEqual(vm.pick, 5);
    vm.model.a = 7;
    await flush();
    assertEqual(runs, 2, 'a ist im Zweig y nicht mehr gelesen');
    release();
  });

  test('liest ein anderes computed', async () => {
    const { vm, release } = makeVm({
      sum() { return this.model.a + this.model.b; },
      twice() { return this.sum * 2; },
    });
    assertEqual(vm.twice, 6);
    vm.model.b = 4;
    await flush();
    assertEqual(vm.twice, 10);
    release();
  });

  test('Fehler → { error }, die übrigen laufen weiter', async () => {
    const original = console.error;
    const calls = [];
    console.error = (...args) => { calls.push(args); };
    try {
      const { vm, release } = makeVm({
        bad() { if (this.model.a > 1) throw new Error('kaputt'); return 'ok'; },
        sum() { return this.model.a + this.model.b; },
      });
      vm.model.a = 2;
      await flush();
      assertDeepEqual(JSON.parse(JSON.stringify(vm.bad)), { error: 'kaputt' });
      assertEqual(vm.sum, 4);
      assertEqual(calls.length, 1);
      assertEqual(calls[0][0], '[computed] bad:');
      release();
    } finally {
      console.error = original;
    }
  });

  test('nur lesend', () => {
    const { vm, release } = makeVm({ sum() { return 1; } });
    assertThrows(() => { vm.sum = 2; }, /computed sum is read-only/);
    release();
  });

  test('nach der Freigabe keine Läufe', async () => {
    let runs = 0;
    const { vm, release } = makeVm({ sum() { runs += 1; return this.model.a; } });
    release();
    vm.model.a = 9;
    await flush();
    assertEqual(runs, 1);
    assertTrue(vm.sum === 1, 'der letzte Wert bleibt lesbar');
  });
});
