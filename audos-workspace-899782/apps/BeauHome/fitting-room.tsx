/**
 * THE FITTING — built to the reference design (Design5 / “Ethaion · The
 * Fitting”), page for page. The old plain-scroll board (its action bar,
 * paste-a-link box, source and category filters, trip mode, saved section)
 * is GONE: this screen is the reference and nothing else.
 *
 * Top to bottom, exactly as the reference sets it:
 *
 *   1 THE MASTHEAD — the SHARED tab masthead (tab-header.tsx): “The
 *     Fitting”, its one-line standfirst, and the five OCCASIONS as one
 *     segmented control in its aside: Office · Smart Casual · Weekend ·
 *     Formal · Evening.
 *   2 THE CONTEXT BAR — location · temperature · conditions at the left,
 *     “Change location” and “The Fitting · [day]” at the right.
 *   3 THE BAND, three columns:
 *       · the DAY RAIL — Mon 1 … Sun 7, today live;
 *       · THE FITTING — season · occasion, the colour harmony, the outfit
 *         itself, then its name, the build it was drawn to, and Beau's
 *         paragraph;
 *       · THE NOTES — Swap alternatives (Style notes and What not to do
 *         were cut by the founder, August 2026).
 *   4 THE BOARD — the three shelves the fitting is dressed from, as tiles.
 *   5 THE LEGEND — Anchors · Neutrals · Accents, and the one line that says
 *     how the screen answers a tap.
 *
 * THE ONE DEPARTURE FROM THE REFERENCE, and it is deliberate: where the
 * reference draws a silhouette, this draws the REAL OUTFIT — the actual
 * background-removed cutouts of the man's own garments, composed in their
 * zones on the flat-lay canvas (flat-view · flat-lay-board), draggable, each
 * named at the edge on a gold leader. No figure, no mannequin, ever.
 *
 * TAP A DAY OR AN OCCASION AND THE FITTING RE-DRESSES. Every (day ×
 * occasion) pair is one composed look: fitting-ai composes it from the
 * OWNED wardrobe, filtered against the real weather, and fitting-brief
 * writes the editorial around it. Both are cached at module level, so
 * moving around the week — and leaving the tab and coming back — costs
 * nothing. Composing today's look also updates the shared Today board, so
 * The Ledger's card and this tab never disagree.
 *
 * Pieces are still put on and taken off by hand: tap a shelf tile to dress
 * the board with it, tap it again (or use the × on the board) to take it
 * off. Anything that isn't yours draws dashed. Every “Try this on” handoff
 * from elsewhere in the app still lands the piece on this board.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, X } from 'lucide-react';
import {
  RESERVE_CHANGED_EVENT,
  buildCuratedFeed,
  categoryLabel,
  fetchMaterials,
  type CategoryBudget,
  type RadarItem,
  type StylePrefs,
  type StyleProfile,
  type WardrobePiece,
} from './profile-data';
import { hierarchyGate, itemPassesGate } from './wardrobe-model';
import { CATEGORY_ORDER, categoryRank } from './category-order';
import { categoryName } from './index-model';
import {
  FITTING_BOARD_EVENT,
  FITTING_PIECE_EVENT,
  consumePendingFittingBoard,
  consumePendingFittingPiece,
  resolveGarmentImage,
  type FittingBoardHandoff,
  type FittingPiece,
} from './fitting-room-state';
import { StyledOutfitBoard, boardPieceFrom, composeFlatLayBoard, type BoardPiece } from './flat-view';
import { bodyOrderRank } from './body-order';
import { MONO, usePlexMono } from './mono-type';
import {
  CUTOUT_BROKEN_EVENT,
  flatLayAssetForShelf,
  isBrokenCutoutUrl,
  isTransparentCutout,
  peekBoardCutout,
  peekFlatLayAsset,
} from './photo-enhance';
import { cutoutVariantFor } from './cutout-server';
import { flatLayAssetForProduct, ingestProductInBackground } from './flat-lay-sourcing';
import {
  cappedImageUrl,
  peekProductImage,
  productImageSrcSet,
  productImageWidth,
  resolveProductImage,
} from './product-images';
import { primaryBuyUrl } from './rail-subcategories';
import { composeFittingBoard } from './fitting-ai';
import { peekTodayBoard, rememberTodayBoard } from './today-board';
import { getSharedWeather, sharedWeatherPromptLine } from './weather-context';
import { fetchPieceWarmth, type PieceWarmth } from './warmth-model';
import { composeFittingCopy, type FittingCopy } from './fitting-brief';
import {
  ACCENT,
  ACCENT_DEEP,
  CANVAS,
  HAIRLINE,
  MUTED,
  PAGE,
  PAPER,
  SERIF,
  WALNUT,
  body,
} from './index-style';
import { openInBeausPicks } from './edit-links';
import { TabHeader } from './tab-header';
import {
  DayRail,
  FittingContextBar,
  FooterLegend,
  HarmonyBars,
  SectionRule,
  SegmentedTabs,
  Shelf,
  ShelfEmpty,
  SwapRow,
  label as fitLabel,
  swatchForPiece,
  type RailDay,
  type SegmentedItem,
} from './fitting-design';

/** Beau's voice colour — his own shelf on this screen. */
const OXBLOOD = 'var(--color-accent-2,#7d2a24)';

/** The week, Monday first — the rail's order, and the reference's. */
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** The five occasions of the reference's segmented control. */
const OCCASIONS: Array<{ key: string; label: string; sub: string }> = [
  { key: 'office', label: 'Office', sub: 'Business professional' },
  { key: 'smart', label: 'Smart Casual', sub: 'Relaxed but composed' },
  { key: 'weekend', label: 'Weekend', sub: 'Leisure & errands' },
  { key: 'formal', label: 'Formal', sub: 'Events & ceremony' },
  { key: 'evening', label: 'Evening', sub: 'Dinner & culture' },
];

/** When the Fitting's Reserve shelf rows last arrived — re-activating the
 * tab refreshes them only past this staleness window. */
const FITTING_RESERVE_STALE_MS = 60_000;
let fittingReserveFetchedAt = 0;

/** Roughly how wide one shelf tile renders, in CSS px — only used to pick a
 * delivered file size, never to lay anything out. */
const SHELF_TILE_WIDTH = 200;
const SHELF_TILE_SIZES = '(min-width: 640px) 156px, 132px';
/** The reference's tile photograph — 156 × 168. */
const TILE_PHOTO_HEIGHT = 168;

// ---------------------------------------------------------------------------
// THE COMPOSED WEEK — one look per (day × occasion), remembered at MODULE
// level so tapping around the week, and leaving the tab and coming back,
// never re-runs a model call.
// ---------------------------------------------------------------------------

interface FittingEntry {
  /** Every piece on the board, in the order they were added. */
  board: BoardPiece[];
  /** Beau's one line from the composition. */
  reasoning: string | null;
  /** The honest note when the wardrobe cannot dress the day properly. */
  gapNote: string | null;
  /** The editorial around the look — null until it lands. */
  copy: FittingCopy | null;
}

const fittingMemory: Record<string, FittingEntry> = {};
const EMPTY_BOARD: BoardPiece[] = [];
const EMPTY_ENTRY: FittingEntry = { board: EMPTY_BOARD, reasoning: null, gapNote: null, copy: null };

/** The season the fitting is dressed for — read from the month. */
function seasonOf(date: Date): string {
  const m = date.getMonth();
  if (m <= 1 || m === 11) return 'Winter';
  if (m <= 4) return 'Spring';
  if (m <= 7) return 'Summer';
  return 'Autumn';
}

// ---------------------------------------------------------------------------
// THE SHELF TILE
//
// NO BLEND TRICKS AND NO GROUND, EVER. A STORED transparent cutout from the
// ingestion pipeline is drawn bare on the shelf's own paper; a photograph the
// pipeline has not cut yet is never shown raw and never plated on a white box
// — the tile simply holds its space until the real cutout lands.
//
// The image chain is what makes Reserve pieces and Beau's picks show the REAL
// product's photography instead of a named empty box:
//   1. a direct garment image (owned pieces, already cut out);
//   2. the retailer's own og:image, via the product URL;
//   3. the real product image web-resolved by brand + name (product-images);
//   4. nothing — never an illustration, never an unrelated image.
// A URL that RESOLVES but fails to LOAD (retailers routinely block hotlinked
// og:images) advances to the NEXT source instead of dead-ending.
// ---------------------------------------------------------------------------

function ShelfThumb({ piece }: { piece: FittingPiece }) {
  const failed = useRef<Set<string>>(new Set());
  const [img, setImg] = useState((piece.garmentImageUrl || '').trim());

  const resolveNext = async (): Promise<string> => {
    const bad = failed.current;
    const direct = (piece.garmentImageUrl || '').trim();
    if (direct && !bad.has(direct)) return direct;
    const og = await resolveGarmentImage(piece).catch(() => '');
    if (og && !bad.has(og)) return og;
    const photo = await resolveProductImage({ name: piece.name, brand: piece.brand, productUrl: piece.productUrl }, bad).catch(() => '');
    if (photo) return photo;
    return '';
  };

  useEffect(() => {
    let active = true;
    failed.current = new Set();
    const owned = piece.key.startsWith('owned-');
    // WHICH PHOTOGRAPH GETS CUT is not this grid's decision:
    // ingestProductInBackground (flat-lay-sourcing) is the ONE shared rule —
    // resolve the ranked candidates, classify them, select the person-free
    // plain-ground framing, then ingest, all on the idle queue.
    const applyCutout = (url: string) => {
      if (!url || owned || isTransparentCutout(url)) return;
      ingestProductInBackground(
        {
          name: piece.name,
          brand: piece.brand,
          productUrl: piece.productUrl,
          category: piece.category,
          preferred: url,
        },
        (asset) => {
          if (active && asset.url !== url) setImg(asset.url);
        },
      );
    };
    const direct = (piece.garmentImageUrl || '').trim();
    if (direct) {
      setImg(peekBoardCutout(direct) || direct);
      applyCutout(direct);
      return;
    }
    const peeked = peekProductImage({ name: piece.name, brand: piece.brand });
    setImg(peeked ? peekBoardCutout(peeked) || peeked : '');
    void resolveNext().then((url) => {
      if (!active) return;
      setImg(url ? peekBoardCutout(url) || url : '');
      applyCutout(url);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piece]);

  const onBroken = () => {
    if (img) failed.current.add(img);
    setImg('');
    void resolveNext().then((url) => {
      if (url) setImg(url);
    });
  };

  const width = productImageWidth(SHELF_TILE_WIDTH);
  const srcSet = img ? productImageSrcSet(img, width) : '';
  const cut = !!img && isTransparentCutout(img);
  const shownImg = cut ? cutoutVariantFor(img, 'tile') : img;
  // The shelves live BELOW the fold — the canvas is the only thing on
  // screen when the tab opens. Eager-loading three shelves of product
  // photography competed with the board for bandwidth and main thread on
  // every visit, which is a large part of what made this tab feel slow.
  // The browser now fetches a tile when it is close to being scrolled to.
  return (
    <span
      className="block w-full"
      style={{
        height: `${TILE_PHOTO_HEIGHT}px`,
        background: 'transparent',
        border: 'none',
        padding: 0,
        position: 'relative',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {cut && (
        <img
          src={cappedImageUrl(shownImg, width)}
          {...(srcSet ? { srcSet, sizes: SHELF_TILE_SIZES } : null)}
          alt={piece.name}
          loading="lazy"
          decoding="async"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          onError={onBroken}
        />
      )}
    </span>
  );
}

/** One tile on the board's shelves — the reference's 156 × 168 photograph,
 * the name in Cormorant beneath it and the maker in small caps under that.
 * A piece already on the board is ringed in the accent and tagged. */
/**
 * `onToggle` takes the piece rather than being a per-tile closure: a fresh
 * arrow function on every render made every tile a new set of props and
 * defeated the memo entirely, so all three shelves — and their images —
 * re-rendered on every board, label or composing state change.
 */
const ShelfCard = memo(function ShelfCard({
  piece,
  selected,
  onToggle,
}: {
  piece: FittingPiece;
  selected: boolean;
  onToggle: (piece: FittingPiece) => void;
}) {
  return (
    <div className="w-[132px] sm:w-[156px] flex-shrink-0">
      <button
        type="button"
        onClick={() => onToggle(piece)}
        aria-pressed={selected}
        className="block w-full text-left group relative"
        style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', userSelect: 'none' }}
        title={selected ? `Take it off board — ${piece.name}` : `Put it on board — ${piece.name}`}
        aria-label={`${selected ? 'Take off board' : 'Put on board'}: ${piece.name}${piece.brand ? ` by ${piece.brand}` : ''}`}
      >
        <span
          className="relative block"
          style={{
            outline: selected ? `1px solid ${ACCENT}` : '1px solid transparent',
            outlineOffset: '6px',
            opacity: selected ? 1 : 0.92,
          }}
        >
          <ShelfThumb piece={piece} />
          {selected && (
            <span
              className="absolute left-0 top-0 z-10"
              style={{ ...fitLabel(8, '#f4eee3', '0.14em'), background: WALNUT, padding: '4px 8px' }}
              aria-hidden="true"
            >
              On board
            </span>
          )}
        </span>
        <span
          className="block group-hover:underline break-words"
          style={{ fontFamily: SERIF, fontSize: 'max(var(--eth-serif, 0px), 17px)', lineHeight: 1.25, color: WALNUT, marginTop: '10px' }}
        >
          {piece.name}
        </span>
        <span className="block break-words" style={{ ...fitLabel(8.5, ACCENT, '0.14em'), marginTop: '2px' }}>
          {piece.brand || '\u2014'}
        </span>
      </button>
      {piece.productUrl && (
        <a
          href={piece.productUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 hover:underline"
          style={{ ...fitLabel(8, ACCENT_DEEP, '0.1em'), marginTop: '6px' }}
          title={`View the product page — ${piece.name}`}
        >
          View product <span aria-hidden="true" style={{ fontSize: 'max(var(--eth-micro, 0px), 9px)', lineHeight: 1 }}>↗</span>
        </a>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// THE BOARD'S CALLOUTS — the reference names every piece around the edge of
// the composition on a leader. Each label is MEASURED against the piece it
// names (read off the DOM by `data-piece-key`), so it sits on the same line
// as its garment at every width and after every drag.
// ---------------------------------------------------------------------------

const annMono: React.CSSProperties = { fontFamily: MONO, fontSize: 'max(var(--eth-micro, 0px), 7px)', letterSpacing: '0.08em', textTransform: 'uppercase' };

/** Every callout box draws at exactly this width — the SVG leader lines
 * start from its inner edge, so the two must agree. */
const LABEL_BOX_W = 165;

/** The zone a piece lands in — the same reading the flat-lay makes. */
function zoneLabelFor(piece: BoardPiece): string {
  const text = `${piece.category || ''} ${piece.name || ''}`.toLowerCase();
  if (/\bsocks?\b/.test(text)) return 'Feet';
  if (/glasses|sunglass/.test(text)) return 'Eyewear';
  if (/\btie\b|scarf|cravat|neckerchief|ascot/.test(text)) return 'Neck';
  if (/watch|bracelet|cufflink/.test(text)) return 'Wrist';
  const rank = bodyOrderRank({ category: piece.category, slot: null, name: piece.name });
  if (rank === 0) return 'Head';
  if (/\bbelt\b|braces/.test(text)) return 'Waist';
  if (rank === 1) return 'Outer layer';
  if (rank === 2 || rank === 3) return 'Mid layer';
  if (rank === 4) return 'Top';
  if (rank === 5) return 'Bottom';
  if (rank === 6) return 'Feet';
  return 'Carry';
}

/** Only pieces that aren't yours carry a status line — they draw dashed. */
function boardStatusOf(piece: BoardPiece): string | null {
  if (piece.key.startsWith('owned-')) return null;
  if (piece.key.startsWith('curated-')) return 'Beau\u2019s pick';
  if (piece.key.startsWith('radar-')) return 'Saved · not yours yet';
  return 'Not yours yet';
}

interface EdgeLabel {
  piece: BoardPiece;
  /** PIXELS from the rail's top — the label's own CENTRE. */
  top: number;
  side: 'l' | 'r';
  /** The named piece's LIVE centre in rail pixels — the leader line's far
   * end. Re-measured on every drag frame, so the traced line follows the
   * garment wherever it is dragged, even when the stack has prised the
   * label box itself off the garment's own line. */
  targetX: number;
  targetY: number;
  /** Half the piece's rendered box, in pixels — the leader line stops at
   * this box plus LEADER_GAP of clear air, never touching the garment. */
  halfW: number;
  halfH: number;
}

interface MeasuredPiece {
  piece: BoardPiece;
  centre: number;
  centreX: number;
  halfW: number;
  halfH: number;
  side: 'l' | 'r';
}

function clampLabelCentre(value: number, low: number, high: number): number {
  return high < low ? (low + high) / 2 : Math.min(high, Math.max(low, value));
}

/** ≈1/3cm of clear air between the leader line's end and the garment
 * (founder's correction, August 2026: “not let the line touch the piece”). */
const LEADER_GAP = 13;

/** Where the leader line ENDS: walk from the garment's centre toward the
 * label box, leave the garment's own bounding box, then LEADER_GAP px more —
 * so the line points at the piece without ever crossing onto it. */
function leaderEnd(label: EdgeLabel, x1: number, y1: number): { x: number; y: number } {
  const dx = x1 - label.targetX;
  const dy = y1 - label.targetY;
  const len = Math.hypot(dx, dy);
  if (len < 1) return { x: x1, y: y1 };
  const tEdge = Math.min(
    Math.abs(dx) > 0.01 ? label.halfW / Math.abs(dx) : Infinity,
    Math.abs(dy) > 0.01 ? label.halfH / Math.abs(dy) : Infinity,
  );
  const t = Math.min(1, (Number.isFinite(tEdge) ? tEdge : 0) + LEADER_GAP / len);
  return { x: label.targetX + dx * t, y: label.targetY + dy * t };
}

/**
 * THE MEASURED HEIGHT OF ONE CALLOUT BOX — and it has to be measured
 * GENEROUSLY, because this number is the only thing keeping two labels off
 * each other. The old estimate came out ~13px short of what the box really
 * renders (it forgot the 8px vertical padding, the 2px border and the two
 * 3px row margins), so any two pieces sitting close together on the canvas
 * had their brand/category boxes drawn overlapping.
 *
 * The box is 165px wide with 8px of horizontal padding, so a 12px Cormorant
 * name fits roughly 22 characters to the line.
 */
function labelHeight(piece: BoardPiece): number {
  const NAME_CHARS_PER_LINE = 22;
  const nameLines = Math.max(1, Math.ceil((piece.name || '').length / NAME_CHARS_PER_LINE));
  const paddingAndBorder = 10; // 4px + 4px padding, 1px + 1px border
  const zoneRow = 12; // the small-caps zone line
  const nameRows = 3 + nameLines * 15; // marginTop + one 12px serif line each
  const metaRow = 3 + 12; // marginTop + category · maker
  const statusRow = boardStatusOf(piece) ? 2 + 11 : 0;
  return paddingAndBorder + zoneRow + nameRows + metaRow + statusRow;
}

/**
 * Each label's centre IS its piece's centre. The only departure is when two
 * blocks would physically overlap: the pair is then prised apart
 * symmetrically, so the run stays centred on the pieces it names.
 */
function stackLabels(items: MeasuredPiece[], railHeight: number): EdgeLabel[] {
  const sorted = [...items].sort((a, b) => a.centre - b.centre);
  const centres = sorted.map((item) => item.centre);
  for (let pass = 0; pass < 4; pass += 1) {
    let moved = false;
    for (let i = 1; i < sorted.length; i += 1) {
      // +10px of clear air between two boxes, so neighbouring callouts read
      // as separate plates rather than one crowded block.
      const need = labelHeight(sorted[i - 1].piece) / 2 + labelHeight(sorted[i].piece) / 2 + 10;
      const have = centres[i] - centres[i - 1];
      if (have >= need) continue;
      const push = (need - have) / 2;
      centres[i - 1] -= push;
      centres[i] += push;
      moved = true;
    }
    if (!moved) break;
  }
  return sorted.map((item, i) => ({
    piece: item.piece,
    // The box stays ON the rail even when a drag pushes the run past an
    // edge — the angled leader still traces it back to its garment.
    top: clampLabelCentre(centres[i], labelHeight(item.piece) / 2, railHeight - labelHeight(item.piece) / 2),
    side: item.side,
    targetX: item.centreX,
    targetY: item.centre,
    halfW: item.halfW,
    halfH: item.halfH,
  }));
}

function sameLabels(a: EdgeLabel[], b: EdgeLabel[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (l, i) =>
      l.piece.key === b[i].piece.key &&
      l.side === b[i].side &&
      Math.abs(l.top - b[i].top) < 0.5 &&
      Math.abs(l.targetX - b[i].targetX) < 0.5 &&
      Math.abs(l.targetY - b[i].targetY) < 0.5,
  );
}

/** One callout: the reference's boxed label on a gold leader — the zone in
 * small caps, the piece's colour chip beside its name, then category ·
 * maker, and the status line on anything that isn't yours. */
function EdgeLabelBlock({ label }: { label: EdgeLabel }) {
  const { piece, side } = label;
  const status = boardStatusOf(piece);
  const swatch = swatchForPiece(piece.name, null);
  const text = (
    <span
      className="block min-w-0"
      style={{
        textAlign: side === 'l' ? 'right' : 'left',
        // ONE FIXED WIDTH for every callout box (founder's correction,
        // August 2026): widened by 50% from the reference's 110px, and no
        // longer sized to its own text — every clothing text box on the
        // canvas draws at exactly this width, none wider or narrower.
        width: `${LABEL_BOX_W}px`,
        flexShrink: 0,
        boxSizing: 'border-box',
        background: PAPER,
        border: `1px solid ${HAIRLINE}`,
        padding: '4px 8px',
      }}
    >
      <span className="block" style={{ ...annMono, color: MUTED }}>{zoneLabelFor(piece)}</span>
      <span
        className="flex items-baseline gap-1.5"
        style={{ marginTop: '3px', flexDirection: side === 'l' ? 'row-reverse' : 'row' }}
      >
        {swatch && (
          <span
            aria-hidden="true"
            style={{ width: '9px', height: '9px', flexShrink: 0, background: swatch, border: '1px solid rgba(0,0,0,0.12)' }}
          />
        )}
        <span style={{ fontFamily: SERIF, fontSize: 'max(var(--eth-serif, 0px), 12px)', lineHeight: 1.2, color: WALNUT }}>{piece.name}</span>
      </span>
      <span className="block" style={{ ...annMono, color: MUTED, marginTop: '3px' }}>
        {[categoryLabel(piece.category || '') || null, piece.brand].filter(Boolean).join(' · ') || '—'}
      </span>
      {status && (
        <span className="block" style={{ ...annMono, color: piece.key.startsWith('curated-') ? OXBLOOD : ACCENT_DEEP, marginTop: '2px' }}>
          {status}
        </span>
      )}
    </span>
  );
  // The leader itself is drawn by the AnnotatedBoard's SVG layer — a traced
  // line from this box's inner edge to the garment's live centre — so the
  // block is just the box, pinned to its rail's outer edge.
  return (
    <div
      className="absolute flex items-center"
      style={{
        top: `${label.top}px`,
        transform: 'translateY(-50%)',
        ...(side === 'l' ? { left: 0 } : { right: 0 }),
      }}
    >
      {text}
    </div>
  );
}

/**
 * THE BOARD, NAMED IN PLAIN TEXT (layout pass, August 2026). The boxed
 * callouts and their SVG leader lines are gone — no measuring, no
 * observers, no overlay. The fitting draws clean, and the pieces are named
 * as a simple inline list beneath the board on every width — the treatment
 * the phone always used. The measured callout board below
 * (LegacyAnnotatedBoard) is retired and has no call site.
 */
function AnnotatedBoard({ pieces, children }: { pieces: BoardPiece[]; children: React.ReactNode }) {
  const placed = useMemo(() => composeFlatLayBoard(pieces), [pieces]);
  if (pieces.length === 0) return <>{children}</>;
  return (
    <div>
      <div className="min-w-0">{children}</div>
      {/* The zone list under the canvas is a desktop reading — on a phone
          the canvas speaks for itself (founder's correction, August 2026). */}
      <div className="hidden sm:block pt-3">
        {placed.map(({ piece }) => {
          const p = piece as BoardPiece;
          const status = boardStatusOf(p);
          return (
            <div key={p.key} className="flex items-baseline gap-2.5 flex-wrap" style={{ padding: '3px 0' }}>
              <span style={{ ...annMono, color: MUTED, width: '102px', flexShrink: 0 }}>{zoneLabelFor(p)}</span>
              <span style={{ fontFamily: SERIF, fontSize: 'max(var(--eth-serif, 0px), 13px)', color: WALNUT }}>{p.name}</span>
              {status && (
                <span style={{ ...annMono, color: p.key.startsWith('curated-') ? OXBLOOD : ACCENT_DEEP }}>{status}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * THE SAVED SHELF — fetch-on-tap (performance pass, August 2026). This
 * component only mounts when the reader opens the Saved source on the
 * board, so the radar_items read fires then — never on the tab's initial
 * render. The staleness window and the change events behave exactly as
 * before, scoped to the mounted shelf.
 */
function SavedShelf({
  hasCategory,
  filter,
  selectedKeys,
  onToggle,
  note,
}: {
  /** True while a category chip is narrowing the shelves. */
  hasCategory: boolean;
  filter: (piece: FittingPiece) => boolean;
  selectedKeys: Set<string>;
  onToggle: (piece: FittingPiece) => void;
  note: (list: FittingPiece[]) => string;
}) {
  const { data: radarRows, refresh } = window.useWorkspaceDB<RadarItem>('radar_items', {
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 50,
  });
  useEffect(() => {
    if (radarRows) fittingReserveFetchedAt = Date.now();
  }, [radarRows]);
  // Re-activating the tab refreshes the saved shelf only when it is stale.
  useEffect(() => {
    const onActivated = (event: Event) => {
      if ((event as CustomEvent).detail?.tab !== 'fitting-room') return;
      if (Date.now() - fittingReserveFetchedAt > FITTING_RESERVE_STALE_MS) refresh();
    };
    window.addEventListener('ethaion:tab-activated', onActivated);
    return () => window.removeEventListener('ethaion:tab-activated', onActivated);
  }, [refresh]);
  useEffect(() => {
    const onChanged = () => {
      fittingReserveFetchedAt = 0;
      refresh();
    };
    window.addEventListener(RESERVE_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(RESERVE_CHANGED_EVENT, onChanged);
  }, [refresh]);
  const radarPieces = useMemo<FittingPiece[]>(
    () =>
      (radarRows || []).map((item) => ({
        key: `radar-${item.id}`,
        name: item.name,
        brand: item.brand || null,
        category: item.category || null,
        productUrl: item.product_url || null,
        note: item.notes || null,
      })),
    [radarRows],
  );
  const shown = useMemo(() => radarPieces.filter(filter), [radarPieces, filter]);
  return (
    <Shelf title="Saved · watched in the Search" note={note(shown)}>
      {shown.length > 0 ? (
        shown.map((piece) => (
          <ShelfCard key={piece.key} piece={piece} selected={selectedKeys.has(piece.key)} onToggle={onToggle} />
        ))
      ) : (
        <ShelfEmpty>
          {radarPieces.length > 0 && hasCategory
            ? 'Nothing of this category saved — tap All to see everything.'
            : 'Nothing saved yet — watch a piece in The Search and it appears here.'}
        </ShelfEmpty>
      )}
    </Shelf>
  );
}

/* LEGACY — the measured callout board, retired by the layout pass (the
   boxes-and-leader-lines treatment). Kept compiled but unmounted; nothing
   renders it. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function LegacyAnnotatedBoard({ pieces, children }: { pieces: BoardPiece[]; children: React.ReactNode }) {
  const railsRef = useRef<HTMLDivElement | null>(null);
  const boardColRef = useRef<HTMLDivElement | null>(null);
  const [labels, setLabels] = useState<EdgeLabel[]>([]);
  const [railSize, setRailSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    // COALESCED TO ONE READ PER FRAME. Every measure() does a forced
    // synchronous layout (getBoundingClientRect on each piece), and the
    // MutationObserver below fires on every style attribute the board writes
    // — which, during a drag, is one per pointermove. Un-throttled that was
    // dozens of layout passes a frame and the single biggest cause of the
    // Fitting tab's lag; the rAF gate collapses each burst into one read.
    let frame = 0;
    const measure = () => {
      const rails = railsRef.current;
      const col = boardColRef.current;
      if (!rails || !col) return;
      const railsRect = rails.getBoundingClientRect();
      const colRect = col.getBoundingClientRect();
      if (railsRect.height <= 0 || colRect.width <= 0) return;
      const byKey = new Map(pieces.map((piece) => [piece.key, piece]));
      const found: MeasuredPiece[] = [];
      col.querySelectorAll<HTMLElement>('[data-piece-key]').forEach((el) => {
        const piece = byKey.get(el.getAttribute('data-piece-key') || '');
        if (!piece) return;
        const rect = el.getBoundingClientRect();
        if (rect.height <= 0) return;
        found.push({
          piece,
          centre: rect.top + rect.height / 2 - railsRect.top,
          centreX: rect.left + rect.width / 2 - railsRect.left,
          halfW: rect.width / 2,
          halfH: rect.height / 2,
          side: rect.left + rect.width / 2 < colRect.left + colRect.width / 2 ? 'l' : 'r',
        });
      });
      const next = [
        ...stackLabels(found.filter((item) => item.side === 'l'), railsRect.height),
        ...stackLabels(found.filter((item) => item.side === 'r'), railsRect.height),
      ];
      setRailSize((cur) =>
        Math.abs(cur.w - railsRect.width) < 0.5 && Math.abs(cur.h - railsRect.height) < 0.5
          ? cur
          : { w: railsRect.width, h: railsRect.height },
      );
      setLabels((cur) => (sameLabels(cur, next) ? cur : next));
    };

    const scheduleMeasure = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };

    measure();
    // The cutouts land asynchronously and the canvas is aspect-ratio sized,
    // so re-measure on the next frame, shortly after, and on every change.
    scheduleMeasure();
    const timers = [window.setTimeout(scheduleMeasure, 200), window.setTimeout(scheduleMeasure, 700)];
    const observers: Array<{ disconnect: () => void }> = [];
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(scheduleMeasure);
      if (railsRef.current) ro.observe(railsRef.current);
      if (boardColRef.current) ro.observe(boardColRef.current);
      observers.push(ro);
    }
    if (typeof MutationObserver !== 'undefined' && boardColRef.current) {
      // A drag rewrites the piece's CSS custom properties — its label follows.
      const mo = new MutationObserver(scheduleMeasure);
      mo.observe(boardColRef.current, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'src', 'data-piece-key'] });
      observers.push(mo);
    }
    window.addEventListener('resize', scheduleMeasure);
    // A DRAG IS POINTERMOVES (founder's request, August 2026: “make them
    // follow as I drag the clothes around”): listen to the gesture itself in
    // capture, so the labels re-measure on every drag frame even if a style
    // mutation gets coalesced away mid-gesture. The rAF gate above still
    // keeps it to one layout read per frame.
    const colEl = boardColRef.current;
    colEl?.addEventListener('pointermove', scheduleMeasure, true);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      for (const timer of timers) window.clearTimeout(timer);
      for (const observer of observers) observer.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
      colEl?.removeEventListener('pointermove', scheduleMeasure, true);
    };
  }, [pieces]);

  const placed = useMemo(() => composeFlatLayBoard(pieces), [pieces]);
  if (pieces.length === 0) return <>{children}</>;
  return (
    <div>
      {/* THE CALLOUT RAILS OVERLAY THE CANVAS (founder's piece-size fix,
          August 2026): as grid columns they reserved ~350px of this column
          and squeezed the canvas — the ONE knob that scales every garment —
          to barely half its width, which is why earlier canvasMaxWidth
          doublings never showed. Overlaid on the canvas edges instead, the
          canvas takes the FULL column width and every piece draws at roughly
          twice its old rendered size. Each callout keeps its fixed 165px box
          and gold leader; pointer-events pass through to the pieces. */}
      <div ref={railsRef} className="relative">
        <div ref={boardColRef} className="min-w-0">{children}</div>
        {/* THE LEADERS — one traced line per label, from the box's inner
            edge toward its garment's LIVE centre, stopping ≈1/3cm short of
            the garment's own box so the line never lies over the clothes
            (founder's correction, August 2026). Angled on purpose: when the
            stack prises a label off its piece's line (two garments on the
            same line can never share a label line), the trace still says
            exactly which piece it names — and it follows the piece through
            every drag. */}
        {railSize.w > 0 && labels.length > 0 && (
          <svg
            className="hidden sm:block absolute inset-0 pointer-events-none"
            style={{ zIndex: 14 }}
            width="100%"
            height="100%"
            viewBox={`0 0 ${railSize.w} ${railSize.h}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {labels.map((l) => {
              const x1 = l.side === 'l' ? LABEL_BOX_W : railSize.w - LABEL_BOX_W;
              const end = leaderEnd(l, x1, l.top);
              return (
                <line
                  key={l.piece.key}
                  x1={x1}
                  y1={l.top}
                  x2={end.x}
                  y2={end.y}
                  stroke={ACCENT}
                  strokeWidth="1"
                  strokeOpacity="0.65"
                />
              );
            })}
          </svg>
        )}
        <div
          className="hidden sm:block absolute inset-y-0 left-0 w-[186px] pointer-events-none"
          style={{ zIndex: 15 }}
          aria-hidden="true"
        >
          {labels.filter((l) => l.side === 'l').map((l) => (
            <EdgeLabelBlock key={l.piece.key} label={l} />
          ))}
        </div>
        <div
          className="hidden sm:block absolute inset-y-0 right-0 w-[186px] pointer-events-none"
          style={{ zIndex: 15 }}
          aria-hidden="true"
        >
          {labels.filter((l) => l.side === 'r').map((l) => (
            <EdgeLabelBlock key={l.piece.key} label={l} />
          ))}
        </div>
      </div>
      {/* A narrow screen names the pieces beneath the board instead. */}
      <div className="sm:hidden pt-3">
        {placed.map(({ piece }) => {
          const p = piece as BoardPiece;
          const status = boardStatusOf(p);
          return (
            <div key={p.key} className="flex items-baseline gap-2.5 flex-wrap" style={{ padding: '3px 0' }}>
              {/* This list only renders under 640px, where annMono reads the
                  13px --eth-micro floor — the zone column is sized for THAT
                  type ("Outer layer" ≈ 97px), not the 7px desktop register
                  the old 74px fitted. flex-wrap drops a long status line
                  under the name instead of forcing it off the screen. */}
              <span style={{ ...annMono, color: MUTED, width: '102px', flexShrink: 0 }}>{zoneLabelFor(p)}</span>
              <span style={{ fontFamily: SERIF, fontSize: 'max(var(--eth-serif, 0px), 13px)', color: WALNUT }}>{p.name}</span>
              {status && <span style={{ ...annMono, color: ACCENT_DEEP }}>{status}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// THE TAB
// ---------------------------------------------------------------------------

export function FittingRoomTab({
  profile,
  budgets,
  pieces,
  prefs,
}: {
  profile: StyleProfile;
  budgets: Record<string, CategoryBudget>;
  pieces: WardrobePiece[];
  prefs: StylePrefs | null;
}) {
  // The IBM Plex Mono register — every small-caps label on this screen.
  usePlexMono();

  // One-shot read of the piece another surface opened the tab with — a
  // “Try this on” handoff lands the piece straight on the board.
  const pendingRef = useRef<FittingPiece | null | undefined>(undefined);
  if (pendingRef.current === undefined) pendingRef.current = consumePendingFittingPiece();

  const today = useMemo(() => new Date(), []);
  const todayIndex = (today.getDay() + 6) % 7;
  const seasonLabel = seasonOf(today);

  const [day, setDay] = useState(todayIndex);
  const [occasion, setOccasion] = useState('office');
  const meta = OCCASIONS.find((o) => o.key === occasion) || OCCASIONS[0];
  const dayName = DAY_NAMES[day];
  const fittingKey = `${day}:${occasion}`;

  // Tapping The Fitting's tab label comes back to the tab's home: today,
  // the Office register, the note folded away. Composed looks stay cached,
  // so this costs no model call.
  useEffect(() => {
    const onTabHome = (e: Event) => {
      if ((e as CustomEvent).detail?.tab !== 'fitting-room') return;
      setDay(todayIndex);
      setOccasion('office');
    };
    window.addEventListener('ethaion:tab-home', onTabHome);
    return () => window.removeEventListener('ethaion:tab-home', onTabHome);
  }, [todayIndex]);

  // The composed week, seeded from module memory so a tab switch is free.
  const [fittings, setFittings] = useState<Record<string, FittingEntry>>(() => ({ ...fittingMemory }));
  useEffect(() => {
    for (const [k, v] of Object.entries(fittings)) fittingMemory[k] = v;
  }, [fittings]);

  const [composing, setComposing] = useState(false);
  const composingRef = useRef<string | null>(null);
  const [materials, setMaterials] = useState<Record<number, string>>({});
  const [warmth, setWarmth] = useState<Record<number, PieceWarmth>>({});

  const entry = fittings[fittingKey] || EMPTY_ENTRY;
  const activeBoard = entry.board;
  // FULL-SCREEN BOARD (founder's request, August 2026): the expand arrows at
  // the canvas corner open the outfit alone across the whole page, drawn far
  // larger; Escape or the × closes it.
  const [boardExpanded, setBoardExpanded] = useState(false);
  useEffect(() => {
    if (!boardExpanded) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBoardExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [boardExpanded]);

  useEffect(() => {
    fetchMaterials().then(setMaterials).catch(() => undefined);
    fetchPieceWarmth().then(setWarmth).catch(() => undefined);
  }, [pieces.length]);

  const piecesById = useMemo(() => new Map(pieces.map((p) => [p.id, p])), [pieces]);

  const boardFromIds = (ids: number[]): BoardPiece[] => {
    const out: BoardPiece[] = [];
    for (const id of ids) {
      const piece = piecesById.get(id);
      if (!piece) continue;
      out.push(
        boardPieceFrom({
          key: `owned-${piece.id}`,
          name: piece.name,
          brand: piece.brand || null,
          category: piece.category || null,
          garmentImageUrl: piece.photo_url,
        }),
      );
    }
    return out;
  };

  // A patch always names the fitting it belongs to: an image that resolves
  // after the wearer has moved to another day must land on the board it was
  // added to, never on whatever is on screen now.
  const patchFitting = (key: string, patch: (cur: FittingEntry) => FittingEntry) =>
    setFittings((all) => ({ ...all, [key]: patch(all[key] || EMPTY_ENTRY) }));
  const patchBoard = (key: string, updater: (cur: BoardPiece[]) => BoardPiece[]) =>
    patchFitting(key, (cur) => ({ ...cur, board: updater(cur.board) }));

  // ------------------------------------------------------------------
  // TAP A DAY OR AN OCCASION AND THE FITTING RE-DRESSES
  // ------------------------------------------------------------------
  const weatherPhrase = (): string | null => {
    const w = getSharedWeather();
    return w ? `${w.city} at ${w.tempC}\u00b0C, ${w.label.toLowerCase()}` : null;
  };

  /** The editorial is asked for ONCE per look — the guard lives here, so the
   * compose path and the catch-up effect below can never both ask. */
  const copyAsked = useRef<Set<string>>(new Set());
  const loadCopy = (key: string, board: BoardPiece[], occasionKey: string, dayLabel: string, reasoning: string | null) => {
    if (copyAsked.current.has(key) || board.length === 0) return;
    copyAsked.current.add(key);
    const occ = OCCASIONS.find((o) => o.key === occasionKey) || OCCASIONS[0];
    void composeFittingCopy({
      pieces: board.map((p) => ({
        name: p.name,
        brand: p.brand,
        category: p.category,
        colour: (piecesById.get(Number(p.key.replace('owned-', '')))?.colors || [])[0] || null,
      })),
      occasionKey: occ.key,
      occasionLabel: occ.label,
      occasionSub: occ.sub,
      dayName: dayLabel,
      weatherPhrase: weatherPhrase(),
      build: profile?.build || null,
      colouring: profile?.skin_tone || null,
      directions: profile?.archetypes || null,
      reasoning,
    })
      .then((copy) => patchFitting(key, (cur) => ({ ...cur, copy })))
      .catch(() => undefined);
  };

  const composeFitting = async (dayIdx: number, occasionKey: string) => {
    const key = `${dayIdx}:${occasionKey}`;
    if (composingRef.current) return;
    const occ = OCCASIONS.find((o) => o.key === occasionKey) || OCCASIONS[0];
    const label = DAY_NAMES[dayIdx];
    composingRef.current = key;
    setComposing(true);
    try {
      const result = await composeFittingBoard({
        pieces,
        materials,
        profile,
        occasion: `${occ.label} — ${occ.sub}, ${dayIdx === todayIndex ? 'today' : label}`,
        weatherLine: sharedWeatherPromptLine(),
        warmth,
      });
      const board = boardFromIds(result.pieceIds);
      patchFitting(key, () => ({
        board,
        reasoning: result.reasoning,
        gapNote: result.gapNote ?? null,
        copy: null,
      }));
      // Today's look is SHARED with The Ledger's card — keep them in step.
      if (dayIdx === todayIndex) {
        rememberTodayBoard(pieces, {
          pieceIds: result.pieceIds,
          reasoning: result.reasoning,
          gapNote: result.gapNote ?? null,
          composedAt: Date.now(),
        });
      }
      loadCopy(key, board, occasionKey, label, result.reasoning);
    } catch (e) {
      console.warn('[Ethaion] the fitting could not be composed:', e);
      // An entry is written even on failure: the board stays empty and
      // dressable by hand, and the effect above never retries in a loop.
      patchFitting(key, (cur) => (cur.board.length > 0 ? cur : { board: [], reasoning: null, gapNote: null, copy: null }));
    } finally {
      composingRef.current = null;
      setComposing(false);
    }
  };

  // TODAY'S LOOK OPENS INSTANTLY when it has already been composed (the
  // Ledger's card and this tab share one cache) — no model call at all.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || fittings[fittingKey] || day !== todayIndex) return;
    const cached = peekTodayBoard(pieces);
    if (!cached) return;
    seeded.current = true;
    const board = boardFromIds(cached.pieceIds);
    patchFitting(fittingKey, () => ({ board, reasoning: cached.reasoning, gapNote: cached.gapNote ?? null, copy: null }));
    loadCopy(fittingKey, board, occasion, dayName, cached.reasoning);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieces.length]);

  // Every other pair composes the first time it is opened, then remembers.
  // `composing` is a dependency on purpose: tapping a second day while the
  // first is still composing must compose that one the moment the first
  // finishes, rather than leaving it empty forever.
  useEffect(() => {
    if (fittings[fittingKey] || composingRef.current) return;
    if (pieces.length < 3) return;
    void composeFitting(day, occasion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fittingKey, pieces.length, materials, warmth, composing]);

  // The editorial follows a board that arrived without one (a seeded today,
  // or a look whose copy call failed).
  useEffect(() => {
    const cur = fittings[fittingKey];
    if (!cur || cur.copy || cur.board.length === 0) return;
    loadCopy(fittingKey, cur.board, occasion, dayName, cur.reasoning);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fittings, fittingKey]);

  // ------------------------------------------------------------------
  // Dressing the board by hand
  // ------------------------------------------------------------------
  /** Swap a board piece's image for its background-removed cutout, and
   * record whether the result may lie in the flat-lay at all. WHICH
   * photograph gets cut is not this board's decision: a Reserve piece or one
   * of Beau's picks goes through the shared sourcing rule; an owned piece has
   * only its own photograph and goes straight to the pipeline. */
  const applyBoardCutout = (key: string, piece: BoardPiece, sourceUrl: string) => {
    const clean = (sourceUrl || '').trim();
    if (!clean) return;
    const ingest = piece.key.startsWith('owned-')
      ? flatLayAssetForShelf({ candidates: clean, category: piece.category, name: piece.name })
      : flatLayAssetForProduct({ name: piece.name, brand: piece.brand, category: piece.category, preferred: clean });
    void ingest
      .then((asset) => {
        patchBoard(key, (cur) =>
          cur.map((p) =>
            p.key === piece.key
              ? {
                  ...p,
                  image: asset.ready && asset.url ? asset.url : p.image,
                  flatLayReady: asset.flatLayReady,
                  croppedWidth: asset.ready && asset.url ? asset.croppedWidth ?? null : p.croppedWidth ?? null,
                  croppedHeight: asset.ready && asset.url ? asset.croppedHeight ?? null : p.croppedHeight ?? null,
                }
              : p,
          ),
        );
      })
      .catch(() => undefined);
  };

  const setBoardImage = (key: string, piece: BoardPiece, url: string, needsCutout: boolean) => {
    if (!url) return;
    const settled = needsCutout ? peekFlatLayAsset(url) : null;
    const ready = settled?.ready && settled.url ? settled.url : null;
    patchBoard(key, (cur) =>
      cur.map((p) =>
        p.key === piece.key
          ? ready && settled
            ? {
                ...p,
                image: ready,
                flatLayReady: settled.flatLayReady,
                croppedWidth: settled.croppedWidth ?? null,
                croppedHeight: settled.croppedHeight ?? null,
              }
            : { ...p, image: url }
          : p,
      ),
    );
    if (needsCutout && !ready) applyBoardCutout(key, piece, url);
  };

  /** Tap a piece to put it on; tap it again to take it off. */
  const toggleOnBoard = (piece: FittingPiece) => {
    const key = fittingKey;
    const item = boardPieceFrom(piece);
    if (activeBoard.some((p) => p.key === item.key)) {
      patchBoard(key, (cur) => cur.filter((p) => p.key !== item.key));
      return;
    }
    // EVERY piece is cut for the board — owned ones included. The wardrobe's
    // stored image is a garment on a paper card, not a transparent cutout,
    // and a pale rectangle beside a real cut is exactly what stops the board
    // reading as clothes laid out on a bed.
    const settled = item.image ? peekFlatLayAsset(item.image) : null;
    const seededAsset = settled?.ready && settled.url ? settled : null;
    patchBoard(key, (cur) => [
      ...cur,
      seededAsset
        ? {
            ...item,
            image: seededAsset.url,
            flatLayReady: seededAsset.flatLayReady,
            croppedWidth: seededAsset.croppedWidth ?? null,
            croppedHeight: seededAsset.croppedHeight ?? null,
          }
        : item,
    ]);
    if (item.image) {
      if (!seededAsset) applyBoardCutout(key, item, item.image);
    } else {
      void resolveGarmentImage(piece)
        .then((url) => {
          if (url) {
            setBoardImage(key, item, url, true);
            return undefined;
          }
          return resolveProductImage({ name: piece.name, brand: piece.brand, productUrl: piece.productUrl }).then((photo) =>
            setBoardImage(key, item, photo, true),
          );
        })
        .catch(() => undefined);
    }
  };

  const removeFromBoard = (pieceKey: string) => patchBoard(fittingKey, (cur) => cur.filter((p) => p.key !== pieceKey));

  // The “Try this on” handoff — held in a ref because the listener below is
  // registered once, before toggleOnBoard exists.
  const toggleOnBoardRef = useRef(toggleOnBoard);
  toggleOnBoardRef.current = toggleOnBoard;
  // A STABLE tap handler for every shelf tile, so the memoised cards keep
  // their identity across board/label/composing renders. It reads the
  // current toggle through the ref above rather than closing over one.
  const tapShelfPiece = useCallback((piece: FittingPiece) => {
    toggleOnBoardRef.current(piece);
  }, []);
  const pendingPlaced = useRef(false);
  useEffect(() => {
    if (pendingPlaced.current || !pendingRef.current) return;
    pendingPlaced.current = true;
    toggleOnBoardRef.current(pendingRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const onPiece = (event: Event) => {
      const piece = (event as CustomEvent).detail?.piece as FittingPiece | undefined;
      consumePendingFittingPiece();
      if (!piece) return;
      toggleOnBoardRef.current(piece);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    window.addEventListener(FITTING_PIECE_EVENT, onPiece);
    return () => window.removeEventListener(FITTING_PIECE_EVENT, onPiece);
  }, []);

  // A board handoff from The Ledger lands on the day it means: “Beau ·
  // Today” and a trip both open on today's fitting; “Build a look” clears
  // the board so it can be dressed by hand. The occasion in force is read
  // from a ref — the listener is registered once and must not close over
  // the occasion the tab happened to open on.
  const occasionRef = useRef(occasion);
  occasionRef.current = occasion;
  const applyHandoff = (handoff: FittingBoardHandoff | null) => {
    if (!handoff) return;
    setDay(todayIndex);
    if (handoff.source === 'manual') {
      const key = `${todayIndex}:${occasionRef.current}`;
      copyAsked.current.delete(key);
      patchFitting(key, (cur) => ({ ...cur, board: [], copy: null }));
    }
  };
  useEffect(() => {
    applyHandoff(consumePendingFittingBoard());
    const onBoard = (event: Event) => {
      const next = (event as CustomEvent).detail?.handoff as FittingBoardHandoff | undefined;
      consumePendingFittingBoard();
      applyHandoff(next || null);
    };
    window.addEventListener(FITTING_BOARD_EVENT, onBoard);
    return () => window.removeEventListener(FITTING_BOARD_EVENT, onBoard);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // THE CUTOUT SWEEP — the one place that guarantees every piece ON the
  // board is a transparent cutout, whichever route put it there. A stored
  // cutout that FAILS to load is quarantined by the render layer
  // (photo-enhance's broken-cutout remediation — a faulty ingestion once
  // stored error bytes under cutout URLs); the sweep then re-cuts the piece
  // from its OWN photograph, never from the broken file, and the quarantine
  // event clears the request memory so the retry actually fires.
  const cutRequested = useRef<Set<string>>(new Set());
  const [cutoutRetryTick, setCutoutRetryTick] = useState(0);
  useEffect(() => {
    const onBroken = () => {
      cutRequested.current.clear();
      setCutoutRetryTick((n) => n + 1);
    };
    window.addEventListener(CUTOUT_BROKEN_EVENT, onBroken);
    return () => window.removeEventListener(CUTOUT_BROKEN_EVENT, onBroken);
  }, []);
  useEffect(() => {
    for (const piece of activeBoard) {
      const current = (piece.image || '').trim();
      if (!current || isTransparentCutout(current)) continue;
      const ownedId = piece.key.startsWith('owned-') ? Number(piece.key.slice('owned-'.length)) : NaN;
      const ownedPhoto = Number.isFinite(ownedId) ? (piecesById.get(ownedId)?.photo_url || '').trim() : '';
      const source = isBrokenCutoutUrl(current) && ownedPhoto ? ownedPhoto : current;
      if (isBrokenCutoutUrl(source) || cutRequested.current.has(source)) continue;
      cutRequested.current.add(source);
      applyBoardCutout(fittingKey, piece, source);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBoard, cutoutRetryTick]);

  // ------------------------------------------------------------------
  // The three shelves — what you own, what you saved, what Beau has put up
  // ------------------------------------------------------------------
  const ownedPieces = useMemo<FittingPiece[]>(
    () =>
      pieces
        .filter((p) => (p.photo_url || '').trim())
        .map((p) => ({
          key: `owned-${p.id}`,
          name: p.name,
          brand: p.brand || null,
          category: p.category || null,
          garmentImageUrl: p.photo_url,
        })),
    [pieces],
  );

  // The saved (radar) shelf reads its rows inside SavedShelf — mounted on
  // first open of the Saved source, so nothing is fetched until the reader
  // asks for it (performance pass, August 2026).

  const beauPicks = useMemo<FittingPiece[]>(() => {
    try {
      const cards = buildCuratedFeed(profile, budgets, pieces, prefs, 60);
      const gate = hierarchyGate(pieces);
      const gated = cards.filter((card) => itemPassesGate(gate, card.item.category, card.item.slot));
      const source = gated.length > 0 ? gated : cards;
      const seen = new Set<string>();
      const out: FittingPiece[] = [];
      for (const card of source) {
        if (seen.has(card.item.id)) continue;
        seen.add(card.item.id);
        out.push({
          key: `curated-${card.item.id}`,
          name: card.item.name,
          brand: card.item.brand || null,
          category: card.item.category || null,
          slotId: card.item.slot || null,
          productUrl: card.item.productUrl || primaryBuyUrl(card.item.brand, card.item.name),
          imageQuery: card.item.photoQuery || null,
          note: card.why || null,
        });
        if (out.length >= 18) break;
      }
      return out;
    } catch (e) {
      console.warn('[Ethaion] fitting room could not build Beau\u2019s picks:', e);
      return [];
    }
  }, [profile, budgets, pieces, prefs]);

  const selectedKeys = useMemo(() => new Set(activeBoard.map((p) => p.key)), [activeBoard]);

  // THE BOARD'S CATEGORY FILTER (founder's request): the app's ONE canonical
  // eleven-category set (category-order.ts — the same list The Rail, The
  // Edit, The Search and The Index read), as chips over the shelves. Null
  // shows everything; a chip narrows all three shelves at once.
  const [shelfCategory, setShelfCategory] = useState<string | null>(null);
  // THE COMPACT SOURCE PICKER (layout & performance pass, August 2026): no
  // source is expanded on the tab's initial render — opening one mounts
  // just that shelf, and a shelf once visited stays mounted (hidden) so
  // folding it away and back costs nothing.
  const [openShelf, setOpenShelf] = useState<'owned' | 'saved' | 'picks' | null>(null);
  const [visitedShelves, setVisitedShelves] = useState<Record<string, boolean>>({});
  const pickShelf = (id: 'owned' | 'saved' | 'picks') => {
    setOpenShelf((cur) => (cur === id ? null : id));
    setVisitedShelves((cur) => (cur[id] ? cur : { ...cur, [id]: true }));
  };
  const shelfCategoryIds = useMemo(() => CATEGORY_ORDER.filter((id) => id !== 'other'), []);
  const inShelfCategory = useCallback(
    (piece: FittingPiece) => {
      if (!shelfCategory) return true;
      const rank = categoryRank(piece.category);
      return rank < CATEGORY_ORDER.length && rank === categoryRank(shelfCategory);
    },
    [shelfCategory],
  );
  const shownOwned = useMemo(() => ownedPieces.filter(inShelfCategory), [ownedPieces, inShelfCategory]);
  const shownPicks = useMemo(() => beauPicks.filter(inShelfCategory), [beauPicks, inShelfCategory]);
  const onCount = (list: FittingPiece[]) => list.filter((p) => selectedKeys.has(p.key)).length;
  const shelfNote = (list: FittingPiece[]) => {
    const on = onCount(list);
    return on > 0 ? `${on} on board` : `${list.length} piece${list.length === 1 ? '' : 's'}`;
  };

  // ------------------------------------------------------------------
  // What the page says about the look
  // ------------------------------------------------------------------
  const ownedColors = useMemo(() => {
    const map = new Map<string, string[] | null>();
    for (const p of pieces) map.set(`owned-${p.id}`, p.colors || null);
    return map;
  }, [pieces]);

  /** THE COLOUR HARMONY — the board's own palette, in the order the pieces
   * were added. No board, no strip: it is never invented. */
  const harmony = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const p of activeBoard) {
      const hex = swatchForPiece(p.name, ownedColors.get(p.key) || null);
      if (!hex || seen.has(hex)) continue;
      seen.add(hex);
      out.push(hex);
      if (out.length >= 6) break;
    }
    return out;
  }, [activeBoard, ownedColors]);

  /** SWAP ALTERNATIVES — real pieces he owns: the empty slots first, then
   * same-slot swaps, each with the reason in one line. Tap one and it takes
   * the slot. Derived, never a model call. */
  const swaps = useMemo(() => {
    const onBoard = new Set(activeBoard.map((p) => p.key));
    const rows: Array<{ piece: FittingPiece; why: string; fillsEmpty: boolean }> = [];
    for (const piece of ownedPieces) {
      if (onBoard.has(piece.key)) continue;
      const zone = zoneLabelFor(boardPieceFrom(piece));
      const current = activeBoard.find((p) => zoneLabelFor(p) === zone);
      rows.push({
        piece,
        fillsEmpty: !current,
        why: current
          ? `Instead of the ${current.name.toLowerCase()} — same slot, a different read.`
          : `Takes the empty ${zone.toLowerCase()} — nothing on board covers it.`,
      });
    }
    rows.sort((a, b) => Number(b.fillsEmpty) - Number(a.fillsEmpty));
    return rows.slice(0, 3);
  }, [activeBoard, ownedPieces]);

  // ONE BUILDING MESSAGE AT A TIME (founder's correction, August 2026).
  // While Beau composes, this is the only line on the canvas: the board's
  // own “Build the look flat” empty state is silenced (`quiet`).
  const composingLine = `Beau is dressing you for ${dayName.toLowerCase()}\u2026`;
  // FOUNDER'S CUT (August 2026): the board's furniture is gone — no
  // "Nothing on board yet" heading, no build/day tag, no About toggle, no
  // on-canvas missing-pieces notice, no Style notes, no What not to do
  // lists, and (final cut) no italic look-name line under the canvas.

  // ------------------------------------------------------------------
  // MISSING PIECES FOR THIS OCCASION (founder's request, August 2026).
  // When the wardrobe cannot properly dress the selected occasion — the
  // composed board is short of a full outfit, or the compose named a gap —
  // the canvas says so plainly, and Beau's picks for the missing pieces
  // close the tab, with the same categories one tap away in The Hunt →
  // Beau's Picks.
  // ------------------------------------------------------------------
  const missingZones = useMemo(() => {
    const covered = new Set(activeBoard.map((p) => zoneLabelFor(p)));
    return ['Top', 'Bottom', 'Feet'].filter((zone) => !covered.has(zone));
  }, [activeBoard]);
  const fittingDrawn = !!fittings[fittingKey];
  const insufficient =
    !composing && (fittingDrawn ? activeBoard.length < 3 || !!entry.gapNote : pieces.length < 3);
  /** A missing zone → the Hunt/Index category its replacement lives in. */
  const zoneCategory: Record<string, string> = {
    Top: 'tops',
    Bottom: 'bottoms',
    Feet: 'shoes',
    'Outer layer': 'outerwear',
    'Mid layer': 'knitwear',
  };
  const missingCategories = missingZones.map((zone) => zoneCategory[zone]).filter(Boolean);
  const missingPicksPool =
    missingCategories.length > 0
      ? beauPicks.filter((p) => missingCategories.includes((p.category || '').toLowerCase()))
      : [];
  const missingPicks = (missingPicksPool.length > 0 ? missingPicksPool : beauPicks).slice(0, 8);
  const openMissingInHunt = () =>
    openInBeausPicks({ categoryId: missingCategories[0] || (missingPicks[0]?.category || 'tops').toLowerCase() });

  const railDays: RailDay[] = DAY_NAMES.map((name, i) => ({
    key: name,
    abbr: name.slice(0, 3),
    num: String(i + 1),
    active: i === day,
    title: i === todayIndex ? `${name} · today` : name,
    onSelect: () => setDay(i),
  }));

  const occasionTabs: SegmentedItem[] = OCCASIONS.map((o) => ({
    key: o.key,
    label: o.label,
    title: `${o.label} — ${o.sub}`,
    onSelect: () => setOccasion(o.key),
  }));

  return (
    <div style={{ background: PAGE }}>
      {/* 1 · THE MASTHEAD — the SHARED one (tab-header.tsx), so the title
          type, the indentation, the height and the closing rule are
          identical to the other five primary tabs. The five occasions sit
          in its aside, where the other tabs carry their face chips. */}
      <TabHeader
        title="The Fitting"
        standfirst="Seven days, every occasion — drawn to your build."
        aside={<SegmentedTabs items={occasionTabs} activeKey={occasion} />}
      />

      {/* 2 · THE CONTEXT BAR — the shared weather reading and the location
          control, BELOW the masthead so the header itself stays uniform. */}
      <FittingContextBar />

      {/* 3 · THE BAND — the days (with the swap alternatives beneath them),
          the fitting, the notes. The left column widened so the alternatives
          read comfortably under the compact day rail (founder's correction). */}
      <div className="px-6 sm:px-10">
        <div className="max-w-[1180px] mx-auto grid grid-cols-1 lg:grid-cols-[176px_minmax(0,1fr)_220px] xl:grid-cols-[188px_minmax(0,1fr)_232px] items-stretch">
          <div className="lg:border-r border-[rgba(59,43,29,0.18)] flex flex-col min-w-0">
            <DayRail days={railDays} />
            {/* THE SWAP ALTERNATIVES live in the notes column on the right
                (founder's layout reference, August 2026) — the column's only
                section, on every breakpoint. */}
          </div>

          {/* THE FITTING ITSELF */}
          <div
            className="relative flex flex-col min-w-0 lg:border-r border-[rgba(59,43,29,0.18)] px-4 py-3 sm:px-[22px] sm:py-[14px]"
            style={{ background: CANVAS }}
            data-tour="tour-fitting-board"
          >
            {/* THE COLOUR BAR RIDES THE TOP EDGE (founder's correction,
                August 2026): the harmony strip sits ABOVE the season row,
                and the old 'Colour harmony' heading row is folded away — the
                day joins the occasion at the season row's right — so the
                labels spend as little height as possible and the canvas
                below gets every spare pixel for the clothes. */}
            <HarmonyBars colors={harmony} />
            <div className="flex items-center justify-between gap-4 flex-wrap" style={{ marginTop: '6px' }}>
              <span className="inline-flex items-center gap-2" style={fitLabel(9.5, MUTED, '0.16em')}>
                <span aria-hidden="true" style={{ width: '5px', height: '5px', borderRadius: '50%', background: ACCENT, display: 'inline-block' }} />
                {seasonLabel}
              </span>
              <span style={fitLabel(9.5, ACCENT_DEEP, '0.16em')}>{`${dayName} · ${meta.label}`}</span>
            </div>

            {/* THE OUTFIT DISPLAY AREA. No minimum height and no grow-to-fill
                (founder's correction): the canvas is exactly as tall as the
                board plus the look's name line, so the band ends at the
                content's natural bottom with no dead space under it. */}
            <div
              className="relative flex flex-col"
              style={{ marginTop: '6px' }}
            >
            <section
              aria-label="The outfit on board"
              className="relative mx-auto w-full"
              style={{ flex: '0 0 auto' }}
            >
              {/* THE EXPAND ARROWS (founder's request, August 2026): open the
                  canvas alone, full page, the clothes drawn far larger. */}
              {activeBoard.length > 0 && !composing && (
                <button
                  type="button"
                  onClick={() => setBoardExpanded(true)}
                  title="Expand the board — the outfit alone, full page"
                  aria-label="Expand the board"
                  className="absolute z-30 flex items-center justify-center hover:opacity-75"
                  style={{
                    top: '2px',
                    right: '2px',
                    width: '30px',
                    height: '30px',
                    background: PAPER,
                    border: `1px solid ${HAIRLINE}`,
                    borderRadius: '8px',
                    color: ACCENT_DEEP,
                    cursor: 'pointer',
                  }}
                >
                  <Maximize2 width={14} height={14} strokeWidth={1.6} aria-hidden="true" />
                </button>
              )}
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '46%',
                  transform: 'translate(-50%,-50%)',
                  width: '220px',
                  height: '220px',
                  borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(251,248,241,0.9) 0%, rgba(244,238,227,0) 70%)',
                  pointerEvents: 'none',
                }}
              />
              <div className="relative" style={{ zIndex: 2 }}>
                <AnnotatedBoard pieces={activeBoard}>
                  {/* PIECES AT TWICE THE SIZE (founder's correction, August
                      2026): the canvas width is the ONE knob that scales
                      every garment on the board. The callout rails no longer
                      reserve ~350px of this column (they overlay the canvas
                      edges — AnnotatedBoard above), so the board now truly
                      draws at the column's full width — roughly double what
                      the rail-squeezed canvas managed — and 760px keeps it
                      uncapped inside the 1180px page grid. The canvas box
                      itself ends at the composition's true bottom edge
                      (flat-lay-board), so no dead ground hangs beneath the
                      outfit. */}
                  {/* THE COLUMN FITS THE BAND (founder's correction, August
                      2026): the outfit stacks top-to-bottom — headwear under
                      the colour bar, invisible-head air, tops, bottoms,
                      shoes — and the 260px cap lands the canvas's bottom
                      right at the day rail's last day, WITHOUT stretching
                      the canvas taller. The composition scales itself to
                      fill the cap and the canvas ends at the lowest piece. */}
                  <StyledOutfitBoard
                    pieces={activeBoard}
                    onRemove={removeFromBoard}
                    seed={`fitting-${fittingKey}`}
                    canvasMaxWidth="760px"
                    canvasMaxHeight="260px"
                    quiet={composing}
                  />
                </AnnotatedBoard>
              </div>
              {composing && (
                <div
                  className="absolute inset-0 z-20 flex flex-col items-center justify-center text-center px-6 sm:px-8"
                  style={{ background: 'rgba(244,238,227,0.9)' }}
                  aria-live="polite"
                >
                  <span className="block w-12 h-[3px] bg-[var(--color-accent,#a8712c)] animate-pulse" aria-hidden="true" />
                  <p style={{ fontFamily: SERIF, fontSize: '18px', lineHeight: 1.3, maxWidth: '28ch', color: WALNUT, marginTop: '16px' }}>
                    {composingLine}
                  </p>
                </div>
              )}
            </section>

            </div>
          </div>

          {/* THE NOTES — the alternatives moved under the day rail on a
              desktop; on a phone they keep their old place here. */}
          {/* Hidden on a phone (founder's correction, August 2026) — the
              swaps are a desktop margin note. */}
          <aside aria-label="Notes on this look" className="hidden sm:flex flex-col" style={{ background: PAPER, padding: '26px 16px 32px' }}>
            {/* SWAP ALTERNATIVES — the column's ONLY section now (founder's
                cut, August 2026: Style notes and What not to do are gone).
                Real pieces he owns that could take a slot; hovering (or
                focusing) a row reveals Beau's reasoning, tapping puts it on
                board. */}
            <SectionRule>Swap alternatives</SectionRule>
            {swaps.length > 0 ? (
              <>
                <div className="flex flex-col">
                  {swaps.map(({ piece, why }) => (
                    <SwapRow
                      key={piece.key}
                      swatch={swatchForPiece(piece.name, ownedColors.get(piece.key) || null)}
                      name={piece.name}
                      why={why}
                      onClick={() => toggleOnBoard(piece)}
                      title={`${why} — tap to put it on board`}
                    />
                  ))}
                </div>
                <p style={{ ...body(11.5, MUTED), margin: '8px 0 0' }}>
                  Hover a swap for why it works — tap it to put it on board.
                </p>
              </>
            ) : (
              <p style={{ ...body(12.5, MUTED), margin: '12px 0 0' }}>
                Everything you own that suits this look is already on board — log more pieces in The Rail and
                the swaps appear here.
              </p>
            )}

          </aside>
        </div>
      </div>

      {/* 4 · THE BOARD — everything the fitting can be dressed in. */}
      <div style={{ background: PAGE, borderTop: `1px solid ${HAIRLINE}` }} data-tour="tour-fitting-shelf">
        <div className="px-6 sm:px-10" style={{ paddingTop: '22px', paddingBottom: '32px' }}>
          <div className="max-w-[1180px] mx-auto">
            <div className="flex items-baseline justify-between gap-5 flex-wrap">
              <div className="min-w-0">
                <div style={{ fontFamily: SERIF, fontSize: '28px', lineHeight: 1.1, color: WALNUT }}>Board</div>
                <p style={{ ...body(13.5, MUTED), margin: '6px 0 0', maxWidth: '64ch' }}>
                  What you own, what you saved, and Beau’s picks.
                </p>
              </div>
              {activeBoard.length > 0 && (
                <span style={fitLabel(9, ACCENT_DEEP, '0.16em')}>
                  {`${activeBoard.length} piece${activeBoard.length === 1 ? '' : 's'} on board`}
                </span>
              )}
            </div>

            {/* THE SOURCE PICKER (layout & performance pass, August 2026):
                the three sources arrive as a compact picker — nothing
                expands, and nothing fetches, until a source is opened. */}
            {/* No “Dress it from” label (founder's correction, August 2026)
                — the three sources speak for themselves, and on a phone they
                hold ONE row of three equal buttons (hab-source-row). */}
            <div
              className="flex items-center flex-wrap hab-source-row"
              style={{ gap: '6px', marginTop: '16px' }}
              role="group"
              aria-label="Dress the fitting from"
            >
              {([
                { id: 'owned', label: 'Yours' },
                { id: 'saved', label: 'Saved in the Search' },
                { id: 'picks', label: 'Beau’s picks' },
              ] as const).map(({ id, label: shelfLabel }) => {
                const active = openShelf === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => pickShelf(id)}
                    aria-pressed={active}
                    className="transition-colors hover:border-[#a8712c] hab-tap"
                    style={{
                      ...fitLabel(8.5, active ? WALNUT : MUTED, '0.1em'),
                      border: `1px solid ${active ? ACCENT : 'rgba(59,43,29,0.28)'}`,
                      background: active ? 'rgba(168,113,44,0.14)' : 'transparent',
                      padding: '7px 13px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {shelfLabel}
                  </button>
                );
              })}
            </div>

            {/* THE CATEGORY FILTER — the canonical eleven categories, shown
                once a source is open. One tap narrows the open shelf; All
                brings everything back. */}
            {openShelf != null && (
            <div className="flex items-center flex-wrap" style={{ gap: '6px', marginTop: '14px' }} role="group" aria-label="Filter the shelves by category">
              <span style={fitLabel(8.5, MUTED, '0.16em')}>Filter</span>
              <button
                type="button"
                onClick={() => setShelfCategory(null)}
                aria-pressed={shelfCategory === null}
                className="transition-colors hover:border-[#a8712c]"
                style={{
                  ...fitLabel(8.5, shelfCategory === null ? WALNUT : MUTED, '0.1em'),
                  border: `1px solid ${shelfCategory === null ? ACCENT : 'rgba(59,43,29,0.28)'}`,
                  background: shelfCategory === null ? 'rgba(168,113,44,0.14)' : 'transparent',
                  padding: '5px 11px',
                  whiteSpace: 'nowrap',
                }}
              >
                All
              </button>
              {shelfCategoryIds.map((id) => {
                const active = shelfCategory === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setShelfCategory(active ? null : id)}
                    aria-pressed={active}
                    className="transition-colors hover:border-[#a8712c]"
                    style={{
                      ...fitLabel(8.5, active ? WALNUT : MUTED, '0.1em'),
                      border: `1px solid ${active ? ACCENT : 'rgba(59,43,29,0.28)'}`,
                      background: active ? 'rgba(168,113,44,0.14)' : 'transparent',
                      padding: '5px 11px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {categoryName(id)}
                  </button>
                );
              })}
            </div>
            )}

            {visitedShelves.owned && (
            <div style={openShelf === 'owned' ? undefined : { display: 'none' }}>
            <Shelf title="Yours · logged in the Rail" note={shelfNote(shownOwned)}>
              {shownOwned.length > 0 ? (
                shownOwned.map((piece) => (
                  <ShelfCard
                    key={piece.key}
                    piece={piece}
                    selected={selectedKeys.has(piece.key)}
                    onToggle={tapShelfPiece}
                  />
                ))
              ) : (
                <ShelfEmpty>
                  {ownedPieces.length > 0
                    ? 'Nothing of this category on your shelf — tap All to see everything.'
                    : 'Nothing logged yet — photograph or search a piece in The Rail.'}
                </ShelfEmpty>
              )}
            </Shelf>
            </div>
            )}

            {visitedShelves.saved && (
            <div style={openShelf === 'saved' ? undefined : { display: 'none' }}>
              <SavedShelf
                hasCategory={shelfCategory != null}
                filter={inShelfCategory}
                selectedKeys={selectedKeys}
                onToggle={tapShelfPiece}
                note={shelfNote}
              />
            </div>
            )}

            {visitedShelves.picks && (
            <div style={openShelf === 'picks' ? undefined : { display: 'none' }}>
            <Shelf title="Beau’s picks · not yours yet" note={shelfNote(shownPicks)}>
              {shownPicks.length > 0 ? (
                shownPicks.map((piece) => (
                  <ShelfCard
                    key={`picks-${piece.key}`}
                    piece={piece}
                    selected={selectedKeys.has(piece.key)}
                    onToggle={tapShelfPiece}
                  />
                ))
              ) : (
                <ShelfEmpty>
                  {beauPicks.length > 0
                    ? 'Nothing of this category among his picks — tap All to see everything.'
                    : 'Beau has nothing to add yet — log a few pieces in The Rail and he’ll fill this shelf.'}
                </ShelfEmpty>
              )}
            </Shelf>
            </div>
            )}

            {/* BEAU'S PICKS FOR THE OCCASION — only when the wardrobe cannot
                dress it: his recommendations for the missing pieces, with the
                same categories one tap away in The Hunt → Beau's Picks. */}
            {insufficient && missingPicks.length > 0 && (
              <section aria-label={`Beau's picks for ${meta.label}`} style={{ marginTop: '26px' }}>
                <div
                  className="flex items-baseline justify-between gap-4 flex-wrap"
                  style={{ paddingBottom: '8px', borderBottom: `1px solid ${HAIRLINE}` }}
                >
                  <span style={fitLabel(9, ACCENT_DEEP, '0.18em')}>
                    Beau’s picks for {meta.label} · the pieces you’re missing
                  </span>
                  <button
                    type="button"
                    onClick={openMissingInHunt}
                    className="hover:underline"
                    style={{ ...fitLabel(9, ACCENT_DEEP, '0.14em'), background: 'transparent', border: 'none', padding: 0 }}
                  >
                    See them in The Search · Beau’s Picks →
                  </button>
                </div>
                {/* Commented out (founder's request, August 2026) — the
                    tiles speak for themselves without the instruction block.
                <p style={{ ...body(12.5, MUTED), margin: '10px 0 0', maxWidth: '70ch' }}>
                  You don’t have the pieces for {meta.label.toLowerCase()} yet — these fill the gaps. Tap one to try
                  it on the board; the same recommendations live in The Search under their categories.
                </p>
                */}
                <div className="flex flex-wrap gap-x-6 gap-y-7" style={{ paddingTop: '18px' }}>
                  {missingPicks.map((piece) => (
                    <ShelfCard
                      key={`missing-${piece.key}`}
                      piece={piece}
                      selected={selectedKeys.has(piece.key)}
                      onToggle={tapShelfPiece}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>

      {/* 5 · THE LEGEND */}
      <FooterLegend
        items={[
          { dot: '#1c2b4a', label: 'Anchors' },
          { dot: MUTED, label: 'Neutrals' },
          { dot: ACCENT, label: 'Accents' },
        ]}
        note=""
      />

      {/* THE FULL-SCREEN BOARD (founder's request, August 2026): the canvas
          alone, page-sized — the same pieces, the same drag behaviour, drawn
          much larger. Escape or the × returns to the tab. */}
      {boardExpanded && (
        <div
          className="fixed inset-0 z-[90] flex flex-col"
          style={{ background: PAGE }}
          role="dialog"
          aria-modal="true"
          aria-label="The outfit, full screen"
        >
          <div className="flex items-center justify-between" style={{ padding: '14px 18px' }}>
            <span style={fitLabel(9.5, MUTED, '0.16em')}>{`${dayName} · ${meta.label}`}</span>
            <button
              type="button"
              onClick={() => setBoardExpanded(false)}
              title="Close the full-screen board"
              aria-label="Close the full-screen board"
              className="flex items-center justify-center hover:opacity-75"
              style={{
                width: '34px',
                height: '34px',
                background: PAPER,
                border: `1px solid ${HAIRLINE}`,
                borderRadius: '8px',
                color: ACCENT_DEEP,
                cursor: 'pointer',
              }}
            >
              <X width={16} height={16} strokeWidth={1.6} aria-hidden="true" />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center px-4 pb-4" style={{ minHeight: 0 }}>
            <div className="w-full" style={{ maxWidth: '1100px' }}>
              <StyledOutfitBoard
                pieces={activeBoard}
                onRemove={removeFromBoard}
                seed={`fitting-${fittingKey}`}
                canvasMaxWidth="1100px"
                canvasMaxHeight="80vh"
                quiet={composing}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FittingRoomTab;
