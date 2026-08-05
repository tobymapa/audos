/**
 * THE INGESTION-TIME IMAGE PIPELINE — source selection, quality verification
 * and durable storage. Steps 1, 3 and 4 of the four-step rule; Step 2 (the
 * actual background removal) lives in photo-enhance.ts, which is the only
 * module that imports this one.
 *
 * It runs ONCE per image, when a product is first sourced:
 *
 *   Beau sources a product
 *     → pull ALL available images for it (product-images.ts)
 *     → CLASSIFY each candidate            (Step 1, here)
 *     → SELECT the best one                (Step 1, here)
 *     → REMOVE its background              (Step 2, photo-enhance.ts)
 *     → VERIFY the cutout                  (Step 3, here)
 *     → STORE the transparent PNG          (Step 4, here)
 *
 * NOTHING IN HERE MAY RUN AT PAGE-RENDER OR PAGE-LOAD TIME. Every surface
 * that shows an item reads the STORED cutout — `peekCutoutRecord` is
 * synchronous and free — so a finished transparent PNG costs exactly what any
 * other image on the page costs. Work is scheduled through `whenIdle` so an
 * item that has never been ingested is picked up after paint, never during
 * it.
 *
 * WHY A DATABASE ROW AND NOT JUST localStorage. The cut itself is uploaded to
 * the same object storage / CDN every other image uses, but the mapping from
 * source photograph to stored PNG used to live only in this browser's
 * localStorage — so the same customer on a second device re-ran the whole
 * pipeline (two model calls and a removal per item) before anything painted.
 * The mapping now lives in `image_cutouts`, read once per session into memory,
 * with localStorage kept as the fast local mirror.
 */

// window.__workspaceDb is auto-injected by the platform compiler when it sees
// this literal token in app source.
function db(): any {
  return (window as any).__workspaceDb;
}

/** Bump when the Step 1 questions or the tiebreakers change — older rows are
 * re-classified rather than trusted. */
export const CLASSIFIER_VERSION = 1;

/** Bump when Steps 2–3 change what a finished cutout looks like — older rows
 * are re-ingested. v2: Step 3 gained the mandatory VISION VERIFICATION pass
 * (`verifyCutoutWithVision` — the umbrella rule), so cuts that were passed on
 * alpha metrics alone are re-judged once. v3: the stored PNG changed shape —
 * Step 2 now ERODES the alpha edge (removing thin border/frame artifacts the
 * remover leaves behind) and the cut is TIGHT-CROPPED to the item's bounding
 * box with a fixed 4px margin instead of being centred on a category-aspect
 * canvas, and its cropped pixel dimensions are stored alongside it. Older
 * rows carry inflated canvases, so they are re-ingested. v4: the vision
 * verification learned to name the FAINT RECTANGULAR BORDER/FRAME line a
 * source photograph can bake in, and a failed verification now triggers ONE
 * remediation pass (a further ~2px alpha erosion + re-crop, in photo-enhance)
 * before the cut is flagged — older rows are re-ingested once so cuts that
 * were flagged `vision-artifacts` under v3 get the remediation instead of
 * staying held out of the compositions forever. v5: Step 2 gained
 * HOLLOW-FRAME REMOVAL — connected-region analysis clears any baked-in
 * rectangular border stroke that survives the ~2px erosion, whatever its
 * thickness (photo-enhance `stripFrameComponents`) — so older rows are
 * re-ingested once and no stored cut can carry a border artifact against
 * either the light or the dark ground. */
export const CUTOUT_PIPELINE_VERSION = 5;

/** FNV-1a hex — a short stable key for a URL, since the URL itself is far too
 * long to index and can carry a query string that varies by delivery size. */
export function imageHash(source: string): string {
  let h = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    h ^= source.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function isHttp(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

/**
 * Run `job` when the browser is idle — the ONE way ingestion is scheduled.
 * A cutout is worth waiting for; it is never worth delaying the first paint,
 * so the pipeline is deliberately pushed behind whatever the page is doing.
 */
export function whenIdle(job: () => void, timeout = 2000): void {
  const idle = (window as any).requestIdleCallback;
  if (typeof idle === 'function') idle(() => job(), { timeout });
  else window.setTimeout(job, 120);
}

// ---------------------------------------------------------------------------
// Canvas helpers. Deliberately self-contained: photo-enhance imports THIS
// module and never the other way round, so there is no cycle between the
// remover and the rules that feed it.
// ---------------------------------------------------------------------------

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image failed to load: ${src.slice(0, 80)}`));
    img.src = src;
  });
}

function lumOf(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Downscale + JPEG-encode an image for a base64 upload to the vision
 * endpoint. Small on purpose: a classification does not need detail. */
export async function imageToJpegBase64(url: string, maxEdge = 512): Promise<string> {
  const img = await loadImage(url);
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  ctx.fillStyle = '#ffffff'; // JPEG has no alpha — flatten on white first
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

// ---------------------------------------------------------------------------
// STEP 1 — SOURCE SELECTION.
//
// Beau routinely finds SEVERAL photographs of one product: the maker's pack
// shot, a retailer's crop, and a lifestyle frame with a man wearing it. The
// pipeline must cut the right one, and "the right one" is a judgement about
// the PHOTOGRAPH, so it is asked of a general vision-language model rather
// than any custom-trained detector:
//
//   · Does this image show a person, face or body part?
//   · Is the background plain / neutral (studio, white, solid colour)?
//
// Both questions in ONE call — they are one look at one photograph, and a
// second call would double the cost of every candidate for nothing.
// ---------------------------------------------------------------------------

export interface ImageClassification {
  /** true when a human model (body, face or limb) is visible. null when the
   * classifier could not read the image. */
  person: boolean | null;
  /** true when the ground is plain/neutral — studio, white, a solid colour. */
  plainBackground: boolean | null;
  /** width × height of the source file; 0 when it could not be measured.
   * The FIRST tiebreaker between two candidates that both qualify. */
  resolution: number;
  /** 0–1: how centred the subject sits in the frame (1 = dead centre). The
   * SECOND tiebreaker — a centred, front-facing shot cuts better than one
   * with the garment pushed into a corner. */
  centering: number;
}

const CLASSIFY_STORE_PREFIX = 'ethaion_img_class_v1_';
const classifications = new Map<string, ImageClassification>();

function readStoredClassification(url: string): ImageClassification | null {
  try {
    const raw = localStorage.getItem(CLASSIFY_STORE_PREFIX + imageHash(url));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ImageClassification> & { v?: number };
    if (Number(parsed?.v) !== CLASSIFIER_VERSION) return null;
    return {
      person: parsed.person === true ? true : parsed.person === false ? false : null,
      plainBackground:
        parsed.plainBackground === true ? true : parsed.plainBackground === false ? false : null,
      resolution: Number(parsed.resolution) || 0,
      centering: Number(parsed.centering) || 0,
    };
  } catch {
    return null;
  }
}

/** How long a classification answer is remembered.
 *  'memory'  — this session only: the one honest choice for an UNREADABLE
 *              result (vision outage, hotlink-blocked file). Persisting a
 *              null-answer row would silence the question forever, and the
 *              photograph would never actually be classified at all.
 *  'local'   — memory + the localStorage mirror (a row read back from the
 *              durable store).
 *  'durable' — memory + mirror + the image_classifications row, so the same
 *              photograph is never billed twice on any device. */
type ClassificationPersistence = 'memory' | 'local' | 'durable';

function rememberClassification(url: string, value: ImageClassification, persist: ClassificationPersistence): void {
  classifications.set(url, value);
  if (persist === 'memory') return;
  try {
    localStorage.setItem(
      CLASSIFY_STORE_PREFIX + imageHash(url),
      JSON.stringify({ ...value, v: CLASSIFIER_VERSION }),
    );
  } catch { /* storage unavailable — the memory map still holds it */ }
  if (persist !== 'durable') return;
  void (async () => {
    try {
      const hash = imageHash(url);
      const { data } = await db().from('image_classifications').eq('image_hash', hash).limit(1).get();
      const row = {
        image_hash: hash,
        image_url: url,
        has_person: value.person,
        plain_background: value.plainBackground,
        resolution_px: Math.round(value.resolution) || null,
        centering: Number(value.centering.toFixed(3)),
        classifier_version: CLASSIFIER_VERSION,
      };
      if (data?.[0]?.id) await db().from('image_classifications').update(data[0].id, row);
      else await db().from('image_classifications').insert(row);
    } catch (error) {
      console.warn('[Ethaion] source classification write failed:', error);
    }
  })();
}

/** The cached answer for a photograph, or undefined when nobody has looked
 * yet. Synchronous and free — this is what keeps Step 1 off the render path. */
export function peekClassification(url: string): ImageClassification | undefined {
  const clean = (url || '').trim();
  if (!clean) return undefined;
  const inMemory = classifications.get(clean);
  if (inMemory) return inMemory;
  const stored = readStoredClassification(clean);
  if (stored) {
    classifications.set(clean, stored);
    return stored;
  }
  return undefined;
}

/**
 * DETERMINISTIC MEASUREMENT — resolution, how centred the subject is, and how
 * uniform the frame border reads. The first two are the tiebreakers between
 * two candidates that both pass the model's questions; the third is the
 * fallback answer to "is the background plain" when the model could not read
 * the image at all, so a hotlink-blocked or rate-limited candidate still gets
 * an honest judgement instead of a null.
 *
 * Returns zeros when the file cannot be read into a canvas (a CDN that
 * refuses cross-origin reads) — never throws.
 */
async function measureImage(url: string): Promise<{ resolution: number; centering: number; borderUniformity: number }> {
  const blank = { resolution: 0, centering: 0, borderUniformity: 0 };
  let img: HTMLImageElement;
  try {
    img = await loadImage(url);
  } catch {
    return blank;
  }
  const resolution = img.naturalWidth * img.naturalHeight;
  try {
    const scale = Math.min(1, 160 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(2, Math.round(img.naturalWidth * scale));
    const h = Math.max(2, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { ...blank, resolution };
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    // The border IS the background in a product photograph. Its mean colour
    // and its spread answer both questions: how far the subject sits from the
    // middle, and whether the ground is one flat tone or a whole scene.
    let br = 0;
    let bg = 0;
    let bb = 0;
    let n = 0;
    const border: number[] = [];
    const sample = (x: number, y: number) => {
      const o = (y * w + x) * 4;
      br += data[o];
      bg += data[o + 1];
      bb += data[o + 2];
      border.push(o);
      n += 1;
    };
    for (let x = 0; x < w; x += 1) {
      sample(x, 0);
      sample(x, h - 1);
    }
    for (let y = 1; y < h - 1; y += 1) {
      sample(0, y);
      sample(w - 1, y);
    }
    const mr = br / Math.max(1, n);
    const mg = bg / Math.max(1, n);
    const mb = bb / Math.max(1, n);
    let spread = 0;
    for (const o of border) {
      const dr = data[o] - mr;
      const dg = data[o + 1] - mg;
      const dbv = data[o + 2] - mb;
      spread += Math.sqrt(dr * dr + dg * dg + dbv * dbv);
    }
    const meanSpread = spread / Math.max(1, border.length);
    // A studio ground varies by a couple of channel values across the whole
    // border; a street scene varies by dozens.
    const borderUniformity = Math.max(0, Math.min(1, 1 - meanSpread / 40));
    // The subject: anything meaningfully unlike the border colour.
    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const o = (y * w + x) * 4;
        const dr = data[o] - mr;
        const dg = data[o + 1] - mg;
        const dbv = data[o + 2] - mb;
        if (dr * dr + dg * dg + dbv * dbv <= 1600) continue; // within ~40 of the ground
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX <= minX || maxY <= minY) return { resolution, centering: 0, borderUniformity };
    const cx = (minX + maxX) / 2 / w;
    const cy = (minY + maxY) / 2 / h;
    // 1 when the subject's centre is the frame's centre, falling off with the
    // distance to it.
    const drift = Math.sqrt((cx - 0.5) * (cx - 0.5) + (cy - 0.5) * (cy - 0.5));
    const centering = Math.max(0, Math.min(1, 1 - drift / 0.5));
    return { resolution, centering, borderUniformity };
  } catch {
    return { ...blank, resolution };
  }
}

/** The vision call — both Step 1 questions in one look at one photograph. */
async function askVision(url: string): Promise<{ person: boolean | null; plainBackground: boolean | null }> {
  try {
    const base64 = await imageToJpegBase64(url, 512);
    const res = await fetch('/api/generate/vision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt:
          'You are checking a product photograph before it is used in a flat-lay. Answer TWO questions about it.\n' +
          '1. PERSON: is a person, a face, or any body part (hand, leg, foot, torso) visible in the image — for example the item being worn or held by a model?\n' +
          '2. PLAIN: is the background plain and neutral — a studio backdrop, white, or a single solid colour — rather than a room, a street, or any other scene?\n' +
          'Reply with exactly this format and nothing else: PERSON=YES|NO; PLAIN=YES|NO',
        image: base64,
        mimeType: 'image/jpeg',
      }),
    });
    if (!res.ok) return { person: null, plainBackground: null };
    const data = await res.json();
    const text = String(data?.result || '').toUpperCase();
    const read = (label: string): boolean | null => {
      const match = text.match(new RegExp(`${label}\\s*[=:]\\s*(YES|NO)`));
      if (!match) return null;
      return match[1] === 'YES';
    };
    return { person: read('PERSON'), plainBackground: read('PLAIN') };
  } catch {
    return { person: null, plainBackground: null };
  }
}

/**
 * Classify one candidate photograph — ONCE, ever. The answer is written to
 * `image_classifications`, so the same photograph is never billed twice, on
 * this device or any other.
 */
export async function classifyImage(url: string): Promise<ImageClassification> {
  const clean = (url || '').trim();
  if (!clean) return { person: null, plainBackground: null, resolution: 0, centering: 0 };
  const cached = peekClassification(clean);
  if (cached) return cached;
  const [asked, measured] = await Promise.all([askVision(clean), measureImage(clean)]);
  const result: ImageClassification = {
    person: asked.person,
    // The model leads; the border measurement answers only when it could not.
    plainBackground:
      asked.plainBackground !== null
        ? asked.plainBackground
        : measured.borderUniformity > 0
          ? measured.borderUniformity >= 0.9
          : null,
    resolution: measured.resolution,
    centering: measured.centering,
  };
  // An answer the model actually gave (or the border measurement settled) is
  // kept forever; a fully unreadable one is kept for this session only, so a
  // later visit asks again instead of inheriting an outage as a fact.
  const readable = result.person !== null || result.plainBackground !== null;
  rememberClassification(clean, result, readable ? 'durable' : 'memory');
  return result;
}

/** How many FRESH classification calls one item's selection may spend. Cached
 * answers are free and do not count against it, so a product whose framings
 * were read on an earlier visit is walked all the way down for nothing.
 * Raised from 4 when the product-page gallery crawl started feeding the
 * selection a fuller candidate list — the budget is spent in ranked order,
 * so it lands on the maker's own gallery first. */
const CLASSIFY_BUDGET = 6;

export interface SourceSelection {
  /** The framing to cut. '' only when the caller passed nothing usable. */
  url: string;
  /**
   * 'good'  — a person-free framing was found (the selection rule was met).
   * 'low'   — NO image satisfied "no person": the best available on-body
   *           photograph was selected, and everything downstream treats this
   *           item's cutout as lower-confidence.
   * 'unknown' — nothing could be read; the best-ranked candidate was taken.
   */
  sourceQuality: 'good' | 'low' | 'unknown';
  /** The classification of the CHOSEN image. */
  person: boolean | null;
  plainBackground: boolean | null;
  /** true when at least one candidate was actually read — the difference
   * between "every framing has a model in it" (a finding) and "the classifier
   * could not read them" (an absence of information). */
  conclusive: boolean;
}

/** Better first: the highest-resolution, most centred candidate. */
function bestOf(list: Array<{ url: string; c: ImageClassification }>): { url: string; c: ImageClassification } | null {
  if (list.length === 0) return null;
  return list
    .slice()
    .sort((a, b) => b.c.resolution - a.c.resolution || b.c.centering - a.c.centering)[0];
}

/**
 * THE SELECTION RULE, and it is the whole of Step 1.
 *
 *   PREFER  person = no AND plain background = yes.
 *   THEN    person = no (the ground is busier than we would like, but there
 *           is nobody in it — which is the thing that actually ruins a
 *           flat-lay).
 *   TIEBREAK highest resolution, then most centred.
 *   FALLBACK no candidate satisfies "no person": take the best on-body
 *           photograph there is and return sourceQuality 'low', so Step 3
 *           marks the resulting cutout lower-confidence rather than passing
 *           it off as a clean product shot.
 *
 * `candidates` arrives already ranked by product-images.ts (the maker's own
 * pack shot first, resale marketplaces last), so the classification budget is
 * spent on the framings most likely to be isolated.
 */
export async function selectSourceImage(candidates: Array<string | null | undefined>): Promise<SourceSelection> {
  const list: string[] = [];
  for (const raw of candidates) {
    const clean = (raw || '').trim();
    if (clean && !list.includes(clean)) list.push(clean);
  }
  if (list.length === 0) {
    return { url: '', sourceQuality: 'unknown', person: null, plainBackground: null, conclusive: false };
  }

  const read = new Map<string, ImageClassification>();
  // Every cached answer first, for the WHOLE list — a known product-only shot
  // wins however deep in the ranking it sits, and costs nothing to find.
  for (const url of list) {
    const known = peekClassification(url);
    if (known) read.set(url, known);
  }
  let budget = CLASSIFY_BUDGET;
  for (const url of list) {
    if (read.has(url)) continue;
    if (budget <= 0) break;
    budget -= 1;
    read.set(url, await classifyImage(url).catch(() => ({ person: null, plainBackground: null, resolution: 0, centering: 0 })));
  }

  const entries = list.filter((url) => read.has(url)).map((url) => ({ url, c: read.get(url) as ImageClassification }));
  const conclusive = entries.some((entry) => entry.c.person !== null);

  const ideal = bestOf(entries.filter((e) => e.c.person === false && e.c.plainBackground === true));
  if (ideal) {
    return {
      url: ideal.url,
      sourceQuality: 'good',
      person: false,
      plainBackground: true,
      conclusive: true,
    };
  }
  const personFree = bestOf(entries.filter((e) => e.c.person === false));
  if (personFree) {
    return {
      url: personFree.url,
      sourceQuality: 'good',
      person: false,
      plainBackground: personFree.c.plainBackground,
      conclusive: true,
    };
  }
  // FALLBACK — nothing satisfies "no person". The best on-body framing is
  // selected and flagged, which is what makes the flagging in Step 3 honest
  // rather than a guess.
  const onBody = bestOf(entries.filter((e) => e.c.person === true));
  if (onBody) {
    return {
      url: onBody.url,
      sourceQuality: 'low',
      person: true,
      plainBackground: onBody.c.plainBackground,
      conclusive: true,
    };
  }
  return { url: list[0], sourceQuality: 'unknown', person: null, plainBackground: null, conclusive };
}

// ---------------------------------------------------------------------------
// STEP 3 — QUALITY VERIFICATION.
//
// A remover always returns SOMETHING. What it returns can be a clean cut, an
// untouched photograph, a garment with a white halo around it, or half a
// coat. This reads the alpha channel it produced and says which:
//
//   coverage     how much of the frame survived — nothing removed, or
//                nothing left, are both failures rather than cutouts
//   fringing     a bright halo in the semi-transparent edge band: the
//                remover took the garment's outline but left the studio
//                white clinging to it
//   edgeClipped  opaque pixels running off the frame border: the item is cut
//                off rather than cut out
//   ghosting     a wide band of mid-alpha pixels — a soft, translucent
//                silhouette instead of a definite one
//
// Anything short of clean is FLAGGED, not silently shipped: a flagged cutout
// is kept out of the composition views and shown with the plain fallback
// presentation instead.
// ---------------------------------------------------------------------------

export type CutoutVerdict = 'clean' | 'imperfect' | 'failed';

export interface CutoutQuality {
  verdict: CutoutVerdict;
  /** Machine-readable reasons, for the review queue and the stored row. */
  reasons: string[];
  coverage: number;
  fringing: number;
  edgeClipped: number;
  ghosting: number;
}

/** Below this share of opaque pixels there is no garment left; above the
 * upper bound nothing was removed at all and this is not a cutout. */
const MIN_COVERAGE = 0.02;
const MAX_COVERAGE = 0.98;
/** Solid pixels along the frame edge mean the item runs OFF the picture: a
 * partial cut rather than a finished one. Set deliberately high — plenty of
 * good pack shots are cropped close, and touching an edge is not the same as
 * being sliced through. Nearly a third of the perimeter is.
 */
const MAX_EDGE_CLIPPED = 0.3;
/** Semi-transparent pixels are the ANTIALIASED OUTLINE and should be a thin
 * band. Much more than this is a translucent ghost. */
const MAX_GHOSTING = 0.22;
/** When most of that outline band is near-white, the remover left the studio
 * ground clinging to the garment. */
const MAX_FRINGING = 0.6;
const MIN_FRINGE_BAND = 0.02;

/**
 * Judge a background-removed frame from its alpha channel. `data` is RGBA
 * from a canvas the cut has been drawn onto at its own size.
 */
export function assessCutout(data: Uint8ClampedArray, w: number, h: number): CutoutQuality {
  const total = Math.max(1, w * h);
  let opaque = 0;
  let clear = 0;
  let semi = 0;
  let brightSemi = 0;
  for (let i = 0; i < total; i += 1) {
    const o = i * 4;
    const a = data[o + 3];
    if (a < 16) {
      clear += 1;
      continue;
    }
    if (a > 240) {
      opaque += 1;
      continue;
    }
    semi += 1;
    if (lumOf(data[o], data[o + 1], data[o + 2]) > 0.88) brightSemi += 1;
  }
  // The frame border: a finished cutout has clear space all round it.
  let edgePixels = 0;
  let edgeSolid = 0;
  const countEdge = (x: number, y: number) => {
    edgePixels += 1;
    if (data[(y * w + x) * 4 + 3] >= 128) edgeSolid += 1;
  };
  for (let x = 0; x < w; x += 1) {
    countEdge(x, 0);
    countEdge(x, h - 1);
  }
  for (let y = 1; y < h - 1; y += 1) {
    countEdge(0, y);
    countEdge(w - 1, y);
  }

  const coverage = (opaque + semi) / total;
  const removed = clear / total;
  const ghosting = semi / total;
  const fringing = semi > 0 ? brightSemi / semi : 0;
  const edgeClipped = edgePixels > 0 ? edgeSolid / edgePixels : 0;
  const reasons: string[] = [];

  if (coverage < MIN_COVERAGE) {
    return { verdict: 'failed', reasons: ['empty'], coverage, fringing, edgeClipped, ghosting };
  }
  if (removed < MIN_COVERAGE || coverage > MAX_COVERAGE) {
    // Nothing was actually taken away — a recoloured or untouched photograph,
    // which is exactly what must never be passed off as a transparent PNG.
    return { verdict: 'failed', reasons: ['nothing-removed'], coverage, fringing, edgeClipped, ghosting };
  }
  if (edgeClipped > MAX_EDGE_CLIPPED) reasons.push('edge-clipped');
  if (ghosting > MAX_GHOSTING) reasons.push('ghosting');
  if (ghosting > MIN_FRINGE_BAND && fringing > MAX_FRINGING) reasons.push('fringing');
  return {
    verdict: reasons.length === 0 ? 'clean' : 'imperfect',
    reasons,
    coverage,
    fringing,
    edgeClipped,
    ghosting,
  };
}

/**
 * STEP 3's SECOND HALF — THE VISION VERIFICATION PASS, and it is MANDATORY
 * for every cut bound for a composition. The alpha metrics above judge the
 * cut MECHANICALLY: they catch a removal that took nothing, left nothing, or
 * left a halo. They cannot catch a cut that is mechanically perfect and
 * semantically wrong — the known umbrella failure, where fine-edged spokes
 * came back with clean alpha and fragments of a DIFFERENT object riding
 * along inside the silhouette. That judgement is about what the picture
 * SHOWS, so it is asked of a vision model:
 *
 *   "Does this image contain only the single product cleanly, with no
 *    unrelated fragments, artifacts, or partial second objects visible?"
 *
 * The cutout is shown to the model COMPOSITED ON BOTH REAL GROUNDS, side by
 * side in one frame — the light #FBF8F1 canvas of the Today tray and the
 * dark #241a12 walnut of the Ledger slab — because the two grounds expose
 * different failures: leftover studio white hides on the light half and
 * screams on the dark one. One call, both grounds.
 *
 * Returns true (clean), false (flag for review — the caller must NOT publish
 * the cut into a composition view), or null when the model could not answer.
 * An outage is not a verdict, so on null the caller keeps its deterministic
 * judgement rather than blocking the pipeline.
 */
export async function verifyCutoutWithVision(cutoutSrc: string): Promise<boolean | null> {
  try {
    const img = await loadImage(cutoutSrc);
    const scale = Math.min(1, 512 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w * 2;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#FBF8F1'; // the Today tray's light canvas
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#241a12'; // the Ledger's walnut slab
    ctx.fillRect(w, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    ctx.drawImage(img, w, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const res = await fetch('/api/generate/vision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt:
          'You are checking a background-removed product cutout before it is published. The image shows the SAME cutout twice: composited on a light beige panel (left) and on a dark brown panel (right).\n' +
          'CLEAN: does the image contain only the single product, cleanly cut — with no unrelated fragments, no stray artifacts, no partial second object, no leftover background patches, no faint rectangular line, border or frame around the item on either half, and no light halo or fringe around the edges on the dark right half?\n' +
          'Reply with exactly this format and nothing else: CLEAN=YES|NO',
        image: dataUrl.slice(dataUrl.indexOf(',') + 1),
        mimeType: 'image/jpeg',
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.success === false) return null;
    const match = String(data?.result || '').toUpperCase().match(/CLEAN\s*[=:]\s*(YES|NO)/);
    if (!match) return null;
    return match[1] === 'YES';
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// STEP 4 — STORAGE. The finished transparent PNG goes to the same object
// storage every other image in the app uses; THIS is the record that points
// at it, so every surface reuses the one stored file.
// ---------------------------------------------------------------------------

export interface CutoutRecord {
  /** The image the pipeline was run FOR — the identity a surface peeks by. */
  sourceUrl: string;
  /** Step 1's chosen framing, which may be a different photograph. */
  selectedSourceUrl: string;
  /** THE STORED CUTOUT — a genuine alpha-channel transparent PNG on the CDN.
   * '' when every tier failed. */
  transparentImageUrl: string;
  tier: number;
  sourceQuality: 'good' | 'low' | 'unknown';
  cutoutQuality: CutoutVerdict;
  reviewReasons: string[];
  /** True when the cut must not be auto-published into a composition view. */
  needsReview: boolean;
  /** True only when the cut is safe in an overlapping flat-lay. */
  flatLayReady: boolean;
  confidence: 'high' | 'medium' | 'low' | 'none';
  category: string | null;
  pieceId?: number | null;
  /** Pixel dimensions of the stored TIGHT-CROPPED transparent PNG — the
   * item's silhouette plus the fixed 4px margin, nothing more. A composition
   * surface reads these to compute the item's true aspect ratio (and so its
   * render width from its category-derived height) WITHOUT loading the image
   * first. null on records written before pipeline v3. */
  croppedWidth?: number | null;
  croppedHeight?: number | null;
}

const CUTOUT_STORE_PREFIX = 'ethaion_cutout_record_v1_';
const records = new Map<string, CutoutRecord>();

/** Every CDN URL known to BE a stored transparent cutout. The platform
 * renames uploads (a cutout lands at a UUID filename), so NO filename
 * pattern can identify one — this set, filled from the `image_cutouts` rows
 * at hydration and from every record write, is how a surface that meets a
 * cutout URL in persisted state (a saved outfit's pieces JSON, a restored
 * board) recognises genuine transparency instead of plating it as a
 * photograph on a solid ground. */
const storedCutoutUrls = new Set<string>();

function registerCutoutUrl(url: string | null | undefined): void {
  const clean = (url || '').trim();
  if (clean) storedCutoutUrls.add(clean);
}

/** True when `url` is one of OUR stored transparent cutouts — a genuine
 * alpha-channel PNG, whatever its filename. Synchronous and free. */
export function isStoredCutoutUrl(url: string): boolean {
  const clean = (url || '').trim();
  return !!clean && storedCutoutUrls.has(clean);
}

function readStoredRecord(sourceUrl: string): CutoutRecord | null {
  try {
    const raw = localStorage.getItem(CUTOUT_STORE_PREFIX + imageHash(sourceUrl));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v?: number; r?: CutoutRecord };
    if (Number(parsed?.v) !== CUTOUT_PIPELINE_VERSION || !parsed?.r) return null;
    return parsed.r;
  } catch {
    return null;
  }
}

function writeStoredRecord(record: CutoutRecord): void {
  records.set(record.sourceUrl, record);
  registerCutoutUrl(record.transparentImageUrl);
  try {
    localStorage.setItem(
      CUTOUT_STORE_PREFIX + imageHash(record.sourceUrl),
      JSON.stringify({ v: CUTOUT_PIPELINE_VERSION, r: record }),
    );
  } catch { /* storage unavailable — the memory map still holds it */ }
}

/**
 * The stored cutout for a source photograph, SYNCHRONOUSLY. This is the call
 * every grid, tray and board makes at render time, and it is the reason none
 * of them ever runs the pipeline: an ingested item answers instantly with a
 * CDN URL, and an un-ingested one answers null so the surface can paint the
 * photograph it already has and hand the work to `whenIdle`.
 */
export function peekCutoutRecord(sourceUrl: string): CutoutRecord | null {
  const clean = (sourceUrl || '').trim();
  if (!clean) return null;
  const inMemory = records.get(clean);
  if (inMemory) return inMemory;
  const stored = readStoredRecord(clean);
  if (stored) {
    records.set(clean, stored);
    registerCutoutUrl(stored.transparentImageUrl);
    return stored;
  }
  return null;
}

function rowToRecord(row: any, dims?: { width: number; height: number } | null): CutoutRecord | null {
  const sourceUrl = typeof row?.source_url === 'string' ? row.source_url.trim() : '';
  if (!sourceUrl) return null;
  const tier = Number(row?.tier);
  return {
    sourceUrl,
    selectedSourceUrl: typeof row?.selected_source_url === 'string' ? row.selected_source_url : sourceUrl,
    transparentImageUrl: isHttp(row?.transparent_image_url) ? String(row.transparent_image_url).trim() : '',
    tier: Number.isFinite(tier) ? tier : 0,
    sourceQuality: row?.source_quality === 'low' ? 'low' : row?.source_quality === 'good' ? 'good' : 'unknown',
    cutoutQuality:
      row?.cutout_quality === 'clean' ? 'clean' : row?.cutout_quality === 'imperfect' ? 'imperfect' : 'failed',
    reviewReasons: String(row?.review_reasons || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    needsReview: row?.needs_review === true,
    flatLayReady: row?.flat_lay_ready === true,
    confidence:
      row?.confidence === 'high' || row?.confidence === 'medium' || row?.confidence === 'low' ? row.confidence : 'none',
    category: typeof row?.category === 'string' ? row.category : null,
    pieceId: row?.piece_id == null ? null : Number(row.piece_id),
    croppedWidth: dims?.width ?? null,
    croppedHeight: dims?.height ?? null,
  };
}

let hydration: Promise<void> | null = null;

/**
 * Read the whole cutout store (and the Step 1 answers) into memory ONCE per
 * session, at app boot. Every surface then peeks synchronously and nothing
 * re-processes an image the customer has already paid to have cut — including
 * on a device that has never seen it before.
 *
 * Failure is quiet: without the DB the localStorage mirror still answers, and
 * a genuinely unknown image is ingested once.
 */
export function hydrateImagePipelineStore(): Promise<void> {
  if (!hydration) {
    hydration = (async () => {
      try {
        // The cropped dimensions live in the cutout_dims companion table
        // (image_cutouts itself cannot be altered), keyed by the same
        // source_hash — read them first so each record hydrates whole.
        const dimsByHash = new Map<string, { width: number; height: number }>();
        try {
          const { data: dimRows } = await db().from('cutout_dims').orderBy('updated_at', 'desc').limit(200).get();
          for (const row of dimRows || []) {
            const hash = typeof row?.source_hash === 'string' ? row.source_hash : '';
            const width = Number(row?.cropped_width);
            const height = Number(row?.cropped_height);
            if (hash && width > 0 && height > 0) dimsByHash.set(hash, { width, height });
          }
        } catch { /* dims are an enhancement — records still hydrate without them */ }
        const { data } = await db()
          .from('image_cutouts')
          .orderBy('updated_at', 'desc')
          .limit(200)
          .get();
        for (const row of data || []) {
          // EVERY stored cutout URL registers as known transparency — even
          // when the row's pipeline version is stale. The RECORD may be due a
          // re-ingest, but the file it points at is a genuine alpha-channel
          // PNG, and a surface that meets that URL in persisted state (a
          // saved outfit's pieces JSON) must recognise it rather than plate
          // it as a photograph.
          if (isHttp(row?.transparent_image_url)) registerCutoutUrl(String(row.transparent_image_url).trim());
          if (Number(row?.pipeline_version || 0) < CUTOUT_PIPELINE_VERSION) continue;
          const record = rowToRecord(row, dimsByHash.get(String(row?.source_hash || '')) ?? null);
          if (record && !records.has(record.sourceUrl)) writeStoredRecord(record);
        }
      } catch (error) {
        console.warn('[Ethaion] cutout store read failed:', error);
      }
      try {
        const { data } = await db()
          .from('image_classifications')
          .orderBy('updated_at', 'desc')
          .limit(200)
          .get();
        for (const row of data || []) {
          const url = typeof row?.image_url === 'string' ? row.image_url.trim() : '';
          if (!url || Number(row?.classifier_version || 0) < CLASSIFIER_VERSION) continue;
          if (classifications.has(url)) continue;
          rememberClassification(
            url,
            {
              person: row?.has_person === true ? true : row?.has_person === false ? false : null,
              plainBackground:
                row?.plain_background === true ? true : row?.plain_background === false ? false : null,
              resolution: Number(row?.resolution_px) || 0,
              centering: Number(row?.centering) || 0,
            },
            'local',
          );
        }
      } catch (error) {
        console.warn('[Ethaion] source classification read failed:', error);
      }
    })();
  }
  return hydration;
}

/**
 * Persist a finished ingestion — the stored transparent PNG plus the Step 1
 * and Step 3 verdicts. Written once per image; the row is what every later
 * visit and every other device reads instead of re-running the pipeline.
 */
export async function saveCutoutRecord(record: CutoutRecord): Promise<void> {
  writeStoredRecord(record);
  try {
    const hash = imageHash(record.sourceUrl);
    const row = {
      source_hash: hash,
      source_url: record.sourceUrl,
      selected_source_url: record.selectedSourceUrl || record.sourceUrl,
      transparent_image_url: record.transparentImageUrl || null,
      tier: record.tier,
      source_quality: record.sourceQuality,
      cutout_quality: record.cutoutQuality,
      review_reasons: record.reviewReasons.join(',') || null,
      needs_review: record.needsReview,
      flat_lay_ready: record.flatLayReady,
      confidence: record.confidence,
      category: record.category,
      piece_id: record.pieceId ?? null,
      pipeline_version: CUTOUT_PIPELINE_VERSION,
    };
    const { data } = await db().from('image_cutouts').eq('source_hash', hash).limit(1).get();
    if (data?.[0]?.id) await db().from('image_cutouts').update(data[0].id, row);
    else await db().from('image_cutouts').insert(row);
    // The cropped dimensions ride in the cutout_dims companion table
    // (image_cutouts cannot be altered), keyed by the same source_hash.
    if (record.croppedWidth && record.croppedHeight) {
      const dimsRow = {
        source_hash: hash,
        cropped_width: Math.round(record.croppedWidth),
        cropped_height: Math.round(record.croppedHeight),
      };
      const { data: dims } = await db().from('cutout_dims').eq('source_hash', hash).limit(1).get();
      if (dims?.[0]?.id) await db().from('cutout_dims').update(dims[0].id, dimsRow);
      else await db().from('cutout_dims').insert(dimsRow);
    }
  } catch (error) {
    console.warn('[Ethaion] cutout store write failed:', error);
  }
}

/**
 * Every ingested item whose cutout was flagged for MANUAL REVIEW — the
 * fringed, part-cut and ghosted ones, plus the items for which only an
 * on-body photograph exists. Nothing here is auto-published into a
 * composition view; this is the list a person can work through.
 */
export function flaggedCutouts(): CutoutRecord[] {
  return [...records.values()].filter((record) => record.needsReview);
}
