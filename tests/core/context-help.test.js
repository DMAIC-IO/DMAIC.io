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
  'modules.five-why.fields.problem.help': 'Die beobachtete Abweichung, von der die Fragekette ausgeht.',
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
    label.setAttribute('data-help-key', 'modules.five-why.fields.problem.help');
    label.textContent = 'Problem';
    host.appendChild(label);

    augmentContextHelp(host);

    const btn = label.querySelector('.context-help__btn');
    assertTrue(Boolean(btn));
    assertEqual(btn.getAttribute('data-help-key'), 'modules.five-why.fields.problem.help');
    assertTrue(label.classList.contains('context-help-anchor'));
  });

  test('does NOT augment an anchor whose help key is missing — a gap stays visible', () => {
    const label = document.createElement('label');
    label.setAttribute('data-help-key', 'modules.five-why.fields.nope.help');
    host.appendChild(label);

    augmentContextHelp(host);

    assertEqual(label.querySelector('.context-help__btn'), null);
  });

  test('a click on the badge opens the help and does NOT reach the anchor’s own handler', () => {
    // Der Anker darf selbst ein Knopf mit eigener Aktion sein (five-why:
    // „Why hinzufügen"). Hinge der Klickgriff nur am Dokument, liefe der
    // Griff des Ankers in der Bubble-Phase VORHER — ein Klick aufs
    // Fragezeichen hätte dessen Aktion ausgelöst.
    const anchor = document.createElement('button');
    anchor.setAttribute('data-help-key', 'modules.five-why.fields.problem.help');
    anchor.textContent = 'Why hinzufügen';
    let anchorClicks = 0;
    anchor.addEventListener('click', () => { anchorClicks += 1; });
    host.appendChild(anchor);

    augmentContextHelp(host);
    anchor.querySelector('.context-help__btn').click();

    assertEqual(anchorClicks, 0);
    assertTrue(Boolean(document.querySelector('.context-help__panel')));
  });

  test('the badge is not a nested <button> — the anchor itself may be one', () => {
    const anchor = document.createElement('button');
    anchor.setAttribute('data-help-key', 'modules.five-why.fields.problem.help');
    host.appendChild(anchor);

    augmentContextHelp(host);

    const btn = anchor.querySelector('.context-help__btn');
    assertEqual(btn.tagName, 'SPAN');
    assertEqual(btn.getAttribute('role'), 'button');
  });

  test('augmenting twice leaves exactly one button', () => {
    const label = document.createElement('label');
    label.setAttribute('data-help-key', 'modules.five-why.fields.problem.help');
    host.appendChild(label);

    augmentContextHelp(host);
    augmentContextHelp(host);

    assertEqual(label.querySelectorAll('.context-help__btn').length, 1);
  });

  test('a textContent rewrite wipes the button — the next sweep brings it back', () => {
    const label = document.createElement('label');
    label.setAttribute('data-help-key', 'modules.five-why.fields.problem.help');
    host.appendChild(label);
    augmentContextHelp(host);
    assertEqual(label.querySelectorAll('.context-help__btn').length, 1);

    // Genau das tut Alpines x-text: textContent setzen — alle Kinder weg,
    // das Idempotenz-Merkmal am Anker bleibt stehen.
    label.textContent = 'Problemstellung';
    assertEqual(label.querySelectorAll('.context-help__btn').length, 0);

    augmentContextHelp(host);
    assertEqual(label.querySelectorAll('.context-help__btn').length, 1);
  });

  test('the aria-label follows a label text that only arrives after the first sweep', () => {
    const label = document.createElement('label');
    label.setAttribute('data-help-key', 'modules.five-why.fields.problem.help');
    host.appendChild(label);

    augmentContextHelp(host);
    assertEqual(
      label.querySelector('.context-help__btn').getAttribute('aria-label'),
      'contextHelp.ariaLabel:{"label":""}',
    );

    label.textContent = 'Problemstellung';
    augmentContextHelp(host);
    assertEqual(
      label.querySelector('.context-help__btn').getAttribute('aria-label'),
      'contextHelp.ariaLabel:{"label":"Problemstellung"}',
    );
  });

  test('opening shows the help text and a backdrop; closing removes both', () => {
    const label = document.createElement('label');
    label.setAttribute('data-help-key', 'modules.five-why.fields.problem.help');
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
      label.setAttribute('data-help-key', 'modules.five-why.fields.problem.help');
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
