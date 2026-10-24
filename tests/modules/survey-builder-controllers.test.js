/**
 * D.Mike — Survey builder tab controllers (survey-builder-controllers.test.js)
 * The data function spreads six controllers into one object; a key defined
 * twice would be overwritten silently by the later spread.
 * Spec: docs/superpowers/specs/2026-10-10-survey-builder-design.md
 */

import { suite, test, assertTrue } from '../test-utils.js';
import { draftController } from '../../js/modules/survey-builder/survey-draft-controller.js';
import { importController } from '../../js/modules/survey-builder/survey-import-controller.js';
import { resultsController } from '../../js/modules/survey-builder/survey-results-controller.js';
import { handoverController } from '../../js/modules/survey-builder/survey-handover-controller.js';
import { chartsController } from '../../js/modules/survey-builder/survey-charts-controller.js';

const CONTROLLERS = {
  draftController, importController, resultsController, handoverController, chartsController,
};

const module = { _context: {}, _container: null };
const _t = (key) => key;

suite('survey-builder — tab controllers', () => {
  test('every controller returns members', () => {
    for (const [name, factory] of Object.entries(CONTROLLERS)) {
      const members = factory(module, _t);
      assertTrue(members && Object.keys(members).length > 0, `${name} returns no members`);
    }
  });

  test('no key is defined by two controllers', () => {
    const owner = new Map();
    const clashes = [];
    for (const [name, factory] of Object.entries(CONTROLLERS)) {
      for (const key of Object.keys(factory(module, _t))) {
        if (owner.has(key)) clashes.push(`${key} (${owner.get(key)}, ${name})`);
        else owner.set(key, name);
      }
    }
    assertTrue(clashes.length === 0, `duplicate keys: ${clashes.join(', ')}`);
  });
});
