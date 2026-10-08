import { suite, test, assertEqual, assertDeepEqual, assertThrows } from '../test-utils.js';
import {
  VideosRegistry, selectForModule, selectForTerm, selectForExample, parseMirror,
} from '../../js/core/videos-registry.js';

const entry = {
  type: 'module', id: 'run-chart-shift',
  modules: ['run-chart'], glossary: ['median'], examples: ['spc-run-chart-shift'],
  tags: ['spc'], title: { de: 'Verlauf', en: 'Run chart' },
  entry: { query: '?module=run-chart', labelKey: 'videos.openModule' },
  video: { de: 'https://x/de/3.mp4' }, captions: { de: 'https://x/de/3.vtt' }, sec: { de: 60 },
  chapters: [{ id: 'a', sec: { de: 0 }, title: { de: 'A', en: 'A' }, modules: ['histogram'], tags: [] }],
};

suite('core/videos-registry', () => {
  test('selectForModule matches the module list and the chapter modules', () => {
    assertEqual(selectForModule([entry], 'run-chart').length, 1);
    assertEqual(selectForModule([entry], 'histogram').length, 1);
    assertEqual(selectForModule([entry], 'boxplot').length, 0);
  });

  test('selectForTerm and selectForExample match their own fields only', () => {
    assertEqual(selectForTerm([entry], 'median').length, 1);
    assertEqual(selectForTerm([entry], 'run-chart').length, 0);
    assertEqual(selectForExample([entry], 'spc-run-chart-shift').length, 1);
  });

  test('a successful init fills the registry', async () => {
    const registry = new VideosRegistry();
    await registry.init({ __fetch: async () => ({ ok: true, json: async () => ({ _comment: 'generated file - do not edit', videos: [entry] }) }) });
    assertEqual(registry.isInitialized(), true);
    assertEqual(registry.getAll().length, 1);
    assertEqual(registry.getForModule('run-chart')[0].id, 'run-chart-shift');
  });

  test('a missing mirror leaves the registry empty instead of killing the boot', async () => {
    const registry = new VideosRegistry();
    await registry.init({ __fetch: async () => ({ ok: false, status: 404 }) });
    assertEqual(registry.isInitialized(), true);
    assertDeepEqual(registry.getAll(), []);
    assertDeepEqual(registry.getForModule('run-chart'), []);
  });

  test('parseMirror reads the videos array out of the wrapper', () => {
    assertDeepEqual(parseMirror({ _comment: 'generated file - do not edit', videos: [entry] }), [entry]);
    assertDeepEqual(parseMirror({ _comment: 'x', videos: [] }), []);
  });

  test('parseMirror refuses the old bare-array form instead of accepting both', () => {
    assertThrows(() => parseMirror([entry]), /array form/);
  });

  test('parseMirror refuses a wrapper without a videos array', () => {
    assertThrows(() => parseMirror({ nope: 1 }), /videos/);
  });

  test('a mirror in the old array form leaves the registry empty', async () => {
    const registry = new VideosRegistry();
    await registry.init({ __fetch: async () => ({ ok: true, json: async () => [entry] }) });
    assertEqual(registry.isInitialized(), true);
    assertDeepEqual(registry.getAll(), []);
  });

  test('a getter called before init() does not throw', () => {
    const registry = new VideosRegistry();
    assertEqual(registry.isInitialized(), false);
    assertDeepEqual(registry.getAll(), []);
    assertDeepEqual(registry.getForModule('run-chart'), []);
    assertDeepEqual(registry.getForTerm('median'), []);
    assertDeepEqual(registry.getForExample('spc-run-chart-shift'), []);
  });
});
