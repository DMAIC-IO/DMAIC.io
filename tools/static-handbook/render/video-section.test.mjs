import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderVideoSection, videosForModule, videosForTerm, videosForExample, formatTimestamp,
} from './video-section.mjs';
import { getStrings } from './page-shell.mjs';

const MEDIA = '/media/v';

const video = {
  type: 'module', id: 'run-chart-shift',
  modules: ['run-chart'], glossary: ['median'], examples: ['spc-run-chart-shift'],
  tags: ['spc'],
  title: { de: 'Verlaufsdiagramm: einen Sprung erkennen', en: 'Run chart: spotting a shift' },
  entry: { query: '?module=run-chart', labelKey: 'videos.openModule' },
  video: { de: `${MEDIA}/run-chart-shift/de/3.mp4`, en: `${MEDIA}/run-chart-shift/en/1.mp4` },
  captions: { de: `${MEDIA}/run-chart-shift/de/3.vtt`, en: `${MEDIA}/run-chart-shift/en/1.vtt` },
  sec: { de: 117.6, en: 112.2 },
  chapters: [
    { id: 'wozu', sec: { de: 0, en: 0 }, title: { de: 'Wozu', en: 'Why' }, modules: [], tags: [] },
    { id: 'laden', sec: { de: 73.4, en: 70.1 }, title: { de: 'Beispiel laden', en: 'Load the example' }, modules: ['__shell'], tags: ['beispieldaten'] },
  ],
};

const videos = { entries: [video] };
const de = getStrings('de');
const render = (over = {}) => renderVideoSection({ videos: [video], lang: 'de', strings: de, ...over });

test('formatTimestamp matches the pipeline exactly', () => {
  assert.equal(formatTimestamp(0), '0:00');
  assert.equal(formatTimestamp(7.9), '0:07');
  assert.equal(formatTimestamp(73.4), '1:13');
  assert.equal(formatTimestamp(125), '2:05');
  assert.equal(formatTimestamp(3725), '62:05');
});

test('the selectors find a video by module, term and example', () => {
  assert.equal(videosForModule(videos, 'run-chart').length, 1);
  assert.equal(videosForModule(videos, 'histogram').length, 0);
  assert.equal(videosForTerm(videos, 'median').length, 1);
  assert.equal(videosForExample(videos, 'spc-run-chart-shift').length, 1);
  assert.equal(videosForExample(videos, 'gibt-es-nicht').length, 0);
});

test('videosForModule also matches a video whose chapter names the module', () => {
  const shellOnly = { ...video, modules: [], chapters: [{ ...video.chapters[1], modules: ['histogram'] }] };
  assert.equal(videosForModule({ entries: [shellOnly] }, 'histogram').length, 1);
});

test('no videos means no section at all', () => {
  assert.equal(render({ videos: [] }), '');
});

test('the player is a native video element against our own delivery', () => {
  const html = render();
  assert.match(html, /<video [^>]*controls/);
  assert.match(html, /preload="metadata"/);
  assert.ok(html.includes(`src="${MEDIA}/run-chart-shift/de/3.mp4"`));
  assert.ok(html.includes('type="video/mp4"'));
  assert.ok(!html.includes('youtube'), 'no YouTube embed — it sets cookies and needs consent');
});

test('the captions track is wired for the page language', () => {
  const html = render();
  assert.ok(html.includes(`src="${MEDIA}/run-chart-shift/de/3.vtt"`));
  assert.match(html, /kind="captions"/);
  assert.match(html, /srclang="de"/);
});

test('the media is same-origin and the player therefore carries no crossorigin', () => {
  const html = render();
  // Beides zusammen, weil das eine das andere trägt: solange `MEDIA_BASE`
  // docroot-relativ ist, holt der Player Datei und `<track>` vom eigenen
  // Host und braucht kein CORS. Käme je wieder eine volle URL in den
  // Spiegel, wäre `crossorigin="anonymous"` Pflicht — und dieser Test die
  // Stelle, die das meldet, statt dass die Untertitel stumm verschwinden.
  for (const src of html.match(/(?:src|href)="([^"]*\/media\/[^"]*)"/g) ?? []) {
    assert.match(src, /="\/media\//, `Medien-URL ist nicht docroot-relativ: ${src}`);
  }
  assert.doesNotMatch(html, /<video [^>]*crossorigin=/);
});

test('the video element has an accessible name via the title heading', () => {
  const html = render();
  assert.match(html, /<h3 class="handbook-video__title" id="video-title-run-chart-shift">/);
  assert.match(html, /<video [^>]*aria-labelledby="video-title-run-chart-shift"/);
});

test('the section carries no link into the app — the page itself does that', () => {
  const html = render();
  // Der Spiegel trägt `entry` weiterhin (die Seitenleiste der App braucht es),
  // der Handbuchabschnitt zeigt es nicht: eine Modulseite verlinkt das Modul
  // schon an prominenterer Stelle, und ein zweiter Einstieg unter dem Player
  // ist nur Wiederholung.
  assert.doesNotMatch(html, /handbook-video__entry/);
  assert.ok(!html.includes('?module=run-chart'), 'no deeplink in the video block');
  assert.ok(!html.includes(de.videos.openModule));
});

test('the runtime is not repeated under the player', () => {
  // Die Steuerleiste des `<video>` zeigt die Gesamtlänge ohnehin an; eine
  // zweite Angabe darunter ist nur Wiederholung — und eine, die um die
  // Rundungsdifferenz zwischen `sec` im Lock und der Containerlänge sogar
  // abweichen kann.
  const html = render();
  assert.doesNotMatch(html, /handbook-video__runtime/);
  assert.ok(!html.includes('>1:57<'), 'no standalone runtime label');
});

test('every chapter is a link that carries its second and its player', () => {
  const html = render();
  assert.ok(html.includes('data-video-sec="73.4"'));
  assert.ok(html.includes('data-video-player="player-run-chart-shift"'));
  assert.ok(html.includes('href="#player-run-chart-shift"'), 'without JS the link still jumps to the player');
  assert.ok(html.includes('1:13'));
  assert.ok(html.includes('Beispiel laden'));
});

test('the English page shows English title, chapters and seconds', () => {
  const html = renderVideoSection({ videos: [video], lang: 'en', strings: getStrings('en') });
  assert.ok(html.includes('Run chart: spotting a shift'));
  assert.ok(html.includes('data-video-sec="70.1"'));
  // 70,1 s auf Englisch gegen 73,4 s auf Deutsch: die Kapitelsekunden hängen
  // an der Sprache, weil die Narration unterschiedlich lang ist.
  assert.ok(html.includes('1:10'), 'the English chapter timestamp, not the German 1:13');
  assert.ok(!html.includes('1:13'));
  assert.ok(!html.includes('Beispiel laden'));
});

test('the only thing under the player is the collapsed chapter list', () => {
  const html = render();
  // `<details>` ohne `open`: eingeklappt kostet die Liste eine Zeile, und sie
  // klappt auch ohne JavaScript auf. Stünde sie wieder als eigener Block
  // darunter, erschlüge sie auf einer Modulseite alles, was danach kommt.
  assert.match(html, /<details class="handbook-video__chapters-toggle"><summary>Kapitel<\/summary>/);
  assert.doesNotMatch(html, /<details[^>]*\bopen\b/, 'collapsed by default');
  assert.doesNotMatch(html, /handbook-video__chapters-title/, 'the old standalone heading is gone');
  // Zwischen `</video>` und `</div>` steht nichts weiter — keine Meta-Zeile,
  // keine Laufzeit, kein Modul-Link.
  const tail = html.slice(html.indexOf('</video>') + '</video>'.length);
  assert.doesNotMatch(tail, /handbook-video__meta|handbook-video__runtime|handbook-video__entry/);
  assert.ok(tail.includes('handbook-video__chapters-toggle'), 'the chapter toggle is what remains');
});

test('a video that was never rendered in the page language is skipped', () => {
  const deOnly = { ...video, video: { de: video.video.de }, captions: { de: video.captions.de }, sec: { de: 117.6 } };
  assert.equal(renderVideoSection({ videos: [deOnly], lang: 'en', strings: getStrings('en') }), '');
});

test('titles and chapter titles are escaped', () => {
  const nasty = {
    ...video,
    title: { de: 'Ein <script>alert(1)</script> Titel', en: 'x' },
    chapters: [{ ...video.chapters[0], title: { de: 'Kapitel " & <b>', en: 'x' } }],
  };
  const html = renderVideoSection({ videos: [nasty], lang: 'de', strings: de });
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&amp;'));
});
