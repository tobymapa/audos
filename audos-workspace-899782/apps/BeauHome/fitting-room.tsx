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
 *       · THE NOTES — Style notes · Swap alternatives · What not to do.
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
import { useEffect, useMemo, useRef, useState } from 'react';
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
  flatLayAssetForShelf,
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
  INK,
  MUTED,
  PAGE,
  PAPER,
  RULE,
  SERIF,
  WALNUT,
  body,
} from './index-style';
import { openInBeausPicks } from './edit-links';
import { TabHeader } from './tab-header';
import {
  AvoidList,
  DayRail,
  FittingContextBar,
  FooterLegend,
  HarmonyBars,
  NoteList,
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
          loading="eager"
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
function ShelfCard({
  piece,
  selected,
  onTap,
}: {
  piece: FittingPiece;
  selected: boolean;
  onTap: () => void;
}) {
  return (
    <div className="w-[132px] sm:w-[156px] flex-shrink-0">
      <button
        type="button"
        onClick={onTap}
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
          style={{ fontFamily: SERIF, fontSize: '17px', lineHeight: 1.25, color: WALNUT, marginTop: '10px' }}
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
          View product <span aria-hidden="true" style={{ fontSize: '9px', lineHeight: 1 }}>↗</span>
        </a>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// THE BOARD'S CALLOUTS — the reference names every piece around the edge of
// the composition on a leader. Each label is MEASURED against the piece it
// names (read off the DOM by `data-piece-key`), so it sits on the same line
// as its garment at every width and after every drag.
// ---------------------------------------------------------------------------

const annMono: React.CSSProperties = { fontFamily: MONO, fontSize: '7px', letterSpacing: '0.08em', textTransform: 'uppercase' };

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
}

interface MeasuredPiece {
  piece: BoardPiece;
  centre: number;
  side: 'l' | 'r';
}

function labelHeight(piece: BoardPiece): number {
  // The boxes widened by half (founder's correction), so a name wraps later.
  const nameLines = (piece.name || '').length > 30 ? 2 : 1;
  return 9 + nameLines * 15 + 11 + (boardStatusOf(piece) ? 10 : 0);
}

/**
 * Each label's centre IS its piece's centre. The only departure is when two
 * blocks would physically overlap: the pair is then prised apart
 * symmetrically, so the run stays centred on the pieces it names.
 */
function stackLabels(items: MeasuredPiece[]): EdgeLabel[] {
  const sorted = [...items].sort((a, b) => a.centre - b.centre);
  const centres = sorted.map((item) => item.centre);
  for (let pass = 0; pass < 4; pass += 1) {
    let moved = false;
    for (let i = 1; i < sorted.length; i += 1) {
      const need = labelHeight(sorted[i - 1].piece) / 2 + labelHeight(sorted[i].piece) / 2 + 6;
      const have = centres[i] - centres[i - 1];
      if (have >= need) continue;
      const push = (need - have) / 2;
      centres[i - 1] -= push;
      centres[i] += push;
      moved = true;
    }
    if (!moved) break;
  }
  return sorted.map((item, i) => ({ piece: item.piece, top: centres[i], side: item.side }));
}

function sameLabels(a: EdgeLabel[], b: EdgeLabel[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((l, i) => l.piece.key === b[i].piece.key && l.side === b[i].side && Math.abs(l.top - b[i].top) < 0.5);
}

/** One callout: the reference's boxed label on a gold leader — the zone in
 * small caps, the piece's colour chip beside its name, then category ·
 * maker, and the status line on anything that isn't yours. */
function EdgeLabelBlock({ label }: { label: EdgeLabel }) {
  const { piece, side } = label;
  const status = boardStatusOf(piece);
  const swatch = swatchForPiece(piece.name, null);
  const leader = (
    <span
      aria-hidden="true"
      className="flex-1 self-center"
      style={{
        height: '1px',
        minWidth: '12px',
        background: `linear-gradient(to ${side === 'l' ? 'left' : 'right'}, ${ACCENT}, rgba(168,113,44,0.15))`,
      }}
    />
  );
  const text = (
    <span
      className="block min-w-0"
      style={{
        textAlign: side === 'l' ? 'right' : 'left',
        // ONE FIXED WIDTH for every callout box (founder's correction,
        // August 2026): widened by 50% from the reference's 110px, and no
        // longer sized to its own text — every clothing text box on the
        // canvas draws at exactly this width, none wider or narrower.
        width: '165px',
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
        <span style={{ fontFamily: SERIF, fontSize: '12px', lineHeight: 1.2, color: WALNUT }}>{piece.name}</span>
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
  return (
    <div className="absolute w-full flex items-center" style={{ top: `${label.top}px`, transform: 'translateY(-50%)', gap: '5px' }}>
      {side === 'l' ? (
        <>
          {text}
          {leader}
        </>
      ) : (
        <>
          {leader}
          {text}
        </>
      )}
    </div>
  );
}

function AnnotatedBoard({ pieces, children }: { pieces: BoardPiece[]; children: React.ReactNode }) {
  const railsRef = useRef<HTMLDivElement | null>(null);
  const boardColRef = useRef<HTMLDivElement | null>(null);
  const [labels, setLabels] = useState<EdgeLabel[]>([]);

  useEffect(() => {
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
          side: rect.left + rect.width / 2 < colRect.left + colRect.width / 2 ? 'l' : 'r',
        });
      });
      const next = [
        ...stackLabels(found.filter((item) => item.side === 'l')),
        ...stackLabels(found.filter((item) => item.side === 'r')),
      ];
      setLabels((cur) => (sameLabels(cur, next) ? cur : next));
    };

    measure();
    // The cutouts land asynchronously and the canvas is aspect-ratio sized,
    // so re-measure on the next frame, shortly after, and on every change.
    const frame = window.requestAnimationFrame(measure);
    const timers = [window.setTimeout(measure, 200), window.setTimeout(measure, 700)];
    const observers: Array<{ disconnect: () => void }> = [];
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => measure());
      if (railsRef.current) ro.observe(railsRef.current);
      if (boardColRef.current) ro.observe(boardColRef.current);
      observers.push(ro);
    }
    if (typeof MutationObserver !== 'undefined' && boardColRef.current) {
      // A drag rewrites the piece's CSS custom properties — its label follows.
      const mo = new MutationObserver(() => measure());
      mo.observe(boardColRef.current, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'src', 'data-piece-key'] });
      observers.push(mo);
    }
    window.addEventListener('resize', measure);
    return () => {
      window.cancelAnimationFrame(frame);
      for (const timer of timers) window.clearTimeout(timer);
      for (const observer of observers) observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [pieces]);

  const placed = useMemo(() => composeFlatLayBoard(pieces), [pieces]);
  if (pieces.length === 0) return <>{children}</>;
  return (
    <div>
      <div ref={railsRef} className="sm:grid sm:items-stretch sm:grid-cols-[minmax(150px,174px)_minmax(0,1fr)_minmax(150px,174px)] sm:gap-1">
        <div className="hidden sm:block relative" aria-hidden="true">
          {labels.filter((l) => l.side === 'l').map((l) => (
            <EdgeLabelBlock key={l.piece.key} label={l} />
          ))}
        </div>
        <div ref={boardColRef} className="min-w-0">{children}</div>
        <div className="hidden sm:block relative" aria-hidden="true">
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
            <div key={p.key} className="flex items-baseline gap-2.5" style={{ padding: '3px 0' }}>
              <span style={{ ...annMono, color: MUTED, width: '74px', flexShrink: 0 }}>{zoneLabelFor(p)}</span>
              <span style={{ fontFamily: SERIF, fontSize: '13px', color: WALNUT }}>{p.name}</span>
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
  // board is a transparent cutout, whichever route put it there.
  const cutRequested = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const piece of activeBoard) {
      const source = (piece.image || '').trim();
      if (!source || isTransparentCutout(source) || cutRequested.current.has(source)) continue;
      cutRequested.current.add(source);
      applyBoardCutout(fittingKey, piece, source);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBoard]);

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

  const { data: radarRows, loading: radarRowsLoading, refresh: refreshRadarRows } = window.useWorkspaceDB<RadarItem>('radar_items', {
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 50,
  });
  useEffect(() => {
    if (!radarRowsLoading && radarRows) fittingReserveFetchedAt = Date.now();
  }, [radarRows, radarRowsLoading]);
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

  // Re-activating the tab refreshes the saved shelf only when it is stale.
  useEffect(() => {
    const onActivated = (event: Event) => {
      if ((event as CustomEvent).detail?.tab !== 'fitting-room') return;
      if (Date.now() - fittingReserveFetchedAt > FITTING_RESERVE_STALE_MS) refreshRadarRows();
    };
    window.addEventListener('ethaion:tab-activated', onActivated);
    return () => window.removeEventListener('ethaion:tab-activated', onActivated);
  }, [refreshRadarRows]);
  useEffect(() => {
    const onChanged = () => {
      fittingReserveFetchedAt = 0;
      refreshRadarRows();
    };
    window.addEventListener(RESERVE_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(RESERVE_CHANGED_EVENT, onChanged);
  }, [refreshRadarRows]);

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

  const copy = entry.copy;
  const outfitName = copy?.name || (composing ? 'Beau is dressing you\u2026' : activeBoard.length > 0 ? `The ${dayName} Fitting` : 'Nothing on board yet');
  const bodyTag = [profile?.build, profile?.height_range, dayName, meta.label].filter(Boolean).join(' · ');
  const outfitDescription =
    copy?.description ||
    entry.reasoning ||
    (pieces.length < 3
      ? 'Log a few pieces in The Ledger and Beau will dress this board for you — until then, tap anything below to put it on.'
      : 'Tap a day or an occasion and Beau re-dresses board from the pieces you own.');
  const styleNotes = copy?.notes && copy.notes.length > 0
    ? copy.notes
    : ['Tap a piece below to put it on board — tap it again to take it off.',
       'Drag a piece to nudge it into place; board keeps the arrangement.',
       'Anything that isn\u2019t yours draws dashed, so board never flatters you.'];
  const avoidNotes = [
    ...(entry.gapNote ? [entry.gapNote] : []),
    ...(copy?.avoid && copy.avoid.length > 0
      ? copy.avoid
      : ['Don\u2019t double up a zone — one top, one bottom, one pair of shoes.',
         'Don\u2019t count a dashed piece as worn — it isn\u2019t in your Ledger yet.']),
  ].slice(0, 4);

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
      <FittingContextBar right={`The Fitting · ${dayName}`} />

      {/* 3 · THE BAND — the days (with the swap alternatives beneath them),
          the fitting, the notes. The left column widened so the alternatives
          read comfortably under the compact day rail (founder's correction). */}
      <div className="px-6 sm:px-10">
        <div className="max-w-[1180px] mx-auto grid grid-cols-1 lg:grid-cols-[176px_minmax(0,1fr)_220px] xl:grid-cols-[188px_minmax(0,1fr)_232px] items-stretch">
          <div className="lg:border-r border-[rgba(59,43,29,0.18)] flex flex-col min-w-0">
            <DayRail days={railDays} />
            {/* THE ALTERNATIVES — COMMENTED OUT (founder's request, August
                2026): the swap-alternatives section is hidden from view but
                kept intact so it can be restored later. Remove this comment
                wrapper to bring it back. */}
            {/*
            <div className="hidden lg:block" style={{ padding: '16px 14px 24px 0' }}>
              <SectionRule>Swap alternatives</SectionRule>
              {swaps.length > 0 ? (
                <div className="flex flex-col">
                  {swaps.map(({ piece, why }) => (
                    <SwapRow
                      key={piece.key}
                      swatch={swatchForPiece(piece.name, ownedColors.get(piece.key) || null)}
                      name={piece.name}
                      why={why}
                      onClick={() => toggleOnBoard(piece)}
                      title={`Put it on board — ${piece.name}`}
                    />
                  ))}
                </div>
              ) : (
                <p style={{ ...body(12.5, MUTED), margin: '12px 0 0' }}>
                  Everything you own that suits this look is already on board — log more pieces in The Ledger and
                  the swaps appear here.
                </p>
              )}
            </div>
            */}
          </div>

          {/* THE FITTING ITSELF */}
          <div
            className="relative flex flex-col min-w-0 lg:border-r border-[rgba(59,43,29,0.18)]"
            style={{ background: CANVAS, padding: '26px 22px 22px' }}
            data-tour="tour-fitting-board"
          >
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <span className="inline-flex items-center gap-2" style={fitLabel(9.5, MUTED, '0.16em')}>
                <span aria-hidden="true" style={{ width: '5px', height: '5px', borderRadius: '50%', background: ACCENT, display: 'inline-block' }} />
                {seasonLabel}
              </span>
              <span style={fitLabel(9.5, ACCENT_DEEP, '0.16em')}>{meta.label}</span>
            </div>

            {/* THE COLOUR HARMONY — read off the pieces on the board. */}
            <div style={{ marginTop: '16px' }}>
              <SectionRule right={dayName}>Colour harmony</SectionRule>
              <HarmonyBars colors={harmony} />
            </div>

            {/* THE OUTFIT — the real cutouts, named at both edges. The
                canvas is HALF its former height (founder's correction): it
                closes roughly where the day rail beside it ends. */}
            <section
              aria-label="The outfit on board"
              className="relative mx-auto w-full"
              style={{ marginTop: '10px', minHeight: '190px' }}
            >
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '46%',
                  transform: 'translate(-50%,-50%)',
                  width: '170px',
                  height: '170px',
                  borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(251,248,241,0.9) 0%, rgba(244,238,227,0) 70%)',
                  pointerEvents: 'none',
                }}
              />
              <div className="relative" style={{ zIndex: 2 }}>
                <AnnotatedBoard pieces={activeBoard}>
                  <StyledOutfitBoard
                    pieces={activeBoard}
                    onRemove={removeFromBoard}
                    seed={`fitting-${fittingKey}`}
                    canvasMaxWidth="340px"
                  />
                </AnnotatedBoard>
              </div>
              {composing && (
                <div
                  className="absolute inset-0 z-20 flex flex-col items-center justify-center text-center px-8"
                  style={{ background: 'rgba(244,238,227,0.78)' }}
                  aria-live="polite"
                >
                  <span className="block w-12 h-[3px] bg-[var(--color-accent,#a8712c)] animate-pulse" aria-hidden="true" />
                  <p style={{ fontFamily: SERIF, fontSize: '20px', lineHeight: 1.3, maxWidth: '28ch', color: WALNUT, marginTop: '16px' }}>
                    Beau is dressing you for {dayName.toLowerCase()}…
                  </p>
                </div>
              )}
            </section>

            {/* THE LOOK'S OWN LINE — set three line-breaks lower than the
                canvas above it (founder's correction). */}
            <div className="text-center" style={{ marginTop: 'calc(10px + 3em)' }}>
              <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontWeight: 400, fontSize: '28px', lineHeight: 1.1, color: WALNUT }}>
                {outfitName}
              </div>
              <div style={{ ...fitLabel(8, MUTED, '0.2em'), marginTop: '7px' }}>{bodyTag}</div>
              <p style={{ ...body(12, INK), margin: '14px auto 0', maxWidth: '66ch', lineHeight: 1.65 }}>{outfitDescription}</p>

              {/* THE HONEST GAP — the wardrobe cannot dress this occasion
                  properly; the fitting says so plainly and points at Beau's
                  picks for the missing pieces at the foot of the page. */}
              {insufficient && (
                <div
                  style={{
                    margin: '18px auto 0',
                    maxWidth: '440px',
                    border: `1px solid ${RULE}`,
                    background: PAPER,
                    padding: '14px 16px 15px',
                  }}
                >
                  <div style={{ fontFamily: SERIF, fontSize: '17px', lineHeight: 1.3, color: WALNUT }}>
                    You don’t have the pieces for {meta.label.toLowerCase()} yet.
                  </div>
                  {entry.gapNote && <p style={{ ...body(12, MUTED), margin: '7px 0 0' }}>{entry.gapNote}</p>}
                  <p style={{ ...body(12, MUTED), margin: '7px 0 0' }}>
                    Beau’s picks for the missing pieces close this page — and sit in The Hunt → Beau’s Picks under
                    their categories.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* THE NOTES — the alternatives moved under the day rail on a
              desktop; on a phone they keep their old place here. */}
          <aside aria-label="Notes on this look" style={{ background: PAPER, padding: '26px 16px 32px' }}>
            <SectionRule>Style notes</SectionRule>
            <NoteList notes={styleNotes} />

            {/* SWAP ALTERNATIVES (phone) — COMMENTED OUT (founder's
                request, August 2026); kept intact to restore later. */}
            {/*
            <div className="lg:hidden">
              <SectionRule className="mt-8">Swap alternatives</SectionRule>
              {swaps.length > 0 ? (
                <div className="flex flex-col">
                  {swaps.map(({ piece, why }) => (
                    <SwapRow
                      key={piece.key}
                      swatch={swatchForPiece(piece.name, ownedColors.get(piece.key) || null)}
                      name={piece.name}
                      why={why}
                      onClick={() => toggleOnBoard(piece)}
                      title={`Put it on board — ${piece.name}`}
                    />
                  ))}
                </div>
              ) : (
                <p style={{ ...body(12.5, MUTED), margin: '12px 0 0' }}>
                  Everything you own that suits this look is already on board — log more pieces in The Ledger and
                  the swaps appear here.
                </p>
              )}
            </div>
            */}

            <SectionRule className="mt-8">What not to do</SectionRule>
            <AvoidList notes={avoidNotes} />
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
                  Everything you can dress the fitting in: what you own, what you saved in the Hunt, and what Beau has
                  put up. Tap a piece to put it on — tap again, drag it out, or use the × to take it off.
                </p>
              </div>
              <span style={fitLabel(9, ACCENT_DEEP, '0.16em')}>
                {activeBoard.length > 0
                  ? `${activeBoard.length} piece${activeBoard.length === 1 ? '' : 's'} on board`
                  : 'Nothing on board yet'}
              </span>
            </div>

            <Shelf title="Yours · logged in the Ledger" note={shelfNote(ownedPieces)}>
              {ownedPieces.length > 0 ? (
                ownedPieces.map((piece) => (
                  <ShelfCard
                    key={piece.key}
                    piece={piece}
                    selected={selectedKeys.has(piece.key)}
                    onTap={() => toggleOnBoard(piece)}
                  />
                ))
              ) : (
                <ShelfEmpty>Nothing logged yet — photograph or search a piece in The Ledger.</ShelfEmpty>
              )}
            </Shelf>

            <Shelf title="Saved · watched in the Hunt" note={shelfNote(radarPieces)}>
              {radarPieces.length > 0 ? (
                radarPieces.map((piece) => (
                  <ShelfCard
                    key={piece.key}
                    piece={piece}
                    selected={selectedKeys.has(piece.key)}
                    onTap={() => toggleOnBoard(piece)}
                  />
                ))
              ) : (
                <ShelfEmpty>Nothing saved yet — watch a piece in The Hunt and it appears here.</ShelfEmpty>
              )}
            </Shelf>

            <Shelf title="Beau’s picks · not yours yet" note={shelfNote(beauPicks)}>
              {beauPicks.length > 0 ? (
                beauPicks.map((piece) => (
                  <ShelfCard
                    key={`picks-${piece.key}`}
                    piece={piece}
                    selected={selectedKeys.has(piece.key)}
                    onTap={() => toggleOnBoard(piece)}
                  />
                ))
              ) : (
                <ShelfEmpty>Beau has nothing to add yet — log a few pieces in The Ledger and he’ll fill this shelf.</ShelfEmpty>
              )}
            </Shelf>

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
                    See them in The Hunt · Beau’s Picks →
                  </button>
                </div>
                <p style={{ ...body(12.5, MUTED), margin: '10px 0 0', maxWidth: '70ch' }}>
                  You don’t have the pieces for {meta.label.toLowerCase()} yet — these fill the gaps. Tap one to try
                  it on the board; the same recommendations live in The Hunt under their categories.
                </p>
                <div className="flex flex-wrap gap-x-6 gap-y-7" style={{ paddingTop: '18px' }}>
                  {missingPicks.map((piece) => (
                    <ShelfCard
                      key={`missing-${piece.key}`}
                      piece={piece}
                      selected={selectedKeys.has(piece.key)}
                      onTap={() => toggleOnBoard(piece)}
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
        note="Tap a day or an occasion and the fitting re-dresses"
      />
    </div>
  );
}

export default FittingRoomTab;
