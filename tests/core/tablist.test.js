import { suite, test, assertEqual, assertTrue, afterEach } from '../test-utils.js';
import { moveTabFocus, registerTablistDirective } from '../../js/core/tablist.js';

let host = null;

/**
 * Build an attached tablist with `count` tab buttons. Each tab counts its
 * clicks in `clicks[i]`. `wrap` puts every tab in a span next to a plain
 * (role-less) button, like kano's delete button.
 */
function buildTablist(count, { wrap = false } = {}) {
  host = document.createElement('div');
  host.setAttribute('role', 'tablist');
  const tabs = [];
  const clicks = [];
  for (let i = 0; i < count; i++) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.textContent = `tab ${i}`;
    clicks.push(0);
    tab.addEventListener('click', () => { clicks[i]++; });
    if (wrap) {
      const span = document.createElement('span');
      const extra = document.createElement('button');
      extra.type = 'button';
      extra.textContent = 'x';
      span.append(tab, extra);
      host.append(span);
    } else {
      host.append(tab);
    }
    tabs.push(tab);
  }
  document.body.append(host);
  return { tablist: host, tabs, clicks };
}

/** Dispatch-free key event for moveTabFocus; target defaults to the focus. */
function key(name, target = document.activeElement) {
  const event = new KeyboardEvent('keydown', { key: name, cancelable: true, bubbles: true });
  Object.defineProperty(event, 'target', { value: target });
  return event;
}

suite('core/tablist', () => {
  afterEach(() => { host?.remove(); host = null; });

  test('ArrowRight moves focus to the next tab and wraps', () => {
    const { tablist, tabs } = buildTablist(3);
    tabs[0].focus();
    assertTrue(moveTabFocus(tablist, key('ArrowRight')));
    assertEqual(document.activeElement, tabs[1]);
    tabs[2].focus();
    assertTrue(moveTabFocus(tablist, key('ArrowRight')));
    assertEqual(document.activeElement, tabs[0]);
  });

  test('ArrowLeft wraps from first to last', () => {
    const { tablist, tabs } = buildTablist(3);
    tabs[0].focus();
    assertTrue(moveTabFocus(tablist, key('ArrowLeft')));
    assertEqual(document.activeElement, tabs[2]);
  });

  test('Home and End focus first and last', () => {
    const { tablist, tabs } = buildTablist(4);
    tabs[1].focus();
    moveTabFocus(tablist, key('End'));
    assertEqual(document.activeElement, tabs[3]);
    moveTabFocus(tablist, key('Home'));
    assertEqual(document.activeElement, tabs[0]);
  });

  test('skips disabled and hidden tabs', () => {
    const { tablist, tabs } = buildTablist(4);
    tabs[1].disabled = true;
    tabs[2].style.display = 'none';
    tabs[0].focus();
    moveTabFocus(tablist, key('ArrowRight'));
    assertEqual(document.activeElement, tabs[3]);
  });

  test('descendant tabs count, not only children', () => {
    const { tablist, tabs } = buildTablist(3, { wrap: true });
    tabs[0].focus();
    assertTrue(moveTabFocus(tablist, key('ArrowRight')));
    assertEqual(document.activeElement, tabs[1]);
  });

  test('ignores keys when focus is not on a tab', () => {
    const { tablist, tabs } = buildTablist(3, { wrap: true });
    const extra = tabs[0].nextElementSibling;
    extra.focus();
    assertEqual(moveTabFocus(tablist, key('ArrowRight')), false);
    assertEqual(document.activeElement, extra);
  });

  test('ignores keys from an input inside the bar', () => {
    const { tablist } = buildTablist(2);
    const input = document.createElement('input');
    tablist.append(input);
    input.focus();
    assertEqual(moveTabFocus(tablist, key('ArrowRight')), false);
    assertEqual(document.activeElement, input);
  });

  test('arrow keys do not activate', () => {
    const { tablist, tabs, clicks } = buildTablist(3);
    tabs[0].focus();
    moveTabFocus(tablist, key('ArrowRight'));
    moveTabFocus(tablist, key('End'));
    assertEqual(clicks.join(','), '0,0,0');
  });

  test('handled keys are defaultPrevented; other keys are not', () => {
    const { tablist, tabs } = buildTablist(2);
    tabs[0].focus();
    const arrow = key('ArrowRight');
    moveTabFocus(tablist, arrow);
    assertTrue(arrow.defaultPrevented);
    const other = key('a');
    assertEqual(moveTabFocus(tablist, other), false);
    assertEqual(other.defaultPrevented, false);
  });

  test('registerTablistDirective registers x-tablist once', () => {
    const names = [];
    const fakeAlpine = { directive: (name) => names.push(name) };
    registerTablistDirective(fakeAlpine);
    registerTablistDirective(fakeAlpine);
    assertEqual(names.join(','), 'tablist');
  });
});
