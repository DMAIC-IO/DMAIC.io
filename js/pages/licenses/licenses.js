/**
 * D.Mike — Licenses page (licenses.js)
 * Read-only attribution page listing bundled third-party runtime libraries.
 * Data comes from build-generated licenses-data.generated.js
 * (name · version · license · homepage url).
 * Full license texts live in THIRD-PARTY-LICENSES.txt.
 */

import { createPage } from '../../core/create-page.js';
import { LICENSES } from './licenses-data.generated.js';

export default createPage({
  id: 'licenses',
  templateUrl: new URL('js/pages/licenses/licenses.html', document.baseURI).href,
  container: '#licenses-overlay',
  button: '#footer-licenses',
  overlay: 'licenses',
  i18nKey: 'licenses',
  data(context, t, page) {
    return {
      libs: LICENSES.map(l => ({ ...l, versionLabel: 'v' + l.version })),
      close() { page.hide(); },
    };
  },
});
