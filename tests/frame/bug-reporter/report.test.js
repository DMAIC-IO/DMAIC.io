import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../../test-utils.js';
import {
  slugify, folderName, collectContext, buildReport, reportMarkdown, redactErrors,
} from '../../../js/frame/bug-reporter/report.js';

const DATE = new Date(2026, 9, 8, 14, 30, 12); // local time

function fullServices() {
  return {
    version: '1.2.0',
    moduleRegistry: { getActiveCycle: () => 'dmaic' },
    workspace: { getActiveModuleInfo: () => ({ instanceId: 'inst_7f3a', moduleId: 'histogram' }) },
    dmaicTiles: { getActivePhase: () => 'measure' },
    themeManager: { getTheme: () => 'dark' },
    i18n: { getLanguage: () => 'de' },
  };
}
const ENV = {
  location: { hash: '#/phase/measure' },
  innerWidth: 1920, innerHeight: 1080,
  navigator: { userAgent: 'UA' },
  now: DATE,
};

suite('bug-reporter report', () => {
  test('slugify transliterates umlauts', () => {
    assertEqual(slugify('Größe überläuft bei Ähnlichkeit'), 'groesse-ueberlaeuft-bei-aehnlichkeit');
  });

  test('slugify: punctuation only → ohne-text', () => {
    assertEqual(slugify('  ?!… '), 'ohne-text');
    assertEqual(slugify(''), 'ohne-text');
  });

  test('slugify: cut at 40 without trailing dash', () => {
    // 40-char cut lands on the dash after "dddddd" — it must be stripped.
    const s = slugify('aaaaaaaaaa bbbbbbbbbb cccccccccc dddddd eeee');
    assertTrue(s.length <= 40);
    assertTrue(!s.endsWith('-'));
    assertEqual(s, 'aaaaaaaaaa-bbbbbbbbbb-cccccccccc-dddddd');
  });

  test('folderName uses local timestamp + slug', () => {
    assertEqual(folderName(DATE, 'Histogramm leer'), '2026-10-08T143012-histogramm-leer');
  });

  test('collectContext with full services', () => {
    const c = collectContext(fullServices(), ENV);
    assertDeepEqual(c, {
      appVersion: '1.2.0', route: '#/phase/measure', cycle: 'dmaic',
      phase: 'measure', moduleId: 'histogram', instanceId: 'inst_7f3a',
      theme: 'dark', language: 'de', viewport: '1920×1080',
      userAgent: 'UA', capturedAt: DATE.toISOString(),
    });
  });

  test('collectContext tolerates missing and throwing services', () => {
    const c = collectContext({
      version: '1.2.0',
      workspace: { getActiveModuleInfo: () => { throw new Error('x'); } },
    }, { now: DATE });
    assertEqual(c.appVersion, '1.2.0');
    assertEqual(c.moduleId, null);
    assertEqual(c.route, null);
    assertEqual(c.viewport, null);
  });

  test('buildReport without extras lists only report.md and report.json', () => {
    const r = buildReport({ date: DATE, description: 'x', context: {}, errors: [], notes: [] });
    assertDeepEqual(r.files.map(f => f.name), ['report.md', 'report.json']);
    const json = JSON.parse(r.files[1].data);
    assertEqual(json.description, 'x');
    assertEqual(json.folder, r.folder);
  });

  test('buildReport with all extras', () => {
    const r = buildReport({
      date: DATE, description: 'x', context: {}, errors: [], notes: [],
      screenshot: new Blob(['png'], { type: 'image/png' }),
      annotations: { image: { width: 10, height: 10 }, items: [{ type: 'frame', x: 1, y: 1, w: 2, h: 2 }] },
      project: '{"a":1}',
    });
    assertDeepEqual(r.files.map(f => f.name),
      ['report.md', 'report.json', 'screenshot.png', 'annotations.json', 'project.json']);
  });

  test('annotations without items are not written', () => {
    const r = buildReport({
      date: DATE, description: 'x', context: {}, errors: [], notes: [],
      screenshot: new Blob(['png']), annotations: { image: { width: 1, height: 1 }, items: [] },
    });
    assertDeepEqual(r.files.map(f => f.name), ['report.md', 'report.json', 'screenshot.png']);
  });

  test('markdown without errors or annotations omits both sections', () => {
    const md = reportMarkdown(buildReport({
      date: DATE, description: 'Text', context: { appVersion: '1.2.0' }, errors: [], notes: [],
    }));
    assertTrue(md.startsWith('# Bug-Report 2026-10-08T143012\n'));
    assertTrue(md.includes('## Beschreibung\n\nText\n'));
    assertTrue(md.includes('| App-Version | 1.2.0 |'));
    assertTrue(!md.includes('## Fehler'));
    assertTrue(!md.includes('## Annotationen'));
  });

  test('markdown lists errors, notes and textbox texts', () => {
    const md = reportMarkdown(buildReport({
      date: DATE, description: '', context: {}, notes: ['Aufnahme: abgelehnt'], fullErrors: true,
      errors: [{ at: '2026-10-08T14:29:58.000Z', kind: 'unhandledrejection', message: 'TypeError: x', stack: null }],
      screenshot: new Blob(['p']),
      annotations: { image: { width: 100, height: 100 }, items: [
        { type: 'textbox', x: 900, y: 120, w: 240, h: 70, text: 'hier steht die Zahl falsch' },
        { type: 'frame', x: 120, y: 340, w: 260, h: 90 },
      ] },
    }));
    assertTrue(md.includes('## Fehler (letzte 1)'));
    assertTrue(md.includes('**unhandledrejection** — `TypeError: x`'));
    assertTrue(md.includes('1. **textbox** (900, 120, 240×70) — „hier steht die Zahl falsch“'));
    assertTrue(md.includes('2. **frame** (120, 340, 260×90)'));
    assertTrue(md.includes('- Aufnahme: abgelehnt'));
    assertTrue(md.includes('- `screenshot.png`'));
  });

  test('multi-line error message stays on one list line', () => {
    const md = reportMarkdown(buildReport({
      date: DATE, description: '', context: {}, notes: [], fullErrors: true,
      errors: [{ at: '2026-10-08T14:29:58.000Z', kind: 'error', message: 'line one\n\n  line   two', stack: null }],
    }));
    assertTrue(md.includes('**error** — `line one line two`\n'));
  });

  test('error message with backticks gets a longer fence', () => {
    const md = reportMarkdown(buildReport({
      date: DATE, description: '', context: {}, notes: [], fullErrors: true,
      errors: [
        { at: '2026-10-08T14:29:58.000Z', kind: 'error', message: 'bad `x` value', stack: null },
        { at: '2026-10-08T14:29:58.000Z', kind: 'error', message: '`edge`', stack: null },
      ],
    }));
    assertTrue(md.includes('— ``bad `x` value``\n'));
    assertTrue(md.includes('— `` `edge` ``\n'));
  });

  test('markdown escapes pipes in context values', () => {
    const md = reportMarkdown(buildReport({
      date: DATE, description: '', context: { userAgent: 'a|b' }, errors: [], notes: [],
    }));
    assertTrue(md.includes('| User-Agent | a\\|b |'));
  });

  test('redactErrors keeps time, kind, name and V8 frames only', () => {
    const [e] = redactErrors([{
      at: '2026-10-08T14:29:58.000Z', kind: 'error', name: 'TypeError',
      message: 'Spalte „Kunde Müller“ fehlt',
      stack: 'TypeError: Spalte „Kunde Müller“ fehlt\n  zweite Zeile mit Daten\n    at parse (http://h/js/a.js:3:9)\n    at http://h/js/b.js:7:1',
    }]);
    assertDeepEqual(e, {
      at: '2026-10-08T14:29:58.000Z', kind: 'error', name: 'TypeError',
      stack: '    at parse (http://h/js/a.js:3:9)\n    at http://h/js/b.js:7:1',
    });
  });

  test('redactErrors keeps Firefox frames', () => {
    const [e] = redactErrors([{
      at: 'x', kind: 'console.error', name: null, message: 'secret',
      stack: 'parse@http://h/js/a.js:3:9\n@http://h/js/b.js:7:1\nsecret line',
    }]);
    assertEqual(e.stack, 'parse@http://h/js/a.js:3:9\n@http://h/js/b.js:7:1');
  });

  test('redactErrors: no stack or no frames → stack null, missing name → null', () => {
    const [a, b] = redactErrors([
      { at: 'x', kind: 'error', message: 'm', stack: null },
      { at: 'y', kind: 'error', message: 'm', stack: 'Error: only a message' },
    ]);
    assertEqual(a.stack, null);
    assertEqual(a.name, null);
    assertEqual(b.stack, null);
  });

  test('buildReport redacts errors by default and flags it in report.json', () => {
    const r = buildReport({
      date: DATE, description: '', context: {}, notes: [],
      errors: [{ at: '2026-10-08T14:29:58.000Z', kind: 'console.error', name: null,
        message: 'PROJEKTINHALT', stack: 'Error: PROJEKTINHALT\n    at f (http://h/a.js:1:1)' }],
    });
    for (const f of r.files) assertTrue(!f.data.includes('PROJEKTINHALT'), f.name);
    assertEqual(JSON.parse(r.files[1].data).errorsRedacted, true);
    assertTrue(r.files[0].data.includes('1. `2026-10-08T14:29:58` **console.error**\n'));
    assertTrue(r.files[0].data.includes('at f (http://h/a.js:1:1)'));
  });

  test('buildReport with fullErrors keeps messages and flags errorsRedacted false', () => {
    const r = buildReport({
      date: DATE, description: '', context: {}, notes: [], fullErrors: true,
      errors: [{ at: '2026-10-08T14:29:58.000Z', kind: 'error', name: 'TypeError', message: 'TypeError: x', stack: null }],
    });
    assertEqual(JSON.parse(r.files[1].data).errorsRedacted, false);
    assertTrue(r.files[0].data.includes('**error** — `TypeError: x`'));
  });

  test('markdown shows the error name of a redacted entry', () => {
    const md = reportMarkdown(buildReport({
      date: DATE, description: '', context: {}, notes: [],
      errors: [{ at: '2026-10-08T14:29:58.000Z', kind: 'unhandledrejection', name: 'RangeError', message: 'm', stack: null }],
    }));
    assertTrue(md.includes('**unhandledrejection** — RangeError\n'));
  });
});
