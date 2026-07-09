/**
 * dom.js — tiny declarative DOM builder. Replaces innerHTML string assembly.
 * h('div', { class: 'x' }, child, 'text') -> HTMLElement.
 * Attributes via setAttribute; string/number children via textContent (escaped
 * natively); node children appended; null/undefined/false children skipped.
 */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === false || v == null) continue;
      el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * svg('rect', { x: 3 }, child, …) — SVG-namespace sibling of h().
 * Builds via createElementNS so nested children stay in the SVG namespace.
 * Attrs: false/null/undefined skipped; true → empty string; else String(v).
 * Children: Node appended as-is, string/number → text node, falsy skipped,
 * arrays flattened. Use s({...}) for the `style` attr.
 * @param {string} tag  @param {Object|null} [attrs]  @param {...*} children
 * @returns {SVGElement}
 */
export function svg(tag, attrs, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === false || v == null) continue;
      el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/**
 * s({ strokeWidth: 2, fill: 'red' }) → "stroke-width:2;fill:red".
 * camelCase → dash-case; null/undefined values skipped. For inline style attrs.
 * @param {Object} obj  @returns {string}
 */
export function s(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${k.replace(/[A-Z]/g, m => `-${  m.toLowerCase()}`)}:${v}`)
    .join(';');
}

/**
 * Derive an inlined-template key from a template URL: the path starting at
 * `js/` (deployment-agnostic — works under /app/dev/ and /app/<tag>/).
 * @param {string} url  @returns {string}
 */
export function templateKey(url) {
  const path = new URL(url, document.baseURI).pathname;
  const i = path.indexOf('/js/');
  return i >= 0 ? path.slice(i + 1) : path.replace(/^\//, '');
}

/**
 * Clone an inlined <template data-tpl="key"> into live DOM nodes. cloneNode is
 * NOT a Trusted-Types sink, so this needs no policy. Templates are author-time
 * trusted (validated by tools/build-templates).
 * @param {string} key  @returns {Node[]}
 */
export function cloneTemplate(key) {
  const tpl = document.querySelector(`template[data-tpl="${CSS.escape(key)}"]`);
  if (!tpl) throw new Error(`Unknown template: ${  key}`);
  return [...tpl.content.cloneNode(true).childNodes];
}

