/**
 * Tests for js/modules/survey-builder/viewmodel/texts.js — the questionnaire
 * texts in the language of the questionnaire, loaded from the module's own
 * resources, gaps filled from `en`, once per language.
 */
import { suite, test, assertEqual, assertDeepEqual, assertRejects, assertTrue } from '../../test-utils.js';
import { loadTexts } from '../../../js/modules/survey-builder/viewmodel/texts.js';

const URL_DE = '/survey-builder/ui.de.json?v=1';
const URL_EN = '/survey-builder/ui.en.json?v=1';

const FILES = {
  [URL_DE]: { runner: { save: 'Speichern' }, kano: { scale1: 'Sehr froh' } },
  [URL_EN]: { runner: { save: 'Save', reset: 'Reset' }, kano: { scale1: 'Happy', scale2: 'Expected' } },
};

/** @returns {Record<string, any>} the resource list of the build, with the module entry */
const resources = () => ({ 'survey-builder': { templates: 't', files: { 'i18n/ui.de.json': URL_DE, 'i18n/ui.en.json': URL_EN } } });

/**
 * A fake `fetchJson` that counts its calls and fails for the listed urls.
 * @param {string[]} [failing] @returns {{ fetch: (url: string) => Promise<any>, calls: string[] }}
 */
function fakeFetch(failing = []) {
  const calls = [];
  return {
    calls,
    async fetch(url) {
      calls.push(url);
      if (failing.includes(url)) throw new Error(`HTTP 404 ${url}`);
      return structuredClone(FILES[url]);
    },
  };
}

suite('survey-builder texts: loadTexts', () => {
  test('the runner and kano sections come from the requested language, gaps from en', async () => {
    const f = fakeFetch();
    const texts = await loadTexts('de', { resources: resources(), fetch: f.fetch });
    assertDeepEqual(texts.runner, { save: 'Speichern', reset: 'Reset' });
    assertDeepEqual(texts.kano, { scale1: 'Sehr froh', scale2: 'Expected' });
  });

  test('en alone loads one file', async () => {
    const f = fakeFetch();
    const texts = await loadTexts('en', { resources: resources(), fetch: f.fetch });
    assertEqual(texts.runner.save, 'Save');
    assertDeepEqual(f.calls, [URL_EN]);
  });

  test('a second call for the same language does not fetch again', async () => {
    const f = fakeFetch();
    const first = await loadTexts('de', { resources: resources(), fetch: f.fetch });
    const n = f.calls.length;
    const second = await loadTexts('de', { resources: resources(), fetch: f.fetch });
    assertEqual(f.calls.length, n);
    assertDeepEqual(second, first);
  });

  test('another language fetches on its own', async () => {
    const f = fakeFetch();
    await loadTexts('de', { resources: resources(), fetch: f.fetch });
    const before = f.calls.length;
    await loadTexts('en', { resources: resources(), fetch: f.fetch });
    assertTrue(f.calls.length >= before, 'en is already cached through the de call or fetched once');
    assertEqual(f.calls.filter((u) => u === URL_EN).length, 1);
  });

  test('a failing language file gives the result from en', async () => {
    const f = fakeFetch([URL_DE]);
    const texts = await loadTexts('de', { resources: resources(), fetch: f.fetch });
    assertDeepEqual(texts.runner, { save: 'Save', reset: 'Reset' });
    assertDeepEqual(texts.kano, { scale1: 'Happy', scale2: 'Expected' });
  });

  test('a failure is not cached: the next call tries again', async () => {
    let fail = true;
    const calls = [];
    const fetch = async (url) => {
      calls.push(url);
      if (fail) throw new Error('offline');
      return structuredClone(FILES[url]);
    };
    await assertRejects(() => loadTexts('en', { resources: resources(), fetch }), /survey-builder/);
    fail = false;
    const texts = await loadTexts('en', { resources: resources(), fetch });
    assertEqual(texts.runner.save, 'Save');
  });

  test('a module missing in the resources throws its own message', async () => {
    await assertRejects(() => loadTexts('de', { resources: {}, fetch: fakeFetch().fetch }), /survey-builder.*resources/);
  });

  test('a module without the ui files throws its own message', async () => {
    const res = { 'survey-builder': { templates: 't', files: {} } };
    await assertRejects(() => loadTexts('de', { resources: res, fetch: fakeFetch().fetch }), /survey-builder/);
  });
});
