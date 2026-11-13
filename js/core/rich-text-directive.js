/**
 * D.Mike — Direktive `x-rich-text="<ausdruck>"`: zeigt einen Markdown-Wert (`richText()`)
 * nur lesend an. Der Wert wird bei jeder Änderung über `markdownToFragment` neu aufgebaut
 * — ohne HTML-Zeichenkette, Markup im Wert bleibt Text.
 */
import { markdownToFragment } from './rich-text.js';

const registered = new WeakSet();

/**
 * Register the `x-rich-text` directive. Call BEFORE Alpine.start().
 * Idempotent per Alpine instance.
 * @param {object} Alpine - the csp.js default export
 */
export function registerRichTextDirective(Alpine) {
  if (registered.has(Alpine)) return;
  registered.add(Alpine);
  Alpine.directive('rich-text', (el, { expression }, { evaluateLater, effect }) => {
    const read = evaluateLater(expression);
    effect(() => read((value) => {
      el.replaceChildren(markdownToFragment(typeof value === 'string' ? value : ''));
    }));
  });
}
