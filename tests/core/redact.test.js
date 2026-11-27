/**
 * Kern: Lese-/Export-Umformung je Modul (`redact`, Deskriptor-Haken).
 * `redactModuleStates` ordnet jeder Instanz über `phases` (sonst
 * `_schema.name`) ihr Modul zu und wendet dessen Haken an.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import { redactModuleStates, redactState, instanceModuleIds } from '../../js/core/redact.js';

const hide = (s) => ({ ...s, token: s.token ? '••••' : s.token });
const redactorOf = (id) => (id === 'geheim' ? hide : null);

const PHASES = {
  data: [{ instanceId: 'a', moduleId: 'geheim' }],
  define: [{ instanceId: 'b', moduleId: 'offen' }],
};

suite('core/redact', () => {
  test('instanceModuleIds: Instanz → Modul über alle Phasen', () => {
    assertDeepEqual([...instanceModuleIds(PHASES)], [['a', 'geheim'], ['b', 'offen']]);
    assertDeepEqual([...instanceModuleIds(undefined)], []);
    assertDeepEqual([...instanceModuleIds({ x: 'kaputt', y: [null, { instanceId: 'c' }] })], []);
  });

  test('redactModuleStates: nur Module mit Haken, Eingabe unverändert', () => {
    const states = { a: { token: 'abc', n: 1 }, b: { token: 'xyz' } };
    const before = structuredClone(states);
    const out = redactModuleStates(states, PHASES, redactorOf);
    assertDeepEqual(out, { a: { token: '••••', n: 1 }, b: { token: 'xyz' } });
    assertDeepEqual(states, before, 'Eingabe nicht verändert');
    assertTrue(out.b === states.b, 'ohne Haken derselbe Stand');
  });

  test('redactModuleStates: Instanz ohne Phase über _schema.name', () => {
    const out = redactModuleStates({ z: { _schema: { name: 'geheim', version: '1.0' }, token: 't' } }, {}, redactorOf);
    assertEqual(out.z.token, '••••');
  });

  test('redactModuleStates: leere/fehlende Stände bleiben', () => {
    assertDeepEqual(redactModuleStates(undefined, PHASES, redactorOf), {});
    assertDeepEqual(redactModuleStates({ a: null }, PHASES, redactorOf), { a: null });
  });

  test('redactState: ohne Haken unverändert, Fehler des Lookups schlagen durch', () => {
    const s = { token: 't' };
    assertTrue(redactState('offen', s, redactorOf) === s);
    let err = null;
    try { redactState('geheim', s, () => { throw new Error('nicht geladen'); }); } catch (e) { err = e; }
    assertEqual(err?.message, 'nicht geladen');
  });
});
