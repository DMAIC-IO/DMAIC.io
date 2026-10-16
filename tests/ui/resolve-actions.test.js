import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import { resolveActions } from '../../js/ui/resolve-actions.js';

// Fake tf: uppercases the key so we can assert resolution happened.
const tf = (key) => `T(${key})`;

suite('resolveActions', () => {
  test('resolves title and default secondary variant', () => {
    const [vm] = resolveActions([{ icon: 'download', title: 'export' }], tf);
    assertEqual(vm.iconId, 'download', 'icon → iconId');
    assertEqual(vm.text, 'T(export)', 'title resolved via tf');
    assertEqual(vm.variant, 'secondary', 'default variant is secondary');
    assertEqual(vm.tooltip, null, 'no description → null tooltip');
    assertEqual(vm.isDropdown, false, 'no children → not a dropdown');
  });

  test('honors primary variant and description tooltip', () => {
    const [vm] = resolveActions(
      [{ icon: 'plus', title: 'add', description: 'addHint', variant: 'primary' }], tf);
    assertEqual(vm.variant, 'primary', 'primary passes through');
    assertEqual(vm.tooltip, 'T(addHint)', 'description resolved to tooltip');
  });

  test('any non-primary variant falls back to secondary', () => {
    const [vm] = resolveActions([{ icon: 'x', title: 'a', variant: 'bogus' }], tf);
    assertEqual(vm.variant, 'secondary', 'unknown variant → secondary');
  });

  test('two+ children → isDropdown true and children resolved recursively', () => {
    const [vm] = resolveActions([{
      icon: 'download', title: 'export',
      children: [
        { icon: 'export-csv', title: 'export.csv' },
        { icon: 'export-json', title: 'export.json' },
      ],
    }], tf);
    assertEqual(vm.isDropdown, true, 'children → dropdown');
    assertEqual(vm.children.length, 2, 'two children');
    assertEqual(vm.children[0].text, 'T(export.csv)', 'child title resolved');
    assertEqual(vm.children[0].iconId, 'export-csv', 'child icon');
  });

  test('single child stays a dropdown (uniform export UI, no collapse)', () => {
    const onClick = () => {};
    const [vm] = resolveActions([{
      icon: 'download', title: 'export.label',
      children: [{ icon: 'export-csv', title: 'export.csv', onClick }],
    }], tf);
    assertEqual(vm.isDropdown, true, 'single-item dropdown stays a dropdown');
    assertEqual(vm.text, 'T(export.label)', 'shows the parent label, not the child');
    assertEqual(vm.iconId, 'download', 'shows the parent icon');
    assertEqual(vm.children.length, 1, 'the lone child is kept in children');
    assertEqual(vm.children[0].text, 'T(export.csv)', 'child label resolved');
    assertTrue(vm.children[0].onClick === onClick, 'child onClick preserved');
  });

  test('empty children array is not a dropdown', () => {
    const [vm] = resolveActions([{ icon: 'x', title: 'a', children: [] }], tf);
    assertEqual(vm.isDropdown, false, 'empty children → not dropdown');
  });

  test('passes onClick through unchanged', () => {
    const onClick = () => {};
    const [vm] = resolveActions([{ icon: 'x', title: 'a', onClick }], tf);
    assertTrue(vm.onClick === onClick, 'onClick identity preserved');
    assertEqual(vm.dynamicText, null, 'no dynamicText → null');
  });

  test('dynamicText receives live data and the module tf', () => {
    const dynamicText = (d, t) => t(d.open ? 'hide' : 'show');
    const [vm] = resolveActions([{ icon: 'x', title: 'a', dynamicText }], tf);
    assertEqual(vm.dynamicText({ open: false }), 'T(show)', 'closed → show key resolved');
    assertEqual(vm.dynamicText({ open: true }), 'T(hide)', 'open → hide key resolved');
  });

  test('null/undefined actions → empty array', () => {
    assertDeepEqual(resolveActions(undefined, tf), [], 'undefined → []');
    assertDeepEqual(resolveActions(null, tf), [], 'null → []');
  });

  test('eine Aktion mit agentAction trägt ihren Hilfetext im Viewmodel', () => {
    const tfLocal = (key) => ({ collapseAll: 'Alles zuklappen' }[key] ?? key);
    const helpFor = (name) => ({ collapseAll: 'Klappt alle Fragen mit Unterfragen zusammen.' }[name] ?? null);

    const [vm] = resolveActions(
      [{ icon: 'nav.collapse-up', title: 'collapseAll', agentAction: 'collapseAll', onClick: () => {} }],
      tfLocal, helpFor);

    assertEqual(vm.help, 'Klappt alle Fragen mit Unterfragen zusammen.');
    assertEqual(vm.agentAction, 'collapseAll', 'der Methodenname bleibt am Viewmodel');
  });

  test('eine Aktion ohne agentAction trägt kein help — und nicht den Schlüsseltext', () => {
    // `tf` fällt bei fehlendem Schlüssel auf den Schlüssel selbst zurück
    // (`i18n.js:105`). Ein `help` aus `tf` wäre deshalb im Fehlerfall ein
    // Tooltip mit dem Wortlaut „actions.foo.help" — schlechter als keiner.
    const tfLocal = (key) => key;
    const helpFor = () => null;

    const [vm] = resolveActions([{ icon: 'x', title: 'foo' }], tfLocal, helpFor);

    assertEqual(vm.help, null);
    assertEqual(vm.agentAction, null);
  });

  test('ein agentAction ohne Hilfetext trägt kein help', () => {
    const [vm] = resolveActions(
      [{ icon: 'x', title: 'foo', agentAction: 'nichtVorhanden' }], (k) => k, () => null);
    assertEqual(vm.help, null);
  });

  test('Untermenü-Einträge bekommen ihren eigenen Hilfetext', () => {
    const helpFor = (name) => ({ exportJSON: 'Schreibt den Baum als JSON.' }[name] ?? null);
    const [vm] = resolveActions([{
      icon: 'action.download', title: 'export',
      children: [{ icon: 'action.download', title: 'exportJSON', agentAction: 'exportJSON' }],
    }], (k) => k, helpFor);

    assertEqual(vm.isDropdown, true);
    assertEqual(vm.children[0].help, 'Schreibt den Baum als JSON.');
  });

  test('resolveActions bleibt ohne helpFor benutzbar', () => {
    // Die Signatur wächst um einen OPTIONALEN Parameter; jeder bestehende
    // Aufrufer muss unverändert weiterlaufen.
    const [vm] = resolveActions([{ icon: 'x', title: 'foo' }], (k) => k);
    assertEqual(vm.help, null);
    assertEqual(vm.text, 'foo');
  });
});
