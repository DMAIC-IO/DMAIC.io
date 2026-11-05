/**
 * Hilfe und Referenzen der Module in neuer Form über die Registries
 * (help-registry.js, references-registry.js) und module.describe.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import { getModuleHelp, hasModuleHelp, connectHelpResources } from '../../js/core/help-registry.js';
import { getModuleReferences, hasModuleReferences, connectReferenceResources } from '../../js/core/references-registry.js';
import { describeModule } from '../../js/core/agent/agent-catalog.js';
import { I18n } from '../../js/core/i18n.js';

/** Attrappe von ModuleResources: `neu` hat Hilfe und Referenzen, `ohne` nichts. */
function fakeResources() {
  const asked = [];
  const files = { neu: new Set(['i18n/help.de.json', 'i18n/help.en.json', 'data/references.json']), ohne: new Set() };
  return {
    asked,
    url: (id, file) => (files[id]?.has(file) ? `u/${id}/${file}` : undefined),
    help: async (id, lang) => { asked.push(`${id}:${lang}`); return { moduleId: id, sections: { overview: { [lang]: { title: `T-${lang}`, blocks: [] } } } }; },
    references: async (id) => [{ id: `${id}-ref` }],
  };
}

function withResources(fn) {
  const r = fakeResources();
  connectHelpResources(r);
  connectReferenceResources(r);
  return Promise.resolve().then(() => fn(r)).finally(() => { connectHelpResources(null); connectReferenceResources(null); });
}

suite('Registries: Module in neuer Form', () => {
  test('ohne Verbindung kennt die Registry nur die alte Form', async () => {
    assertEqual(hasModuleHelp('neu'), false);
    assertEqual(await getModuleHelp('neu', 'de'), null);
    assertEqual(hasModuleReferences('neu'), false);
    assertDeepEqual(await getModuleReferences('neu'), []);
    assertEqual(hasModuleHelp('pareto'), true, 'alte Form');
  });

  test('hasModuleHelp/hasModuleReferences lesen die Liste; getModuleHelp reicht die Sprache durch', () => withResources(async (r) => {
    assertTrue(hasModuleHelp('neu'));
    assertTrue(hasModuleReferences('neu'));
    assertEqual(hasModuleHelp('ohne'), false);
    assertEqual(hasModuleReferences('ohne'), false);
    assertEqual((await getModuleHelp('neu', 'en')).sections.overview.en.title, 'T-en');
    assertDeepEqual(r.asked, ['neu:en']);
    assertDeepEqual((await getModuleReferences('neu')).map((x) => x.id), ['neu-ref']);
  }));

  test('neue Form ohne Sprache: en', () => withResources(async (r) => {
    await getModuleHelp('neu');
    assertDeepEqual(r.asked, ['neu:en']);
  }));

  test('alte Form gewinnt und fragt ModuleResources nicht', () => withResources(async (r) => {
    assertEqual((await getModuleHelp('pareto', 'de')).moduleId, 'pareto');
    assertDeepEqual(r.asked, []);
  }));

  test('module.describe: Abschnittsliste und Prosa aus der Hilfe der aktiven Sprache', () => withResources(async () => {
    const i18n = new I18n('en');
    i18n._cache.set('en', {});
    const defs = [{ id: 'neu', form: 'module', phase: 'define', cycles: { dmaic: { phase: 'define' } } }];
    const moduleRegistry = { get: (id) => defs.find((d) => d.id === id), getAll: () => defs, getActiveCycle: () => 'dmaic' };
    const out = await describeModule({ moduleRegistry, i18n, registry: {}, getHelp: (id) => getModuleHelp(id, i18n.getLanguage()) }, 'neu', ['overview']);
    assertDeepEqual(out.sections, [{ id: 'overview', title: 'T-en' }]);
    assertEqual(out.prose.overview.title, 'T-en');
  }));
});
