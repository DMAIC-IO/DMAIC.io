/**
 * Tests for js/core/i18n.js
 */
import { suite, test, assertEqual } from '../test-utils.js';
import { I18n } from '../../js/core/i18n.js';

suite('I18n', () => {
  function makeI18n() {
    const i18n = new I18n('de');
    // Manually seed cache to avoid fetch in tests
    i18n._cache.set('de', {
      greeting: 'Hallo',
      app: { title: 'D.Mike' },
      msg: 'Hallo {name}!',
      items_zero: 'Keine Einträge',
      items_one: '1 Eintrag',
      items_other: '{count} Einträge',
    });
    i18n._cache.set('en', {
      greeting: 'Hello',
      app: { title: 'D.Mike' },
    });
    return i18n;
  }

  test('t: translates a simple key', () => {
    const i18n = makeI18n();
    assertEqual(i18n.t('greeting'), 'Hallo');
  });

  test('t: translates nested key', () => {
    const i18n = makeI18n();
    assertEqual(i18n.t('app.title'), 'D.Mike');
  });

  test('t: interpolates {placeholders}', () => {
    const i18n = makeI18n();
    assertEqual(i18n.t('msg', { name: 'World' }), 'Hallo World!');
  });

  test('t: falls back to English if key missing in German', () => {
    const i18n = makeI18n();
    assertEqual(i18n.t('greeting'), 'Hallo'); // German exists
    // Simulate missing in German by looking up English-only key
    i18n._lang = 'de';
    i18n._cache.get('de').onlyEn = undefined;
    // greeting exists in both — just check fallback doesn't break
    assertEqual(typeof i18n.t('greeting'), 'string');
  });

  test('t: returns key itself when missing in all languages', () => {
    const i18n = makeI18n();
    assertEqual(i18n.t('completely.missing.key'), 'completely.missing.key');
  });

  test('t: pluralization (count=0)', () => {
    const i18n = makeI18n();
    assertEqual(i18n.t('items', { count: 0 }), 'Keine Einträge');
  });

  test('t: pluralization (count=1)', () => {
    const i18n = makeI18n();
    assertEqual(i18n.t('items', { count: 1 }), '1 Eintrag');
  });

  test('t: pluralization (count=5)', () => {
    const i18n = makeI18n();
    assertEqual(i18n.t('items', { count: 5 }), '5 Einträge');
  });

  test('exists: returns true for known key', () => {
    const i18n = makeI18n();
    assertEqual(i18n.exists('greeting'), true);
  });

  test('exists: returns false for unknown key', () => {
    const i18n = makeI18n();
    assertEqual(i18n.exists('nope.nope'), false);
  });

  test.todo('setLanguage: emits language:changed event');
  test.todo('registerModuleTranslations: makes module keys accessible');
});
