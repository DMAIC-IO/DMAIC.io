/**
 * D.Mike — Spalten-Picker als Widget für x-field (column-field.js)
 *
 * Hängt den `ColumnPicker` an das Wirtselement eines `columnRef`-Feldes:
 * `single` bei `columnRef`, `multi` bei `list(columnRef)`, `types`/`minCount`
 * aus dem Schema. Die Liste hält der Picker über seine eigenen Abonnements
 * aktuell.
 */
import { ColumnPicker } from './column-picker.js';

/**
 * @param {HTMLElement} el Wirtselement
 * @param {{ spec: any, get: () => any, set: (v: any) => void }} target
 * @param {{ eventBus: any, stateManager: any, i18n: any }} services
 * @returns {{ sync: (value: any) => void, destroy: () => void }}
 */
export function mountColumnField(el, target, services) {
  const multi = target.spec.kind === 'list';
  const item = multi ? target.spec.item : target.spec;
  const picker = new ColumnPicker(el, services, {
    mode: multi ? 'multi' : 'single',
    ...(item.types ? { types: [...item.types] } : {}),
    minCount: item.minCount ?? 0,
    onChange: (value) => target.set(multi ? (value ?? []) : (value ?? null)),
  });
  return {
    sync: (value) => { picker.syncValue(value ?? (multi ? [] : null)); },
    destroy: () => picker.destroy(),
  };
}
