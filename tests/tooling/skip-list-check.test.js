/**
 * Tests for tests/skip-list-check.mjs — keeps the node runner's SKIP list and
 * the browser runner's import list (tests/runner.html) in step.
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows } from '../test-utils.js';
import { parseRunnerFiles, checkSkipList } from '../skip-list-check.mjs';

const RUNNER_HTML = `
<script type="module">
  const testFiles = [
    './core/dom.test.js',
    "./ui/split-layout.test.js",
    './engines/anova.test.js',
  ];
  const other = ['./not/a-test-file.js'];
</script>`;

suite('skip-list-check: parseRunnerFiles', () => {
  test('returns the testFiles entries without the leading ./', () => {
    assertDeepEqual(parseRunnerFiles(RUNNER_HTML), [
      'core/dom.test.js',
      'ui/split-layout.test.js',
      'engines/anova.test.js',
    ]);
  });

  test('throws when runner.html has no testFiles array', () => {
    assertThrows(() => parseRunnerFiles('<html></html>'), /testFiles/);
  });
});

suite('skip-list-check: checkSkipList', () => {
  const testFiles = ['core/dom.test.js', 'ui/split-layout.test.js', 'engines/anova.test.js'];
  const browserFiles = ['core/dom.test.js', 'ui/split-layout.test.js', 'engines/anova.test.js'];

  test('no problems when every skipped file exists and runs in the browser', () => {
    const skip = ['core/dom.test.js', 'ui/split-layout.test.js'];
    assertDeepEqual(checkSkipList({ skip, browserFiles, testFiles }), []);
  });

  test('reports a skipped file that the browser runner does not import', () => {
    const problems = checkSkipList({
      skip: ['core/dom.test.js'],
      browserFiles: ['engines/anova.test.js'],
      testFiles,
    });
    assertEqual(problems.length, 1);
    assertEqual(problems[0].includes('core/dom.test.js'), true);
    assertEqual(problems[0].includes('runs nowhere'), true);
  });

  test('reports a skipped file that does not exist', () => {
    const problems = checkSkipList({
      skip: ['core/gone.test.js'],
      browserFiles: ['core/gone.test.js'],
      testFiles,
    });
    assertEqual(problems.length, 1);
    assertEqual(problems[0].includes('core/gone.test.js'), true);
    assertEqual(problems[0].includes('does not exist'), true);
  });
});
