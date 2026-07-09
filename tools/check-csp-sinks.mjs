import { readFileSync, globSync } from 'node:fs';
// Strict rule: NO innerHTML/outerHTML/insertAdjacentHTML/setHTML anywhere in
// js/{modules,core,ui}. template-module.js IS linted: its
// Alpine path mounts templates via core/dom.js `htmlFragment()` + replaceChildren
// (DOMParser, not a Trusted-Types sink). The app builds DOM via
// createElement/textContent (`h()`), Alpine templates, chartManager, or DOMParser
// (svg-parse / markdown-parser) — there is no HTML-string sink and no Trusted
// Types policy.
const files = globSync('app/dev/js/{modules,core,ui,algorithm-lab}/**/*.js');
const SINK = /\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML\s*\(|setHTML\s*\(/;

let bad = [];
for (const f of files) {
  readFileSync(f, 'utf8').split('\n').forEach((ln, i) => {
    if (SINK.test(ln)) bad.push(`${f}:${i + 1}: ${ln.trim()}`);
  });
}
if (bad.length) { console.error(`Raw HTML sinks (build DOM instead):\n${bad.join('\n')}`); process.exit(1); }
console.log('CSP sink check clean');
