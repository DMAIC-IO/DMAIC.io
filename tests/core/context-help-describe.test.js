import { suite, test, assertEqual, beforeEach, afterEach } from '../test-utils.js';
import { setContextHelpConfig, augmentContextHelp } from '../../js/core/context-help.js';

/** Eine i18n-Attrappe mit wählbarer Tabelle. */
function fakeI18n(table) {
  return {
    exists: (key) => Object.prototype.hasOwnProperty.call(table, key),
    t: (key, params) => {
      const raw = table[key] ?? key;
      return params ? raw.replace(/\{(\w+)\}/g, (_, n) => params[n] ?? `{${n}}`) : raw;
    },
    getLanguage: () => 'de',
  };
}

let host;

suite('Kontexthilfe — title und aria-describedby', () => {
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });
  afterEach(() => {
    host.remove();
    document.querySelectorAll('#dmike-context-help-descriptions').forEach(n => n.remove());
  });

  test('ein Anker trägt den Satz als title', () => {
    setContextHelpConfig({ i18n: fakeI18n({
      'modules.five-why.fields.problem.help': 'Der beobachtete Problemtext.',
      'contextHelp.ariaLabel': 'Kontexthilfe zu „{label}" anzeigen',
    }) });
    host.innerHTML = '<label data-help-key="modules.five-why.fields.problem.help">Problem</label>';

    augmentContextHelp(host);

    const anchor = host.querySelector('label');
    assertEqual(anchor.getAttribute('title'), 'Der beobachtete Problemtext.');
  });

  test('ein Anker verweist über aria-describedby auf ein Ziel mit demselben Satz', () => {
    setContextHelpConfig({ i18n: fakeI18n({
      'modules.five-why.fields.problem.help': 'Der beobachtete Problemtext.',
      'contextHelp.ariaLabel': 'Kontexthilfe zu „{label}" anzeigen',
    }) });
    host.innerHTML = '<label data-help-key="modules.five-why.fields.problem.help">Problem</label>';

    augmentContextHelp(host);

    const anchor = host.querySelector('label');
    const id = anchor.getAttribute('aria-describedby');
    assertEqual(typeof id === 'string' && id.length > 0, true, 'kein aria-describedby gesetzt');
    const target = document.getElementById(id);
    assertEqual(target !== null, true, `Ziel ${id} existiert nicht`);
    assertEqual(target.textContent, 'Der beobachtete Problemtext.');
    assertEqual(target.classList.contains('dmike-sr-only'), true, 'das Ziel ist nicht verborgen');
  });

  test('das Beschreibungsziel ist ein Geschwister, kein Kind des Ankers', () => {
    // Ein Beschreibungselement IM Knopf würde unter „name from content" in
    // dessen zugänglichen Namen einfließen: „Why hinzufügen Legt eine
    // Why-Frage an.". Deshalb liegt es außerhalb.
    setContextHelpConfig({ i18n: fakeI18n({
      'modules.five-why.actions.addRoot.help': 'Legt eine Why-Frage an.',
      'contextHelp.ariaLabel': 'Kontexthilfe zu „{label}" anzeigen',
    }) });
    host.innerHTML = '<button data-help-key="modules.five-why.actions.addRoot.help">Why hinzufügen</button>';

    augmentContextHelp(host);

    const anchor = host.querySelector('button');
    const target = document.getElementById(anchor.getAttribute('aria-describedby'));
    // Zuerst die Existenz: `contains(null)` ist false, die Prüfung unten wäre
    // sonst auch ohne jedes Beschreibungsziel erfüllt.
    assertEqual(target !== null, true, 'kein Beschreibungsziel vorhanden');
    assertEqual(anchor.contains(target), false, 'das Ziel liegt im Anker');
    assertEqual(host.contains(target), false, 'das Ziel liegt im Modulbaum');
  });

  test('zwei Anker mit demselben Schlüssel teilen EIN Beschreibungsziel', () => {
    // `hypothesis-test.html` trägt `fields.targetValue.help` zweimal (σ²₀ und
    // μ₀). Zwei Elemente mit derselben id wären ungültiges HTML; ein
    // gemeinsames Ziel ist der richtige Weg.
    setContextHelpConfig({ i18n: fakeI18n({
      'modules.hypothesis-test.fields.targetValue.help': 'Der Zielwert.',
      'contextHelp.ariaLabel': 'Kontexthilfe zu „{label}" anzeigen',
    }) });
    host.innerHTML = `
      <label data-help-key="modules.hypothesis-test.fields.targetValue.help">σ²₀</label>
      <label data-help-key="modules.hypothesis-test.fields.targetValue.help">μ₀</label>`;

    augmentContextHelp(host);

    const [a, b] = host.querySelectorAll('label');
    assertEqual(a.getAttribute('aria-describedby'), b.getAttribute('aria-describedby'));
    assertEqual(document.querySelectorAll(`#${a.getAttribute('aria-describedby')}`).length, 1);
  });

  test('ein Anker ohne auflösenden Schlüssel bekommt weder title noch aria-describedby', () => {
    setContextHelpConfig({ i18n: fakeI18n({ 'contextHelp.ariaLabel': 'x' }) });
    host.innerHTML = '<label data-help-key="modules.foo.fields.bar.help">Bar</label>';

    augmentContextHelp(host);

    const anchor = host.querySelector('label');
    assertEqual(anchor.hasAttribute('title'), false);
    assertEqual(anchor.hasAttribute('aria-describedby'), false);
    assertEqual(anchor.querySelector('.context-help__btn'), null, 'kein Schlüssel, kein Knopf');
  });

  test('der eingespritzte Knopf bleibt aus dem Tabulator-Lauf', () => {
    // Ausdrücklich NICHT gebaut: ein Tabulator-Stopp pro beschriebenem Feld.
    // Für den langen Text ist das Handbuch der richtige Ort.
    setContextHelpConfig({ i18n: fakeI18n({
      'modules.five-why.fields.problem.help': 'Der Satz.',
      'contextHelp.ariaLabel': 'Kontexthilfe zu „{label}" anzeigen',
    }) });
    host.innerHTML = '<label data-help-key="modules.five-why.fields.problem.help">Problem</label>';

    augmentContextHelp(host);

    assertEqual(host.querySelector('.context-help__btn').tabIndex, -1);
  });

  test('der title trägt NICHT den Knopftext mit', () => {
    setContextHelpConfig({ i18n: fakeI18n({
      'modules.five-why.actions.addRoot.help': 'Legt eine Why-Frage an.',
      'contextHelp.ariaLabel': 'Kontexthilfe zu „{label}" anzeigen',
    }) });
    host.innerHTML = '<button data-help-key="modules.five-why.actions.addRoot.help">Why hinzufügen</button>';

    augmentContextHelp(host);

    const anchor = host.querySelector('button');
    assertEqual(anchor.getAttribute('title'), 'Legt eine Why-Frage an.');
  });

  test('ein zweiter Durchlauf zieht einen geänderten Text nach, statt ihn einzufrieren', () => {
    const de = { 'modules.five-why.fields.problem.help': 'Der Satz.', 'contextHelp.ariaLabel': 'x „{label}"' };
    const en = { 'modules.five-why.fields.problem.help': 'The sentence.', 'contextHelp.ariaLabel': 'x „{label}"' };
    setContextHelpConfig({ i18n: fakeI18n(de) });
    host.innerHTML = '<label data-help-key="modules.five-why.fields.problem.help">Problem</label>';
    augmentContextHelp(host);

    setContextHelpConfig({ i18n: fakeI18n(en) });
    augmentContextHelp(host);

    const anchor = host.querySelector('label');
    assertEqual(anchor.getAttribute('title'), 'The sentence.');
    assertEqual(document.getElementById(anchor.getAttribute('aria-describedby')).textContent, 'The sentence.');
  });
});
