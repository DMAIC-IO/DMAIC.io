/**
 * Tests für Workspace._ensureInstantiated / whenInstanceReady.
 *
 * Jede Aktivierung läuft über fire-and-forget-Events (`module:added`,
 * `module:activated` → `_activateTab`). Wer das Einhängen auslöst, kann sein
 * Ende daher nicht über den eigenen Aufrufstapel abwarten — er braucht einen
 * Griff darauf. Fehlte der, meldete die Agentenfläche ein `instance.call`
 * direkt nach `module.add` als `unknown_instance`, obwohl die Hülle der
 * Instanz schon im DOM stand.
 */
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { Workspace } from '../../js/ui/workspace.js';

/**
 * Minimaler Workspace ohne Render: nur der Einhängepfad wird geprüft.
 * `instantiate` löst erst auf, wenn der Test `release()` ruft — so ist die
 * laufende Einhängung ein kontrollierter Zustand und keine Rennbedingung.
 */
function makeWorkspace({ reject = false } = {}) {
  let release;
  const calls = [];
  const ws = Object.create(Workspace.prototype);
  ws._instances = new Map();
  ws._containers = new Map();
  ws._pending = new Map();
  ws._moduleArea = document.createElement('div');
  ws._stateManager = {
    get: (path) => (path === 'phases.define' ? [{ instanceId: 'i1', moduleId: 'five-why' }] : undefined),
    getModuleState: () => null,
  };
  ws._activePhase = 'define';
  ws._buildContext = () => ({});
  ws._moduleRegistry = {
    instantiate: (moduleId) => {
      calls.push(moduleId);
      return new Promise((resolve, rejectMount) => {
        release = () => (reject
          ? rejectMount(new Error('Chunk konnte nicht geladen werden'))
          : resolve({ id: moduleId, mounted: true }));
      });
    },
  };
  return { ws, calls, release: () => release() };
}

suite('workspace instance ready', () => {
  test('eine laufende Einhängung wird abgewartet, nicht übersprungen', async () => {
    const { ws, calls, release } = makeWorkspace();
    const first = ws._ensureInstantiated('i1');
    // Die Hülle steht sofort — genau der Zustand, in dem der alte
    // `_containers`-Riegel den zweiten Aufruf leer zurückkommen ließ.
    assertTrue(ws._containers.has('i1'), 'Hülle fehlt');
    assertEqual(ws._instances.has('i1'), false, 'Instanz darf noch nicht leben');

    const second = ws._ensureInstantiated('i1');
    release();
    await Promise.all([first, second]);

    assertEqual(calls.length, 1, 'instantiate wurde mehr als einmal gerufen');
    assertTrue(ws._instances.has('i1'), 'Instanz lebt nach dem Warten nicht');
    assertEqual(ws._pending.has('i1'), false, 'der Eintrag der laufenden Einhängung bleibt liegen');
  });

  test('whenInstanceReady liefert das Viewmodel erst nach dem Einhängen', async () => {
    const { ws, release } = makeWorkspace();
    ws._ensureInstantiated('i1');
    let resolved = null;
    const waiting = ws.whenInstanceReady('i1').then((inst) => { resolved = inst; });
    // Ein Microtask-Durchlauf allein darf nicht reichen: das Einhängen läuft.
    await Promise.resolve();
    assertEqual(resolved, null, 'whenInstanceReady kam zu früh zurück');

    release();
    await waiting;
    assertEqual(resolved?.mounted, true, 'whenInstanceReady lieferte kein lebendes Viewmodel');
  });

  test('whenInstanceReady liefert null für eine Instanz, die nicht eingehängt ist', async () => {
    const { ws } = makeWorkspace();
    assertEqual(await ws.whenInstanceReady('i9'), null);
  });

  test('ein gescheitertes Einhängen räumt auf und endet als null, nicht als Hänger', async () => {
    // `_instantiateModule` fängt den Fehler des Moduls selbst ab (die
    // Fehlerkarte steht dann). Entscheidend ist hier, dass das Warten endet
    // und `_pending` nicht liegen bleibt — ein liegengebliebener Eintrag
    // ließe jedes spätere `whenInstanceReady` auf eine Zusage warten, die
    // nie mehr auflöst.
    const { ws, release } = makeWorkspace({ reject: true });
    const mounting = ws._ensureInstantiated('i1');
    const waiting = ws.whenInstanceReady('i1');
    release();
    await mounting;
    assertEqual(await waiting, null, 'whenInstanceReady lieferte kein null');
    assertEqual(ws._pending.has('i1'), false, 'der Eintrag der Einhängung blieb liegen');
    assertEqual(ws._instances.has('i1'), false, 'eine gescheiterte Einhängung darf nichts eintragen');
  });

  test('nach einem gescheiterten Einhängen wird NICHT erneut eingehängt', async () => {
    // Der Zweig „Hülle da, nichts im Flug, keine Instanz". Ein neuer Versuch
    // gehört nicht hierher: `_instantiateModule` legt die Hülle an, ein
    // zweiter Lauf hinge eine zweite daneben. Der leicht zu verwechselnde
    // Fall — genau deshalb steht er als eigener Test da.
    const { ws, calls, release } = makeWorkspace({ reject: true });
    const first = ws._ensureInstantiated('i1');
    release();
    await first;
    assertTrue(ws._containers.has('i1'), 'die Hülle müsste stehen');
    assertEqual(ws._pending.has('i1'), false, 'nichts darf mehr im Flug sein');

    await ws._ensureInstantiated('i1');
    assertEqual(calls.length, 1, 'instantiate wurde erneut gerufen');
    assertEqual(ws._moduleArea.children.length, 1, 'eine zweite Hülle wurde angelegt');
  });

  test('die Frist bricht das Warten ab, statt die Agentenfläche hängen zu lassen', async () => {
    // Ohne Frist würde ein Einhängen, das nie auflöst (hängender dynamischer
    // Import), `instance.call` nie zurückkommen lassen — und weil
    // `agent-runtime.js` Stapel über eine Warteschlange aufreiht, stünde
    // danach die GANZE Fläche. Die Frist tauscht den Dauerhänger gegen die
    // saubere Absage.
    const { ws } = makeWorkspace();
    ws._ensureInstantiated('i1'); // wird nie freigegeben
    assertEqual(await ws.whenInstanceReady('i1', { timeoutMs: 20 }), null);
    // Die laufende Einhängung bleibt laufen — die Frist gilt für das WARTEN,
    // sie bricht nicht das Einhängen ab.
    assertTrue(ws._pending.has('i1'), 'die Frist hat die Einhängung abgebrochen');
  });
});
