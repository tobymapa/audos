/**
 * PLOT ZOOM — shared helpers for the Index's scatter plots (screens 20a ·
 * 21a · M13): the narrow-viewport check that thins a plot to eight points
 * on a phone, and the PINCH-TO-ZOOM hook the mobile spec calls for (“the
 * axes stay, the dashed value band stays, and the rest is pinch-to-zoom”).
 *
 * The zoom is implemented on the SVG viewBox — no transforms, no libraries:
 * two pointers pinch to zoom (1×–4×, anchored on the pinch midpoint), one
 * pointer pans while zoomed, and a Reset link snaps back. touch-action is
 * 'pan-y' at rest so one-finger page scrolling over the plot keeps working;
 * it tightens to 'none' only while zoomed, when a single finger pans the
 * plot instead.
 */
import { useEffect, useRef, useState } from 'react';
import type React from 'react';

/** Narrow-viewport check — plots thin below 640px (Mobile spec M13:
 * “the plot keeps eight points, not eighteen”). */
export function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 639px)').matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener(onChange);
    return () => {
      mq.removeEventListener ? mq.removeEventListener('change', onChange) : mq.removeListener(onChange);
    };
  }, []);
  return narrow;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MAX_ZOOM = 4;

export interface PinchZoom {
  /** Attach to the <svg> element. */
  svgRef: React.RefObject<SVGSVGElement | null>;
  /** The live viewBox string — pass to the <svg>. */
  viewBox: string;
  /** Spread onto the <svg>: the pointer handlers driving pinch + pan. */
  handlers: {
    onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => void;
    onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => void;
    onPointerUp: (e: React.PointerEvent<SVGSVGElement>) => void;
    onPointerCancel: (e: React.PointerEvent<SVGSVGElement>) => void;
  };
  /** touch-action for the <svg> — 'pan-y' at rest, 'none' while zoomed. */
  touchAction: string;
  /** True once the user has zoomed in. */
  zoomed: boolean;
  /** Snap back to the full plot. */
  reset: () => void;
}

export function usePinchZoom(baseW: number, baseH: number): PinchZoom {
  const [box, setBox] = useState<Box>({ x: 0, y: 0, w: baseW, h: baseH });
  const svgRef = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; box: Box; midX: number; midY: number } | null>(null);
  const pan = useRef<{ x: number; y: number; box: Box } | null>(null);

  // A new plot (different base size) starts un-zoomed.
  useEffect(() => {
    setBox({ x: 0, y: 0, w: baseW, h: baseH });
  }, [baseW, baseH]);

  const clampBox = (b: Box): Box => {
    const w = Math.min(baseW, Math.max(baseW / MAX_ZOOM, b.w));
    const h = (w / baseW) * baseH;
    return {
      w,
      h,
      x: Math.min(baseW - w, Math.max(0, b.x)),
      y: Math.min(baseH - h, Math.max(0, b.y)),
    };
  };

  /** Client px → the current viewBox's coordinate space. */
  const toLocal = (clientX: number, clientY: number, b: Box) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    return {
      x: b.x + ((clientX - rect.left) / rect.width) * b.w,
      y: b.y + ((clientY - rect.top) / rect.height) * b.h,
    };
  };

  const zoomed = box.w < baseW - 0.5;

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 2) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mid = toLocal((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2, box);
      pinch.current = { dist: Math.max(1, dist), box, midX: mid.x, midY: mid.y };
      pan.current = null;
    } else if (pts.length === 1 && zoomed) {
      pan.current = { x: e.clientX, y: e.clientY, box };
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pinch.current && pts.length >= 2) {
      e.preventDefault();
      const start = pinch.current;
      const dist = Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
      const ratio = dist / start.dist;
      const w = start.box.w / ratio;
      const h = start.box.h / ratio;
      // Anchor the zoom on the pinch midpoint so the spot under the fingers
      // stays under the fingers.
      const fx = (start.midX - start.box.x) / start.box.w;
      const fy = (start.midY - start.box.y) / start.box.h;
      setBox(clampBox({ x: start.midX - fx * w, y: start.midY - fy * h, w, h }));
    } else if (pan.current && pts.length === 1) {
      e.preventDefault();
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      const start = pan.current;
      const dx = ((e.clientX - start.x) / rect.width) * start.box.w;
      const dy = ((e.clientY - start.y) / rect.height) * start.box.h;
      setBox(clampBox({ ...start.box, x: start.box.x - dx, y: start.box.y - dy }));
    }
  };

  const endPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) pan.current = null;
  };

  return {
    svgRef,
    viewBox: `${box.x} ${box.y} ${box.w} ${box.h}`,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endPointer,
      onPointerCancel: endPointer,
    },
    touchAction: zoomed ? 'none' : 'pan-y',
    zoomed,
    reset: () => setBox({ x: 0, y: 0, w: baseW, h: baseH }),
  };
}
