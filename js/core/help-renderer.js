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
import { formatAuthorYear } from './references-renderer.js';

/** Handbook term-ref → glossary marker span (hover button added at runtime). */
function handbookTermRef(id, label) {
  return h('span', { class: 'glossary-term', 'data-glossary-term': id }, label != null ? label : id);
}

/**
 * Handbook reference-ref → anchor into the references tab. Unknown ids render
 * as plain text (a typo must not become a dead link).
 * @param {Map<string, object>} byId
 * @returns {(id: string, label: string|null) => Node}
 */
function handbookRefRef(byId) {
  return (id, label) => {
    const entry = byId.get(id);
    if (!entry) return document.createTextNode(label != null ? label : id);
    return h('a', {
      href: '#',
      class: 'help-panel__ref-xref',
      'data-reference-id': id,
    }, label != null ? label : `(${formatAuthorYear(entry)})`);
  };
}

/**
 * Inline-parse `text` with handbook term-refs and reference-refs.
 * @param {string} text
 * @param {Map<string, object>} byId
 * @returns {Node[]}
 */
function inline(text, byId) {
  return parseInline(text || '', { termRef: handbookTermRef, refRef: handbookRefRef(byId) });
}

/**
 * Render one handbook block to a DOM node (or null if empty).
 * @param {object} b
 * @param {Map<string, object>} byId
 * @returns {Node|null}
 */
function renderBlock(b, byId) {
  if (!b) return null;
  switch (b.type) {
    case 'paragraph':
      return h('p', null, ...inline(b.content, byId));
    case 'definition':
      return h('p', null,
        h('strong', null, ...inline(b.term, byId), ':'),
        ' ',
        ...inline(b.content, byId),
      );
    case 'heading':
      return h('h4', null, ...inline(b.content, byId));
    case 'list':
      return h('ul', null, ...(b.items || []).map(it => h('li', null, ...inline(it, byId))));
    default:
      return b.content ? h('p', null, ...inline(b.content, byId)) : null;
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
 * @param {object[]} [references] - the module's reference entries (for {{ref:…}})
 * @returns {DocumentFragment}
 */
export function renderModuleHelp(helpDef, lang, references = []) {
  const frag = document.createDocumentFragment();
  const byId = new Map((Array.isArray(references) ? references : [])
    .filter(r => r && r.id).map(r => [r.id, r]));

  if (!helpDef || !helpDef.sections) {
    frag.append(h('p', null, 'No help content.'));
    return frag;
  }

  let emitted = false;
  for (const [, section] of Object.entries(helpDef.sections)) {
    const localized = section?.[lang] || section?.en || section?.de;
    if (!localized) continue;
    if (localized.title) { frag.append(h('h3', null, ...inline(localized.title, byId))); emitted = true; }
    for (const block of localized.blocks || []) {
      const node = renderBlock(block, byId);
      if (node) { frag.append(node); emitted = true; }
    }
  }

  if (!emitted) frag.append(h('p', null, 'No help content.'));
  return frag;
}
