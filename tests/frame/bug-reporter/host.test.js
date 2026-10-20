import { suite, test, assertEqual } from '../../test-utils.js';
import { isReporterHost } from '../../../js/frame/bug-reporter/host.js';

suite('bug-reporter host check', () => {
  test('dev hosts show the button', () => {
    for (const h of ['localhost', '127.0.0.1', 'dmike.ddev.site', 'infra-tooling.dmike.ddev.site']) {
      assertEqual(isReporterHost(h), true, h);
    }
  });
  test('public hosts do not', () => {
    for (const h of ['dmaic.io', 'nightly.dmaic.io', 'ddev.site.evil.com', 'xddev.site', '']) {
      assertEqual(isReporterHost(h), false, h);
    }
  });
});
