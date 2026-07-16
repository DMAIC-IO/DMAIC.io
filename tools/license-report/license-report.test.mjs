import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  RUNTIME_DEPS, collectLicenseData, renderLicenseDataModule, renderLicenseText,
} from './license-report.mjs';

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('RUNTIME_DEPS is exactly the six shipped runtime deps', () => {
  assert.deepEqual(
    [...RUNTIME_DEPS].sort(),
    ['@alpinejs/csp', 'katex', 'opentype.js', 'papaparse', 'prismjs', 'xlsx'],
  );
});

test('collectLicenseData captures all six deps, sorted, with text', async () => {
  const entries = await collectLicenseData(APP_DIR);
  assert.equal(entries.length, 6);
  const names = entries.map(e => e.name);
  assert.deepEqual(names, [...names].sort(), 'entries sorted by name');
  for (const e of entries) {
    assert.ok(e.version, `${e.name} has version`);
    assert.ok(e.license, `${e.name} has license`);
    assert.ok(e.url, `${e.name} has url`);
    assert.ok(e.text && e.text.length > 20, `${e.name} has license text`);
  }
});

test('xlsx resolves to Apache-2.0', async () => {
  const entries = await collectLicenseData(APP_DIR);
  const xlsx = entries.find(e => e.name === 'xlsx');
  assert.match(xlsx.license, /Apache-2\.0/);
});

test('renderLicenseDataModule emits LICENSES without full text', () => {
  const mod = renderLicenseDataModule([
    { name: 'katex', version: '0.16.11', license: 'MIT', url: 'https://katex.org', text: 'FULL LICENSE BODY' },
  ]);
  assert.match(mod, /export const LICENSES/);
  assert.match(mod, /"name":\s*"katex"/);
  assert.doesNotMatch(mod, /FULL LICENSE BODY/, 'full text must not leak into the JS module');
});

test('renderLicenseText includes header + verbatim body', () => {
  const txt = renderLicenseText([
    { name: 'katex', version: '0.16.11', license: 'MIT', url: 'https://katex.org', text: 'PERMISSION IS HEREBY GRANTED' },
  ]);
  assert.match(txt, /katex/);
  assert.match(txt, /0\.16\.11/);
  assert.match(txt, /PERMISSION IS HEREBY GRANTED/);
});

test('@alpinejs/csp attribution comes from the SPDX MIT fallback (no LICENSE file)', async () => {
  const entries = await collectLicenseData(APP_DIR);
  const alpine = entries.find(e => e.name === '@alpinejs/csp');
  assert.ok(alpine, '@alpinejs/csp present');
  assert.match(alpine.license, /MIT/);
  assert.match(alpine.text, /Permission is hereby granted/);
  assert.match(alpine.text, /WITHOUT WARRANTY OF ANY KIND/);
});

test('renderLicenseText output contains SIL OFL text and KaTeX font attribution', () => {
  const txt = renderLicenseText([
    { name: 'katex', version: '0.16.11', license: 'MIT', url: 'https://katex.org', text: 'MIT License' },
  ]);
  assert.match(txt, /SIL OPEN FONT LICENSE/, 'must contain SIL OPEN FONT LICENSE');
  assert.match(txt, /Reserved Font Name/, 'must contain Reserved Font Name');
  assert.match(txt, /KaTeX/, 'must contain KaTeX');
});

test('collectLicenseData still returns exactly 6 entries (fonts must not leak into page data)', async () => {
  const entries = await collectLicenseData(APP_DIR);
  assert.equal(entries.length, 6, 'exactly six npm entries — no font attribution');
});

test('renderLicenseDataModule output does not contain OFL or OPEN FONT text', () => {
  const entries = [
    { name: 'katex', version: '0.16.11', license: 'MIT', url: 'https://katex.org', text: 'MIT License' },
  ];
  const mod = renderLicenseDataModule(entries);
  assert.doesNotMatch(mod, /OFL/, 'OFL must not appear in the compact page module');
  assert.doesNotMatch(mod, /OPEN FONT/, 'OPEN FONT must not appear in the compact page module');
});

test('generate.mjs --check exits 0 when artifacts are current', () => {
  const generateCli = join(dirname(fileURLToPath(import.meta.url)), 'generate.mjs');
  let exitCode = 0;
  try {
    execFileSync(process.execPath, [generateCli, '--check'], { encoding: 'utf8' });
  } catch (err) {
    exitCode = err.status ?? 1;
  }
  assert.equal(exitCode, 0, '--check must exit 0 when committed artifacts match generated output');
});
