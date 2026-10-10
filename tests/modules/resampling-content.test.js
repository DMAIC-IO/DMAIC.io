/**
 * D.Mike — Resampling module content: handbook, references, glossary terms,
 * and the four catalog examples (one per mode) — each example must load,
 * validate and compute.
 */

import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import help from '../../js/modules/resampling/resampling-help.js';
import references from '../../js/modules/resampling/resampling-references.js';
import { State } from '../../js/modules/resampling/resampling-model.js';
import { readInputs, validateInputs, buildJobs } from '../../js/modules/resampling/resampling-analysis.js';
import { runJobSync } from '../../js/engines/resampling-engine.js';

async function fetchJson(relPath) {
  const res = await fetch(new URL(relPath, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

async function exists(relPath) {
  const res = await fetch(new URL(relPath, import.meta.url), { cache: 'no-cache' });
  return res.ok;
}

function strings(node, out = []) {
  if (node == null) return out;
  if (typeof node === 'string') { out.push(node); return out; }
  if (Array.isArray(node)) { node.forEach((v) => strings(v, out)); return out; }
  if (typeof node === 'object') Object.values(node).forEach((v) => strings(v, out));
  return out;
}

const NEW_TERMS = ['bootstrap', 'permutationstest', 'bca-intervall'];
const EXAMPLES = {
  'resampling-ppk-bolzen': 'one',
  'resampling-pizza-two': 'two',
  'resampling-ruestzeit-paired': 'paired',
  'resampling-pizza-k': 'k',
};

suite('resampling — handbook and references', () => {
  test('overview, methodology and pitfalls in both languages', () => {
    assertEqual(help.moduleId, 'resampling');
    assertEqual(Object.keys(help.sections).join(','), 'overview,methodology,pitfalls');
    for (const section of Object.values(help.sections)) {
      for (const lang of ['de', 'en']) {
        assertTrue(Boolean(section[lang].title), `title ${lang}`);
        assertTrue(section[lang].blocks.length > 0, `blocks ${lang}`);
      }
    }
  });
  test('references: ids and localized notes', () => {
    assertEqual(references.map((r) => r.id).join(','), 'efron-tibshirani-1993,davison-hinkley-1997,good-2005');
    for (const r of references) {
      assertTrue(Boolean(r.note && r.note.de && r.note.en), `${r.id} note`);
      assertTrue(Boolean(r.ISBN), `${r.id} ISBN`);
    }
  });
  test('every {{ref:…}} is known and every reference is cited', () => {
    const text = strings(help).join('\n');
    const cited = new Set([...text.matchAll(/\{\{ref:([a-z0-9-]+)/g)].map((m) => m[1]));
    const known = new Set(references.map((r) => r.id));
    assertEqual([...cited].filter((id) => !known.has(id)).join(','), '', 'unknown refs');
    assertEqual([...known].filter((id) => !cited.has(id)).join(','), '', 'uncited refs');
  });
  test('every {{term:…}} resolves to a glossary file', async () => {
    const ids = new Set([...strings(help).join('\n').matchAll(/\{\{term:([a-z0-9-]+)/g)].map((m) => m[1]));
    for (const id of NEW_TERMS) assertTrue(ids.has(id), `handbook links ${id}`);
    for (const id of ids) assertTrue(await exists(`../../glossary/terms/${id}.json`), `term ${id}`);
  });
});

suite('resampling — glossary', () => {
  test('new terms: hypothesis category, linked to resampling, bilingual, sourced, indexed', async () => {
    const index = await fetchJson('../../glossary/index.json');
    for (const id of NEW_TERMS) {
      const term = await fetchJson(`../../glossary/terms/${id}.json`);
      assertEqual(term.id, id);
      assertEqual(term.category, 'hypothesis');
      assertTrue(term.modules.includes('resampling'), `${id} modules`);
      for (const lang of ['de', 'en']) {
        assertTrue(Boolean(term.title[lang] && term.short[lang]), `${id} ${lang}`);
        assertTrue(term.definition[lang].length > 0, `${id} definition ${lang}`);
      }
      assertTrue(term.sources.length > 0, `${id} sources`);
      for (const other of term.seeAlso) assertTrue(await exists(`../../glossary/terms/${other}.json`), `${id} seeAlso ${other}`);
      const entry = index.terms.find((e) => e.id === id);
      assertTrue(Boolean(entry), `${id} indexed`);
      assertEqual(entry.category, 'hypothesis');
      assertEqual(entry.file, `terms/${id}.json`);
    }
  });
  test('ppk and p-wert list the resampling module', async () => {
    for (const id of ['ppk', 'p-wert']) {
      const term = await fetchJson(`../../glossary/terms/${id}.json`);
      assertTrue(term.modules.includes('resampling'), id);
    }
  });
});

suite('resampling — catalog examples', () => {
  test('one example per mode: registered, valid, computable', async () => {
    const catalog = await fetchJson('../../examples/index.json');
    const byId = Object.fromEntries(catalog.examples.map((e) => [e.id, e]));
    for (const [id, mode] of Object.entries(EXAMPLES)) {
      const entry = byId[id];
      assertTrue(Boolean(entry), `${id} registered`);
      assertEqual(entry.type, 'project');
      assertEqual(entry.format, 'json');
      assertEqual(entry.file, `projects/${id}.json`);
      assertEqual(entry.modules.join(','), 'resampling');
      const project = await fetchJson(`../../examples/${entry.file}`);
      const worksheet = await fetchJson(`../../examples/${project.sourceWorksheetFile}`);
      const sheet = worksheet.sheets[0];
      const cols = Object.fromEntries(sheet.state.columns.map((c) => [c.id, c.values]));
      const state = State.fromJSON(project);
      assertEqual(state.mode, mode, `${id} mode`);
      const refs = mode === 'k' ? state.colRefsK : [state.colRef1, state.colRef2].filter(Boolean);
      assertEqual(refs.length, mode === 'one' ? 1 : (mode === 'k' ? 3 : 2), `${id} refs`);
      for (const r of refs) {
        assertEqual(r.instanceId, '__source__');
        assertEqual(r.sheetId, sheet.id);
        assertTrue(r.columnId in cols, `${id} column ${r.columnId}`);
      }
      const inputs = readInputs(state, (r) => (r ? cols[r.columnId] : null));
      assertEqual(validateInputs(state, inputs), null, `${id} valid`);
      state.B = 1000;
      for (const { job } of buildJobs(state, inputs)) {
        assertTrue(Number.isFinite(runJobSync(job).estimate), `${id} computes`);
      }
    }
  });
  test('the Rüstzeit worksheet is registered with 12 pairs', async () => {
    const catalog = await fetchJson('../../examples/index.json');
    const entry = catalog.examples.find((e) => e.id === 'worksheet-resampling-ruestzeit');
    assertTrue(Boolean(entry), 'registered');
    assertEqual(entry.file, 'worksheets/resampling-ruestzeit.json');
    assertEqual(entry.modules.join(','), 'worksheet');
    const ws = await fetchJson('../../examples/worksheets/resampling-ruestzeit.json');
    assertEqual(ws.sheets[0].state.rowCount, 12);
    assertEqual(ws.sheets[0].state.columns.map((c) => c.id).join(','), 'c-vorher,c-nachher');
  });
});
