/**
 * Tests für den Einstellungsabschnitt „KI-Agenten" (pages/settings/settings-agent.js).
 *
 * Kern ist die Reaktivität (Ruling K2): Schreibzugriffe unter `settings.`
 * emittieren kein `data:changed`, und die Alpine-data()-Fabrik läuft nur beim
 * ersten Mount. Der Abschnitt muss deshalb auf `agent:consent-changed` hören.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { agentSettingsData } from '../../js/pages/settings/settings-agent.js';
import { CONSENT_PATH, grantConsent, readConsent } from '../../js/core/agent/agent-consent.js';
import { AGENT_COVERAGE } from '../../js/core/agent/agent-registry.generated.js';

/** Minimaler stateManager: nur get/set auf flachen Pfaden. */
function fakeState(initial = {}) {
  const store = { ...initial };
  return {
    store,
    get(path) { return store[path]; },
    set(path, value) { store[path] = value; },
  };
}

/** Minimaler eventBus mit on/off/emit (Set-Semantik wie core/event-bus.js). */
function fakeBus() {
  const map = new Map();
  return {
    map,
    on(ev, cb) { if (!map.has(ev)) map.set(ev, new Set()); map.get(ev).add(cb); },
    off(ev, cb) { map.get(ev)?.delete(cb); },
    emit(ev, ...args) { map.get(ev)?.forEach(cb => cb(...args)); },
    count(ev) { return map.get(ev)?.size ?? 0; },
  };
}

const i18n = { t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key) };

/** @param {object} [opts] */
function build(opts = {}) {
  const stateManager = opts.stateManager ?? fakeState();
  const eventBus = opts.eventBus ?? fakeBus();
  const notified = [];
  const data = agentSettingsData({
    stateManager,
    i18n,
    eventBus,
    notify: (msg, kind) => notified.push([msg, kind]),
  });
  return { data, stateManager, eventBus, notified };
}

suite('settings agent section', () => {
  test('ohne Einwilligung ist agentGranted false und der Status "nicht erteilt"', () => {
    const { data } = build();
    assertEqual(data.agentGranted, false);
    assertEqual(data.agentStatusText(), 'agent.settings.statusDenied');
  });

  test('mit gespeicherter Einwilligung startet der Abschnitt auf "erlaubt"', () => {
    const stateManager = fakeState({ [CONSENT_PATH]: { granted: true, at: 'x', contract: 1 } });
    const { data } = build({ stateManager });
    assertEqual(data.agentGranted, true);
    assertEqual(data.agentStatusText(), 'agent.settings.statusGranted');
  });

  test('die Abdeckung nennt freigegebene Module und Gesamtzahl aus der Registry', () => {
    const { data } = build();
    assertEqual(data.agentCoverage, `agent.settings.coverage:${JSON.stringify(AGENT_COVERAGE)}`);
  });

  test('die Beschriftungen kommen aus dem agent.settings-Teilbaum', () => {
    const { data } = build();
    assertEqual(data.agentTitle, 'agent.settings.title');
    assertEqual(data.agentHint, 'agent.settings.hint');
    assertEqual(data.agentRevokeLabel, 'agent.settings.revoke');
  });

  test('Widerruf löscht die Einwilligung, blendet den Knopf aus und meldet es', () => {
    const stateManager = fakeState({ [CONSENT_PATH]: { granted: true, at: 'x', contract: 1 } });
    const { data, notified } = build({ stateManager });
    data.revokeAgentConsent();
    assertEqual(readConsent(stateManager).granted, false);
    assertEqual(data.agentGranted, false);
    assertDeepEqual(notified, [['agent.settings.revoked', 'success']]);
  });

  // ── Ruling K2: Reaktivität ───────────────────────────────────────────
  test('eine Erteilung nach dem Mount aktualisiert den Abschnitt (Ruling K2)', () => {
    const { data, stateManager, eventBus } = build();
    data.agentInit();
    assertEqual(data.agentGranted, false);
    grantConsent(stateManager, eventBus);        // feuert agent:consent-changed
    assertEqual(data.agentGranted, true);
    assertEqual(data.agentStatusText(), 'agent.settings.statusGranted');
  });

  test('ein Widerruf von außen aktualisiert den Abschnitt ebenfalls', () => {
    const stateManager = fakeState({ [CONSENT_PATH]: { granted: true, at: 'x', contract: 1 } });
    const { data, eventBus } = build({ stateManager });
    data.agentInit();
    eventBus.emit('agent:consent-changed', { granted: false });
    assertEqual(data.agentGranted, false);
  });

  test('agentInit liest den Stand neu ein (Re-Init nach Sprachwechsel)', () => {
    const stateManager = fakeState();
    const { data } = build({ stateManager });
    stateManager.set(CONSENT_PATH, { granted: true, at: 'x', contract: 1 });
    data.agentInit();
    assertEqual(data.agentGranted, true);
  });

  test('der Abschnitt bietet kein Briefing mehr an — der Agententext lebt nur in interact()', () => {
    const { data } = build();
    assertEqual('openAgentBriefing' in data, false);
    assertEqual('agentBriefingLabel' in data, false);
  });

  test('agentDestroy meldet das Abonnement ab — kein doppelter Listener nach Re-Mount', () => {
    const { data, eventBus } = build();
    data.agentInit();
    assertEqual(eventBus.count('agent:consent-changed'), 1);
    data.agentDestroy();
    assertEqual(eventBus.count('agent:consent-changed'), 0);
    eventBus.emit('agent:consent-changed', { granted: true });
    assertEqual(data.agentGranted, false);
  });
});
