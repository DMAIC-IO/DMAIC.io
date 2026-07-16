import { strict as assert } from 'node:assert';
import { findSinks } from './check-no-sinks.mjs';

assert.deepEqual(findSinks('clean.js', 'const x = el.textContent;'), []);
assert.ok(findSinks('a.js', 'el.innerHTML = x;').length === 1);
// DOMParser: flagged by default
assert.ok(findSinks('a.js', 'const p = new DOMParser();').length === 1);
// DOMParser allowed IFF next line is application/xml parse
assert.deepEqual(findSinks('a.js', "const p = new DOMParser();\nconst d = p.parseFromString(text, 'application/xml');"), []);
// DOMParser + text/html (one line, and next-line) → flagged
assert.ok(findSinks('a.js', "new DOMParser().parseFromString(s, 'text/html')").length === 1);
assert.ok(findSinks('a.js', "const p = new DOMParser();\np.parseFromString(s, 'text/html');").length === 1);
assert.ok(findSinks('a.js', "trustedTypes.createPolicy('p', {})").length === 1);
assert.ok(findSinks('a.js', 'el.insertAdjacentHTML("beforeend", s)').length === 1);
// reading innerHTML is allowed (assignment only)
assert.deepEqual(findSinks('a.js', 'const h = el.innerHTML;'), []);
console.log('check-no-sinks: assertions passed');
