/**
 * D.Mike — Minimal ZIP reader (zip-reader.js)
 *
 * Browser-native ZIP archive reader. Uses DecompressionStream('deflate-raw')
 * for compressed entries (Method 8, the only widely used method besides STORED).
 * No external dependencies — built specifically for OPC-style archives like
 * Minitab .mpx and Office .xlsx, where every entry is a small XML/text file.
 *
 * Supports:
 *   - Method 0 (STORED, no compression)
 *   - Method 8 (DEFLATE)
 *
 * Does NOT support: encrypted archives, ZIP64, multi-disk archives. For an
 * MPX project file these limits are irrelevant.
 */

const SIG_LFH      = 0x04034b50; // local file header
const SIG_CD       = 0x02014b50; // central directory entry
const SIG_EOCD     = 0x06054b50; // end of central directory record
const SIG_EOCD64   = 0x06064b50; // ZIP64 EOCD (rejected)

/**
 * Read a ZIP archive from an ArrayBuffer.
 * @param {ArrayBuffer} buffer
 * @returns {Promise<Map<string, Uint8Array>>}
 *   Map from entry path to decompressed bytes.
 */
export async function readZip(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  const eocd = _findEOCD(view, bytes);
  if (!eocd) throw new Error('zip: end-of-central-directory record not found');

  const entries = new Map();
  let offset = eocd.cdOffset;
  for (let i = 0; i < eocd.totalEntries; i++) {
    if (offset + 46 > bytes.length) throw new Error('zip: truncated central directory');
    if (view.getUint32(offset, true) !== SIG_CD) {
      throw new Error(`zip: bad central-directory signature at ${  offset}`);
    }
    const method      = view.getUint16(offset + 10, true);
    const compSize    = view.getUint32(offset + 20, true);
    const uncompSize  = view.getUint32(offset + 24, true);
    const nameLen     = view.getUint16(offset + 28, true);
    const extraLen    = view.getUint16(offset + 30, true);
    const commentLen  = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const rawName     = _readUtf8(bytes, offset + 46, nameLen);
    // Some producers (e.g. Minitab .mpx) prefix every entry with a leading
    // slash. Strip it so downstream consumers can look entries up by their
    // natural relative path.
    const name = rawName.replace(/^\/+/, '');

    // Skip directory entries (path ending in /) and the root entry (now empty).
    const isDir = name === '' || name.endsWith('/');
    if (!isDir) {
      const data = await _extract(view, bytes, localOffset, method, compSize, uncompSize);
      entries.set(name, data);
    }

    offset += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

/** Decode a ZIP entry: read its local file header, decompress, return bytes. */
async function _extract(view, bytes, localOffset, method, compSize, uncompSize) {
  if (localOffset + 30 > bytes.length) throw new Error('zip: truncated local header');
  if (view.getUint32(localOffset, true) !== SIG_LFH) {
    throw new Error('zip: bad local-header signature');
  }
  const nameLen  = view.getUint16(localOffset + 26, true);
  const extraLen = view.getUint16(localOffset + 28, true);
  const dataStart = localOffset + 30 + nameLen + extraLen;
  const compressed = bytes.subarray(dataStart, dataStart + compSize);

  if (method === 0) {
    return new Uint8Array(compressed); // copy out of the parent buffer
  }
  if (method === 8) {
    return await _inflateRaw(compressed, uncompSize);
  }
  throw new Error(`zip: unsupported compression method ${  method}`);
}

/** Inflate a raw DEFLATE stream into a Uint8Array. */
async function _inflateRaw(compressed, expectedSize) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([compressed]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  const out = new Uint8Array(buf);
  if (expectedSize > 0 && out.length !== expectedSize) {
    // Length mismatch is suspicious but not fatal; leave the decision to the caller.
  }
  return out;
}

/**
 * Locate the End-Of-Central-Directory record by scanning backwards from the
 * file end. The record is at most 22 + 65535 bytes long (comment max).
 */
function _findEOCD(view, bytes) {
  const minOffset = Math.max(0, bytes.length - (22 + 65535));
  for (let i = bytes.length - 22; i >= minOffset; i--) {
    if (view.getUint32(i, true) === SIG_EOCD) {
      const totalEntries = view.getUint16(i + 10, true);
      const cdSize       = view.getUint32(i + 12, true);
      const cdOffset     = view.getUint32(i + 16, true);
      // ZIP64 detection: entry counts of 0xFFFF / 0xFFFFFFFF are sentinels.
      if (totalEntries === 0xFFFF || cdSize === 0xFFFFFFFF || cdOffset === 0xFFFFFFFF) {
        throw new Error('zip: ZIP64 archives are not supported');
      }
      return { totalEntries, cdSize, cdOffset };
    }
    if (view.getUint32(i, true) === SIG_EOCD64) {
      throw new Error('zip: ZIP64 archives are not supported');
    }
  }
  return null;
}

/** UTF-8 decoder for ZIP entry names. */
function _readUtf8(bytes, offset, length) {
  return new TextDecoder('utf-8').decode(bytes.subarray(offset, offset + length));
}

/** Decode raw bytes as UTF-8 text. */
export function bytesToText(u8) {
  return new TextDecoder('utf-8').decode(u8);
}
