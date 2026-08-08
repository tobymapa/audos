/**
 * Ethaion garment visuals (Pass Nineteen) — ONE canonical renderer.
 *
 * Every wardrobe surface shows the piece's stored canonical image: the
 * founder's own photo of the garment run through THE ONE ingestion pipeline
 * (photo-enhance.ts — background removed, alpha edge eroded ~2px, tight-
 * cropped to the silhouette + 4px, verified) into a GENUINE alpha-channel
 * transparent PNG (Pass Forty-Nine — the universal transparency rule). A
 * genuine cutout renders BARE here — no plate, no border, no ground of its
 * own — so no rectangular line can ever appear around an item; a photograph
 * that has no cutout yet is NEVER shown raw — the quiet processing tile
 * holds its place while its ingestion (scheduled from this tile) runs.
 *
 * While a piece is being (re)generated its place is held by the quiet
 * processing tile (never the raw source photograph); the pipeline pushes
 * fresh URLs into a live registry keyed by piece id so cards update the
 * moment a new image lands, without a DB refetch.
 *
 * ONE STORED CUTOUT, REUSED HERE TOO. When the ingestion pipeline has a clean
 * transparent PNG for this piece (image-pipeline's `image_cutouts` store) the
 * tile shows THAT file — the same one the Today tray and the Fitting board
 * lay out, at the same cost as any other image, so What You Own and the
 * compositions can never show two different pictures of one garment. It is a
 * synchronous lookup, never a pipeline run.
 */
import { useEffect, useRef, useState } from 'react';
import { isStoredCutoutUrl, peekCutoutRecord, whenIdle } from './image-pipeline';

export interface CanonicalGarmentFields {
  name?: string | null;
  category?: string | null;
  slot?: string | null;
  colors?: string[] | null;
  pattern?: string | null;
  brand?: string | null;
  photoUrl?: string | null;
  photo_url?: string | null;
}

// ---------------------------------------------------------------------------
// Live image registry — the pipeline pushes freshly generated canonical URLs
// here so open views update instantly; the DB refresh follows behind.
// ---------------------------------------------------------------------------

interface RegistryEntry {
  url: string;
  /** When the pipeline pushed this URL. */
  at: number;
}

const imageRegistry = new Map<number, RegistryEntry>();

/**
 * How long a pushed URL is allowed to OUTRANK the value on the piece row.
 *
 * THE STALE-IMAGE BUG: this registry used to be a plain, permanent
 * `Map<number, string>` that `liveGarmentImage()` returned ahead of the
 * database value. It exists only to bridge the second or two between the
 * pipeline finishing an image and the refreshed row arriving — but nothing
 * ever removed an entry. So once a piece had been through the pipeline, its
 * tile was pinned to that URL for the rest of the page's life: replacing the
 * photo, editing the piece, or deleting it and adding another kept painting
 * the superseded picture, and closing the app and reopening it from the dock
 * brought the old image straight back because the module — and this Map —
 * outlived the component tree.
 *
 * The registry is now advisory. Inside the grace window a pushed URL still
 * wins, because it genuinely is newer than anything the DB can have returned
 * yet. Outside it, the piece row is authoritative and the entry is dropped.
 */
const REGISTRY_GRACE_MS = 20000;

/**
 * Tell mounted tiles that a garment image changed.
 *
 * THE BROADCAST PROBLEM: this event used to carry no payload, and every
 * mounted `CanonicalGarment` listened and bumped its own state. One cutout
 * finishing therefore re-rendered EVERY tile on the screen — plus every tile
 * in every previously-visited tab, since those stay mounted under
 * `display:none`. During the migration sweep, which completes one cutout after
 * another, that is hundreds of full-grid re-renders for work affecting a
 * single item, and it magnifies the cost of everything else happening at
 * startup.
 *
 * The event now identifies what changed, and tiles ignore anything that is not
 * theirs. `source` is included as well as `pieceId` because two pieces can
 * share one photograph (a duplicate mid-merge) and both tiles need waking when
 * that shared image is cut.
 *
 * A call with neither identifier keeps the old broadcast-to-all behaviour, so
 * any caller that genuinely means "everything changed" still works.
 */
export function notifyGarmentImage(pieceId?: number | null, source?: string | null): void {
  window.dispatchEvent(
    new CustomEvent('ethaion:garment-image-ready', {
      detail: { pieceId: pieceId ?? null, source: (source || '').trim() || null },
    }),
  );
}

export function registerGarmentImage(pieceId: number, url?: string | null): void {
  const clean = (url || '').trim();
  if (!pieceId || !clean) return;
  ensureForgetListener();
  imageRegistry.set(pieceId, { url: clean, at: Date.now() });
  notifyGarmentImage(pieceId, clean);
}

/** Drop a piece's pushed image. Called when the piece is deleted and when its
 * photograph is replaced, so nothing can resurrect the old picture. */
export function forgetGarmentImage(pieceId?: number | null): void {
  if (pieceId == null) return;
  if (imageRegistry.delete(pieceId)) {
    notifyGarmentImage(pieceId);
  }
}

// Eviction arrives as an event rather than a direct call: profile-data.ts owns
// deletion, and importing this module from there would close an import cycle
// (photo-enhance already depends on both).
//
// Attached lazily rather than at module-evaluation time. A module-level
// `addEventListener` runs before anything has been registered and, in any
// context where `window` is not yet defined, would fail silently and leave
// eviction permanently dead. Hooking it on first use ties the listener's
// lifetime to the registry actually being in play.
let listenerAttached = false;

function ensureForgetListener(): void {
  if (listenerAttached) return;
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  listenerAttached = true;
  window.addEventListener('ethaion:piece-forgotten', (event: Event) => {
    const pieceId = Number((event as CustomEvent).detail?.pieceId);
    if (pieceId) forgetGarmentImage(pieceId);
  });
}

/**
 * The pushed image for a piece, if it should still take precedence.
 *
 * @param dbUrl The value on the piece row. When it disagrees with a pushed
 *              URL that is past its grace window, the row wins and the stale
 *              entry is evicted.
 */
export function liveGarmentImage(pieceId?: number | null, dbUrl?: string | null): string {
  if (pieceId == null) return '';
  const entry = imageRegistry.get(pieceId);
  if (!entry) return '';

  const fresh = Date.now() - entry.at < REGISTRY_GRACE_MS;
  if (fresh) return entry.url;

  // Past the window the database is the source of truth. A row that now
  // carries a different image means this entry describes a photograph the
  // user has already moved on from.
  const clean = (dbUrl || '').trim();
  if (clean && clean !== entry.url) {
    imageRegistry.delete(pieceId);
    return '';
  }
  return entry.url;
}

// Regeneration state, pushed by the pipeline (photo-enhance.ts). Held here
// rather than imported from photo-enhance — which imports THIS module, so the
// dependency has to run one way — and it lets every tile show the subtle
// in-progress indicator without prop drilling.
const regeneratingIds = new Set<number>();

export function setGarmentRegenerating(pieceId: number, active: boolean): void {
  if (!pieceId) return;
  if (active) regeneratingIds.add(pieceId);
  else regeneratingIds.delete(pieceId);
  notifyGarmentImage(pieceId);
}

export function isGarmentRegenerating(pieceId?: number | null): boolean {
  return pieceId != null && regeneratingIds.has(pieceId);
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/**
 * The ONE garment visual, shared by every wardrobe surface: the piece's
 * stored GENUINE transparent cutout, drawn bare. When a piece is still being
 * processed (or briefly has no image at all) a quiet neutral tile holds its
 * exact place in the grid — never a blank box, never a "no photo" label, and
 * never tinted to the piece's own colour: pieces carry no colour treatment
 * anywhere (Recommendation Engine overhaul, Part 2).
 */
export function CanonicalGarment({
  fields,
  photoUrl,
  pieceId,
  className = '',
  title,
}: {
  fields: CanonicalGarmentFields;
  photoUrl?: string | null;
  /** When provided, the tile live-updates as the pipeline lands new images. */
  pieceId?: number | null;
  className?: string;
  title?: string;
  showConfirmation?: boolean;
}) {
  const label = title || fields.name || 'Garment image';
  // The row's own value is passed in so a pushed URL that the database has
  // since superseded can be recognised as stale and stood down.
  const rowUrl = photoUrl || fields.photoUrl || fields.photo_url || '';

  const [, setRegistryTick] = useState(0);
  // Only wake for events about THIS tile. Previously every tile re-rendered on
  // every image event anywhere in the app; a grid of 60 garments meant 60
  // re-renders per completed cutout, and the migration sweep completes one
  // after another. The `rowUrl` ref keeps this subscription from being torn
  // down and re-attached on each render without making the effect depend on a
  // value that changes every time the pipeline lands a new image.
  const rowUrlRef = useRef(rowUrl);
  rowUrlRef.current = rowUrl;
  useEffect(() => {
    const refresh = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { pieceId?: number | null; source?: string | null }
        | undefined;
      // No payload means "something global changed" — honour the old
      // broadcast semantics rather than silently dropping the update.
      if (!detail || (detail.pieceId == null && !detail.source)) {
        setRegistryTick((tick) => tick + 1);
        return;
      }
      const mine =
        (pieceId != null && detail.pieceId === pieceId) ||
        (!!detail.source && detail.source === rowUrlRef.current);
      if (mine) setRegistryTick((tick) => tick + 1);
    };
    window.addEventListener('ethaion:garment-image-ready', refresh);
    return () => window.removeEventListener('ethaion:garment-image-ready', refresh);
  }, [pieceId]);

  const candidate = liveGarmentImage(pieceId, rowUrl) || rowUrl;
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [candidate]);
  // The stored transparent PNG, when the pipeline made one for this
  // photograph. Any stored transparent PNG counts here — including a tier-2
  // (on-body) or flagged cut: the compositions hold those out themselves,
  // but as a TILE a processed transparent cutout always beats a placeholder,
  // and a raw photograph is never an option (universal transparency rule).
  const stored = peekCutoutRecord(candidate);
  const cutout = stored?.transparentImageUrl || '';
  const [cutoutBroken, setCutoutBroken] = useState(false);
  useEffect(() => setCutoutBroken(false), [cutout]);
  const display = cutout && !cutoutBroken ? cutout : candidate;
  // UNIVERSAL TRANSPARENCY (the founder's rule): a photograph the pipeline
  // has not cut yet is NEVER painted raw. Its ingestion is scheduled from
  // here — idle-time, deduplicated and queued inside the pipeline itself —
  // and the quiet processing tile below holds its place until the genuine
  // transparent cutout lands and the registry event repaints the tile.
  const genuineCutout = (!!cutout && !cutoutBroken) || isStoredCutoutUrl(candidate);
  // ON-SCREEN GATE.
  //
  // This effect schedules a full ingestion run — which can mean a vision
  // classification, a background-removal API call, a GENERATIVE image-to-image
  // call and a second vision verification, plus canvas pixel work on the main
  // thread — and it used to do so for EVERY tile that rendered. Not every
  // visible tile: every mounted one. A wardrobe grid scrolled past the fold,
  // and every tile in every tab the customer had already visited (those stay
  // mounted under `display:none`), all queued work for garments nobody was
  // looking at. That is what a profile showed as an 11.8s interaction delay
  // and a 16.9s frozen frame.
  //
  // A tile now earns its ingestion by being on screen. `rootMargin` starts the
  // work slightly before the tile scrolls into view so the image is usually
  // ready by the time it is looked at.
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const [onScreen, setOnScreen] = useState(false);
  useEffect(() => {
    if (onScreen) return; // Latch: once seen, stay eligible.
    const el = hostRef.current;
    if (!el) return;
    if (typeof IntersectionObserver !== 'function') {
      // No observer (very old engine) — fall back to the previous behaviour
      // rather than never ingesting anything.
      setOnScreen(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setOnScreen(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onScreen]);

  useEffect(() => {
    if (!candidate || genuineCutout) return;
    if (!onScreen) return;
    let live = true;
    whenIdle(() => {
      if (!live) return;
      // Dynamic import: photo-enhance imports THIS module, so the static
      // dependency has to keep running one way only.
      void import('./photo-enhance')
        .then((m) =>
          m.flatLayAssetForShelf({
            candidates: candidate,
            category: fields.category ?? null,
            name: fields.name ?? null,
            pieceId: pieceId ?? null,
          }),
        )
        .then((asset) => {
          if (live && asset?.ready) {
            // Scoped to this piece AND its source photograph: the source is
            // what wakes a second tile showing the same image (duplicates
            // mid-merge), which a pieceId alone would miss.
            notifyGarmentImage(pieceId, candidate);
          }
        })
        .catch(() => undefined);
    });
    return () => {
      live = false;
    };
  }, [candidate, genuineCutout, onScreen, fields.category, fields.name, pieceId]);

  // Subtle in-progress indicator while the pipeline (re)generates this
  // piece's image; the PREVIOUS image stays fully visible underneath.
  const regenerating = isGarmentRegenerating(pieceId);
  const regenBadge = regenerating ? (
    <span
      className="absolute bottom-1 right-1 z-10 inline-flex h-4 w-4 items-center justify-center rounded-full bg-white/90 shadow-sm"
      title="Cleaning up your photo…"
      aria-hidden="true"
    >
      <span className="block h-2.5 w-2.5 rounded-full border-[1.5px] border-[var(--space-brand-primary)] border-t-transparent animate-spin" />
    </span>
  ) : null;

  if (candidate && !broken) {
    // UNIVERSAL TRANSPARENCY (founder's rule): a GENUINE alpha-channel
    // cutout renders BARE — no plate, no border, no mat and no ground of
    // its own — so the item floats on whatever surface it lands on (paper,
    // the beige canvas, the walnut slab) with no rectangular line around
    // it. `cutout` is the stored record's PNG; `isStoredCutoutUrl` catches
    // the case where the candidate URL itself IS the stored cutout (the
    // piece's canonical image since Pass Forty-Nine).
    if (genuineCutout) {
      return (
        <span
          ref={hostRef}
          className={`relative inline-flex items-center justify-center overflow-hidden ${className}`}
          role="img"
          aria-label={label}
          style={{ background: 'transparent', border: 'none', boxShadow: 'none' }}
        >
          <img
            src={display}
            alt={label}
            className="absolute object-contain"
            style={{ inset: 0, width: '100%', height: '100%', background: 'transparent' }}
            loading="lazy"
            onError={() => {
              // A stored cutout that will not load is not a missing
              // photograph: fall back to the piece's own image first.
              if (display !== candidate) setCutoutBroken(true);
              else setBroken(true);
            }}
          />
          {regenBadge}
        </span>
      );
    }
    // NO CUTOUT YET — the pipeline is cutting it now (regenerating), or its
    // ingestion was just scheduled above. Either way the quiet processing
    // tile holds the piece's place: a raw, unprocessed photograph is NEVER
    // presented as the item's display image (founder's universal
    // transparency rule — the framed-photograph fallback is retired), and
    // the genuine cutout swaps in the moment it lands.
    return (
      <span
        ref={hostRef}
        className={`hab-plate relative inline-flex items-center justify-center overflow-hidden bg-[#eadfcb] ${className}`}
        role="img"
        aria-label={`${label} — being prepared`}
      >
        <span
          className="block w-1/3 opacity-70"
          style={{ background: 'var(--space-neutral-300, #dccdb2)', aspectRatio: '1 / 1' }}
          aria-hidden="true"
        />
        {regenBadge}
      </span>
    );
  }

  // Placeholder while the pipeline works: the same box, holding the piece's
  // place — transient by design and deliberately UNCOLOURED, so a filled
  // piece never reads as a colour chip while its photograph resolves.
  // Honest empty frame (Pass Thirty-One): a flat #eadfcb block inside the
  // plate — never a grey clipart garment, never a white icon panel.
  return (
    <span
      ref={hostRef}
      className={`hab-plate relative inline-flex items-center justify-center overflow-hidden bg-[#eadfcb] ${className}`}
      role="img"
      aria-label={label}
    >
      <span
        className="block w-1/3 opacity-70"
        style={{ background: 'var(--space-neutral-300, #dccdb2)', aspectRatio: '1 / 1' }}
        aria-hidden="true"
      />
      {regenBadge}
    </span>
  );
}

export const ProductGarmentImage = CanonicalGarment;

export function BrandMark({ brand, className = '' }: { brand?: string | null; className?: string }) {
  const cleanBrand = (brand || '').trim();
  if (!cleanBrand) return null;
  // Derived from the CURRENT brand prop on every render — renaming a maker
  // updates the mark immediately; nothing is cached against the old name.
  const initials = cleanBrand
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  return (
    <span key={cleanBrand.toLocaleLowerCase()} className={`inline-flex items-center gap-1.5 ${className}`} title={cleanBrand}>
      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-[var(--space-border-default)] bg-[var(--space-surface-muted)] px-1 text-[8px] font-bold tracking-tight text-[var(--space-text-brand)]">
        {initials}
      </span>
      <span className="truncate">{cleanBrand}</span>
    </span>
  );
}
