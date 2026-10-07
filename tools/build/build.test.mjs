import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, mkdirSync, mkdtempSync, readdirSync, symlinkSync, statSync, writeFileSync, appendFileSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleJs, assertEvalFree, readCssLinks, bundleCss, hash8, rewriteBlock, buildStylesBlock, buildScriptsBlock, buildChunkManifestBlock, staticClosure, writeOutputAtomic, runBuild, isWatchedSource, watchSourceTree } from './build.mjs';
import { renderIndexHtml } from '../build-templates/build.mjs';

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('assertEvalFree throws on eval', () => {
  assert.throws(() => assertEvalFree('var x=eval("1")'), /eval/);
  assert.throws(() => assertEvalFree('new Function("a","return a")'), /Function/);
  assert.doesNotThrow(() => assertEvalFree('const x = 1 + 1;'));
});

test('bundleJs writes an eval-free app.min.js', async () => {
  // In der Schatten-Wurzel bauen: der echte Baum darf durch einen Testlauf
  // nicht angefasst werden (siehe makeShadowAppDir weiter unten).
  await withShadowAppDir(async (dir) => {
    const { outfile, code } = await bundleJs(dir);
    assert.ok(existsSync(outfile), 'app.min.js exists');
    assert.ok(code.length > 1000, 'bundle non-trivial');
    assert.doesNotThrow(() => assertEvalFree(code));
  });
});

test('readCssLinks preserves order excludes non-stylesheet links', () => {
  const html = `
<link rel="icon" href="favicon.svg">
<link rel="stylesheet" href="css/variables.css">
<link rel="stylesheet" href="css/layout.css">`;
  assert.deepEqual(readCssLinks(html), ['css/variables.css', 'css/layout.css']);
});

test('readCssLinks excludes vendor stylesheets, keeps first-party order', () => {
  const html = `
  <link rel="icon" href="favicon.svg">
  <link rel="stylesheet" href="css/variables.css">
  <link rel="stylesheet" href="vendor/katex/katex.min.css">
  <link rel="stylesheet" href="css/layout.css">`;
  assert.deepEqual(readCssLinks(html), ['css/variables.css', 'css/layout.css']);
});

test('hash8 is stable and 8 chars', () => {
  assert.equal(hash8('abc'), hash8('abc'));
  assert.equal(hash8('abc').length, 8);
  assert.notEqual(hash8('abc'), hash8('abd'));
});

test('rewriteBlock replaces between markers, keeps markers', () => {
  const html = 'x\n<!-- STYLES:START -->\nOLD\n<!-- STYLES:END -->\ny';
  const out = rewriteBlock(html, 'STYLES', 'NEW');
  assert.match(out, /<!-- STYLES:START -->\nNEW\n<!-- STYLES:END -->/);
  assert.match(out, /^x\n/);
  assert.match(out, /\ny$/);
});

test('rewriteBlock handles indented markers', () => {
  const html = 'x\n  <!-- STYLES:START -->\nOLD\n  <!-- STYLES:END -->\ny';
  const out = rewriteBlock(html, 'STYLES', 'NEW');
  assert.match(out, / {2}<!-- STYLES:START -->\nNEW\n {2}<!-- STYLES:END -->/);
});

test('buildStylesBlock emits a hashed link', () => {
  assert.match(buildStylesBlock('css/app.min.css?v=abc123de'),
    /<link rel="stylesheet" href="css\/app\.min\.css\?v=abc123de">/);
});

test('SCRIPTS block has no vendor script tags (single bundle include)', () => {
  const block = buildScriptsBlock('js/app.min.js?v=abc');
  assert.equal(/vendor\//.test(block), false);
  assert.equal((block.match(/<script/g) || []).length, 1);
});

test('index.dist.html declares no vendor assets', () => {
  const html = readFileSync(join(APP_DIR, 'index.dist.html'), 'utf8');
  assert.equal(/vendor\//.test(html), false);
});

test('bundled CSS includes katex + prism rules and copies katex fonts', async () => {
  // Source stylesheet list (index.dist.html), NOT the built index.html whose
  // single app.min.css link would re-import the just-emitted url(fonts/…).
  const html = readFileSync(join(APP_DIR, 'index.dist.html'), 'utf8');
  await withShadowAppDir(async (dir) => {
    const { code } = await bundleCss(dir, readCssLinks(html), { write: true });
    assert.match(code, /\.katex/);   // KaTeX styles folded in
    assert.match(code, /token/);     // Prism token classes folded in
    assert.ok(existsSync(join(dir, 'css', 'fonts')), 'katex fonts copied to css/fonts');
  });
});

test('built index.html contains the pre-JS loading overlay', async () => {
  // index.html ist erzeugt und gitignored: in einem frischen Checkout — also
  // in CI — gibt es die Datei vor dem ersten Build gar nicht, der Test fiel
  // dort mit ENOENT aus. Gebaut wird deshalb hier, im Schattenverzeichnis,
  // wie in den Nachbartests.
  await withShadowAppDir(async (dir) => {
    await runBuild(dir, { check: false });
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    assert.match(html, /id="app-loading"/);
  });
});

test('runBuild --check passes immediately after a real build', async () => {
  await withShadowAppDir(async (dir) => {
    await runBuild(dir, { check: false });          // produce artifacts
    const res = await runBuild(dir, { check: true }); // verify clean
    assert.deepEqual(res.changed, [], 'no stale artifacts after a build');
  });
});

test('build emits license artifacts', async () => {
  await withShadowAppDir(async (dir) => {
    await runBuild(dir, { check: false });
    const mod = join(dir, 'js', 'pages', 'licenses', 'licenses-data.generated.js');
    const txt = join(dir, 'THIRD-PARTY-LICENSES.txt');
    assert.ok(existsSync(mod), 'licenses-data.generated.js exists after build');
    assert.ok(existsSync(txt), 'THIRD-PARTY-LICENSES.txt exists after build');
    assert.match(readFileSync(mod, 'utf8'), /export const LICENSES/);
    assert.match(readFileSync(txt, 'utf8'), /Apache-2\.0/);
  });
});

test('renderIndexHtml liefert die fertige Shell, ohne zu schreiben', () => {
  const indexPath = join(APP_DIR, 'index.html');
  const before = existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : null;
  const html = renderIndexHtml(APP_DIR);
  assert.match(html, /<template data-tpl="js\//);
  const after = existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : null;
  assert.equal(after, before, 'renderIndexHtml darf index.html nicht anfassen');
});

/**
 * Namen, die der Build in js/ oder css/ selbst erzeugt. Sie dürfen in der
 * Schatten-Wurzel nicht als Symlink liegen, sonst schriebe der Build durch den
 * Link hindurch in den echten Baum (Schreiben auf einen Symlink trifft das
 * Ziel, nicht den Link).
 *
 * Hinweis am Rande: der Ausdruck prüft nur den Basisnamen; eine künftige
 * *Quelldatei* mit der Endung `.generated.js` fiele darum stumm aus der
 * Spiegelung. Der Wächter unten fängt das nicht, weil dabei nichts geschrieben,
 * sondern nur etwas ausgelassen wird.
 */
const GENERATED_FILE_RE = /(^_bundle_entry\.css$|\.generated\.js$|^app\.min\.(js|css)$|^app\.min\.js\.(map|LEGAL\.txt)$)/;

/** Verzeichnisse unterhalb von js/ bzw. css/, die reine Build-Ausgaben sind. */
const GENERATED_DIRS = new Set(['css/fonts', 'js/chunks']);

/**
 * Spiegelt `srcDir` nach `dstDir`: Verzeichnisse werden als echte Verzeichnisse
 * angelegt, Dateien nur gesymlinkt. Build-Ausgaben werden ausgelassen, damit
 * jeder Schreibvorgang im Spiegel landet und nicht im Original.
 * @param {string} srcDir  Quellverzeichnis im echten Baum
 * @param {string} dstDir  Zielverzeichnis in der Schatten-Wurzel
 * @param {string} rel     Pfad von der App-Wurzel aus, mit '/' getrennt
 */
function mirrorDir(srcDir, dstDir, rel) {
  mkdirSync(dstDir, { recursive: true });
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (GENERATED_DIRS.has(childRel)) continue;
      mirrorDir(join(srcDir, entry.name), join(dstDir, entry.name), childRel);
    } else {
      if (GENERATED_FILE_RE.test(entry.name)) continue;
      symlinkSync(join(srcDir, entry.name), join(dstDir, entry.name));
    }
  }
}

/**
 * Eine App-Wurzel zum Bauen, die den echten Baum nicht anfasst.
 *
 * Nur-lesende Top-Level-Einträge (node_modules/, i18n/, tools/, …) werden als
 * Ganzes gesymlinkt. `js/` und `css/` dagegen werden als echte Verzeichnisbäume
 * nachgebildet, deren Dateien einzeln gesymlinkt sind: dort liegen sämtliche
 * Build-Ziele (app.min.js/.map/.LEGAL.txt, app.min.css, css/fonts/*, das Temp-
 * Entry _bundle_entry.css und alle *.generated.js), und die sollen in der
 * Schatten-Wurzel entstehen statt im Repo. Die vorhandenen Ausgaben werden
 * bewusst nicht mitgespiegelt, sonst schriebe der Build durch den Symlink
 * hindurch in die echten Dateien. index.html und THIRD-PARTY-LICENSES.txt
 * fehlen ebenfalls, damit runBuild() sie hier neu anlegt.
 * @returns {string} Pfad der Temp-App-Wurzel (Aufrufer räumt auf)
 */
function makeShadowAppDir() {
  const dir = mkdtempSync(join(tmpdir(), 'dmike-build-'));
  for (const name of readdirSync(APP_DIR)) {
    if (name === 'index.html' || name === 'THIRD-PARTY-LICENSES.txt') continue;
    if (name === 'js' || name === 'css') {
      mirrorDir(join(APP_DIR, name), join(dir, name), name);
      continue;
    }
    symlinkSync(join(APP_DIR, name), join(dir, name));
  }
  return dir;
}

/**
 * Top-Level-Einträge, die die Momentaufnahme auslässt. Alles andere wird
 * abgetastet — auch `assets/`, `i18n/`, `glossary/`, `examples/` &c., die
 * `makeShadowAppDir()` als *ganze Verzeichnisse* symlinkt: dort schlüge ein
 * künftiger Schreibvorgang des Builds sonst still in den echten Baum durch.
 *
 * - `.git` — Git-Innereien, die sich unabhängig vom Build laufend ändern
 *   (Index-Refresh); jede Momentaufnahme wäre verrauscht.
 * - `node_modules` — ~108 MB Fremdcode, nie Ziel einer Build-Ausgabe; das
 *   Abtasten würde den Wächter um Größenordnungen verlangsamen.
 * - `docs`, `tests` — ~13 MB bzw. ~5 MB reiner Doku- und Testbestand, vom
 *   Build ebenfalls nie beschrieben und damit der größte vermeidbare Ballast.
 */
const SNAPSHOT_SKIP = new Set(['.git', 'node_modules', 'docs', 'tests']);

/**
 * Momentaufnahme des echten App-Baums: relativer Pfad →
 * `"<Größe>:<mtimeMs>"` für Dateien, `"dir"` für Verzeichnisse. Abgetastet
 * werden alle Top-Level-Einträge außer denen in `SNAPSHOT_SKIP` — der
 * verbleibende Rest liegt bei ~5 MB und kostet nur Millisekunden.
 * @param {string} [root] App-Wurzel, die aufgenommen wird
 * @returns {Map<string, string>} Pfad → Fingerabdruck
 */
function snapshotBuildTargets(root = APP_DIR) {
  const snap = new Map();
  const fingerprint = (abs) => {
    const st = statSync(abs);
    return `${st.size}:${st.mtimeMs}`;
  };
  const walk = (abs, rel) => {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const childRel = `${rel}/${entry.name}`;
      const childAbs = join(abs, entry.name);
      if (entry.isDirectory()) {
        snap.set(`${childRel}/`, 'dir');
        walk(childAbs, childRel);
      } else {
        snap.set(childRel, fingerprint(childAbs));
      }
    }
  };
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (SNAPSHOT_SKIP.has(entry.name)) continue;
    const childAbs = join(root, entry.name);
    if (entry.isDirectory()) {
      snap.set(`${entry.name}/`, 'dir');
      walk(childAbs, entry.name);
    } else {
      snap.set(entry.name, fingerprint(childAbs));
    }
  }
  return snap;
}

/**
 * Vergleicht zwei Momentaufnahmen und beschreibt die Abweichungen.
 * @param {Map<string, string>} before
 * @param {Map<string, string>} after
 * @returns {string[]} Zeilen der Form "<Art> <Pfad>", leer wenn identisch
 */
function diffSnapshots(before, after) {
  const lines = [];
  for (const [path, fp] of after) {
    if (!before.has(path)) lines.push(`neu       ${path}`);
    else if (before.get(path) !== fp) lines.push(`geändert  ${path}`);
  }
  for (const path of before.keys()) {
    if (!after.has(path)) lines.push(`entfernt  ${path}`);
  }
  return lines.sort();
}

/**
 * Legt eine Schatten-App-Wurzel an, führt `fn(dir)` darin aus, räumt sie
 * anschließend wieder ab — und wacht dabei über den echten Baum.
 *
 * Der Wächter nimmt den echten Baum (alles außer `SNAPSHOT_SKIP`) vor dem
 * Schatten-Build auf und vergleicht danach. Fehlt eine Build-Ausgabe künftig in
 * `GENERATED_FILE_RE` / `GENERATED_DIRS`, wird sie gespiegelt, der Build
 * schreibt durch den Symlink hindurch ins Repo — und genau das schlägt hier
 * fehl, statt still durchzugehen. Gleiches gilt für die übrigen Top-Level-
 * Verzeichnisse, die als Ganzes gesymlinkt sind. `git status --porcelain`
 * reichte dafür nicht: die Build-Ausgaben sind gitignored und blieben
 * unsichtbar (Fehlermodus Runde 1).
 * @param {(dir: string) => Promise<void>} fn Testkörper, bekommt die Wurzel
 * @returns {Promise<void>}
 */
async function withShadowAppDir(fn) {
  const before = snapshotBuildTargets();
  const dir = makeShadowAppDir();
  let bodyFailed = false;
  let bodyErr;
  try {
    await fn(dir);
  } catch (err) {
    bodyFailed = true;
    bodyErr = err;
  }

  // Aufräumen und Wächter laufen in jedem Fall — aber bewusst NICHT in einem
  // finally-Block: ein Wurf von dort überdeckte den Originalfehler des
  // Testkörpers (und wäre no-unsafe-finally). Stattdessen wird der Befund
  // hier eingesammelt und erst unten priorisiert weitergereicht.
  let guardErr;
  let guardFailed = false;
  try {
    rmSync(dir, { recursive: true, force: true });
    const changes = diffSnapshots(before, snapshotBuildTargets());
    if (changes.length) {
      assert.fail('Schatten-Build hat den echten Baum verändert '
        + '(Build-Ausgabe fehlt in GENERATED_FILE_RE/GENERATED_DIRS und wurde '
        + `gespiegelt):\n${changes.join('\n')}`);
    }
  } catch (err) {
    guardFailed = true;
    guardErr = err;
  }

  // Vorrang hat immer der Originalfehler des Testkörpers; ein zusätzlicher
  // Wächter-/Aufräumbefund wird daneben nur protokolliert.
  if (bodyFailed) {
    if (guardFailed) {
      console.error('Wächter/Aufräumen fehlgeschlagen, Originalfehler des '
        + 'Testkörpers bleibt maßgeblich:', guardErr);
    }
    throw bodyErr;
  }
  if (guardFailed) throw guardErr;
}

test('runBuild schreibt index.html nie im Dev-Entry-Zustand', async () => {
  const realIndex = join(APP_DIR, 'index.html');
  const realBefore = existsSync(realIndex) ? readFileSync(realIndex, 'utf8') : null;
  await withShadowAppDir(async (dir) => {
    // In der Schatten-Wurzel gibt es noch keine index.html. Gelingt der Build
    // trotzdem, kann Schritt 3 die CSS-Hrefs nicht aus einer bereits
    // geschriebenen Datei gelesen haben — genau die Kopplung, die das Rennen
    // erzeugt hat.
    await runBuild(dir, { check: false });
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    assert.match(html, /src="js\/app\.min\.js\?v=/);
    assert.doesNotMatch(html, /src="js\/app\.js"/);
    const realAfter = existsSync(realIndex) ? readFileSync(realIndex, 'utf8') : null;
    assert.equal(realAfter, realBefore, 'die echte index.html bleibt unberührt');
  });
});

test('runBuild lässt keine .tmp-Datei zurück, wenn das Umbenennen scheitert', async () => {
  await withShadowAppDir(async (dir) => {
    // index.html als Verzeichnis anlegen: renameSync(tmp -> index.html)
    // scheitert dann garantiert (EISDIR/ENOTDIR/EPERM, je nach Plattform).
    mkdirSync(join(dir, 'index.html'));
    await assert.rejects(() => runBuild(dir, { check: false }));
    const leftovers = readdirSync(dir).filter(n => n.endsWith('.tmp'));
    assert.deepEqual(leftovers, [], 'keine Temp-Datei nach dem Fehlerfall');
  });
});

test('isWatchedSource picks up templates, stylesheets and JSON that esbuild does not track', () => {
  for (const p of ['js/modules/kano/kano.html', 'index.dist.html', 'css/layout.css',
    'js/modules/kano/kano.css', 'i18n/de.json', 'glossary/terms/kano.json',
    'tests/fixtures/capability/cpk.fixtures.json']) {
    assert.equal(isWatchedSource(p), true, p);
  }
});

test('isWatchedSource ignores build outputs, JS and tool directories', () => {
  for (const p of ['index.html', 'index.html.1234.tmp', 'css/app.min.css', 'css/_bundle_entry.css', 'js/app.min.js',
    'js/core/glossary-data.generated.js', 'js/app.js', 'THIRD-PARTY-LICENSES.txt', 'package.json',
    'node_modules/x/y.json', 'tests/a.json', 'tests/modules/a.json', 'tests/fixtures/a.js',
    'tools/build/x.html', '.git/index', null]) {
    assert.equal(isWatchedSource(p), false, String(p));
  }
});

/** Resolve once `predicate` holds for one of the reported paths, or fail after `ms`. */
function waitForChange(seen, predicate, ms = 2000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = setInterval(() => {
      if (seen.some(predicate)) { clearInterval(poll); resolve(); }
      else if (Date.now() - started > ms) { clearInterval(poll); reject(new Error(`no change reported, saw: ${seen.join(', ')}`)); }
    }, 20);
  });
}

test('watchSourceTree keeps reporting a file after an editor replaced it by rename', async () => {
  const root = mkdtempSync(join(tmpdir(), 'watch-'));
  mkdirSync(join(root, 'mod'));
  const file = join(root, 'mod', 'a.html');
  writeFileSync(file, '<p>1</p>');
  const seen = [];
  const close = watchSourceTree(root, (rel) => seen.push(rel));
  try {
    // Atomic save: write a sibling, rename it over the original (new inode).
    writeFileSync(`${file}.swp`, '<p>2</p>');
    renameSync(`${file}.swp`, file);
    await waitForChange(seen, (p) => p === join('mod', 'a.html'));
    seen.length = 0;
    appendFileSync(file, '<p>3</p>');
    await waitForChange(seen, (p) => p === join('mod', 'a.html'));
  } finally {
    close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('watchSourceTree picks up files in directories created after it started', async () => {
  const root = mkdtempSync(join(tmpdir(), 'watch-'));
  const seen = [];
  const close = watchSourceTree(root, (rel) => seen.push(rel));
  try {
    mkdirSync(join(root, 'new'));
    // Give the watcher a moment to arm the new directory.
    await new Promise((r) => setTimeout(r, 100));
    writeFileSync(join(root, 'new', 'b.css'), 'a{}');
    await waitForChange(seen, (p) => p === join('new', 'b.css'));
  } finally {
    close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('watchSourceTree descends into tests/fixtures but nowhere else under tests', () => {
  const root = mkdtempSync(join(tmpdir(), 'watch-'));
  mkdirSync(join(root, 'tests', 'fixtures', 'doe'), { recursive: true });
  mkdirSync(join(root, 'tests', 'modules'), { recursive: true });
  const close = watchSourceTree(root, () => {});
  try {
    assert.deepEqual(close.dirs().sort(), ['', 'tests', join('tests', 'fixtures'), join('tests', 'fixtures', 'doe')]);
  } finally {
    close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('watchSourceTree does not descend into skipped directories', () => {
  const root = mkdtempSync(join(tmpdir(), 'watch-'));
  mkdirSync(join(root, 'node_modules', 'x'), { recursive: true });
  mkdirSync(join(root, '.git'));
  mkdirSync(join(root, 'js'));
  const close = watchSourceTree(root, () => {});
  try {
    assert.deepEqual(close.dirs().sort(), ['', 'js']);
  } finally {
    close();
    rmSync(root, { recursive: true, force: true });
  }
});

const listChunks = (dir) => {
  const d = join(dir, 'js', 'chunks');
  return existsSync(d) ? readdirSync(d).filter((n) => n.endsWith('.min.js')).sort() : [];
};

test('split build: entry stays at js/app.min.js, chunks land in js/chunks/, manifest lists them', async () => {
  await withShadowAppDir(async (dir) => {
    await runBuild(dir, { check: false });
    assert.ok(existsSync(join(dir, 'js', 'app.min.js')));
    const onDisk = listChunks(dir).map((n) => `js/chunks/${n}`);
    assert.ok(onDisk.length > 10, `expected many chunks, got ${onDisk.length}`);
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    const m = /<script type="application\/json" id="chunk-manifest">(.*)<\/script>/.exec(html);
    assert.ok(m, 'manifest present');
    assert.deepEqual(JSON.parse(m[1]), onDisk);
    for (const f of [join(dir, 'js', 'app.min.js'), ...onDisk.map((p) => join(dir, p))]) {
      assert.doesNotThrow(() => assertEvalFree(readFileSync(f, 'utf8')), f);
    }
  });
});

test('split build removes stale chunks only after the new ones are written', async () => {
  await withShadowAppDir(async (dir) => {
    await runBuild(dir, { check: false });
    const stale = join(dir, 'js', 'chunks', 'stale-AAAAAAAA.min.js');
    writeFileSync(stale, 'export {};');
    const before = listChunks(dir).filter((n) => !n.startsWith('stale-'));
    await runBuild(dir, { check: false });
    assert.equal(existsSync(stale), false, 'stale chunk removed');
    assert.deepEqual(listChunks(dir), before, 'current chunks unchanged');
  });
});

test('split build writes every chunk before the entry and removes stale chunks last', async () => {
  await withShadowAppDir(async (dir) => {
    await runBuild(dir, { check: false });
    const stale = join(dir, 'js', 'chunks', 'stale-CCCCCCCC.min.js');
    writeFileSync(stale, 'export {};');
    const order = [];
    let staleAtEntry = null;
    await bundleJs(dir, {
      writeOutput: (path, contents) => {
        const rel = path.slice(dir.length + 1);
        if (rel === 'js/app.min.js') staleAtEntry = existsSync(stale);
        order.push(rel);
        return writeOutputAtomic(path, contents);
      },
    });
    const entryAt = order.indexOf('js/app.min.js');
    const lastChunkAt = Math.max(...order.map((p, i) => (p.startsWith('js/chunks/') ? i : -1)));
    assert.ok(entryAt > lastChunkAt, `entry written at ${entryAt}, last chunk at ${lastChunkAt}`);
    assert.equal(staleAtEntry, true, 'stale chunks still present while the entry is written');
    assert.equal(existsSync(stale), false, 'stale chunk removed afterwards');
    assert.deepEqual(readdirSync(join(dir, 'js', 'chunks')).filter((n) => n.endsWith('.tmp')), [],
      'no temp files left behind');
  });
});

test('stale-chunk cleanup leaves the temp files of a concurrent build alone', async () => {
  await withShadowAppDir(async (dir) => {
    await runBuild(dir, { check: false });
    const foreignTmp = join(dir, 'js', 'chunks', 'x-DDDDDDDD.min.js.99999.tmp');
    writeFileSync(foreignTmp, 'export {};');
    await bundleJs(dir);
    assert.equal(existsSync(foreignTmp), true, 'in-flight temp file of another build kept');
    rmSync(foreignTmp);
  });
});

test('runBuild --check reports a changed, a missing and an extra chunk', async () => {
  await withShadowAppDir(async (dir) => {
    await runBuild(dir, { check: false });
    const [first, second] = listChunks(dir);
    appendFileSync(join(dir, 'js', 'chunks', first), '\n// edited');
    rmSync(join(dir, 'js', 'chunks', second));
    writeFileSync(join(dir, 'js', 'chunks', 'extra-BBBBBBBB.min.js'), 'export {};');
    const { changed } = await runBuild(dir, { check: true });
    const rel = changed.map((p) => p.slice(dir.length + 1));
    assert.ok(rel.includes(`js/chunks/${first}`), 'changed chunk reported');
    assert.ok(rel.includes(`js/chunks/${second}`), 'missing chunk reported');
    assert.ok(rel.includes('js/chunks/extra-BBBBBBBB.min.js'), 'extra chunk reported');
  });
});

test('no caller shows its own toast for a failed XLSX chunk (the chunk handler already does)', () => {
  const offenders = [];
  const walk = (rel) => {
    for (const name of readdirSync(join(APP_DIR, rel))) {
      const r = `${rel}/${name}`;
      if (r === 'js/chunks' || r === 'js/core/vendor') continue;
      if (statSync(join(APP_DIR, r)).isDirectory()) walk(r);
      else if (r.endsWith('.js') && !r.endsWith('.min.js')
        && readFileSync(join(APP_DIR, r), 'utf8').includes('XLSX library not loaded')) offenders.push(r);
    }
  };
  walk('js');
  assert.deepEqual(offenders, []);
});

test('buildChunkManifestBlock emits a data-only JSON script', () => {
  assert.equal(buildChunkManifestBlock(['js/chunks/a.min.js']),
    '  <script type="application/json" id="chunk-manifest">["js/chunks/a.min.js"]</script>');
});

/** Inputs that must never be in the entry's static import closure. */
const HEAVY_INPUTS = ['node_modules/xlsx/', 'node_modules/katex/', 'node_modules/opentype.js/',
  'js/algorithm-lab/lab-data.generated.js'];

test('entry static closure: modules split off, no heavy dependency', async () => {
  const { metafile } = await bundleJs(APP_DIR, { write: false });
  const { inputs } = staticClosure(metafile);
  const has = (frag) => [...inputs].some((i) => i.includes(frag));
  assert.ok(has('js/app.js'), 'closure contains the entry source');
  assert.equal(has('js/modules/sipoc/sipoc.js'), false, 'modules are split off');
  for (const frag of HEAVY_INPUTS) assert.equal(has(frag), false, `${frag} in entry closure`);
});
