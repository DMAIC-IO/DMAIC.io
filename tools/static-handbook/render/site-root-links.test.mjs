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
import { renderLangPicker } from './pages.mjs';

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
  // Die Rechtstexte stehen auf der Startseite der jeweiligen Sprache: die
  // deutsche unter "/", die englische unter "/en/". Sie stecken dort in
  // eingeklappten <details>, die nur beim passenden Fragment aufgehen —
  // falscher Anker heißt unsichtbarer Rechtstext.
  for (const [lang, home] of [['de', '/'], ['en', '/en/']]) {
    const html = render('/de/define/sipoc.html', lang);
    assert.ok(html.includes(`href="${home}#impressum"`), `Impressum-Anker fehlt (${lang})`);
    assert.ok(html.includes(`href="${home}#datenschutz"`), `Datenschutz-Anker fehlt (${lang})`);
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

test('jede Seitenhülle trägt Kontrollkästchen, Burger, Scrim und Drawer als Geschwister', () => {
  for (const lang of ['de', 'en']) {
    for (const { pathFromRoot } of PATHS) {
      const html = render(pathFromRoot, lang);
      const box = html.indexOf('id="navToggle"');
      const bar = html.indexOf('<header class="handbook-nav">');
      const scrim = html.indexOf('class="nav-scrim"');
      const drawer = html.indexOf('id="navDrawer"');
      assert.ok(box > -1, `Kontrollkästchen fehlt auf ${pathFromRoot} (${lang})`);
      assert.ok(box < bar, `Kontrollkästchen steht nicht vor der Leiste (${pathFromRoot}, ${lang})`);
      assert.ok(bar < scrim && scrim < drawer,
        `Reihenfolge Leiste → Scrim → Drawer verletzt (${pathFromRoot}, ${lang})`);
      assert.ok(html.includes('<label for="navToggle" class="burger"'),
        `Burger-Label fehlt (${pathFromRoot}, ${lang})`);
      assert.ok(html.includes('<label for="navToggle" class="nav-scrim"'),
        `Scrim-Label fehlt (${pathFromRoot}, ${lang})`);
    }
  }
});

test('das Kontrollkästchen trägt die übersetzte Beschriftung navMenu', () => {
  assert.ok(render('/de/index.html', 'de').includes('aria-label="Menü"'), 'deutsche Beschriftung fehlt');
  assert.ok(render('/en/index.html', 'en').includes('aria-label="Menu"'), 'englische Beschriftung fehlt');
});

test('der Drawer führt Schließer, Aufruf, alle drei Links und den Sprachlink in dieser Reihenfolge', () => {
  const html = render('/de/define/sipoc.html', 'de');
  const drawer = html.slice(html.indexOf('id="navDrawer"'));
  const close = drawer.indexOf('nav-drawer__close');
  const cta = drawer.indexOf('nav-drawer__cta');
  // Das Panel liegt über der Leiste, deren Burger ist offen also verdeckt —
  // ohne diesen eigenen Schließer bliebe nur Scrim und Escape.
  assert.ok(close > -1 && cta > close, 'der Schließer muss ganz oben im Panel stehen');
  assert.match(drawer, /<label for="navToggle" class="nav-drawer__close"/);
  const links = drawer.indexOf('nav-drawer__links');
  const lang = drawer.indexOf('nav-drawer__lang');
  assert.ok(cta > -1 && links > cta, 'der Aufruf muss über den Links stehen');
  assert.ok(lang > links, 'der Sprachlink muss unter den Links stehen');
  for (const label of ['Module', 'Algorithmus-Lab', 'Schulungen']) {
    assert.ok(drawer.includes(`>${label}<`), `Drawer-Eintrag ${label} fehlt`);
  }
});

/**
 * Der Sprachumschalter ist formgleich mit dem der Site (.lang-switch mit zwei
 * .lang-btn, aktives Segment markiert) — vorher stand hier ein einzelner
 * Link „English"/„Deutsch". Geprüft wird beides: die Pille selbst und dass
 * sie in Leiste UND Drawer steht, jeweils mit korrekt gesetztem Ziel.
 */
test('Leiste und Drawer tragen dieselbe EN|DE-Pille wie die Site', () => {
  for (const { pathFromRoot } of PATHS) {
    for (const lang of ['de', 'en']) {
      const html = render(pathFromRoot, lang);
      const pills = [...html.matchAll(/<div class="lang-switch[^"]*">(.*?)<\/div>/gs)];
      assert.equal(pills.length, 2, `zwei Pillen erwartet (${pathFromRoot}, ${lang})`);
      assert.ok(html.includes('class="lang-switch nav-drawer__lang"'), 'Drawer-Pille fehlt');

      for (const [, inner] of pills) {
        const btns = [...inner.matchAll(/<a class="(lang-btn[^"]*)"[^>]*hreflang="(\w+)">(\w+)</g)];
        assert.deepEqual(btns.map(b => b[2]), ['en', 'de'], 'Reihenfolge EN|DE wie auf der Site');
        assert.deepEqual(btns.map(b => b[3]), ['EN', 'DE'], 'Beschriftungen wie auf der Site');
        const active = btns.filter(b => b[1].includes('active'));
        assert.equal(active.length, 1, 'genau ein aktives Segment');
        assert.equal(active[0][2], lang, 'die aktive Sprache ist die der Seite');
      }
    }
  }
  // Das fremdsprachige Segment zeigt auf die andere Sprachfassung, das
  // aktive auf die Seite selbst — beides relativ, nie root-absolut.
  const html = render('/de/define/sipoc.html', 'de');
  const other = html.match(/<a class="lang-btn" href="([^"]+)" rel="alternate" hreflang="en">/);
  assert.ok(other, 'englisches Segment fehlt');
  assert.equal(other[1], '../../en/');
  assert.ok(html.includes('<a class="lang-btn active" href="./sipoc.html" hreflang="de">'),
    'das aktive Segment zeigt nicht auf die Seite selbst');
});

/**
 * Kopf- und Fußzeile sind bewusst formgleich mit der Site — gleiche
 * Reihenfolge, gleicher Wortlaut. Wer hier etwas umstellt, stellt es auch
 * in site-src/templates/base.html des privaten Repos um.
 */
test('die Leiste führt Links, Aufruf und Sprachumschalter in der Reihenfolge der Site', () => {
  const html = render('/de/define/sipoc.html', 'de');
  const bar = html.slice(html.indexOf('handbook-nav__actions'), html.indexOf('</header>'));
  const links = bar.indexOf('handbook-nav__links');
  const cta = bar.indexOf('handbook-nav__cta');
  const lang = bar.indexOf('lang-switch');
  const burger = bar.indexOf('class="burger"');
  assert.ok(links > -1 && cta > links, 'der Aufruf steht rechts der Links');
  assert.ok(lang > cta, 'der Sprachumschalter steht rechts des Aufrufs');
  assert.ok(burger > lang, 'der Burger steht ganz rechts');
});

test('der Aufruf zur Anwendung trägt den Wortlaut der Site', () => {
  assert.ok(render('/de/index.html', 'de').includes('>Jetzt starten<'), 'deutscher Wortlaut');
  assert.ok(render('/en/index.html', 'en').includes('>Get started<'), 'englischer Wortlaut');
});

test('die Fußzeile führt dieselben Einträge wie die Site, nur „Homepage" statt „Dokumentation"', () => {
  const html = render('/de/define/sipoc.html', 'de');
  const foot = html.slice(html.indexOf('<footer'));
  const order = ['Homepage', 'Versionen', 'GitHub', 'AGPL-3.0-Lizenz', 'Open-Source-Lizenzen', 'Impressum', 'Datenschutz'];
  let cursor = -1;
  for (const label of order) {
    const at = foot.indexOf(`>${label}<`);
    assert.ok(at > cursor, `Fußzeilen-Eintrag ${label} fehlt oder steht falsch`);
    cursor = at;
  }
  // Das Handbuch verlinkt nicht sich selbst — dafür steht „Homepage".
  assert.equal(foot.includes('>Dokumentation<'), false);
  assert.ok(foot.includes('class="ribbon ribbon--foot"'), 'das Deko-Band der Site fehlt');
});

test('die Gabelseite trägt dieselbe Hülle wie jede Handbuchseite', () => {
  const html = renderLangPicker();
  assert.ok(html.includes('class="handbook-nav"'), 'Leiste fehlt');
  assert.ok(html.includes('<footer'), 'Fußzeile fehlt');
  assert.ok(html.includes('id="navDrawer"'), 'Drawer fehlt');
  assert.equal(html.includes('%SITE_ROOT%'), false, 'rohes Token auf der Gabelseite');
  // Beide Sprachfassungen bleiben von hier aus erreichbar.
  assert.ok(html.includes('href="./de/"'), 'deutsche Fassung nicht verlinkt');
  assert.ok(html.includes('href="./en/"'), 'englische Fassung nicht verlinkt');
});

test('der Skriptpfad ist relativ zur Seitentiefe aufgelöst', () => {
  const cases = [
    ['/de/index.html', '../assets/nav-drawer.js'],
    ['/de/define/sipoc.html', '../../assets/nav-drawer.js'],
    ['/en/measure/msa/gage-rr.html', '../../../assets/nav-drawer.js'],
  ];
  for (const [pathFromRoot, expected] of cases) {
    const html = render(pathFromRoot, 'de');
    assert.ok(
      html.includes(`<script src="${expected}" defer></script>`),
      `Skript-Tag für ${pathFromRoot} erwartet ${expected}`,
    );
  }
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
