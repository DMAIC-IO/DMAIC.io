/**
 * Regression guard: the files below once built their ids from
 * Date.now()/Math.random() (`Date.now().toString(36) + Math.random()…`). They now
 * delegate to `uid()` from js/core/uid.js — prefixes such as `worksheet_`,
 * `col_` or `lane-` stay, only the random part comes from uid().
 *
 * Deliberate exception: js/modules/survey-builder/survey-runner.js keeps its own
 * fallback because the exported questionnaire page imports nothing.
 */
import { suite, test, assertEqual } from '../test-utils.js';

const FILES = [
  'js/core/datagrid/datagrid-utils.js',
  'js/core/flowchart/flowchart-model.js',
  'js/core/state-manager.js',
  'js/core/storage/local-adapter.js',
  'js/modules/data-import/data-import.js',
  'js/modules/data-transformation/data-transformation.js',
  'js/modules/deployment-flowchart/deployment-flowchart-model.js',
  'js/modules/dmaic-calendar/dmaic-calendar-model.js',
  'js/modules/fmea/fmea-model.js',
  'js/modules/lessons-learned/lessons-learned-model.js',
  'js/modules/makigami/makigami-model.js',
  'js/modules/process-map/process-map-model.js',
  'js/modules/random-generator/random-generator.js',
  'js/modules/rest-api/rest-api-model.js',
  'js/modules/todo/todo-model.js',
  'js/modules/worksheet/worksheet-model.js',
];

/** Id built from a base-36 timestamp or base-36 Math.random digits. */
const HOMEMADE_ID = /Math\.random\(\)\.toString\(36\)|Date\.now\(\)\.toString\(36\)/;

/** @param {string} path app-relative source path */
async function source(path) {
  const res = await fetch(new URL(`../../${path}`, import.meta.url));
  return res.text();
}

suite('core/uid — adoption in former private id generators', () => {
  for (const file of FILES) {
    test(`${file} builds no ids from Date.now()/Math.random()`, async () => {
      const hits = (await source(file)).split('\n')
        .map((line, i) => ({ line: i + 1, text: line.trim() }))
        .filter(({ text }) => HOMEMADE_ID.test(text));
      assertEqual(hits.map((h) => `${h.line}: ${h.text}`).join('\n'), '',
        `${file} still builds its own ids — use uid() from js/core/uid.js`);
    });
  }
});
