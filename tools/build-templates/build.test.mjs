import { strict as assert } from 'node:assert';
import { buildTemplateBlock, validateTemplate, KEY_PREFIX } from './build.mjs';

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

console.log('build-templates: all assertions passed');
