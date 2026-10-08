import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { HelpPanel } from '../../js/ui/help-panel.js';

/** Minimal i18n stub: returns the key, fixed German language. */
const i18n = { t: (k) => k, getLanguage: () => 'de' };

const VIDEO = {
  type: 'module', id: 'run-chart-shift',
  modules: ['run-chart'], glossary: ['median'], examples: ['spc-run-chart-shift'],
  tags: ['spc'], title: { de: 'Verlauf', en: 'Run chart' },
  entry: { query: '?module=run-chart', labelKey: 'videos.openModule' },
  video: { de: 'https://x/de/3.mp4' }, captions: { de: 'https://x/de/3.vtt' }, sec: { de: 65 },
  chapters: [
    { id: 'a', sec: { de: 0 }, title: { de: 'Einstieg', en: 'Intro' }, modules: ['histogram'], tags: [] },
    { id: 'b', sec: { de: 30 }, title: { de: 'Lauftests', en: 'Run tests' }, modules: [], tags: [] },
  ],
};

/** Build a rendered panel on a detached container. */
function panel() {
  const el = document.createElement('div');
  document.body.append(el);
  const p = new HelpPanel(el, i18n);
  p.render();
  return { p, el };
}

suite('help-panel: videos tab', () => {
  test('tab button is hidden when the module has no videos (empty mirror case)', () => {
    const { p, el } = panel();
    p.showWithTabs('Modul', { helpNode: document.createTextNode('x'), glossaryGet: () => Promise.resolve(null) });
    const btn = el.querySelector('.help-panel__tab[data-tab="videos"]');
    assertTrue(btn != null, 'button exists in the DOM');
    assertEqual(btn.style.display, 'none', 'hidden');
    el.remove();
  });

  test('tab button is shown and the pane filled when videos exist', () => {
    const { p, el } = panel();
    p.showWithTabs('Modul', { helpNode: document.createTextNode('x'), videos: [VIDEO] });
    const btn = el.querySelector('.help-panel__tab[data-tab="videos"]');
    assertEqual(btn.style.display, '', 'visible');
    const pane = el.querySelector('[data-pane="videos"]');
    assertTrue(pane.textContent.includes('Verlauf'), 'title rendered');
    el.remove();
  });

  test('the entry is one link: title and running time, no hint and no chapter list', () => {
    const { p, el } = panel();
    // `run-chart` steht in VIDEO.modules — das Video behandelt dieses Modul
    // selbst, der Link gehört also an den Anfang.
    p.showWithTabs('Modul', {
      helpNode: document.createTextNode('x'), videos: [VIDEO],
      videosModuleId: 'run-chart', preferredTab: 'videos',
    });
    const pane = el.querySelector('[data-pane="videos"]');

    assertEqual(pane.querySelectorAll('.help-panel__video-hint').length, 0, 'no hint paragraph');
    assertEqual(pane.querySelectorAll('.help-panel__video-chapter').length, 0, 'no chapter list');

    const link = pane.querySelector('a.help-panel__video');
    assertTrue(link != null, 'the entry itself is the link');
    assertEqual(link.getAttribute('href'), 'https://x/de/3.mp4', 'starts at the beginning');
    assertEqual(link.getAttribute('target'), '_blank');
    assertEqual(link.getAttribute('rel'), 'noopener');
    assertEqual(link.querySelector('.help-panel__video-title').textContent, 'Verlauf');
    assertEqual(link.querySelector('.help-panel__video-time').textContent, '(1:05)');
    assertEqual(link.querySelectorAll('.help-panel__video-note').length, 0, 'no chapter note');

    el.remove();
  });

  test('a video that only matches through a chapter links into that chapter and says so', () => {
    const { p, el } = panel();
    // `histogram` steht NICHT in VIDEO.modules, sondern nur am Kapitel "a"
    // (sec 0). Ohne den Sprung landete der Nutzer am Anfang eines Videos über
    // ein fremdes Modul.
    p.showWithTabs('Modul', {
      helpNode: document.createTextNode('x'), videos: [VIDEO],
      videosModuleId: 'histogram', preferredTab: 'videos',
    });
    const link = el.querySelector('[data-pane="videos"] a.help-panel__video');
    assertEqual(link.getAttribute('href'), 'https://x/de/3.mp4#t=0', 'jumps to the matching chapter');
    assertEqual(link.querySelector('.help-panel__video-note').textContent, '(videos.toChapter)');
    assertEqual(link.querySelector('.help-panel__video-time').textContent, '(1:05)', 'the length is the video, not the chapter');

    el.remove();
  });

  test('a chapter match at a non-zero second produces that second in the fragment', () => {
    const { p, el } = panel();
    const v = { ...VIDEO, modules: [], chapters: [
      { id: 'a', sec: { de: 0 }, title: { de: 'Einstieg' }, modules: [], tags: [] },
      { id: 'b', sec: { de: 30 }, title: { de: 'Lauftests' }, modules: ['histogram'], tags: [] },
    ] };
    p.showWithTabs('Modul', {
      helpNode: document.createTextNode('x'), videos: [v],
      videosModuleId: 'histogram', preferredTab: 'videos',
    });
    const link = el.querySelector('[data-pane="videos"] a.help-panel__video');
    assertEqual(link.getAttribute('href'), 'https://x/de/3.mp4#t=30');
    el.remove();
  });

  test('a video with no file in the active language is skipped, and the tab itself is hidden', () => {
    const { p, el } = panel();
    const videoEnOnly = { ...VIDEO, id: 'en-only', video: { en: 'https://x/en/3.mp4' } };
    p.showWithTabs('Modul', { helpNode: document.createTextNode('x'), videos: [videoEnOnly], preferredTab: 'videos' });
    const pane = el.querySelector('[data-pane="videos"]');
    assertEqual(pane.querySelectorAll('.help-panel__video').length, 0, 'no video rendered for missing de file');
    // Regression: _hasVideos used to come from the UNFILTERED mirror, so the
    // tab button stayed visible even though the pane held only the hint —
    // nothing to click. It must be computed from the language-filtered list.
    const btn = el.querySelector('.help-panel__tab[data-tab="videos"]');
    assertEqual(btn.style.display, 'none', 'videos tab hidden when nothing matches the active language');
    el.remove();
  });

  test('openGlossaryCatalog hides the videos tab', () => {
    const { p, el } = panel();
    p.showWithTabs('Modul', { helpNode: document.createTextNode('x'), videos: [VIDEO] });
    p.openGlossaryCatalog([{ id: 'median', title: { de: 'Median' } }]);
    const btn = el.querySelector('.help-panel__tab[data-tab="videos"]');
    assertEqual(btn.style.display, 'none', 'hidden after glossary catalog open');
    const pane = el.querySelector('[data-pane="videos"]');
    assertEqual(pane.children.length, 0, 'pane cleared');
    el.remove();
  });
});
