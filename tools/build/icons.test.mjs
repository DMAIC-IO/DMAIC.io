import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIZES, normalizeSvg, restroke, svgToDataUri, buildIconsCss } from './icons.mjs';

const LUCIDE = `<!-- @license lucide-static v1.32.0 - ISC -->
<svg
  class="lucide lucide-trash-2"
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
>
  <path d="M3 6h18" />
</svg>`;

const ACCENT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30">'
  + '<circle cx="15" cy="15" r="10" fill="none" stroke="ACCENT" stroke-width="1.5"/></svg>';

test('normalizeSvg drops the license comment and the class attribute', () => {
  const out = normalizeSvg(LUCIDE);
  assert.ok(!out.includes('@license'), 'comment gone');
  assert.ok(!out.includes('class='), 'class gone');
  assert.ok(out.startsWith('<svg'), 'starts at the root tag');
  assert.ok(!out.includes('\n'), 'single line');
});

test('restroke rewrites stroke-width in the root tag only', () => {
  const out = restroke('<svg stroke-width="2"><path stroke-width="1"/></svg>', 2.25);
  assert.equal(out, '<svg stroke-width="2.25"><path stroke-width="1"/></svg>');
});

test('restroke leaves a fill-only icon untouched', () => {
  const src = '<svg viewBox="0 0 24 24"><rect width="4" height="4"/></svg>';
  assert.equal(restroke(src, 2.25), src);
});

test('svgToDataUri percent-encodes the markup', () => {
  const uri = svgToDataUri('<svg viewBox="0 0 1 1"/>');
  assert.ok(uri.startsWith('data:image/svg+xml,'), 'prefix');
  assert.ok(uri.includes('%3Csvg'), 'encoded');
});

test('SIZES carries the four steps with their stroke widths', () => {
  assert.deepEqual(SIZES, [
    { cls: '', strokeWidth: 2 },
    { cls: 'icon--xs', strokeWidth: 2.5 },
    { cls: 'icon--sm', strokeWidth: 2.25 },
    { cls: 'icon--lg', strokeWidth: 1.75 },
  ]);
});

test('buildIconsCss emits base, xs, sm and lg rules in that order', () => {
  const css = buildIconsCss({ 'action.delete': 'lucide:trash-2' }, () => LUCIDE);
  const iBase = css.indexOf('.icon[data-icon="action.delete"]');
  const iXs = css.indexOf('.icon--xs[data-icon="action.delete"]');
  const iSm = css.indexOf('.icon--sm[data-icon="action.delete"]');
  const iLg = css.indexOf('.icon--lg[data-icon="action.delete"]');
  assert.ok(iBase >= 0 && iXs > iBase && iSm > iXs && iLg > iSm, 'base < xs < sm < lg');
});

test('buildIconsCss bakes a different stroke width per size', () => {
  const css = buildIconsCss({ 'action.delete': 'lucide:trash-2' }, () => LUCIDE);
  assert.ok(css.includes(encodeURIComponent('stroke-width="2.5"')), 'xs stroke');
  assert.ok(css.includes(encodeURIComponent('stroke-width="2.25"')), 'sm stroke');
  assert.ok(css.includes(encodeURIComponent('stroke-width="1.75"')), 'lg stroke');
});

test('buildIconsCss gives accent icons one rule plus a dark override and no size rules', () => {
  const css = buildIconsCss({ 'chart.pie': 'own:chart-thumb-pie' }, () => ACCENT);
  assert.ok(css.includes('.icon[data-icon="chart.pie"]'), 'base rule');
  assert.ok(css.includes('[data-theme="dark"] .icon[data-icon="chart.pie"]'), 'dark override');
  assert.ok(!css.includes('.icon--sm[data-icon="chart.pie"]'), 'no sm rule');
  assert.ok(css.includes(encodeURIComponent('#0066cc')), 'light accent baked');
  assert.ok(css.includes(encodeURIComponent('#4da3ff')), 'dark accent baked');
});

test('buildIconsCss reports the icon name when a source is missing', () => {
  assert.throws(
    () => buildIconsCss({ 'action.delete': 'lucide:trash-2' }, () => { throw new Error('ENOENT'); }),
    /action\.delete/,
  );
});
