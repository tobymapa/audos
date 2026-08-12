/**
 * THE INDEX · PIECES — two readings, not four (founder's consolidation
 * pass): LIST · QUADRANT.
 *
 * ONE header row carries the section title and the LIST · QUADRANT toggle at
 * its RIGHT edge, closed by a walnut hairline.
 *
 *  · LIST — the 13a piece index (piece-index-list.tsx).
 *  · QUADRANT — the old “on a map” and “as a quadrant” tabs MERGED into one
 *    interactive reading. The plain scatter plot, the WHY A MAP HERE note and
 *    the OTHER AXES table are gone; what remains is the quadrant itself with
 *    the legend above it and the WHAT EACH CORNER HOLDS rail beside it —
 *    counts + names, never scorecards. A muted register reads “muted”, never
 *    “0 of 12”.
 *
 *    The OTHER AXES table became a CONTROL: a light selector above the plot
 *    switches which pair of axes the quadrant reads — Formality · Versatility
 *    (shown by default), Warmth · Rain (Autumn) and Essentialness · Cost
 *    (Building up). Each pair carries its own axis captions and its own four
 *    corner names, and the same pieces re-map onto it.
 *
 * Which dots draw filled (owned) or accented (a gap Beau flags) is read live
 * from the wardrobe and the last stored assessment.
 */
import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import type { StyleProfile, WardrobePiece } from './profile-data';
import { PieceIndexList } from './piece-index-list';
import { peekBeauAssessment } from './beau-assessment';
import { COVERAGE_PREFS_EVENT, MUTED_STORE_KEY, fetchCoveragePrefs, loadLocalJson } from './coverage-prefs';
import { usePinchZoom } from './plot-zoom';
import { MONO, numberWord, usePlexMono } from './mono-type';
import { ViewToggle } from './view-toggle';

// ---------------------------------------------------------------------------
// The 20a palette and type registers.
// ---------------------------------------------------------------------------

const SERIF = 'var(--space-font-heading)';
const BODY = 'var(--space-font-family)';
const WALNUT = '#241a12';
const INK = '#3b2b1d';
const MUTED = '#856c51';
const FAINT = '#a68e70';
const FAINTER = '#bfae96';
const LABEL_BROWN = '#7a6349';
const ACCENT = '#a8712c';
const ACCENT_DEEP = '#7c4a17';
const PAPER = '#fbf8f1';

// Plot geometry — the reference draws an 880-wide plot with 30/40/34/58
// padding; the SVG viewBox bakes the padding in so the corner captions
// have room to sit outside.
const PLOT_W = 880;
const QUAD_H = 400;
const PAD_L = 58;
const PAD_T = 30;
const PAD_R = 40;
const PAD_B = 34;
const VIEW_W = PAD_L + PLOT_W + PAD_R;
const QUAD_VIEW_H = PAD_T + QUAD_H + PAD_B;

// The old map's height — kept as the unit the hand-plotted coordinates were
// transcribed in, so `my` still converts to the quadrant's own box.
const MAP_H = 420;

function svgMono(size = 8.5, fill = FAINT): React.CSSProperties {
  return { fontFamily: MONO, fontSize: `${size}px`, letterSpacing: '0.06em', fill };
}

// ---------------------------------------------------------------------------
// The plotted taxonomy — 21 types. mx/my are the reference's hand-plotted
// formality × versatility coordinates (qx/qy override them on the quadrant);
// warmth / rain / essential / cost are 0..1 readings of the same types, so
// the other axis pairs place them without a second taxonomy.
// ---------------------------------------------------------------------------

export interface PieceMapType {
  id: string;
  label: string;
  mx: number;
  my: number;
  qx?: number;
  qy?: number;
  side?: 'l' | 'r';
  qside?: 'l' | 'r';
  /** 0 = cool, 1 = the warmest thing you own. */
  warmth: number;
  /** 0 = ruined by rain, 1 = sheds it. */
  rain: number;
  /** 0 = a nice-to-have, 1 = a wardrobe essential. */
  essential: number;
  /** 0 = cheap to buy well, 1 = the dearest tier. */
  cost: number;
  keywords: string[];
}

export const PIECE_MAP_TYPES: PieceMapType[] = [
  { id: 't-shirt', label: 'T-shirt', mx: 53, my: 202, qx: 88, qy: 160, warmth: 0.08, rain: 0.05, essential: 0.95, cost: 0.06, keywords: ['t-shirt', 't shirt', 'tee'] },
  { id: 'hoodie', label: 'Hoodie', mx: 53, my: 294, qx: 106, qy: 264, warmth: 0.6, rain: 0.12, essential: 0.6, cost: 0.16, keywords: ['hoodie', 'hooded'] },
  { id: 'shorts', label: 'Shorts', mx: 88, my: 361, warmth: 0.03, rain: 0.24, essential: 0.45, cost: 0.12, keywords: ['shorts'] },
  { id: 'jeans', label: 'Jeans', mx: 141, my: 109, warmth: 0.45, rain: 0.3, essential: 0.92, cost: 0.3, keywords: ['jeans'] },
  { id: 'field-jacket', label: 'Field jacket', mx: 176, my: 168, qx: 194, qy: 136, warmth: 0.6, rain: 0.62, essential: 0.6, cost: 0.42, keywords: ['field jacket', 'field-jacket', 'm-43', 'm43', 'm-65', 'm65'] },
  { id: 'overshirt', label: 'Overshirt', mx: 211, my: 244, warmth: 0.5, rain: 0.25, essential: 0.5, cost: 0.28, keywords: ['overshirt', 'shirt jacket', 'shacket'] },
  { id: 'waxed-jacket', label: 'Waxed jacket', mx: 264, my: 202, qx: 264, qy: 176, warmth: 0.68, rain: 0.95, essential: 0.42, cost: 0.55, keywords: ['waxed jacket', 'wax jacket', 'waxed-jacket', 'waxed cotton'] },
  { id: 'leather-sneaker', label: 'Leather sneaker', mx: 299, my: 59, qx: 299, qy: 64, warmth: 0.35, rain: 0.36, essential: 0.9, cost: 0.35, keywords: ['sneaker', 'trainer'] },
  { id: 'chinos', label: 'Chinos', mx: 370, my: 8, qx: 405, qy: 24, warmth: 0.4, rain: 0.3, essential: 0.88, cost: 0.22, keywords: ['chino'] },
  { id: 'linen-shirt', label: 'Linen shirt', mx: 352, my: 134, qx: 352, qy: 112, warmth: 0.06, rain: 0.08, essential: 0.4, cost: 0.26, keywords: ['linen shirt', 'linen-shirt'] },
  { id: 'cardigan', label: 'Cardigan', mx: 405, my: 92, qx: 387, qy: 80, warmth: 0.58, rain: 0.1, essential: 0.45, cost: 0.34, keywords: ['cardigan'] },
  { id: 'crew-neck-jumper', label: 'Crew neck jumper', mx: 440, my: 50, qx: 190, qy: 96, warmth: 0.7, rain: 0.3, essential: 0.85, cost: 0.38, keywords: ['crew neck', 'crewneck', 'crew-neck', 'jumper', 'sweater'] },
  { id: 'oxford-shirt', label: 'Oxford shirt', mx: 546, my: 25, qx: 528, qy: 32, warmth: 0.3, rain: 0.15, essential: 0.9, cost: 0.22, keywords: ['oxford shirt', 'oxford-shirt', 'ocbd', 'oxford button'] },
  { id: 'roll-neck', label: 'Roll neck', mx: 493, my: 185, warmth: 0.78, rain: 0.32, essential: 0.5, cost: 0.42, keywords: ['roll neck', 'rollneck', 'roll-neck', 'turtleneck', 'turtle neck'] },
  { id: 'chelsea-boot', label: 'Chelsea boot', mx: 563, my: 126, warmth: 0.55, rain: 0.7, essential: 0.62, cost: 0.55, keywords: ['chelsea'] },
  { id: 'penny-loafer', label: 'Penny loafer', mx: 634, my: 59, side: 'r', qx: 581, qy: 88, qside: 'l', warmth: 0.3, rain: 0.28, essential: 0.55, cost: 0.6, keywords: ['loafer'] },
  { id: 'wool-trousers', label: 'Wool trousers', mx: 651, my: 168, side: 'r', qx: 634, qy: 152, qside: 'r', warmth: 0.62, rain: 0.45, essential: 0.6, cost: 0.48, keywords: ['wool trouser', 'flannel trouser', 'dress trouser', 'tropical wool'] },
  { id: 'blazer', label: 'Blazer', mx: 722, my: 109, side: 'r', warmth: 0.5, rain: 0.2, essential: 0.7, cost: 0.72, keywords: ['blazer', 'sports jacket', 'sport coat'] },
  { id: 'overcoat', label: 'Overcoat', mx: 739, my: 269, side: 'r', warmth: 0.95, rain: 0.72, essential: 0.68, cost: 0.88, keywords: ['overcoat', 'topcoat', 'chesterfield'] },
  { id: 'cap-toe-oxford', label: 'Cap-toe oxford', mx: 792, my: 227, side: 'r', warmth: 0.45, rain: 0.5, essential: 0.58, cost: 0.68, keywords: ['cap-toe', 'cap toe', 'oxford shoe', 'balmoral', 'derby', 'brogue'] },
  { id: 'suit', label: 'Suit', mx: 845, my: 353, side: 'r', warmth: 0.5, rain: 0.18, essential: 0.5, cost: 0.95, keywords: ['suit'] },
];

const qxOf = (t: PieceMapType) => t.qx ?? t.mx;
const qyOf = (t: PieceMapType) => t.qy ?? (t.my * QUAD_H) / MAP_H;

// ---------------------------------------------------------------------------
// Matching — owned types and The Edit's flagged gaps.
// ---------------------------------------------------------------------------

function matchesType(text: string, type: PieceMapType): boolean {
  return type.keywords.some((k) => text.includes(k));
}

/** The types covered by something the user owns — keyword match on each
 * piece's own name/slot/category text. */
export function ownedTypeIds(pieces: WardrobePiece[]): Set<string> {
  const owned = new Set<string>();
  for (const piece of pieces) {
    const text = `${piece.name || ''} ${piece.slot || ''} ${piece.category || ''}`.toLowerCase();
    if (!text.trim()) continue;
    for (const type of PIECE_MAP_TYPES) {
      if (!owned.has(type.id) && matchesType(text, type)) owned.add(type.id);
    }
  }
  return owned;
}

/** The Edit's flagged gaps, drawn where they'd land — read from the LAST
 * stored assessment (never triggers a model call), ranked, capped at three. */
export function gapRanks(ownedIds: Set<string>): Map<string, number> {
  const ranks = new Map<string, number>();
  const peeked = peekBeauAssessment();
  if (!peeked) return ranks;
  for (const rec of peeked.assessment.recommendations || []) {
    const text = `${rec.pieceName || ''} ${rec.subType || ''} ${rec.category || ''}`.toLowerCase();
    for (const type of PIECE_MAP_TYPES) {
      if (ranks.has(type.id) || ownedIds.has(type.id)) continue;
      if (matchesType(text, type)) {
        ranks.set(type.id, ranks.size + 1);
        break;
      }
    }
    if (ranks.size >= 3) break;
  }
  return ranks;
}

/** Owned + gap statuses, shared by the plot and the Index header intro. */
export function usePieceStatuses(pieces: WardrobePiece[]): { owned: Set<string>; gaps: Map<string, number> } {
  const owned = useMemo(() => ownedTypeIds(pieces), [pieces]);
  const gaps = useMemo(() => gapRanks(owned), [owned]);
  return { owned, gaps };
}

/** Muted registers — local mirror seeds instantly, the DB read reconciles,
 * the coverage-prefs event keeps it live (same contract as The Edit). */
function useMutedRegisters(): string[] {
  const [muted, setMuted] = useState<string[]>(() => loadLocalJson<string[]>(MUTED_STORE_KEY, []));
  useEffect(() => {
    let alive = true;
    const load = () => {
      fetchCoveragePrefs()
        .then((prefs) => {
          if (alive) setMuted(prefs.muted);
        })
        .catch(() => undefined);
    };
    load();
    window.addEventListener(COVERAGE_PREFS_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(COVERAGE_PREFS_EVENT, load);
    };
  }, []);
  return muted;
}

type DotKind = 'owned' | 'none' | 'gap';

function kindOf(id: string, owned: Set<string>, gaps: Map<string, number>): DotKind {
  return owned.has(id) ? 'owned' : gaps.has(id) ? 'gap' : 'none';
}

/** One dot, drawn to the reference: filled walnut = you own one, hollow =
 * you don't, larger accent-filled = a gap Beau flags. */
function TypeDot({ cx, cy, kind }: { cx: number; cy: number; kind: DotKind }) {
  if (kind === 'owned') return <circle cx={cx} cy={cy} r="5.5" fill={INK} stroke={INK} strokeWidth="1.5" />;
  if (kind === 'gap') return <circle cx={cx} cy={cy} r="6.5" fill={ACCENT} stroke={ACCENT_DEEP} strokeWidth="1.5" />;
  return <circle cx={cx} cy={cy} r="4.5" fill="none" stroke="rgba(59,43,29,0.55)" strokeWidth="1.5" />;
}

// ---------------------------------------------------------------------------
// Shared chrome — the legend and the right-rail blocks (AccentNote,
// OtherAxes and PlotBox are also the makers page's chrome; leave the
// signatures alone).
// ---------------------------------------------------------------------------

const legendText: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: '9px',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: LABEL_BROWN,
};

function LegendItem({ kind, label }: { kind: DotKind; label: string }) {
  return (
    <span className="inline-flex items-center" style={{ gap: '8px' }}>
      <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true" className="inline-block">
        <TypeDot cx={7.5} cy={7.5} kind={kind} />
      </svg>
      <span style={legendText}>{label}</span>
    </span>
  );
}

/** The accent-ruled aside — BEAU, BRIEFLY (and the makers page's own notes). */
export function AccentNote({ title, children, style }: { title: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ borderLeft: `2px solid ${ACCENT}`, paddingLeft: '16px', ...style }}>
      <div style={{ fontFamily: MONO, fontSize: '9px', letterSpacing: '0.06em', textTransform: 'uppercase', color: MUTED }}>{title}</div>
      <p style={{ margin: '8px 0 0', fontFamily: BODY, fontSize: '14px', lineHeight: 1.6, color: INK }}>{children}</p>
    </div>
  );
}

/** The OTHER AXES table in the right rail (the makers page still reads it as
 * a table; the pieces quadrant turned its own copy into a live selector). */
export function OtherAxes({ rows }: { rows: Array<{ label: string; note: string; accent?: boolean }> }) {
  return (
    <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid rgba(59,43,29,0.18)' }}>
      <div style={{ fontFamily: MONO, fontSize: '9px', letterSpacing: '0.07em', textTransform: 'uppercase', color: LABEL_BROWN }}>Other axes</div>
      <div className="flex flex-col" style={{ marginTop: '10px' }}>
        {rows.map((row, i) => (
          <div
            key={row.label}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline"
            style={{ gap: '12px', padding: '10px 0', borderBottom: i < rows.length - 1 ? '1px solid rgba(59,43,29,0.14)' : 'none' }}
          >
            <span style={{ fontFamily: BODY, fontSize: '13px', color: INK }}>{row.label}</span>
            <span style={{ fontFamily: MONO, fontSize: '9px', letterSpacing: '0.04em', textTransform: 'uppercase', color: row.accent ? ACCENT : MUTED }}>
              {row.note}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** One WHAT EACH CORNER HOLDS row — name in Cormorant, the count in mono. */
export function CornerRow({ name, count, tone = WALNUT, last = false }: { name: string; count: string; tone?: string; last?: boolean }) {
  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline"
      style={{ gap: '12px', padding: '12px 0', borderBottom: last ? 'none' : '1px solid rgba(59,43,29,0.16)' }}
    >
      <span style={{ fontFamily: SERIF, fontSize: '17px', color: WALNUT }}>{name}</span>
      <span style={{ fontFamily: MONO, fontSize: '11px', color: tone }}>{count}</span>
    </div>
  );
}

/** The bordered paper box every plot sits in. */
export function PlotBox({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ border: '1px solid rgba(59,43,29,0.28)', background: PAPER, ...style }}>{children}</div>;
}

// ---------------------------------------------------------------------------
// THE AXIS PAIRS — three readings of the same 21 types. Each names its own
// axis captions and its own four corners, so switching the pair re-labels
// the plot as well as re-placing the dots.
// ---------------------------------------------------------------------------

export type QuadrantAxesId = 'formality-versatility' | 'warmth-rain' | 'essentialness-cost';

interface QuadCorner {
  name: string;
  sub: string;
  h: 'l' | 'r';
  v: 't' | 'b';
  /** The reference's inset from the plot's top/bottom edge for this block. */
  inset: number;
}

interface AxisPair {
  id: QuadrantAxesId;
  /** The selector's own label. */
  label: string;
  /** The small qualifier beside it — “Autumn”, “Building up”. */
  note: string;
  title: string;
  intro: string;
  /** The mono captions: across from left to right, up from bottom to top. */
  acrossLabel: string;
  acrossLow: string;
  acrossHigh: string;
  upLabel: string;
  upLow: string;
  upHigh: string;
  /** 0..1 across. */
  x: (t: PieceMapType) => number;
  /** 0..1 up — 1 is the top of the plot. */
  y: (t: PieceMapType) => number;
  /** Corner names, top-left · top-right · bottom-left · bottom-right. */
  corners: [string, string, string, string];
  cornerSubs: [string, string, string, string];
  /** True when the hand-plotted coordinates place the dots — no jitter. */
  handPlotted?: boolean;
}

export const AXIS_PAIRS: AxisPair[] = [
  {
    id: 'formality-versatility',
    label: 'Formality · Versatility',
    note: '',
    title: 'The same axes, cut in four',
    intro:
      'The quadrant plots only what you own plus the gaps — then names the four regions, counts them, and says what’s thin. A map shows where things are; a quadrant tells you which corner you live in.',
    acrossLabel: 'How formal it reads',
    acrossLow: 'Casual',
    acrossHigh: 'Formal',
    upLabel: 'How many outfits it enters',
    upLow: 'One outfit',
    upHigh: 'Most outfits',
    x: (t) => qxOf(t) / PLOT_W,
    y: (t) => 1 - qyOf(t) / QUAD_H,
    corners: ['Workhorses', 'The backbone', 'Weekend specifics', 'Occasion only'],
    cornerSubs: ['Casual · many outfits', 'Smart · many outfits', 'Casual · few outfits', 'Smart · few outfits'],
    handPlotted: true,
  },
  {
    id: 'warmth-rain',
    label: 'Warmth · Rain',
    note: 'Autumn',
    title: 'Warmth against weather',
    intro:
      'The same pieces read against the two things a British autumn asks of them: how warm they are, and whether they survive rain. The top-right corner is what an October week actually needs.',
    acrossLabel: 'How warm it is',
    acrossLow: 'Cool',
    acrossHigh: 'Warm',
    upLabel: 'How it takes rain',
    upLow: 'Fair weather only',
    upHigh: 'Sheds rain',
    x: (t) => t.warmth,
    y: (t) => t.rain,
    corners: ['Mild and wet', 'Autumn armour', 'High summer', 'Cold and dry'],
    cornerSubs: ['Cool · sheds rain', 'Warm · sheds rain', 'Cool · fair weather', 'Warm · fair weather'],
  },
  {
    id: 'essentialness-cost',
    label: 'Essentialness · Cost',
    note: 'Building up',
    title: 'What matters against what it costs',
    intro:
      'How essential a piece is, against what a good one costs. The top-left corner is where a wardrobe should be built from; the bottom-right is where money goes to be admired.',
    acrossLabel: 'What a good one costs',
    acrossLow: 'Cheap',
    acrossHigh: 'Dear',
    upLabel: 'How essential it is',
    upLow: 'Nice to have',
    upHigh: 'Essential',
    x: (t) => t.cost,
    y: (t) => t.essential,
    corners: ['Buy these first', 'Worth saving for', 'Cheap indulgences', 'Later, or never'],
    cornerSubs: ['Cheap · essential', 'Dear · essential', 'Cheap · optional', 'Dear · optional'],
  },
];

function cornerBlocks(axes: AxisPair): QuadCorner[] {
  return [
    { name: axes.corners[0], sub: axes.cornerSubs[0], h: 'l', v: 't', inset: 26 },
    { name: axes.corners[1], sub: axes.cornerSubs[1], h: 'r', v: 't', inset: 12 },
    { name: axes.corners[2], sub: axes.cornerSubs[2], h: 'l', v: 'b', inset: 12 },
    { name: axes.corners[3], sub: axes.cornerSubs[3], h: 'r', v: 'b', inset: 12 },
  ];
}

function QuadCornerLabels({ corners, plotH }: { corners: QuadCorner[]; plotH: number }) {
  return (
    <>
      {corners.map((c) => {
        const x = c.h === 'l' ? PAD_L + 14 : PAD_L + PLOT_W - 14;
        const anchor = c.h === 'l' ? 'start' : 'end';
        const nameY = c.v === 't' ? PAD_T + c.inset + 13 : PAD_T + plotH - c.inset - 15;
        const subY = nameY + 15;
        return (
          <g key={c.name}>
            <text x={x} y={nameY} textAnchor={anchor} style={{ fontFamily: SERIF, fontSize: '17px', fill: FAINT }}>{c.name}</text>
            <text x={x} y={subY} textAnchor={anchor} style={{ ...svgMono(8.5, FAINTER) }}>{c.sub.toUpperCase()}</text>
          </g>
        );
      })}
    </>
  );
}

/** Deterministic tiny jitter so two types reading the same pair of values
 * never sit exactly on top of each other — keyed on the id, so the plot is
 * stable between renders. */
function jitterOf(id: string): { dx: number; dy: number } {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const a = ((h >>> 0) % 100) / 100;
  const b = ((h >>> 8) % 100) / 100;
  return { dx: (a - 0.5) * 34, dy: (b - 0.5) * 26 };
}

// ---------------------------------------------------------------------------
// THE INTERACTIVE QUADRANT — the one plot the Pieces index draws.
// ---------------------------------------------------------------------------

interface CornerCount {
  yours: number;
  gapCount: number;
}

interface PlacedType {
  type: PieceMapType;
  kind: DotKind;
  /** In plot units. */
  px: number;
  py: number;
  /** 0..1, before the jitter — what the corner counts read. */
  ux: number;
  uy: number;
}

function placeTypes(axes: AxisPair, owned: Set<string>, gaps: Map<string, number>): PlacedType[] {
  return PIECE_MAP_TYPES.filter((t) => owned.has(t.id) || gaps.has(t.id)).map((type) => {
    const ux = Math.max(0, Math.min(1, axes.x(type)));
    const uy = Math.max(0, Math.min(1, axes.y(type)));
    const jitter = axes.handPlotted ? { dx: 0, dy: 0 } : jitterOf(type.id);
    return {
      type,
      kind: kindOf(type.id, owned, gaps),
      px: Math.max(8, Math.min(PLOT_W - 8, ux * PLOT_W + jitter.dx)),
      py: Math.max(8, Math.min(QUAD_H - 8, (1 - uy) * QUAD_H + jitter.dy)),
      ux,
      uy,
    };
  });
}

function countCorners(placed: PlacedType[]) {
  const count = (left: boolean, top: boolean): CornerCount => {
    const here = placed.filter((p) => (p.ux < 0.5) === left && (p.uy >= 0.5) === top);
    return {
      yours: here.filter((p) => p.kind === 'owned').length,
      gapCount: here.filter((p) => p.kind === 'gap').length,
    };
  };
  return {
    topLeft: count(true, true),
    topRight: count(false, true),
    bottomLeft: count(true, false),
    bottomRight: count(false, false),
  };
}

function cornerText(c: CornerCount, mutedHere: boolean): string {
  if (mutedHere) return c.yours === 0 && c.gapCount === 0 ? 'None · muted' : `${c.yours} yours · muted`;
  if (c.yours === 0 && c.gapCount === 0) return 'None';
  const bits: string[] = [];
  if (c.yours > 0) bits.push(`${c.yours} yours`);
  if (c.gapCount > 0) bits.push(`${c.gapCount} gap${c.gapCount === 1 ? '' : 's'}`);
  return bits.join(' · ');
}

/** BEAU, BRIEFLY — the one-paragraph reading of whichever axes are on. */
function pieceBrief(
  axes: AxisPair,
  corners: ReturnType<typeof countCorners>,
  formalMuted: boolean,
  total: number,
): string {
  if (total === 0) return 'Log a few pieces and the quadrant fills in — then I can tell you which corner you live in.';
  const named: Array<[string, CornerCount]> = [
    [axes.corners[0], corners.topLeft],
    [axes.corners[1], corners.topRight],
    [axes.corners[2], corners.bottomLeft],
    [axes.corners[3], corners.bottomRight],
  ];
  const dominant = named.reduce((best, cur) => (cur[1].yours > best[1].yours ? cur : best));
  const parts: string[] = [];
  if (dominant[1].yours > 0) {
    const gapNote = dominant[1].gapCount > 0
      ? `, with ${dominant[1].gapCount === 1 ? 'one of your gaps' : `${numberWord(dominant[1].gapCount)} of your gaps`} landing there too`
      : '';
    parts.push(
      `You live in “${dominant[0]}” — ${numberWord(dominant[1].yours)} piece${dominant[1].yours === 1 ? '' : 's'}${gapNote}.`,
    );
  }
  if (dominant[0] !== axes.corners[1] && corners.topRight.yours > 0) {
    parts.push(
      `${numberWord(corners.topRight.yours)} piece${corners.topRight.yours === 1 ? '' : 's'} sit in “${axes.corners[1]}”${
        corners.topRight.gapCount > 0 ? ' — one gap joins them up' : ''
      }.`,
    );
  }
  if (axes.id === 'formality-versatility' && formalMuted && corners.bottomRight.yours === 0) {
    parts.push(
      'Nothing belongs in the bottom-right — you’ve told me you don’t dress formal, and the quadrant honours that rather than scoring you on it.',
    );
  }
  return parts.join(' ') || 'Fewer points, fixed axes, named corners, counts — it delivers a reading, not an exploration.';
}

/** THE AXIS SELECTOR — deliberately light: three mono words over the plot,
 * the live one underlined in accent. Never a panel, never a dropdown. */
function AxisSelector({ active, onChange }: { active: QuadrantAxesId; onChange: (id: QuadrantAxesId) => void }) {
  return (
    <div className="flex flex-wrap items-baseline" role="group" aria-label="Which axes the quadrant reads" style={{ gap: '6px 20px', paddingBottom: '10px' }}>
      <span style={{ ...legendText, color: FAINT }}>Axes</span>
      {AXIS_PAIRS.map((pair) => {
        const on = pair.id === active;
        return (
          <button
            key={pair.id}
            type="button"
            onClick={() => onChange(pair.id)}
            aria-pressed={on}
            className="transition-colors"
            style={{
              ...legendText,
              background: 'transparent',
              color: on ? WALNUT : LABEL_BROWN,
              borderBottom: on ? `1px solid ${ACCENT}` : '1px solid transparent',
              paddingBottom: '2px',
            }}
          >
            {pair.label}
            {pair.note && <span style={{ color: on ? ACCENT_DEEP : FAINT }}>&nbsp;· {pair.note}</span>}
          </button>
        );
      })}
    </div>
  );
}

function PiecesQuadrant({ pieces, axes }: { pieces: WardrobePiece[]; axes: AxisPair }) {
  const { owned, gaps } = usePieceStatuses(pieces);
  const muted = useMutedRegisters();
  const formalMuted = muted.includes('formal');
  const zoom = usePinchZoom(VIEW_W, QUAD_VIEW_H);

  const placed = useMemo(() => placeTypes(axes, owned, gaps), [axes, owned, gaps]);
  const corners = useMemo(() => countCorners(placed), [placed]);
  // Only the formality reading has a register the wearer can mute — the
  // weather and cost readings have nothing to honour.
  const mutedCorner = axes.id === 'formality-versatility' && formalMuted;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-8 lg:gap-[44px] items-start">
      <div>
        {/* The legend stays exactly where it was — over the plot. */}
        <div className="flex flex-wrap items-center" style={{ gap: '22px', paddingBottom: '14px' }}>
          <LegendItem kind="owned" label="You own one" />
          <LegendItem kind="none" label="You don't" />
          <LegendItem kind="gap" label="A gap Beau flags" />
          {zoom.zoomed && (
            <button type="button" onClick={zoom.reset} className="hover:underline" style={{ ...legendText, color: ACCENT, background: 'transparent' }}>
              Reset zoom
            </button>
          )}
        </div>
        <PlotBox>
          <svg
            ref={zoom.svgRef}
            viewBox={zoom.viewBox}
            {...zoom.handlers}
            className="w-full h-auto block"
            style={{ touchAction: zoom.touchAction }}
            role="img"
            aria-label={`Your pieces and the flagged gaps, cut into four named quadrants — ${axes.acrossLabel} across, ${axes.upLabel} up`}
          >
            <line x1={PAD_L + PLOT_W / 2} y1={PAD_T} x2={PAD_L + PLOT_W / 2} y2={PAD_T + QUAD_H} stroke="rgba(59,43,29,0.34)" strokeWidth="1" />
            <line x1={PAD_L} y1={PAD_T + QUAD_H / 2} x2={PAD_L + PLOT_W} y2={PAD_T + QUAD_H / 2} stroke="rgba(59,43,29,0.34)" strokeWidth="1" />

            <QuadCornerLabels corners={cornerBlocks(axes)} plotH={QUAD_H} />

            <text x={12} y={PAD_T + 4} style={svgMono()}>{axes.upHigh.toUpperCase()}</text>
            <text x={12} y={PAD_T + QUAD_H + 2} style={svgMono()}>{axes.upLow.toUpperCase()}</text>
            <text x={PAD_L} y={PAD_T + QUAD_H + 22} style={svgMono()}>{axes.acrossLow.toUpperCase()}</text>
            <text x={PAD_L + PLOT_W} y={PAD_T + QUAD_H + 22} textAnchor="end" style={svgMono()}>{axes.acrossHigh.toUpperCase()}</text>

            {placed.map(({ type, kind, px, py }) => {
              const cx = PAD_L + px;
              const cy = PAD_T + py;
              const right = axes.handPlotted ? (type.qside || type.side) === 'r' : px > PLOT_W * 0.78;
              const lx = right ? cx - 13 : cx + 13;
              return (
                <g key={type.id}>
                  <title>{`${type.label} — ${kind === 'owned' ? 'you own one' : 'a gap Beau flags'}`}</title>
                  <TypeDot cx={cx} cy={cy} kind={kind} />
                  <text x={lx} y={cy + 4.5} textAnchor={right ? 'end' : 'start'} style={{ fontFamily: SERIF, fontSize: '13.5px', fill: WALNUT }}>
                    {type.label}
                  </text>
                </g>
              );
            })}

            {placed.length === 0 && (
              <text x={PAD_L + PLOT_W / 2} y={PAD_T + QUAD_H / 2 - 14} textAnchor="middle" style={{ fontFamily: BODY, fontSize: '13px', fill: MUTED }}>
                Nothing to place yet — log a few pieces and the quadrant fills in.
              </text>
            )}
          </svg>
        </PlotBox>
        <p style={{ margin: '14px 0 0', maxWidth: '86ch', fontFamily: BODY, fontSize: '13px', lineHeight: 1.6, color: MUTED }}>
          Across · {axes.acrossLabel.toLowerCase()} · Up · {axes.upLabel.toLowerCase()}. Switch the axes above and the same
          pieces re-place themselves — the corners are renamed with them.
        </p>
      </div>

      <div>
        <div style={{ fontFamily: MONO, fontSize: '9px', letterSpacing: '0.07em', textTransform: 'uppercase', color: LABEL_BROWN }}>
          What each corner holds
        </div>
        <div className="flex flex-col" style={{ marginTop: '12px' }}>
          <CornerRow
            name={axes.corners[0]}
            count={cornerText(corners.topLeft, false)}
            tone={corners.topLeft.gapCount > 0 && corners.topLeft.yours < 3 ? ACCENT : WALNUT}
          />
          <CornerRow
            name={axes.corners[1]}
            count={cornerText(corners.topRight, false)}
            tone={corners.topRight.gapCount > 0 && corners.topRight.yours < 3 ? ACCENT : WALNUT}
          />
          <CornerRow name={axes.corners[2]} count={cornerText(corners.bottomLeft, false)} />
          {/* A REGISTER THE USER HAS MUTED reads "muted", never "0 of 12". */}
          <CornerRow
            name={axes.corners[3]}
            count={cornerText(corners.bottomRight, mutedCorner)}
            tone={mutedCorner ? MUTED : WALNUT}
            last
          />
        </div>
        <AccentNote title="Beau, briefly" style={{ marginTop: '20px' }}>
          {pieceBrief(axes, corners, formalMuted, placed.length)}
        </AccentNote>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The exported section.
// ---------------------------------------------------------------------------

type PiecesView = 'list' | 'quadrant';

/**
 * THE PIECES SECTION of The Index — one header row (title + intro left, the
 * LIST · QUADRANT toggle at the RIGHT edge), then the selected reading. Both
 * views read the same records.
 */
export function PiecesIndex({
  pieces,
  profile,
  onPlateChange,
}: {
  pieces: WardrobePiece[];
  profile: StyleProfile | null;
  /** Bubbles up when a CATEGORY PLATE opens/closes in the list, so The
   * Index's own header can yield to the plate's breadcrumb. */
  onPlateChange?: (open: boolean) => void;
}) {
  usePlexMono();
  const [view, setView] = useState<PiecesView>('list');
  const [axesId, setAxesId] = useState<QuadrantAxesId>('formality-versatility');
  const axes = AXIS_PAIRS.find((pair) => pair.id === axesId) || AXIS_PAIRS[0];

  const toggle = (
    <ViewToggle
      items={[
        { id: 'list' as const, label: 'List' },
        { id: 'quadrant' as const, label: 'Quadrant' },
      ]}
      active={view}
      onChange={(id) => setView(id)}
      ariaLabel="Piece index views"
    />
  );

  if (view === 'list') {
    // LIST — the 13a piece index: category rail left, the types in tailor's
    // runs right, FIND + the four filters + the jump rail above. The
    // quadrant toggle stays in its header (never removed).
    return (
      <PieceIndexList
        pieces={pieces}
        profile={profile}
        toggle={toggle}
        onPlateChange={onPlateChange}
      />
    );
  }

  return (
    <div>
      <div
        className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-5 md:gap-10 md:items-end"
        style={{ paddingBottom: '20px', borderBottom: '1px solid var(--color-text,#3b2b1d)' }}
      >
        <div>
          <h3 style={{ margin: 0, fontFamily: SERIF, fontSize: 'clamp(30px, 4vw, 42px)', fontWeight: 400, lineHeight: 1.08, letterSpacing: '-0.012em', color: WALNUT }}>
            {axes.title}
          </h3>
          <p style={{ margin: '11px 0 0', maxWidth: '74ch', fontFamily: BODY, fontSize: '15.5px', lineHeight: 1.58, color: INK }}>{axes.intro}</p>
        </div>
        {toggle}
      </div>
      <div style={{ marginTop: '22px' }}>
        <AxisSelector active={axesId} onChange={setAxesId} />
        <PiecesQuadrant pieces={pieces} axes={axes} />
      </div>
    </div>
  );
}
