/**
 * Tests für dialogs/agent-consent — das Dialog-Model und die Übersetzung
 * „Abbruch heißt Ablehnung" in die openDialog-Port-Signatur aus Spec §3.2.
 */
import { suite, test, assertEqual } from '../test-utils.js';
import { Model } from '../../js/dialogs/agent-consent/agent-consent-model.js';
import { openAgentConsent } from '../../js/dialogs/agent-consent/agent-consent-port.js';

suite('agent consent dialog model', () => {
  test('result ist immer true — Zustimmung ist der einzige Bestätigungsausgang', () => {
    assertEqual(new Model().apply({}).result(), true);
  });

  test('validate blockiert nie', () => {
    assertEqual(new Model().apply({}).validate(), true);
  });

  test('apply übernimmt den Namen des anfragenden Projekts für den Dialogtext', () => {
    const m = new Model().apply({ projectName: 'Lagerausfall' });
    assertEqual(m.projectName, 'Lagerausfall');
  });

  test('apply ohne Angaben lässt den Namen leer statt undefined', () => {
    assertEqual(new Model().apply().projectName, '');
  });
});

suite('openAgentConsent', () => {
  const i18n = { t: (key) => key };

  test('Bestätigung ergibt true', async () => {
    const dialog = { open: async () => true };
    assertEqual(await openAgentConsent({ open: () => {} }, i18n, dialog, {}), true);
  });

  test('Abbruch (null) ergibt false — der Abbruch-Knopf IST die Ablehnung', async () => {
    const dialog = { open: async () => null };
    assertEqual(await openAgentConsent({ open: () => {} }, i18n, dialog, {}), false);
  });

  test('übergibt Beschriftungen für Erlauben und Ablehnen', async () => {
    const seen = [];
    const dialog = { open: async (_modal, _init, opts) => { seen.push(opts); return true; } };
    await openAgentConsent({ open: () => {} }, i18n, dialog, { projectName: 'P' });
    assertEqual(seen[0].confirmLabel, 'agent.consent.grant');
    assertEqual(seen[0].cancelLabel, 'agent.consent.deny');
  });

  test('ein werfender Dialog gilt als Ablehnung, nicht als Zustimmung', async () => {
    const dialog = { open: async () => { throw new Error('modal broken'); } };
    assertEqual(await openAgentConsent({ open: () => {} }, i18n, dialog, {}), false);
  });
});
