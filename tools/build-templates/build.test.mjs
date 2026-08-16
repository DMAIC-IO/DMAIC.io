import { strict as assert } from 'node:assert';
import { buildTemplateBlock, validateTemplate, expandIncludes, isPartial, KEY_PREFIX } from './build.mjs';

// validateTemplate rejects scripts and inline handlers
assert.throws(() => validateTemplate('x.html', '<div><script>x()</script></div>'), /script/i);
assert.throws(() => validateTemplate('x.html', '<div onclick="x()"></div>'), /handler/i);
assert.doesNotThrow(() => validateTemplate('x.html', '<div @click="x()" x-text="y"></div>'));

// buildTemplateBlock wraps each file with a data-tpl key
const block = buildTemplateBlock([
  { key: 'js/modules/sipoc/sipoc.html', content: '<section x-data="sipoc"></section>' },
]);
assert.match(block, /<template data-tpl="js\/modules\/sipoc\/sipoc\.html">/);
assert.match(block, /<section x-data="sipoc"><\/section>/);
assert.equal(KEY_PREFIX, 'js/');

// expandIncludes inlines a shared partial in place of the directive
{
  const parts = new Map([['js/core/flowchart/substeps.part.html', '<div class="fc-substeps"></div>']]);
  const out = expandIncludes(
    'js/modules/process-map/process-map.html',
    '<div class="card">\n  <!-- @include js/core/flowchart/substeps.part.html -->\n</div>',
    (key) => parts.get(key),
  );
  assert.match(out, /<div class="fc-substeps"><\/div>/);
  assert.doesNotMatch(out, /@include/);
}

// the same partial can be included more than once (one directive per line)
{
  const out = expandIncludes('x.html', '<!-- @include p.html -->\n<!-- @include p.html -->', () => '<b></b>');
  assert.equal((out.match(/<b><\/b>/g) || []).length, 2);
}

// the inlined block keeps the host template's indentation
{
  const out = expandIncludes('x.html', '    <!-- @include p.html -->', () => '<a>\n  <b></b>\n</a>');
  assert.equal(out, '    <a>\n      <b></b>\n    </a>');
}

// nested includes are a build error, not a silent partial expansion
assert.throws(
  () => expandIncludes('x.html', '<!-- @include outer.html -->', () => '<!-- @include inner.html -->'),
  /nested/i,
);

// a template without the directive is returned untouched
{
  const src = '<div x-data="sipoc"></div>';
  assert.equal(expandIncludes('x.html', src, () => { throw new Error('must not be called'); }), src);
}

// an unknown partial is a build error, not a silently empty block
assert.throws(
  () => expandIncludes('x.html', '<!-- @include nope.html -->', () => undefined),
  /nope\.html/,
);

// a partial's leading doc comment documents the file, it is not shipped into
// every host template (four copies of it would bloat index.html)
{
  const partial = '<!--\n  what this block is for\n-->\n<div class="fc-substeps"></div>';
  const out = expandIncludes('x.html', '<!-- @include p.html -->', () => partial);
  assert.equal(out, '<div class="fc-substeps"></div>');
}

// only the LEADING comment is stripped — inline comments survive
{
  const partial = '<div>\n  <!-- keep me -->\n</div>';
  const out = expandIncludes('x.html', '<!-- @include p.html -->', () => partial);
  assert.match(out, /keep me/);
}

// partials are not emitted as templates of their own
assert.equal(isPartial('js/core/flowchart/substeps.part.html'), true);
assert.equal(isPartial('js/modules/sipoc/sipoc.html'), false);

console.log('build-templates: all assertions passed');
