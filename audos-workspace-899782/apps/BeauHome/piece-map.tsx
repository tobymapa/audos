/**
 * THE INDEX · PIECES — on a map, and in a quadrant (design handoff screen
 * 20a, mobile M13). Two plots added BESIDE the piece index's list view,
 * never replacing it:
 *
 *   · ON A MAP — twenty-one garment types placed by how formal they read
 *     (across) and how many outfits they enter (up). Filled dots are types
 *     the user owns; the accented ones are the gaps The Edit flags, drawn
 *     where they'd land. A list of 380 types can't show that the shoe, the
 *     jumper and the chinos sit in the same high-versatility band — the
 *     map can, and that IS the argument for their priority order.
 *   · AS A QUADRANT — the same axes cut in four: the quadrant drops the
 *     exploratory set, plots only what you own plus the gaps, names the
 *     four regions and counts them. Workhorses · The backbone · Weekend
 *     specifics · Occasion only. A muted register reads “muted”, never
 *     “0 of 12” — a quadrant that scores you on a register you've
 *     disowned is a nag with axes.
 *
 * Mobile (M13): the map keeps eight points — gaps first, then what you
 * own — the axes stay, and the rest is pinch-to-zoom (plot-zoom.ts).
 */
import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { typography } from '../../lib/colors';
import type { WardrobePiece } from './profile-data';
import { peekBeauAssessment } from './beau-assessment';
import { COVERAGE_PREFS_EVENT, MUTED_STORE_KEY, fetchCoveragePrefs, loadLocalJson } from './coverage-prefs';
import { useIsNarrow, usePinchZoom } from './plot-zoom';

// ---------------------------------------------------------------------------
// The plotted taxonomy — 21 types, placed by formality (x, 0 casual → 1
// formal) and outfit versatility (y, 0 one outfit → 1 most outfits). The
// coordinates transcribe the corrected design reference (20a); keywords
// match owned pieces and The Edit's gap recommendations onto each type.
// ---------------------------------------------------------------------------

export interface PieceMapType {
  id: string;
  label: string;
  /** 0..1 — how formal it reads. */
  x: number;
  /** 0..1 — how many outfits it enters. */
  y: number;
  keywords: string[];
}

export const PIECE_MAP_TYPES: PieceMapType[] = [
  { id: 't-shirt', label: 'T-shirt', x: 0.08, y: 0.55, keywords: ['t-shirt', 't shirt', 'tee'] },
  { id: 'hoodie', label: 'Hoodie', x: 0.1, y: 0.32, keywords: ['hoodie', 'hooded'] },
  { id: 'shorts', label: 'Shorts', x: 0.14, y: 0.14, keywords: ['shorts'] },
  { id: 'jeans', label: 'Jeans', x: 0.2, y: 0.66, keywords: ['jeans'] },
  { id: 'field-jacket', label: 'Field jacket', x: 0.24, y: 0.53, keywords: ['field jacket', 'field-jacket', 'm-43', 'm43', 'm-65', 'm65'] },
  { id: 'overshirt', label: 'Overshirt', x: 0.28, y: 0.42, keywords: ['overshirt', 'shirt jacket', 'shacket'] },
  { id: 'waxed-jacket', label: 'Waxed jacket', x: 0.35, y: 0.52, keywords: ['waxed jacket', 'wax jacket', 'waxed-jacket', 'waxed cotton'] },
  { id: 'leather-sneaker', label: 'Leather sneaker', x: 0.37, y: 0.76, keywords: ['sneaker', 'trainer'] },
  { id: 'linen-shirt', label: 'Linen shirt', x: 0.43, y: 0.62, keywords: ['linen shirt', 'linen-shirt'] },
  { id: 'chinos', label: 'Chinos', x: 0.45, y: 0.88, keywords: ['chino'] },
  { id: 'cardigan', label: 'Cardigan', x: 0.47, y: 0.7, keywords: ['cardigan'] },
  { id: 'crew-neck-jumper', label: 'Crew neck jumper', x: 0.51, y: 0.8, keywords: ['crew neck', 'crewneck', 'crew-neck', 'jumper', 'sweater'] },
  { id: 'roll-neck', label: 'Roll neck', x: 0.55, y: 0.56, keywords: ['roll neck', 'rollneck', 'roll-neck', 'turtleneck', 'turtle neck'] },
  { id: 'oxford-shirt', label: 'Oxford shirt', x: 0.59, y: 0.84, keywords: ['oxford shirt', 'oxford-shirt', 'ocbd', 'oxford button'] },
  { id: 'chelsea-boot', label: 'Chelsea boot', x: 0.61, y: 0.64, keywords: ['chelsea'] },
  { id: 'penny-loafer', label: 'Penny loafer', x: 0.67, y: 0.78, keywords: ['loafer'] },
  { id: 'wool-trousers', label: 'Wool trousers', x: 0.69, y: 0.6, keywords: ['wool trouser', 'flannel trouser', 'dress trouser', 'tropical wool'] },
  { id: 'blazer', label: 'Blazer', x: 0.77, y: 0.58, keywords: ['blazer', 'sports jacket', 'sport coat'] },
  { id: 'overcoat', label: 'Overcoat', x: 0.81, y: 0.36, keywords: ['overcoat', 'topcoat', 'chesterfield'] },
  { id: 'cap-toe-oxford', label: 'Cap-toe oxford', x: 0.85, y: 0.44, keywords: ['cap-toe', 'cap toe', 'oxford shoe', 'balmoral', 'derby', 'brogue'] },
  { id: 'suit', label: 'Suit', x: 0.93, y: 0.12, keywords: ['suit'] },
];

// ---------------------------------------------------------------------------
// Matching — owned types and The Edit's flagged gaps.
// ---------------------------------------------------------------------------

function matchesType(text: string, type: PieceMapType): boolean {
  return type.keywords.some((k) => text.includes(k));
}

/** The types covered by something the user owns — keyword match on each
 * piece's own name/slot/category text, same approach as the world index's
 * ownership check. */
function ownedTypeIds(pieces: WardrobePiece[]): Set<string> {
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
 * stored assessment (never triggers a model call), matched onto the plotted
 * types, ranked in recommendation order, capped at three (20a). */
function gapRanks(ownedIds: Set<string>): Map<string, number> {
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

const ORDINALS = ['1st', '2nd', '3rd'];

// ---------------------------------------------------------------------------
// Shared plot chrome
// ---------------------------------------------------------------------------

const axisType: React.CSSProperties = {
  fontFamily: 'var(--space-font-heading)',
  fontSize: '10px',
  letterSpacing: '0.14em',
  fill: 'var(--color-neutral-600,#856c51)',
};

const WALNUT = 'var(--color-text,#241a12)';
const ACCENT = 'var(--color-accent,#a8712c)';
const PAPER = 'var(--color-paper,#fbf8f1)';

function LegendDot({ kind }: { kind: 'owned' | 'none' | 'gap' }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="inline-block align-[-2px]">
      <circle
        cx="7"
        cy="7"
        r="5"
        fill={kind === 'owned' ? WALNUT : kind === 'gap' ? ACCENT : PAPER}
        stroke={kind === 'gap' ? ACCENT : WALNUT}
        strokeWidth="1.4"
      />
    </svg>
  );
}

const legendItemCls = 'inline-flex items-center gap-1.5';
const legendTextStyle: React.CSSProperties = {
  fontFamily: 'var(--space-font-heading)',
  fontSize: '10px',
  letterSpacing: '0.13em',
  color: 'var(--color-neutral-700,#634e38)',
};

// ---------------------------------------------------------------------------
// The view — map or quadrant, one component (the toggle lives in the Index).
// ---------------------------------------------------------------------------

export function PiecesMap({ pieces, view }: { pieces: WardrobePiece[]; view: 'map' | 'quadrant' }) {
  const quadrant = view === 'quadrant';
  const narrow = useIsNarrow();

  // Muted registers — the local mirror seeds instantly, the DB read
  // reconciles, and the coverage-prefs event keeps it live (same contract as
  // The Edit's map).
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
  const formalMuted = muted.includes('formal');

  const owned = useMemo(() => ownedTypeIds(pieces), [pieces]);
  const gaps = useMemo(() => gapRanks(owned), [owned]);

  // THE QUADRANT DROPS THE EXPLORATORY SET (20a): only what you own plus
  // the flagged gaps. The map plots the whole slice of the taxonomy.
  const plotted = useMemo(() => {
    const base = PIECE_MAP_TYPES.filter((t) => (quadrant ? owned.has(t.id) || gaps.has(t.id) : true));
    if (!narrow || quadrant || base.length <= 8) return base;
    // MOBILE (M13): the map keeps eight points — gaps first, then owned by
    // versatility, then the most versatile of the rest.
    const ranked = [...base].sort((a, b) => {
      const aw = gaps.has(a.id) ? 2 : owned.has(a.id) ? 1 : 0;
      const bw = gaps.has(b.id) ? 2 : owned.has(b.id) ? 1 : 0;
      if (aw !== bw) return bw - aw;
      return b.y - a.y;
    });
    return ranked.slice(0, 8);
  }, [quadrant, owned, gaps, narrow]);

  const W = 760;
  const H = 520;
  const PAD = { top: 34, right: 30, bottom: 46, left: 40 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (v: number) => PAD.left + v * plotW;
  const y = (v: number) => H - PAD.bottom - v * plotH;

  const zoom = usePinchZoom(W, H);

  // WHAT EACH CORNER HOLDS — counts + names, not scorecards (20a).
  const corners = useMemo(() => {
    const count = (fx: (t: PieceMapType) => boolean) => {
      const inCorner = PIECE_MAP_TYPES.filter((t) => (owned.has(t.id) || gaps.has(t.id)) && fx(t));
      return {
        yours: inCorner.filter((t) => owned.has(t.id)).length,
        gapCount: inCorner.filter((t) => gaps.has(t.id)).length,
      };
    };
    const text = (c: { yours: number; gapCount: number }, mutedHere: boolean) => {
      if (mutedHere) return c.yours === 0 && c.gapCount === 0 ? 'None · muted' : `${c.yours} yours · muted`;
      if (c.yours === 0 && c.gapCount === 0) return 'None';
      const bits: string[] = [];
      if (c.yours > 0) bits.push(`${c.yours} yours`);
      if (c.gapCount > 0) bits.push(`${c.gapCount} gap${c.gapCount === 1 ? '' : 's'}`);
      return bits.join(' · ');
    };
    return [
      {
        label: 'Workhorses',
        sub: 'Casual · many outfits',
        counts: text(count((t) => t.x < 0.5 && t.y >= 0.5), false),
        cx: PAD.left + plotW * 0.25,
        cy: PAD.top + 16,
      },
      {
        label: 'The backbone',
        sub: 'Smart · many outfits',
        counts: text(count((t) => t.x >= 0.5 && t.y >= 0.5), false),
        cx: PAD.left + plotW * 0.75,
        cy: PAD.top + 16,
      },
      {
        label: 'Weekend specifics',
        sub: 'Casual · few outfits',
        counts: text(count((t) => t.x < 0.5 && t.y < 0.5), false),
        cx: PAD.left + plotW * 0.25,
        cy: H - PAD.bottom - 22,
      },
      {
        // A REGISTER THE USER HAS MUTED reads “muted”, never “0 of 12” —
        // the same rule as The Edit.
        label: 'Occasion only',
        sub: 'Smart · few outfits',
        counts: text(count((t) => t.x >= 0.5 && t.y < 0.5), formalMuted),
        cx: PAD.left + plotW * 0.75,
        cy: H - PAD.bottom - 22,
      },
    ];
  }, [owned, gaps, formalMuted, plotW, plotH]);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h4 className={typography.color.primary} style={{ fontFamily: 'var(--space-font-heading)', fontWeight: 400, fontSize: '26px', lineHeight: 1.15 }}>
          {quadrant ? 'The same axes, cut in four' : 'Where the pieces sit'}
        </h4>
        <span className="hab-kicker text-[var(--color-neutral-600,#856c51)] tabular-nums" style={{ letterSpacing: '0.14em' }}>
          {quadrant ? 'Yours + the gaps' : `${plotted.length} of ${PIECE_MAP_TYPES.length} types`}
        </span>
      </div>
      <p className={typography.color.primary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', lineHeight: 1.6, maxWidth: '64ch', marginTop: '6px' }}>
        {quadrant
          ? 'The quadrant drops the exploratory set and plots only what you own plus the flagged gaps — then names the four regions and counts them. A map shows where things are; a quadrant tells you which corner you live in.'
          : 'Types placed by how formal they read and how many outfits they enter. Filled dots are types you own; the accented ones are the gaps from The Edit, drawn where they’d land.'}
      </p>

      {/* The legend — the three dot states. */}
      <div className="flex items-center gap-4 flex-wrap mt-3" aria-hidden="true">
        <span className={legendItemCls}><LegendDot kind="owned" /><span style={legendTextStyle}>YOU OWN ONE</span></span>
        <span className={legendItemCls}><LegendDot kind="none" /><span style={legendTextStyle}>YOU DON’T</span></span>
        <span className={legendItemCls}><LegendDot kind="gap" /><span style={legendTextStyle}>A GAP BEAU FLAGS</span></span>
        {zoom.zoomed && (
          <button type="button" onClick={zoom.reset} className="hover:underline" style={{ ...legendTextStyle, color: ACCENT }}>
            RESET ZOOM
          </button>
        )}
      </div>

      <div className="mt-4 border border-[var(--color-divider,rgba(59,43,29,0.18))] bg-[var(--color-paper,#fbf8f1)] p-4">
        <svg
          ref={zoom.svgRef}
          viewBox={zoom.viewBox}
          {...zoom.handlers}
          className="w-full h-auto"
          style={{ touchAction: zoom.touchAction }}
          role="img"
          aria-label={`Garment types plotted — formality across, outfit versatility up${quadrant ? ', cut into four named quadrants' : ''}`}
        >
          <line x1={PAD.left} y1={H - PAD.bottom} x2={W - PAD.right} y2={H - PAD.bottom} stroke="var(--color-divider,rgba(59,43,29,0.3))" strokeWidth="1" />
          <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={H - PAD.bottom} stroke="var(--color-divider,rgba(59,43,29,0.3))" strokeWidth="1" />
          <text x={PAD.left} y={PAD.top - 12} style={axisType}>UP · HOW MANY OUTFITS IT ENTERS</text>
          <text x={PAD.left} y={PAD.top + 2} style={axisType}>MOST OUTFITS</text>
          <text x={PAD.left} y={H - PAD.bottom - 6} style={axisType}>ONE OUTFIT</text>
          <text x={PAD.left + 4} y={H - 14} style={axisType}>ACROSS · HOW FORMAL IT READS →</text>
          <text x={PAD.left + 4} y={H - PAD.bottom + 16} style={axisType}>CASUAL</text>
          <text x={W - PAD.right} y={H - PAD.bottom + 16} textAnchor="end" style={axisType}>FORMAL</text>

          {quadrant ? (
            <>
              {/* The two midlines cut the plot in four. */}
              <line x1={x(0.5)} y1={PAD.top} x2={x(0.5)} y2={H - PAD.bottom} stroke="var(--color-divider,rgba(59,43,29,0.25))" strokeWidth="1" strokeDasharray="4 4" />
              <line x1={PAD.left} y1={y(0.5)} x2={W - PAD.right} y2={y(0.5)} stroke="var(--color-divider,rgba(59,43,29,0.25))" strokeWidth="1" strokeDasharray="4 4" />
              {/* QUADRANT LABELS — counts + names, not scorecards (20a). */}
              {corners.map((c) => (
                <g key={c.label}>
                  <text x={c.cx} y={c.cy} textAnchor="middle" style={{ ...axisType, fill: 'var(--color-accent-700,#7c4a17)' }}>{c.label.toUpperCase()}</text>
                  <text x={c.cx} y={c.cy + 12} textAnchor="middle" style={axisType}>{c.sub.toUpperCase()}</text>
                  <text x={c.cx} y={c.cy + 24} textAnchor="middle" style={{ ...axisType, fill: WALNUT }}>{c.counts.toUpperCase()}</text>
                </g>
              ))}
            </>
          ) : (
            /* Quiet quarter gridlines keep the map readable while exploring. */
            <>
              <line x1={x(0.5)} y1={PAD.top} x2={x(0.5)} y2={H - PAD.bottom} stroke="var(--color-divider,rgba(59,43,29,0.12))" strokeWidth="1" />
              <line x1={PAD.left} y1={y(0.5)} x2={W - PAD.right} y2={y(0.5)} stroke="var(--color-divider,rgba(59,43,29,0.12))" strokeWidth="1" />
            </>
          )}

          {plotted.map((t) => {
            const isOwned = owned.has(t.id);
            const gapRank = gaps.get(t.id);
            const cx = Math.max(PAD.left + 10, Math.min(W - PAD.right - 10, x(t.x)));
            const cy = Math.max(PAD.top + 10, Math.min(H - PAD.bottom - 10, y(t.y)));
            const status = isOwned ? 'you own one' : gapRank ? `gap · ${ORDINALS[gapRank - 1] || `${gapRank}th`}` : 'you don’t own one';
            return (
              <g key={t.id}>
                <title>{`${t.label} — ${status}`}</title>
                <circle
                  cx={cx}
                  cy={cy}
                  r="6.5"
                  fill={isOwned ? WALNUT : gapRank ? ACCENT : PAPER}
                  stroke={gapRank ? ACCENT : WALNUT}
                  strokeWidth="1.4"
                />
                <text x={cx + 10} y={cy + 4} style={{ fontFamily: 'var(--space-font-family)', fontSize: '11.5px', fill: WALNUT }}>
                  {t.label}
                </text>
                {gapRank && (
                  <text x={cx + 10} y={cy + 16} style={{ ...axisType, fill: 'var(--color-accent-700,#7c4a17)' }}>
                    GAP · {(ORDINALS[gapRank - 1] || `${gapRank}TH`).toUpperCase()}
                  </text>
                )}
              </g>
            );
          })}

          {quadrant && plotted.length === 0 && (
            <text x={W / 2} y={H / 2} textAnchor="middle" style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', fill: 'var(--color-neutral-600,#856c51)' }}>
              Nothing to place yet — log a few pieces and the quadrant fills in.
            </text>
          )}
        </svg>

        <p className="mt-2 text-[var(--color-neutral-600,#856c51)]" style={{ fontFamily: 'var(--space-font-family)', fontSize: '11.5px', lineHeight: 1.5 }}>
          {narrow && !quadrant && plotted.length < PIECE_MAP_TYPES.length
            ? `${plotted.length} of ${PIECE_MAP_TYPES.length} types at this width — pinch to zoom; the full set is one tap away in the list. `
            : ''}
          {quadrant
            ? formalMuted
              ? 'Occasion only reads “muted” because you’ve told Beau you don’t dress formal — the quadrant honours that rather than scoring you on it.'
              : 'Fewer points, fixed axes, named corners, counts — not exploratory: it delivers a reading.'
            : 'The useful region is the top middle — pieces that enter many outfits without committing to a register. That band is where the flagged gaps tend to sit, which is the visual argument for their order.'}
        </p>
      </div>
    </div>
  );
}
