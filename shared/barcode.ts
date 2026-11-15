/**
 * Code 128 (subset B) barcode encoder, dependency-free. Subset B covers printable ASCII (space to ~), which includes
 * every character allowed in an order ID. Most handheld and phone scanners read Code 128.
 *
 * The output is a list of bar/space widths in modules (bar first), so the UI can draw it as SVG rectangles with
 * crisp edges at any size, on screen and on paper.
 */

/** Bar/space widths of the 107 Code 128 symbols (values 0–106). 103–105 = Start A/B/C, 106 = Stop. */
export const CODE128_PATTERNS: readonly string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

const START_B = 104;
const STOP = 106;

/** Recommended quiet zone on each side, in modules (at least 10). */
export const QUIET_ZONE_MODULES = 10;

export interface Code128 {
  /** Symbol values: start, data…, checksum, stop. */
  values: number[];
  /** Alternating bar/space widths in modules, starting and ending with a bar. */
  bars: number[];
  /** Total width in modules, without quiet zones. */
  modules: number;
}

export function encodeCode128B(text: string): Code128 {
  if (text.length === 0) throw new Error('Nothing to encode');
  const data = [...text].map((ch) => {
    const code = ch.charCodeAt(0);
    if (ch.length !== 1 || code < 32 || code > 126) throw new Error('Code 128 subset B carries printable ASCII only');
    return code - 32;
  });
  const checksum = (START_B + data.reduce((sum, v, i) => sum + v * (i + 1), 0)) % 103;
  const values = [START_B, ...data, checksum, STOP];
  const bars = values.flatMap((v) => [...CODE128_PATTERNS[v]!].map(Number));
  return { values, bars, modules: bars.reduce((a, b) => a + b, 0) };
}

/** Reads bar widths back into text (used by tests to prove the drawn barcode carries the exact order ID). */
export function decodeCode128B(bars: number[]): string {
  const lookup = new Map(CODE128_PATTERNS.map((p, v) => [p, v]));
  const symbols: number[] = [];
  let i = 0;
  while (i < bars.length) {
    const width = bars.length - i === 7 ? 7 : 6;
    const v = lookup.get(bars.slice(i, i + width).join(''));
    if (v === undefined) throw new Error('Unreadable symbol');
    symbols.push(v);
    i += width;
  }
  if (symbols[0] !== START_B || symbols.at(-1) !== STOP) throw new Error('Missing start or stop');
  const data = symbols.slice(1, -2);
  const checksum = (START_B + data.reduce((sum, v, idx) => sum + v * (idx + 1), 0)) % 103;
  if (symbols.at(-2) !== checksum) throw new Error('Bad checksum');
  return data.map((v) => String.fromCharCode(v + 32)).join('');
}
