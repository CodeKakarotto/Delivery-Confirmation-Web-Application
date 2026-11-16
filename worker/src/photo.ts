/**
 * Photo of a signed paper slip (paper entries only). The browser re-encodes the photo as a JPEG before sending it
 * (which also strips camera metadata such as location); nothing about it is trusted here. The bytes must be a
 * well-formed baseline/progressive JPEG: start-of-image marker, a frame header (SOF) with a sensible size before the
 * scan, and the end-of-image marker last. Anything else is refused.
 */

import { ApiError } from './http.ts';

export const PHOTO_MAX_BYTES = 600 * 1024;
const MIN_SIDE = 200;
const MAX_SIDE = 4000;

function invalid(message = 'The slip photo could not be read. Take the photo again.'): ApiError {
  return new ApiError(422, 'invalid_photo', message, { issues: [{ path: 'slipPhoto', message }] });
}

export interface ValidPhoto {
  bytes: Uint8Array<ArrayBuffer>;
  width: number;
  height: number;
}

export function validateSlipPhoto(dataUrl: string): ValidPhoto {
  const prefix = 'data:image/jpeg;base64,';
  if (!dataUrl.startsWith(prefix)) throw invalid('The slip photo must be a JPEG image.');
  let binary: string;
  try {
    binary = atob(dataUrl.slice(prefix.length));
  } catch {
    throw invalid();
  }
  if (binary.length > PHOTO_MAX_BYTES) throw invalid('The slip photo is too large.');
  const b = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) b[i] = binary.charCodeAt(i);
  if (b.length < 100 || b[0] !== 0xff || b[1] !== 0xd8 || b[b.length - 2] !== 0xff || b[b.length - 1] !== 0xd9) throw invalid();

  // Walk the marker segments up to the start of the scan.
  let at = 2;
  let width = 0;
  let height = 0;
  while (at + 4 <= b.length) {
    if (b[at] !== 0xff) throw invalid();
    const marker = b[at + 1]!;
    if (marker === 0xda) break; // start of scan: image data follows
    const length = (b[at + 2]! << 8) | b[at + 3]!;
    if (length < 2 || at + 2 + length > b.length) throw invalid();
    // SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC) carry the frame size.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      if (length < 7) throw invalid();
      height = (b[at + 5]! << 8) | b[at + 6]!;
      width = (b[at + 7]! << 8) | b[at + 8]!;
    }
    at += 2 + length;
  }
  if (b[at] !== 0xff || b[at + 1] !== 0xda) throw invalid();
  if (width < MIN_SIDE || height < MIN_SIDE || width > MAX_SIDE || height > MAX_SIDE) {
    throw invalid('The slip photo is too small or too large to read. Take the photo again.');
  }
  return { bytes: b, width, height };
}
