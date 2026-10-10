/**
 * D.Mike — Dashboard tile settings form (tile-settings-form.js)
 *
 * Builds the settings dialog body from a validated settings schema. Knows
 * nothing about the dashboard or persistence; the caller reads the values
 * with read() after the dialog is confirmed.
 */

import { h } from '../../core/dom.js';
import { coerceValue } from './tile-settings.js';

let formSeq = 0;

/**
 * Visible text of a select option: a literal host text, an i18n label, or
 * the raw value.
 * @param {object} field
 * @param {string} option
 * @param {number} index
 * @param {{t: function}} i18n
 * @returns {string}
 */
function optionText(field, option, index, i18n) {
  const literal = Array.isArray(field.optionTexts) ? field.optionTexts[index] : undefined;
  if (typeof literal === 'string') return literal;
  return field.optionLabels?.[option] ? i18n.t(field.optionLabels[option]) : option;
}

/**
 * Create the control for one field.
 * @param {object} field
 * @param {object} i18n
 * @returns {HTMLElement}
 */
function createControl(field, i18n) {
  if (field.type === 'number') {
    return h('input', { type: 'number', class: 'field field--inline', min: field.min, max: field.max, step: field.step ?? 1 });
  }
  if (field.type === 'select') {
    return h('select', { class: 'field field--inline' },
      ...field.options.map((option, i) => h('option', { value: option }, optionText(field, option, i, i18n))));
  }
  return h('input', { type: 'checkbox' });
}

/**
 * @param {HTMLElement} control
 * @param {object} field
 * @param {*} value
 */
function writeControl(control, field, value) {
  if (field.type === 'boolean') control.checked = value === true;
  else control.value = String(value);
}

/**
 * @param {HTMLElement} control
 * @param {object} field
 * @returns {*} raw value
 */
function readControl(control, field) {
  return field.type === 'boolean' ? control.checked : control.value;
}

/**
 * Build the settings form for a tile.
 * @param {object} schema  validated schema (see tile-settings.js)
 * @param {object} values  resolved current values (resolveSettings)
 * @param {{t: function}} i18n
 * @returns {{el: HTMLElement, reset: HTMLElement, read: () => object}}
 *   `reset` restores the defaults; it is not part of `el` so the caller can
 *   place it in the dialog footer.
 */
export function buildSettingsForm(schema, values, i18n) {
  const prefix = `tile-setting-${++formSeq}`;
  const controls = new Map();

  const rows = Object.entries(schema).map(([key, field]) => {
    const control = createControl(field, i18n);
    control.id = `${prefix}-${key}`;
    control.classList.add('tile-settings__input');
    control.dataset.setting = key;
    writeControl(control, field, values[key]);
    controls.set(key, control);
    return h('div', { class: `tile-settings__row tile-settings__row--${field.type}` },
      h('label', { class: 'tile-settings__label', for: control.id }, i18n.t(field.label)),
      control);
  });

  const reset = h('button', { type: 'button', class: 'btn btn--secondary tile-settings__reset' },
    i18n.t('dashboard.tileSettings.restoreDefaults'));
  reset.addEventListener('click', () => {
    for (const [key, field] of Object.entries(schema)) writeControl(controls.get(key), field, field.default);
  });

  return {
    el: h('div', { class: 'tile-settings' }, ...rows),
    reset,
    read() {
      const out = {};
      for (const [key, field] of Object.entries(schema)) {
        out[key] = coerceValue(field, readControl(controls.get(key), field));
      }
      return out;
    },
  };
}
