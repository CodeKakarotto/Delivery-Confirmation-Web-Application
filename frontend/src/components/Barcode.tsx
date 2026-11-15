import { encodeCode128B, QUIET_ZONE_MODULES } from '../../../shared/barcode.ts';

/**
 * Code 128 barcode of the exact order ID, drawn as SVG bars (sharp on screen and on paper). Always black on white with
 * a quiet zone on both sides, whatever the theme. The readable order ID is shown separately, above it.
 */
export function Barcode({ value, height = 64 }: { value: string; height?: number }) {
  let code;
  try {
    code = encodeCode128B(value);
  } catch {
    return <p className="barcode-missing">No barcode: this order ID contains characters a barcode cannot carry.</p>;
  }
  const total = code.modules + QUIET_ZONE_MODULES * 2;
  const rects: Array<{ x: number; w: number }> = [];
  let x = QUIET_ZONE_MODULES;
  code.bars.forEach((w, i) => {
    if (i % 2 === 0) rects.push({ x, w });
    x += w;
  });
  return (
    <div className="barcode">
      <svg
        role="img"
        aria-label={`Barcode for order ${value}`}
        data-barcode-value={value}
        data-bars={code.bars.join(',')}
        viewBox={`0 0 ${total} ${height}`}
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
        // At least ~2.5 CSS px per module where space allows, so phone cameras and scanners can read it.
        style={{ width: `min(100%, ${total * 2.5}px)` }}
        height={height}
      >
        <rect x="0" y="0" width={total} height={height} fill="#fff" />
        {rects.map((r) => (
          <rect key={r.x} x={r.x} y="0" width={r.w} height={height} fill="#000" />
        ))}
      </svg>
    </div>
  );
}
