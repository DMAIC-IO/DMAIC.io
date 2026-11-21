import { suite, test, assertEqual } from '../../test-utils.js';
import { subgroupAllowed } from '../../../js/modules/process-capability/domain/columns.js';

const value = { instanceId: 'w', sheetId: 's1', columnId: 'c1' };

suite('process-capability domain — subgroupAllowed', () => {
  test('same column is not allowed', () => {
    assertEqual(subgroupAllowed(value, { ...value }), false);
  });
  test('another sheet is not allowed', () => {
    assertEqual(subgroupAllowed(value, { instanceId: 'w', sheetId: 's2', columnId: 'c2' }), false);
  });
  test('another worksheet instance is not allowed', () => {
    assertEqual(subgroupAllowed(value, { instanceId: 'w2', sheetId: 's1', columnId: 'c2' }), false);
  });
  test('no value column is never allowed', () => {
    assertEqual(subgroupAllowed(null, { instanceId: 'w', sheetId: 's1', columnId: 'c2' }), false);
  });
  test('a neighbour column on the same sheet is allowed', () => {
    assertEqual(subgroupAllowed(value, { instanceId: 'w', sheetId: 's1', columnId: 'c2' }), true);
  });
});
