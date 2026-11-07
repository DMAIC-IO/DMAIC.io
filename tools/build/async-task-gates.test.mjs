/**
 * Gates der asynchronen Abläufe (tools/build/async-task-gates.mjs).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readViewmodelAsyncTasks, checkAsyncTaskRefs, asyncTaskHelpKeys, checkAsyncTaskDecls, asyncTaskAnchors } from './async-task-gates.mjs';

const CORE = ['..', '..', '..', 'core'].join('/');
const VM = `
import { asyncTask } from '${CORE}/async-task.js';
import { number } from '${CORE}/model.js';
export default createModule({
  asyncTasks: {
    compute: asyncTask({ params: { n: number() }, blocked() { return null; }, async run() {} }),
    preview: asyncTask({ auto: true, async run() {} }),
  },
});`;
const TASKS = readViewmodelAsyncTasks(VM);

test('Tasks statisch aus dem Viewmodel', () => {
  assert.deepEqual(TASKS, { compute: { params: { n: true }, auto: false }, preview: { params: {}, auto: true } });
});

test('ohne asyncTasks-Block: leer', () => {
  assert.deepEqual(readViewmodelAsyncTasks('export default createModule({ commands: {} });'), {});
});

test('grün: richtige Elemente im Behälter', () => {
  const files = [{ path: 'resources/view.html', text: '<div x-async-task="compute"><button x-async-task-start data-arg-n="2"></button><button x-async-task-cancel></button><progress x-async-task-progress></progress><p x-async-task-error></p></div><div x-async-task="preview"><p x-async-task-error></p></div>' }];
  assert.deepEqual(checkAsyncTaskRefs(files, TASKS), []);
});

test('grün: verschachtelte Behälter, der innerste gilt', () => {
  const files = [{ path: 'resources/view.html', text: '<div x-async-task="preview"><div x-async-task="compute"><button x-async-task-start></button></div><p x-async-task-error></p></div>' }];
  assert.deepEqual(checkAsyncTaskRefs(files, TASKS), []);
});

test('rot: je Prüfung ein Befund', () => {
  const files = [{ path: 'resources/view.html', text: [
    '<button x-async-task-start></button>',
    '<div x-async-task="ghost"></div>',
    '<div x-async-task="compute"><span x-async-task-start></span><div x-async-task-progress></div><button x-async-task-start data-arg-zz="1"></button></div>',
    '<div x-async-task="preview"><button x-async-task-start></button></div>',
  ].join('') }];
  assert.deepEqual(checkAsyncTaskRefs(files, TASKS), [
    'template: resources/view.html: x-async-task-start: ohne umgebendes x-async-task',
    'template: resources/view.html: x-async-task="ghost": kein Task aus asyncTasks',
    'template: resources/view.html: x-async-task-start: gehört auf <button>, steht auf <span>',
    'template: resources/view.html: x-async-task-progress: gehört auf <progress>, steht auf <div>',
    'template: resources/view.html: data-arg-zz: kein Parameter von compute',
    'template: resources/view.html: x-async-task-start: preview ist ein auto-Task',
  ]);
});

test('Hilfeschlüssel', () => {
  assert.deepEqual(asyncTaskHelpKeys(TASKS), [
    'asyncTasks.compute.help', 'asyncTasks.compute.params.n', 'asyncTasks.compute.cancel.help',
    'asyncTasks.preview.help',
  ]);
});

test('Anker der Vorlage: Start und Abbrechen je Behälter', () => {
  assert.deepEqual(asyncTaskAnchors('<div x-async-task="compute"><button x-async-task-start></button><button x-async-task-cancel></button></div><div x-async-task="preview"><p x-async-task-error></p></div>'), [
    { name: 'compute', start: true, cancel: true },
    { name: 'preview', start: false, cancel: false },
  ]);
});

test('Deklaration grün: auto ohne params und blocked, manuell mit beiden', () => {
  assert.deepEqual(checkAsyncTaskDecls([{ path: 'viewmodel/viewmodel.js', text: VM }]), []);
});

test('Deklaration rot: auto: true mit params oder blocked', () => {
  const text = `
const later = asyncTask({ auto: true, blocked() { return null; }, async run() {} });
export default createModule({ asyncTasks: {
  preview: asyncTask({ auto: true, params: { n: number() }, async run() {} }),
  ok: asyncTask({ auto: true, params: {}, async run() {} }),
} });`;
  assert.deepEqual(checkAsyncTaskDecls([{ path: 'viewmodel/viewmodel.js', text }]), [
    'asyncTask: viewmodel/viewmodel.js: later: invalid blocked with auto: true; allowed: params and blocked only without auto',
    'asyncTask: viewmodel/viewmodel.js: preview: invalid params with auto: true; allowed: params and blocked only without auto',
  ]);
});
