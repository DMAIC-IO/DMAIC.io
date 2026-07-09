/**
 * markdown-parser.js — shared inline-markdown → DOM parser.
 *
 * Parses the app's small custom inline-markdown grammar (NOT CommonMark) and
 * emits DOM nodes directly — no markdown→HTML-string→DOM-sink pipeline. All
 * literal text is produced via document.createTextNode, so it is escaped
 * natively; this module never builds HTML strings and never assigns markup.
 *
 * Grammar (token priority order):
 *   1. `$latex$`              → inline-math placeholder
 *        <span class="dmike-math-inline" data-katex-inline="<body>"><body></span>
 *        Body must be non-empty with no whitespace at the delimiters. KaTeX is
 *        rendered into the placeholder LATER by core/katex-loader.js — this
 *        parser only emits the placeholder, it never calls KaTeX.
 *   2. `**bold**`             → <strong>
 *   3. `*italic*`             → <em>
 *   4. `{{term:id|label}}` / `{{term:id}}` → cross-reference; the output node
 *        is caller-defined via opts.termRef(id, label|null). When termRef is
 *        omitted the term falls back to a plain text node (label || id).
 *
 * Bold (`**`) is matched before italic (`*`). The inner content of bold/italic
 * is kept as a plain text node (matching legacy behavior — the old renderers
 * did not recurse term refs/math inside emphasis).
 *
 * @see docs/HELP-SYSTEM.md
 */

import { h } from './dom.js';

// Token matchers. Math first (so `$…$` survives), then bold (before italic),
// then italic, then term refs. Each pattern is anchored-free (searched in the
// remaining text) and capturing the body.
const MATH = /\$(\S(?:[^$\n]*?\S)?)\$/;
const BOLD = /\*\*([^*]+)\*\*/;
const ITALIC = /\*([^*]+)\*/;
const TERM = /\{\{term:([a-z0-9-]+)(?:\|([^}]+))?\}\}/i;

/**
 * Find the earliest-matching token in `text`.
 * @param {string} text
 * @returns {{ index:number, length:number, build:() => Node } | null}
 */
function nextToken(text, opts) {
  let best = null;
  const consider = (re, build) => {
    const m = re.exec(text);
    if (!m) return;
    if (best === null || m.index < best.index) {
      best = { index: m.index, length: m[0].length, build: () => build(m) };
    }
  };

  // Order here is the tie-breaker only when indices are equal; since `**` and
  // `*` can start at the same index, evaluate bold before italic so the longer
  // delimiter wins.
  consider(MATH, (m) => {
    const body = m[1];
    return h('span', { class: 'dmike-math-inline', 'data-katex-inline': body }, body);
  });
  consider(BOLD, (m) => h('strong', null, m[1]));
  consider(ITALIC, (m) => h('em', null, m[1]));
  consider(TERM, (m) => {
    const id = m[1];
    const label = m[2] != null ? m[2] : null;
    if (typeof opts.termRef === 'function') {
      const node = opts.termRef(id, label);
      if (node instanceof Node) return node;
    }
    return document.createTextNode(label != null ? label : id);
  });

  return best;
}

/**
 * Parse one line/run of inline markdown into DOM nodes.
 * @param {string} text  raw (UNescaped) source text
 * @param {{ termRef?: (id:string, label:string|null) => Node }} [opts]
 * @returns {Node[]}  text nodes + <strong>/<em>/<span data-katex-inline>/term-ref nodes
 */
export function parseInline(text, opts = {}) {
  const out = [];
  let rest = String(text ?? '');

  while (rest.length > 0) {
    const tok = nextToken(rest, opts);
    if (!tok) {
      out.push(document.createTextNode(rest));
      break;
    }
    if (tok.index > 0) {
      out.push(document.createTextNode(rest.slice(0, tok.index)));
    }
    out.push(tok.build());
    rest = rest.slice(tok.index + tok.length);
  }

  return out;
}

/**
 * Convenience: parse `text` and append the resulting nodes into `host`.
 * @param {Node} host
 * @param {string} text
 * @param {{ termRef?: (id:string, label:string|null) => Node }} [opts]
 * @returns {Node} the host
 */
export function appendInline(host, text, opts = {}) {
  for (const node of parseInline(text, opts)) host.append(node);
  return host;
}
