import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findUnconfirmedDeletes, scanUnconfirmedDeletes } from './delete-confirm-coverage.mjs';

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('a delete button without the trash icon or flag is reported', () => {
  const html = '<button class="x" @click="removeFactor(f.id)">×</button>';
  assert.deepEqual(findUnconfirmedDeletes(html).map(h => h.method), ['removeFactor']);
});

test('namespaced and modified click handlers are recognised', () => {
  const html = '<button @click.stop="draft.confirmDeleteQuestion(q.id)">×</button>';
  assert.deepEqual(findUnconfirmedDeletes(html).map(h => h.method), ['confirmDeleteQuestion']);
});

test('a button containing the trash icon passes', () => {
  const html = '<button @click="deleteItem(i)"><span class="icon" data-icon="action.delete"></span></button>';
  assert.deepEqual(findUnconfirmedDeletes(html), []);
});

test('data-confirm-delete and data-confirm-delete="off" pass', () => {
  const html = '<button data-confirm-delete @click="removeLevel(i)">×</button>'
    + '<button data-confirm-delete="off" @click="deleteLesson(l)">x</button>';
  assert.deepEqual(findUnconfirmedDeletes(html), []);
});

test('non-delete handlers are ignored', () => {
  const html = '<button @click="addFactor()">+</button><button @click="removed ? a() : b()">x</button>';
  assert.deepEqual(findUnconfirmedDeletes(html), []);
});

test('every delete button in the app templates goes through the delete confirmation', () => {
  assert.deepEqual(scanUnconfirmedDeletes(APP_DIR), []);
});
