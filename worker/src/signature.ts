/**
 * Customer signature validation. The browser sends a PNG drawn on the signature pad as a data URL; nothing about it is
 * trusted. The bytes must form a well-structured PNG of a sensible size: signature, IHDR first, every chunk's length
 * and CRC correct, IDAT data present, IEND last with nothing after it. Text/metadata chunks (which could smuggle data)
 * are refused. The decoded bytes are what is stored; they are only ever served back as image/png with no-store.
 */

import { SIGNATURE_MAX_BYTES } from '../../shared/schemas.ts';
import { ApiError } from './http.ts';

export interface ValidSignature {
  bytes: Uint8Array<ArrayBuffer>;
  width: number;
  height: number;
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** Chunks a browser canvas may write. Anything else (tEXt, zTXt, iTXt, eXIf, private chunks…) is refused. */
const ALLOWED_CHUNKS = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'sRGB', 'gAMA', 'cHRM', 'pHYs', 'iCCP', 'bKGD', 'tRNS']);
export const SIGNATURE_MIN = { width: 100, height: 50 };
export const SIGNATURE_MAX = { width: 2400, height: 1200 };

function invalid(message = 'The signature image could not be read. Clear the signature and sign again.'): ApiError {
  return new ApiError(422, 'invalid_signature', message, { issues: [{ path: 'signaturePng', message }] });
}

let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const b of bytes) crc = crcTable[(crc ^ b) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function decodeBase64(b64: string): Uint8Array<ArrayBuffer> {
  let binary: string;
  try {
    binary = atob(b64);
  } catch {
    throw invalid();
  }
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Validates a `data:image/png;base64,…` signature and returns its bytes and dimensions, or throws 422. */
export function validateSignature(dataUrl: string): ValidSignature {
  const prefix = 'data:image/png;base64,';
  if (!dataUrl.startsWith(prefix)) throw invalid('Capture the customer signature.');
  const bytes = decodeBase64(dataUrl.slice(prefix.length));
  if (bytes.length > SIGNATURE_MAX_BYTES) throw invalid('The signature image is too large. Clear it and sign again.');
  if (bytes.length < 67 || PNG_MAGIC.some((b, i) => bytes[i] !== b)) throw invalid();

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 8;
  let width = 0;
  let height = 0;
  let sawIdat = false;
  let sawEnd = false;
  let index = 0;
  while (at < bytes.length) {
    if (sawEnd || at + 12 > bytes.length) throw invalid();
    const length = view.getUint32(at);
    if (length > bytes.length - at - 12) throw invalid();
    const typeBytes = bytes.subarray(at + 4, at + 8);
    const type = String.fromCharCode(...typeBytes);
    if (!/^[A-Za-z]{4}$/.test(type) || !ALLOWED_CHUNKS.has(type)) throw invalid();
    if (view.getUint32(at + 8 + length) !== crc32(bytes.subarray(at + 4, at + 8 + length))) throw invalid();
    if (index === 0 && type !== 'IHDR') throw invalid();
    if (type === 'IHDR') {
      if (index !== 0 || length !== 13) throw invalid();
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      const bitDepth = bytes[at + 16];
      const colorType = bytes[at + 17];
      const interlace = bytes[at + 20];
      if (bitDepth !== 8 || ![0, 2, 4, 6].includes(colorType!) || bytes[at + 18] !== 0 || bytes[at + 19] !== 0 || interlace! > 1) {
        throw invalid();
      }
    } else if (type === 'IDAT') {
      if (length === 0) throw invalid();
      sawIdat = true;
    } else if (type === 'IEND') {
      if (length !== 0) throw invalid();
      sawEnd = true;
    }
    at += 12 + length;
    index++;
  }
  if (!sawIdat || !sawEnd) throw invalid();
  if (width < SIGNATURE_MIN.width || height < SIGNATURE_MIN.height || width > SIGNATURE_MAX.width || height > SIGNATURE_MAX.height) {
    throw invalid('The signature image has an unexpected size. Clear it and sign again.');
  }
  return { bytes, width, height };
}
