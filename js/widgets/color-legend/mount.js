/**
 * Farblegende: eine Zeile aus Titel (entfällt, wenn leer) und Farbfeldern mit Wert. Die Stufen
 * rechnet `legendModel` (js/core/chart/color-legend.js); Stil in
 * js/core/chart/chart.css (`.dmike-color-legend`). Ohne Legende leer.
 */
import { h } from '../../core/dom.js';

/**
 * @param {HTMLElement} root
 * @param {{ props: any, effect: Function }} w
 * @returns {{ destroy: () => void }}
 */
export function mount(root, { props, effect }) {
  root.classList.add('dmike-color-legend');
  effect(() => {
    const legend = props.legend;
    root.style.display = legend ? '' : 'none';
    if (!legend) { root.replaceChildren(); return; }
    const title = legend.title === '' ? null : h('span', { class: 'dmike-color-legend__title', ...(legend.helpKey ? { 'data-help-key': legend.helpKey } : {}) }, legend.title);
    const items = legend.items.map((/** @type {{ color: string, value: string }} */ it) => {
      const swatch = h('span', { class: 'dmike-color-legend__swatch' });
      swatch.style.background = it.color;
      return h('span', { class: 'dmike-color-legend__item' }, swatch, h('span', {}, it.value));
    });
    root.replaceChildren(...(title ? [title] : []), ...items);
  });
  return {
    destroy: () => {
      root.replaceChildren();
      root.classList.remove('dmike-color-legend');
      root.style.display = '';
    },
  };
}
