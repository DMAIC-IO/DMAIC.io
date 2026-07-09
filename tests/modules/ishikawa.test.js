import { suite, test, assertEqual } from '../test-utils.js';
import { State, MAX_DEPTH_CLASS } from '../../js/modules/ishikawa/ishikawa-model.js';
import { CATS, STATUS_KEYS } from '../../js/modules/ishikawa/ishikawa-constants.js';

// ─── Constants ──────────────────────────────────────────────

suite('Ishikawa Model — constants', () => {
  test('CATS has the six 6M categories', () => {
    assertEqual(CATS.length, 6);
    assertEqual(CATS.map(c => c.key).join(','), 'man,machine,environment,material,measurement,method');
  });

  test('STATUS_KEYS has the four statuses', () => {
    assertEqual(STATUS_KEYS.join(','), 'open,testing,confirmed,rejected');
  });

  test('MAX_DEPTH_CLASS is 3 (CSS depth clamp)', () => {
    assertEqual(MAX_DEPTH_CLASS, 3);
  });
});

// ─── Construction / defaults ────────────────────────────────

suite('Ishikawa Model — construction', () => {
  test('fresh state has empty collections', () => {
    const s = new State();
    assertEqual(s.problem, '');
    assertEqual(s.experts.length, 0);
    assertEqual(s.rows.length, 0);
    assertEqual(s.snapshots.length, 0);
    assertEqual(s.experiments.length, 0);
    assertEqual(s.facts.length, 0);
    assertEqual(Array.isArray(s.images.inScope), true);
    assertEqual(Array.isArray(s.images.outScope), true);
  });

  test('hasContent false on fresh state', () => {
    assertEqual(new State().hasContent(), false);
  });

  test('hasContent true once problem set', () => {
    const s = new State();
    s.problem = 'Late delivery';
    assertEqual(s.hasContent(), true);
  });

  test('hasContent true once a row exists', () => {
    const s = new State();
    s.addRow(null);
    assertEqual(s.hasContent(), true);
  });
});

// ─── Cause tree ops ─────────────────────────────────────────

suite('Ishikawa Model — cause tree', () => {
  test('addRow(null) appends a root row with a stableId', () => {
    const s = new State();
    const r = s.addRow(null);
    assertEqual(s.rows.length, 1);
    assertEqual(r.parentId, null);
    assertEqual(r.status, 'open');
    assertEqual(/^H-\d{3}$/.test(r.stableId), true);
  });

  test('stableIds are unique and incrementing', () => {
    const s = new State();
    const a = s.addRow(null);
    const b = s.addRow(null);
    assertEqual(a.stableId === b.stableId, false);
  });

  test('addRow(parentId) inserts a child after its parent', () => {
    const s = new State();
    const p = s.addRow(null);
    const c = s.addRow(p.id);
    assertEqual(c.parentId, p.id);
    assertEqual(s.getDepth(c), 1);
    assertEqual(s.hasKids(p.id), true);
  });

  test('getDepth counts ancestors (fixed-depth tree)', () => {
    const s = new State();
    const a = s.addRow(null);
    const b = s.addRow(a.id);
    const c = s.addRow(b.id);
    assertEqual(s.getDepth(a), 0);
    assertEqual(s.getDepth(b), 1);
    assertEqual(s.getDepth(c), 2);
  });

  test('descIds returns all descendants', () => {
    const s = new State();
    const a = s.addRow(null);
    const b = s.addRow(a.id);
    const c = s.addRow(b.id);
    const ids = s.descIds(a.id).sort((x, y) => x - y);
    assertEqual(ids.join(','), [b.id, c.id].sort((x, y) => x - y).join(','));
  });

  test('effCat inherits the category from the nearest ancestor', () => {
    const s = new State();
    const a = s.addRow(null);
    a.category = 'man';
    const b = s.addRow(a.id);
    assertEqual(s.effCat(b), 'man');
  });

  test('ordered() returns pre-order DFS', () => {
    const s = new State();
    const a = s.addRow(null);     // 1
    const b = s.addRow(a.id);     // 1.1
    const c = s.addRow(null);     // 2
    const order = s.ordered().map(r => r.id);
    assertEqual(order.join(','), [a.id, b.id, c.id].join(','));
  });

  test('buildNums produces hierarchical numbering', () => {
    const s = new State();
    const a = s.addRow(null);
    const b = s.addRow(a.id);
    const c = s.addRow(null);
    const nums = s.buildNums();
    assertEqual(nums[a.id], '1');
    assertEqual(nums[b.id], '1.1');
    assertEqual(nums[c.id], '2');
  });

  test('delRow removes the row and its descendants', () => {
    const s = new State();
    const a = s.addRow(null);
    const b = s.addRow(a.id);
    s.addRow(b.id);
    s.delRow(a.id);
    assertEqual(s.rows.length, 0);
  });

  test('delRow cleans hypothesis references in experiments', () => {
    const s = new State();
    const a = s.addRow(null);
    s.experiments.push({ id: 1, hypothesisIds: [a.stableId, 'H-999'] });
    s.delRow(a.id);
    assertEqual(s.experiments[0].hypothesisIds.join(','), 'H-999');
  });

  test('dupeRow duplicates a row with its subtree', () => {
    const s = new State();
    const a = s.addRow(null);
    a.name = 'Parent';
    const b = s.addRow(a.id);
    b.name = 'Child';
    s.dupeRow(a.id);
    // Original 2 + duplicated 2 = 4
    assertEqual(s.rows.length, 4);
  });

  test('moveRowBefore reparents a dragged row to the target parent', () => {
    const s = new State();
    const a = s.addRow(null);
    a.category = 'man';
    const child = s.addRow(a.id);   // child of a
    const b = s.addRow(null);
    // move child before b → becomes root sibling, category cleared
    s.moveRowBefore(child.id, b.id);
    assertEqual(child.parentId, null);
  });

  test('moveRowBefore is a no-op when target is a descendant of source', () => {
    const s = new State();
    const a = s.addRow(null);
    const b = s.addRow(a.id);
    const before = s.rows.map(r => r.id).join(',');
    s.moveRowBefore(a.id, b.id);
    assertEqual(s.rows.map(r => r.id).join(','), before);
  });

  test('moveRowBefore keeps the dragged subtree intact under the moved row', () => {
    const s = new State();
    // Tree: a -> child -> grand ; plus a separate root target b
    const a = s.addRow(null); a.category = 'man'; a.name = 'A';
    const child = s.addRow(a.id); child.name = 'Child';
    const grand = s.addRow(child.id); grand.name = 'Grand';
    const b = s.addRow(null); b.name = 'B';
    // Move `child` (which has descendant `grand`) before b → child becomes root.
    s.moveRowBefore(child.id, b.id);
    // child reparented to root (b's parent is null), category cleared since now a child...
    assertEqual(child.parentId, null);
    assertEqual(child.category, '');
    // grand still hangs off child (parentId chain intact)
    assertEqual(grand.parentId, child.id);
    assertEqual(s.getDepth(grand), 1);
    // grand is a descendant of child, and child is no longer under a
    assertEqual(s.descIds(child.id).join(','), String(grand.id));
    assertEqual(s.descIds(a.id).length, 0);
    // Order: child group sits directly before b in the flat rows array.
    const ids = s.rows.map(r => r.id);
    assertEqual(ids.indexOf(child.id) + 1, ids.indexOf(grand.id));
    assertEqual(ids.indexOf(grand.id) + 1, ids.indexOf(b.id));
  });

  test('moveRowBefore onto own descendant leaves rows order and parents unchanged', () => {
    const s = new State();
    const a = s.addRow(null);
    const child = s.addRow(a.id);
    const grand = s.addRow(child.id);
    const beforeOrder = s.rows.map(r => r.id).join(',');
    const beforeParents = s.rows.map(r => r.parentId).join(',');
    // grand is a descendant of a → move is rejected (no-op).
    s.moveRowBefore(a.id, grand.id);
    assertEqual(s.rows.map(r => r.id).join(','), beforeOrder);
    assertEqual(s.rows.map(r => r.parentId).join(','), beforeParents);
  });

  test('dupeRow gives the copy fresh stableIds and cloned (unshared) ratings', () => {
    const s = new State();
    const e = s.addExpert('A');
    const a = s.addRow(null); a.name = 'Parent'; a.ratings[e.id] = 5;
    const b = s.addRow(a.id); b.name = 'Child'; b.ratings[e.id] = 3;
    const origStableIds = new Set(s.rows.map(r => r.stableId));
    s.dupeRow(a.id, ' (Copy)');
    assertEqual(s.rows.length, 4);
    // The two copies must carry stableIds that did not exist before.
    const copies = s.rows.filter(r => !origStableIds.has(r.stableId));
    assertEqual(copies.length, 2);
    // Root copy got the copy suffix; child copy did not.
    const rootCopy = copies.find(r => r.name === 'Parent (Copy)');
    const childCopy = copies.find(r => r.name === 'Child');
    assertEqual(!!rootCopy, true);
    assertEqual(!!childCopy, true);
    // Ratings cloned by value, not shared reference.
    assertEqual(rootCopy.ratings[e.id], 5);
    rootCopy.ratings[e.id] = 99;
    assertEqual(a.ratings[e.id], 5); // original untouched
    // Child copy reparented under the root copy.
    assertEqual(childCopy.parentId, rootCopy.id);
  });
});

// ─── Experts & ratings ──────────────────────────────────────

suite('Ishikawa Model — experts & scoring', () => {
  test('addExpert appends with a colour and returns it', () => {
    const s = new State();
    const e = s.addExpert('Max Mustermann');
    assertEqual(s.experts.length, 1);
    assertEqual(e.name, 'Max Mustermann');
    assertEqual(typeof e.color, 'string');
  });

  test('addExpert rejects duplicate (case-insensitive)', () => {
    const s = new State();
    s.addExpert('Max');
    assertEqual(s.addExpert('max'), null);
    assertEqual(s.experts.length, 1);
  });

  test('removeExpert deletes ratings for that expert', () => {
    const s = new State();
    const e = s.addExpert('Max');
    const r = s.addRow(null);
    r.ratings[e.id] = 7;
    s.removeExpert(e.id);
    assertEqual(r.ratings[e.id], undefined);
  });

  test('calcScore averages defined ratings', () => {
    const s = new State();
    const e1 = s.addExpert('A');
    const e2 = s.addExpert('B');
    const r = s.addRow(null);
    r.ratings[e1.id] = 8;
    r.ratings[e2.id] = 4;
    assertEqual(s.calcScore(r), 6);
  });

  test('calcScore returns null with no experts', () => {
    const s = new State();
    const r = s.addRow(null);
    assertEqual(s.calcScore(r), null);
  });

  test('renameExpert rejects a case-insensitive duplicate of another expert', () => {
    const s = new State();
    const a = s.addExpert('Anna');
    const b = s.addExpert('Bob');
    // Renaming Bob to 'anna' collides with Anna (case-insensitive) → rejected.
    assertEqual(s.renameExpert(b.id, 'anna'), false);
    assertEqual(b.name, 'Bob'); // unchanged
    // Renaming to a unique name succeeds and trims.
    assertEqual(s.renameExpert(b.id, '  Bobby  '), true);
    assertEqual(b.name, 'Bobby');
    // Renaming to the same name (no change) is a success no-op.
    assertEqual(s.renameExpert(a.id, 'Anna'), true);
    assertEqual(a.name, 'Anna');
  });

  test('setRating clamps to 0..9 and deletes on empty', () => {
    const s = new State();
    const e = s.addExpert('A');
    const r = s.addRow(null);
    // Above-range value clamps to 9.
    s.setRating(r.id, e.id, 12);
    assertEqual(r.ratings[e.id], 9);
    // Below-range value clamps to 0.
    s.setRating(r.id, e.id, -1);
    assertEqual(r.ratings[e.id], 0);
    // In-range value stored as-is.
    s.setRating(r.id, e.id, 5);
    assertEqual(r.ratings[e.id], 5);
    // Empty string deletes the rating.
    s.setRating(r.id, e.id, '');
    assertEqual(r.ratings[e.id], undefined);
    // Set again, then non-numeric/NaN also deletes.
    s.setRating(r.id, e.id, 4);
    s.setRating(r.id, e.id, 'abc');
    assertEqual(r.ratings[e.id], undefined);
  });

  test('isNameDuplicate detects duplicate names ignoring self', () => {
    const s = new State();
    const a = s.addRow(null);
    a.name = 'Cause X';
    const b = s.addRow(null);
    b.name = 'Cause Y';
    // 'cause x' collides with row a (case-insensitive), excluding b
    assertEqual(s.isNameDuplicate('cause x', b.id), true);
    // excluding a itself, no other row is named 'Cause X'
    assertEqual(s.isNameDuplicate('Cause X', a.id), false);
  });
});

// ─── Snapshots & diff ───────────────────────────────────────

suite('Ishikawa Model — snapshots & diff', () => {
  test('saveSnapshot prepends a snapshot capturing rows', () => {
    const s = new State();
    s.addRow(null);
    s.saveSnapshot('Snap 1');
    assertEqual(s.snapshots.length, 1);
    assertEqual(s.snapshots[0].name, 'Snap 1');
    assertEqual(s.snapshots[0].data.rows.length, 1);
  });

  test('getDiff reports added rows vs an older snapshot', () => {
    const s = new State();
    s.addExpert('A');
    s.addRow(null);
    s.saveSnapshot('Old');
    s.addRow(null);
    const diff = s.getDiff(s.snapshots[0].id);
    assertEqual(diff.added.length, 1);
    assertEqual(diff.removed.length, 0);
  });

  test('getDiff returns null for unknown snapshot id', () => {
    const s = new State();
    assertEqual(s.getDiff(999), null);
  });

  test('getDiff reports a CHANGED row with before/after scores and delta', () => {
    const s = new State();
    const e = s.addExpert('A');
    const stayed = s.addRow(null); stayed.name = 'Stable'; stayed.ratings[e.id] = 5;
    const moved = s.addRow(null); moved.name = 'Rising'; moved.ratings[e.id] = 3;
    // Snapshot the current state (scores: stayed=5, moved=3).
    s.saveSnapshot('Old');
    const snapId = s.snapshots[0].id;
    // Now change `moved`'s rating 3 → 8; leave `stayed` untouched.
    s.setRating(moved.id, e.id, 8);
    const diff = s.getDiff(snapId);
    // No structural add/remove.
    assertEqual(diff.added.length, 0);
    assertEqual(diff.removed.length, 0);
    // Exactly one changed row: `moved`.
    assertEqual(diff.changed.length, 1);
    const ch = diff.changed[0];
    assertEqual(ch.row.stableId, moved.stableId);
    assertEqual(ch.oldScore, 3);
    assertEqual(ch.newScore, 8);
    assertEqual(ch.delta, 5);
    // changedMap keyed by stableId; addedSet empty.
    assertEqual(diff.changedMap[moved.stableId].newScore, 8);
    assertEqual(diff.changedMap[stayed.stableId], undefined);
    assertEqual(diff.addedSet.size, 0);
  });

  test('loadSnapshot restores rows/experts/problem and recomputes id counters', () => {
    const s = new State();
    const e = s.addExpert('A');
    const a = s.addRow(null); a.name = 'Cause A'; a.ratings[e.id] = 6;
    s.problem = 'Original problem';
    s.saveSnapshot('Snap');
    const snapId = s.snapshots[0].id;
    const snapStableId = a.stableId;
    // Mutate live state away from the snapshot.
    s.problem = 'Changed problem';
    s.addRow(null); // now 2 rows live
    assertEqual(s.rows.length, 2);
    // Restore.
    assertEqual(s.loadSnapshot(snapId), true);
    assertEqual(s.problem, 'Original problem');
    assertEqual(s.rows.length, 1);
    assertEqual(s.rows[0].name, 'Cause A');
    assertEqual(s.rows[0].ratings[e.id], 6);
    // stableId counter recomputed from restored data → next addRow continues
    // past the restored row's stableId (continuity, no collision).
    const restoredNum = parseInt(snapStableId.split('-')[1], 10);
    const nr = s.addRow(null);
    assertEqual(parseInt(nr.stableId.split('-')[1], 10) > restoredNum, true);
    assertEqual(nr.id > s.rows[0].id, true);
  });

  test('loadSnapshot returns false for unknown id', () => {
    const s = new State();
    assertEqual(s.loadSnapshot(12345), false);
  });

  test('removeSnapshot deletes the snapshot by id only', () => {
    const s = new State();
    s.addRow(null);
    s.saveSnapshot('Keep');
    s.saveSnapshot('Drop');
    const dropId = s.snapshots.find(sn => sn.name === 'Drop').id;
    s.removeSnapshot(dropId);
    assertEqual(s.snapshots.length, 1);
    assertEqual(s.snapshots[0].name, 'Keep');
  });
});

// ─── Facts / experiments / images CRUD ──────────────────────

suite('Ishikawa Model — facts / experiments / images', () => {
  test('addFact appends a fact with a today date', () => {
    const s = new State();
    const f = s.addFact();
    assertEqual(s.facts.length, 1);
    assertEqual(/^\d{4}-\d{2}-\d{2}$/.test(f.date), true);
  });

  test('removeFact deletes by id', () => {
    const s = new State();
    const f = s.addFact();
    s.removeFact(f.id);
    assertEqual(s.facts.length, 0);
  });

  test('addExperiment appends a planned experiment', () => {
    const s = new State();
    const x = s.addExperiment();
    assertEqual(s.experiments.length, 1);
    assertEqual(x.status, 'planned');
    assertEqual(Array.isArray(x.hypothesisIds), true);
  });

  test('removeExperiment deletes by id', () => {
    const s = new State();
    const x = s.addExperiment();
    s.removeExperiment(x.id);
    assertEqual(s.experiments.length, 0);
  });

  test('addImage / removeImage manage a gallery kind', () => {
    const s = new State();
    const img = s.addImage('inScope', 'data:image/png;base64,xxx');
    assertEqual(s.images.inScope.length, 1);
    s.removeImage('inScope', img.id);
    assertEqual(s.images.inScope.length, 0);
  });
});

// ─── Pareto data ────────────────────────────────────────────

suite('Ishikawa Model — pareto data', () => {
  test('paretoData scores and sorts rows descending', () => {
    const s = new State();
    const e = s.addExpert('A');
    const r1 = s.addRow(null); r1.name = 'Low'; r1.ratings[e.id] = 2;
    const r2 = s.addRow(null); r2.name = 'High'; r2.ratings[e.id] = 9;
    const data = s.paretoData('current');
    assertEqual(data.length, 2);
    assertEqual(data[0].name, 'High');
    assertEqual(data[1].name, 'Low');
  });

  test('paretoData skips unrated rows', () => {
    const s = new State();
    s.addExpert('A');
    s.addRow(null); // no ratings
    assertEqual(s.paretoData('current').length, 0);
  });

  test('paretoData("snap-<id>") scores against the snapshot, not live state', () => {
    const s = new State();
    const e = s.addExpert('A');
    const r1 = s.addRow(null); r1.name = 'Low'; r1.ratings[e.id] = 2;
    const r2 = s.addRow(null); r2.name = 'High'; r2.ratings[e.id] = 9;
    s.saveSnapshot('Snap');
    const snapId = s.snapshots[0].id;
    // Change live state drastically so a live read would differ from the snap.
    s.setRating(r2.id, e.id, 1);
    s.addRow(null); // extra live row (unrated) — must not appear in snap read
    const data = s.paretoData('snap-' + snapId);
    // Snapshot had two rated rows; sorted desc by the snapshotted scores.
    assertEqual(data.length, 2);
    assertEqual(data[0].name, 'High');
    assertEqual(data[0].avg, 9);
    assertEqual(data[1].name, 'Low');
    assertEqual(data[1].avg, 2);
  });

  test('paretoData("snap-<unknown>") returns empty', () => {
    const s = new State();
    assertEqual(s.paretoData('snap-9999').length, 0);
  });
});

// ─── Serialization ──────────────────────────────────────────

suite('Ishikawa Model — serialization', () => {
  test('toJSON returns the legacy persistence shape', () => {
    const s = new State();
    s.problem = 'P';
    const j = s.toJSON();
    assertEqual('problem' in j, true);
    assertEqual('experts' in j, true);
    assertEqual('catLabels' in j, true);
    assertEqual('rows' in j, true);
    assertEqual('snapshots' in j, true);
    assertEqual('experiments' in j, true);
    assertEqual('facts' in j, true);
    assertEqual('images' in j, true);
  });

  test('toJSON deep-copies nested tree/arrays (no shared references)', () => {
    const s = new State();
    const r = s.addRow(null);
    r.ratings[1] = 5;
    const j = s.toJSON();
    j.rows[0].ratings[1] = 99;
    assertEqual(s.rows[0].ratings[1], 5); // original untouched
  });

  test('fromJSON(null) yields a valid default state', () => {
    const s = State.fromJSON(null);
    assertEqual(s.problem, '');
    assertEqual(s.rows.length, 0);
  });

  test('fromJSON(undefined) yields a valid default state', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.rows.length, 0);
  });

  test('fromJSON(malformed) yields a valid default state', () => {
    const s = State.fromJSON({ rows: 'nope', experts: 42 });
    assertEqual(s.rows.length, 0);
    assertEqual(s.experts.length, 0);
  });

  test('toJSON → fromJSON round-trip preserves the tree', () => {
    const s = new State();
    s.problem = 'Late delivery';
    const e = s.addExpert('A');
    const a = s.addRow(null); a.name = 'Parent'; a.category = 'man';
    const b = s.addRow(a.id); b.name = 'Child';
    a.ratings[e.id] = 7;
    s.addFact();
    s.addExperiment();
    const round = State.fromJSON(s.toJSON());
    assertEqual(round.problem, 'Late delivery');
    assertEqual(round.experts.length, 1);
    assertEqual(round.rows.length, 2);
    assertEqual(round.effCat(round.rows[1]), 'man');
    assertEqual(round.facts.length, 1);
    assertEqual(round.experiments.length, 1);
  });

  test('fromJSON recomputes id counters so new ids do not collide', () => {
    const s = State.fromJSON({
      rows: [{ id: 5, stableId: 'H-007', parentId: null, ratings: {}, status: 'open' }],
    });
    const r = s.addRow(null);
    assertEqual(r.id > 5, true);
    assertEqual(r.stableId, 'H-008');
  });
});
