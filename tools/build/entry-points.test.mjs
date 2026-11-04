/**
 * Benannte Einstiegspunkte je umgestelltem Modul.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jsBuildOptions, moduleEntryPoints, bundleJs, APP_DIR } from './build.mjs';

/** Temp-App aus `{ pfad: inhalt }`, node_modules aus dem echten Baum verlinkt. */
function appWith(files) {
  const root = mkdtempSync(join(tmpdir(), 'entry-points-'));
  for (const [path, body] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, body);
  }
  symlinkSync(join(APP_DIR, 'node_modules'), join(root, 'node_modules'));
  return root;
}

const APP = {
  'js/app.js': "import d from './modules/neu/module.js';\nexport const x = d;\n",
  'js/modules/neu/module.js': "export default { id: 'neu', load: () => import('./viewmodel/viewmodel.js'), tile: () => import('./tile/tile.js') };\n",
  'js/modules/neu/viewmodel/viewmodel.js': "export default { name: 'neu-viewmodel' };\n",
  'js/modules/neu/tile/tile.js': "export default { name: 'neu-tile' };\n",
};

test('moduleEntryPoints: Viewmodel immer, Kachel nur mit tile/tile.js', async () => {
  const { rmSync } = await import('node:fs');
  const root = appWith(APP);
  assert.deepEqual(moduleEntryPoints(root, 'neu'), [
    { in: join(root, 'js', 'modules', 'neu', 'viewmodel', 'viewmodel.js'), out: 'chunks/neu' },
    { in: join(root, 'js', 'modules', 'neu', 'tile', 'tile.js'), out: 'chunks/neu-tile' },
  ]);
  rmSync(join(root, 'js', 'modules', 'neu', 'tile'), { recursive: true });
  assert.deepEqual(moduleEntryPoints(root, 'neu'), [
    { in: join(root, 'js', 'modules', 'neu', 'viewmodel', 'viewmodel.js'), out: 'chunks/neu' },
  ]);
});

test('jsBuildOptions: App-Einstieg benannt, Module dahinter, entryNames mit Hash', () => {
  const root = appWith(APP);
  const opts = jsBuildOptions(root, { converted: ['neu'] });
  assert.deepEqual(opts.entryPoints[0], { in: join(root, 'js', 'app.js'), out: 'app' });
  assert.equal(opts.entryPoints.length, 3);
  assert.equal(opts.entryNames, '[dir]/[name]-[hash].min');
  assert.equal(opts.chunkNames, 'chunks/[name]-[hash].min');
});

test('bundleJs: app.min.js bleibt, Modul-Einstieg heißt chunks/<id>-<HASH>.min.js', async () => {
  const root = appWith(APP);
  const { outfile, code, chunks, metafile, outputFiles } = await bundleJs(root, { write: false, converted: ['neu'] });
  assert.equal(outfile, join(root, 'js', 'app.min.js'));
  assert.ok(code.length > 0, 'App-Einstieg gefunden');
  assert.match(code, /\/\/# sourceMappingURL=app\.min\.js\.map\s*$/);
  assert.ok(chunks.some((c) => /^js\/chunks\/neu-[A-Z0-9]+\.min\.js$/.test(c)), chunks.join(','));
  assert.ok(chunks.some((c) => /^js\/chunks\/neu-tile-[A-Z0-9]+\.min\.js$/.test(c)), chunks.join(','));
  assert.ok(!outputFiles.some((f) => /app-[A-Z0-9]+\.min\.js/.test(f.path)), 'kein gehashter App-Name übrig');
  const map = outputFiles.find((f) => f.path === `${outfile}.map`);
  assert.equal(JSON.parse(map.text).file, 'app.min.js');
  assert.ok(metafile.outputs['js/app.min.js'], 'Metafile-Schlüssel umbenannt');
  // module.js steckt (statisch importiert) im App-Einstieg; sein import() zeigt auf den benannten Chunk.
  assert.match(code, /chunks\/neu-[A-Z0-9]+\.min\.js/);
});

test('bundleJs ohne umgestellte Module: Ausgabe wie bisher (nur app.min.js + chunks)', async () => {
  const root = appWith({ 'js/app.js': "export const x = () => import('./lazy.js');\n", 'js/lazy.js': 'export default 1;\n' });
  const { chunks, outputFiles } = await bundleJs(root, { write: false, converted: [] });
  assert.ok(outputFiles.some((f) => f.path === join(root, 'js', 'app.min.js')));
  assert.ok(chunks.every((c) => c.startsWith('js/chunks/')));
});

test('bundleJs write: Unterordner in js/chunks/ werden nicht gelöscht', async () => {
  const root = appWith(APP);
  mkdirSync(join(root, 'js', 'chunks', 'templates'), { recursive: true });
  writeFileSync(join(root, 'js', 'chunks', 'templates', 'neu-AAAAAAAA.html'), '<template></template>');
  await bundleJs(root, { write: true, converted: ['neu'] });
  const { existsSync } = await import('node:fs');
  assert.ok(existsSync(join(root, 'js', 'chunks', 'templates', 'neu-AAAAAAAA.html')));
});
