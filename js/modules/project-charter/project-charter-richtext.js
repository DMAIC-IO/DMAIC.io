/**
 * project-charter-richtext.js — sink-free rich-text for the Project Charter
 * problem statement. Storage format is a strict 2-mark Markdown subset
 * (**bold**, *italic*, \n = line break). Only `*` and `\` are special.
 *
 * No HTML strings are ever assigned and DOMParser is never used: load builds
 * DOM via createElement/createTextNode, so the output is XSS-safe by
 * construction regardless of input.
 */

/** True if `s` looks like legacy stored HTML (pre-Markdown). */
export function isLegacyHtml(s) {
  return /<[a-z][\s\S]*>/i.test(String(s ?? ''));
}

/**
 * One-time, best-effort legacy HTML → Markdown conversion. Safe because the
 * OUTPUT is a string fed to the sink-free Markdown loader — a regex slip can
 * only mangle formatting, never inject. Only the RTE's own tag subset matters.
 * @param {string} html  @returns {string}
 */
export function htmlToMarkdown(html) {
  return String(html ?? '')
    .replace(/<(?:strong|b)\b[^>]*>/gi, '**').replace(/<\/(?:strong|b)>/gi, '**')
    .replace(/<(?:em|i)\b[^>]*>/gi, '*').replace(/<\/(?:em|i)>/gi, '*')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:div|p)>/gi, '\n')
    .replace(/<[^>]+>/g, '')                 // drop every other tag
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#0*39;/g, "'").replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, '&')                 // amp LAST to avoid double-decode
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '');
}

/** Normalize any stored/imported value to the Markdown storage format. */
export function normalizeProblemStatement(raw) {
  const s = typeof raw === 'string' ? raw : '';
  return isLegacyHtml(s) ? htmlToMarkdown(s) : s;
}

/** Escape the only special chars of the RTE grammar for literal text. */
function escapeMd(text) {
  return String(text ?? '').replace(/[\\*]/g, m => `\\${  m}`);
}

/**
 * Parse one line of RTE Markdown into DOM nodes (text + <strong>/<em>).
 * Honors backslash escapes; `**` is matched before `*`. Output is built only
 * via createElement/createTextNode — never a string sink.
 * @param {string} line  @returns {Node[]}
 */
function parseLine(line) {
  const out = [];
  let buf = '';
  const flush = () => { if (buf) { out.push(document.createTextNode(buf)); buf = ''; } };
  const src = String(line ?? '');
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\' && i + 1 < src.length) { buf += src[i + 1]; i += 2; continue; }
    if (ch === '*') {
      const bold = src.startsWith('**', i);
      const mark = bold ? '**' : '*';
      const end = findClose(src, i + mark.length, mark);
      if (end !== -1) {
        flush();
        const inner = src.slice(i + mark.length, end);
        const node = document.createElement(bold ? 'strong' : 'em');
        node.append(...parseLine(inner));
        out.push(node);
        i = end + mark.length;
        continue;
      }
    }
    buf += ch; i += 1;
  }
  flush();
  return out;
}

/** Find the next unescaped occurrence of `mark` at/after `from`. */
function findClose(src, from, mark) {
  for (let i = from; i <= src.length - mark.length; i++) {
    if (src[i] === '\\') { i += 1; continue; }
    if (src.startsWith(mark, i)) return i;
  }
  return -1;
}

/**
 * RTE Markdown → DocumentFragment. Lines split on \n become <br>-separated.
 * @param {string} md  @returns {DocumentFragment}
 */
export function markdownToFragment(md) {
  const frag = document.createDocumentFragment();
  const text = String(md ?? '');
  if (!text) return frag;
  text.split('\n').forEach((line, idx) => {
    if (idx > 0) frag.appendChild(document.createElement('br'));
    for (const node of parseLine(line)) frag.appendChild(node);
  });
  return frag;
}

const WRAP = { B: '**', STRONG: '**', I: '*', EM: '*' };

/**
 * Serialize the editor's live DOM back to RTE Markdown. Walks child nodes;
 * text is escaped, B/STRONG → **, I/EM → *, BR and DIV/P boundaries → \n.
 * @param {Node} root  @returns {string}
 */
export function domToMarkdown(root) {
  const walk = (node) => {
    let out = '';
    node.childNodes.forEach(child => {
      if (child.nodeType === 3) {                 // text
        out += escapeMd(child.nodeValue);
      } else if (child.nodeType === 1) {          // element
        const tag = child.tagName;
        if (tag === 'BR') { out += '\n'; return; }
        const wrap = WRAP[tag];
        if (wrap) { out += wrap + walk(child) + wrap; return; }
        if (tag === 'DIV' || tag === 'P') {        // block boundary
          if (out !== '') out += '\n';             // newline only if content precedes this block
          out += walk(child);
          return;
        }
        out += walk(child);                        // unknown wrapper: unwrap
      }
    });
    return out;
  };
  return walk(root).replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '');
}
