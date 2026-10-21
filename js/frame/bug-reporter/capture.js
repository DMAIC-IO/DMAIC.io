/**
 * D.Mike — Screen capture (frame/bug-reporter/capture.js)
 * One frame via getDisplayMedia → <video> → <canvas> → PNG, then the track
 * is stopped. Video + canvas instead of ImageCapture.grabFrame(): canvas
 * drawing is available everywhere, ImageCapture is not.
 */

/** Capture failure; `reason` drives the user message. */
export class CaptureError extends Error {
  /** @param {'unsupported'|'denied'|'failed'} reason @param {string} [message] */
  constructor(reason, message) {
    super(message || reason);
    this.name = 'CaptureError';
    this.reason = reason;
  }
}

/** Max wait for the first paintable frame before giving up. */
export const FIRST_FRAME_TIMEOUT_MS = 3000;

function waitFor(el, event, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new CaptureError('failed', `video ${event} timed out`)), timeoutMs);
    el.addEventListener(event, () => { clearTimeout(timer); resolve(); }, { once: true });
    el.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error(`video ${event} failed`));
    }, { once: true });
  });
}

/**
 * Ask the user to share a screen, grab one frame as PNG and stop sharing.
 * Waits for `loadeddata` (not `loadedmetadata`): metadata can arrive before
 * the first paintable frame, which would yield a blank image.
 * @param {Navigator} [nav] seam for the environment's navigator
 * @param {Document} [doc] seam for the environment's document
 * @param {number} [timeoutMs] max wait for the first frame
 * @returns {Promise<{blob: Blob, width: number, height: number}>}
 * @throws {CaptureError}
 */
export async function captureScreen(nav = navigator, doc = document, timeoutMs = FIRST_FRAME_TIMEOUT_MS) {
  const getDisplayMedia = nav.mediaDevices?.getDisplayMedia?.bind(nav.mediaDevices);
  if (!getDisplayMedia) throw new CaptureError('unsupported');

  let stream;
  try {
    stream = await getDisplayMedia({ video: true, audio: false });
  } catch (err) {
    const denied = err?.name === 'NotAllowedError' || err?.name === 'AbortError';
    throw new CaptureError(denied ? 'denied' : 'failed', err?.message);
  }

  try {
    const video = doc.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    const ready = video.readyState >= 2 ? Promise.resolve() : waitFor(video, 'loadeddata', timeoutMs);
    ready.catch(() => {}); // a rejection after play() failed must not go unhandled
    await video.play();
    await ready;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) throw new Error('empty video frame');
    const canvas = doc.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(video, 0, 0, width, height);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    if (!blob) throw new Error('canvas.toBlob returned null');
    video.srcObject = null;
    return { blob, width, height };
  } catch (err) {
    if (err instanceof CaptureError) throw err;
    throw new CaptureError('failed', err?.message);
  } finally {
    stream.getTracks().forEach(t => t.stop());
  }
}
