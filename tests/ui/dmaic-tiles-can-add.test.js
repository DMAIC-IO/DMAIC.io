/**
 * D.Mike — `DmaicTiles._canAdd` ist nur noch ein Durchreicher auf
 * `canAddInstance` (`js/core/router/instance-ops.js`). Diese Zusicherungen
 * halten fest, dass die Kachel keine eigene Phasenregel mehr mitbringt:
 * dasselbe `def`/`phase`-Paar bekommt dieselbe Antwort wie die Agentenfläche.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { DmaicTiles } from '../../js/ui/dmaic-tiles.js';
import { DEFAULT_CYCLE, getAllPhaseIds } from '../../js/core/cycles/cycles.js';

/**
 * Eine Kachelleiste mit einem Zustands-Double, das echte Phaseninhalte führt.
 * @param {object} [options]
 * @param {string} [options.cycleId]
 * @param {Record<string, object[]>} [options.phases]
 * @param {boolean} [options.completed]
 * @param {object[]} [options.modules]  Definitionen, die das Anlegemenü anbietet
 * @returns {{ tiles: DmaicTiles, container: HTMLElement }}
 */
function makeTiles({ cycleId = 'dmaic', phases = {}, completed = false, modules = [] } = {}) {
  const stateManager = {
    get: (key) => {
      if (key === 'projectMeta.cycle') return cycleId;
      if (key === 'phases') return phases;
      const m = /^phases\.(.+)$/.exec(key);
      return m ? phases[m[1]] : null;
    },
    getProjectCycle: () => cycleId,
    isCompleted: () => completed,
  };
  const container = document.createElement('div');
  const tiles = new DmaicTiles(container, {
    eventBus: { on: () => {}, emit: () => {} },
    stateManager,
    i18n: { t: (k) => k, getLanguage: () => 'de' },
    moduleRegistry: {
      getAll: () => modules,
      setActiveCycle: () => {},
      get: (id) => modules.find(m => m.id === id) ?? null,
      getByCycleAndPhase: (_cycle, phaseId) => modules.filter(m => m.menuPhase === phaseId),
    },
  });
  return { tiles, container };
}

suite('DmaicTiles._canAdd', () => {
  test('ein Modul ohne Zyklus-Zuordnung darf nicht in eine Methodik-Phase', () => {
    // `triz-ifr` trägt `phase: 'improve'`, hat aber keine `cycles.dmaic`-
    // Zuordnung: das Anlegemenü führt es nur unter `extras`. Die alte Fassung
    // ließ ohne `allowedPhases` jede Phase durch und sagte hier `ok`.
    const { tiles } = makeTiles();
    const def = { id: 'triz-ifr', phase: 'improve', cycles: { eightd: { phase: 'corrective' } } };

    const check = tiles._canAdd(def, 'improve');

    assertEqual(check.ok, false);
    assertEqual(check.reason, 'wrongPhase');
    assertDeepEqual(check.allowedPhases, ['extras']);
  });

  test('dasselbe Modul darf in die Extras-Kachel', () => {
    const { tiles } = makeTiles();
    const def = { id: 'triz-ifr', phase: 'improve', cycles: { eightd: { phase: 'corrective' } } };

    assertEqual(tiles._canAdd(def, 'extras').ok, true);
  });

  test('die Zusatzphasen der Zuordnung bleiben erlaubt', () => {
    const { tiles } = makeTiles();
    const def = { id: 'ishikawa', phase: 'analyze',
                  cycles: { dmaic: { phase: 'analyze', allowedPhases: ['measure'] } } };

    assertEqual(tiles._canAdd(def, 'analyze').ok, true);
    assertEqual(tiles._canAdd(def, 'measure').ok, true);
    assertEqual(tiles._canAdd(def, 'control').reason, 'wrongPhase');
  });

  test('ein Singleton wird abgewiesen, sobald es irgendwo im Projekt liegt', () => {
    const { tiles } = makeTiles({ phases: { define: [{ instanceId: 'a1', moduleId: 'project-charter' }] } });
    const def = { id: 'project-charter', phase: 'define', singleton: true,
                  cycles: { dmaic: { phase: 'define' } } };

    assertEqual(tiles._canAdd(def, 'define').reason, 'singleton');
  });

  test('im abgeschlossenen Projekt wird gar nichts mehr angelegt', () => {
    const { tiles } = makeTiles({ completed: true });
    const def = { id: 'sipoc', phase: 'define', cycles: { dmaic: { phase: 'define' } } };

    const check = tiles._canAdd(def, 'define');

    assertEqual(check.ok, false);
    assertEqual(check.reason, 'completed');
  });

  test('eine unbekannte Zyklus-Kennung nimmt den Vorgabezyklus, statt das Menü zu sprengen', () => {
    // `projectMeta.cycle` kommt aus gespeicherten oder eingelesenen Projekt-
    // daten und kann einen Zyklus nennen, den es nicht gibt. `canAddInstance`
    // wirft bei einer unbekannten Kennung — gerufen wird es aber in der
    // Schleife, die das Anlegemenü baut. Also degradiert diese Oberfläche wie
    // `getCycle()`: Vorgabezyklus, Menü steht.
    const def = { id: 'sipoc', phase: 'define', menuPhase: 'define',
                  cycles: { dmaic: { phase: 'define' } } };
    const { tiles, container } = makeTiles({ cycleId: 'nicht-existent', modules: [def] });

    tiles.render();

    const rendered = [...container.querySelectorAll('.dmaic-tile')].map(t => t.dataset.phase);
    assertDeepEqual(rendered, getAllPhaseIds(DEFAULT_CYCLE), 'Kacheln des Vorgabezyklus');

    const tile = container.querySelector('.dmaic-tile[data-phase="define"]');
    tiles._showMenu('define', tile);
    const items = [...tile.querySelectorAll('.dmaic-tile__dropdown-item')];
    assertEqual(items.length, 1, 'das Menü ist gebaut worden');
    assertEqual(items[0].disabled, false, 'der Eintrag ist anklickbar');
    tiles._closeMenu();
  });
});
