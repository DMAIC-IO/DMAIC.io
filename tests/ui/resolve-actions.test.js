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

  test('single child collapses to render the child, not the generic parent', () => {
    const onClick = () => {};
    const [vm] = resolveActions([{
      icon: 'download', title: 'export.label',
      children: [{ icon: 'export-csv', title: 'export.csv', onClick }],
    }], tf);
    assertEqual(vm.isDropdown, false, 'single-item dropdown is not a dropdown');
    assertEqual(vm.text, 'T(export.csv)', 'renders child label, not parent "export.label"');
    assertEqual(vm.iconId, 'export-csv', 'renders child icon');
    assertTrue(vm.onClick === onClick, 'child onClick preserved');
    assertEqual(vm.children.length, 0, 'no children on the collapsed action');
  });

  test('empty children array is not a dropdown', () => {
    const [vm] = resolveActions([{ icon: 'x', title: 'a', children: [] }], tf);
    assertEqual(vm.isDropdown, false, 'empty children → not dropdown');
  });

  test('passes onClick and dynamicText through unchanged', () => {
    const onClick = () => {};
    const dynamicText = (d) => `${d.n}`;
    const [vm] = resolveActions([{ icon: 'x', title: 'a', onClick, dynamicText }], tf);
    assertTrue(vm.onClick === onClick, 'onClick identity preserved');
    assertTrue(vm.dynamicText === dynamicText, 'dynamicText identity preserved');
  });

  test('null/undefined actions → empty array', () => {
    assertDeepEqual(resolveActions(undefined, tf), [], 'undefined → []');
    assertDeepEqual(resolveActions(null, tf), [], 'null → []');
  });
});
