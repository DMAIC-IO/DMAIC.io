/**
 * Sichert die Kopf- und Fußzeilen-Links des statischen Handbuchs ab.
 *
 * Hintergrund: Das Handbuch liegt im Deployment unter <app-wurzel>/docs/,
 * die Site-Wurzel dagegen eine Ebene *über* dem Tag-Präfix. Alle internen
 * root-absoluten Links (href="/…") werden in renderPage() relativ
 * umgeschrieben — genau das darf für den Logo-Link und die Rechtstexte der
 * Site aber NICHT passieren. Deshalb tragen diese Links den Platzhalter
 * %SITE_ROOT%, der den Rewrite überlebt und erst danach zu "/" aufgelöst wird.
 *
 * Der Mechanismus hängt an zwei stillen Invarianten:
 *   (a) der Regex-Rewrite href="(/…)" läuft VOR der Token-Auflösung,
 *   (b) renderNav()/renderFooter() werden nie außerhalb von renderPage()
 *       gerufen (sonst fehlt die Auflösung komplett).
 * Bricht eine davon, steht rohes %SITE_ROOT% in href auf ~945 Seiten, ohne
 * dass irgendetwas anschlägt. Diese Datei ist der Alarm dafür.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPage, appRootFrom } from './page-shell.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const HANDBOOK_ROOT = join(HERE, '..');

/** Seitenpfade über mehrere Verschachtelungstiefen hinweg. */
const PATHS = [
  { pathFromRoot: '/de/index.html', appRoot: '../../', depth: 1 },
  { pathFromRoot: '/de/define/sipoc.html', appRoot: '../../../', depth: 2 },
  { pathFromRoot: '/en/measure/msa/gage-rr.html', appRoot: '../../../../', depth: 3 },
  { pathFromRoot: '/de/glossar/cp.html', appRoot: '../../../', depth: 2 },
];

function render(pathFromRoot, lang) {
  return renderPage({
    lang,
    title: 'Testseite',
    description: 'Testbeschreibung',
    pathFromRoot,
    altPathFromRoot: null,
    breadcrumbs: [{ label: 'Start', href: '/de/' }, { label: 'Testseite' }],
    bodyHtml: '<p><a href="/de/define/sipoc.html">interner Link</a></p>',
  });
}

test('appRootFrom löst über mehrere Seitentiefen auf die App-Wurzel auf', () => {
  for (const { pathFromRoot, appRoot } of PATHS) {
    assert.equal(appRootFrom(pathFromRoot), appRoot, `App-Wurzel für ${pathFromRoot}`);
  }
});

test('der Logo-Link zeigt exakt auf die Site-Wurzel "/"', () => {
  for (const lang of ['de', 'en']) {
    for (const { pathFromRoot } of PATHS) {
      const html = render(pathFromRoot, lang);
      assert.ok(
        html.includes('<a href="/" class="handbook-nav__logo"'),
        `Logo-Link nicht exakt "/" auf ${pathFromRoot} (${lang})`,
      );
    }
  }
});

test('interne root-absolute Links werden weiterhin relativ umgeschrieben', () => {
  const html = render('/de/define/sipoc.html', 'de');
  assert.equal(html.includes('href="/de/define/sipoc.html"'), false, 'root-absoluter Link überlebt');
  assert.ok(html.includes('href="./sipoc.html"'), 'relativer Rewrite fehlt');
});

test('keine gerenderte Seite enthält ein rohes %SITE_ROOT%', () => {
  for (const lang of ['de', 'en']) {
    for (const { pathFromRoot } of PATHS) {
      const html = render(pathFromRoot, lang);
      assert.equal(html.includes('%SITE_ROOT%'), false, `rohes Token auf ${pathFromRoot} (${lang})`);
    }
  }
});

test('die Fußzeile verlinkt die real existierenden Rechtsanker der Site', () => {
  for (const lang of ['de', 'en']) {
    const html = render('/de/define/sipoc.html', lang);
    // Die Site (index.html und en/index.html) nutzt id="impressum" bzw.
    // id="datenschutz"; die Texte stecken in eingeklappten <details>, die nur
    // beim passenden Fragment aufgehen. Falsche Anker = unsichtbarer Rechtstext.
    assert.ok(html.includes('href="/#impressum"'), `Impressum-Anker fehlt (${lang})`);
    assert.ok(html.includes('href="/#datenschutz"'), `Datenschutz-Anker fehlt (${lang})`);
    assert.equal(html.includes('#imprint"'), false, `veralteter Anker #imprint (${lang})`);
    assert.equal(html.includes('#privacy"'), false, `veralteter Anker #privacy (${lang})`);
  }
});

test('renderNav/renderFooter werden nur aus renderPage heraus gerufen', async () => {
  const files = await collectMjs(HANDBOOK_ROOT);
  const offenders = [];
  for (const file of files) {
    if (file.endsWith('page-shell.mjs')) continue;
    const src = await readFile(file, 'utf8');
    if (/\brenderNav\s*\(|\brenderFooter\s*\(/.test(src)) offenders.push(file);
  }
  assert.deepEqual(offenders, [],
    'renderNav/renderFooter außerhalb von page-shell.mjs — die %SITE_ROOT%-Auflösung würde ausbleiben');
});

/** Alle .mjs-Dateien unterhalb von dir (ohne Testdateien). */
async function collectMjs(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await collectMjs(full));
    else if (entry.name.endsWith('.mjs') && !entry.name.endsWith('.test.mjs')) out.push(full);
  }
  return out;
}
