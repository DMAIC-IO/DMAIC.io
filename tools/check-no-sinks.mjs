#!/usr/bin/env node
/**
 * check-no-sinks — fail if any app source (js/, excluding vendor/) contains a
 * DOM-XSS sink or a Trusted-Types policy. This locks the zero-sink invariant:
 * with CSP `trusted-types 'none'` there is no policy to wrap a sink, so any
 * match would break the app at runtime. Assignment to innerHTML/outerHTML is a
 * sink; *reading* it is allowed.
 *
 * Every `new DOMParser` is flagged as a sink, EXCEPT when the very next line
 * parses `application/xml` — the single vetted non-HTML use. All DOMParser
 * construction is suspect; only XML parsing on the immediately following line
 * passes. This allowlist is intentionally narrow and can be expanded later.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SINKS = [
  /\.innerHTML\s*=(?!=)/,
  /\.outerHTML\s*=(?!=)/,
  /insertAdjacentHTML\s*\(/,
  /document\.write\s*\(/,
  /trustedTypes\.createPolicy\s*\(/,
];

const DOMPARSER = /\bnew\s+DOMParser\b/;
const XML_ALLOW = /parseFromString\s*\(.*['"]application\/xml['"]/;

/** @returns {{line:number, text:string}[]} */
export function findSinks(file, content) {
  const hits = [];
  const lines = content.split('\n');
  lines.forEach((line, i) => {
    if (SINKS.some(re => re.test(line))) { hits.push({ line: i + 1, text: line.trim() }); return; }
    if (DOMPARSER.test(line)) {
      const next = lines[i + 1] || '';
      if (XML_ALLOW.test(next)) return;          // allowed: XML parse on the very next line
      hits.push({ line: i + 1, text: line.trim() });
    }
  });
  return hits;
}

function jsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...jsFiles(p));
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

function main() {
  const jsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'js');
  let failed = false;
  for (const f of jsFiles(jsDir)) {
    for (const hit of findSinks(f, readFileSync(f, 'utf8'))) {
      console.error(`SINK ${f}:${hit.line}  ${hit.text}`);
      failed = true;
    }
  }
  if (failed) { console.error('\ncheck-no-sinks: FAILED — see sinks above'); process.exit(1); }
  console.log('check-no-sinks: OK — no DOM-XSS sinks in js/');
}

if (process.argv[1] && process.argv[1].endsWith('check-no-sinks.mjs')) main();
