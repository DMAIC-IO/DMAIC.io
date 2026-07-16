export const IMAGE_UPLOAD_ERRORS = {
  NO_FILE: 'NO_FILE',
  INVALID_TYPE: 'INVALID_TYPE',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  READ_ERROR: 'READ_ERROR',
};

/**
 * Read an image file as a data URL with validation.
 * @param {File} file - The file to read
 * @param {object} [options]
 * @param {number} [options.maxSize=2*1024*1024] - Max file size in bytes
 * @returns {Promise<string>} Data URL of the image
 */
export function readImageFile(file, options = {}) {
  const { maxSize = 2 * 1024 * 1024 } = options;

  return new Promise((resolve, reject) => {
    if (!file) { reject(new Error(IMAGE_UPLOAD_ERRORS.NO_FILE)); return; }

    if (!file.type.startsWith('image/')) {
      reject(new Error(IMAGE_UPLOAD_ERRORS.INVALID_TYPE)); return;
    }

    if (file.size > maxSize) {
      reject(new Error(IMAGE_UPLOAD_ERRORS.FILE_TOO_LARGE)); return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(reader.result ?? '');
    reader.onerror = () => reject(new Error(IMAGE_UPLOAD_ERRORS.READ_ERROR));
    reader.readAsDataURL(file);
  });
}

/**
 * Estimate the decoded byte size of a base64 `image/jpeg` data URL.
 * @param {string} dataUrl - A `data:image/jpeg;base64,…` data URL
 * @returns {number} Estimated size in bytes
 */
export function jpegDataUrlBytes(dataUrl) {
  return Math.ceil((dataUrl.length - 'data:image/jpeg;base64,'.length) * 3 / 4);
}

/**
 * Compress an image below a byte budget via canvas JPEG re-encoding.
 *
 * Backs off first on JPEG quality, then on output dimensions, until the
 * encoded result fits `maxBytes` (or no further reduction is possible).
 *
 * @param {File|Blob} file - The source image file
 * @param {object} [options]
 * @param {number} [options.maxBytes=100*1024] - Target byte budget
 * @param {number} [options.maxDim=1600] - Initial max output dimension (px)
 * @param {number} [options.minDim=320] - Smallest dimension to back off to
 * @returns {Promise<{dataUrl: string, bytes: number}>} Encoded JPEG data URL
 *   and its estimated byte size. `bytes` may exceed `maxBytes` when the budget
 *   cannot be met (caller should warn).
 */
export async function compressImageToBudget(file, options = {}) {
  const { maxBytes = 100 * 1024, maxDim: maxDimCap = 1600, minDim = 320 } = options;
  const srcUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = srcUrl;
    });
    const maxDim = Math.max(img.naturalWidth, img.naturalHeight);
    let targetDim = Math.min(maxDim, maxDimCap);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const encode = (dim, quality) => {
      const ratio = dim / maxDim;
      canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      const bytes = jpegDataUrlBytes(dataUrl);
      return { dataUrl, bytes };
    };
    let best = encode(targetDim, 0.85);
    const qualitySteps = [0.75, 0.65, 0.55, 0.45, 0.35];
    let qi = 0;
    while (best.bytes > maxBytes) {
      if (qi < qualitySteps.length) { best = encode(targetDim, qualitySteps[qi]); qi++; }
      else if (targetDim > minDim) { targetDim = Math.max(minDim, Math.round(targetDim * 0.75)); qi = 0; best = encode(targetDim, 0.85); }
      else break;
    }
    return best;
  } finally {
    URL.revokeObjectURL(srcUrl);
  }
}
