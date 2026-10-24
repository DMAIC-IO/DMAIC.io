// Needs canvas and createImageBitmap: runs in the browser bridge only
// (listed in SKIP of tests/run-node.mjs).
import { suite, test, assertEqual } from '../../test-utils.js';
import { cropImage } from '../../../js/frame/bug-reporter/capture.js';

suite('bug-reporter capture (DOM)', () => {
  test('cropImage cuts the PNG to the crop', async () => {
    const c = document.createElement('canvas');
    c.width = 200; c.height = 100;
    const g = c.getContext('2d');
    g.fillStyle = '#ff0000'; g.fillRect(0, 0, 200, 100);
    g.fillStyle = '#0000ff'; g.fillRect(150, 60, 50, 40);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const shot = await cropImage({ blob, width: 200, height: 100 }, { x: 150, y: 60, w: 50, h: 40 });
    assertEqual(shot.width, 50);
    assertEqual(shot.height, 40);
    assertEqual(shot.blob.type, 'image/png');
    const bmp = await createImageBitmap(shot.blob);
    assertEqual(bmp.width, 50);
    assertEqual(bmp.height, 40);
    const check = document.createElement('canvas');
    check.width = 50; check.height = 40;
    check.getContext('2d').drawImage(bmp, 0, 0);
    const [r, , b] = check.getContext('2d').getImageData(0, 0, 1, 1).data;
    assertEqual(r, 0);
    assertEqual(b, 255);
  });
});
