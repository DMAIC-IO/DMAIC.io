/**
 * Tests for js/core/readonly-lock.js — the UI half of read-only mode (Bug 023).
 * The state layer already drops writes; this lock makes the controls say so.
 */

import { suite, test, assertEqual } from '../test-utils.js';
import { setReadonlyLock, isReadOnly } from '../../js/core/readonly-lock.js';

function mount(html) {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  return { root, $: (sel) => root.querySelector(sel), dispose: () => { setReadonlyLock(root, false); root.remove(); } };
}

/** Let the MutationObserver callback run. */
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

suite('readonly-lock — locking', () => {
  test('disables inputs, selects, textareas and buttons', () => {
    const { root, $, dispose } = mount(
      '<input id="i"><select id="s"></select><textarea id="t"></textarea><button id="b">x</button>');
    setReadonlyLock(root, true);
    assertEqual($('#i').disabled, true);
    assertEqual($('#s').disabled, true);
    assertEqual($('#t').disabled, true);
    assertEqual($('#b').disabled, true);
    dispose();
  });

  test('leaves view and export controls usable', () => {
    const { root, $, dispose } = mount(`
      <button id="tab" role="tab">Tab</button>
      <button id="toggle" aria-expanded="false">More</button>
      <button id="exp" data-export="png">PNG</button>
      <button id="act" data-action="export-csv">CSV</button>
      <button id="copy" data-action="copy">Copy</button>
      <button id="mb" class="dmike-chart-modebar-btn">Zoom</button>
      <button id="dl" class="dmike-chart-dropdown-item">SVG</button>
      <button id="opt" data-readonly-allow>Help</button>`);
    setReadonlyLock(root, true);
    for (const id of ['tab', 'toggle', 'exp', 'act', 'copy', 'mb', 'dl', 'opt']) {
      assertEqual($(`#${id}`).disabled, false, `#${id} must stay enabled`);
    }
    dispose();
  });

  test('turns off contenteditable and draggable', () => {
    const { root, $, dispose } = mount(
      '<div id="ce" contenteditable="true">a</div><div id="dr" draggable="true">b</div>');
    setReadonlyLock(root, true);
    assertEqual($('#ce').isContentEditable, false);
    assertEqual($('#dr').draggable, false);
    dispose();
  });

  test('locks controls rendered after locking', async () => {
    const { root, dispose } = mount('<div id="host"></div>');
    setReadonlyLock(root, true);
    const late = document.createElement('input');
    root.querySelector('#host').append(late);
    await flush();
    assertEqual(late.disabled, true);
    dispose();
  });

  test('re-locks a control a module re-enables', async () => {
    const { root, $, dispose } = mount('<button id="b">x</button>');
    setReadonlyLock(root, true);
    $('#b').disabled = false;
    await flush();
    assertEqual($('#b').disabled, true);
    dispose();
  });
});

suite('readonly-lock — unlocking', () => {
  test('restores everything the lock changed', () => {
    const { root, $, dispose } = mount(
      '<input id="i"><div id="ce" contenteditable="true">a</div><div id="dr" draggable="true">b</div>');
    setReadonlyLock(root, true);
    setReadonlyLock(root, false);
    assertEqual($('#i').disabled, false);
    assertEqual($('#ce').isContentEditable, true);
    assertEqual($('#dr').draggable, true);
    dispose();
  });

  test('keeps controls the module had disabled itself', () => {
    const { root, $, dispose } = mount('<button id="b" disabled>x</button>');
    setReadonlyLock(root, true);
    setReadonlyLock(root, false);
    assertEqual($('#b').disabled, true);
    dispose();
  });

  test('stops observing after unlock', async () => {
    const { root, dispose } = mount('');
    setReadonlyLock(root, true);
    setReadonlyLock(root, false);
    const late = document.createElement('input');
    root.append(late);
    await flush();
    assertEqual(late.disabled, false);
    dispose();
  });

  test('tolerates a missing root', () => {
    setReadonlyLock(null, true);
    setReadonlyLock(null, false);
    assertEqual(true, true);
  });
});

suite('readonly-lock — isReadOnly', () => {
  test('true inside .dmike--readonly, false elsewhere', () => {
    const { root, $, dispose } = mount('<span id="x"></span>');
    assertEqual(isReadOnly($('#x')), false);
    root.classList.add('dmike--readonly');
    assertEqual(isReadOnly($('#x')), true);
    assertEqual(isReadOnly(null), false);
    dispose();
  });
});
