import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { buildSettingsForm } from '../../js/pages/dashboard/tile-settings-form.js';

const i18n = { t: (k) => `T:${k}` };
const SCHEMA = {
  topN: { type: 'number', min: 1, max: 10, step: 1, default: 5, label: 'l.topN' },
  view: { type: 'select', options: ['bar', 'list'], default: 'bar', label: 'l.view',
    optionLabels: { bar: 'l.bar' } },
  showLegend: { type: 'boolean', default: true, label: 'l.legend' },
};
const VALUES = { topN: 3, view: 'list', showLegend: false };

const input = (form, key) => form.el.querySelector(`[data-setting="${key}"]`);

suite('tile-settings-form', () => {
  test('renders one labelled control per field', () => {
    const form = buildSettingsForm(SCHEMA, VALUES, i18n);
    assertEqual(form.el.querySelectorAll('.tile-settings__row').length, 3);
    const top = input(form, 'topN');
    assertEqual(top.type, 'number');
    assertEqual(top.min, '1');
    assertEqual(top.max, '10');
    assertEqual(top.value, '3');
    const label = form.el.querySelector(`label[for="${top.id}"]`);
    assertEqual(label.textContent, 'T:l.topN');
  });

  test('select uses translated option labels, raw value as fallback', () => {
    const form = buildSettingsForm(SCHEMA, VALUES, i18n);
    const sel = input(form, 'view');
    assertEqual(sel.tagName, 'SELECT');
    assertDeepEqual([...sel.options].map(o => o.textContent), ['T:l.bar', 'list']);
    assertEqual(sel.value, 'list');
  });

  test('boolean is a checkbox', () => {
    const form = buildSettingsForm(SCHEMA, VALUES, i18n);
    const cb = input(form, 'showLegend');
    assertEqual(cb.type, 'checkbox');
    assertEqual(cb.checked, false);
  });

  test('number and select use the shared .field style, the checkbox does not', () => {
    const form = buildSettingsForm(SCHEMA, VALUES, i18n);
    for (const key of ['topN', 'view']) {
      const el = input(form, key);
      assertEqual(el.classList.contains('field'), true, `${key} has .field`);
      assertEqual(el.classList.contains('field--inline'), true, `${key} has .field--inline`);
    }
    assertEqual(input(form, 'showLegend').classList.contains('field'), false);
  });

  test('read() returns the current values', () => {
    const form = buildSettingsForm(SCHEMA, VALUES, i18n);
    assertDeepEqual(form.read(), VALUES);
  });

  test('read() clamps, rounds and falls back on empty input', () => {
    const form = buildSettingsForm(SCHEMA, VALUES, i18n);
    input(form, 'topN').value = '99';
    assertEqual(form.read().topN, 10);
    input(form, 'topN').value = '0';
    assertEqual(form.read().topN, 1);
    input(form, 'topN').value = '2.7';
    assertEqual(form.read().topN, 3);
    input(form, 'topN').value = '';
    assertEqual(form.read().topN, 5);
  });

  test('restore defaults resets every control', () => {
    const form = buildSettingsForm(SCHEMA, VALUES, i18n);
    const reset = form.el.querySelector('.tile-settings__reset');
    assertEqual(reset.textContent, 'T:dashboard.tileSettings.restoreDefaults');
    assertEqual(reset.type, 'button');
    reset.click();
    assertDeepEqual(form.read(), { topN: 5, view: 'bar', showLegend: true });
  });
});

suite('tile settings form: literal option texts', () => {
  test('optionTexts label the options literally; values stay ids', () => {
    const schema = {
      _source: { type: 'select', label: 'l.src', options: ['i1', 'i2'],
        optionTexts: ['Line A (Analyze)', 'FMEA (Improve)'], default: 'i1' },
    };
    const form = buildSettingsForm(schema, { _source: 'i2' }, i18n);
    const options = [...form.el.querySelectorAll('[data-setting="_source"] option')];
    assertDeepEqual(options.map(o => o.textContent), ['Line A (Analyze)', 'FMEA (Improve)']);
    assertDeepEqual(options.map(o => o.value), ['i1', 'i2']);
    assertDeepEqual(form.read(), { _source: 'i2' });
  });
});
