import { suite, test, assertEqual } from '../test-utils.js';
import { Cell, Label, State } from '../../js/modules/triz-9-windows/triz-9-windows-model.js';

suite('TRIZ 9-Windows Model — Label', () => {
  test('constructor sets default value', () => {
    const l = new Label();
    assertEqual(l.val, '');
  });

  test('toJSON returns val', () => {
    const l = new Label();
    l.val = 'hello';
    assertEqual(l.toJSON(), 'hello');
  });

  test('fromJSON restores string', () => {
    const l = Label.fromJSON('hello');
    assertEqual(l.val, 'hello');
  });

  test('fromJSON null returns empty', () => {
    const l = Label.fromJSON(null);
    assertEqual(l.val, '');
  });

  test('fromJSON non-string coerces to empty', () => {
    const l = Label.fromJSON(42);
    assertEqual(l.val, '');
  });

  test('round-trip toJSON → fromJSON preserves', () => {
    const l = new Label();
    l.val = 'preserve me';
    const json = l.toJSON();
    const restored = Label.fromJSON(json);
    assertEqual(restored.val, 'preserve me');
  });
});

suite('TRIZ 9-Windows Model — Cell', () => {
  test('constructor sets default values', () => {
    const c = new Cell();
    assertEqual(c.text, '');
    assertEqual(c.image, null);
  });

  test('toJSON returns text and image', () => {
    const c = new Cell();
    c.text = 'test text';
    c.image = 'data:image/png;base64,abc';
    const json = c.toJSON();
    assertEqual(json.text, 'test text');
    assertEqual(json.image, 'data:image/png;base64,abc');
  });

  test('fromJSON restores valid data', () => {
    const c = Cell.fromJSON({ text: 'hello', image: 'data:img/png;base64,123' });
    assertEqual(c.text, 'hello');
    assertEqual(c.image, 'data:img/png;base64,123');
  });

  test('fromJSON with null returns default cell', () => {
    const c = Cell.fromJSON(null);
    assertEqual(c.text, '');
    assertEqual(c.image, null);
  });

  test('fromJSON with undefined returns default cell', () => {
    const c = Cell.fromJSON(undefined);
    assertEqual(c.text, '');
    assertEqual(c.image, null);
  });

  test('fromJSON sanitises non-string text to empty string', () => {
    const c = Cell.fromJSON({ text: 123, image: null });
    assertEqual(c.text, '');
    assertEqual(c.image, null);
  });

  test('fromJSON sanitises non-string image to null', () => {
    const c = Cell.fromJSON({ text: 'abc', image: 456 });
    assertEqual(c.text, 'abc');
    assertEqual(c.image, null);
  });

  test('fromJSON empty object returns default cell', () => {
    const c = Cell.fromJSON({});
    assertEqual(c.text, '');
    assertEqual(c.image, null);
  });

  test('round-trip toJSON \u2192 fromJSON preserves data', () => {
    const original = new Cell();
    original.text = 'roundtrip';
    original.image = 'data:img/png;base64,xyz';
    const json = original.toJSON();
    const restored = Cell.fromJSON(json);
    assertEqual(restored.text, 'roundtrip');
    assertEqual(restored.image, 'data:img/png;base64,xyz');
  });
});

suite('TRIZ 9-Windows Model — State', () => {
  test('constructor sets default values', () => {
    const s = new State();
    assertEqual(s.systemTitle, '');
    assertEqual(Object.keys(s.colLabels).length, 3);
    assertEqual(s.colLabels[0].val, '');
    assertEqual(s.colLabels[1].val, '');
    assertEqual(s.colLabels[2].val, '');
    assertEqual(Object.keys(s.rows).length, 3);
    assertEqual(s.rows[0].rowLabel.val, '');
    assertEqual(s.rows[1].rowLabel.val, '');
    assertEqual(s.rows[2].rowLabel.val, '');
  });

  test('constructor creates all 9 cells as Cell instances', () => {
    const s = new State();
    assertEqual(Object.keys(s.rows).length, 3);
    for (let r = 0; r < 3; r++) {
      assertEqual(Object.keys(s.rows[r].cells).length, 3);
      for (let c = 0; c < 3; c++) {
        assertEqual(s.rows[r].cells[c] instanceof Cell, true);
        assertEqual(s.rows[r].cells[c].text, '');
        assertEqual(s.rows[r].cells[c].image, null);
      }
    }
  });

  test('toJSON returns _schema, systemTitle, colLabels, rowLabels, cells', () => {
    const s = new State();
    s.systemTitle = 'test-system';
    s.colLabels[0].val = 'a';
    s.colLabels[1].val = 'b';
    s.colLabels[2].val = 'c';
    s.rows[0].rowLabel.val = 'x';
    s.rows[1].rowLabel.val = 'y';
    s.rows[2].rowLabel.val = 'z';
    s.rows[1].cells[2].text = 'a note';
    const json = s.toJSON();
    assertEqual(json._schema.name, 'triz-9-windows');
    assertEqual(json._schema.version, '1.0');
    assertEqual(json.systemTitle, 'test-system');
    assertEqual(json.colLabels[0], 'a');
    assertEqual(json.colLabels[1], 'b');
    assertEqual(json.colLabels[2], 'c');
    assertEqual(json.rowLabels[0], 'x');
    assertEqual(json.rowLabels[1], 'y');
    assertEqual(json.rowLabels[2], 'z');
    assertEqual(json.cells[1][2].text, 'a note');
    assertEqual(json.cells[1][2].image, null);
  });

  test('toJSON does not leak internal _schema reference', () => {
    const s = new State();
    const json = s.toJSON();
    json._schema.version = 'hacked';
    assertEqual(s._schema.version, '1.0');
  });

  test('toJSON produces independent copies', () => {
    const s = new State();
    s.colLabels[0].val = 'a';
    s.rows[0].rowLabel.val = 'x';
    const json = s.toJSON();
    json.colLabels[0] = 'hacked';
    json.rowLabels[0] = 'hacked';
    assertEqual(s.colLabels[0].val, 'a');
    assertEqual(s.rows[0].rowLabel.val, 'x');
  });

  test('fromJSON restores full state', () => {
    const original = new State();
    original.systemTitle = 'my-system';
    original.colLabels[0].val = 'col1';
    original.colLabels[1].val = 'col2';
    original.colLabels[2].val = 'col3';
    original.rows[0].rowLabel.val = 'row1';
    original.rows[1].rowLabel.val = 'row2';
    original.rows[2].rowLabel.val = 'row3';
    original.rows[0].cells[0].text = 'cell00';
    original.rows[0].cells[0].image = 'data:img/png;base64,img00';
    original.rows[2].cells[1].text = 'cell21';
    original.rows[2].cells[1].image = 'data:img/png;base64,img21';

    const json = original.toJSON();
    const restored = State.fromJSON(json);
    assertEqual(restored.systemTitle, 'my-system');
    assertEqual(restored.colLabels[0].val, 'col1');
    assertEqual(restored.colLabels[1].val, 'col2');
    assertEqual(restored.colLabels[2].val, 'col3');
    assertEqual(restored.rows[0].rowLabel.val, 'row1');
    assertEqual(restored.rows[1].rowLabel.val, 'row2');
    assertEqual(restored.rows[2].rowLabel.val, 'row3');
    assertEqual(restored.rows[0].cells[0].text, 'cell00');
    assertEqual(restored.rows[0].cells[0].image, 'data:img/png;base64,img00');
    assertEqual(restored.rows[2].cells[1].text, 'cell21');
    assertEqual(restored.rows[2].cells[1].image, 'data:img/png;base64,img21');
  });

  test('fromJSON with null returns default state', () => {
    const s = State.fromJSON(null);
    assertEqual(s.systemTitle, '');
    assertEqual(s.colLabels[0].val, '');
    assertEqual(s.rows[0].rowLabel.val, '');
    assertEqual(s.rows[0].cells[0].text, '');
  });

  test('fromJSON with undefined returns default state', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.systemTitle, '');
    assertEqual(s.rows[0].cells[0] instanceof Cell, true);
  });

  test('fromJSON sanitises systemTitle to string', () => {
    const s = State.fromJSON({ systemTitle: 42 });
    assertEqual(s.systemTitle, '');
  });

  test('fromJSON sanitises colLabels', () => {
    const s = State.fromJSON({ colLabels: ['a', 42, null] });
    assertEqual(s.colLabels[0].val, 'a');
    assertEqual(s.colLabels[1].val, '');
    assertEqual(s.colLabels[2].val, '');
  });

  test('fromJSON sanitises rowLabels', () => {
    const s = State.fromJSON({ rowLabels: [null, 'b', 123] });
    assertEqual(s.rows[0].rowLabel.val, '');
    assertEqual(s.rows[1].rowLabel.val, 'b');
    assertEqual(s.rows[2].rowLabel.val, '');
  });

  test('fromJSON with wrong label lengths defaults', () => {
    const s = State.fromJSON({ colLabels: ['a', 'b'], rowLabels: ['x', 'y', 'z', 'w'] });
    assertEqual(s.colLabels[0].val, '');
    assertEqual(s.colLabels[1].val, '');
    assertEqual(s.colLabels[2].val, '');
    assertEqual(s.rows[0].rowLabel.val, '');
    assertEqual(s.rows[1].rowLabel.val, '');
    assertEqual(s.rows[2].rowLabel.val, '');
  });

  test('fromJSON preserves cells structure', () => {
    const s = State.fromJSON({
      cells: [
        [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
        [{ text: 'd' }, { text: 'e' }, { text: 'f' }],
        [{ text: 'g' }, { text: 'h' }, { text: 'i' }],
      ]
    });
    assertEqual(s.rows[0].cells[0].text, 'a');
    assertEqual(s.rows[0].cells[1].text, 'b');
    assertEqual(s.rows[0].cells[2].text, 'c');
    assertEqual(s.rows[1].cells[0].text, 'd');
    assertEqual(s.rows[1].cells[1].text, 'e');
    assertEqual(s.rows[1].cells[2].text, 'f');
    assertEqual(s.rows[2].cells[0].text, 'g');
    assertEqual(s.rows[2].cells[1].text, 'h');
    assertEqual(s.rows[2].cells[2].text, 'i');
  });

  test('fromJSON missing cells returns empty 3x3 grid', () => {
    const s = State.fromJSON({ systemTitle: 'no cells' });
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        assertEqual(s.rows[r].cells[c] instanceof Cell, true);
        assertEqual(s.rows[r].cells[c].text, '');
        assertEqual(s.rows[r].cells[c].image, null);
      }
    }
  });

  test('hasContent returns false for empty state', () => {
    const s = new State();
    assertEqual(s.hasContent(), false);
  });

  test('hasContent returns true with systemTitle', () => {
    const s = new State();
    s.systemTitle = 'a title';
    assertEqual(s.hasContent(), true);
  });

  test('hasContent returns true with cell text', () => {
    const s = new State();
    s.rows[1].cells[1].text = 'some text';
    assertEqual(s.hasContent(), true);
  });

  test('clearCellImage sets image to null', () => {
    const s = new State();
    s.rows[0].cells[1].image = 'data:img/png;base64,test';
    s.clearCellImage(0, 1);
    assertEqual(s.rows[0].cells[1].image, null);
  });

  test('round-trip toJSON \u2192 fromJSON preserves all cells', () => {
    const original = new State();
    original.systemTitle = 'test-roundtrip';
    original.colLabels[0].val = 'colA';
    original.colLabels[1].val = 'colB';
    original.colLabels[2].val = 'colC';
    original.rows[0].rowLabel.val = 'rowA';
    original.rows[1].rowLabel.val = 'rowB';
    original.rows[2].rowLabel.val = 'rowC';
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        original.rows[r].cells[c].text = `cell ${r}x${c}`;
        original.rows[r].cells[c].image = `data:img/png;base64,img${r}${c}`;
      }
    }
    const json = original.toJSON();
    const restored = State.fromJSON(json);
    assertEqual(restored.systemTitle, 'test-roundtrip');
    assertEqual(restored.colLabels[0].val, 'colA');
    assertEqual(restored.colLabels[1].val, 'colB');
    assertEqual(restored.colLabels[2].val, 'colC');
    assertEqual(restored.rows[0].rowLabel.val, 'rowA');
    assertEqual(restored.rows[1].rowLabel.val, 'rowB');
    assertEqual(restored.rows[2].rowLabel.val, 'rowC');
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        assertEqual(restored.rows[r].cells[c].text, `cell ${r}x${c}`);
        assertEqual(restored.rows[r].cells[c].image, `data:img/png;base64,img${r}${c}`);
      }
    }
  });
});
