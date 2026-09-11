/**
 * Der Kopiervorgang der statischen Handbuch-Assets.
 *
 * Hintergrund: build.mjs ruft main() beim Import auf und ist damit nicht
 * testbar. Die Asset-Liste liegt deshalb hier — und dieser Test ist der
 * Alarm dafür, dass ein neu verlinktes Asset (zuletzt nav-drawer.js) auch
 * wirklich im Ausgabeordner landet. Fehlt es, liefert jede Handbuchseite
 * einen 404 auf ihr Skript, ohne dass irgendetwas anschlägt.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { STATIC_ASSETS, copyStaticAssets } from './static-assets.mjs';

test('STATIC_ASSETS führt CSS, Bildmarke, Fuß-Band, Favicon und das Drawer-Skript', () => {
  const dests = STATIC_ASSETS.map(a => a.dest);
  assert.deepEqual(dests.sort(), [
    'assets/favicon.svg',
    'assets/handbook.css',
    'assets/logo.svg',
    'assets/nav-drawer.js',
    // Das Deko-Band der Fußzeile — ohne die Kopie zeigt handbook.css auf ein 404.
    'assets/ribbon-foot.svg',
  ]);
});

test('copyStaticAssets legt jedes Asset im Ausgabeordner ab', async () => {
  const out = await mkdtemp(join(tmpdir(), 'handbook-assets-'));
  try {
    await copyStaticAssets(out);
    for (const asset of STATIC_ASSETS) {
      await access(join(out, asset.dest));
    }
    const js = await readFile(join(out, 'assets/nav-drawer.js'), 'utf8');
    assert.ok(js.includes('navToggle'), 'das kopierte Skript ist nicht das Drawer-Skript');
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});

test('das Drawer-Skript kommt ohne Modulsyntax aus — es wird als klassisches Skript geladen', async () => {
  const src = STATIC_ASSETS.find(a => a.dest === 'assets/nav-drawer.js').src;
  const js = await readFile(src, 'utf8');
  assert.equal(/^\s*(import|export)\s/m.test(js), false, 'import/export im klassischen Skript');
});
