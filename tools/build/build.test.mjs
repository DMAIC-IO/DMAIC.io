import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, mkdirSync, mkdtempSync, readdirSync, symlinkSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleJs, assertEvalFree, readCssLinks, bundleCss, hash8, rewriteBlock, buildStylesBlock, buildScriptsBlock, runBuild } from './build.mjs';
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

test('built index.html contains the pre-JS loading overlay', () => {
  const html = readFileSync(join(APP_DIR, 'index.html'), 'utf8');
  assert.match(html, /id="app-loading"/);
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
const GENERATED_DIRS = new Set(['css/fonts']);

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
