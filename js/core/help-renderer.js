/**
 * help-renderer.js — module-handbook rendering → DOM nodes.
 *
 * Renders a module's lazy-loaded help definition (`helpDef.sections`) into a
 * DocumentFragment using the shared inline-markdown parser. No HTML strings,
 * no DOMParser — everything is built with `h()` + `parseInline()`, so literal
 * text is escaped natively via text nodes.
 *
 * The handbook content IS inline-markdown: `**bold**`, `*italic*`, `$latex$`
 * (inline-math placeholder, rendered later by core/katex-loader.js) and
 * `{{term:id|label}}` cross-references. Previously the handbook renderer only
 * handled term-refs + escaping; routing through parseInline means bold/italic/
 * math now render too — this is the intended enhancement.
 *
 * Handbook term-refs emit a marker span:
 *   <span class="glossary-term" data-glossary-term="id">label||id</span>
 * The hover button is added at runtime by core/glossary-inline.js — NOT here.
 *
 * @see docs/HELP-SYSTEM.md
 */

import { h } from './dom.js';
import { parseInline } from './markdown-parser.js';

/** Handbook term-ref → glossary marker span (hover button added at runtime). */
function handbookTermRef(id, label) {
  return h('span', { class: 'glossary-term', 'data-glossary-term': id }, label != null ? label : id);
}

/** Inline-parse `text` with the handbook term-ref output. @returns {Node[]} */
function inline(text) {
  return parseInline(text || '', { termRef: handbookTermRef });
}

/**
 * Render one handbook block to a DOM node (or null if empty).
 * @param {object} b
 * @returns {Node|null}
 */
function renderBlock(b) {
  if (!b) return null;
  switch (b.type) {
    case 'paragraph':
      return h('p', null, ...inline(b.content));
    case 'definition':
      return h('p', null,
        h('strong', null, ...inline(b.term), ':'),
        ' ',
        ...inline(b.content),
      );
    case 'heading':
      return h('h4', null, ...inline(b.content));
    case 'list':
      return h('ul', null, ...(b.items || []).map(it => h('li', null, ...inline(it))));
    default:
      return b.content ? h('p', null, ...inline(b.content)) : null;
  }
}

/**
 * Render a module help definition into a DocumentFragment.
 * Walks `helpDef.sections` (each localized `[lang] || en || de`), emitting an
 * `<h3>` per section title and one node per block. Empty / no-sections input
 * yields a single fallback `<p>`.
 *
 * @param {object} helpDef - Help module's default export
 * @param {string} lang - Current language code
 * @returns {DocumentFragment}
 */
export function renderModuleHelp(helpDef, lang) {
  const frag = document.createDocumentFragment();

  if (!helpDef || !helpDef.sections) {
    frag.append(h('p', null, 'No help content.'));
    return frag;
  }

  let emitted = false;
  for (const [, section] of Object.entries(helpDef.sections)) {
    const localized = section?.[lang] || section?.en || section?.de;
    if (!localized) continue;
    if (localized.title) { frag.append(h('h3', null, ...inline(localized.title))); emitted = true; }
    for (const block of localized.blocks || []) {
      const node = renderBlock(block);
      if (node) { frag.append(node); emitted = true; }
    }
  }

  if (!emitted) frag.append(h('p', null, 'No help content.'));
  return frag;
}
