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
import { useEffect, useState } from 'react';
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

const imageRegistry = new Map<number, string>();

export function registerGarmentImage(pieceId: number, url?: string | null): void {
  const clean = (url || '').trim();
  if (!pieceId || !clean) return;
  imageRegistry.set(pieceId, clean);
  window.dispatchEvent(new CustomEvent('ethaion:garment-image-ready'));
}

export function liveGarmentImage(pieceId?: number | null): string {
  return (pieceId != null && imageRegistry.get(pieceId)) || '';
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
  window.dispatchEvent(new CustomEvent('ethaion:garment-image-ready'));
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
  const [, setRegistryTick] = useState(0);
  useEffect(() => {
    const refresh = () => setRegistryTick((tick) => tick + 1);
    window.addEventListener('ethaion:garment-image-ready', refresh);
    return () => window.removeEventListener('ethaion:garment-image-ready', refresh);
  }, []);

  const label = title || fields.name || 'Garment image';
  const candidate = liveGarmentImage(pieceId) || photoUrl || fields.photoUrl || fields.photo_url || '';
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
  useEffect(() => {
    if (!candidate || genuineCutout) return;
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
            window.dispatchEvent(new CustomEvent('ethaion:garment-image-ready'));
          }
        })
        .catch(() => undefined);
    });
    return () => {
      live = false;
    };
  }, [candidate, genuineCutout, fields.category, fields.name, pieceId]);

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
