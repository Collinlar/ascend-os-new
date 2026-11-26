// The size and colour layout of a JPEG, read from its frame header, so a
// logo can be placed in a PDF without decoding it. A PDF reader draws a
// JPEG as it is (DCTDecode), which is why logos are stored as JPEG: the
// browser converts whatever was uploaded before it is sent.

export interface JpegInfo {
  width: number;
  height: number;
  components: 1 | 3 | 4;
}

export function jpegInfo(bytes: Uint8Array): JpegInfo | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    // Fill bytes between markers.
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    // Start of frame: baseline, extended or progressive.
    if (marker >= 0xc0 && marker <= 0xc2) {
      const height = (bytes[i + 5] << 8) | bytes[i + 6];
      const width = (bytes[i + 7] << 8) | bytes[i + 8];
      const components = bytes[i + 9];
      if (!width || !height || ![1, 3, 4].includes(components)) return null;
      return { width, height, components: components as 1 | 3 | 4 };
    }
    i += 2 + length;
  }
  return null;
}
