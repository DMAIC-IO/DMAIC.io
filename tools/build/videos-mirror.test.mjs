import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { parseMirror } from '../../js/core/videos-registry.js';

const REPO = path.resolve(new URL('../..', import.meta.url).pathname);
const MEDIA_BASE = '/media/v/';
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

/** @returns {Promise<?object>} der Dateiinhalt, oder null wenn es die Datei noch nicht gibt */
async function file() {
  try {
    return JSON.parse(await readFile(path.join(REPO, 'videos/index.json'), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/** @returns {Promise<object[]>} die Einträge, oder [] wenn die Datei noch nicht existiert */
async function mirror() {
  const content = await file();
  if (content === null) return [];
  return parseMirror(content);
}

async function known() {
  const { default: manifest } = await import(pathToFileURL(path.join(REPO, 'js/modules/manifest.js')).href);
  const glossary = JSON.parse(await readFile(path.join(REPO, 'glossary/index.json'), 'utf8'));
  const examples = JSON.parse(await readFile(path.join(REPO, 'examples/index.json'), 'utf8'));
  return {
    modules: new Set(manifest.map((m) => m.id)),
    glossary: new Set(glossary.terms.map((t) => t.id)),
    examples: new Set(examples.examples.map((e) => e.id)),
  };
}

test('the file carries the do-not-edit notice as its first key', async () => {
  const content = await file();
  if (content === null) return;
  assert.deepEqual(Object.keys(content).slice(0, 1), ['_comment'], 'the notice must come first');
  assert.equal(content._comment, 'generated file - do not edit');
  assert.ok(Array.isArray(content.videos), 'the entries live under "videos"');
});

test('the old bare-array form is refused, not silently accepted', () => {
  assert.throws(() => parseMirror([{ id: 'demo' }]), /array form/);
});

test('every mirror entry has the documented shape', async () => {
  for (const v of await mirror()) {
    assert.ok(['module', 'topic', 'example'].includes(v.type), `${v.id}: bad type ${v.type}`);
    assert.match(v.id, SLUG, `bad id ${v.id}`);
    for (const lang of ['de', 'en']) {
      assert.equal(typeof v.title?.[lang], 'string', `${v.id}: title.${lang} missing`);
    }
    assert.equal(typeof v.entry?.query, 'string', `${v.id}: entry.query missing`);
    assert.match(v.entry.labelKey, /^videos\./, `${v.id}: entry.labelKey is not an i18n key`);
    assert.ok(Object.keys(v.video ?? {}).length > 0, `${v.id}: no rendered language`);
  }
});

test('every referenced module, term and example exists in this repo', async () => {
  const refs = await known();
  for (const v of await mirror()) {
    for (const id of v.modules ?? []) assert.ok(refs.modules.has(id), `${v.id}: unknown module ${id}`);
    for (const id of v.glossary ?? []) assert.ok(refs.glossary.has(id), `${v.id}: unknown term ${id}`);
    for (const id of v.examples ?? []) assert.ok(refs.examples.has(id), `${v.id}: unknown example ${id}`);
    for (const c of v.chapters ?? []) {
      for (const id of c.modules ?? []) {
        if (id === '__shell') continue;
        assert.ok(refs.modules.has(id), `${v.id}/${c.id}: unknown module ${id}`);
      }
    }
  }
});

test('every media path is well formed and the languages line up', async () => {
  for (const v of await mirror()) {
    for (const [lang, url] of Object.entries(v.video)) {
      // Der Dateiname wiederholt ID und Sprache aus dem Pfad — absichtlich,
      // damit eine heruntergeladene Datei benannt bleibt. Hier wird beides
      // gegeneinander geprüft: ein Name, der nicht zu seinem Verzeichnis
      // passt, ist ein Fehler im Generator.
      const file = (ext) => `${v.id}--${lang}--g\\d+\\.${ext}`;
      assert.match(url, new RegExp(`^${MEDIA_BASE}${v.id}/${lang}/${file('mp4')}$`), `${v.id}: bad video url ${url}`);
      assert.match(v.captions[lang], new RegExp(`^${MEDIA_BASE}${v.id}/${lang}/${file('vtt')}$`), `${v.id}: bad caption url`);
      assert.equal(typeof v.sec[lang], 'number', `${v.id}: sec.${lang} missing`);
      // Dieselbe Generation in mp4 und vtt — sonst zeigt der Untertitel auf
      // eine andere Fassung als das Bild.
      const gen = (u) => /--g(\d+)\.\w+$/.exec(u)[1];
      assert.equal(gen(url), gen(v.captions[lang]), `${v.id}/${lang}: video and captions disagree on the generation`);
      for (const c of v.chapters ?? []) {
        assert.equal(typeof c.sec?.[lang], 'number', `${v.id}/${c.id}: sec.${lang} missing`);
      }
    }
  }
});

test('chapter ids are unique per video and the first chapter sits at 0', async () => {
  for (const v of await mirror()) {
    const ids = (v.chapters ?? []).map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length, `${v.id}: duplicate chapter id`);
    if (!v.chapters?.length) continue;
    for (const lang of Object.keys(v.video)) {
      assert.equal(v.chapters[0].sec[lang], 0, `${v.id}/${lang}: the first chapter is not at 0`);
    }
  }
});
