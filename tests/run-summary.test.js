import { suite, test, assertEqual, assertTrue } from './test-utils.js';
import { formatSummary } from './run-summary.mjs';

suite('run-node summary', () => {
  const base = { passed: 260, failed: 0, skipped: 0, todo: 0, suites: 10, files: 12, domFiles: 3 };

  test('ohne Importfehler bleibt der gewohnte Wortlaut', () => {
    assertEqual(formatSummary({ ...base, importFailures: 0 }),
      '260 passed, 0 failed, 0 skipped, 0 todo (10 suites, 12 files; 3 DOM files run in the browser bridge)');
  });

  test('ein Importfehler zählt als Fehlschlag und wird benannt', () => {
    const line = formatSummary({ ...base, importFailures: 1 });
    assertTrue(line.includes('1 failed'), line);
    assertTrue(line.includes('1 file failed to import'), line);
  });

  test('mehrere Importfehler stehen im Plural und addieren sich', () => {
    const line = formatSummary({ ...base, failed: 2, importFailures: 2 });
    assertTrue(line.includes('4 failed'), line);
    assertTrue(line.includes('2 files failed to import'), line);
  });
});
