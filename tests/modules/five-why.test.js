/**
 * D.Mike — 5-Why Model unit tests (five-why.test.js)
 *
 * Tests the pure business logic / state in five-why-model.js:
 * constructor defaults, toJSON/fromJSON roundtrip & sanitization,
 * tree operations (addRootWhy / addChild / deleteNode / toggleCollapse /
 * collapse-all), node lookup, stats computation, and hasContent().
 */

import { suite, test, assertEqual } from '../test-utils.js';
import { State } from '../../js/modules/five-why/five-why-model.js';

suite('5-Why Model — State defaults & serialization', () => {
  test('constructor: empty problem and no nodes', () => {
    const s = new State();
    assertEqual(s.problem, '');
    assertEqual(Array.isArray(s.nodes), true);
    assertEqual(s.nodes.length, 0);
  });

  test('toJSON returns problem and nodes', () => {
    const s = new State();
    s.problem = 'P';
    s.addRootWhy();
    const j = s.toJSON();
    assertEqual(j.problem, 'P');
    assertEqual(Array.isArray(j.nodes), true);
    assertEqual(j.nodes.length, 1);
  });

  test('toJSON returns independent copies (no aliasing)', () => {
    const s = new State();
    s.addRootWhy();
    const j = s.toJSON();
    j.nodes.push({ id: 999 });
    j.nodes[0].answer = 'mutated';
    assertEqual(s.nodes.length, 1);
    assertEqual(s.nodes[0].answer, '');
  });

  test('fromJSON(null) returns valid default', () => {
    const s = State.fromJSON(null);
    assertEqual(s.problem, '');
    assertEqual(s.nodes.length, 0);
  });

  test('fromJSON(undefined) returns valid default', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.problem, '');
    assertEqual(s.nodes.length, 0);
  });

  test('fromJSON({}) returns valid default', () => {
    const s = State.fromJSON({});
    assertEqual(s.problem, '');
    assertEqual(s.nodes.length, 0);
  });

  test('fromJSON restores problem and nodes', () => {
    const data = {
      problem: 'Why late?',
      nodes: [
        { id: 1, level: 1, parentId: null, question: '', answer: 'A1', children: [], collapsed: false },
        { id: 2, level: 2, parentId: 1, question: '', answer: 'A2', children: [], collapsed: true },
      ],
    };
    const s = State.fromJSON(data);
    assertEqual(s.problem, 'Why late?');
    assertEqual(s.nodes.length, 2);
    assertEqual(s.nodes[0].answer, 'A1');
    assertEqual(s.nodes[1].collapsed, true);
  });

  test('fromJSON sanitizes non-string problem to empty', () => {
    const s = State.fromJSON({ problem: 42, nodes: [] });
    assertEqual(s.problem, '');
  });

  test('fromJSON ignores non-array nodes', () => {
    const s = State.fromJSON({ problem: 'x', nodes: 'nope' });
    assertEqual(s.problem, 'x');
    assertEqual(s.nodes.length, 0);
  });

  test('toJSON → fromJSON roundtrip is lossless', () => {
    const s = new State();
    s.problem = 'Root problem';
    const root = s.addRootWhy();
    const child = s.addChild(root.id);
    child.answer = 'deep answer';
    s.toggleCollapse(root.id);
    const restored = State.fromJSON(s.toJSON());
    assertEqual(restored.problem, 'Root problem');
    assertEqual(restored.nodes.length, 1);
    assertEqual(restored.nodes[0].collapsed, true);
    assertEqual(restored.nodes[0].children.length, 1);
    assertEqual(restored.nodes[0].children[0].answer, 'deep answer');
  });
});

suite('5-Why Model — tree operations', () => {
  test('addRootWhy appends a level-1 root node', () => {
    const s = new State();
    const n = s.addRootWhy();
    assertEqual(s.nodes.length, 1);
    assertEqual(n.level, 1);
    assertEqual(n.parentId, null);
    assertEqual(n.children.length, 0);
    assertEqual(n.collapsed, false);
  });

  test('addRootWhy assigns unique incrementing ids', () => {
    const s = new State();
    const a = s.addRootWhy();
    const b = s.addRootWhy();
    assertEqual(a.id === b.id, false);
  });

  test('addChild appends child with level = parent+1', () => {
    const s = new State();
    const root = s.addRootWhy();
    const child = s.addChild(root.id);
    assertEqual(child.level, 2);
    assertEqual(child.parentId, root.id);
    assertEqual(s.nodes[0].children.length, 1);
  });

  test('addChild un-collapses the parent', () => {
    const s = new State();
    const root = s.addRootWhy();
    root.collapsed = true;
    s.addChild(root.id);
    assertEqual(root.collapsed, false);
  });

  test('addChild returns null when parent level >= 5', () => {
    const s = new State();
    let node = s.addRootWhy();
    for (let i = 0; i < 4; i++) node = s.addChild(node.id);
    assertEqual(node.level, 5);
    const blocked = s.addChild(node.id);
    assertEqual(blocked, null);
    assertEqual(node.children.length, 0);
  });

  test('addChild returns null for unknown parent', () => {
    const s = new State();
    assertEqual(s.addChild(123), null);
  });

  test('findNode locates nested nodes', () => {
    const s = new State();
    const root = s.addRootWhy();
    const child = s.addChild(root.id);
    assertEqual(s.findNode(child.id).id, child.id);
    assertEqual(s.findNode(99999), null);
  });

  test('deleteNode removes a leaf node', () => {
    const s = new State();
    const root = s.addRootWhy();
    s.deleteNode(root.id);
    assertEqual(s.nodes.length, 0);
  });

  test('deleteNode removes a nested child node', () => {
    const s = new State();
    const root = s.addRootWhy();
    const child = s.addChild(root.id);
    s.deleteNode(child.id);
    assertEqual(s.nodes[0].children.length, 0);
    assertEqual(s.nodes.length, 1);
  });

  test('deleteNode removes a subtree when deleting a parent', () => {
    const s = new State();
    const root = s.addRootWhy();
    s.addChild(root.id);
    s.deleteNode(root.id);
    assertEqual(s.nodes.length, 0);
  });

  test('deleteNode is a no-op for unknown id', () => {
    const s = new State();
    s.addRootWhy();
    s.deleteNode(424242);
    assertEqual(s.nodes.length, 1);
  });

  test('nodeHasChildren reflects children presence', () => {
    const s = new State();
    const root = s.addRootWhy();
    assertEqual(s.nodeHasChildren(root.id), false);
    s.addChild(root.id);
    assertEqual(s.nodeHasChildren(root.id), true);
  });

  test('toggleCollapse flips collapsed flag', () => {
    const s = new State();
    const root = s.addRootWhy();
    assertEqual(root.collapsed, false);
    s.toggleCollapse(root.id);
    assertEqual(root.collapsed, true);
    s.toggleCollapse(root.id);
    assertEqual(root.collapsed, false);
  });

  test('setCollapseAll collapses only nodes with children', () => {
    const s = new State();
    const root = s.addRootWhy();
    const child = s.addChild(root.id);
    const leafRoot = s.addRootWhy();
    s.setCollapseAll(true);
    assertEqual(root.collapsed, true);
    assertEqual(child.collapsed, false); // leaf, no children
    assertEqual(leafRoot.collapsed, false);
    s.setCollapseAll(false);
    assertEqual(root.collapsed, false);
  });
});

suite('5-Why Model — stats', () => {
  test('stats on empty tree', () => {
    const s = new State();
    const st = s.stats();
    assertEqual(st.totalNodes, 0);
    assertEqual(st.maxDepth, 0);
    assertEqual(st.branches, 0);
    assertEqual(st.answered, 0);
  });

  test('stats counts nodes, depth, answered', () => {
    const s = new State();
    const root = s.addRootWhy();
    root.answer = 'answered';
    const child = s.addChild(root.id);
    child.answer = '   '; // whitespace = not answered
    const st = s.stats();
    assertEqual(st.totalNodes, 2);
    assertEqual(st.maxDepth, 2);
    assertEqual(st.answered, 1);
  });

  test('stats counts branches (extra children beyond the first)', () => {
    const s = new State();
    const root = s.addRootWhy();
    s.addChild(root.id);
    s.addChild(root.id);
    s.addChild(root.id);
    // 3 children → 2 branches
    assertEqual(s.stats().branches, 2);
  });
});

suite('5-Why Model — hasContent', () => {
  test('false on empty state', () => {
    assertEqual(new State().hasContent(), false);
  });

  test('true when problem set', () => {
    const s = new State();
    s.problem = 'x';
    assertEqual(s.hasContent(), true);
  });

  test('true when nodes present', () => {
    const s = new State();
    s.addRootWhy();
    assertEqual(s.hasContent(), true);
  });
});
