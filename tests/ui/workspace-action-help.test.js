/**
 * Tests für die Aktionshilfe an den vom Rahmen gerenderten
 * Werkzeugleisten-Knöpfen (`Workspace._buildActionButton`).
 *
 * Geprüft wird nicht, dass `describeElement` seine Merkmale setzt — das tut
 * `tests/core/context-help-describe.test.js`. Geprüft wird, was der Rahmen
 * tut, wenn der Hilfesatz NICHT ankommt, und was er an einem Knopf ohne
 * Inhalt tut. Beides sind Wege, auf denen ein Knopf lautlos seinen Namen
 * oder seinen Tooltip verlieren könnte.
 */
import { suite, test, assertEqual, beforeEach, afterEach } from '../test-utils.js';
import { Workspace } from '../../js/ui/workspace.js';
import { setContextHelpConfig } from '../../js/core/context-help.js';

/** Eine i18n-Attrappe mit wählbarer Tabelle. */
function fakeI18n(table) {
  return {
    exists: (key) => Object.prototype.hasOwnProperty.call(table, key),
    t: (key) => table[key] ?? key,
    getLanguage: () => 'de',
  };
}

/** Minimaler Workspace: nur `_buildActionButton` wird gebraucht. */
function makeWorkspace() {
  const ws = Object.create(Workspace.prototype);
  ws._actionEffectDisposers = [];
  return ws;
}

/** Eine Modulinstanz-Attrappe mit laufendem Effekt. */
function makeInstance() {
  return {
    i18nKey: 'modules.probe',
    getActionData: () => ({}),
    bindEffect: (fn) => { fn(); return () => {}; },
  };
}

/**
 * Ein Viewmodel, wie `resolveActions` es liefert.
 * @param {object} [over] - abweichende Felder
 */
function vmFor(over = {}) {
  return {
    iconId: 'action.download',
    text: 'Exportieren',
    tooltip: null,
    agentAction: null,
    help: null,
    variant: 'secondary',
    isDropdown: false,
    onClick: null,
    dynamicText: null,
    children: [],
    ...over,
  };
}

const HELP = 'Schreibt den Baum als JSON.';
const HELP_KEY = 'modules.probe.actions.exportJSON.help';

suite('Werkzeugleisten-Knopf — Aktionshilfe', () => {
  beforeEach(() => {
    document.querySelectorAll('#dmike-context-help-descriptions').forEach(n => n.remove());
  });
  afterEach(() => {
    document.querySelectorAll('#dmike-context-help-descriptions').forEach(n => n.remove());
  });

  test('kommt der Hilfesatz nicht an, behält der Knopf seinen gewöhnlichen Tooltip', () => {
    // Zwei i18n-Griffe: `vm.help` entsteht am `_i18n` des Workspace,
    // angewandt wird der Satz über das `STATE.i18n` der Kontexthilfe. Driften
    // die beiden auseinander — etwa weil `setContextHelpConfig` nie lief —,
    // dann setzt `describeElement` nichts. Würde der Rahmen auf `vm.help`
    // statt auf das TATSÄCHLICH Angewandte reagieren, verlöre der Knopf
    // zusätzlich seinen eigenen Tooltip: zwei Verluste ohne ein Signal.
    setContextHelpConfig({ i18n: fakeI18n({}) });
    const btn = makeWorkspace()._buildActionButton(
      vmFor({ tooltip: 'Als JSON sichern', agentAction: 'exportJSON', help: HELP }),
      makeInstance());

    assertEqual(btn.getAttribute('title'), 'Als JSON sichern', 'Tooltip verloren');
    assertEqual(btn.hasAttribute('aria-describedby'), false, 'Beschreibung ohne Ziel');
  });

  test('kommt der Hilfesatz an, gewinnt er über den gewöhnlichen Tooltip', () => {
    // Die Gegenprobe zum Fall darüber: der Satz beschreibt die Aktion, der
    // `description`-Tooltip wiederholt nur die Beschriftung.
    setContextHelpConfig({ i18n: fakeI18n({ [HELP_KEY]: HELP }) });
    const btn = makeWorkspace()._buildActionButton(
      vmFor({ tooltip: 'Als JSON sichern', agentAction: 'exportJSON', help: HELP }),
      makeInstance());

    assertEqual(btn.getAttribute('title'), HELP);
    assertEqual(btn.dataset.agentAction, 'exportJSON');
    assertEqual(
      document.getElementById(btn.getAttribute('aria-describedby')).textContent, HELP);
  });

  test('ein Knopf ohne Inhalt wird nicht von seiner Beschreibung benannt', () => {
    // `dynamicText` darf eine leere Zeichenkette liefern. Dann hat der Knopf
    // keinen Inhalt, aus dem sein Name kommen könnte — und der `title` WIRD
    // zum Namen. Ohne Vorkehrung hieße der Knopf „Schreibt den Baum als
    // JSON." statt „Exportieren": genau der Fehler, den Task 8 an den
    // Symbolknöpfen undo/redo behob. Die eigene Beschriftung bleibt der
    // Name, der Satz kommt über `aria-describedby`.
    setContextHelpConfig({ i18n: fakeI18n({ [HELP_KEY]: HELP }) });
    const btn = makeWorkspace()._buildActionButton(
      vmFor({ agentAction: 'exportJSON', help: HELP, dynamicText: () => '' }),
      makeInstance());

    assertEqual(btn.textContent.trim(), '', 'Vorbedingung: der Knopf ist inhaltslos');
    assertEqual(btn.getAttribute('title'), 'Exportieren', 'der Satz wurde zum Namen');
    assertEqual(
      document.getElementById(btn.getAttribute('aria-describedby')).textContent, HELP,
      'der Satz fehlt als Beschreibung');
  });

  test('ein Knopf mit Inhalt trägt den Satz als title — der Name kommt aus dem Inhalt', () => {
    // Die Gegenprobe: solange sichtbarer Text da ist, nennt ihn der Name
    // („name from content"), und der `title` ist nur ein Tooltip.
    setContextHelpConfig({ i18n: fakeI18n({ [HELP_KEY]: HELP }) });
    const btn = makeWorkspace()._buildActionButton(
      vmFor({ agentAction: 'exportJSON', help: HELP }), makeInstance());

    assertEqual(btn.textContent.trim(), 'Exportieren');
    assertEqual(btn.getAttribute('title'), HELP);
  });
});
