import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { createHttpTransport, TransportError, downloadFiles } from '../../../js/frame/bug-reporter/transport.js';

const REPORT = {
  folder: '2026-10-08T143012-x',
  files: [
    { name: 'report.md', type: 'text/markdown', data: '# r' },
    { name: 'report.json', type: 'application/json', data: '{}' },
  ],
};

function respond(status, body, isJson = true) {
  return async (url, init) => {
    respond.last = { url, init };
    return {
      status,
      json: async () => { if (!isJson) throw new SyntaxError('html'); return body; },
    };
  };
}

async function failure(transport) {
  try { await transport.send(REPORT); } catch (e) { return e; }
  throw new Error('expected send to throw');
}

suite('bug-reporter transport', () => {
  test('posts multipart with folder and files', async () => {
    const t = createHttpTransport({ fetchImpl: respond(201, { path: 'var/bug-inbox/x' }) });
    const res = await t.send(REPORT);
    assertDeepEqual(res, { path: 'var/bug-inbox/x' });
    assertEqual(respond.last.url, '/tools/bug-inbox/receive.php');
    assertEqual(respond.last.init.method, 'POST');
    assertEqual(respond.last.init.headers['X-Bug-Report'], '1');
    const fd = respond.last.init.body;
    assertEqual(fd.get('folder'), REPORT.folder);
    assertEqual(fd.get('report.md').name, 'report.md');
    assertEqual(await fd.get('report.json').text(), '{}');
  });

  test('4xx with JSON error is a receiver rejection', async () => {
    const e = await failure(createHttpTransport({ fetchImpl: respond(413, { error: 'too large' }) }));
    assertTrue(e instanceof TransportError);
    assertEqual(e.rejected, true);
    assertEqual(e.status, 413);
    assertEqual(e.message, 'too large');
  });

  test('non-JSON 404 is not a receiver rejection', async () => {
    const e = await failure(createHttpTransport({ fetchImpl: respond(404, null, false) }));
    assertEqual(e.rejected, false);
    assertEqual(e.status, 404);
  });

  test('5xx is not a rejection', async () => {
    const e = await failure(createHttpTransport({ fetchImpl: respond(500, { error: 'disk' }) }));
    assertEqual(e.rejected, false);
  });

  test('network failure is not a rejection', async () => {
    const e = await failure(createHttpTransport({ fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }));
    assertEqual(e.rejected, false);
    assertEqual(e.status, 0);
  });

  test('downloadFiles clicks one anchor per file and removes it', () => {
    const events = [];
    const doc = {
      body: { append: () => events.push('append') },
      createElement: () => ({
        click() { events.push(`click:${this.download}`); },
        remove() { events.push('remove'); },
      }),
    };
    const names = downloadFiles(REPORT, doc);
    assertDeepEqual(names, [`${REPORT.folder}--report.md`, `${REPORT.folder}--report.json`]);
    assertDeepEqual(events, [
      'append', `click:${REPORT.folder}--report.md`, 'remove',
      'append', `click:${REPORT.folder}--report.json`, 'remove',
    ]);
  });

  test('201 without path is treated as failure', async () => {
    const e = await failure(createHttpTransport({ fetchImpl: respond(201, {}) }));
    assertEqual(e.rejected, false);
  });
});
