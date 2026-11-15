import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { CapturedSignature } from '../lib/confirmationForm.ts';

type Point = { x: number; y: number };

/**
 * The saved image keeps the pad's shape, scaled to fit this box: small enough to store, sharp enough to print, and
 * inside the sizes the Worker accepts (100–2400 × 50–1200 px).
 */
const EXPORT_MAX_W = 1500;
const EXPORT_MAX_H = 900;
const INK = '#17201b';

/**
 * Touch-, stylus- and mouse-friendly signature capture, shown large in the signature pop-up. Strokes are kept as
 * points and redrawn, so the pad stays sharp after rotation or resizing. The saved PNG has a white background (readable in dark mode and on paper). The image
 * lives only in memory until it is submitted; nothing is written to browser storage.
 */
export function SignaturePad({
  value,
  onChange,
  labelledBy,
  describedBy,
  invalid,
  disabled,
  className = '',
}: {
  value: CapturedSignature | null;
  onChange: (sig: CapturedSignature | null) => void;
  labelledBy?: string;
  describedBy?: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Point[][]>([]);
  const drawing = useRef<Point[] | null>(null);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    drawStrokes(ctx, strokes.current, w, h, 2.6 * dpr);
  }, []);

  // Keep the drawing when the pad changes size (rotation, zoom).
  useEffect(() => {
    redraw();
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => redraw());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [redraw]);

  // The parent cleared the value (e.g. after "Clear signature"): forget the strokes.
  useEffect(() => {
    if (value === null && strokes.current.length > 0) {
      strokes.current = [];
      redraw();
    }
  }, [value, redraw]);

  const pointFrom = (e: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  };

  const finish = () => {
    if (!drawing.current) return;
    drawing.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    onChange({ dataUrl: exportPng(strokes.current, rect.width, rect.height), strokeLength: inkLength(strokes.current, rect.width, rect.height) });
  };

  return (
    <div className={`signature-pad ${className}${invalid ? ' is-invalid' : ''}${disabled ? ' is-disabled' : ''}`}>
      <canvas
        ref={canvasRef}
        className="signature-canvas"
        role="img"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-label={labelledBy ? undefined : 'Customer signature'}
        onPointerDown={(e) => {
          if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = [pointFrom(e)];
          strokes.current.push(drawing.current);
          redraw();
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          // Coalesced events give smoother lines on fast finger movement.
          const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
          for (const ev of events) {
            const rect = e.currentTarget.getBoundingClientRect();
            drawing.current.push({
              x: Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width)),
              y: Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height)),
            });
          }
          redraw();
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
        onLostPointerCapture={finish}
      />
      <span className="signature-line" aria-hidden="true">
        ✕
      </span>
      {!value && !disabled && (
        <span className="signature-placeholder" aria-hidden="true">
          Sign here
        </span>
      )}
    </div>
  );
}

/** Points are stored as fractions of the pad (0..1), so the same strokes draw at any pixel size. */
function drawStrokes(ctx: CanvasRenderingContext2D, all: Point[][], w: number, h: number, lineWidth: number) {
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = lineWidth;
  for (const stroke of all) {
    if (stroke.length === 1) {
      ctx.beginPath();
      ctx.arc(stroke[0]!.x * w, stroke[0]!.y * h, lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    stroke.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x * w, p.y * h) : ctx.lineTo(p.x * w, p.y * h)));
    ctx.stroke();
  }
}

function exportPng(all: Point[][], padW: number, padH: number): string {
  const scale = Math.min(EXPORT_MAX_W / padW, EXPORT_MAX_H / padH);
  const w = Math.max(100, Math.round(padW * scale));
  const h = Math.max(50, Math.round(padH * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  drawStrokes(ctx, all, w, h, Math.max(3, w / 300));
  return canvas.toDataURL('image/png');
}

function inkLength(all: Point[][], w: number, h: number): number {
  let total = 0;
  for (const s of all) {
    for (let i = 1; i < s.length; i++) total += Math.hypot((s[i]!.x - s[i - 1]!.x) * w, (s[i]!.y - s[i - 1]!.y) * h);
  }
  return total;
}
