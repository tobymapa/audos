/**
 * The Fitting — ONE shared canvas with three entry points (Fitting overhaul):
 *
 *   · MANUAL ("Build a look" on The Ledger)  → empty board, built from scratch
 *   · TODAY  ("Beau · Today" on The Ledger)  → pre-filled board + reasoning strip
 *   · TRIP   ("Plan for a trip" row on The Ledger) → the brief form HERE,
 *     then a multi-day board set + packing list
 *
 * LAYOUT (the Design5 rebuild): ONE natural vertical scroll, drawn as the
 * reference sets it — top to bottom:
 *   1 the CONTEXT BAR (the SHARED location + weather, "Change location",
 *     and the tab · day at the right edge) · 2 the SHARED masthead
 *     (tab-header.tsx) carrying the board's segmented control at its right
 *     edge — Today · By hand · Trip · Saved · 3 THE BAND, three columns:
 *     the DAY RAIL down the left, THE FITTING in the middle (season ·
 *     source, the colour harmony read off the pieces on the board, THE
 *     OUTFIT ITSELF — the real cutout garments on the flat-lay canvas,
 *     annotated at both edges, never a silhouette — then its name, the
 *     build it was drawn for, Beau's note and the quick adjustments), and
 *     the NOTES column at the right (Style notes · Swap alternatives ·
 *     What not to do, with the one acquisition line beneath) · 4 the
 *     action row (Save · Start an empty board · Share · the saved library)
 *     · 5 THE BOARD — the shelves the fitting is dressed from, each in the
 *     reference's tile grid; Beau's picks carry the oxblood tag and REAL
 *     product imagery (og:image, then a looked-up product photograph —
 *     never an empty named box) · [trip only] the packing list · 6 the
 *     inline SAVED section · 7 the closing legend.
 *
 * The layout furniture — the context bar, the segmented control, the day
 * rail, the harmony strip, the note lists and the shelf headers — lives in
 * fitting-design.tsx; every colour and type helper comes from index-style.
 *
 * THE BOARD is multi-select (Part 3.4): tapping a shelf piece adds it,
 * tapping it again takes it off, and every selected piece sits on the board
 * at once on a genuine flat-lay canvas (flat-view StyledOutfitBoard):
 * absolutely positioned cutouts in fixed category ZONES — head, torso,
 * waist, legs, feet, accessories column — upright at zero rotation, so the
 * same outfit always re-opens identically. Pieces from the Reserve and Beau's picks are retail
 * photography, so their backgrounds are removed before they are drawn on
 * the board (Part 3.5); shelf thumbnails stay as shot.
 *
 * Saved outfits and Reserve items live in the inline Saved section at the
 * foot of the same scroll.
 *
 * CACHING (global tab-caching fix, Part 3): the composed canvas persists at
 * module level (fitting-room-state saveFittingCanvas/loadFittingCanvas), the
 * Today board is cached per day + wardrobe (today-board.ts) and trip board
 * sets per brief + wardrobe — tab navigation NEVER re-runs a model call.
 * Quick-adjust chips are the explicit refinement path (one targeted change
 * per tap); manual boards never call the model at all.
 *
 * Oxblood #7d2a24 (--color-accent-2) is Beau's voice colour here: the
 * "Beau's pick" tags, the reasoning strip and the quick-adjust chips.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Pin, X } from 'lucide-react';
import {
  RESERVE_CHANGED_EVENT,
  WARDROBE_CATEGORIES,
  buildCuratedFeed,
  categoryLabel,
  fetchMaterials,
  insertRadarItem,
  type CategoryBudget,
  type RadarItem,
  type StylePrefs,
  type StyleProfile,
  type WardrobePiece,
} from './profile-data';
import { hierarchyGate, itemPassesGate } from './wardrobe-model';
import { pieceNameType } from './piece-typography';
import {
  FITTING_BOARD_EVENT,
  FITTING_PIECE_EVENT,
  cachedTripBoards,
  consumePendingFittingBoard,
  consumePendingFittingPiece,
  loadFittingCanvas,
  rememberTripBoards,
  resolveGarmentImage,
  saveFittingCanvas,
  type FittingBoardHandoff,
  type FittingBoardSource,
  type FittingPiece,
  type TripBrief,
} from './fitting-room-state';
import {
  StyledOutfitBoard,
  boardPieceFrom,
  composeFlatLayBoard,
  parsePieces,
  type BoardPiece,
} from './flat-view';
import { bodyOrderRank } from './body-order';
import { MONO, capWord, numberWord, usePlexMono } from './mono-type';
import {
  flatLayAssetForShelf,
  isTransparentCutout,
  peekBoardCutout,
  peekFlatLayAsset,
  prepareProductPhoto,
} from './photo-enhance';
import { extractFromUrl } from './discovery-ai';
import { cutoutVariantFor } from './cutout-server';
import { flatLayAssetForProduct, ingestProductInBackground } from './flat-lay-sourcing';
import {
  cappedImageUrl,
  peekProductImage,
  productImageSrcSet,
  productImageWidth,
  resolveProductImage,
} from './product-images';
import { sortByCategoryOrder } from './category-order';
import { primaryBuyUrl } from './rail-subcategories';
import {
  ADJUSTMENT_LABELS,
  composeTripBoards,
  type BoardAdjustment,
  type TripBoards,
} from './fitting-ai';
import { getTodayBoard, peekTodayBoard, rememberTodayBoard } from './today-board';
import { TripBriefForm } from './trip-card';
import { SavedLooksScreen } from './saved-looks';
import { useBeauReveal } from './beau-reveal';
import { sharedWeatherPromptLine } from './weather-context';
import { fetchPieceWarmth, type PieceWarmth } from './warmth-model';
import { TabHeader } from './tab-header';
import {
  ACCENT,
  ACCENT_DEEP,
  CANVAS,
  HAIRLINE,
  INK,
  MUTED,
  PAGE,
  PAPER,
  SERIF,
  WALNUT,
  body,
} from './index-style';
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
  colourFamily,
  colourNameForPiece,
  label as fitLabel,
  swatchForPiece,
  type ColourFamily,
  type RailDay,
  type SegmentedItem,
} from './fitting-design';

/** The week, Monday first — the day rail's own order. */
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** The season the fitting is being dressed for, from the month (northern
 * hemisphere — the same reading Beau's copy makes elsewhere). */
function seasonOf(date: Date): string {
  const m = date.getMonth();
  if (m <= 1 || m === 11) return 'Winter';
  if (m <= 4) return 'Spring';
  if (m <= 7) return 'Summer';
  return 'Autumn';
}

/** THE AVATAR PATH IS DELETED (design handoff §dead-code): the flat lay
 * replaced the try-on figure — lib/tryon, the render lifecycle, the pinned-
 * piece layer, the Avatar/Flat switcher and the tryon_renders cache are all
 * gone. The mode TYPE survives as a constant so the shelf-card prop shape
 * is unchanged. */
type FitMode = 'avatar' | 'flat';
const FITTING_MODE: FitMode = 'flat';

/** Beau's voice colour — everything Beau-initiated on this screen. */
const OXBLOOD = 'var(--color-accent-2,#7d2a24)';

// window.__workspaceDb is auto-injected by the platform compiler when it sees
// this literal token in app source.
function db(): any {
  return (window as any).__workspaceDb;
}

/** When the Fitting's Reserve shelf rows last arrived — re-activating the
 * tab refreshes them only past this staleness window (tab-switch fix). */
const FITTING_RESERVE_STALE_MS = 60_000;
let fittingReserveFetchedAt = 0;



// ---------------------------------------------------------------------------
// The three-level shelf — What you own · In your Reserve · Beau's picks.
// Three SECTION toggles (all on by default) show or hide whole sections.
// They are deliberately DISTINCT in style from category chips: active =
// walnut fill with paper text, inactive = paper fill with a walnut hairline.
// ---------------------------------------------------------------------------

type ShelfSectionId = 'owned' | 'reserve' | 'picks';

const SHELF_SECTIONS: Array<{ id: ShelfSectionId; label: string }> = [
  { id: 'owned', label: 'Yours' },
  { id: 'reserve', label: 'Weighing' },
  { id: 'picks', label: 'Beau\u2019s picks' },
];

/** The CATEGORY filters (Part 3.3) — kept from before and deliberately
 * distinct from the section toggles above them: smaller, lighter, hairline
 * only. Source toggles decide which SECTIONS show; these filter WITHIN the
 * visible sections. */
const SHELF_CATEGORIES: Array<{ id: string; label: string; match: string[] }> = sortByCategoryOrder(
  [
    { id: 'tops', label: 'Tops', match: ['tops', 'base-layers'] },
    { id: 'bottoms', label: 'Bottoms', match: ['bottoms'] },
    { id: 'shoes', label: 'Shoes', match: ['shoes'] },
    { id: 'outerwear', label: 'Outerwear', match: ['outerwear'] },
    { id: 'knitwear', label: 'Knitwear', match: ['knitwear'] },
    { id: 'sweatshirts', label: 'Sweatshirts', match: ['sweatshirts'] },
    { id: 'formalwear', label: 'Formalwear', match: ['formalwear'] },
    { id: 'accessories', label: 'Accessories', match: ['accessories', 'bags', 'hats'] },
  ],
  (cat) => cat.id,
);

/** Roughly how wide one shelf tile renders, in CSS px — the grid runs three
 * up on a phone and six up on a wide panel, so this is the widest case. Only
 * used to pick a delivered file size, never to lay anything out. */
const SHELF_TILE_WIDTH = 200;

/** The tile's share of the viewport at each grid breakpoint below — lets the
 * browser choose between the srcSet widths instead of always taking the
 * largest. Kept in step with the `grid-cols-3 sm:grid-cols-4 md:grid-cols-6`
 * shelf grid. */
const SHELF_TILE_SIZES = '(min-width: 768px) 16vw, (min-width: 640px) 24vw, 32vw';

function pieceInCategory(piece: FittingPiece, categoryId: string): boolean {
  const cat = (piece.category || '').toLowerCase();
  const entry = SHELF_CATEGORIES.find((c) => c.id === categoryId);
  return !!entry && entry.match.includes(cat);
}

/**
 * The shelf thumbnail — the SAME 4:5 proportion every product image in the
 * app uses (product-photo.tsx), so a shelf of pieces from four different
 * retailers reads as one grid instead of a run of mismatched boxes.
 *
 * NO BLEND TRICKS, EVER. Retailers publish pack shots on a white studio
 * ground; an earlier pass hid that ground with `mix-blend-mode: multiply`,
 * which is a display-layer trick — it tints the garment, does nothing for a
 * lifestyle background, and breaks on any dark panel. The rule now (evaluated
 * at render, in force from the very first paint): a STORED transparent cutout
 * from the ingestion pipeline is drawn bare on the shelf's own paper, and a
 * photograph the pipeline has not cut yet is NEVER shown raw and never plated
 * on a white box (the universal transparency rule) — the flat processing tone
 * holds the tile's space until its real cutout lands.
 *
 * NO FRAME AND NO GROUND EITHER. The plate treatment (a mat border and sepia)
 * is gone from the shelf, and so is the warm-stone fill that used to sit under
 * the photograph while it loaded: on a shelf of Reserve pieces and Beau's
 * picks that fill WAS the pale rectangle behind every product, and it only
 * disappeared once the image had loaded (or, if the image never loaded, not at
 * all). The 4:5 box holds the grid's shape on its own, so nothing reflows when
 * a photograph lands and nothing is ever painted behind the product.
 *
 * The image chain is what makes Reserve pieces and Beau's picks show the
 * REAL product's photography instead of a named empty box (Part 1.3):
 *   1. a direct garment image (owned pieces, already cut out);
 *   2. the retailer's own og:image, via the product URL;
 *   3. the real product image web-resolved by brand + name
 *      (product-images.ts — the brand's own site and quality retailers
 *      first, cached so it never re-fetches on a revisit);
 *   4. the walnut-bordered paper rectangle — never an illustration, never
 *      an unrelated image.
 *
 * CRITICAL (the empty-box fix): a URL that RESOLVES but fails to LOAD —
 * retailers routinely block hotlinked og:images — now advances to the NEXT
 * source in the chain instead of dead-ending. That dead-end (onError →
 * blank) was what left Beau's picks as empty boxes with only names.
 */
function ShelfThumb({ piece }: { piece: FittingPiece }) {
  const failed = useRef<Set<string>>(new Set());
  const [img, setImg] = useState((piece.garmentImageUrl || '').trim());

  // The ordered source chain, skipping anything that already failed to load.
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
    // THE SHELF PIPELINE: retail photography — Reserve pieces and Beau's
    // picks — is ingested by the same pipeline the board uses. The original
    // photograph paints first so nothing waits; the STORED transparent PNG
    // replaces it the moment it lands, and an item ingested on any earlier
    // visit or device answers from its stored row before the first paint.
    // Owned pieces already come off the wardrobe pipeline clean, so they skip
    // it.
    // WHICH PHOTOGRAPH GETS CUT is not this grid's decision:
    // ingestProductInBackground (flat-lay-sourcing.ts) is the ONE shared rule
    // — resolve the ranked candidates, classify them, select the person-free
    // plain-ground framing, then ingest, all of it on the idle queue — so this
    // shelf, The Rail's picks and World of Menswear's cards source the same
    // way. Nothing here re-implements the selection.
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

  // A broken image (hotlink-blocked, stale URL) falls through the chain.
  const onBroken = () => {
    if (img) failed.current.add(img);
    setImg('');
    void resolveNext().then((url) => {
      if (url) setImg(url);
    });
  };

  // Never below the 800px floor, however small the tile renders — these are
  // the images that looked soft when a piece was opened or zoomed.
  const width = productImageWidth(SHELF_TILE_WIDTH);
  const srcSet = img ? productImageSrcSet(img, width) : '';

  // A STORED CUTOUT needs no ground at all — it floats on the shelf's own
  // paper. A photograph the pipeline has not cut yet is NEVER shown raw and
  // never plated on a white box (the universal transparency rule): the quiet
  // processing tone holds the tile's space until the stored PNG lands.
  // Evaluated during render, so the tile is right on first paint.
  const cut = !!img && isTransparentCutout(img);
  // THREE SIZES PER CUTOUT (Efficiency §02): a shelf tile reads the stored
  // ~300px variant when ingestion has produced one — seventeen tiles no
  // longer each download the ~900px board hero. Falls back to the hero
  // until variants exist; synchronous, so nothing waits.
  const shownImg = cut ? cutoutVariantFor(img, 'tile') : img;
  return (
    <span
      className="block w-full"
      style={{
        aspectRatio: '4 / 5',
        // The aspect ratio alone reserves the tile's space; while a
        // photograph waits on its cutout the flat processing tone shows,
        // and it falls away the moment the stored PNG lands.
        background: cut || !img ? 'transparent' : '#eadfcb',
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
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            display: 'block',
          }}
          onError={onBroken}
        />
      )}
      {/* Nothing resolved yet — the empty 4:5 box holds the tile's space, so
         the grid never shifts when a photograph lands. NEVER an illustration,
         and never a filled placeholder plate, standing in for a product
         photo. */}
    </span>
  );
}

function ShelfCard({
  piece,
  isPick,
  mode,
  selected,
  onTap,
  onPin,
}: {
  piece: FittingPiece;
  /** Beau's picks carry the oxblood tag; owned pieces carry none. */
  isPick: boolean;
  mode: FitMode;
  /** On the board right now — tapping again takes it off (Part 3.4). */
  selected: boolean;
  onTap: () => void;
  onPin: () => void;
}) {
  return (
    <div className="w-[132px] sm:w-[156px] flex-shrink-0">
      <button
        type="button"
        onClick={onTap}
        aria-pressed={mode === 'flat' ? selected : undefined}
        className="block w-full text-left group relative"
        style={{ background: 'transparent', border: 'none', padding: 0 }}
        title={
          mode === 'avatar'
            ? `See it on your avatar — ${piece.name}`
            : selected
              ? `Take it off the board — ${piece.name}`
              : `Add it to the board — ${piece.name}`
        }
        aria-label={`${mode === 'avatar' ? 'Try on' : selected ? 'Remove from the board' : 'Add to the board'}: ${piece.name}${piece.brand ? ` by ${piece.brand}` : ''}`}
      >
        {/* THE TILE (Design5): the cutout bare on the paper, and the one
            piece already on the board ringed in the accent rather than
            boxed — the ring sits OUTSIDE the photograph, so a shelf of
            pieces still reads as one run. */}
        <span
          className="relative block"
          style={{
            outline: selected && mode === 'flat' ? `1px solid ${ACCENT}` : '1px solid transparent',
            outlineOffset: '6px',
            opacity: selected && mode === 'flat' ? 1 : 0.92,
          }}
        >
          <ShelfThumb piece={piece} />
          {selected && mode === 'flat' && (
            <span
              className="absolute left-0 top-0 z-10"
              style={{ ...fitLabel(8, '#f4eee3', '0.14em'), background: WALNUT, padding: '4px 8px' }}
              aria-hidden="true"
            >
              On the board
            </span>
          )}
        </span>
        <span
          className="block group-hover:underline break-words"
          style={{ fontFamily: SERIF, fontSize: '17px', lineHeight: 1.25, color: WALNUT, marginTop: '10px' }}
        >
          {piece.name}
        </span>
        <span className="block break-words" style={{ ...fitLabel(8.5, isPick ? OXBLOOD : ACCENT, '0.14em'), marginTop: '2px' }}>
          {isPick ? `Beau’s pick · ${piece.brand || '\u2014'}` : piece.brand || '\u2014'}
        </span>
      </button>
      {/* Direct product link (Buy Links overhaul, Part 2.2/2.4): every card
          with a stored URL links to its product page; Beau's picks ALWAYS
          carry one. Wardrobe pieces without a URL skip the link gracefully. */}
      {piece.productUrl && (
        <a
          href={piece.productUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 hover:underline"
          style={{ ...fitLabel(8, ACCENT_DEEP, '0.1em'), marginTop: '6px' }}
          title={`View the product page — ${piece.name}`}
          aria-label={`View the product page for ${piece.name}`}
        >
          View product <span aria-hidden="true" style={{ fontSize: '9px', lineHeight: 1 }}>↗</span>
        </a>
      )}
      {mode === 'avatar' && (
        <button
          type="button"
          onClick={onPin}
          className="mt-1 min-h-[28px] inline-flex items-center gap-1 text-[var(--color-neutral-600,#856c51)] hover:text-[var(--color-accent-700,#7c4a17)] hover:underline transition-colors"
          style={{ fontFamily: 'var(--space-font-family)', fontSize: '11px' }}
          title="Pin it around the figure instead of rendering it on — build a full look"
        >
          <Pin className="w-3 h-3" /> Pin to the look
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TRY SOMETHING NEW (founder's feature) — paste a product page URL and the
// piece appears in the Fitting as a temporary preview: the page is read
// server-side (Open Graph tags + structured data via the shared
// discovery-ai extraction), the primary product image goes through THE ONE
// background-removal pipeline, and the resulting cutout renders as a shelf
// card — tap it to slot it into the outfit for comparison alongside owned
// pieces. NOTHING is kept unless the user taps "Save to Reserve", which
// opens an editable mini-form (name · brand · category · price, prefilled
// from the page) before writing the radar_items row.
// ---------------------------------------------------------------------------

function TryFromUrlSection({
  mode,
  selectedKeys,
  onTap,
  onPin,
}: {
  mode: FitMode;
  selectedKeys: Set<string>;
  onTap: (piece: FittingPiece) => void;
  onPin: (piece: FittingPiece) => void;
}) {
  const [urlDraft, setUrlDraft] = useState('');
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ piece: FittingPiece; url: string } | null>(null);
  // The edit-before-save mini-form — prefilled from the page, editable.
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveBrand, setSaveBrand] = useState('');
  const [saveCategory, setSaveCategory] = useState('');
  const [savePrice, setSavePrice] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  const fetchFromUrl = async () => {
    let url = urlDraft.trim();
    if (!url || fetching) return;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    setFetching(true);
    setError(null);
    setSavedFlash(null);
    try {
      const { draft, pageBlocked } = await extractFromUrl(url, null);
      if (!draft) {
        setError(
          pageBlocked
            ? 'Couldn\u2019t reach that page \u2014 it may be down or blocking readers. Try another link.'
            : 'Couldn\u2019t read a product off that page \u2014 try the product page itself rather than a listing or search page.',
        );
        return;
      }
      const piece: FittingPiece = {
        key: `url-${url}`,
        name: draft.name,
        brand: draft.brand,
        category: draft.category,
        productUrl: url,
        garmentImageUrl: draft.image_url || '',
        note: 'Pasted from a link',
        ctaLabel: 'View the listing',
        ctaUrl: url,
      };
      setPreview({ piece, url });
      setSaveOpen(false);
      setSaveName(draft.name || '');
      setSaveBrand(draft.brand || '');
      setSaveCategory(draft.category || '');
      setSavePrice(draft.price || '');
      // The product image through the SAME ingestion pipeline an uploaded
      // photo takes — the stored cutout is keyed by the source URL, so the
      // shelf card and the board pick it up the moment it lands.
      if (draft.image_url) void prepareProductPhoto(draft.image_url).catch(() => undefined);
    } catch (e) {
      console.warn('[Ethaion] Try-something-new URL read failed:', e);
      setError('Couldn\u2019t read that page \u2014 try again, or another link.');
    } finally {
      setFetching(false);
    }
  };

  const saveToReserve = async () => {
    if (!preview || saveBusy || !saveName.trim()) return;
    setSaveBusy(true);
    try {
      await insertRadarItem({
        name: saveName.trim(),
        brand: saveBrand.trim() || null,
        color: null,
        size: null,
        notes: 'Saved from a link in The Fitting',
        price_seen: savePrice.trim() || null,
        product_url: preview.url,
        category: saveCategory || null,
        watch_price: true,
        source: 'fitting',
      });
      setSaveOpen(false);
      setSavedFlash('Saved to your Reserve \u2014 it\u2019s under \u201cWeighing\u201d below.');
    } catch (e) {
      console.warn('[Ethaion] saving the previewed piece to the Reserve failed:', e);
      setError('Couldn\u2019t save that to the Reserve \u2014 try again.');
    } finally {
      setSaveBusy(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    fontFamily: 'var(--space-font-family)',
    fontSize: '14px',
    border: '1px solid var(--color-divider,rgba(59,43,29,0.18))',
    borderRadius: 0,
    background: 'var(--color-paper,#fbf8f1)',
    padding: '8px 10px',
  };

  return (
    <section aria-label="Try something new" className="pt-5">
      <p
        className="uppercase text-[var(--color-neutral-700,#634e38)] pb-2 border-b border-[var(--color-divider,rgba(59,43,29,0.18))]"
        style={{ fontFamily: 'var(--space-font-heading)', fontSize: '12px', letterSpacing: '0.16em' }}
      >
        Try something new
      </p>
      <div className="flex items-center gap-2 flex-wrap pt-2.5">
        <input
          type="url"
          value={urlDraft}
          onChange={(e) => setUrlDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void fetchFromUrl();
            }
          }}
          placeholder="https://… (the product page)"
          aria-label="Product page URL to preview"
          className="flex-1 min-w-[14rem] min-h-[44px] focus:outline-none focus:border-[var(--color-accent,#a8712c)] text-[var(--color-text,#241a12)] placeholder:text-[var(--color-neutral-500,#a68e70)]"
          style={inputStyle}
        />
        <button
          type="button"
          onClick={() => void fetchFromUrl()}
          disabled={!urlDraft.trim() || fetching}
          className="px-4 min-h-[44px] inline-flex items-center gap-1.5 border border-[var(--color-accent,#a8712c)] text-[var(--color-accent-700,#7c4a17)] hover:bg-[var(--color-accent-100,#fbf1de)] transition-colors disabled:opacity-40"
          style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', borderRadius: 0 }}
        >
          {fetching && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {fetching ? 'Reading the page…' : 'Preview it'}
        </button>
      </div>
      {error && (
        <p className="pt-2" style={{ fontFamily: 'var(--space-font-family)', fontSize: '12.5px', color: OXBLOOD }}>
          {error}
        </p>
      )}

      {preview && (
        <div className="flex items-start gap-4 sm:gap-6 flex-wrap pt-4">
          {/* The previewed piece — the same shelf card as everything else:
              tap to slot it into the outfit, tap again to take it off. */}
          <div className="w-[31%] min-w-[110px] max-w-[170px] flex-shrink-0">
            <ShelfCard
              piece={preview.piece}
              isPick={false}
              mode={mode}
              selected={selectedKeys.has(preview.piece.key)}
              onTap={() => onTap(preview.piece)}
              onPin={() => onPin(preview.piece)}
            />
          </div>
          <div className="flex-1 min-w-[220px]">
            <p className="text-[var(--color-neutral-600,#856c51)]" style={{ fontFamily: 'var(--space-font-family)', fontSize: '12.5px', lineHeight: 1.55 }}>
              Tap the piece to slot it into the outfit for comparison — tap it again to take it off. It’s a
              preview only until you save it.
            </p>
            {savedFlash ? (
              <p className="pt-2" style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', color: 'var(--color-accent-700,#7c4a17)' }}>
                {savedFlash}
              </p>
            ) : !saveOpen ? (
              <div className="flex items-center gap-3 flex-wrap pt-3">
                <button
                  type="button"
                  onClick={() => setSaveOpen(true)}
                  className="px-4 min-h-[42px] inline-flex items-center gap-1.5 border border-[var(--color-accent,#a8712c)] text-[var(--color-accent-700,#7c4a17)] hover:bg-[var(--color-accent-100,#fbf1de)] transition-colors"
                  style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', borderRadius: 0 }}
                  title="Keep this piece — check the details, then it goes to your Reserve"
                >
                  Save to Reserve
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPreview(null);
                    setUrlDraft('');
                    setError(null);
                  }}
                  className="min-h-[42px] px-1.5 hover:underline text-[var(--color-neutral-600,#856c51)]"
                  style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px' }}
                  title="Drop the preview — nothing is kept"
                >
                  Dismiss
                </button>
              </div>
            ) : (
              <div className="pt-3 space-y-2.5" style={{ maxWidth: '30rem' }}>
                <p className="text-[var(--color-neutral-700,#634e38)]" style={{ fontFamily: 'var(--space-font-family)', fontSize: '12.5px' }}>
                  Check the details before it goes on the Reserve — correct anything Beau misread.
                </p>
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="Piece name"
                  aria-label="Piece name"
                  className="w-full focus:outline-none focus:border-[var(--color-accent,#a8712c)] text-[var(--color-text,#241a12)]"
                  style={inputStyle}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    value={saveBrand}
                    onChange={(e) => setSaveBrand(e.target.value)}
                    placeholder="Brand (optional)"
                    aria-label="Brand"
                    className="w-full focus:outline-none focus:border-[var(--color-accent,#a8712c)] text-[var(--color-text,#241a12)]"
                    style={inputStyle}
                  />
                  <input
                    type="text"
                    value={savePrice}
                    onChange={(e) => setSavePrice(e.target.value)}
                    placeholder="Price seen, e.g. £149 (optional)"
                    aria-label="Price seen"
                    className="w-full focus:outline-none focus:border-[var(--color-accent,#a8712c)] text-[var(--color-text,#241a12)]"
                    style={inputStyle}
                  />
                </div>
                <div className="flex flex-wrap gap-1">
                  {WARDROBE_CATEGORIES.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSaveCategory(saveCategory === c.id ? '' : c.id)}
                      className="px-2 py-0.5 border transition-colors"
                      style={{
                        fontFamily: 'var(--space-font-family)',
                        fontSize: '10.5px',
                        borderRadius: '4px',
                        ...(saveCategory === c.id
                          ? { background: 'var(--color-accent-100,#fbf1de)', color: 'var(--color-accent-700,#7c4a17)', borderColor: 'var(--color-accent,#a8712c)' }
                          : { background: 'transparent', color: 'var(--color-neutral-600,#856c51)', borderColor: 'var(--color-divider,rgba(59,43,29,0.18))' }),
                      }}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={() => void saveToReserve()}
                    disabled={saveBusy || !saveName.trim()}
                    className="px-4 min-h-[42px] inline-flex items-center gap-1.5 border border-[var(--color-accent,#a8712c)] text-[var(--color-accent-700,#7c4a17)] hover:bg-[var(--color-accent-100,#fbf1de)] transition-colors disabled:opacity-40"
                    style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', borderRadius: 0 }}
                  >
                    {saveBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Save to Reserve
                  </button>
                  <button
                    type="button"
                    onClick={() => setSaveOpen(false)}
                    disabled={saveBusy}
                    className="min-h-[42px] px-1.5 hover:underline text-[var(--color-neutral-600,#856c51)] disabled:opacity-50"
                    style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// The reasoning strip — AI-originated boards only. Beau's voice: oxblood
// italic line over an oxblood hairline, dismissible without touching the
// outfit. Used for the per-board reasoning AND the trip-level gap note.
// ---------------------------------------------------------------------------

function ReasoningStrip({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  const [expanded, setExpanded] = useState(false);
  // Beau "typing" (Part 3.2): a freshly composed or adjusted reasoning line
  // types on progressively; a restored canvas shows its line instantly.
  const shown = useBeauReveal(text);
  const long = text.length > 90;
  return (
    <div
      className="flex items-start gap-2"
      aria-live="polite"
      style={{ borderLeft: `2px solid ${OXBLOOD}`, paddingLeft: '12px' }}
    >
      <p
        className={`flex-1 min-w-0 italic ${expanded || !long ? '' : 'truncate'}`}
        style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', lineHeight: 1.5, color: OXBLOOD }}
      >
        {shown}
      </p>
      {long && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex-shrink-0 hover:underline"
          style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px', color: OXBLOOD }}
        >
          more
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Hide Beau’s note"
        title="Hide the note — the outfit stays"
        className="flex-shrink-0 w-6 h-6 -mt-0.5 flex items-center justify-center hover:opacity-70"
        style={{ color: OXBLOOD }}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/**
 * THE OUTFIT'S NOTE (Design5) — the paragraph under the fitting's name.
 * When Beau composed the board it is HIS reasoning, revealed as he writes
 * it; otherwise it is the board's own standing line.
 */
function BoardNote({ text, live }: { text: string; live: boolean }) {
  const shown = useBeauReveal(text);
  return (
    <p style={{ ...body(14.5, INK), margin: '18px auto 0', maxWidth: '60ch' }}>{live ? shown : text}</p>
  );
}

// ---------------------------------------------------------------------------
// The quick-adjust chips — AI-originated boards only, in Beau's oxblood.
// Each chip re-calls the reasoning endpoint with ONE added constraint; the
// result is a targeted slot change, never a full regeneration.
// ---------------------------------------------------------------------------

const ADJUSTMENTS: BoardAdjustment[] = ['warmer', 'cooler', 'more-casual', 'more-formal', 'swap-shoes', 'swap-top'];

function AdjustChips({
  busy,
  onAdjust,
}: {
  busy: BoardAdjustment | null;
  onAdjust: (adjustment: BoardAdjustment) => void;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-1.5" style={{ paddingTop: '16px' }} aria-label="Quick adjustments">
      {ADJUSTMENTS.map((adj) => (
        <button
          key={adj}
          type="button"
          onClick={() => onAdjust(adj)}
          disabled={busy != null}
          className="flex-shrink-0 inline-flex items-center gap-1.5 bg-transparent transition-opacity hover:opacity-75 disabled:opacity-50"
          style={{
            ...fitLabel(8.5, OXBLOOD, '0.14em'),
            padding: '9px 14px',
            borderRadius: 0,
            border: `1px solid ${OXBLOOD}`,
          }}
          title={`Ask Beau: ${ADJUSTMENT_LABELS[adj].toLowerCase()} — only the relevant piece changes`}
        >
          {busy === adj && <Loader2 className="w-3 h-3 animate-spin" />}
          {ADJUSTMENT_LABELS[adj]}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Saved rows (the "View saved" drawer)
// ---------------------------------------------------------------------------

interface SavedOutfitRow {
  id: number;
  name: string;
  pieces: unknown;
  /** 'proposal' when the board held a piece the user doesn't own (10a/22a)
   * — a proposal is never an answer to “what shall I wear”. Legacy rows
   * carry 'flat' and are re-derived from their pieces at render. */
  mode?: string | null;
  created_at?: string;
}

// ---------------------------------------------------------------------------
// The tab root
// ---------------------------------------------------------------------------

interface TripDayState {
  label: string;
  /** Every piece on that day's board, in the order they were added. */
  board: BoardPiece[];
  reasoning: string | null;
  reasoningDismissed: boolean;
}

// ---------------------------------------------------------------------------
// TRIP DAY CHIPS (M8): the day row reads as weekdays — Fri · Sat · Sun ·
// Mon — when the brief's dates parse to a start day, falling back to Day n.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// THE BOARD'S EDGE LABELS (10a) — a flat lay, not a stack: every piece is
// named around the board's edge on a dotted leader, with its ZONE in mono
// above the name and its category · maker beneath. Weighing pieces and
// Beau's picks carry their status line, so the board itself says which
// pieces aren't yours. The labels read the SAME zone composition the board
// draws (composeFlatLayBoard) — nothing is re-implemented.
// ---------------------------------------------------------------------------

const annMono: React.CSSProperties = { fontFamily: MONO, fontSize: '8px', letterSpacing: '0.08em', textTransform: 'uppercase' };

/** The 10a zone name for a piece — the same reading the flat-lay's zone
 * system makes, said in the reference's own labels. */
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

/** The status line under a label — only pieces that aren't yours carry one
 * (dashed on the board): Beau's picks, Reserve candidates, pasted previews. */
function boardStatusOf(piece: BoardPiece): string | null {
  if (piece.key.startsWith('owned-')) return null;
  if (piece.key.startsWith('curated-')) return 'Beau\u2019s pick';
  if (piece.key.startsWith('radar-')) return 'Weighing · not yours yet';
  return 'Not yours yet';
}

interface EdgeLabel {
  piece: BoardPiece;
  /** PIXELS from the rail's top — the label's own CENTRE, not its edge. */
  top: number;
  side: 'l' | 'r';
}

interface MeasuredPiece {
  piece: BoardPiece;
  /** The piece's rendered vertical centre, in px from the rail's top. */
  centre: number;
  side: 'l' | 'r';
}

/** A label block's rendered height, near enough to keep two of them apart:
 * the zone line, the name (two lines once it's long enough to wrap at the
 * block's 150px), the category · maker line and the optional status line. */
function labelHeight(piece: BoardPiece): number {
  const nameLines = (piece.name || '').length > 22 ? 2 : 1;
  return 11 + nameLines * 16 + 13 + (boardStatusOf(piece) ? 12 : 0);
}

/**
 * Each label's centre IS its piece's centre — that is the whole rule. The
 * only departure is when two blocks would physically overlap: then the pair
 * is prised apart symmetrically (each moves half the shortfall) so the run
 * stays centred on the pieces it names rather than sliding down the rail.
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
  return a.every((label, i) => label.piece.key === b[i].piece.key && label.side === b[i].side && Math.abs(label.top - b[i].top) < 0.5);
}

/**
 * ONE CALLOUT (Design5): the reference's boxed label on a gold leader — the
 * piece's zone in small caps, its colour chip beside its name, then category
 * · maker, and the status line on anything that isn't yours. The chip reads
 * the colour named in the piece's own title, the same palette the harmony
 * strip is drawn from.
 */
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
        maxWidth: '130px',
        background: PAPER,
        border: `1px solid ${HAIRLINE}`,
        padding: '7px 10px',
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
        <span style={{ fontFamily: SERIF, fontSize: '14.5px', lineHeight: 1.2, color: WALNUT }}>{piece.name}</span>
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
    <div
      className="absolute w-full flex items-center"
      style={{ top: `${label.top}px`, transform: 'translateY(-50%)', gap: '5px' }}
    >
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

/**
 * The board with its 10a annotation rails — names around the edge on dotted
 * leaders (sm and up; a narrow screen lists the pieces beneath).
 *
 * THE LABELS ARE MEASURED, NOT GUESSED (founder's alignment fix). The old
 * version re-ran the composer and expressed each label's top as a percentage
 * of the RAIL, while the piece's top was a percentage of the canvas's inner
 * stage — two different boxes, so the labels splayed away from their pieces
 * and ignored both held-out pieces and any piece the wearer had dragged.
 * Now each rendered piece is read off the DOM by its `data-piece-key`, and
 * its label is placed at that measured centre in pixels and pulled back half
 * its own height — so the midpoint of the label and the midpoint of the piece
 * sit on the same horizontal line, at every width, after every drag.
 */
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
    // The cutouts land asynchronously and the canvas is aspect-ratio sized, so
    // re-measure on the next frame, shortly after, and on every later change.
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
      <div ref={railsRef} className="sm:grid sm:items-stretch sm:grid-cols-[minmax(126px,150px)_minmax(0,1fr)_minmax(126px,150px)] sm:gap-1">
        <div className="hidden sm:block relative" aria-hidden="true">
          {labels.filter((label) => label.side === 'l').map((label) => (
            <EdgeLabelBlock key={label.piece.key} label={label} />
          ))}
        </div>
        <div ref={boardColRef} className="min-w-0">{children}</div>
        <div className="hidden sm:block relative" aria-hidden="true">
          {labels.filter((label) => label.side === 'r').map((label) => (
            <EdgeLabelBlock key={label.piece.key} label={label} />
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
              <span style={{ ...annMono, color: 'var(--color-neutral-500,#a68e70)', width: '74px', flexShrink: 0 }}>{zoneLabelFor(p)}</span>
              <span style={{ fontFamily: 'var(--space-font-heading)', fontSize: '13px', color: 'var(--color-text,#241a12)' }}>{p.name}</span>
              {status && <span style={{ ...annMono, color: 'var(--color-accent-700,#7c4a17)' }}>{status}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// COMPLETE THE LOOK (10a) — beside the board, not under it, because it's
// about the board: swaps and additions from pieces you OWN, each with the
// reason in one line; tap one and it takes the slot. The single acquisition
// line — the one thing you'd need to BUY — is drawn as the exception, in
// its own box beneath.
// ---------------------------------------------------------------------------

interface CompleteLookSuggestion {
  piece: FittingPiece;
  reason: string;
  fillsEmpty: boolean;
}

function piece10aBuyLine(buy: FittingPiece): string {
  const name = [buy.brand, buy.name].filter(Boolean).join(' · ');
  const note = (buy.note || '').trim();
  if (!note) return `${name} would take this exact look further than anything you own.`;
  return `${name} — ${note.charAt(0).toLowerCase()}${note.slice(1)}${/[.!?]$/.test(note) ? '' : '.'}`;
}

const MONTH_STEMS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Read a start date out of free-text dates ("12–15 Sep", "3 Oct"). */
function parseTripStartDate(dates: string): Date | null {
  const m = (dates || '').match(/(\d{1,2})\s*(?:[–—-]\s*\d{1,2})?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/i);
  if (!m) return null;
  const day = Number(m[1]);
  const monthIdx = MONTH_STEMS.indexOf(m[2].toLowerCase());
  if (monthIdx < 0 || !day || day > 31) return null;
  const now = new Date();
  let d = new Date(now.getFullYear(), monthIdx, day);
  // A date months behind us means next year's trip, not last year's.
  if (d.getTime() < now.getTime() - 180 * 24 * 60 * 60 * 1000) d = new Date(now.getFullYear() + 1, monthIdx, day);
  return d;
}

function tripDayChipLabel(brief: TripBrief, index: number): string {
  const start = parseTripStartDate(brief.dates);
  if (start) {
    const d = new Date(start.getTime() + index * 24 * 60 * 60 * 1000);
    return d.toLocaleDateString(undefined, { weekday: 'short' });
  }
  return `Day ${index + 1}`;
}

interface TripState {
  brief: TripBrief;
  days: TripDayState[];
  gapNote: string | null;
  gapDismissed: boolean;
  activeDay: number;
}

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
  // The IBM Plex Mono register — the 10a working labels around the board.
  usePlexMono();
  // One-shot read of the piece another surface opened the tab with — a
  // "Try this on" handoff lands the piece straight on the flat-lay board.
  const pendingRef = useRef<FittingPiece | null | undefined>(undefined);
  if (pendingRef.current === undefined) pendingRef.current = consumePendingFittingPiece();

  // The canvas restored from module memory (the tab-caching fix): switching
  // tabs and coming back paints the exact same board with zero API calls.
  const restoredRef = useRef(loadFittingCanvas());

  // The one view — the flat-lay board (the avatar path is deleted).
  const mode: FitMode = FITTING_MODE;

  // ------------------------------------------------------------------
  // The shared canvas state — source, board, reasoning, trip. Seeded from
  // the module-level canvas memory so tab switches cost nothing.
  // ------------------------------------------------------------------
  const [boardSource, setBoardSource] = useState<FittingBoardSource>(restoredRef.current?.boardSource ?? 'manual');
  // MULTI-SELECT board (Part 3.4): an ordered list, not one piece per slot.
  const [board, setBoard] = useState<BoardPiece[]>(() => {
    const restored = restoredRef.current?.board;
    return Array.isArray(restored) ? (restored as BoardPiece[]) : [];
  });
  const [reasoning, setReasoning] = useState<string | null>(restoredRef.current?.reasoning ?? null);
  // The flat-lay's per-outfit seed (flat-lay overhaul, 5.4): stable across
  // renders and tab switches, so the SAME outfit always lays out the same;
  // it changes only when a genuinely new board context starts.
  const [boardSeed, setBoardSeed] = useState<string>(restoredRef.current?.seed ?? 'board-1');
  const [reasoningDismissed, setReasoningDismissed] = useState(restoredRef.current?.reasoningDismissed ?? false);
  // THE WEATHER GAP NOTE (Today weather-reasoning fix) — set when the
  // candidate filter could not cover a core slot with anything rated for
  // today, so the board is honest about the compromise instead of hiding it.
  const [gapNote, setGapNote] = useState<string | null>(restoredRef.current?.gapNote ?? null);
  const [gapDismissed, setGapDismissed] = useState(restoredRef.current?.gapDismissed ?? false);
  const [trip, setTrip] = useState<TripState | null>((restoredRef.current?.trip as TripState | null) ?? null);
  // The trip BRIEF form (Part 10) — the "Plan for a trip" row on The Ledger
  // opens The Fitting first; the short form lives here, on the board.
  const [tripFormOpen, setTripFormOpen] = useState(false);
  // The LIST tab of the day row (M8): packing list as the fifth chip.
  const [tripList, setTripList] = useState(false);
  // THE SAVED LOOKS SCREEN (22a · M7) — the dedicated two-up library.
  const [savedLooksOpen, setSavedLooksOpen] = useState(false);
  // TRIPS PERSIST (feature pass): the trips WorkspaceDB row this session's
  // trip lives in — composed once, then updated in place as days are edited.
  const tripRowIdRef = useRef<number | null>(null);
  const tripPersistTimer = useRef<number | null>(null);
  const [composing, setComposing] = useState(false);
  const [adjustBusy, setAdjustBusy] = useState<BoardAdjustment | null>(null);
  const [materials, setMaterials] = useState<Record<number, string>>({});
  // Stored warmth/weather-suitability rows (warmth-model.ts) — the candidate
  // filter falls back to inference without them, so this is a refinement, not
  // a dependency.
  const [warmth, setWarmth] = useState<Record<number, PieceWarmth>>({});
  // The three shelf-section toggles — all ON by default (Part 9).
  const [sectionsOn, setSectionsOn] = useState<Record<ShelfSectionId, boolean>>({
    owned: true,
    reserve: true,
    picks: true,
  });
  // The category filters (Part 3.3) — they narrow what shows INSIDE each
  // visible section; empty means everything.
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const toggleCategoryFilter = (id: string) =>
    setCategoryFilters((cur) => (cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id]));
  const filterShelf = (list: FittingPiece[]): FittingPiece[] =>
    categoryFilters.length === 0 ? list : list.filter((p) => categoryFilters.some((c) => pieceInCategory(p, c)));

  // Persist the canvas at module level on every change (tab-caching fix).
  useEffect(() => {
    saveFittingCanvas({ boardSource, board, reasoning, reasoningDismissed, gapNote, gapDismissed, trip, seed: boardSeed });
  }, [boardSource, board, reasoning, reasoningDismissed, gapNote, gapDismissed, trip, boardSeed]);

  // ------------------------------------------------------------------
  // One natural vertical scroll (sub-page/overlay removal): the board,
  // the action bar and the shelf sit in normal document flow. "View
  // saved" scrolls to the inline Saved section at the foot of the page.
  // ------------------------------------------------------------------
  const savedRef = useRef<HTMLDivElement | null>(null);

  // Action bar state.
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionFlash, setActionFlash] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    if (!actionFlash) return;
    const timer = window.setTimeout(() => setActionFlash(null), 3200);
    return () => window.clearTimeout(timer);
  }, [actionFlash]);

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

  const wardrobeIds = useMemo(
    () => pieces.filter((p) => p.id > 0).map((p) => p.id),
    [pieces],
  );

  // ------------------------------------------------------------------
  // Entry-point handoffs — manual / today / trip all land on this canvas.
  // ------------------------------------------------------------------
  const [handoff, setHandoff] = useState<FittingBoardHandoff | null>(() => consumePendingFittingBoard());
  useEffect(() => {
    const onBoard = (event: Event) => {
      const next = (event as CustomEvent).detail?.handoff as FittingBoardHandoff | undefined;
      consumePendingFittingBoard();
      if (next) setHandoff(next);
    };
    window.addEventListener(FITTING_BOARD_EVENT, onBoard);
    return () => window.removeEventListener(FITTING_BOARD_EVENT, onBoard);
  }, []);

  const waitedForPieces = useRef(false);
  useEffect(() => {
    if (!handoff) return;
    // AI-originated boards need the wardrobe — give it one chance to arrive.
    if (handoff.source !== 'manual' && pieces.length === 0 && !waitedForPieces.current) {
      waitedForPieces.current = true;
      return;
    }
    const applied = handoff;
    setHandoff(null);
    if (applied.source === 'manual') {
      setTrip(null);
      setTripFormOpen(false);
      setBoardSource('manual');
      setBoard([]);
      setBoardSeed(`manual-${Date.now()}`);
      setReasoning(null);
      setReasoningDismissed(false);
      setGapNote(null);
      setGapDismissed(false);
    } else if (applied.source === 'today') {
      setTripFormOpen(false);
      void composeToday();
    } else if (applied.source === 'trip') {
      if (applied.trip) {
        setTripFormOpen(false);
        void composeTrip(applied.trip);
      } else if (trip) {
        // Already in Trip mode — stay on it.
        setTripFormOpen(false);
      } else {
        // "Plan for a trip" row — no brief yet: the LAST SAVED TRIP restores
        // from WorkspaceDB (trips persist to the account); the form only
        // shows when there is nothing to restore.
        void restoreStoredTrip().then((restored) => {
          if (!restored) setTripFormOpen(true);
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoff, pieces.length]);

  /** The Today entry point — CACHED per day + wardrobe (today-board.ts):
   * re-entering via the Ledger card re-paints instantly with no model call. */
  const composeToday = async () => {
    setTrip(null);
    setBoardSource('today');
    // One stable seed per day — the Today board re-opens identically.
    setBoardSeed(`today-${new Date().toISOString().slice(0, 10)}`);
    setReasoning(null);
    setReasoningDismissed(false);
    setGapNote(null);
    setGapDismissed(false);
    const cached = peekTodayBoard(pieces);
    if (cached) {
      setBoard(boardFromIds(cached.pieceIds));
      setReasoning(cached.reasoning);
      setGapNote(cached.gapNote ?? null);
      return;
    }
    setBoard([]);
    setComposing(true);
    try {
      const result = await getTodayBoard({ pieces, profile });
      setBoard(boardFromIds(result.pieceIds));
      setReasoning(result.reasoning);
      setGapNote(result.gapNote ?? null);
    } finally {
      setComposing(false);
    }
  };

  const tripStateFrom = (brief: TripBrief, boards: TripBoards): TripState => ({
    brief,
    days: boards.days.map((d) => ({
      label: d.label,
      board: boardFromIds(d.pieceIds),
      reasoning: d.reasoning || null,
      reasoningDismissed: false,
    })),
    gapNote: boards.gapNote,
    gapDismissed: false,
    activeDay: 0,
  });

  /** RESTORE THE LAST SAVED TRIP (feature pass): trips persist in the
   * trips WorkspaceDB table — reopening Trip mode picks the newest row up
   * instead of asking for the brief again. Returns false when none exists. */
  const restoreStoredTrip = async (): Promise<boolean> => {
    try {
      const { data } = await db().from('trips').orderBy('created_at', 'desc').limit(1).get();
      const row = data?.[0];
      if (!row) return false;
      const days = (typeof row.days === 'string' ? JSON.parse(row.days) : row.days) as Array<{
        label?: string;
        board?: BoardPiece[];
        reasoning?: string | null;
      }>;
      if (!Array.isArray(days) || days.length === 0) return false;
      tripRowIdRef.current = Number(row.id) || null;
      setBoardSource('trip');
      setTripList(false);
      setTrip({
        brief: { destination: row.destination || '', dates: row.dates || '', occasions: row.occasions || '' },
        days: days.map((d) => ({
          label: d.label || '',
          board: Array.isArray(d.board) ? d.board : [],
          reasoning: d.reasoning || null,
          reasoningDismissed: true,
        })),
        gapNote: row.gap_note || null,
        gapDismissed: true,
        activeDay: 0,
      });
      return true;
    } catch (e) {
      console.warn('[Ethaion] stored trip restore failed (non-fatal):', e);
      return false;
    }
  };

  /** Write the trip's current state to its trips row — insert on first
   * write, update in place after. Debounced by the effect below. */
  const persistTrip = async (t: TripState) => {
    const payload = {
      destination: t.brief.destination || 'Trip',
      dates: t.brief.dates || null,
      occasions: t.brief.occasions || null,
      days: JSON.stringify(t.days.map((d) => ({ label: d.label, board: d.board, reasoning: d.reasoning }))),
      gap_note: t.gapNote || null,
    };
    try {
      if (tripRowIdRef.current) {
        await db().from('trips').update(tripRowIdRef.current, payload);
      } else {
        await db().from('trips').insert(payload);
        const { data } = await db().from('trips').orderBy('created_at', 'desc').limit(1).get();
        tripRowIdRef.current = Number(data?.[0]?.id) || null;
      }
    } catch (e) {
      console.warn('[Ethaion] trip persist failed (non-fatal):', e);
    }
  };

  // Persist quietly whenever the trip's boards change — a swap on a day
  // board lands in WorkspaceDB without a save button.
  useEffect(() => {
    if (!trip || trip.days.length === 0) return;
    if (tripPersistTimer.current) window.clearTimeout(tripPersistTimer.current);
    tripPersistTimer.current = window.setTimeout(() => {
      void persistTrip(trip);
    }, 900);
    return () => {
      if (tripPersistTimer.current) window.clearTimeout(tripPersistTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip]);

  /** The Trip entry point — one composed set per brief + wardrobe per
   * session; resubmitting the same trip reuses it instead of re-running. */
  const composeTrip = async (brief: TripBrief) => {
    setBoardSource('trip');
    setBoard([]);
    setReasoning(null);
    setGapNote(null);
    setGapDismissed(false);
    // A new brief is a NEW trip — it gets its own trips row.
    tripRowIdRef.current = null;
    setTripList(false);
    const cached = cachedTripBoards(brief, wardrobeIds) as TripBoards | null;
    if (cached) {
      setTrip(tripStateFrom(brief, cached));
      return;
    }
    setTrip({ brief, days: [], gapNote: null, gapDismissed: false, activeDay: 0 });
    setComposing(true);
    try {
      const mats = await fetchMaterials().catch(() => ({} as Record<number, string>));
      setMaterials(mats);
      const result = await composeTripBoards({
        destination: brief.destination,
        dates: brief.dates,
        occasions: brief.occasions,
        pieces,
        materials: mats,
        profile,
      });
      rememberTripBoards(brief, wardrobeIds, result);
      setTrip(tripStateFrom(brief, result));
    } finally {
      setComposing(false);
    }
  };

  const exitTrip = () => {
    setTrip(null);
    setTripList(false);
    setBoardSource('manual');
    setBoard([]);
    setReasoning(null);
    setReasoningDismissed(false);
    setGapNote(null);
    setGapDismissed(false);
  };

  // "Try this on" fired from another surface while this tab is mounted —
  // the piece lands straight on the flat-lay board.
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

  // ------------------------------------------------------------------
  // The shelf — owned pieces + Beau's picks, merged.
  // ------------------------------------------------------------------
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
          // Beau's picks ALWAYS carry a buy link (Buy Links overhaul, Part
          // 2.4): the stored product page when one exists, otherwise the
          // best tightly filtered retail search for the exact piece.
          productUrl: card.item.productUrl || primaryBuyUrl(card.item.brand, card.item.name),
          // The catalogue's own curated photo query (Part 1.3) — the
          // reliable route to a REAL product photograph for picks whose
          // product page yields no loadable og:image.
          imageQuery: card.item.photoQuery || null,
          note: card.why || null,
          ctaLabel: card.item.productUrl ? `Buy at ${card.item.preowned?.source || card.item.brand}` : 'View product',
          ctaUrl: card.item.productUrl || primaryBuyUrl(card.item.brand, card.item.name),
        });
        if (out.length >= 18) break;
      }
      return out;
    } catch (e) {
      console.warn('[Ethaion] fitting room could not build Beau\u2019s picks:', e);
      return [];
    }
  }, [profile, budgets, pieces, prefs]);

  // Reserve pieces — they feed the "In your Reserve" shelf.
  const { data: radarRows, loading: radarRowsLoading, refresh: refreshRadarRows } = window.useWorkspaceDB<RadarItem>('radar_items', {
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 50,
  });
  // Data-layer caching (tab-switch performance): remember when the Reserve
  // rows last arrived so re-activating this tab only refreshes them when
  // they are genuinely stale — never a re-fetch on every switch.
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
        ctaLabel: 'View the listing',
        ctaUrl: item.product_url || null,
      })),
    [radarRows],
  );

  // The Fitting stays mounted when the user switches tabs (tab-switch
  // performance) — re-activation shows the shelf's existing rows instantly
  // and refreshes them in the background ONLY when they are stale (older
  // than 60 seconds), never on every switch.
  useEffect(() => {
    const onActivated = (event: Event) => {
      if ((event as CustomEvent).detail?.tab !== 'fitting-room') return;
      if (Date.now() - fittingReserveFetchedAt > FITTING_RESERVE_STALE_MS) refreshRadarRows();
    };
    window.addEventListener('ethaion:tab-activated', onActivated);
    return () => window.removeEventListener('ethaion:tab-activated', onActivated);
  }, [refreshRadarRows]);

  // A Reserve mutation anywhere (this tab's "Add to Reserve", the Reserve
  // tab, chat) refreshes the shelf immediately — staleness never hides a
  // change the user just made.
  useEffect(() => {
    const onChanged = () => {
      fittingReserveFetchedAt = 0;
      refreshRadarRows();
    };
    window.addEventListener(RESERVE_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(RESERVE_CHANGED_EVENT, onChanged);
  }, [refreshRadarRows]);

  // Saved outfits — for the drawer.
  const { data: savedRows, refresh: refreshSaved } = window.useWorkspaceDB<SavedOutfitRow>('saved_outfits', {
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 30,
  });

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

  // THE THREE-LEVEL SHELF (Part 9) — What you own · In your Reserve ·
  // Beau's picks, each its own labelled scrollable grid. The section
  // toggles above the shelf show or hide whole sections — no category
  // filtering here.
  const shelfOwned = filterShelf(ownedPieces);
  const shelfReserve = filterShelf(radarPieces);
  const shelfPicks = filterShelf(beauPicks);

  // ------------------------------------------------------------------
  // Interactions
  // ------------------------------------------------------------------
  /** Pin-to-look belonged to the deleted avatar path — a quiet no-op keeps
   * the shelf-card prop shape (the pin button never renders in flat mode). */
  const pinPiece = (_piece?: FittingPiece) => {};

  /** The board the canvas is currently editing — the active trip day's, or
   * the single board. */
  const activeBoard: BoardPiece[] = trip ? trip.days[trip.activeDay]?.board ?? [] : board;

  const setActiveBoard = (updater: (cur: BoardPiece[]) => BoardPiece[]) => {
    if (trip) {
      setTrip((cur) => {
        if (!cur) return cur;
        const days = cur.days.map((d, i) => (i === cur.activeDay ? { ...d, board: updater(d.board) } : d));
        return { ...cur, days };
      });
    } else {
      setBoard((cur) => updater(cur));
    }
  };

  /** Swap a board piece's image for its background-removed cutout (Part
   * 3.5), and record whether the result may lie in the flat-lay at all.
   *
   * WHICH PHOTOGRAPH GETS CUT IS NOT THIS BOARD'S DECISION. A Reserve piece
   * or one of Beau's picks is SOURCED retail photography, so it goes through
   * the one shared rule (flat-lay-sourcing) that the shelf, The Rail and
   * World of Menswear all source through: resolve the ranked candidates,
   * prefer the isolated product shot over the on-body one, then ingest. An
   * owned piece has exactly one photograph — its own — so there is no choice
   * to make and it goes straight to the pipeline.
   *
   * The CATEGORY travels with the request, and the finished asset comes back
   * TIGHT-CROPPED with its cropped pixel dimensions (pipeline v3), which is
   * what lets the flat-lay derive the item's render width from its category
   * height and true aspect ratio. And `flatLayReady` comes back false when
   * the only photography that exists has a model in it — the board then
   * holds the piece out of the composition and names it instead. */
  const applyBoardCutout = (piece: BoardPiece, sourceUrl: string) => {
    const clean = (sourceUrl || '').trim();
    if (!clean) return;
    const ingest = piece.key.startsWith('owned-')
      ? flatLayAssetForShelf({ candidates: clean, category: piece.category, name: piece.name })
      : flatLayAssetForProduct({
          name: piece.name,
          brand: piece.brand,
          category: piece.category,
          preferred: clean,
        });
    void ingest
      .then((asset) => {
        setActiveBoard((cur) =>
          cur.map((p) =>
            p.key === piece.key
              ? {
                  ...p,
                  image: asset.ready && asset.url ? asset.url : p.image,
                  flatLayReady: asset.flatLayReady,
                  // The tight-cropped PNG's true dimensions — they only
                  // describe the ingested cutout, so they travel with its URL.
                  croppedWidth: asset.ready && asset.url ? asset.croppedWidth ?? null : p.croppedWidth ?? null,
                  croppedHeight: asset.ready && asset.url ? asset.croppedHeight ?? null : p.croppedHeight ?? null,
                }
              : p,
          ),
        );
      })
      .catch(() => undefined);
  };

  const setBoardImage = (piece: BoardPiece, url: string, needsCutout: boolean) => {
    if (!url) return;
    // The full settled asset, not just the cutout URL — an already-ingested
    // piece carries its tight-cropped dimensions and flat-lay verdict too.
    const settled = needsCutout ? peekFlatLayAsset(url) : null;
    const ready = settled?.ready && settled.url ? settled.url : null;
    setActiveBoard((cur) =>
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
    if (needsCutout && !ready) applyBoardCutout(piece, url);
  };

  // Flat view (Part 3.4): tapping a piece SELECTS it onto the board and
  // tapping it again takes it off. Several pieces live on the board at once
  // and the layout reflows around them.
  const toggleOnBoard = (piece: FittingPiece) => {
    const entry = boardPieceFrom(piece);
    const already = activeBoard.some((p) => p.key === entry.key);
    if (already) {
      setActiveBoard((cur) => cur.filter((p) => p.key !== entry.key));
      return;
    }
    // EVERY piece is cut for the board — owned ones included. The wardrobe's
    // stored image is a garment on a PAPER CARD, not a transparent cutout, and
    // a pale rectangle sitting next to a real cut is exactly what stopped the
    // flat-lay reading as clothes laid out on a bed.
    const needsCutout = true;
    // The full settled asset, so an already-ingested piece lands on the board
    // with its tight-cropped dimensions and flat-lay verdict in one step.
    const settled = entry.image && needsCutout ? peekFlatLayAsset(entry.image) : null;
    const seededAsset = settled?.ready && settled.url ? settled : null;
    setActiveBoard((cur) => [
      ...cur,
      seededAsset
        ? {
            ...entry,
            image: seededAsset.url,
            flatLayReady: seededAsset.flatLayReady,
            croppedWidth: seededAsset.croppedWidth ?? null,
            croppedHeight: seededAsset.croppedHeight ?? null,
          }
        : entry,
    ]);
    if (entry.image) {
      if (needsCutout && !seededAsset) applyBoardCutout(entry, entry.image);
    } else {
      void resolveGarmentImage(piece)
        .then((url) => {
          if (url) {
            setBoardImage(entry, url, needsCutout);
            return undefined;
          }
          // The looked-up REAL product photograph (product-images.ts). It
          // is retail photography like the rest, so it takes the same board
          // cutout (Part 1.5): clean, noise-free silhouettes on the canvas.
          return resolveProductImage({ name: piece.name, brand: piece.brand, productUrl: piece.productUrl }).then((photo) =>
            setBoardImage(entry, photo, needsCutout),
          );
        })
        .catch(() => undefined);
    }
  };
  const removeFromBoard = (key: string) => setActiveBoard((cur) => cur.filter((p) => p.key !== key));

  // The “Try this on” handoff: the piece another surface sent us goes
  // straight onto the board. Held in a ref because the event listener
  // above is registered once, before toggleOnBoard exists.
  const toggleOnBoardRef = useRef(toggleOnBoard);
  toggleOnBoardRef.current = toggleOnBoard;
  const pendingPlaced = useRef(false);
  useEffect(() => {
    if (pendingPlaced.current || !pendingRef.current) return;
    pendingPlaced.current = true;
    toggleOnBoardRef.current(pendingRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // THE BOARD OPENS DRESSED (design handoff 10a — the single highest-value
  // change in the product): entering The Fitting with NO handoff, NO
  // remembered canvas and NO try-on piece lands on TODAY'S LOOK, already
  // assembled — never an empty board with instructions floating in it.
  // today-board.ts's per-day cache makes the repeat visit free; “Start an
  // empty board” (the manual entry) is still one tap away. A wardrobe too
  // small to dress a day falls back to the manual board.
  const defaultDressed = useRef(false);
  useEffect(() => {
    if (defaultDressed.current || handoff || trip || tripFormOpen || pendingRef.current) return;
    if (board.length > 0 || boardSource !== 'manual') {
      defaultDressed.current = true; // a restored or loaded canvas wins
      return;
    }
    if (pieces.length < 3) return; // not enough wardrobe to compose from yet
    defaultDressed.current = true;
    void composeToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoff, pieces.length]);

  // THE CUTOUT SWEEP — the one place that guarantees every piece ON the board
  // is a transparent cutout, whichever route put it there: a shelf tap, a
  // Today or Trip board composed from owned piece ids, or a saved outfit
  // reloaded from the database. Removal is memoised per source URL in
  // photo-enhance, and a piece whose removal fails simply keeps its original
  // image — never a blank plate.
  const cutRequested = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const piece of activeBoard) {
      const source = (piece.image || '').trim();
      if (!source || isTransparentCutout(source) || cutRequested.current.has(source)) continue;
      cutRequested.current.add(source);
      applyBoardCutout(piece, source);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBoard]);

  const onShelfTap = (piece: FittingPiece) => toggleOnBoard(piece);

  /** Which shelf cards read as “on the board” right now. */
  const selectedKeys = useMemo(() => new Set(activeBoard.map((p) => p.key)), [activeBoard]);

  /** How many of each shelf are on the board — the count each shelf's rule
   * carries at its right edge (Design5). */
  const shelfOwnedOn = shelfOwned.filter((p) => selectedKeys.has(p.key)).length;
  const shelfReserveOn = shelfReserve.filter((p) => selectedKeys.has(p.key)).length;
  const shelfPicksOn = shelfPicks.filter((p) => selectedKeys.has(p.key)).length;

  // Quick-adjust: ONE constraint added, a TARGETED slot change. This is the
  // explicit refinement path — and for Today boards the adjusted outfit
  // replaces the day's cached board so the Ledger preview stays in step.
  const runAdjustment = async (adjustment: BoardAdjustment) => {
    if (adjustBusy || composing) return;
    const target = activeBoard;
    const currentIds = target
      .map((p) => (p.key.startsWith('owned-') ? Number(p.key.slice('owned-'.length)) : null))
      .filter((id): id is number => id != null && Number.isFinite(id));
    setAdjustBusy(adjustment);
    try {
      const occasion = trip
        ? `${trip.brief.destination} trip, ${trip.days[trip.activeDay]?.label || 'a trip day'} — ${trip.brief.occasions || 'mostly casual'}`
        : boardSource === 'today'
          ? 'an ordinary day today'
          : 'this outfit';
      const { composeFittingBoard } = await import('./fitting-ai');
      const result = await composeFittingBoard({
        pieces,
        materials,
        profile,
        occasion,
        // The shared live conditions (Part 3.4) — “Warmer” / “Cooler” and
        // register moves reason against the real weather.
        weatherLine: sharedWeatherPromptLine(),
        warmth,
        adjustment,
        currentIds,
      });
      const next = boardFromIds(result.pieceIds);
      // Non-owned pieces the user selected by hand stay on the board — an
      // adjustment only rethinks what Beau put there.
      for (const p of target) {
        if (!p.key.startsWith('owned-') && !next.some((n) => n.key === p.key)) next.push(p);
      }
      if (trip) {
        setTrip((cur) => {
          if (!cur) return cur;
          const days = cur.days.map((d, i) =>
            i === cur.activeDay ? { ...d, board: next, reasoning: result.reasoning, reasoningDismissed: false } : d,
          );
          return { ...cur, days };
        });
      } else {
        setBoard(next);
        setReasoning(result.reasoning);
        setReasoningDismissed(false);
        setGapNote(result.gapNote ?? null);
        setGapDismissed(false);
        if (boardSource === 'today') {
          rememberTodayBoard(pieces, {
            pieceIds: result.pieceIds,
            reasoning: result.reasoning,
            gapNote: result.gapNote ?? null,
            composedAt: Date.now(),
          });
        }
      }
    } finally {
      setAdjustBusy(null);
    }
  };

  // ------------------------------------------------------------------
  // Action bar — Save / Add to Reserve / Share / View saved
  // ------------------------------------------------------------------
  const activeBoardPieces = activeBoard;

  const saveBoardAs = async (name: string) => {
    if (saving || activeBoardPieces.length === 0) return;
    setSaving(true);
    try {
      // PROPOSAL VS WEARABLE LOOK (10a/22a): a board holding a piece you
      // don't own saves as a PROPOSAL, never as an outfit — the flag is
      // stored on the record's mode field, and the dashed border rule
      // follows it everywhere the look shows.
      const isProposal = activeBoardPieces.some((p) => !p.key.startsWith('owned-'));
      await db()
        .from('saved_outfits')
        .insert({ name: name.trim() || 'Beau\u2019s suggestion', pieces: JSON.stringify(activeBoardPieces), mode: isProposal ? 'proposal' : 'flat' });
      setSaveOpen(false);
      setSaveName('');
      setActionFlash(
        isProposal
          ? 'Saved as a proposal — it holds a piece you don\u2019t own yet. It\u2019s under \u201cView saved\u201d.'
          : 'Saved — it\u2019s under \u201cView saved\u201d.',
      );
      refreshSaved();
    } catch (e) {
      console.warn('[Ethaion] saving the outfit failed:', e);
      setActionFlash('Couldn\u2019t save that — try again.');
    } finally {
      setSaving(false);
    }
  };

  const saveTrip = async () => {
    if (saving || !trip || trip.days.length === 0) return;
    setSaving(true);
    try {
      for (const day of trip.days) {
        const dayPieces = day.board;
        if (dayPieces.length === 0) continue;
        await db()
          .from('saved_outfits')
          .insert({
            name: `${trip.brief.destination} — ${day.label}`,
            pieces: JSON.stringify(dayPieces),
            // Same proposal rule as a single board (10a/22a).
            mode: dayPieces.some((p) => !p.key.startsWith('owned-')) ? 'proposal' : 'flat',
          });
      }
      setActionFlash('Trip saved — every day is under \u201cView saved\u201d.');
      refreshSaved();
    } catch (e) {
      console.warn('[Ethaion] saving the trip failed:', e);
      setActionFlash('Couldn\u2019t save the trip — try again.');
    } finally {
      setSaving(false);
    }
  };

  const shareText = (): string => {
    if (trip) {
      const lines = trip.days.map((day) => {
        const names = day.board.map((p) => p.name).join(', ');
        return `${day.label}: ${names || '—'}`;
      });
      return `${trip.brief.destination} — packed with Beau on Ethaion\n${lines.join('\n')}`;
    }
    const names = activeBoardPieces.map((p) => p.name).join(', ');
    return `An outfit from Ethaion: ${names || 'an empty board'}`;
  };

  const shareBoard = async () => {
    const text = shareText();
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: 'Ethaion — The Fitting', text });
      } else {
        await navigator.clipboard.writeText(text);
        setActionFlash('Copied — paste it anywhere.');
      }
    } catch { /* user closed the share sheet — nothing to do */ }
  };

  const loadSavedOutfit = (row: SavedOutfitRow) => {
    setTrip(null);
    setBoardSource('manual');
    setReasoning(null);
    // A saved outfit is not today's composition — today's weather gap note
    // must not follow it onto the board.
    setGapNote(null);
    setGapDismissed(false);
    setBoard(parsePieces(row.pieces));
    // A saved outfit keeps ONE seed forever — it re-opens laid out
    // identically every time (flat-lay overhaul, 5.4).
    setBoardSeed(`saved-${row.id}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const removeSavedOutfit = async (id: number) => {
    if (deletingId != null) return;
    setDeletingId(id);
    try {
      await db().from('saved_outfits').delete(id);
      refreshSaved();
    } catch (e) {
      console.warn('[Ethaion] removing the saved outfit failed:', e);
    } finally {
      setDeletingId(null);
    }
  };

  // ------------------------------------------------------------------
  // Derived bits
  // ------------------------------------------------------------------
  // Trip packing list — every piece used across ALL days, deduplicated.
  const packingList = useMemo<BoardPiece[]>(() => {
    if (!trip) return [];
    const seen = new Map<string, BoardPiece>();
    for (const day of trip.days) {
      for (const p of day.board) {
        if (!seen.has(p.key)) seen.set(p.key, p);
      }
    }
    return [...seen.values()];
  }, [trip]);

  // DOUBLE DUTY (17a · M8): pieces appearing on TWO OR MORE day boards —
  // the packing list counts them and marks each one.
  const doubleDuty = useMemo(() => {
    const daysPerPiece = new Map<string, number>();
    if (trip) {
      for (const day of trip.days) {
        const seenToday = new Set<string>();
        for (const p of day.board) {
          if (seenToday.has(p.key)) continue;
          seenToday.add(p.key);
          daysPerPiece.set(p.key, (daysPerPiece.get(p.key) || 0) + 1);
        }
      }
    }
    let count = 0;
    for (const v of daysPerPiece.values()) if (v >= 2) count += 1;
    return { count, daysPerPiece };
  }, [trip]);

  const activeDayState = trip ? trip.days[trip.activeDay] ?? null : null;
  const aiOriginated = boardSource === 'today' || boardSource === 'trip';
  const stripText = trip ? activeDayState?.reasoning ?? null : reasoning;
  const stripDismissed = trip ? activeDayState?.reasoningDismissed ?? true : reasoningDismissed;
  const dismissStrip = () => {
    if (trip) {
      setTrip((cur) => {
        if (!cur) return cur;
        const days = cur.days.map((d, i) => (i === cur.activeDay ? { ...d, reasoningDismissed: true } : d));
        return { ...cur, days };
      });
    } else {
      setReasoningDismissed(true);
    }
  };

  const actionDot = (
    <span aria-hidden="true" style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', color: 'var(--color-neutral-500,#a68e70)' }}>
      ·
    </span>
  );
  const actionBtnStyle: React.CSSProperties = { fontFamily: 'var(--space-font-family)', fontSize: '13px', borderRadius: 0 };

  const unownedOnBoard = activeBoardPieces.filter((p) => !p.key.startsWith('owned-'));

  // COMPLETE THE LOOK (10a) — swaps and additions from pieces you OWN:
  // empty-zone fillers first, then same-slot swaps, three rows, each with
  // its reason in one line. Derived, never a model call.
  const completeLook = useMemo<CompleteLookSuggestion[]>(() => {
    const onBoardKeys = new Set(activeBoard.map((p) => p.key));
    const out: CompleteLookSuggestion[] = [];
    for (const piece of shelfOwned) {
      if (onBoardKeys.has(piece.key)) continue;
      const zone = zoneLabelFor(boardPieceFrom(piece));
      const current = activeBoard.find((p) => zoneLabelFor(p) === zone);
      out.push({
        piece,
        fillsEmpty: !current,
        reason: current
          ? `Swaps for the ${current.name.toLowerCase()} — same slot, a different read.`
          : `Takes the empty ${zone.toLowerCase()} slot — nothing on the board covers it.`,
      });
    }
    out.sort((a, b) => Number(b.fillsEmpty) - Number(a.fillsEmpty));
    return out.slice(0, 3);
  }, [activeBoard, shelfOwned]);
  // THE ONE THING YOU'D NEED TO BUY (10a) — the single acquisition line,
  // boxed as the exception: Beau's first pick, with his reason.
  const acquisitionLine = shelfPicks[0] || null;

  // START AN EMPTY BOARD (10a) — the manual entry, right in the action row.
  const startEmptyBoard = () => {
    setBoardSource('manual');
    setBoard([]);
    setReasoning(null);
    setReasoningDismissed(false);
    setGapNote(null);
    setBoardSeed(`board-${Date.now()}`);
  };

  // ------------------------------------------------------------------
  // THE REFERENCE'S FURNITURE (Design5) — every line of it read off real
  // state: the day rail, the season and the source, the colour harmony
  // taken from the pieces ON the board, and the three note columns.
  // ------------------------------------------------------------------
  const today = new Date();
  const todayIndex = (today.getDay() + 6) % 7;
  const todayName = DAY_NAMES[todayIndex];
  const seasonLabel = seasonOf(today);
  const sourceLabel = trip ? 'Trip' : boardSource === 'today' ? 'Today' : 'By hand';
  const dayLabel = trip ? activeDayState?.label || `Day ${trip.activeDay + 1}` : todayName;
  const boardTitle = trip
    ? activeDayState?.label || 'The trip board'
    : boardSource === 'today'
      ? 'Today’s look'
      : 'The board';
  const bodyTag = [profile?.build, profile?.height_range, dayLabel, sourceLabel].filter(Boolean).join(' · ');
  const onBoardLine =
    activeBoard.length > 0
      ? `${activeBoard.length} piece${activeBoard.length === 1 ? '' : 's'} on the board`
      : 'Nothing on the board yet';

  /** The wardrobe's stored colours by board key — the harmony strip and the
   * swap chips read these first, and fall back to the piece's own name. */
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

  /** THE PALETTE, GROUPED — what the legend at the foot of the page counts:
   * the anchors holding the look down, the neutrals around them, and the
   * accents doing the talking. */
  const harmonyFamilies = useMemo(() => {
    const counts: Record<ColourFamily, number> = { anchor: 0, neutral: 0, accent: 0 };
    for (const p of activeBoard) {
      const colour = colourNameForPiece(p.name, ownedColors.get(p.key) || null);
      if (!colour) continue;
      counts[colourFamily(colour)] += 1;
    }
    return counts;
  }, [activeBoard, ownedColors]);

  const styleNotes = useMemo(() => {
    const notes: string[] = [];
    if (trip) notes.push('Composed for the trip — every day draws on the one packing list below.');
    else if (boardSource === 'today') notes.push('Carried over from The Ledger and edited here — Beau dressed it from what you own.');
    else notes.push('Built by hand — nothing on this board was composed for you.');
    if (activeBoard.length > 0) {
      notes.push('Pieces land in their zone and stack outward from the body — drag one to nudge it into place.');
      notes.push('Tap a piece again, or use the × on the board, to take it off — it stays in your Ledger.');
    } else {
      notes.push('Nothing on the board yet — tap a piece on the shelf below and it lands in its own zone.');
    }
    if (unownedOnBoard.length > 0) {
      notes.push(
        `${unownedOnBoard.length === 1 ? 'One piece' : `${capWord(numberWord(Math.min(99, unownedOnBoard.length)))} pieces`} here ${
          unownedOnBoard.length === 1 ? 'is' : 'are'
        } not yours yet — ${unownedOnBoard.length === 1 ? 'it draws' : 'they draw'} dashed on the board.`,
      );
    }
    return notes;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip, boardSource, activeBoard.length, unownedOnBoard.length]);

  const avoidNotes = useMemo(() => {
    const notes: string[] = ['A zone takes more than one piece — two jumpers stack, two pairs of shoes don’t.'];
    if (unownedOnBoard.length > 0) notes.push('Don’t call this an outfit yet — a board holding a piece you don’t own saves as a proposal.');
    else if (activeBoard.length === 0) notes.push('Don’t save an empty board — Save waits until at least one piece is on it.');
    else notes.push('Don’t save a look you wouldn’t wear tomorrow — everything on this board is already yours.');
    if (!trip && gapNote) notes.push(gapNote);
    else notes.push('Don’t dress against the day — the reading at the top of the page is what this was composed for.');
    return notes;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip, gapNote, activeBoard.length, unownedOnBoard.length]);

  /** Beau's note when he composed the board; the board's own standing line
   * otherwise. */
  const boardDescription = trip
    ? `Packed for ${trip.brief.destination}${trip.brief.dates ? `, ${trip.brief.dates}` : ''} — this day’s board, drawn from the pieces you own.`
    : boardSource === 'today'
      ? 'Today’s look, drawn from what you own and the day outside. Swap any piece and the rest of the board holds.'
      : 'An empty canvas. Tap pieces on the shelf below and they land in their own zone — outer layer, top, waist, bottom, feet.';
  const noteLive = aiOriginated && !!stripText && !stripDismissed;

  /** THE DAY RAIL — the trip's days in Trip mode, the week otherwise, with
   * today live and every other day one tap from a trip. */
  const railDays = useMemo<RailDay[]>(() => {
    if (trip) {
      return trip.days.map((day, i) => ({
        key: `${day.label}-${i}`,
        abbr: tripDayChipLabel(trip.brief, i),
        num: String(i + 1),
        active: i === trip.activeDay && !tripList,
        title: `${day.label} — ${trip.brief.destination}`,
        onSelect: () => {
          setTripList(false);
          setTrip((cur) => (cur ? { ...cur, activeDay: i } : cur));
        },
      }));
    }
    return DAY_NAMES.map((name, i) => ({
      key: name,
      abbr: name.slice(0, 3),
      num: String(i + 1),
      active: i === todayIndex,
      quiet: i !== todayIndex,
      title:
        i === todayIndex
          ? 'Today — tap and Beau dresses the board again'
          : `${name} — Beau dresses today; plan any other day as a trip`,
      onSelect: () => {
        if (i === todayIndex) void composeToday();
        else setTripFormOpen(true);
      },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip, tripList, todayIndex]);

  /** THE SEGMENTED CONTROL — how this board is made. Each one re-dresses
   * the fitting through the entry point it already had. */
  const sourceTabs: SegmentedItem[] = [
    {
      key: 'today',
      label: 'Today',
      title: 'Beau dresses today from the pieces you own',
      onSelect: () => {
        if (trip) exitTrip();
        void composeToday();
      },
    },
    {
      key: 'manual',
      label: 'By hand',
      title: 'Start an empty board and build it yourself',
      onSelect: () => {
        if (trip) exitTrip();
        startEmptyBoard();
      },
    },
    {
      key: 'trip',
      label: 'Trip',
      title: 'Plan a trip — a board a day, and the packing list beneath',
      onSelect: () => {
        if (trip) {
          setTripList(false);
          return;
        }
        void restoreStoredTrip().then((restored) => {
          if (!restored) setTripFormOpen(true);
        });
      },
    },
    {
      key: 'saved',
      label: 'Saved',
      title: 'Your saved looks and proposals — the full library',
      onSelect: () => setSavedLooksOpen(true),
    },
  ];

  const monoAction: React.CSSProperties = { fontFamily: MONO, fontSize: '8.5px', letterSpacing: '0.1em', textTransform: 'uppercase' };

  const actionBar = (
    // data-tour: the first-run walkthrough's Fitting-board stop rings this
    // action row (onboarding-tour.tsx).
    <div className="mt-3" data-tour="tour-fitting-board">
      {/* THE PROPOSAL STRIP (10a): the board states what isn't yours and
          names the consequence — saved, it files as a proposal. */}
      {unownedOnBoard.length > 0 && !trip && (
        <div
          className="flex items-start justify-between gap-4 flex-wrap"
          style={{ background: 'var(--color-paper,#fbf8f1)', borderLeft: '3px solid var(--color-accent,#a8712c)', padding: '11px 14px 12px', marginBottom: '12px' }}
        >
          <p style={{ margin: 0, fontFamily: 'var(--space-font-family)', fontSize: '12.5px', lineHeight: 1.55, color: 'var(--color-text,#3b2b1d)', maxWidth: '56ch' }}>
            This look has {unownedOnBoard.length === 1 ? 'one piece' : `${numberWord(Math.min(99, unownedOnBoard.length))} pieces`} you don’t
            own — drawn dashed. Saved, it files as a <em>proposal</em>, not an outfit — so a look can be the
            reason you buy something.
          </p>
          <button
            type="button"
            onClick={() => setBoard((cur) => cur.filter((p) => p.key.startsWith('owned-')))}
            className="hover:underline"
            style={{ ...monoAction, color: 'var(--color-accent-700,#7c4a17)', background: 'transparent' }}
          >
            Show only what I own →
          </button>
        </div>
      )}

      {/* THE ZONES LINE — the board's stacking order, stated once. The rule
          about what a zone will and won't take lives in the notes column. */}
      <p className="uppercase" style={{ margin: '0 0 10px', fontFamily: MONO, fontSize: '7.5px', letterSpacing: '0.09em', color: 'var(--color-neutral-500,#a68e70)' }}>
        Zones · in stacking order&nbsp;&nbsp;&nbsp;Head&nbsp;&nbsp;Eyewear&nbsp;&nbsp;Neck&nbsp;&nbsp;Outer layer&nbsp;&nbsp;Mid layer&nbsp;&nbsp;Top&nbsp;&nbsp;Waist&nbsp;&nbsp;Bottom&nbsp;&nbsp;Feet&nbsp;&nbsp;Carry&nbsp;&nbsp;Wrist
      </p>

      {/* THE ACTION ROW (10a): “Save this look” boxed, the rest in mono,
          the saved-looks count at the right edge. */}
      <div className="flex items-center gap-x-5 gap-y-2 flex-wrap py-2.5 border-t border-b border-[var(--color-divider,rgba(59,43,29,0.18))]">
        {trip ? (
          <button
            type="button"
            onClick={() => void saveTrip()}
            disabled={saving || packingList.length === 0}
            className="inline-flex items-center gap-1.5 hover:opacity-80 disabled:opacity-40"
            style={{ fontFamily: 'var(--space-font-heading)', fontSize: '14.5px', color: 'var(--color-text,#241a12)', border: '1px solid var(--color-accent,#a8712c)', padding: '8px 16px', background: 'transparent' }}
            title="Save every day of this trip under Saved looks"
          >
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            Save trip
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setSaveOpen(true)}
            disabled={activeBoardPieces.length === 0}
            className="hover:opacity-80 disabled:opacity-40"
            style={{ fontFamily: 'var(--space-font-heading)', fontSize: '14.5px', color: 'var(--color-text,#241a12)', border: '1px solid var(--color-accent,#a8712c)', padding: '8px 16px', background: 'transparent' }}
            title="Save this outfit under a name"
          >
            Save this look
          </button>
        )}
        {!trip && (
          <button
            type="button"
            onClick={startEmptyBoard}
            className="hover:underline"
            style={{ ...monoAction, color: 'var(--color-neutral-700,#634e38)', background: 'transparent' }}
            title="Clear the board and build by hand — today's look stays one tap away"
          >
            Start an empty board
          </button>
        )}
        <button
          type="button"
          onClick={() => void shareBoard()}
          disabled={trip ? packingList.length === 0 : activeBoardPieces.length === 0}
          className="hover:underline disabled:opacity-40"
          style={{ ...monoAction, color: 'var(--color-neutral-700,#634e38)', background: 'transparent' }}
          title="Share this outfit"
        >
          Share
        </button>
        <span className="flex-1" />
        {actionFlash && (
          <span style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px', color: 'var(--color-accent-700,#7c4a17)' }}>
            {actionFlash}
          </span>
        )}
        <button
          type="button"
          onClick={() => setSavedLooksOpen(true)}
          className="hover:underline"
          style={{ ...monoAction, color: 'var(--color-accent,#a8712c)', background: 'transparent' }}
          title="Saved looks and proposals — the full library, sorted by last worn"
        >
          {(savedRows || []).length > 0 ? `${(savedRows || []).length} saved look${(savedRows || []).length === 1 ? '' : 's'}` : 'Saved looks'} ›
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ background: PAGE }}>
      {/* 1 · THE CONTEXT BAR — the SHARED location and weather (the same
          reading The Ledger shows), the way in to change it, and the tab ·
          day at the right edge. */}
      <FittingContextBar right={`The Fitting · ${todayName}`} />

      {/* 2 · THE MASTHEAD — the SHARED tab header (tab-header.tsx): the same
          block, type, indentation and closing rule as every other primary
          tab. Its aside carries the board's segmented control — how this
          board is made — exactly where the reference sets it. */}
        <TabHeader
          title={trip ? `The Fitting · ${trip.brief.destination}` : 'The Fitting'}
          standfirst="Seven days · every occasion · drawn to your build."
          aside={<SegmentedTabs items={sourceTabs} activeKey={trip ? 'trip' : boardSource} />}
        >

            {/* TRIP: the brief in one line, and the two controls the day
                rail doesn't carry. The DAYS themselves live on the rail down
                the left of the band, where the reference puts them. */}
            {trip && (
              <div className="flex items-center gap-5 flex-wrap pt-3">
                <span style={fitLabel(9, MUTED, '0.16em')}>
                  {trip.days.length} day{trip.days.length === 1 ? '' : 's'}
                  {trip.brief.dates ? ` · ${trip.brief.dates}` : ''}
                  {trip.brief.occasions ? ` · ${trip.brief.occasions}` : ''}
                </span>
                <button
                  type="button"
                  onClick={() => setTripFormOpen(true)}
                  className="hover:underline"
                  style={{ ...fitLabel(9, ACCENT_DEEP, '0.16em'), background: 'transparent', border: 'none' }}
                  title="Plan a different trip — the current one stays saved"
                >
                  New trip
                </button>
                <button
                  type="button"
                  onClick={exitTrip}
                  className="hover:underline"
                  style={{ ...fitLabel(9, MUTED, '0.16em'), background: 'transparent', border: 'none' }}
                  title="Leave Trip mode — back to a single board"
                >
                  Close trip
                </button>
              </div>
            )}

            {/* TRIP-LEVEL GAP NOTE — once, above the day boards, oxblood,
                dismissible. Never repeated per day. */}
            {trip && trip.gapNote && !trip.gapDismissed && (
              <div className="pt-2 pb-0.5">
                <ReasoningStrip
                  text={trip.gapNote}
                  onDismiss={() => setTrip((cur) => (cur ? { ...cur, gapDismissed: true } : cur))}
                />
              </div>
            )}

            {/* TODAY'S WEATHER GAP — the same strip, for the single board:
                when nothing owned is rated for the conditions, Beau says so
                rather than passing a wrong-season piece off as the answer. */}
            {!trip && gapNote && !gapDismissed && (
              <div className="pt-2 pb-0.5">
                <ReasoningStrip text={gapNote} onDismiss={() => setGapDismissed(true)} />
              </div>
            )}
        </TabHeader>

      {/* 3 · THE BAND — the days at the left, THE FITTING in the middle, the
          notes at the right. The centre column holds the REAL composition:
          the cutout garments on the flat-lay canvas, annotated at both
          edges. Nothing here is a silhouette or a stand-in. */}
      <div className="px-6 sm:px-10" style={{ borderBottom: `1px solid ${HAIRLINE}` }}>
        <div className="max-w-[1180px] mx-auto grid grid-cols-1 lg:grid-cols-[88px_minmax(0,1fr)_320px] xl:grid-cols-[96px_minmax(0,1fr)_384px] items-stretch">

          {/* THE DAY RAIL — the trip's days, or the week with today live. */}
          <DayRail
            days={railDays}
            extra={
              trip ? (
                <button
                  type="button"
                  onClick={() => {
                    setTripList(true);
                    // The list lives further down the scroll — bring it up.
                    window.setTimeout(() => {
                      document.getElementById('trip-packing-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 60);
                  }}
                  className="flex-shrink-0 hover:underline"
                  style={{
                    ...fitLabel(8.5, tripList ? ACCENT_DEEP : MUTED, '0.16em'),
                    padding: '14px 8px',
                    background: 'transparent',
                    border: 'none',
                  }}
                  title="The packing list — every piece across the trip's days"
                >
                  List
                </button>
              ) : null
            }
          />

          {/* THE FITTING ITSELF. */}
          <div
            className="relative flex flex-col min-w-0 lg:border-l lg:border-r border-[rgba(59,43,29,0.18)]"
            style={{ background: CANVAS, padding: '26px 22px 40px' }}
          >
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <span className="inline-flex items-center gap-2" style={fitLabel(9.5, MUTED, '0.16em')}>
                <span aria-hidden="true" style={{ width: '5px', height: '5px', borderRadius: '50%', background: ACCENT, display: 'inline-block' }} />
                {seasonLabel}
              </span>
              <span style={fitLabel(9.5, ACCENT_DEEP, '0.16em')}>{sourceLabel}</span>
            </div>

            {/* THE COLOUR HARMONY — the board's own palette, read off the
                pieces on it (their logged colours first, the colour named in
                their title second). */}
            <div style={{ marginTop: '16px' }}>
              <SectionRule right={dayLabel}>Colour harmony</SectionRule>
              <HarmonyBars colors={harmony} />
            </div>

            {/* TRIP BRIEF FORM (Part 10) — shown IN PLACE of the fitting when
                Trip mode was entered without a brief (no overlay). */}
            {tripFormOpen && (
              <div style={{ marginTop: '18px' }}>
                <TripBriefForm
                  onSubmit={(brief) => {
                    setTripFormOpen(false);
                    void composeTrip(brief);
                  }}
                  onCancel={() => setTripFormOpen(false)}
                />
              </div>
            )}

            {!tripFormOpen && !(trip && tripList) && (
              <section
                aria-label={trip ? `${activeDayState?.label || 'Trip day'} outfit board` : 'Your outfit board'}
                className="relative"
                style={{ marginTop: '10px' }}
              >
                {/* The reference's soft light behind the composition — paper
                    lifting out of the canvas wash, nothing drawn on it. */}
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '46%',
                    transform: 'translate(-50%,-50%)',
                    width: '260px',
                    height: '260px',
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(251,248,241,0.9) 0%, rgba(244,238,227,0) 70%)',
                    pointerEvents: 'none',
                  }}
                />
                {/* THE FLAT LAY, ANNOTATED: the real cutouts in their zones,
                    named at both edges on a gold leader — zone · colour ·
                    name · category · maker, with the status line on anything
                    not yours. The board itself is untouched: no field, no
                    frame, no figure. */}
                <div className="relative" style={{ zIndex: 2 }}>
                  <AnnotatedBoard pieces={activeBoard}>
                    <StyledOutfitBoard
                      pieces={activeBoard}
                      onRemove={removeFromBoard}
                      seed={trip ? `trip-${trip.brief.destination}-day-${trip.activeDay}` : boardSeed}
                    />
                  </AnnotatedBoard>
                </div>
                {/* Beau composing — today's board or the trip's day boards. */}
                {composing && (
                  <div
                    className="absolute inset-0 z-20 flex flex-col items-center justify-center text-center px-8"
                    style={{ background: 'rgba(244,238,227,0.78)' }}
                    aria-live="polite"
                  >
                    <span className="block w-12 h-[3px] bg-[var(--color-accent,#a8712c)] animate-pulse" aria-hidden="true" />
                    <p style={{ fontFamily: SERIF, fontSize: '20px', lineHeight: 1.3, maxWidth: '28ch', color: WALNUT, marginTop: '16px' }}>
                      {boardSource === 'trip' ? 'Beau is packing you…' : 'Beau is dressing you for today…'}
                    </p>
                  </div>
                )}
              </section>
            )}

            {/* THE FITTING'S OWN LINE — its name, the build it was drawn to,
                Beau's note, and the adjustments that re-dress it. */}
            {!tripFormOpen && !(trip && tripList) && (
              <div className="text-center" style={{ marginTop: '10px' }}>
                <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontWeight: 400, fontSize: '36px', lineHeight: 1.1, color: WALNUT }}>
                  {boardTitle}
                </div>
                <div style={{ ...fitLabel(9.5, MUTED, '0.2em'), marginTop: '9px' }}>{bodyTag}</div>
                <BoardNote text={noteLive && stripText ? stripText : boardDescription} live={noteLive} />
                {noteLive && (
                  <button
                    type="button"
                    onClick={dismissStrip}
                    className="hover:underline"
                    style={{ ...fitLabel(8, MUTED, '0.12em'), marginTop: '10px', background: 'transparent', border: 'none' }}
                    title="Hide Beau’s note — the outfit stays"
                  >
                    Hide the note
                  </button>
                )}
                {aiOriginated && !composing && <AdjustChips busy={adjustBusy} onAdjust={(adj) => void runAdjustment(adj)} />}
              </div>
            )}
          </div>

          {/* THE NOTES COLUMN — how to wear it, what to swap, what not to do. */}
          <aside aria-label="Notes on this look" style={{ background: PAPER, padding: '26px 22px 40px' }}>
            <SectionRule>Style notes</SectionRule>
            <NoteList notes={styleNotes} />

            <SectionRule className="mt-8">Swap alternatives</SectionRule>
            {completeLook.length > 0 ? (
              <div className="flex flex-col">
                {completeLook.map(({ piece, reason }) => (
                  <SwapRow
                    key={piece.key}
                    swatch={swatchForPiece(piece.name, ownedColors.get(piece.key) || null)}
                    name={piece.name}
                    why={reason}
                    onClick={() => onShelfTap(piece)}
                    title={`Put it on the board — ${piece.name}`}
                  />
                ))}
              </div>
            ) : (
              <p style={{ ...body(12.5, MUTED), margin: '12px 0 0' }}>
                Everything you own that suits the board is already on it — log more pieces in The Ledger and the
                swaps appear here.
              </p>
            )}

            <SectionRule className="mt-8">What not to do</SectionRule>
            <AvoidList notes={avoidNotes} />

            {/* ONE ACQUISITION LINE, BOXED (10a) — this screen speaks only
                about what you own; the exception is drawn as an exception. */}
            {acquisitionLine && (
              <div style={{ marginTop: '26px', background: CANVAS, borderLeft: `3px solid ${ACCENT}`, padding: '12px 14px 13px' }}>
                <p style={{ ...fitLabel(8, ACCENT_DEEP, '0.1em'), margin: 0 }}>The one thing you’d need to buy</p>
                <p style={{ ...body(13, INK), margin: '7px 0 0' }}>
                  {piece10aBuyLine(acquisitionLine)} It’s here because the board raised a question the wardrobe
                  can’t answer.
                </p>
                <button
                  type="button"
                  onClick={() => document.getElementById('fitting-picks-shelf')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="hover:underline"
                  style={{ ...fitLabel(8, ACCENT, '0.1em'), marginTop: '9px', background: 'transparent', border: 'none' }}
                >
                  See it in Beau’s picks →
                </button>
              </div>
            )}
          </aside>
        </div>
      </div>

      {/* 4 · THE ACTION ROW — the proposal strip, the zones line, then Save
          this look · Start an empty board · Share · the saved library. */}
      <div className="px-6 sm:px-10">
        <div className="max-w-[1180px] mx-auto">{actionBar}</div>
      </div>

      {/* 5 · THE BOARD — everything the fitting can be dressed in, on the
          page's own ground, one labelled shelf per source. */}
      <div style={{ background: PAGE }}>
        <div className="px-6 sm:px-10 pt-6 pb-10">
          <div className="max-w-[1180px] mx-auto">
            <div className="flex items-baseline justify-between gap-5 flex-wrap">
              <div className="min-w-0">
                <h4 style={{ margin: 0, fontFamily: SERIF, fontWeight: 400, fontSize: '28px', lineHeight: 1.1, color: WALNUT }}>
                  The board
                </h4>
                <p style={{ ...body(13.5, MUTED), margin: '6px 0 0', maxWidth: '64ch' }}>
                  Everything you can dress the fitting in: what you own, what you’re weighing in the Hunt, and what
                  Beau has put up. Tap a piece to put it on — tap it again, or use the × on the board, to take it
                  off.
                </p>
              </div>
              <span style={fitLabel(9, ACCENT_DEEP, '0.16em')}>{onBoardLine}</span>
            </div>

            {/* 4 · TRY SOMETHING NEW — paste a product URL, preview the piece
                on the board, and (only on an explicit tap) save it to the
                Reserve. The PASTE A LINK chip below scrolls here. */}
            <div id="fitting-paste-link">
              <TryFromUrlSection
                mode={mode}
                selectedKeys={selectedKeys}
                onTap={onShelfTap}
                onPin={pinPiece}
              />
            </div>

            {/* 5+6 · THE 10a FILTER ROW — the three sources with their live
                counts at the left (YOURS · WEIGHING · BEAU'S PICKS · PASTE A
                LINK), the category chips with counts at the right. Source
                chips show or hide whole sections; category chips filter
                within whichever sections are showing. */}
            <div
              className="flex items-center justify-between gap-x-6 gap-y-2 flex-wrap pt-5 pb-1"
              data-tour="tour-fitting-shelf"
            >
              <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Shelf sections">
                {SHELF_SECTIONS.map(({ id, label }) => {
                  const on = sectionsOn[id];
                  const count = id === 'owned' ? ownedPieces.length : id === 'reserve' ? radarPieces.length : beauPicks.length;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setSectionsOn((cur) => ({ ...cur, [id]: !cur[id] }))}
                      className="flex-shrink-0 uppercase whitespace-nowrap transition-colors"
                      style={{
                        fontFamily: MONO,
                        fontSize: '8.5px',
                        letterSpacing: '0.09em',
                        padding: '8px 12px',
                        borderRadius: 0,
                        ...(on
                          ? { background: '#241a12', color: '#fbf8f1', border: '1px solid #241a12' }
                          : { background: 'transparent', color: 'var(--color-neutral-700,#634e38)', border: '1px solid rgba(59,43,29,0.3)' }),
                      }}
                      title={on ? `Hide “${label}”` : `Show “${label}”`}
                    >
                      {label} {count}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => document.getElementById('fitting-paste-link')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                  className="flex-shrink-0 uppercase whitespace-nowrap hover:underline"
                  style={{ fontFamily: MONO, fontSize: '8.5px', letterSpacing: '0.09em', padding: '8px 6px', color: 'var(--color-accent-700,#7c4a17)', background: 'transparent' }}
                  title="Paste a product page — it previews on the board and can save to your Reserve"
                >
                  Paste a link
                </button>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Filter by category">
                <button
                  type="button"
                  aria-pressed={categoryFilters.length === 0}
                  onClick={() => setCategoryFilters([])}
                  className="flex-shrink-0 uppercase whitespace-nowrap transition-colors"
                  style={{
                    fontFamily: MONO,
                    fontSize: '8.5px',
                    letterSpacing: '0.09em',
                    padding: '8px 12px',
                    borderRadius: 0,
                    ...(categoryFilters.length === 0
                      ? { background: '#241a12', color: '#fbf8f1', border: '1px solid #241a12' }
                      : { background: 'transparent', color: 'var(--color-neutral-700,#634e38)', border: '1px solid rgba(59,43,29,0.3)' }),
                  }}
                >
                  All {ownedPieces.length + radarPieces.length + beauPicks.length}
                </button>
                {SHELF_CATEGORIES.map(({ id, label }) => {
                  const on = categoryFilters.includes(id);
                  const count = [...ownedPieces, ...radarPieces, ...beauPicks].filter((p) => pieceInCategory(p, id)).length;
                  if (count === 0) return null;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleCategoryFilter(id)}
                      className="flex-shrink-0 uppercase whitespace-nowrap transition-colors"
                      style={{
                        fontFamily: MONO,
                        fontSize: '8.5px',
                        letterSpacing: '0.09em',
                        padding: '8px 12px',
                        borderRadius: 0,
                        ...(on
                          ? { background: '#241a12', color: '#fbf8f1', border: '1px solid #241a12' }
                          : { background: 'transparent', color: 'var(--color-neutral-600,#856c51)', border: '1px solid rgba(59,43,29,0.22)' }),
                      }}
                      title={on ? `Stop filtering by ${label.toLowerCase()}` : `Show only ${label.toLowerCase()}`}
                    >
                      {label} {count}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 7 · THE THREE-LEVEL SHELF — What you own · In your Reserve ·
                Beau's picks; each section is shown or hidden by its source
                toggle above, all three visible by default, and narrowed by
                the category chips. */}
            {sectionsOn.owned && (
              <Shelf
                title="Yours · logged in the Ledger"
                note={shelfOwnedOn > 0 ? `${shelfOwnedOn} on the board` : `${shelfOwned.length} piece${shelfOwned.length === 1 ? '' : 's'}`}
              >
                {shelfOwned.length > 0 ? (
                  shelfOwned.map((piece) => (
                    <ShelfCard
                      key={piece.key}
                      piece={piece}
                      isPick={false}
                      mode={mode}
                      selected={selectedKeys.has(piece.key)}
                      onTap={() => onShelfTap(piece)}
                      onPin={() => pinPiece(piece)}
                    />
                  ))
                ) : (
                  <ShelfEmpty>
                    {categoryFilters.length > 0
                      ? 'Nothing you own in those categories — clear a filter to see the rest.'
                      : 'Nothing logged yet — photograph or search a piece in The Ledger.'}
                  </ShelfEmpty>
                )}
              </Shelf>
            )}

            {sectionsOn.reserve && (
              <Shelf
                title="Weighing · watched in the Hunt"
                note={shelfReserveOn > 0 ? `${shelfReserveOn} on the board` : `${shelfReserve.length} piece${shelfReserve.length === 1 ? '' : 's'}`}
              >
                {shelfReserve.length > 0 ? (
                  shelfReserve.map((piece) => (
                    <ShelfCard
                      key={piece.key}
                      piece={piece}
                      isPick={false}
                      mode={mode}
                      selected={selectedKeys.has(piece.key)}
                      onTap={() => onShelfTap(piece)}
                      onPin={() => pinPiece(piece)}
                    />
                  ))
                ) : (
                  <ShelfEmpty>
                    {categoryFilters.length > 0
                      ? 'Nothing in your Reserve in those categories — clear a filter to see the rest.'
                      : 'Nothing on your Reserve yet — watch a piece and it appears here.'}
                  </ShelfEmpty>
                )}
              </Shelf>
            )}

            {sectionsOn.picks && (
              <Shelf
                id="fitting-picks-shelf"
                title="Beau’s picks · not yours yet"
                tone={OXBLOOD}
                note={shelfPicksOn > 0 ? `${shelfPicksOn} on the board` : `${shelfPicks.length} piece${shelfPicks.length === 1 ? '' : 's'}`}
              >
                {shelfPicks.length > 0 ? (
                  shelfPicks.map((piece) => (
                    <ShelfCard
                      key={`picks-${piece.key}`}
                      piece={piece}
                      isPick
                      mode={mode}
                      selected={selectedKeys.has(piece.key)}
                      onTap={() => onShelfTap(piece)}
                      onPin={() => pinPiece(piece)}
                    />
                  ))
                ) : (
                  <ShelfEmpty>
                    {categoryFilters.length > 0
                      ? 'None of Beau’s picks sit in those categories — clear a filter to see the rest.'
                      : 'Beau has nothing to add here yet — log a few pieces in The Ledger and he’ll fill this shelf.'}
                  </ShelfEmpty>
                )}
              </Shelf>
            )}

            {/* TRIP ONLY: the packing list — flat, deduplicated. */}
            {trip && (
              <section id="trip-packing-list" aria-label="Packing list" className="pt-8">
                <p
                  className="uppercase text-[var(--color-neutral-700,#634e38)] pb-2 border-b border-[var(--color-divider,rgba(59,43,29,0.18))]"
                  style={{ fontFamily: 'var(--space-font-heading)', fontSize: '13px', letterSpacing: '0.16em' }}
                >
                  Packing list
                </p>
                {packingList.length > 0 && (
                  /* DOUBLE DUTY (17a): the packing list counts the pieces
                     working two or more days — the measure of a tight bag. */
                  <p className="pt-2" style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', color: 'var(--color-text,#241a12)' }}>
                    {packingList.length} piece{packingList.length === 1 ? '' : 's'} ·{' '}
                    <span style={{ color: doubleDuty.count > 0 ? 'var(--color-accent-700,#7c4a17)' : 'var(--color-neutral-600,#856c51)' }}>
                      {doubleDuty.count} doing double duty
                    </span>
                  </p>
                )}
                {packingList.length > 0 ? (
                  <div
                    className="flex gap-3 sm:gap-4 overflow-x-auto pt-3 pb-1"
                    style={{ WebkitOverflowScrolling: 'touch', overscrollBehaviorX: 'contain' }}
                  >
                    {packingList.map((p) => (
                      <div key={p.key} className="w-[92px] sm:w-[104px] flex-shrink-0">
                        <span className="relative block w-full aspect-square overflow-hidden">
                          {p.image && isTransparentCutout(p.image) ? (
                            /* Only the genuine cutout renders, bare on the
                               paper — never a raw photograph and never a
                               plated white box (universal transparency). */
                            <span className="absolute inset-0 flex items-center justify-center">
                              <img
                                src={p.image}
                                alt={p.name}
                                loading="eager"
                                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
                              />
                            </span>
                          ) : p.image ? (
                            <span className="absolute inset-0 bg-[#eadfcb]" aria-hidden="true" />
                          ) : (
                            <span
                              className="absolute inset-0 flex items-center justify-center text-center px-1 text-[var(--color-neutral-600,#856c51)]"
                              style={{ fontFamily: 'var(--space-font-family)', fontSize: '10px', lineHeight: 1.4 }}
                            >
                              {p.name}
                            </span>
                          )}
                        </span>
                        <span className="block mt-1 leading-tight break-words" style={{ ...pieceNameType, fontSize: '11px' }}>
                          {p.name}
                        </span>
                        {(doubleDuty.daysPerPiece.get(p.key) || 0) >= 2 && (
                          <span className="block" style={{ fontFamily: 'var(--space-font-family)', fontSize: '10px', color: 'var(--color-accent-700,#7c4a17)' }}>
                            {doubleDuty.daysPerPiece.get(p.key)} days · double duty
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="pt-3 text-[var(--color-neutral-600,#856c51)]" style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px' }}>
                    The packing list fills as the day boards do.
                  </p>
                )}
              </section>
            )}

            {/* THE SHELF'S FOOTNOTE — the board's contract, stated once. */}
            <div className="mt-8 pt-3" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
              <p style={{ ...body(12, MUTED), margin: 0, maxWidth: '64ch' }}>
                Pasting a product page here previews the piece on the board — save it and it joins your Reserve.
                Anything not yours lands dashed; a board holding one saves as a proposal, and product photography is
                cut out of its background before it lands.
              </p>
            </div>

            {/* SAVED OUTFITS — inline at the foot of the same scroll (the
                old slide-up drawer is retired): "View saved" scrolls here,
                and the board stays visible without dismissing anything. */}
            <div ref={savedRef} className="pt-10">
              <p style={{ fontFamily: 'var(--space-font-heading)', fontSize: '20px', color: 'var(--color-text,#241a12)' }}>
                Saved
              </p>

              {/* LOOKS AND PROPOSALS, SEPARATED (22a): a look is wearable
                  tomorrow — every piece yours; a proposal holds a piece you
                  don't own and draws dashed, so “what shall I wear” never
                  returns a shopping list. Legacy rows without the stored
                  flag are re-derived from their pieces. */}
              {(() => {
                const allRows = savedRows || [];
                const isProposalRow = (row: SavedOutfitRow) =>
                  row.mode === 'proposal' ||
                  parsePieces(row.pieces).some((p) => !(p.key || '').startsWith('owned-'));
                const savedLooks = allRows.filter((r) => !isProposalRow(r));
                const savedProposals = allRows.filter(isProposalRow);
                const renderRow = (row: SavedOutfitRow, proposal: boolean) => {
                  const rowPieces = parsePieces(row.pieces);
                  const waitingOn = proposal ? rowPieces.filter((p) => !(p.key || '').startsWith('owned-')).length : 0;
                  return (
                    <div
                      key={row.id}
                      className="flex items-center gap-3"
                      style={proposal ? { borderLeft: '2px dashed var(--color-accent,#a8712c)', paddingLeft: '10px' } : undefined}
                    >
                      <button
                        type="button"
                        onClick={() => loadSavedOutfit(row)}
                        className="flex-1 min-w-0 min-h-[44px] py-2.5 text-left group"
                        title={`Load “${row.name}” onto the board`}
                      >
                        <span className="block truncate" style={{ fontFamily: 'var(--space-font-heading)', fontSize: '16px', fontWeight: 500, color: 'var(--color-text,#241a12)' }}>
                          {row.name}
                        </span>
                        <span className="block truncate group-hover:underline" style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px', color: 'var(--color-neutral-600,#856c51)' }}>
                          {proposal && waitingOn > 0 ? `Waiting on ${waitingOn} piece${waitingOn === 1 ? '' : 's'} · ` : ''}
                          {rowPieces.length > 0 ? rowPieces.map((p) => p.name).join(' · ') : 'Empty board'}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeSavedOutfit(row.id)}
                        disabled={deletingId === row.id}
                        aria-label={`Delete the saved ${proposal ? 'proposal' : 'look'} ${row.name}`}
                        title={proposal ? 'Delete this proposal' : 'Delete this saved look'}
                        className="flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--color-neutral-500,#a68e70)] hover:text-[var(--color-accent-700,#7c4a17)] disabled:opacity-40"
                        style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px' }}
                      >
                        {deletingId === row.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '×'}
                      </button>
                    </div>
                  );
                };
                return (
                  <>
                    <p
                      className="uppercase text-[var(--color-neutral-700,#634e38)] pb-2 border-b border-[var(--color-divider,rgba(59,43,29,0.18))] mt-3"
                      style={{ fontFamily: 'var(--space-font-heading)', fontSize: '12px', letterSpacing: '0.16em' }}
                    >
                      Looks · {savedLooks.length} — every piece yours · wearable tomorrow
                    </p>
                    {savedLooks.length > 0 ? (
                      <div className="divide-y divide-[var(--color-divider,rgba(59,43,29,0.18))] border-b border-[var(--color-divider,rgba(59,43,29,0.18))]">
                        {savedLooks.map((row) => renderRow(row, false))}
                      </div>
                    ) : (
                      <p className="pt-3 text-[var(--color-neutral-600,#856c51)]" style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px' }}>
                        Nothing saved yet — build a board and tap Save.
                      </p>
                    )}
                    <p
                      className="uppercase text-[var(--color-neutral-700,#634e38)] pb-2 border-b border-[var(--color-divider,rgba(59,43,29,0.18))] mt-6"
                      style={{ fontFamily: 'var(--space-font-heading)', fontSize: '12px', letterSpacing: '0.16em' }}
                    >
                      Proposals · {savedProposals.length} — each holds a piece you don’t own · dashed
                    </p>
                    {savedProposals.length > 0 ? (
                      <div className="divide-y divide-[var(--color-divider,rgba(59,43,29,0.18))] border-b border-[var(--color-divider,rgba(59,43,29,0.18))]">
                        {savedProposals.map((row) => renderRow(row, true))}
                      </div>
                    ) : (
                      <p className="pt-3 text-[var(--color-neutral-600,#856c51)]" style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px' }}>
                        No proposals — a board holding a piece you don’t own saves here, and becomes a look the day you buy it.
                      </p>
                    )}
                  </>
                );
              })()}

            </div>
          </div>
        </div>
      </div>

      {/* 7 · THE CLOSING LEGEND — what the board's colours are, and the one
          line that says how the screen answers a tap. */}
      <FooterLegend
        items={[
          { dot: '#1f2a44', label: harmonyFamilies.anchor > 0 ? `Anchors · ${harmonyFamilies.anchor}` : 'Anchors' },
          { dot: MUTED, label: harmonyFamilies.neutral > 0 ? `Neutrals · ${harmonyFamilies.neutral}` : 'Neutrals' },
          { dot: ACCENT, label: harmonyFamilies.accent > 0 ? `Accents · ${harmonyFamilies.accent}` : 'Accents' },
        ]}
        note="Tap a day or a source and the fitting re-dresses"
      />

      {/* THE SAVED LOOKS SCREEN (22a · M7) — two-up flat-lay grid, sorted
          by last worn, proposals dashed. Tapping a card loads it here. */}
      {savedLooksOpen && (
        <SavedLooksScreen
          onLoadLook={(row) => {
            loadSavedOutfit(row as SavedOutfitRow);
            setSavedLooksOpen(false);
          }}
          onClose={() => setSavedLooksOpen(false)}
        />
      )}

      {/* SAVE — the inline naming sheet. */}
      {saveOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(36,26,18,0.42)' }}
            onClick={() => setSaveOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-label="Name this outfit"
            className="relative w-full sm:max-w-md bg-[var(--color-paper,#fbf8f1)] border border-[var(--color-divider,rgba(59,43,29,0.18))] p-5"
          >
            <p style={{ fontFamily: 'var(--space-font-heading)', fontSize: '19px', color: 'var(--color-text,#241a12)' }}>
              Name this outfit
            </p>
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void saveBoardAs(saveName);
              }}
              placeholder="e.g. Friday dinner"
              aria-label="Outfit name"
              autoFocus
              className="w-full mt-3 px-3 min-h-[44px] border border-[var(--color-divider,rgba(59,43,29,0.18))] bg-white text-[var(--color-text,#241a12)] focus:outline-none focus:border-[var(--color-accent,#a8712c)]"
              style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', borderRadius: 0 }}
            />
            <div className="flex items-center justify-end gap-3 mt-4">
              <button
                type="button"
                onClick={() => setSaveOpen(false)}
                className="min-h-[44px] px-2 hover:underline text-[var(--color-neutral-600,#856c51)]"
                style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveBoardAs(saveName)}
                disabled={saving}
                className="px-4 min-h-[44px] inline-flex items-center gap-1.5 border border-[var(--color-accent,#a8712c)] text-[var(--color-accent-700,#7c4a17)] hover:bg-[var(--color-accent-100,#fbf1de)] transition-colors disabled:opacity-40"
                style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', borderRadius: 0 }}
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default FittingRoomTab;
