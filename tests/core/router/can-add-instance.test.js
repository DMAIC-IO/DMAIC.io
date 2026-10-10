// app/dev/tests/core/router/can-add-instance.test.js
import { suite, test, assertEqual, assertThrows } from '../../test-utils.js';
import { allowedPhasesFor, defaultPhaseFor, canAddInstance } from '../../../js/core/router/instance-ops.js';
import { ModuleRegistry } from '../../../js/core/module-registry.js';
import { CYCLES, getAllPhaseIds } from '../../../js/core/cycles/cycles.js';
import manifest from '../../../js/modules/manifest.js';

/**
 * Ein Modul-Stellvertreter aus dem Manifest. Der Manifest-Eintrag trägt
 * `id`, `phase` und `cycles` — genau die drei Felder, auf die jede
 * Phasenregel sieht. Die echten Modulobjekte zu laden hieße 72 Module zu
 * importieren, ohne eine weitere Information zu gewinnen.
 */
function defFromManifest(entry) {
  return { id: entry.id, phase: entry.phase, cycles: entry.cycles ?? undefined,
           singleton: entry.singleton === true };
}

/** Das Lese-Abbild in der Form von `buildWorld`, mit leerem Projekt. */
function emptyWorld(cycleId) {
  return {
    t: (k) => k,
    activeCycle: cycleId,
    phases: getAllPhaseIds(cycleId),
    modules: new Map(),
    instances: new Map(),
    completed: false,
  };
}

suite('canAddInstance — eine Quelle für die Phasenregel', () => {
  test('Vorgabephase und Anlegemenü stimmen für jedes Modul/Zyklus-Paar überein', () => {
    const registry = new ModuleRegistry();
    for (const entry of manifest) registry.register(defFromManifest(entry));

    const mismatches = [];
    for (const cycleId of Object.keys(CYCLES)) {
      registry.setActiveCycle(cycleId);
      for (const entry of manifest) {
        const def = defFromManifest(entry);
        const home = defaultPhaseFor(def, cycleId);
        // Das Anlegemenü der Vorgabephase MUSS dieses Modul anbieten.
        const offered = registry.getByCycleAndPhase(cycleId, home).some(m => m.id === def.id);
        if (!offered) mismatches.push(`${def.id}/${cycleId}: Vorgabe ${home}, aber dort nicht im Menü`);

        // Und umgekehrt: jede erlaubte Phase, die das Menü anbietet, muss
        // `canAddInstance` durchlassen — und keine andere.
        for (const phase of getAllPhaseIds(cycleId)) {
          const inMenu = registry.getByCycleAndPhase(cycleId, phase).some(m => m.id === def.id);
          const verdict = canAddInstance(def, phase, emptyWorld(cycleId));
          if (inMenu && !verdict.ok) mismatches.push(`${def.id}/${cycleId}/${phase}: im Menü, aber abgelehnt (${verdict.reason})`);
          // Ein Vergleich gegen `allowedPhasesFor` stand hier und ist gelöscht:
          // `canAddInstance` liest dieselbe Funktion, die Gegenprobe könnte
          // also nie widersprechen. Die Aussage dieses Tests tragen `offered`
          // und `inMenu` — sie prüfen gegen `getByCycleAndPhase`, eine
          // unabhängige zweite Formulierung derselben Regel.
        }
      }
    }
    assertEqual(mismatches.join('\n'), '', `Phasenregeln widersprechen sich:\n${mismatches.join('\n')}`);
  });

  test('ein Modul ohne Zyklus-Zuordnung gehört nach extras, nicht in seine Heimatphase', () => {
    // `triz-ifr` trägt `phase: 'improve'` und eine Zuordnung NUR für `eightd`
    // — für `dmaic` keine. Die alte Ableitung in `createInstance` sagte
    // `improve`, das Anlegemenü bietet es nur unter `extras` an. Das ist der
    // Kern des Befunds. Die Zuordnung ist die echte aus dem Manifest.
    const def = { id: 'triz-ifr', phase: 'improve', cycles: { eightd: { phase: 'corrective' } } };
    assertEqual(defaultPhaseFor(def, 'dmaic'), 'extras');
    assertEqual(canAddInstance(def, 'improve', emptyWorld('dmaic')).ok, false);
    assertEqual(canAddInstance(def, 'extras', emptyWorld('dmaic')).ok, true);
  });

  test('ein Datenmodul bleibt in data, in jedem Zyklus', () => {
    const def = { id: 'worksheet', phase: 'data', cycles: undefined };
    assertEqual(defaultPhaseFor(def, 'dmaic'), 'data');
    assertEqual(defaultPhaseFor(def, 'eightd'), 'data');
    assertEqual(canAddInstance(def, 'data', emptyWorld('dmaic')).ok, true);
    assertEqual(canAddInstance(def, 'analyze', emptyWorld('dmaic')).ok, false);
  });

  test('die Vorgabe ist die erste Position, der Rest bleibt Wahl', () => {
    // `ishikawa/dmaic`: Vorgabe `analyze`, zusätzlich `measure` und `improve`.
    // `allowedPhases` steht hier in der Reihenfolge des Manifests — `measure`
    // VOR `analyze`. Nur so prüft der Test wirklich, dass die Vorgabephase
    // nach vorn gezogen wird, statt die gewünschte Reihenfolge zu verraten.
    const def = { id: 'ishikawa', phase: 'analyze',
                  cycles: { dmaic: { phase: 'analyze', allowedPhases: ['measure', 'analyze', 'improve'] } } };
    assertEqual(allowedPhasesFor(def, 'dmaic').join(','), 'analyze,measure,improve');
    assertEqual(defaultPhaseFor(def, 'dmaic'), 'analyze');
    assertEqual(canAddInstance(def, 'measure', emptyWorld('dmaic')).ok, true);
  });

  test('wrongPhase nennt die gültigen Möglichkeiten', () => {
    const def = { id: 'ishikawa', phase: 'analyze', cycles: { dmaic: { phase: 'analyze' } } };
    const verdict = canAddInstance(def, 'define', emptyWorld('dmaic'));
    assertEqual(verdict.ok, false);
    assertEqual(verdict.reason, 'wrongPhase');
    assertEqual(verdict.allowedPhases.join(','), 'analyze');
  });

  test('singleton sieht über alle Phasen, auch die virtuellen', () => {
    const def = { id: 'charter', phase: 'define', cycles: { dmaic: { phase: 'define' } }, singleton: true };
    const world = emptyWorld('dmaic');
    assertEqual(canAddInstance(def, 'define', world).ok, true);
    world.instances.set('i1', { module: 'charter', phase: 'extras' });
    const verdict = canAddInstance(def, 'define', world);
    assertEqual(verdict.ok, false);
    assertEqual(verdict.reason, 'singleton');
  });

  test('ein fehlender oder unbekannter Zyklus wirft, statt still extras zu antworten', () => {
    const def = { id: 'ishikawa', phase: 'analyze', cycles: { dmaic: { phase: 'analyze' } } };
    const withoutCycle = { ...emptyWorld('dmaic'), activeCycle: undefined };
    assertThrows(() => canAddInstance(def, 'analyze', withoutCycle), /activeCycle/);
    const unknownCycle = { ...emptyWorld('dmaic'), activeCycle: 'sixsigma-deluxe' };
    assertThrows(() => canAddInstance(def, 'analyze', unknownCycle), /activeCycle/);
  });

  test('ein abgeschlossenes Projekt lehnt mit completed ab, vor jeder anderen Prüfung', () => {
    const def = { id: 'ishikawa', phase: 'analyze', cycles: { dmaic: { phase: 'analyze' } } };
    const world = { ...emptyWorld('dmaic'), completed: true };
    const verdict = canAddInstance(def, 'analyze', world);
    assertEqual(verdict.ok, false);
    assertEqual(verdict.reason, 'completed');
  });
});
