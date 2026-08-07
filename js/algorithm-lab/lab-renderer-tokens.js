/**
 * Algorithm Lab — Prism token → DOM walker (dependency-free seam).
 *
 * Split out of lab-renderer.js so the pure walker can be unit-tested unbundled:
 * it imports only dom.js `h()` and never pulls in Prism/KaTeX, which have no ESM
 * build and only resolve inside the esbuild bundle.
 */

import { h } from '../core/dom.js';

/**
 * Convert a Prism token stream into DOM nodes (no innerHTML, no eval).
 *
 * Mirrors Prism's stringifier class output exactly: each `Token` becomes a
 * `<span class="token <type> <alias…>">`, so existing prism.css /
 * prism-tomorrow.css selectors keep matching. Plain strings become text nodes.
 * `token.content` may itself be a string or an array of tokens (nested
 * grammars, e.g. template strings / interpolation) — handled recursively.
 *
 * Duck-types on `.content` rather than `instanceof Prism.Token`, so the walker
 * is unit-testable with hand-built token objects and never touches Prism.
 *
 * @param {Array<string|{type:string, content:(string|Array), alias?:(string|string[])}>} tokens
 * @returns {Node[]} flat list of text nodes and <span> elements, in order
 */
export function tokensToNodes(tokens) {
  const out = [];
  for (const token of tokens) {
    if (typeof token === 'string') {
      out.push(document.createTextNode(token));
      continue;
    }
    // Build the class list exactly like Prism: ["token", type, ...aliases].
    const classes = ['token', token.type];
    const alias = token.alias;
    if (Array.isArray(alias)) classes.push(...alias);
    else if (alias) classes.push(alias);

    // content is a string (leaf) or an array of child tokens (recurse).
    const children = typeof token.content === 'string'
      ? [document.createTextNode(token.content)]
      : tokensToNodes(token.content);

    out.push(h('span', { class: classes.join(' ') }, ...children));
  }
  return out;
}
