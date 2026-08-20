/**
 * THE PRODUCT PHOTOGRAPH — the shared image block behind The Rail's Tier 2
 * product cards and World of Menswear's “Where to find one” retailer cards.
 *
 * FOUR RULES, and they are the whole point of this component:
 *  1. ONE SHAPE, ALWAYS THE SAME — AND NOTHING AROUND IT. Every card
 *     reserves an identical 4:5 portrait area whatever shape the source file
 *     happens to be: a square Shopify export, a tall Mr Porter pack shot and
 *     a wide eBay snap all land in the same space. The photograph is
 *     CONTAINED inside it, never stretched and never cropped — these are
 *     product-only shots, and cover would cut the toe off a shoe. There is
 *     NO border, NO mat, NO shadow and NO fill: the product floats on the
 *     shelf's own paper, the same rule the Fitting shelf follows, so a piece
 *     does not change appearance depending on which surface it lands on.
 *  2. THE SPACE IS THERE FIRST. The 4:5 area holds the grid's shape from the
 *     first render and the photograph fades in when it loads, so nothing
 *     reflows on a slow retailer CDN. It is reserved space, not a plate —
 *     nothing is ever painted behind the product.
 *  3. RIGHT-SIZED FILES, BUT NEVER SOFT ONES. The image is requested at twice
 *     the width it is rendered at (`cappedImageUrl`), so a 200px card stops
 *     downloading a 2000px press original — subject to a hard 800px FLOOR
 *     (`productImageWidth`), because capping a small card at twice its own
 *     size delivered ~300px files that went visibly soft the moment a piece
 *     was opened or zoomed. A `srcSet` offers the retina variant alongside.
 *     URLs whose CDN has no documented width parameter are passed through
 *     untouched, and if a capped URL ever fails the original is tried before
 *     the candidate is given up on.
 *  4. DIRECT CLICK-THROUGH, NEVER A SUBSTITUTE. Tapping the photograph opens
 *     the product page it came from. If no real photograph resolves, the
 *     design system's neutral placeholder shows — a walnut-bordered paper
 *     rectangle in the same 4:5 frame. Never an illustration, never an
 *     unrelated stock photo.
 *
 * AND THE SOURCING IS NOT THIS FILE'S OWN. Every grid that shows a sourced
 * product ingests it through the one shared rule (flat-lay-sourcing.ts): the
 * ranked candidates resolved once, the source photograph SELECTED by the
 * vision classification (no person, plain background), then real background
 * removal, verification and storage as a transparent PNG. The plate paints
 * the resolved photograph immediately so nothing waits on it, hands the
 * ingestion to the idle queue, and swaps in the STORED cutout the moment it
 * lands — or on the very first render when the item was ingested on an
 * earlier visit, because the stored record answers synchronously.
 *
 * WHILE THERE IS NO CUTOUT the photograph is shown on a PAPER PLATE with a
 * hairline frame, not blended into the shelf. Multiplying a studio white into
 * the page is a display-layer trick: it tints the garment, it does nothing
 * for a lifestyle background, and it breaks on any dark ground. A framed
 * photograph is honest everywhere, and it simply falls away once the real
 * cutout is stored.
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { ingestProductInBackground, peekProductFlatLayAsset } from './flat-lay-sourcing';
import { isTransparentCutout } from './photo-enhance';
import { ShimmerDefs, Skeleton } from './skeleton';
import { useOnScreen } from './use-on-screen';
import {
  cappedImageUrl,
  confirmProductImage,
  peekProductImageCandidate,
  productImageSrcSet,
  productImageWidth,
  reportBrokenProductImage,
  resolveProductImageCandidates,
  type ProductImageCandidate,
} from './product-images';

/** Every plate is this shape, whatever shape the source file is — and it is
 * shape ALONE: no fill, no border, no shadow. The aspect ratio reserves the
 * tile's space; nothing is drawn behind the product. */
const FRAME: React.CSSProperties = {
  aspectRatio: '4 / 5',
  background: 'transparent',
  border: 'none',
  boxShadow: 'none',
  borderRadius: 0,
  padding: 0,
  position: 'relative',
  overflow: 'hidden',
  boxSizing: 'border-box',
};

export function ProductPhoto({
  brand,
  name,
  href,
  className = 'w-full',
  renderWidth = 260,
  objectFit = 'contain',
  category = null,
}: {
  brand: string;
  name: string;
  /** Fallback tap-through when the resolver found no source page — usually
   * the card's own primary buy link. */
  href?: string | null;
  /** Sizing for the image frame; width caps belong here, never on the file. */
  className?: string;
  /** Roughly how wide this plate renders, in CSS pixels — the fetched file is
   * asked for at twice this, and never below the 800px floor. */
  renderWidth?: number;
  /** `contain` (the default) keeps a whole product in frame; `cover` is for
   * the rare caller that wants the plate filled edge to edge. */
  objectFit?: 'contain' | 'cover';
  /** The piece's category, when the caller knows it — it decides the canvas
   * the ingested cutout is normalized onto. */
  category?: string | null;
}) {
  const subjectKey = `${brand}\u241f${name}`;
  const [candidates, setCandidates] = useState<ProductImageCandidate[]>(() => {
    const settled = peekProductImageCandidate({ brand, name });
    return settled ? [settled] : [];
  });
  // True while the candidate resolver is still out — the difference between
  // "a photograph is coming" (hold the space with a shimmer) and "nothing
  // exists for this product" (a quiet empty frame, forever).
  const [resolving, setResolving] = useState(() => !peekProductImageCandidate({ brand, name }));
  // Viewport gate — see use-on-screen.ts. Resolution is up to three network
  // round-trips per card, and these render in grids.
  const [hostRef, onScreen] = useOnScreen<HTMLElement>();
  const [idx, setIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);
  // Set once a capped URL has failed for this candidate — the next attempt
  // asks for the untouched original before giving the candidate up.
  const [uncapped, setUncapped] = useState(false);
  // The ingested, background-removed cutout — '' until it lands. A product
  // already ingested answers synchronously, so it paints on the first render.
  const [cutout, setCutout] = useState('');

  useEffect(() => {
    let live = true;
    setIdx(0);
    setLoaded(false);
    setUncapped(false);
    const settled = peekProductImageCandidate({ brand, name });
    setCandidates(settled ? [settled] : []);
    setResolving(!settled);
    const settledAsset = settled ? peekProductFlatLayAsset(settled.url) : null;
    setCutout(settledAsset?.ready ? settledAsset.url : '');
    // Gated on visibility (see use-on-screen.ts). A settled answer is free and
    // shows regardless; only the RESOLUTION — up to three network round-trips
    // per card — waits until the card is actually on screen.
    if (settled || !onScreen) {
      setResolving(false);
      return () => {
        live = false;
      };
    }
    void resolveProductImageCandidates({ brand, name })
      .then((resolved) => {
        if (live && resolved.length > 0) {
          setCandidates(resolved);
          setIdx(0);
        }
      })
      .finally(() => {
        if (live) setResolving(false);
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectKey, onScreen]);

  const label = `${brand} ${name}`.trim();
  const candidate = candidates[idx];
  const original = candidate?.url || '';

  // THE INGESTION HANDOFF — once per product, ever. An item already ingested
  // answers from the stored record synchronously and nothing runs at all;
  // anything else is handed to the IDLE queue, so the pipeline never competes
  // with painting this grid. A product that fails every tier keeps its
  // original photograph.
  useEffect(() => {
    if (!original) return;
    let live = true;
    const known = peekProductFlatLayAsset(original);
    if (known) {
      setCutout(known.ready ? known.url : '');
      return;
    }
    ingestProductInBackground(
      { brand, name, productUrl: candidate?.page || href || null, category, preferred: original },
      (asset) => {
        if (live && asset.url !== original) setCutout(asset.url);
      },
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [original, subjectKey, category]);
  // 2× the rendered width, floored at 800 — enough for a retina panel and
  // for zooming in, never a press file.
  const width = productImageWidth(renderWidth);
  // The cutout is our OWN stored PNG at the size we made it: no width cap to
  // rewrite and no retina variant to offer, so both are skipped for it.
  const src = cutout || (original && !uncapped ? cappedImageUrl(original, width) : original);
  // Dropped while falling back to the untouched original, so the browser
  // cannot re-pick the capped URL that just failed.
  const srcSet = !cutout && original && !uncapped ? productImageSrcSet(original, width) : '';
  const target = (candidate?.page || '').trim() || (href || '').trim();
  // No stored cutout yet: the photograph is presented as a framed photograph
  // rather than pretending to be one. The plate falls away when the cutout
  // lands, leaving the product floating on the shelf's own paper.
  const plated = !(cutout || isTransparentCutout(src));
  const frame: React.CSSProperties = plated
    ? { ...FRAME, background: '#FBF8F1', border: '1px solid #D9CFBE', padding: '4px' }
    : FRAME;

  if (!original) {
    // Nothing resolved YET: the same 4:5 frame with a quiet shimmer holding
    // the space — a skeleton, never a blank flash — while the resolver is
    // still out. Once it settles with nothing, the frame goes quiet so a
    // product with no photography anywhere doesn't shimmer forever.
    return (
      <span
        ref={hostRef as React.RefObject<HTMLSpanElement>}
        className={`block ${className}`}
        aria-label={resolving ? `${label} — photograph loading` : `${label} — photograph unavailable`}
        style={FRAME}
        role={resolving ? 'status' : undefined}
      >
        {resolving && (
          <span aria-hidden="true" className="absolute block" style={{ inset: '8%' }}>
            <ShimmerDefs />
            <Skeleton className="absolute inset-0" />
          </span>
        )}
      </span>
    );
  }

  const image = (
    <img
      src={src}
      {...(srcSet ? { srcSet, sizes: `${Math.round(renderWidth)}px` } : null)}
      alt={label}
      loading="lazy"
      decoding="async"
      // Absolute inside the fixed frame: the plate holds its own height from
      // the first paint, so a late-loading photo cannot push the page around.
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit,
        display: 'block',
        opacity: loaded ? 1 : 0,
        transition: 'opacity 260ms ease',
      }}
      onLoad={() => {
        setLoaded(true);
        // The cache always remembers the ORIGINAL URL — the width cap is a
        // delivery detail, re-applied per caller at the size it renders. Only
        // the source photograph is ever confirmed: the cutout is ours, not a
        // candidate the resolver should rank.
        if (!cutout) confirmProductImage({ brand, name }, original);
      }}
      onError={() => {
        // A stored cutout that will not load is not a dead photograph either:
        // fall back to the source image it was cut from.
        if (cutout) {
          setCutout('');
          return;
        }
        // A CDN that ignored (or choked on) the width parameter is not a dead
        // photograph — try the untouched original once before moving on.
        if (!uncapped && src !== original) {
          setUncapped(true);
          return;
        }
        reportBrokenProductImage({ brand, name }, original);
        setLoaded(false);
        setUncapped(false);
        setIdx((i) => i + 1);
      }}
    />
  );

  // The shimmer holds the reserved space until the file has actually painted
  // (the img fades in over it) — the skeleton-first rule: a section that is
  // loading shows a placeholder immediately, never a blank area.
  const ghost = !loaded ? (
    <span aria-hidden="true" className="absolute block" style={{ inset: plated ? '4px' : '8%' }}>
      <ShimmerDefs />
      <Skeleton className="absolute inset-0" />
    </span>
  ) : null;

  if (!target) {
    return (
      <span ref={hostRef as React.RefObject<HTMLSpanElement>} className={`block ${className}`} style={frame}>
        {ghost}
        {image}
      </span>
    );
  }
  return (
    <a
      ref={hostRef as React.RefObject<HTMLAnchorElement>}
      href={target}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={`${label} — open the product page`}
      aria-label={`${label} — open the product page`}
      className={`block ${className}`}
      style={frame}
    >
      {ghost}
      {image}
    </a>
  );
}
