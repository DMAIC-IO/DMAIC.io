/**
 * Spalten-Picker als Widget: `single` bei `columnRef`, `multi` bei
 * `list(columnRef)`, `types`/`minCount` aus der Beschreibung des gebundenen Feldes.
 */
import { ColumnPicker, refToKey } from '../../ui/column-picker.js';

/**
 * Filter aus den Eingaben `exclude` und `sameSheetAs`; `null`, wenn keine etwas einschränkt.
 * `sameSheetAs` nicht gebunden (`undefined`) lässt alles zu, `null` lässt nichts zu.
 * @param {{ exclude?: any[]|null, sameSheetAs?: any }} props
 * @returns {((col: any) => boolean)|null}
 */
function filterFor(props) {
  const exclude = props.exclude ?? null;
  const same = props.sameSheetAs;
  if (!exclude?.length && same === undefined) return null;
  const keys = new Set((exclude ?? []).map((r) => refToKey(r)));
  return (col) => !keys.has(refToKey(col))
    && (same === undefined || (same !== null && col.instanceId === same.instanceId && col.sheetId === same.sheetId));
}

/**
 * @param {HTMLElement} root
 * @param {{ props?: any, value: { spec: any, get: () => any, set: (v: any) => boolean }, services: any, effect: Function }} w
 * @returns {{ destroy: () => void }}
 */
export function mount(root, { value, props, services, effect }) {
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
  effect(() => picker.setFilter(filterFor(props)));
  effect(() => picker.syncValue(value.get() ?? empty));
  return { destroy: () => picker.destroy() };
}
