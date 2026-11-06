/**
 * Coverage rule for the generic delete confirmation (js/core/delete-confirm.js).
 *
 * Every template element whose click handler calls a delete method
 * (`remove…`, `delete…`, `confirmDelete…`, `confirmRemove…`) must be seen by
 * the generic layer: it contains the trash icon (`data-icon="action.delete"`)
 * or carries `data-confirm-delete` — `="off"` when its handler asks itself.
 * Anything else is listed in DELETE_CONFIRM_EXEMPTIONS with a reason.
 *
 * Spec: docs/superpowers/specs/2026-11-06-delete-confirm-design.md
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Click handlers that delete but deliberately do not ask.
 * Key: `<path below js/>#<method>`, value: the reason.
 */
export const DELETE_CONFIRM_EXEMPTIONS = {
  'modules/calculator/calculator.html#removeLast': 'backspace key of the calculator input, not a delete of data',
  'modules/calculator/calculator.html#removeLastSS': 'backspace key of the calculator input, not a delete of data',
};

const OPENING_TAG = /<([a-zA-Z][\w-]*)\b[^<>]*>/g;
const CLICK_ATTR = /(?<![\w-])(?:@click|x-on:click)(?:\.[\w.-]+)?\s*=\s*"([^"]*)"/;
const DELETE_CALL = /(?:^|[^\w.])(?:[\w$]+\.)*((?:remove|delete|confirmDelete|confirmRemove)[A-Z]?\w*)\s*\(/;
const FLAG_ATTR = /(?<![\w-]):?data-confirm-delete\b/;
const TRASH = 'data-icon="action.delete"';

/**
 * Delete-click elements in `source` the generic confirmation does not see.
 * @param {string} source  template HTML
 * @returns {Array<{ line: number, method: string, tag: string }>}
 */
export function findUnconfirmedDeletes(source) {
  const hits = [];
  for (const m of source.matchAll(OPENING_TAG)) {
    const tag = m[0];
    const click = tag.match(CLICK_ATTR);
    if (!click) continue;
    const call = click[1].match(DELETE_CALL);
    if (!call) continue;
    if (FLAG_ATTR.test(tag)) continue;
    const after = m.index + tag.length;
    const close = source.indexOf(`</${m[1]}`, after);
    const inner = source.slice(after, close === -1 ? after : close);
    if (inner.includes(TRASH)) continue;
    const line = source.slice(0, m.index).split('\n').length;
    hits.push({ line, method: call[1], tag: tag.replace(/\s+/g, ' ') });
  }
  return hits;
}

/**
 * Scan every `.html` file below `<appDir>/js`.
 * @param {string} appDir
 * @param {Record<string,string>} [exemptions]
 * @returns {string[]}  `path:line  method  tag` per violation
 */
export function scanUnconfirmedDeletes(appDir, exemptions = DELETE_CONFIRM_EXEMPTIONS) {
  const root = join(appDir, 'js');
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.html')) {
        const rel = relative(root, path);
        for (const hit of findUnconfirmedDeletes(readFileSync(path, 'utf8'))) {
          if (exemptions[`${rel}#${hit.method}`]) continue;
          out.push(`${rel}:${hit.line}  ${hit.method}  ${hit.tag}`);
        }
      }
    }
  };
  walk(root);
  return out;
}
