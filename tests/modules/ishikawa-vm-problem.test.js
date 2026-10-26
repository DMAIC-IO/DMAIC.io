/**
 * D.Mike — ProblemViewModel (viewmodel/problem.js)
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue, assertThrows } from '../test-utils.js';
import { State } from '../../js/modules/ishikawa/ishikawa-model.js';
import { ProblemViewModel } from '../../js/modules/ishikawa/viewmodel/problem.js';
import { t, fakeContext, attach } from './ishikawa-vm-fakes.js';

const URL4 = 'data:image/jpeg;base64,AAAA';

function setup(refs = {}) {
  const ctx = fakeContext();
  const vm = new ProblemViewModel({ t, context: ctx, container: () => null });
  const model = new State();
  attach(vm, model, { refs });
  return { ctx, vm, model };
}

suite('ishikawa-vm problem — binding', () => {
  test('the model comes with attach(), not with the constructor', () => {
    const vm = new ProblemViewModel({ t, context: fakeContext(), container: () => null });
    assertEqual(vm.model, null);
    const model = new State();
    attach(vm, model);
    assertTrue(vm.model === model);
  });
});

suite('ishikawa-vm problem — statement', () => {
  test('setProblem writes the statement, "" clears it', () => {
    const { vm, model } = setup();
    vm.setProblem('Lieferzeit zu lang');
    assertEqual(model.problem, 'Lieferzeit zu lang');
    vm.setProblem('');
    assertEqual(model.problem, '');
  });

  test('setProblem rejects anything but a string', () => {
    const { vm } = setup();
    assertThrows(() => vm.setProblem(42));
    assertThrows(() => vm.setProblem(null));
  });
});

suite('ishikawa-vm problem — galleries', () => {
  test('gallery helpers name the kind', () => {
    const { vm } = setup();
    assertEqual(vm.galleryModifier('inScope'), 'in');
    assertEqual(vm.galleryModifier('outScope'), 'out');
    assertEqual(vm.galleryLabel('inScope'), 'problemScopeInLabel');
    assertEqual(vm.galleryHint('outScope'), 'problemScopeOutHint');
  });

  test('formatImgSize reports the decoded size', () => {
    const { vm } = setup();
    assertEqual(vm.formatImgSize(URL4), '3 B');
    assertEqual(vm.formatImgSize(`data:image/jpeg;base64,${'A'.repeat(4096)}`), '3 KB');
  });

  test('openImage fills the lightbox draft and borrows the template node', () => {
    const node = { id: 'lightbox-home' };
    const { ctx, vm, model } = setup({ lightbox: node });
    const img = model.addImage('inScope', URL4, 'Ofen');
    vm.openImage('inScope', img.id);
    assertDeepEqual(vm.lightbox, { src: URL4, caption: 'Ofen' });
    assertEqual(ctx.shown.length, 1);
    assertTrue(ctx.shown[0].content === node);
    assertEqual(ctx.shown[0].title, 'openImage');
    assertEqual(ctx.shown[0].size, 'wide');
  });

  test('openImage ignores an unknown image', () => {
    const { ctx, vm } = setup({ lightbox: {} });
    vm.openImage('inScope', 99);
    assertEqual(ctx.shown.length, 0);
  });

  test('deleteImage asks first and removes only on yes', async () => {
    const { ctx, vm, model } = setup();
    const img = model.addImage('outScope', URL4, '');
    ctx.confirmAnswer = false;
    await vm.deleteImage('outScope', img.id);
    assertEqual(model.images.outScope.length, 1);
    assertEqual(ctx.confirms[0].message, 'delImageConfirm|{"name":"#1"}');
    ctx.confirmAnswer = true;
    await vm.deleteImage('outScope', img.id);
    assertEqual(model.images.outScope.length, 0);
  });
});
