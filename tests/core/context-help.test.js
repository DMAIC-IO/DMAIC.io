/**
 * Tests für core/context-help.js — die UI-Seite der Agenten-Kontexthilfen.
 *
 * Derselbe i18n-Schlüssel, den `module.describe` an den Agenten gibt, steht
 * hier als Kontexthilfe am Label (Spec §8). Die Fläche braucht ein Dokument
 * und läuft deshalb nur im Browser-Runner.
 */
import { suite, test, beforeEach, assertEqual, assertTrue } from '../test-utils.js';
import {
  setContextHelpConfig, augmentContextHelp, openContextHelp, closeContextHelp,
} from '../../js/core/context-help.js';

const HELP = {
  'modules.five-why.agent.fields.problem': 'Die beobachtete Abweichung, von der die Fragekette ausgeht.',
};

const i18nStub = {
  exists: (key) => Object.prototype.hasOwnProperty.call(HELP, key),
  t: (key, params) => HELP[key] ?? (params ? `${key}:${JSON.stringify(params)}` : key),
  getLanguage: () => 'de',
};

let host;

suite('context help', () => {
  beforeEach(() => {
    closeContextHelp();
    document.querySelectorAll('.context-help-host').forEach((el) => el.remove());
    host = document.createElement('div');
    host.className = 'context-help-host';
    document.body.appendChild(host);
    setContextHelpConfig({ i18n: i18nStub });
  });

  test('augments an anchor whose help key exists', () => {
    const label = document.createElement('label');
    label.setAttribute('data-help-key', 'modules.five-why.agent.fields.problem');
    label.textContent = 'Problem';
    host.appendChild(label);

    augmentContextHelp(host);

    const btn = label.querySelector('.context-help__btn');
    assertTrue(Boolean(btn));
    assertEqual(btn.getAttribute('data-help-key'), 'modules.five-why.agent.fields.problem');
    assertTrue(label.classList.contains('context-help-anchor'));
  });

  test('does NOT augment an anchor whose help key is missing — a gap stays visible', () => {
    const label = document.createElement('label');
    label.setAttribute('data-help-key', 'modules.five-why.agent.fields.nope');
    host.appendChild(label);

    augmentContextHelp(host);

    assertEqual(label.querySelector('.context-help__btn'), null);
  });

  test('augmenting twice leaves exactly one button', () => {
    const label = document.createElement('label');
    label.setAttribute('data-help-key', 'modules.five-why.agent.fields.problem');
    host.appendChild(label);

    augmentContextHelp(host);
    augmentContextHelp(host);

    assertEqual(label.querySelectorAll('.context-help__btn').length, 1);
  });

  test('opening shows the help text and a backdrop; closing removes both', () => {
    const label = document.createElement('label');
    label.setAttribute('data-help-key', 'modules.five-why.agent.fields.problem');
    label.textContent = 'Problem';
    host.appendChild(label);
    augmentContextHelp(host);

    openContextHelp(label.querySelector('.context-help__btn'));

    const panel = document.querySelector('.context-help__panel');
    assertTrue(Boolean(panel));
    assertTrue(panel.textContent.includes('beobachtete Abweichung'));
    assertTrue(Boolean(document.querySelector('.context-help__backdrop')));

    closeContextHelp();
    assertEqual(document.querySelector('.context-help__panel'), null);
    assertEqual(document.querySelector('.context-help__backdrop'), null);
  });

  test('only one panel is open at a time', () => {
    for (const name of ['a', 'b']) {
      const label = document.createElement('label');
      label.setAttribute('data-help-key', 'modules.five-why.agent.fields.problem');
      label.textContent = name;
      host.appendChild(label);
    }
    augmentContextHelp(host);
    const buttons = host.querySelectorAll('.context-help__btn');

    openContextHelp(buttons[0]);
    openContextHelp(buttons[1]);

    assertEqual(document.querySelectorAll('.context-help__panel').length, 1);
  });
});
