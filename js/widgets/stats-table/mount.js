/** Kennzahlentabelle: zeichnet über renderStatsTable, sprachabhängig. */
import { renderStatsTable } from '../../core/stats-panel.js';

/**
 * @param {HTMLElement} root
 * @param {{ props: any, services: any, effect: Function }} w
 * @returns {{ destroy: () => void }}
 */
export function mount(root, { props, services, effect }) {
  const { i18n } = services;
  root.classList.add('dmike-stats-panel');
  effect(() => renderStatsTable(root, props.rows, { i18n, confLevel: props.confLevel, lang: i18n.getLanguage() }));
  return { destroy: () => root.replaceChildren() };
}
