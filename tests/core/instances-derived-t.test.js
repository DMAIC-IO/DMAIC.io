/**
 * Kerndienst instances: `read` ohne Mount übersetzt die Ableitungen in der
 * aktiven Sprache. Eigene Datei, weil `createModule` Alpine CSP hereinzieht,
 * das beim Import MutationObserver braucht; läuft nur im Browser-Runner.
 */
import { suite, test, assertEqual } from '../test-utils.js';
import { defineModel, number } from '../../js/core/model.js';
import { createModule } from '../../js/core/template-module.js';
import { setup } from '../helpers/instances-setup.js';

suite('instances.read: derived übersetzt', () => {
  const Lbl = defineModel({
    fields: { n: number({ default: 1 }) },
    derived: { label(_s, _d, t) { return t('greet'); } },
  });
  const mod = createModule({
    config: { id: 'sipoc', engine: 'alpine', phase: 'define', templateUrl: 'about:blank' },
    Model: Lbl,
  });
  const texts = { de: 'Hallo', en: 'Hello' };
  const makeI18n = (lang) => ({ getLanguage: () => lang, t: (k) => k, tf: (prefix) => (k) => (prefix === 'modules.sipoc' && k === 'greet' ? texts[lang] : `?${prefix}`) });

  test('read ohne Mount übersetzt in der aktiven Sprache', async () => {
    const saved = { n: 2 };
    const en = setup({ states: { d1: saved }, modules: { sipoc: mod }, i18n: makeI18n('en') });
    assertEqual((await en.svc.read('d1')).label, 'Hello');
    const de = setup({ states: { d1: saved }, modules: { sipoc: mod }, i18n: makeI18n('de') });
    assertEqual((await de.svc.read('d1')).label, 'Hallo');
  });
});
