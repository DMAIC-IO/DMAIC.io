import { suite, test, assertEqual } from '../../test-utils.js';
import { parseHash, serializeRoute } from '../../../js/core/router/route-path.js';

suite('router/route-path', () => {
  test('parse: empty / root hash', () => {
    assertEqual(parseHash('').kind, 'root');
    assertEqual(parseHash('#/').kind, 'root');
  });

  test('parse: project only', () => {
    const r = parseHash('#/project/ab12');
    assertEqual(r.kind, 'project');
    assertEqual(r.projectId, 'ab12');
  });

  test('parse: phase landing', () => {
    const r = parseHash('#/project/ab12/phase/measure');
    assertEqual(r.kind, 'phase');
    assertEqual(r.projectId, 'ab12');
    assertEqual(r.phaseId, 'measure');
  });

  test('parse: module with sub tail', () => {
    const r = parseHash('#/project/ab12/module/9f3e/scatter');
    assertEqual(r.kind, 'module');
    assertEqual(r.instanceId, '9f3e');
    assertEqual(r.sub.join('/'), 'scatter');
  });

  test('parse: module-new sentinel', () => {
    const r = parseHash('#/project/ab12/module/new/sipoc');
    assertEqual(r.kind, 'module-new');
    assertEqual(r.moduleType, 'sipoc');
  });

  test('parse: page with sub tail', () => {
    const r = parseHash('#/project/ab12/page/algorithm-lab/capability/formula');
    assertEqual(r.kind, 'page');
    assertEqual(r.pageId, 'algorithm-lab');
    assertEqual(r.sub.join('/'), 'capability/formula');
  });

  test('parse: garbage → invalid', () => {
    assertEqual(parseHash('#/zonk').kind, 'invalid');
  });

  test('serialize: round-trips every kind', () => {
    const hashes = [
      '#/project/ab12',
      '#/project/ab12/phase/measure',
      '#/project/ab12/module/9f3e/scatter',
      '#/project/ab12/module/new/sipoc',
      '#/project/ab12/page/algorithm-lab/capability/formula',
    ];
    for (const h of hashes) assertEqual(serializeRoute(parseHash(h)), h);
  });
});
