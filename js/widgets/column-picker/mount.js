/**
 * Spalten-Picker als Widget: `single` bei `columnRef`, `multi` bei
 * `list(columnRef)`, `types`/`minCount` aus der Beschreibung des gebundenen Feldes.
 */
import { ColumnPicker } from '../../ui/column-picker.js';

/**
 * @param {HTMLElement} root
 * @param {{ value: { spec: any, get: () => any, set: (v: any) => boolean }, services: any, effect: Function }} w
 * @returns {{ destroy: () => void }}
 */
export function mount(root, { value, services, effect }) {
  const multi = value.spec.kind === 'list';
  const item = multi ? value.spec.item : value.spec;
  const empty = multi ? [] : null;
  const picker = new ColumnPicker(root, services, {
    mode: multi ? 'multi' : 'single',
    ...(item.types ? { types: [...item.types] } : {}),
    minCount: item.minCount ?? 0,
    ...(item.maxCount !== undefined ? { maxCount: item.maxCount } : {}),
    onChange: (v) => { if (!value.set(v ?? empty)) picker.syncValue(value.get() ?? empty); },
  });
  effect(() => picker.syncValue(value.get() ?? empty));
  return { destroy: () => picker.destroy() };
}
