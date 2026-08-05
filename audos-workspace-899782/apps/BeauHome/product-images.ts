/**
 * REAL PRODUCT IMAGES (Product Photos overhaul) — the shared resolver behind
 * The Rail's Tier 2 product cards, World of Menswear's "Where to find one"
 * retailer cards and The Fitting's Reserve / Beau's-picks imagery.
 *
 * A recommendation names a SPECIFIC product ("Baracuta G9 Harrington"), so
 * the image on its card must be THAT product, photographed by its maker or a
 * quality retailer — never a generic stock photograph and NEVER an
 * illustration (illustrations are Tier 1 navigation only). When nothing real
 * can be resolved the caller shows the design system's neutral fallback: a
 * walnut-bordered paper rectangle.
 *
 * PACK SHOTS ONLY — NO PEOPLE. A Rail card wants the photograph a shop puts
 * on its listing: the garment alone, on a clean ground. So the resolver
 *  · searches for the piece as a PRODUCT, not as a name;
 *  · ranks the maker's own store first, then the pack-shot retailers (MR
 *    PORTER, END., MATCHES, Selfridges and their like), then anything
 *    unrecognised, and resale marketplaces LAST — their photography is the
 *    seller's own and is routinely a worn shot;
 *  · drops any candidate whose title, source page or file path reads
 *    lifestyle, editorial, campaign, lookbook, street style or on-model,
 *    plus the social, editorial and stock-agency hosts outright.
 * Whatever survives may still arrive on a background; the FITTING board runs
 * its pieces through background removal (photo-enhance cutoutForBoard) so the
 * flat-lay gets true transparent cutouts rather than white rectangles.
 *
 * DELIVERED SIZE + CLICK-THROUGH: every candidate carries BOTH the image URL
 * and the page it came from.
 *  · The image URL is the ORIGINAL file the source published — Google
 *    Images' low-res `thumbnail` field is only ever a last resort. Callers
 *    then ask for it at no more than twice the size they render it
 *    (`cappedImageUrl`), which rewrites the width parameter on CDNs that
 *    document one and leaves every other URL untouched. A 200px card no
 *    longer downloads a 2000px press file.
 *  · The page URL makes each image a direct tap-through to the retailer's
 *    product page — and `resolveProductPage` reuses the same cached lookup
 *    to give a card its PRIMARY link: the specific product page, never a
 *    homepage or a search results page.
 *
 * Resolution chain — first usable hit wins:
 *   1. the product page's own og:image, when the piece carries a REAL
 *      product URL (via the beau-og-image hook, cached in og-image.tsx) —
 *      search/marketplace URLs are skipped, their og:image is a logo;
 *   2. Google Images (the platform /api/search endpoint, searchType
 *      "images") for "<brand> <name> product", ranked and filtered as above;
 *   3. one web search for the piece's product page on a trusted retail
 *      domain, resolved through the same og:image hook.
 *
 * CACHING (the once-found-never-refetched rule): memory + localStorage per
 * product for 30 days, in-flight lookups deduplicated. Misses live in
 * memory only for five minutes — a rate-limit blip must never blank a card
 * for a month. Components report back: a URL whose <img> actually PAINTED
 * is pinned first (confirmProductImage), a hotlink-blocked or dead one is
 * dropped (reportBrokenProductImage) so the next visit leads with a URL
 * that works.
 */
import { imageHash } from './image-pipeline';
import { fetchProductImage } from './og-image';

export interface ProductImageSubject {
  name: string;
  brand?: string | null;
  /** A real product page when the source card has one — its og:image leads. */
  productUrl?: string | null;
}

/** One resolved photograph and the page it belongs to. */
export interface ProductImageCandidate {
  /** The original, full-resolution image file — rendered as-is, never
   * downscaled or recompressed by the app. */
  url: string;
  /** The source product page — where tapping the image navigates. '' when
   * the search returned an image with no identifiable source page. */
  page: string;
}

// ---------------------------------------------------------------------------
// Cache — memory + localStorage, keyed by "<brand> <name>".
// ---------------------------------------------------------------------------

// v2 stores {image, page} pairs; the v1 image-only rows are simply ignored
// and re-resolved once, which also refreshes them to full-resolution URLs.
const CACHE_PREFIX = 'ethaion_product_img_v2_';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MISS_RETRY_MS = 5 * 60 * 1000;
const MAX_CANDIDATES = 6;

const memory = new Map<string, ProductImageCandidate[]>();
const inflight = new Map<string, Promise<ProductImageCandidate[]>>();
const missAt = new Map<string, number>();

export function productImageKey(subject: ProductImageSubject): string {
  return [subject.brand || '', subject.name || '']
    .join(' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function isHttp(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

function readCache(key: string): ProductImageCandidate[] | null {
  const inMemory = memory.get(key);
  if (inMemory && inMemory.length > 0) return inMemory;
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { items: Array<{ u: string; p: string }>; t: number };
    if (!Array.isArray(parsed?.items) || typeof parsed?.t !== 'number') return null;
    if (Date.now() - parsed.t > CACHE_TTL_MS) return null;
    const items = parsed.items
      .filter((row) => row && isHttp(row.u))
      .map((row) => ({ url: row.u.trim(), page: isHttp(row.p) ? row.p.trim() : '' }));
    if (items.length === 0) return null;
    memory.set(key, items);
    return items;
  } catch {
    return null;
  }
}

function writeCache(key: string, items: ProductImageCandidate[]): void {
  const clean = items.filter((item) => isHttp(item.url)).slice(0, MAX_CANDIDATES);
  if (clean.length === 0) {
    // A miss: remembered briefly in memory (a busy grid must not hammer the
    // endpoint), never persisted — the next session retries.
    missAt.set(key, Date.now());
    memory.delete(key);
    try {
      localStorage.removeItem(CACHE_PREFIX + key);
    } catch { /* storage unavailable — nothing stale to clear */ }
    return;
  }
  missAt.delete(key);
  memory.set(key, clean);
  try {
    localStorage.setItem(
      CACHE_PREFIX + key,
      JSON.stringify({ items: clean.map((item) => ({ u: item.url, p: item.page })), t: Date.now() }),
    );
  } catch { /* storage unavailable — the memory cache still holds it */ }
}

/** Synchronous peek — lets a card paint its settled photo on first render. */
export function peekProductImage(subject: ProductImageSubject): string {
  return readCache(productImageKey(subject))?.[0]?.url || '';
}

/** Synchronous peek, image AND its source page. */
export function peekProductImageCandidate(subject: ProductImageSubject): ProductImageCandidate | null {
  return readCache(productImageKey(subject))?.[0] || null;
}

/** The <img> painted — pin this URL first so every revisit leads with it. */
export function confirmProductImage(subject: ProductImageSubject, url: string): void {
  const key = productImageKey(subject);
  const clean = (url || '').trim();
  if (!key || !clean) return;
  const cached = readCache(key) || [];
  if (cached[0]?.url === clean) return;
  const painted = cached.find((item) => item.url === clean) || { url: clean, page: '' };
  writeCache(key, [painted, ...cached.filter((item) => item.url !== clean)]);
}

/** The <img> failed (hotlink-blocked, stale CDN) — drop it from the cache so
 * the next visit leads with a candidate that loads. */
export function reportBrokenProductImage(subject: ProductImageSubject, url: string): void {
  const key = productImageKey(subject);
  const clean = (url || '').trim();
  if (!key || !clean) return;
  const cached = readCache(key);
  if (!cached) return;
  const rest = cached.filter((item) => item.url !== clean);
  if (rest.length === cached.length) return;
  if (rest.length === 0) {
    memory.delete(key);
    try {
      localStorage.removeItem(CACHE_PREFIX + key);
    } catch { /* storage unavailable */ }
    return;
  }
  writeCache(key, rest);
}

// ---------------------------------------------------------------------------
// Source ranking — the brand's own site first, quality retailers second.
// ---------------------------------------------------------------------------

/** THE PACK-SHOT RETAILERS — shops that photograph a garment on its own, on
 * white, as their default listing image: the brand's own store first, then
 * these. Mr Porter, END., Matches and Selfridges are the named house
 * standard; the rest of the list is the same kind of shop. */
const QUALITY_RETAILERS = [
  'mrporter.com', 'endclothing.com', 'matchesfashion.com', 'matches.com',
  'selfridges.com', 'harrods.com', 'liberty.co.uk',
  'farfetch.com', 'ssense.com', 'net-a-porter.com', 'yoox.com',
  'huckberry.com', 'trunkclothiers.com', 'nordstrom.com', 'goodhoodstore.com',
  'therealreal.com', 'brownsfashion.com', 'oipolloi.com', 'clutchcafe.com',
];

/** Resale marketplaces — real product pages, but the photography is the
 * seller's: often worn, often a phone shot on a bedroom floor. Usable, never
 * preferred over a retailer's pack shot. */
const MARKETPLACES = [
  'grailed.com', 'vestiairecollective.com', 'ebay.com', 'ebay.co.uk',
  'vinted.com', 'vinted.co.uk', 'depop.com', 'etsy.com',
];

/** Hosts whose images are never clean product shots — skipped outright.
 * Social and forum hosts, editorial/style titles (their imagery is a model in
 * a street), and the stock agencies (watermarked, and never THIS product). */
const EXCLUDED_HOSTS = [
  'pinterest.', 'instagram.', 'facebook.', 'tiktok.', 'youtube.',
  'reddit.', 'twitter.', 'x.com', 'wikipedia.', 'wikimedia.',
  'tumblr.', 'blogspot.', 'lookbook.', 'lyst.',
  'gq.com', 'esquire.com', 'vogue.', 'gettyimages.', 'shutterstock.',
  'alamy.', 'istockphoto.', 'dreamstime.', '123rf.', 'depositphotos.',
  'hypebeast.com', 'highsnobiety.com', 'permanentstyle.com', 'styleforum.net',
  'thefashionisto.com', 'whowhatwear.', 'menshealth.com',
];

/** Wording that gives away a LIFESTYLE or EDITORIAL frame — a man wearing
 * the piece, a street shot, a campaign image. The Rail wants the pack shot,
 * so a candidate whose title or URL reads like this is dropped even when the
 * host is respectable. */
const LIFESTYLE_WORDS =
  /\b(model|models|worn|wearing|on\s?body|outfit|outfits|ootd|street\s?style|lookbook|editorial|campaign|how\s?to\s?wear|styling|styled|fit\s?pic|runway|catwalk|lifestyle)\b/i;

// Deliberately narrow: only patterns a retailer uses to mark a non-pack shot.
// Bare words like “street” or “worn” are left to the title check, where they
// are word-bounded — in a URL they match innocent things (goodhoodstore's
// paths, “pre-worn”) and would throw away good photographs.
const LIFESTYLE_PATH = /(lifestyle|editorial|campaign|lookbook|street-?style|on-?model|_model|-model-)/i;

/** The POSITIVE half of the same judgement. The rules above only throw a
 * candidate OUT; between two survivors from the same kind of shop, these are
 * the words a retailer uses to mark the ISOLATED shot — the garment alone on
 * a clean ground, which is the only kind of photograph a flat-lay can use. */
const PACKSHOT_WORDS =
  /\b(pack\s?shot|packshot|product\s?shot|still\s?life|flat\s?lay|flatlay|laydown|cut\s?out|cutout|on\s?white|white\s?background)\b/i;

const PACKSHOT_PATH = /(pack-?shot|product-?shot|still-?life|flat-?lay|laydown|cut-?out|on-?white|_front|-front[_.-])/i;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\d?\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/** "Private White V.C." → "privatewhitevc" — for host matching. */
function brandToken(brand: string | null | undefined): string {
  return (brand || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isExcludedHost(host: string): boolean {
  return EXCLUDED_HOSTS.some((d) => host === d || host.includes(d));
}

function hostIn(host: string, list: string[]): boolean {
  return list.some((d) => host === d || host.endsWith(`.${d}`) || host.startsWith(`${d.split('.')[0]}.`));
}

/** Lower is better: the maker's own store, then a pack-shot retailer, then
 * anything unrecognised, then a resale marketplace's seller photography. */
function sourceScore(host: string, brand: string): number {
  if (!host) return 3;
  if (brand.length >= 4 && host.replace(/[^a-z0-9]/g, '').includes(brand)) return 0;
  if (hostIn(host, QUALITY_RETAILERS)) return 1;
  if (hostIn(host, MARKETPLACES)) return 4;
  return 2;
}

/** A shot of the piece BEING WORN is not what a Rail card wants — dropped on
 * the wording of its title, its source page and its own file path. */
function looksLikeLifestyle(title: string, page: string, img: string): boolean {
  if (title && LIFESTYLE_WORDS.test(title)) return true;
  return LIFESTYLE_PATH.test(page) || LIFESTYLE_PATH.test(img);
}

/** The candidate advertises itself as the isolated product shot. */
function looksLikePackShot(title: string, page: string, img: string): boolean {
  if (title && PACKSHOT_WORDS.test(title)) return true;
  return PACKSHOT_PATH.test(page) || PACKSHOT_PATH.test(img);
}

/** A search/marketplace-search URL — its og:image is a logo, never the
 * product; skipped as an og source. */
function isSearchUrl(url: string): boolean {
  return /google\.[a-z.]+\/|\/search\b|[?&](q|query|_nkw)=/i.test(url);
}

// ---------------------------------------------------------------------------
// The platform /api/search endpoint (SerpAPI, key server-side).
// ---------------------------------------------------------------------------

interface ImageCandidate {
  img: string;
  page: string;
  /** The result's own title — read only to spot lifestyle photography. */
  title: string;
  /** true when the only URL on offer was a search-engine THUMBNAIL — a
   * low-resolution proxy. Kept as a last resort, never ranked above an
   * original. */
  thumbnailOnly: boolean;
}

function firstHttp(...values: unknown[]): string {
  for (const v of values) {
    if (isHttp(v)) return v.trim();
  }
  return '';
}

function looksLikeImageUrl(url: string): boolean {
  return /\.(jpe?g|png|webp|gif|avif)([?#]|$)/i.test(url);
}

/** Defensive field mapping — the images searchType returns SerpAPI image
 * results; the exact field names are read permissively so a passthrough
 * shape change never blanks every card. ORIGINALS ONLY on the first pass:
 * `thumbnail` is a search-engine proxy at a fraction of the real resolution,
 * so it is separated out and used only when no original exists. */
function candidateFrom(r: Record<string, unknown>): ImageCandidate {
  const original = firstHttp(
    (r as any).original,
    (r as any).originalImage,
    (r as any).original_image,
    (r as any).fullImage,
    (r as any).full_image,
    (r as any).imageUrl,
    (r as any).image_url,
    (r as any).image,
  ) || (isHttp((r as any).link) && looksLikeImageUrl((r as any).link) ? ((r as any).link as string).trim() : '');
  const thumbnail = firstHttp((r as any).thumbnail, (r as any).thumbnailUrl, (r as any).thumbnail_url);
  const page = firstHttp(
    (r as any).link,
    (r as any).source,
    (r as any).sourceUrl,
    (r as any).source_url,
    (r as any).redirect_link,
    (r as any).redirectLink,
  );
  const title = [(r as any).title, (r as any).snippet, (r as any).source]
    .filter((v) => typeof v === 'string')
    .join(' ');
  return {
    img: original || thumbnail,
    page: looksLikeImageUrl(page) ? '' : page,
    title,
    thumbnailOnly: !original && !!thumbnail,
  };
}

// ---------------------------------------------------------------------------
// Delivered size — a 200px card must never download a 2400px press file.
// ---------------------------------------------------------------------------

/**
 * Query params retailer CDNs use for width AND for image FORMAT, by host
 * family. Both halves are the same decision — "ask this CDN for the file we
 * actually want" — so they live in one table rather than two.
 *
 * THE FORMAT HALF exists because a capped JPEG or PNG is still the wrong
 * FILE: the same pixels as WebP are roughly a third smaller, and on the CDNs
 * that support content negotiation (`auto=format`) a browser that takes AVIF
 * is served AVIF instead. `format` is omitted for any host whose parameter is
 * not documented — the rule throughout this module is that no image may ever
 * break in the name of being smaller.
 */
const WIDTH_PARAM_HOSTS: Array<{ match: RegExp; param: string; format?: { param: string; value: string } }> = [
  { match: /(^|\.)shopify\.com$|myshopify\.com$/, param: 'width', format: { param: 'format', value: 'webp' } },
  // imgix and Sanity both negotiate on the Accept header, so `auto=format`
  // yields AVIF where the browser takes it and WebP everywhere else.
  { match: /imgix\.net$/, param: 'w', format: { param: 'auto', value: 'format' } },
  { match: /ctfassets\.net$/, param: 'w', format: { param: 'fm', value: 'webp' } },
  { match: /cdn\.sanity\.io$/, param: 'w', format: { param: 'auto', value: 'format' } },
  { match: /scene7\.com$/, param: 'wid', format: { param: 'fmt', value: 'webp' } },
  // END. and Selfridges resize on `w` but publish no format parameter — the
  // width cap alone for them.
  { match: /endclothing\.com$/, param: 'w' },
  { match: /selfridges\.com$/, param: 'w' },
];

/** Any param that already names a format — a URL that asked for one is left
 * exactly as the retailer wrote it. */
const FORMAT_PARAMS = ['format', 'fm', 'fmt', 'auto', 'f'];

/** Params that mean the URL is signed — rewriting one breaks the signature. */
const SIGNED_PARAMS = ['sig', 'signature', 'x-amz-signature', 'token', 'hmac'];

/**
 * THE RESOLUTION FLOOR. The width cap above exists to stop a small card
 * downloading a press original — but capping at twice a ~150px thumbnail
 * asked retailers for ~300px files, and those went visibly soft the moment a
 * piece was opened, zoomed, or shown on a retina panel. Web product
 * photography wants 800px minimum, 1200 for retina, so no caller may now ask
 * for less than this however small it renders. Nothing is UPSCALED: this only
 * ever changes what is REQUESTED from a CDN that serves size variants, and a
 * source that has no bigger file simply returns what it has.
 */
export const MIN_PRODUCT_IMAGE_WIDTH = 800;

/** The delivered width for a plate rendered `renderWidth` CSS px wide: twice
 * the rendered size for retina, never below the floor above. */
export function productImageWidth(renderWidth: number): number {
  const wanted = Number.isFinite(renderWidth) && renderWidth > 0 ? Math.round(renderWidth * 2) : 0;
  return Math.max(MIN_PRODUCT_IMAGE_WIDTH, wanted);
}

/**
 * A `srcSet` for the plate — the 1x width and a 1.5x variant — so a retina
 * panel picks the sharper file and everything else does not pay for it.
 * Returns '' when the CDN has no width parameter to rewrite (both variants
 * come back as the same URL), which is the caller's cue to omit the attribute
 * rather than emit a meaningless one.
 */
export function productImageSrcSet(url: string, width: number): string {
  const base = cappedImageUrl(url, width);
  const retina = cappedImageUrl(url, Math.round(width * 1.5));
  if (!base || base === retina) return '';
  return `${base} ${width}w, ${retina} ${Math.round(width * 1.5)}w`;
}

/**
 * The same photograph, asked for at no more than `maxWidth` pixels wide.
 *
 * This replaces the old always-native rule: a Rail card renders around 200px,
 * so fetching the retailer's 2000px original was several hundred kilobytes of
 * detail nobody sees. Only URLs whose CDN documents a width parameter — or
 * which already carry one, in which case it is simply capped — are rewritten;
 * everything else is returned untouched, so no image can break in the name of
 * being smaller.
 *
 * On the CDNs that also document a FORMAT parameter the same rewrite asks for
 * WebP (or negotiates AVIF), which is the other half of "right-sized files":
 * capping a 2400px JPEG to 800px still delivers a JPEG. A URL that already
 * names a format is left as the retailer wrote it.
 */
export function cappedImageUrl(url: string, maxWidth: number): string {
  const clean = (url || '').trim();
  if (!isHttp(clean) || !Number.isFinite(maxWidth) || maxWidth <= 0) return clean;
  const width = Math.round(maxWidth);
  try {
    const parsed = new URL(clean);
    const keys = [...parsed.searchParams.keys()].map((k) => k.toLowerCase());
    if (SIGNED_PARAMS.some((p) => keys.includes(p))) return clean;
    /** Ask for the modern format, unless the URL already named one. */
    const applyFormat = (format?: { param: string; value: string }): boolean => {
      if (!format || FORMAT_PARAMS.some((p) => keys.includes(p))) return false;
      parsed.searchParams.set(format.param, format.value);
      return true;
    };
    const capParam = (param: string, format?: { param: string; value: string }): string => {
      const current = Number(parsed.searchParams.get(param));
      // Already no wider than we want: the width is left alone, but the
      // format is still worth asking for.
      const capped = !(Number.isFinite(current) && current > 0 && current <= width);
      if (capped) parsed.searchParams.set(param, String(width));
      const reformatted = applyFormat(format);
      // Nothing to rewrite: hand back the retailer's own string rather than a
      // re-serialized equivalent, so a CDN that is fussy about its query
      // encoding never sees a URL we touched for no reason.
      return capped || reformatted ? parsed.toString() : clean;
    };
    const host = parsed.hostname.replace(/^www\d?\./, '').toLowerCase();
    const known = WIDTH_PARAM_HOSTS.find((entry) => entry.match.test(host));
    if (known) return capParam(known.param, known.format);
    // An unrecognised host that nonetheless carries a width parameter: cap it,
    // but never guess at a format parameter we have not verified.
    for (const param of ['width', 'w', 'wid', 'sw', 'maxwidth']) {
      if (keys.includes(param)) return capParam(param);
    }
    return clean;
  } catch {
    return clean;
  }
}

async function searchApi(query: string, searchType: 'images' | 'web', num: number): Promise<Array<Record<string, unknown>>> {
  const res = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, searchType, num }),
  });
  if (!res.ok) throw new Error(`search failed: ${res.status}`);
  const data = await res.json();
  if (!data?.success) throw new Error(String(data?.error || 'search unsuccessful'));
  return Array.isArray(data.results) ? data.results : [];
}

/** Google Images for the product — candidates ranked full-resolution first,
 * then brand site → quality retailer → the rest; social/editorial hosts
 * dropped. Each keeps the page it came from so the card can link straight
 * through to it. */
async function imageSearchCandidates(subject: ProductImageSubject): Promise<ProductImageCandidate[]> {
  const subjectQuery = [subject.brand || '', subject.name].join(' ').trim();
  if (!subjectQuery) return [];
  // “product” pushes Google hard towards e-commerce listing images — the
  // garment alone on white — and away from the editorial and street
  // photography that dominates a bare brand + model-name query.
  const results = await searchApi(`${subjectQuery} product`, 'images', 14);
  const brand = brandToken(subject.brand);
  const seen = new Set<string>();
  const scored: Array<{ candidate: ProductImageCandidate; score: number }> = [];
  for (const r of results) {
    const { img, page, title, thumbnailOnly } = candidateFrom(r);
    if (!img || seen.has(img)) continue;
    const host = hostOf(page) || hostOf(img);
    if (isExcludedHost(host)) continue;
    // No people. A shot of the piece on a model is not a Rail card image,
    // however good the retailer.
    if (looksLikeLifestyle(title, page, img)) continue;
    seen.add(img);
    // Resolution outranks source, and source outranks framing: a low-res
    // thumbnail from the brand's own site still reads worse on the card than
    // an original from a retailer, and a pack shot only wins a tie WITHIN a
    // tier — which is what puts the isolated framing at the head of the list
    // the product-only preference then walks.
    const score = (thumbnailOnly ? 20 : 0) + sourceScore(host, brand) * 2 + (looksLikePackShot(title, page, img) ? 0 : 1);
    scored.push({ candidate: { url: img, page }, score });
  }
  return scored.sort((a, b) => a.score - b.score).map((c) => c.candidate);
}

/** Last resort: find the piece's product page on a trusted retail domain by
 * web search, then read that page's og:image. One search, one page. */
async function ogImageViaWebSearch(subject: ProductImageSubject): Promise<ProductImageCandidate | null> {
  const query = [subject.brand || '', subject.name, 'buy'].join(' ').trim();
  const results = await searchApi(query, 'web', 8);
  const brand = brandToken(subject.brand);
  for (const r of results) {
    const link = isHttp((r as any).link) ? ((r as any).link as string).trim() : '';
    if (!link || isSearchUrl(link)) continue;
    const host = hostOf(link);
    if (!host || isExcludedHost(host)) continue;
    if (sourceScore(host, brand) > 1) continue; // brand site or quality retailer only
    const og = await fetchProductImage(link).catch(() => '');
    if (og) return { url: og, page: link };
    break; // one page read is the budget — never a crawl
  }
  return null;
}

// ---------------------------------------------------------------------------
// THE PRODUCT PAGE GALLERY — Step 1's "pull ALL images" rule.
//
// A search returns ONE photograph per result, and the og:image read returns
// ONE photograph per page — so a product whose maker publishes a clean
// isolated pack shot THIRD in its own gallery never surfaced it, and the
// pipeline cut a worse framing than the brand itself had on offer (the known
// Bennett Winch failure: the clean isolated photo existed on the brand's own
// site and was missed because only the first search-result image was
// fetched). So at INGESTION time — never at render time — the product's
// real page (the maker's own site or its primary retailer listing) is
// crawled ONCE, server-side, and EVERY image in its gallery is collected:
// the og/twitter meta images, the JSON-LD Product images, and the gallery
// <img> tags with their srcset and lazy-load variants. Only with that full
// list in hand does Step 1's classification have anything meaningful to
// choose between.
//
// The crawl runs through the platform's server-side scraper (the same
// apify/cheerio-scraper the discovery log's URL intake uses — a browser
// cannot read cross-origin retail pages), is cached hard for 30 days per
// page, and fails soft: a missing scraper token or a blocked page simply
// means the search-ranked candidates carry on alone, exactly as before.
// ---------------------------------------------------------------------------

const GALLERY_CACHE_PREFIX = 'ethaion_page_gallery_v1_';
const MAX_GALLERY_IMAGES = 12;

const galleryMemory = new Map<string, string[]>();
const galleryInflight = new Map<string, Promise<string[]>>();
const galleryMissAt = new Map<string, number>();

/** Extracts every gallery image from one product page, in page order:
 * og/twitter meta images first, then JSON-LD Product images, then the <img>
 * tags (src, the usual lazy-load attributes, and the largest srcset entry). */
const GALLERY_PAGE_FUNCTION = `async function pageFunction(context) {
  const { $, request } = context;
  const found = [];
  const push = (raw) => {
    const value = String(raw || '').trim();
    if (!value || value.indexOf('data:') === 0) return;
    let absolute = value;
    try { absolute = new URL(value, request.url).toString(); } catch (e) { return; }
    if (!/^https?:\\/\\//i.test(absolute)) return;
    if (found.indexOf(absolute) === -1) found.push(absolute);
  };
  $('meta[property="og:image"], meta[property="og:image:secure_url"], meta[name="twitter:image"], meta[name="twitter:image:src"]').each((i, el) => push($(el).attr('content')));
  $('script[type="application/ld+json"]').each((i, el) => {
    try {
      const parsed = JSON.parse($(el).contents().text());
      const nodes = Array.isArray(parsed) ? parsed : (parsed && parsed['@graph'] ? parsed['@graph'] : [parsed]);
      for (const node of nodes) {
        if (!node || !node.image) continue;
        const list = Array.isArray(node.image) ? node.image : [node.image];
        for (const entry of list) push(typeof entry === 'string' ? entry : entry && (entry.url || entry.contentUrl));
      }
    } catch (e) { /* not JSON-LD we can read */ }
  });
  $('img').each((i, el) => {
    const node = $(el);
    push(node.attr('src'));
    push(node.attr('data-src'));
    push(node.attr('data-lazy-src'));
    push(node.attr('data-zoom-image'));
    push(node.attr('data-large_image'));
    const srcset = node.attr('srcset') || node.attr('data-srcset') || '';
    const parts = srcset.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) push(parts[parts.length - 1].split(/\\s+/)[0]);
  });
  return { url: request.url, images: found.slice(0, 40) };
}`;

/** Junk that lives on every retail page and is never the product — logos,
 * icons, payment badges, swatches — plus anything whose path reads
 * lifestyle/editorial (the same judgement the search candidates get). */
function isLikelyProductImage(url: string): boolean {
  if (!isHttp(url)) return false;
  if (/\.(svg|gif|ico)([?#]|$)/i.test(url)) return false;
  if (/(logo|icon|sprite|favicon|badge|payment|paypal|klarna|visa|mastercard|amex|placeholder|swatch|avatar|flag|trustpilot|newsletter)/i.test(url)) return false;
  if (LIFESTYLE_PATH.test(url)) return false;
  return true;
}

/**
 * Every image in one product page's gallery — crawled ONCE, cached for 30
 * days, returned in page order. [] when the page cannot be read; a blocked
 * or empty page is remembered briefly in memory (so a busy grid does not
 * hammer the scraper) and retried next session, never persisted as a fact.
 */
async function crawlPageGallery(pageUrl: string): Promise<string[]> {
  const clean = (pageUrl || '').trim();
  if (!isHttp(clean) || isSearchUrl(clean)) return [];
  const key = imageHash(clean);
  const inMemory = galleryMemory.get(key);
  if (inMemory) return inMemory;
  try {
    const raw = localStorage.getItem(GALLERY_CACHE_PREFIX + key);
    if (raw) {
      const parsed = JSON.parse(raw) as { urls?: string[]; t?: number };
      if (Array.isArray(parsed?.urls) && parsed.urls.length > 0 && Date.now() - (parsed.t || 0) <= CACHE_TTL_MS) {
        const urls = parsed.urls.filter((u): u is string => typeof u === 'string');
        galleryMemory.set(key, urls);
        return urls;
      }
    }
  } catch { /* unreadable cache — crawl again */ }
  const missed = galleryMissAt.get(key);
  if (missed && Date.now() - missed < MISS_RETRY_MS) return [];
  const running = galleryInflight.get(key);
  if (running) return running;
  const job = (async () => {
    try {
      const res = await fetch('/api/apify/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actorId: 'apify/cheerio-scraper',
          input: {
            startUrls: [{ url: clean }],
            pageFunction: GALLERY_PAGE_FUNCTION,
            maxRequestsPerCrawl: 1,
            proxyConfiguration: { useApifyProxy: true },
          },
          timeout: 2,
          parseWithGPT: false,
        }),
      });
      if (!res.ok) throw new Error(`gallery crawl failed: ${res.status}`);
      const data = await res.json();
      const row = Array.isArray(data?.results) ? data.results[0] : null;
      const urls: string[] = (Array.isArray(row?.images) ? row.images : [])
        .filter((u: unknown): u is string => typeof u === 'string')
        .map((u: string) => u.trim())
        .filter((u: string) => isLikelyProductImage(u))
        .slice(0, MAX_GALLERY_IMAGES);
      galleryMemory.set(key, urls);
      if (urls.length > 0) {
        try {
          localStorage.setItem(GALLERY_CACHE_PREFIX + key, JSON.stringify({ urls, t: Date.now() }));
        } catch { /* storage unavailable — the memory cache still holds it */ }
      } else {
        // An empty read is a MISS, not a fact about the page.
        galleryMissAt.set(key, Date.now());
      }
      return urls;
    } catch (e) {
      console.warn('[Ethaion] product page gallery crawl failed:', e);
      galleryMissAt.set(key, Date.now());
      return [];
    } finally {
      galleryInflight.delete(key);
    }
  })();
  galleryInflight.set(key, job);
  return job;
}

// ---------------------------------------------------------------------------
// The resolvers.
// ---------------------------------------------------------------------------

/**
 * The full ranked candidate list for a product — image + source page, cached
 * hard. An empty array means nothing real could be resolved; the caller
 * shows the walnut-bordered paper placeholder (never an illustration, never
 * a stock photo).
 */
export async function resolveProductImageCandidates(subject: ProductImageSubject): Promise<ProductImageCandidate[]> {
  const key = productImageKey(subject);
  if (!key) return [];
  const cached = readCache(key);
  if (cached) return cached;
  const missed = missAt.get(key);
  if (missed && Date.now() - missed < MISS_RETRY_MS) return [];
  const running = inflight.get(key);
  if (running) return running;

  const job = (async () => {
    const found: ProductImageCandidate[] = [];
    const push = (candidate: ProductImageCandidate | null) => {
      if (candidate && candidate.url && !found.some((item) => item.url === candidate.url)) found.push(candidate);
    };
    try {
      // 1. The brand's own product page, when the card carries one.
      const direct = (subject.productUrl || '').trim();
      if (isHttp(direct) && !isSearchUrl(direct)) {
        const og = await fetchProductImage(direct).catch(() => '');
        if (og) push({ url: og, page: direct });
      }
      // 2. Google Images — brand + product name, originals and best sources
      //    first, each carrying its own product page.
      try {
        for (const candidate of await imageSearchCandidates(subject)) push(candidate);
      } catch (e) {
        console.warn('[Ethaion] product image search failed:', e);
      }
      // 3. Nothing yet — find the product page by web search, read its og:image.
      if (found.length === 0) push(await ogImageViaWebSearch(subject).catch(() => null));
      writeCache(key, found);
      return found.slice(0, MAX_CANDIDATES);
    } catch (e) {
      console.warn('[Ethaion] product image lookup failed:', e);
      writeCache(key, found);
      return found;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, job);
  return job;
}

/** The ranked image URLs alone — kept for callers that need no click-through. */
export async function resolveProductImages(subject: ProductImageSubject): Promise<string[]> {
  return (await resolveProductImageCandidates(subject)).map((candidate) => candidate.url);
}

/**
 * THE INGESTION-TIME CANDIDATE LIST — the ranked search candidates PLUS the
 * FULL GALLERY of the product's real page, and this is the list Step 1's
 * classification chooses from. It is deliberately a SEPARATE call from
 * `resolveProductImageCandidates`: a card resolving its display photograph
 * needs an answer in milliseconds and must never wait on (or bill) a page
 * crawl, while the ingestion pipeline runs once per product on the idle
 * queue and wants every framing that exists.
 *
 * The page that gets crawled is the product's own: the explicit product URL
 * when the caller has one, otherwise the best-ranked candidate's source page
 * (the maker's own store or a pack-shot retailer before anything else).
 * Gallery images LEAD the returned list — the maker's own gallery is where
 * the clean isolated shot lives when one exists — followed by the ranked
 * search candidates.
 */
export async function resolveProductGalleryCandidates(subject: ProductImageSubject): Promise<ProductImageCandidate[]> {
  const ranked = await resolveProductImageCandidates(subject).catch(() => [] as ProductImageCandidate[]);
  const brand = brandToken(subject.brand);
  const direct = (subject.productUrl || '').trim();
  let page = isHttp(direct) && !isSearchUrl(direct) ? direct : '';
  if (!page) {
    // The best-ranked candidate's own source page: the maker or a quality
    // retailer first; anything else only when nothing better carried a page.
    let fallback = '';
    for (const candidate of ranked) {
      const source = (candidate.page || '').trim();
      if (!isHttp(source) || isSearchUrl(source)) continue;
      const host = hostOf(source);
      if (!host || isExcludedHost(host)) continue;
      if (sourceScore(host, brand) <= 1) {
        page = source;
        break;
      }
      if (!fallback) fallback = source;
    }
    if (!page) page = fallback;
  }
  const gallery = page ? await crawlPageGallery(page).catch(() => [] as string[]) : [];
  const merged: ProductImageCandidate[] = [];
  const seen = new Set<string>();
  for (const url of gallery) {
    if (seen.has(url)) continue;
    seen.add(url);
    merged.push({ url, page });
  }
  for (const candidate of ranked) {
    if (seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    merged.push(candidate);
  }
  return merged.slice(0, MAX_GALLERY_IMAGES + MAX_CANDIDATES);
}

/**
 * The single best product image, skipping any URLs the caller already saw
 * fail to load. '' when nothing real resolves.
 */
export async function resolveProductImage(subject: ProductImageSubject, skip?: Set<string>): Promise<string> {
  const urls = await resolveProductImages(subject);
  for (const url of urls) {
    if (!skip || !skip.has(url)) return url;
  }
  return '';
}

/**
 * THE PIECE'S OWN PRODUCT PAGE — not the brand's homepage and not a search
 * results page. The image resolver already visits the page each candidate
 * photograph came from, so the best-ranked one that belongs to the maker's
 * own store or a pack-shot retailer IS the product page; resolving the image
 * and resolving the page are one cached lookup, not two.
 *
 * '' when nothing specific could be found, which is the caller's cue to fall
 * back to whatever link it already had.
 */
export async function resolveProductPage(subject: ProductImageSubject): Promise<string> {
  const direct = (subject.productUrl || '').trim();
  if (isHttp(direct) && !isSearchUrl(direct)) return direct;
  const brand = brandToken(subject.brand);
  const candidates = await resolveProductImageCandidates(subject).catch(() => []);
  let fallback = '';
  for (const candidate of candidates) {
    const page = (candidate.page || '').trim();
    if (!isHttp(page) || isSearchUrl(page)) continue;
    const host = hostOf(page);
    if (!host || isExcludedHost(host)) continue;
    const score = sourceScore(host, brand);
    if (score <= 1) return page; // the maker's own store, or a pack-shot retailer
    if (!fallback) fallback = page;
  }
  return fallback;
}
