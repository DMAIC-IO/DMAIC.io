/**
 * Datensatz-Picker als Widget: Slots, Filter, `multi` und Farben aus der
 * Beschreibung des gebundenen Feldes; Texte nach Feldnamen mit Rückfall auf
 * die gemeinsamen Texte des Pickers. Eine Erweiterung (`datasets(…, { extension })`)
 * zeichnet `extension.js` je Zeile aus dem Schema.
 */
import { DatasetPicker } from '../../ui/dataset-picker.js';
import { CHART_COLORS } from '../../core/chart/chart-colors.js';
import { rowExtension } from './extension.js';

/** @param {string} slot @returns {string} gemeinsamer Text, z. B. valueRef → ui.datasetPicker.slotV */
const sharedKey = (slot) => `ui.datasetPicker.slot${slot[0].toUpperCase()}`;

/**
 * @param {HTMLElement} root
 * @param {{ value: any, services: any, effect: Function }} w
 * @returns {{ destroy: () => void }}
 */
export function mount(root, { value, services, effect }) {
  const { i18n, moduleId } = services;
  const base = `modules.${moduleId}.fields.${value.name}`;
  const has = (key) => (i18n.has ? i18n.has(key) : i18n.exists ? i18n.exists(key) : i18n.t(key) !== key);
  const text = (key, fallback) => i18n.t(has(key) ? key : fallback);
  const spec = value.spec;
  const slots = Object.entries(spec.slots).map(([key, s]) => ({
    key,
    label: text(`${base}.${key}.label`, sharedKey(key)),
    title: text(`${base}.${key}.title`, sharedKey(key)),
    ...(s.types ? { types: [...s.types] } : {}),
    ...(s.minCount ? { minCount: s.minCount } : {}),
    ...(s.maxCount !== undefined ? { maxCount: s.maxCount } : {}),
    ...(s.required ? { required: true } : {}),
    ...(s.group ? { group: true } : {}),
    helpKey: `${base}.${key}.help`,
  }));
  const ext = spec.extension
    ? rowExtension(spec.extension, {
      base, t: (k) => i18n.t(k), has, stateManager: services.stateManager, noColumn: i18n.t('ui.datasetPicker.extNoColumn'),
    })
    : null;
  const picker = new DatasetPicker(root, services, {
    slots, multi: spec.multi, colors: spec.colors ? [...spec.colors] : CHART_COLORS, addHelpKey: `${base}.help`,
    ...(ext ? { rowExtension: ext } : {}),
    onChange: (rows) => { if (!value.set(rows)) picker.value = value.get(); },
  });
  effect(() => picker.syncValue(value.get()));
  return { destroy: () => picker.destroy() };
}
