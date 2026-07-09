import { suite, test, assertEqual, assertThrows } from '../../test-utils.js';
import { StorageAdapter } from '../../../js/core/storage/storage-adapter.js';

suite('StorageAdapter (base contract)', () => {
  test('base methods throw "not implemented"', async () => {
    const a = new StorageAdapter();

    // Sync methods
    assertThrows(() => a.listProjects());
    assertThrows(() => a.getActiveProjectId());
    assertThrows(() => a.setActiveProjectId('x'));
    assertThrows(() => a.createProject('x', 'dmaic'));
    assertThrows(() => a.setProjectStatus('x', 'active'));
    assertThrows(() => a.reorderProjects(0, 1));
    assertThrows(() => a.saveProjectMeta('x', {}));
    assertThrows(() => a.putModule('x', 'i', {}));
    assertThrows(() => a.removeModule('x', 'i'));

    // Async methods (return rejected promises)
    for (const [name, fn] of [
      ['deleteProject', () => a.deleteProject('x')],
      ['loadProjectDoc', () => a.loadProjectDoc('x')],
      ['flush', () => a.flush()],
      ['exportProjectDocs', () => a.exportProjectDocs([])],
      ['importProjectDoc', () => a.importProjectDoc('x', {})]
    ]) {
      try {
        await fn();
        throw new Error(`${name} should reject`);
      } catch (err) {
        if (!err.message.includes('not implemented')) {
          throw new Error(`${name} error should mention "not implemented", got: ${err.message}`, { cause: err });
        }
      }
    }
  });

  test('supportsMultiProject defaults to false on the base', () => {
    assertEqual(new StorageAdapter().supportsMultiProject, false);
  });
});
