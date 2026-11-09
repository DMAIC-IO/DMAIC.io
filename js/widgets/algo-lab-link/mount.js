/** Algorithm-Lab-Knopf: ein Knopf je gesetzter id, Titel nach Sprache. */
import { h } from '../../core/dom.js';
import { icon } from '../../core/icon.js';

/**
 * @param {HTMLElement} root
 * @param {{ props: any, services: any, effect: Function }} w
 * @returns {{ destroy: () => void }}
 */
export function mount(root, { props, services, effect }) {
  const { i18n } = services;
  effect(() => {
    i18n.getLanguage();
    const algoId = props.algoId;
    if (!algoId) { root.replaceChildren(); return; }
    const title = i18n.t('common.algoLabTitle');
    const btn = h('button', { type: 'button', class: 'dmike-algo-link', 'data-algo-id': algoId, title, 'aria-label': title },
      icon('nav.algorithm-lab', { size: 'sm', cls: 'icon--text' }));
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      services.eventBus?.emit('lab:navigate', { algoId, tab: 'docs' });
    });
    root.replaceChildren(btn);
  });
  return { destroy: () => root.replaceChildren() };
}
