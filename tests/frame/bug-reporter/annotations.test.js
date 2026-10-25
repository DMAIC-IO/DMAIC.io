import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { createAnnotationModel, dragCropEdge, MIN_CROP } from '../../../js/frame/bug-reporter/annotations.js';

function model(scale = 0.5) {
  const m = createAnnotationModel({ width: 1920, height: 1080 });
  m.setDisplayScale(scale);
  return m;
}

suite('bug-reporter annotations', () => {
  test('frame converts display → image pixels', () => {
    const m = model();
    m.begin('frame', { x: 60, y: 170 });
    m.move({ x: 190, y: 215 });
    m.end();
    assertDeepEqual(m.items(), [{ type: 'frame', x: 120, y: 340, w: 260, h: 90 }]);
  });

  test('rectangles drawn up-left are normalised', () => {
    const m = model(1);
    m.begin('circle', { x: 100, y: 100 });
    m.move({ x: 40, y: 70 });
    m.end();
    assertDeepEqual(m.items(), [{ type: 'circle', x: 40, y: 70, w: 60, h: 30 }]);
  });

  test('arrow keeps direction', () => {
    const m = model(1);
    m.begin('arrow', { x: 700, y: 400 });
    m.move({ x: 820, y: 460 });
    m.end();
    assertDeepEqual(m.items(), [{ type: 'arrow', x1: 700, y1: 400, x2: 820, y2: 460 }]);
  });

  test('line collects all points', () => {
    const m = model(1);
    m.begin('line', { x: 100, y: 100 });
    m.move({ x: 140, y: 160 });
    m.move({ x: 190, y: 150 });
    m.end();
    assertDeepEqual(m.items(), [{ type: 'line', points: [[100, 100], [140, 160], [190, 150]] }]);
  });

  test('click without drag adds nothing', () => {
    const m = model(1);
    for (const tool of ['frame', 'circle', 'arrow', 'line', 'textbox']) {
      m.begin(tool, { x: 10, y: 10 });
      assertEqual(m.end(), null, tool);
    }
    assertEqual(m.items().length, 0);
  });

  test('line that never leaves its start adds nothing', () => {
    const m = model(1);
    m.begin('line', { x: 100, y: 100 });
    m.move({ x: 100, y: 100 });
    m.move({ x: 101, y: 102 });
    assertEqual(m.end(), null);
    assertEqual(m.items().length, 0);
  });

  test('clamps to image bounds', () => {
    const m = model(0.5);
    m.begin('frame', { x: -20, y: -20 });
    m.move({ x: 2000, y: 2000 });
    m.end();
    assertDeepEqual(m.items(), [{ type: 'frame', x: 0, y: 0, w: 1920, h: 1080 }]);
  });

  test('textbox gets text; empty text removes it', () => {
    const m = model(1);
    m.begin('textbox', { x: 900, y: 120 });
    m.move({ x: 1140, y: 190 });
    m.end();
    m.setText(0, 'hier steht die Zahl falsch');
    assertEqual(m.items()[0].text, 'hier steht die Zahl falsch');
    m.setText(0, '   ');
    assertEqual(m.items().length, 0);
  });

  test('undo removes the last item', () => {
    const m = model(1);
    m.begin('frame', { x: 0, y: 0 }); m.move({ x: 20, y: 20 }); m.end();
    m.begin('arrow', { x: 0, y: 0 }); m.move({ x: 20, y: 20 }); m.end();
    assertTrue(m.undo());
    assertEqual(m.items().length, 1);
    assertEqual(m.items()[0].type, 'frame');
    assertTrue(m.undo());
    assertEqual(m.undo(), false);
  });

  test('cancel drops the draft without committing', () => {
    const m = model(1);
    m.begin('frame', { x: 10, y: 10 });
    m.move({ x: 300, y: 300 });
    m.cancel();
    assertEqual(m.draft(), null);
    assertEqual(m.items().length, 0);
  });

  test('toJSON carries image size', () => {
    const m = model(1);
    assertDeepEqual(m.toJSON(), { image: { width: 1920, height: 1080 }, items: [] });
  });
  test('crop starts as the whole image', () => {
    assertDeepEqual(model().crop(), { x: 0, y: 0, w: 1920, h: 1080 });
  });

  test('setCrop clamps to the image and reports whether it changed', () => {
    const m = model();
    assertTrue(m.setCrop({ x: -50, y: 100, w: 600, h: 2000 }));
    assertDeepEqual(m.crop(), { x: 0, y: 100, w: 550, h: 980 });
    assertEqual(m.setCrop({ x: 0, y: 100, w: 550, h: 980 }), false);
  });

  test('drawing in a cropped view maps display px into the crop', () => {
    const m = model(2);
    m.setCrop({ x: 400, y: 300, w: 200, h: 100 });
    m.begin('frame', { x: 20, y: 40 });
    m.move({ x: 1000, y: 120 }); // beyond the right edge of the crop
    m.end();
    assertDeepEqual(m.items(), [{ type: 'frame', x: 410, y: 320, w: 190, h: 40 }]);
  });

  test('undo restores crops and items in the order they happened', () => {
    const m = model(1);
    m.begin('frame', { x: 0, y: 0 }); m.move({ x: 20, y: 20 }); m.end();
    m.setCrop({ x: 10, y: 10, w: 500, h: 400 });
    m.setCrop({ x: 20, y: 20, w: 300, h: 200 });
    assertTrue(m.undo());
    assertDeepEqual(m.crop(), { x: 10, y: 10, w: 500, h: 400 });
    assertTrue(m.undo());
    assertDeepEqual(m.crop(), { x: 0, y: 0, w: 1920, h: 1080 });
    assertEqual(m.items().length, 1);
    assertTrue(m.undo());
    assertEqual(m.items().length, 0);
    assertEqual(m.undo(), false);
  });

  test('an emptied textbox leaves no undo step behind', () => {
    const m = model(1);
    m.setCrop({ x: 10, y: 10, w: 500, h: 400 });
    m.begin('textbox', { x: 10, y: 10 }); m.move({ x: 100, y: 60 }); m.end();
    m.setText(0, '');
    assertTrue(m.undo());
    assertDeepEqual(m.crop(), { x: 0, y: 0, w: 1920, h: 1080 });
  });

  test('toJSON of a cropped image: crop size, offset, shifted items, hidden ones dropped', () => {
    const m = model(1);
    m.begin('frame', { x: 100, y: 100 }); m.move({ x: 200, y: 150 }); m.end();   // inside
    m.begin('arrow', { x: 50, y: 50 }); m.move({ x: 150, y: 120 }); m.end();     // partly inside
    m.begin('line', { x: 1500, y: 900 }); m.move({ x: 1600, y: 950 }); m.end(); // outside
    m.begin('textbox', { x: 900, y: 10 }); m.move({ x: 1000, y: 60 }); m.end(); // outside
    m.setText(3, 'weg');
    m.setCrop({ x: 80, y: 80, w: 400, h: 300 });
    assertDeepEqual(m.toJSON(), {
      image: { width: 400, height: 300 },
      crop: { x: 80, y: 80, w: 400, h: 300 },
      items: [
        { type: 'frame', x: 20, y: 20, w: 100, h: 50 },
        { type: 'arrow', x1: -30, y1: -30, x2: 70, y2: 40 },
      ],
    });
  });

  test('dragCropEdge moves one edge, keeps the opposite one and the minimum size', () => {
    const img = { width: 1920, height: 1080 };
    const r = { x: 100, y: 100, w: 800, h: 600 };
    assertDeepEqual(dragCropEdge(r, 'left', 300, img), { x: 300, y: 100, w: 600, h: 600 });
    assertDeepEqual(dragCropEdge(r, 'right', 2500, img), { x: 100, y: 100, w: 1820, h: 600 });
    assertDeepEqual(dragCropEdge(r, 'top', -40, img), { x: 100, y: 0, w: 800, h: 700 });
    assertDeepEqual(dragCropEdge(r, 'bottom', 105, img), { x: 100, y: 100, w: 800, h: MIN_CROP });
    assertDeepEqual(dragCropEdge(r, 'left', 5000, img), { x: 900 - MIN_CROP, y: 100, w: MIN_CROP, h: 600 });
  });
});
