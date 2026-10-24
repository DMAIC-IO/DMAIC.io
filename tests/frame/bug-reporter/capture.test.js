import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import { captureScreen, CaptureError, cropImage } from '../../../js/frame/bug-reporter/capture.js';

function fakeEnv() {
  const stopped = [];
  const stream = { getTracks: () => [{ stop: () => stopped.push(1) }] };
  const nav = { mediaDevices: { getDisplayMedia: async () => stream } };
  const doc = {
    createElement() {
      return { readyState: 0, addEventListener() {}, play: async () => {} };
    },
  };
  return { nav, doc, stopped };
}

suite('bug-reporter capture', () => {
  test('times out when no first frame arrives and still stops the tracks', async () => {
    const { nav, doc, stopped } = fakeEnv();
    let err;
    try { await captureScreen(nav, doc, 20); } catch (e) { err = e; }
    assertTrue(err instanceof CaptureError);
    assertEqual(err.reason, 'failed');
    assertEqual(stopped.length, 1);
  });

  test('offers the app tab itself: Chrome hides the own tab unless asked', async () => {
    const { nav, doc } = fakeEnv();
    let options;
    const share = nav.mediaDevices.getDisplayMedia;
    nav.mediaDevices.getDisplayMedia = async (o) => { options = o; return share(); };
    try { await captureScreen(nav, doc, 20); } catch { /* no frame in the fake */ }
    assertEqual(options.selfBrowserSurface, 'include');
    assertEqual(options.preferCurrentTab, true);
    assertEqual(options.audio, false);
  });

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
