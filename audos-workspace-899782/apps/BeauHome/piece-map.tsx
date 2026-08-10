/**
 * THE INDEX · PIECES — rebuilt to the corrected design handoff, screen 20a
 * ("Pieces · on a map, and in a quadrant") and mobile M13.
 *
 * ONE header row carries the section title and the AS A LIST · ON A MAP ·
 * AS A QUADRANT toggle at its RIGHT edge, closed by a walnut hairline.
 *
 *  · ON A MAP — the whole 20a page: axis-selector row and three-dot legend
 *    over the plot, the WHY A MAP HERE note and OTHER AXES table in the
 *    300px right rail, the reading paragraph beneath — then, below a rule,
 *    the quadrant section exactly as the reference stacks it.
 *  · AS A QUADRANT — the same quadrant section alone: fixed axes, the four
 *    corners NAMED IN THE PLOT'S CORNERS (Workhorses · The backbone ·
 *    Weekend specifics · Occasion only, each with its register sub-label),
 *    and the counts in the WHAT EACH CORNER HOLDS rail — counts + names,
 *    never scorecards. A muted register reads "muted", never "0 of 12".
 *
 * The 21 plotted positions transcribe the reference's dot coordinates
 * exactly; which dots draw filled (owned) or accented (a gap Beau flags)
 * is read live from the wardrobe and the last stored assessment.
 * Mobile (M13): the map keeps eight points — gaps first, then what you
 * own — the axes stay, and the rest is pinch-to-zoom (plot-zoom.ts).
 */
import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { promoteToScout, type StyleProfile, type WardrobePiece } from './profile-data';
import { PieceIndexList } from './piece-index-list';
import { peekBeauAssessment } from './beau-assessment';
import { COVERAGE_PREFS_EVENT, MUTED_STORE_KEY, fetchCoveragePrefs, loadLocalJson } from './coverage-prefs';
import { useIsNarrow, usePinchZoom } from './plot-zoom';
import { MONO, capWord, numberWord, usePlexMono } from './mono-type';
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
// (MOST OUTFITS · ONE OUTFIT · CASUAL · FORMAL) have room to sit outside.
const PLOT_W = 880;
const MAP_H = 420;
const QUAD_H = 400;
const PAD_L = 58;
const PAD_T = 30;
const PAD_R = 40;
const PAD_B = 34;
const VIEW_W = PAD_L + PLOT_W + PAD_R;
const MAP_VIEW_H = PAD_T + MAP_H + PAD_B;
const QUAD_VIEW_H = PAD_T + QUAD_H + PAD_B;

function svgMono(size = 8.5, fill = FAINT): React.CSSProperties {
  return { fontFamily: MONO, fontSize: `${size}px`, letterSpacing: '0.06em', fill };
}

// ---------------------------------------------------------------------------
// The plotted taxonomy — 21 types at the reference's exact coordinates.
// mx/my place a type on the map (880 × 420); qx/qy on the quadrant
// (880 × 400, only the reference's quadrant set carries them); side 'r'
// right-aligns the label for dots near the right edge.
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
  keywords: string[];
}

export const PIECE_MAP_TYPES: PieceMapType[] = [
  { id: 't-shirt', label: 'T-shirt', mx: 53, my: 202, qx: 88, qy: 160, keywords: ['t-shirt', 't shirt', 'tee'] },
  { id: 'hoodie', label: 'Hoodie', mx: 53, my: 294, qx: 106, qy: 264, keywords: ['hoodie', 'hooded'] },
  { id: 'shorts', label: 'Shorts', mx: 88, my: 361, keywords: ['shorts'] },
  { id: 'jeans', label: 'Jeans', mx: 141, my: 109, keywords: ['jeans'] },
  { id: 'field-jacket', label: 'Field jacket', mx: 176, my: 168, qx: 194, qy: 136, keywords: ['field jacket', 'field-jacket', 'm-43', 'm43', 'm-65', 'm65'] },
  { id: 'overshirt', label: 'Overshirt', mx: 211, my: 244, keywords: ['overshirt', 'shirt jacket', 'shacket'] },
  { id: 'waxed-jacket', label: 'Waxed jacket', mx: 264, my: 202, qx: 264, qy: 176, keywords: ['waxed jacket', 'wax jacket', 'waxed-jacket', 'waxed cotton'] },
  { id: 'leather-sneaker', label: 'Leather sneaker', mx: 299, my: 59, qx: 299, qy: 64, keywords: ['sneaker', 'trainer'] },
  { id: 'chinos', label: 'Chinos', mx: 370, my: 8, qx: 405, qy: 24, keywords: ['chino'] },
  { id: 'linen-shirt', label: 'Linen shirt', mx: 352, my: 134, qx: 352, qy: 112, keywords: ['linen shirt', 'linen-shirt'] },
  { id: 'cardigan', label: 'Cardigan', mx: 405, my: 92, qx: 387, qy: 80, keywords: ['cardigan'] },
  { id: 'crew-neck-jumper', label: 'Crew neck jumper', mx: 440, my: 50, qx: 190, qy: 96, keywords: ['crew neck', 'crewneck', 'crew-neck', 'jumper', 'sweater'] },
  { id: 'oxford-shirt', label: 'Oxford shirt', mx: 546, my: 25, qx: 528, qy: 32, keywords: ['oxford shirt', 'oxford-shirt', 'ocbd', 'oxford button'] },
  { id: 'roll-neck', label: 'Roll neck', mx: 493, my: 185, keywords: ['roll neck', 'rollneck', 'roll-neck', 'turtleneck', 'turtle neck'] },
  { id: 'chelsea-boot', label: 'Chelsea boot', mx: 563, my: 126, keywords: ['chelsea'] },
  { id: 'penny-loafer', label: 'Penny loafer', mx: 634, my: 59, side: 'r', qx: 581, qy: 88, qside: 'l', keywords: ['loafer'] },
  { id: 'wool-trousers', label: 'Wool trousers', mx: 651, my: 168, side: 'r', qx: 634, qy: 152, qside: 'r', keywords: ['wool trouser', 'flannel trouser', 'dress trouser', 'tropical wool'] },
  { id: 'blazer', label: 'Blazer', mx: 722, my: 109, side: 'r', keywords: ['blazer', 'sports jacket', 'sport coat'] },
  { id: 'overcoat', label: 'Overcoat', mx: 739, my: 269, side: 'r', keywords: ['overcoat', 'topcoat', 'chesterfield'] },
  { id: 'cap-toe-oxford', label: 'Cap-toe oxford', mx: 792, my: 227, side: 'r', keywords: ['cap-toe', 'cap toe', 'oxford shoe', 'balmoral', 'derby', 'brogue'] },
  { id: 'suit', label: 'Suit', mx: 845, my: 353, side: 'r', keywords: ['suit'] },
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

/** Owned + gap statuses, shared by the plots and the Index header intro. */
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

const ORDINALS = ['1st', '2nd', '3rd'];

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
// Shared chrome — the axis-selector row, the legend, the right-rail blocks.
// ---------------------------------------------------------------------------

function AxisRow({ across, up }: { across: string; up: string }) {
  const wrap: React.CSSProperties = { fontFamily: MONO, fontSize: '9px', letterSpacing: '0.07em', textTransform: 'uppercase', color: LABEL_BROWN };
  const pick: React.CSSProperties = { color: WALNUT, borderBottom: '1px solid rgba(168,113,44,0.6)', paddingBottom: '1px' };
  return (
    <div className="flex flex-wrap items-baseline" style={{ gap: '26px', paddingBottom: '12px' }}>
      <span style={wrap}>Across · <span style={pick}>{across}&nbsp;⌄</span></span>
      <span style={wrap}>Up · <span style={pick}>{up}&nbsp;⌄</span></span>
    </div>
  );
}

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

/** The accent-ruled aside — WHY A MAP HERE · BEAU, BRIEFLY. */
export function AccentNote({ title, children, style }: { title: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ borderLeft: `2px solid ${ACCENT}`, paddingLeft: '16px', ...style }}>
      <div style={{ fontFamily: MONO, fontSize: '9px', letterSpacing: '0.06em', textTransform: 'uppercase', color: MUTED }}>{title}</div>
      <p style={{ margin: '8px 0 0', fontFamily: BODY, fontSize: '14px', lineHeight: 1.6, color: INK }}>{children}</p>
    </div>
  );
}

/** The OTHER AXES table in the right rail. */
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
// The corner label blocks the quadrant draws INSIDE the plot (20a): name in
// Cormorant 17 over the register sub-label in mono — never counts.
// ---------------------------------------------------------------------------

interface QuadCorner {
  name: string;
  sub: string;
  h: 'l' | 'r';
  v: 't' | 'b';
  /** The reference's inset from the plot's top/bottom edge for this block. */
  inset: number;
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

// ---------------------------------------------------------------------------
// The map — the whole slice of the taxonomy, quarter gridlines, live dots.
// ---------------------------------------------------------------------------

function PiecesMapSvg({ pieces }: { pieces: WardrobePiece[] }) {
  const narrow = useIsNarrow();
  const { owned, gaps } = usePieceStatuses(pieces);
  const zoom = usePinchZoom(VIEW_W, MAP_VIEW_H);

  const plotted = useMemo(() => {
    if (!narrow || PIECE_MAP_TYPES.length <= 8) return PIECE_MAP_TYPES;
    // MOBILE (M13): the map keeps eight points — gaps first, then owned by
    // versatility, then the most versatile of the rest.
    const ranked = [...PIECE_MAP_TYPES].sort((a, b) => {
      const aw = gaps.has(a.id) ? 2 : owned.has(a.id) ? 1 : 0;
      const bw = gaps.has(b.id) ? 2 : owned.has(b.id) ? 1 : 0;
      if (aw !== bw) return bw - aw;
      return a.my - b.my;
    });
    return ranked.slice(0, 8);
  }, [narrow, owned, gaps]);

  return (
    <div>
      <AxisRow across="How formal it reads" up="How many outfits it enters" />
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
          aria-label="Garment types plotted — how formal they read across, how many outfits they enter up"
        >
          {/* Quiet quarter gridlines. */}
          {[220, 440, 660].map((gx) => (
            <line key={gx} x1={PAD_L + gx} y1={PAD_T} x2={PAD_L + gx} y2={PAD_T + MAP_H} stroke="rgba(59,43,29,0.1)" strokeWidth="1" />
          ))}
          {[105, 210, 315].map((gy) => (
            <line key={gy} x1={PAD_L} y1={PAD_T + gy} x2={PAD_L + PLOT_W} y2={PAD_T + gy} stroke="rgba(59,43,29,0.1)" strokeWidth="1" />
          ))}

          <text x={12} y={PAD_T + 4} style={svgMono()}>MOST OUTFITS</text>
          <text x={12} y={PAD_T + MAP_H + 2} style={svgMono()}>ONE OUTFIT</text>
          <text x={PAD_L} y={PAD_T + MAP_H + 22} style={svgMono()}>CASUAL</text>
          <text x={PAD_L + PLOT_W} y={PAD_T + MAP_H + 22} textAnchor="end" style={svgMono()}>FORMAL</text>

          {plotted.map((t) => {
            const kind = kindOf(t.id, owned, gaps);
            const gapRank = gaps.get(t.id);
            const cx = PAD_L + Math.max(8, Math.min(PLOT_W - 8, t.mx));
            const cy = PAD_T + Math.max(8, Math.min(MAP_H - 8, t.my));
            const right = t.side === 'r';
            const lx = right ? cx - 13 : cx + 13;
            const status = kind === 'owned' ? 'you own one' : gapRank ? `gap · ${ORDINALS[gapRank - 1] || `${gapRank}th`}` : 'you don’t own one';
            return (
              <g key={t.id}>
                <title>{`${t.label} — ${status}`}</title>
                <TypeDot cx={cx} cy={cy} kind={kind} />
                <text x={lx} y={cy + 4.5} textAnchor={right ? 'end' : 'start'} style={{ fontFamily: SERIF, fontSize: '13.5px', fill: WALNUT }}>
                  {t.label}
                </text>
                {gapRank && (
                  <text x={lx} y={cy + 16} textAnchor={right ? 'end' : 'start'} style={{ ...svgMono(8, ACCENT_DEEP) }}>
                    GAP · {(ORDINALS[gapRank - 1] || `${gapRank}TH`).toUpperCase()}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </PlotBox>
      <p style={{ margin: '18px 0 0', maxWidth: '86ch', fontFamily: BODY, fontSize: '14px', lineHeight: 1.6, color: INK }}>
        {narrow && plotted.length < PIECE_MAP_TYPES.length
          ? `${plotted.length} of ${PIECE_MAP_TYPES.length} types at this width — pinch to zoom; the full set is one tap away in the list. `
          : ''}
        The useful region is the top middle — pieces that enter many outfits without committing to a register — and
        it’s where the flagged gaps tend to sit, which is the visual argument for their order. Everything you own
        draws filled, so a smart piece with no shoe to land on is the same finding The Edit states in words.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The quadrant — fewer points, fixed axes, named corners; counts live in
// the right rail, not on the plot.
// ---------------------------------------------------------------------------

interface CornerCount {
  yours: number;
  gapCount: number;
}

function usePieceCorners(owned: Set<string>, gaps: Map<string, number>) {
  return useMemo(() => {
    const inSet = PIECE_MAP_TYPES.filter((t) => owned.has(t.id) || gaps.has(t.id));
    const count = (left: boolean, top: boolean): CornerCount => {
      const here = inSet.filter((t) => (qxOf(t) < PLOT_W / 2) === left && (qyOf(t) < QUAD_H / 2) === top);
      return { yours: here.filter((t) => owned.has(t.id)).length, gapCount: here.filter((t) => gaps.has(t.id)).length };
    };
    return {
      workhorses: count(true, true),
      backbone: count(false, true),
      weekend: count(true, false),
      occasion: count(false, false),
      plotted: inSet,
    };
  }, [owned, gaps]);
}

function cornerText(c: CornerCount, mutedHere: boolean): string {
  if (mutedHere) return c.yours === 0 && c.gapCount === 0 ? 'None · muted' : `${c.yours} yours · muted`;
  if (c.yours === 0 && c.gapCount === 0) return 'None';
  const bits: string[] = [];
  if (c.yours > 0) bits.push(`${c.yours} yours`);
  if (c.gapCount > 0) bits.push(`${c.gapCount} gap${c.gapCount === 1 ? '' : 's'}`);
  return bits.join(' · ');
}

/** BEAU, BRIEFLY — the one-paragraph reading of the quadrant. */
function pieceBrief(
  corners: { workhorses: CornerCount; backbone: CornerCount; weekend: CornerCount; occasion: CornerCount },
  formalMuted: boolean,
  total: number,
): string {
  if (total === 0) return 'Log a few pieces and the quadrant fills in — then I can tell you which corner you live in.';
  const named: Array<[string, CornerCount]> = [
    ['top-left', corners.workhorses],
    ['top-right', corners.backbone],
    ['bottom-left', corners.weekend],
    ['bottom-right', corners.occasion],
  ];
  const dominant = named.reduce((best, cur) => (cur[1].yours > best[1].yours ? cur : best));
  const parts: string[] = [];
  if (dominant[1].yours > 0) {
    const gapNote = dominant[1].gapCount > 0
      ? `, with ${dominant[1].gapCount === 1 ? 'one of your gaps' : `${numberWord(dominant[1].gapCount)} of your gaps`} landing there too`
      : '';
    parts.push(
      `You live in the ${dominant[0]} — ${numberWord(dominant[1].yours)} piece${dominant[1].yours === 1 ? '' : 's'}${gapNote}.`,
    );
  }
  if (dominant[0] !== 'top-right' && corners.backbone.yours > 0) {
    parts.push(
      `You have ${numberWord(corners.backbone.yours)} piece${corners.backbone.yours === 1 ? '' : 's'} in the top-right${
        corners.backbone.gapCount > 0 ? ' — one gap joins them up' : ''
      }.`,
    );
  }
  if (formalMuted && corners.occasion.yours === 0) {
    parts.push(
      'Nothing belongs in the bottom-right — you’ve told me you don’t dress formal, and the quadrant honours that rather than scoring you on it.',
    );
  }
  return parts.join(' ') || 'Fewer points, fixed axes, named corners, counts — it delivers a reading, not an exploration.';
}

function PiecesQuadrant({ pieces, withHeading }: { pieces: WardrobePiece[]; withHeading: boolean }) {
  const { owned, gaps } = usePieceStatuses(pieces);
  const muted = useMutedRegisters();
  const formalMuted = muted.includes('formal');
  const corners = usePieceCorners(owned, gaps);
  const zoom = usePinchZoom(VIEW_W, QUAD_VIEW_H);

  const cornerLabels: QuadCorner[] = [
    { name: 'Workhorses', sub: 'Casual · many outfits', h: 'l', v: 't', inset: 26 },
    { name: 'The backbone', sub: 'Smart · many outfits', h: 'r', v: 't', inset: 12 },
    { name: 'Weekend specifics', sub: 'Casual · few outfits', h: 'l', v: 'b', inset: 12 },
    { name: 'Occasion only', sub: 'Smart · few outfits', h: 'r', v: 'b', inset: 12 },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-8 lg:gap-[44px] items-start">
      <div>
        {withHeading && (
          <>
            <h4 style={{ margin: 0, fontFamily: SERIF, fontSize: '30px', fontWeight: 400, lineHeight: 1.14, color: WALNUT }}>
              The same axes, cut in four
            </h4>
            <p style={{ margin: '9px 0 0', maxWidth: '78ch', fontFamily: BODY, fontSize: '14.5px', lineHeight: 1.58, color: INK }}>
              The quadrant drops the exploratory set and plots only what you own plus the gaps — then names the four
              regions, counts them, and says what’s thin. A map shows where things are; a quadrant tells you which
              corner you live in.
            </p>
          </>
        )}
        <PlotBox style={{ marginTop: withHeading ? '20px' : 0 }}>
          <svg
            ref={zoom.svgRef}
            viewBox={zoom.viewBox}
            {...zoom.handlers}
            className="w-full h-auto block"
            style={{ touchAction: zoom.touchAction }}
            role="img"
            aria-label="Your pieces and the flagged gaps, cut into four named quadrants"
          >
            <line x1={PAD_L + PLOT_W / 2} y1={PAD_T} x2={PAD_L + PLOT_W / 2} y2={PAD_T + QUAD_H} stroke="rgba(59,43,29,0.34)" strokeWidth="1" />
            <line x1={PAD_L} y1={PAD_T + QUAD_H / 2} x2={PAD_L + PLOT_W} y2={PAD_T + QUAD_H / 2} stroke="rgba(59,43,29,0.34)" strokeWidth="1" />

            <QuadCornerLabels corners={cornerLabels} plotH={QUAD_H} />

            <text x={12} y={PAD_T + 4} style={svgMono()}>MOST OUTFITS</text>
            <text x={12} y={PAD_T + QUAD_H + 2} style={svgMono()}>ONE OUTFIT</text>
            <text x={PAD_L} y={PAD_T + QUAD_H + 22} style={svgMono()}>CASUAL</text>
            <text x={PAD_L + PLOT_W} y={PAD_T + QUAD_H + 22} textAnchor="end" style={svgMono()}>FORMAL</text>

            {corners.plotted.map((t) => {
              const kind = kindOf(t.id, owned, gaps);
              const cx = PAD_L + Math.max(8, Math.min(PLOT_W - 8, qxOf(t)));
              const cy = PAD_T + Math.max(8, Math.min(QUAD_H - 8, qyOf(t)));
              const right = (t.qside || t.side) === 'r';
              const lx = right ? cx - 13 : cx + 13;
              return (
                <g key={t.id}>
                  <title>{`${t.label} — ${kind === 'owned' ? 'you own one' : 'a gap Beau flags'}`}</title>
                  <TypeDot cx={cx} cy={cy} kind={kind} />
                  <text x={lx} y={cy + 4.5} textAnchor={right ? 'end' : 'start'} style={{ fontFamily: SERIF, fontSize: '13.5px', fill: WALNUT }}>
                    {t.label}
                  </text>
                </g>
              );
            })}

            {corners.plotted.length === 0 && (
              <text x={PAD_L + PLOT_W / 2} y={PAD_T + QUAD_H / 2 - 14} textAnchor="middle" style={{ fontFamily: BODY, fontSize: '13px', fill: MUTED }}>
                Nothing to place yet — log a few pieces and the quadrant fills in.
              </text>
            )}
          </svg>
        </PlotBox>
      </div>

      <div>
        <div style={{ fontFamily: MONO, fontSize: '9px', letterSpacing: '0.07em', textTransform: 'uppercase', color: LABEL_BROWN }}>
          What each corner holds
        </div>
        <div className="flex flex-col" style={{ marginTop: '12px' }}>
          <CornerRow
            name="Workhorses"
            count={cornerText(corners.workhorses, false)}
            tone={corners.workhorses.gapCount > 0 && corners.workhorses.yours < 3 ? ACCENT : WALNUT}
          />
          <CornerRow
            name="The backbone"
            count={cornerText(corners.backbone, false)}
            tone={corners.backbone.gapCount > 0 && corners.backbone.yours < 3 ? ACCENT : WALNUT}
          />
          <CornerRow name="Weekend specifics" count={cornerText(corners.weekend, false)} />
          {/* A REGISTER THE USER HAS MUTED reads "muted", never "0 of 12". */}
          <CornerRow name="Occasion only" count={cornerText(corners.occasion, formalMuted)} tone={formalMuted ? MUTED : WALNUT} last />
        </div>
        <AccentNote title="Beau, briefly" style={{ marginTop: '20px' }}>
          {pieceBrief(corners, formalMuted, corners.plotted.length)}
        </AccentNote>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The exported views.
// ---------------------------------------------------------------------------

/** The plots alone — kept for callers that already carry their own header. */
export function PiecesMap({ pieces, view }: { pieces: WardrobePiece[]; view: 'map' | 'quadrant' }) {
  usePlexMono();
  if (view === 'quadrant') return <PiecesQuadrant pieces={pieces} withHeading={false} />;
  return (
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-8 lg:gap-[44px] items-start">
        <PiecesMapSvg pieces={pieces} />
        <div>
          <AccentNote title="Why a map here">
            A list of 380 types can’t show you that the shoe, the jumper and the chinos all sit in the same
            high-versatility band — which is why they’re the three priorities and not, say, an overcoat.
          </AccentNote>
          <OtherAxes
            rows={[
              { label: 'Formality · versatility', note: 'Shown', accent: true },
              { label: 'Warmth · rain', note: 'Autumn' },
              { label: 'Essentialness · cost', note: 'Building up' },
              { label: 'Formality · times worn', note: 'Your own habits' },
            ]}
          />
        </div>
      </div>
      {/* THE SAME AXES, CUT IN FOUR — stacked below the map, exactly as the
          reference lays the page out. */}
      <div style={{ marginTop: '46px', paddingTop: '24px', borderTop: '1px solid var(--color-text,#3b2b1d)' }}>
        <PiecesQuadrant pieces={pieces} withHeading />
      </div>
    </div>
  );
}

type PiecesView = 'list' | 'map' | 'quadrant';

/**
 * THE PIECES SECTION of The Index — one header row (title + intro left, the
 * AS A LIST · ON A MAP · AS A QUADRANT toggle at the RIGHT edge), then the
 * selected reading. All three views read the same records.
 */
export function PiecesIndex({
  pieces,
  profile,
  onShowMakers,
}: {
  pieces: WardrobePiece[];
  profile: StyleProfile | null;
  /** The MAKERS chip in the 13a list header hands over to the makers index. */
  onShowMakers?: () => void;
}) {
  usePlexMono();
  const [view, setView] = useState<PiecesView>('list');
  const { gaps } = usePieceStatuses(pieces);

  const toggle = (
    <ViewToggle
      items={[
        { id: 'list' as const, label: 'As a list' },
        { id: 'map' as const, label: 'On a map' },
        { id: 'quadrant' as const, label: 'As a quadrant' },
      ]}
      active={view}
      onChange={(id) => setView(id)}
      ariaLabel="Piece index views"
    />
  );

  if (view === 'list') {
    // AS A LIST — the 13a piece index: category rail left, the types in
    // tailor's runs right, FIND + the four filters + the jump rail above.
    // The map/quadrant toggle stays in its header (never removed).
    return (
      <PieceIndexList
        pieces={pieces}
        profile={profile}
        // A gap leads to The Hunt, pre-filled — reference never sells, it
        // points at the funnel.
        onSeeForYou={(sub) => promoteToScout(sub.label)}
        toggle={toggle}
        onShowMap={() => setView('map')}
        onShowQuadrant={() => setView('quadrant')}
        onShowMakers={onShowMakers}
      />
    );
  }

  const title = view === 'map' ? 'Where the pieces sit' : 'The same axes, cut in four';
  const intro =
    view === 'map' ? (
      <>
        {capWord(numberWord(PIECE_MAP_TYPES.length))} types placed by how formal they read and how many outfits they
        enter. Filled dots are types you own;{' '}
        {gaps.size > 0
          ? `the ${numberWord(gaps.size)} accented one${gaps.size === 1 ? '' : 's'} ${gaps.size === 1 ? 'is the gap' : 'are the gaps'} from The Edit, drawn where ${gaps.size === 1 ? 'it’d' : 'they’d'} land.`
          : 'the accented ones are the gaps The Edit flags, drawn where they’d land.'}
      </>
    ) : (
      <>
        The quadrant drops the exploratory set and plots only what you own plus the gaps — then names the four
        regions, counts them, and says what’s thin. A map shows where things are; a quadrant tells you which
        corner you live in.
      </>
    );

  return (
    <div>
      <div
        className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-5 md:gap-10 md:items-end"
        style={{ paddingBottom: '20px', borderBottom: '1px solid var(--color-text,#3b2b1d)' }}
      >
        <div>
          <h3 style={{ margin: 0, fontFamily: SERIF, fontSize: 'clamp(30px, 4vw, 42px)', fontWeight: 400, lineHeight: 1.08, letterSpacing: '-0.012em', color: WALNUT }}>
            {title}
          </h3>
          <p style={{ margin: '11px 0 0', maxWidth: '74ch', fontFamily: BODY, fontSize: '15.5px', lineHeight: 1.58, color: INK }}>{intro}</p>
        </div>
        {toggle}
      </div>
      <div style={{ marginTop: '26px' }}>
        <PiecesMap pieces={pieces} view={view} />
      </div>
    </div>
  );
}
