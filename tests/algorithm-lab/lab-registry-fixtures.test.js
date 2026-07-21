import { suite, test, assertTrue, beforeEach, afterEach } from '../test-utils.js';
import { LabRegistry } from '../../js/algorithm-lab/lab-registry.js';
// Namespace-Import: FIXTURES existiert vor dem Fix noch nicht — ein benannter
// Import würde einen Link-Fehler werfen (Datei würde übersprungen statt rot).
import * as labData from '../../js/algorithm-lab/lab-data.generated.js';

const FIXTURES = labData.FIXTURES;

// Regression guard for Bug 017 — Algorithm Lab "Validierung" zeigt keine Daten + 404.
//
// Alle übrigen Lab-Daten (INDEX/ALGOS/SOURCES/ENGINES) werden vom Generator
// in lab-data.generated.js inlined, damit das Lab ohne Netzwerk-Fetch läuft.
// Die Validierungs-Fixtures waren der einzige Loader, der noch `tests/fixtures/…`
// per fetch() geladen hat. Im eingefrorenen Release (freeze.mjs) wird `tests/`
// NICHT ausgeliefert → 404 → leere Validierung. Fix: Fixtures ebenfalls inlinen
// und bevorzugt aus dem Generat bedienen.

suite('lab-registry: Validierungs-Fixtures sind deploy-sicher inlined', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  test('FIXTURES-Export enthält Validierungsdaten (nicht leer)', () => {
    assertTrue(FIXTURES && typeof FIXTURES === 'object', 'FIXTURES-Export vorhanden');
    assertTrue(Object.keys(FIXTURES).length > 0, 'FIXTURES enthält mindestens einen Algorithmus');
    const cpk = FIXTURES.cpk;
    assertTrue(cpk && Array.isArray(cpk.test_cases) && cpk.test_cases.length > 0,
      'cpk-Fixtures inline mit test_cases vorhanden');
  });

  test('getFixtures liefert Daten auch wenn tests/ 404 liefert (eingefrorenes Release)', async () => {
    const reg = new LabRegistry();
    await reg.loadIndex();
    // Simuliert das eingefrorene Release: das tests/-Verzeichnis wird nicht ausgeliefert.
    globalThis.fetch = async () => ({
      ok: false, status: 404,
      json: async () => { throw new Error('not deployed'); },
    });
    const fx = await reg.getFixtures('cpk');
    assertTrue(fx && Array.isArray(fx.test_cases) && fx.test_cases.length > 0,
      'cpk-Validierungsdaten inline verfügbar (kein tests/-Fetch nötig)');
  });
});
