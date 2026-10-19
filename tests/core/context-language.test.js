/**
 * D.Mike — Active language as seen by modules and charts
 *
 * A module keeps the context it got in init(). After a language switch it
 * re-renders via onLanguageChange(), so `context.language` must report the
 * language active now, not the one active at mount time — otherwise numbers
 * and dates keep the old format. Likewise a chart created while English is
 * active must format with the English locale from the start.
 */

import { suite, test, assertEqual } from '../test-utils.js';
import { Workspace } from '../../js/ui/workspace.js';
import ChartManager from '../../js/core/chart/chart-manager.js';

/** Minimal i18n double exposing only the public API. */
function makeI18n(lang) {
  return {
    _lang: lang,
    getLanguage() { return this._lang; },
    t: (k) => k,
  };
}

suite('module context — language follows the active language', () => {
  test('context.language reports the language after a switch', () => {
    const i18n = makeI18n('de');
    const ws = new Workspace(document.createElement('div'), {
      moduleRegistry: {},
      eventBus: { on: () => {}, emit: () => {} },
      stateManager: { get: () => ({}), getActiveProjectId: () => 'p1' },
      i18n,
      modal: () => {},
      dialog: {},
      notify: () => {},
      chartManager: {},
      examples: {},
    });
    const context = ws._buildContext('inst-1', document.createElement('div'));
    assertEqual(context.language, 'de');
    i18n._lang = 'en';
    assertEqual(context.language, 'en');
  });
});

suite('ChartManager — new charts use the active locale', () => {
  test('a chart created while English is active gets locale en', async () => {
    const manager = new ChartManager({ on() {} }, makeI18n('en'));
    let seen = null;
    manager._loadType = async () => class { constructor(c, cfg, ctx) { seen = ctx.language; } };
    await manager.create(document.createElement('div'), 'x', {});
    assertEqual(seen, 'en');
  });
});
