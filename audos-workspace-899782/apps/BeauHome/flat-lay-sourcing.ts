/**
 * THE SOURCING RULE — ONE place where "which photograph of this product do we
 * ingest, and how" is decided, for EVERY grid that shows a sourced product:
 * The Rail's picks, World of Menswear's retailer cards, and The Fitting's
 * shelves (In your Reserve · Beau's picks) alongside What you own.
 *
 * It existed as duplicated logic before: the Fitting shelf handed the whole
 * ranked candidate list to the pipeline with the person-detection preference
 * switched on, while the shared product plate simply painted candidate[0] on
 * whatever background it arrived with. Same product, two different answers
 * depending on which grid you were looking at. This module is that rule,
 * once:
 *
 *   1. RESOLVE every candidate for the product (product-images.ts
 *      `resolveProductGalleryCandidates`): the ranked search candidates —
 *      the maker's own store first, pack-shot retailers next, resale last,
 *      on-body and editorial framings already dropped — PLUS the FULL
 *      GALLERY of the product's real page, crawled server-side once, so an
 *      isolated pack shot sitting third in the brand's own gallery is never
 *      missed in favour of the first image a search happened to return.
 *      Cached for 30 days, so this is a lookup and not a search.
 *   2. SELECT THE SOURCE (image-pipeline `selectSourceImage`) — each candidate
 *      is classified by a vision model for two things, a person in the frame
 *      and a plain neutral ground, and the one that satisfies both is chosen
 *      BEFORE any background is removed, tiebroken on resolution and then
 *      centring. It walks the RANKED list, never the photograph the caller
 *      happens to have on screen (see `sourcesFor` below).
 *   3. INGEST through the three-tier pipeline (photo-enhance
 *      flatLayAssetForShelf: the isolated product shot, then the
 *      garment segmented off the model, then the on-body cut as a thumbnail
 *      of last resort), verified, normalized onto its category's canvas and
 *      STORED as a transparent PNG on the platform CDN with a row in
 *      `image_cutouts` pointing at it. Queued at low concurrency, because a
 *      grid can hold dozens of products.
 *
 * NOTHING HERE RUNS AT PAGE-RENDER OR PAGE-LOAD TIME. An already-ingested
 * product answers from `peekProductFlatLayAsset` synchronously — a stored CDN
 * URL, no different in cost from any other image on the page — and an item
 * nobody has ingested yet is handed to `ingestProductInBackground`, which
 * waits for the browser to be idle before it starts. A surface never blocks
 * on this, and the photograph it already has stays on screen throughout.
 *
 * TWO FLAGS COME BACK, and they answer different questions. `ready` means the
 * asset is a cleaned photograph a grid can paint; an item that fails every
 * tier comes back false and the caller keeps its ORIGINAL photograph on
 * screen. `flatLayReady` means it is safe in an OVERLAPPING FLAT-LAY, and is
 * false when the only photography that exists for this product has a model in
 * it and the garment could not be lifted off them. A board holds those items
 * OUT of the composition and names them instead: no CSS can turn a photograph
 * of a foot in a loafer into a photograph of a loafer.
 */
import { chooseProductOnlyShot, flatLayAssetForShelf, peekFlatLayAsset, type FlatLayAsset } from './photo-enhance';
import { whenIdle } from './image-pipeline';
import { resolveProductGalleryCandidates, type ProductImageSubject } from './product-images';

export interface ProductFlatLaySubject extends ProductImageSubject {
  /** Drives the normalization canvas — all shoes land on one proportion, all
   * coats on another. */
  category?: string | null;
  /** The photograph the caller is painting right now, when it has one (a
   * stored garment image, or the candidate already on screen). It leads the
   * candidate list so the ingest starts from what the user can already see. */
  preferred?: string | null;
}

/**
 * The two lists one product needs, which are deliberately NOT the same list.
 *
 *  · `candidates` is IDENTITY — the caller's own photograph first, because
 *    that is the url every grid peeks the settled asset by and the key the
 *    cut is stored under. Reordering it would make an already-ingested
 *    product miss its cache and flash.
 *  · `preference` is CHOICE — the order the product-only scan walks. It
 *    leads with the RANKED candidates (product-images ranks the maker's own
 *    pack shot first and anything that reads on-body last), so the scan
 *    spends its budget on the framings most likely to be isolated instead of
 *    on the very photograph we are trying to improve on. The caller's own
 *    image is appended last, and only when the ranking does not already
 *    contain it.
 */
async function sourcesFor(subject: ProductFlatLaySubject): Promise<{ candidates: string[]; preference: string[] }> {
  const preferred = (subject.preferred || '').trim();
  // STEP 1's "pull ALL images" rule: the ranked search candidates PLUS the
  // full gallery of the product's real page (the maker's own site or its
  // primary retailer listing), crawled once at ingestion time — so the
  // classification below has every framing that exists to choose between,
  // not just the first image a search happened to return.
  const ranked = (
    await resolveProductGalleryCandidates({
      name: subject.name,
      brand: subject.brand,
      productUrl: subject.productUrl,
    }).catch(() => [])
  )
    .map((candidate) => candidate.url)
    .filter(Boolean);
  const others = ranked.filter((url) => url !== preferred);
  return {
    candidates: preferred ? [preferred, ...others] : ranked,
    preference: !preferred || ranked.includes(preferred) ? ranked : [...ranked, preferred],
  };
}

/**
 * THE PREFERENCE, on its own — given a caller's OWN ranked framings for one
 * item, the first with nobody in it, else the best-ranked one it was given.
 *
 * The wardrobe's add-by-search flow hunts its own candidates (it searches for
 * flat-lay and packshot photography specifically) and then stores ONE
 * photograph rather than a flat-lay cutout, so it cannot use the pipeline
 * above — but the CHOICE between an isolated product shot and an on-body one
 * is the same decision, made by the same classification pass, cached the same
 * way. That is the rule that must not be re-implemented per surface.
 *
 * '' only when the caller passed nothing usable.
 */
export async function preferredProductSourceUrl(candidates: Array<string | null | undefined>): Promise<string> {
  const list = candidates.map((url) => (url || '').trim()).filter(Boolean);
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  const choice = await chooseProductOnlyShot(list).catch(() => ({ url: '', conclusive: false }));
  return choice.url || list[0];
}

/**
 * The settled flat-lay asset for a photograph, synchronously — lets a grid
 * paint an already-ingested product without a flash and without re-queueing
 * work. null when nothing has been ingested for it yet.
 */
export function peekProductFlatLayAsset(imageUrl: string | null | undefined): FlatLayAsset | null {
  return peekFlatLayAsset((imageUrl || '').trim());
}

/**
 * Ingest a sourced product's imagery into a flat-lay-ready asset, applying
 * the shared source preference. Every grid calls THIS — never the pipeline
 * directly — so the preference cannot drift grid by grid.
 */
export async function flatLayAssetForProduct(subject: ProductFlatLaySubject): Promise<FlatLayAsset> {
  const { candidates, preference } = await sourcesFor(subject);
  if (candidates.length === 0) {
    return {
      url: (subject.preferred || '').trim(),
      tier: 0,
      ready: false,
      flatLayReady: false,
      confidence: 'none',
      sourceQuality: 'unknown',
      cutoutQuality: 'failed',
      needsReview: false,
      reviewReasons: [],
      category: subject.category ?? null,
      source: (subject.preferred || '').trim(),
    };
  }
  return flatLayAssetForShelf({
    candidates,
    sourcePreference: preference,
    category: subject.category ?? null,
    name: subject.name,
    // The whole point of passing the list: prefer the shot with nobody in it.
    scanForPeople: true,
  });
}

/**
 * INGEST A SOURCED PRODUCT, OFF THE RENDER PATH — the call every grid makes
 * when `peekProductFlatLayAsset` came back empty.
 *
 * It is deliberately fire-and-forget and deliberately idle-scheduled: the
 * pipeline is a vision call, a background removal and an upload, and none of
 * that may compete with painting the page the customer is looking at. The
 * grid keeps showing the photograph it already resolved; `onReady` fires later
 * with the stored transparent PNG, and only when the cut is genuinely usable.
 *
 * Already-ingested products never reach the queue — they answered
 * synchronously before this was called.
 */
export function ingestProductInBackground(
  subject: ProductFlatLaySubject,
  onReady?: (asset: FlatLayAsset) => void,
): void {
  whenIdle(() => {
    void flatLayAssetForProduct(subject)
      .then((asset) => {
        if (asset.ready && onReady) onReady(asset);
      })
      .catch(() => undefined);
  });
}
