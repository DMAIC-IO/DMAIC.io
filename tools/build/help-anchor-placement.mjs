/**
 * Placement rules for context-help anchors.
 *
 * The Alt badge is positioned right of its anchor (`left: 100%`). On a
 * full-width block that is the panel's right edge, far from the text. Block
 * headings therefore must not carry the help key themselves; the key belongs
 * on a `<span>` around the heading text:
 *
 *   <div class="dmike-split__section-title"><span data-help-key="…" x-text="…"></span></div>
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Classes of full-width headings that must not be help anchors themselves. */
export const BLOCK_HEADING_CLASSES = ['dmike-split__section-title'];

const OPENING_TAG = /<[a-zA-Z][\w-]*\b[^<>]*>/g;
const CLASS_ATTR = /(?<![:\w-])class\s*=\s*["']([^"']*)["']/;
const HELP_KEY_ATTR = /(?<![\w-]):?data-help-key\s*=/;

/**
 * Opening tags in `source` that carry a help key on a block heading.
 * @param {string} source  HTML or JS source text
 * @returns {Array<{ line: number, tag: string }>}
 */
export function findBlockHeadingAnchors(source) {
  const hits = [];
  for (const m of source.matchAll(OPENING_TAG)) {
    const tag = m[0];
    if (!HELP_KEY_ATTR.test(tag)) continue;
    const cls = tag.match(CLASS_ATTR)?.[1]?.split(/\s+/) ?? [];
    if (!cls.some(c => BLOCK_HEADING_CLASSES.includes(c))) continue;
    const line = source.slice(0, m.index).split('\n').length;
    hits.push({ line, tag });
  }
  return hits;
}

/**
 * Scan every `.html` and `.js` file below `<appDir>/js`.
 * @param {string} appDir
 * @returns {string[]}  `path:line  tag` per violation
 */
export function scanBlockHeadingAnchors(appDir) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(html|js)$/.test(entry.name)) {
        for (const hit of findBlockHeadingAnchors(readFileSync(path, 'utf8'))) {
          out.push(`${relative(appDir, path)}:${hit.line}  ${hit.tag}`);
        }
      }
    }
  };
  walk(join(appDir, 'js'));
  return out;
}
