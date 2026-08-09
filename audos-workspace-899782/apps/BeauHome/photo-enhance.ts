/**
 * Ethaion garment image pipeline (Pass Twenty-Six) — DETERMINISTIC
 * BACKGROUND REMOVAL. No AI image generation, ever.
 *
 * Every previous pass asked an image-to-image model to "reproduce" the
 * uploaded garment — inherently unreliable, and abandoned as of this pass.
 * The industry-standard approach (Whering, Acloset, every successful
 * wardrobe app) is simpler and deterministic:
 *
 *  1. BACKGROUND REMOVAL — PHOTOROOM FIRST (Pass Forty-Seven): the photo
 *     goes to the Photoroom segment API (purpose-built for fashion/product
 *     photography — clothing, shoes, accessories, mannequins) through the
 *     workspace secrets proxy, keyed by the PHOTOROOM_API_KEY secret that
 *     never reaches the browser. When the key is missing or the call fails,
 *     the photo falls back to @imgly/background-removal running entirely
 *     CLIENT-SIDE (ONNX/WASM, no key, ~2–5s). Either way the output is the
 *     ACTUAL garment cut out on a transparent ground — never an AI's guess.
 *     SPEED CAP (Pass Forty-Six B): each remover is raced against a
 *     5-second timeout — past that the pipeline abandons it and continues
 *     with the original image, so nothing ever hangs on the model.
 *  2. TRANSPARENT NORMALIZATION (Pass Forty-Nine — the universal
 *     transparency rule): the cut-out goes through the SAME normalization
 *     every online-sourced product gets (trimTransparent): the alpha edge
 *     is ERODED ~4px (border-artifact cleanup — the thin rectangular
 *     frame line a source photograph can bake in), the frame is
 *     TIGHT-CROPPED to the item's bounding box plus a fixed 4px margin,
 *     the cut is judged and vision-verified on BOTH real grounds, and the
 *     finished GENUINE ALPHA-CHANNEL transparent PNG is stored as the
 *     piece's canonical image — the ONE file every surface shows. The
 *     opaque #fbf8f1 paper card is retired: a solid card was itself the
 *     white/solid background box the founder's rule forbids.
 *  3. FALLBACK — if no tier can produce a clean transparent cutout, the
 *     piece KEEPS its previous image (no crash, no error screen); display
 *     surfaces present that photograph honestly plated, and it is NEVER
 *     laid inside a composition.
 *
 * The /api/generate/image-to-image and /api/generate/image endpoints are
 * NO LONGER CALLED anywhere in this pipeline. Pieces with no photo at all
 * (text-only adds) keep their quiet placeholder tile — nothing is invented.
 *
 * RETROACTIVE BATCH (runPhotoMigration): on first app load, every existing
 * wardrobe piece that has a stored photo is reprocessed through background
 * removal + normalization, SEQUENTIALLY (one at a time, each awaited).
 * A failed piece is logged and skipped with its previous image unchanged —
 * never aborting the batch. The one-time sweep is guarded by the
 * bgRemovalV49 flag in localStorage: once the batch completes, it never
 * re-runs on reload.
 *
 * ANCHORS: the user's own uploaded photo is preserved forever in
 * piece_photo_originals and never overwritten — reprocessing always starts
 * from the best available original.
 *
 * THE FLAT-LAY CUTOUT PIPELINE lives in the second half of this file, and it
 * is a different job from the wardrobe card above: it produces a genuinely
 * TRANSPARENT PNG for the composition views. Its source selection, quality
 * verification and durable storage (Steps 1, 3 and 4) live in
 * image-pipeline.ts; this file owns Step 2, the removal itself.
 */
import { categoryLabel, defaultMaterial, normalizePiece, slotLabel, type WardrobePiece } from './profile-data';
import { registerGarmentImage, setGarmentRegenerating } from './canonical-garment';
import {
  assessCutout,
  classifyImage,
  isStoredCutoutUrl,
  peekClassification,
  peekCutoutRecord,
  saveCutoutRecord,
  selectSourceImage,
  verifyCutoutWithVision,
  type CutoutQuality,
  type CutoutVerdict,
  type SourceSelection,
} from './image-pipeline';

function db(): any {
  return (window as any).__workspaceDb;
}

// ---------------------------------------------------------------------------
// Uploads — the raw photo is stored fast, kept as the permanent anchor
// ---------------------------------------------------------------------------

export async function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target?.result as string);
    reader.onerror = () => reject(new Error('could not read file'));
    reader.readAsDataURL(file);
  });
  const comma = dataUrl.indexOf(',');
  const mimeType = dataUrl.slice(0, comma).match(/^data:([^;]+);/)?.[1] || file.type || 'image/jpeg';
  return { base64: dataUrl.slice(comma + 1), mimeType };
}

/** FNV-1a over the encoded file content — a short, stable CONTENT fingerprint.
 * Baked into every uploaded filename (cache-busting by construction): changed
 * content ⇒ changed name ⇒ changed URL, so no browser or CDN cache can ever
 * serve a stale copy of a replaced asset. Versioned files are then safe to
 * cache indefinitely. */
function contentFingerprint(dataUrl: string): string {
  let h = 2166136261;
  for (let i = 0; i < dataUrl.length; i += 1) {
    h ^= dataUrl.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** `photo.png` → `photo.<contenthash>.png` — the version-identifying filename
 * every stored asset carries. Replacing an asset ALWAYS mints a new URL; the
 * old file is never overwritten in place, and every record that points at the
 * asset stores the new URL (never a reused filename). */
function versionedFileName(fileName: string, dataUrl: string): string {
  const hash = contentFingerprint(dataUrl);
  if (fileName.includes(hash)) return fileName;
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? `${fileName.slice(0, dot)}.${hash}${fileName.slice(dot)}` : `${fileName}.${hash}`;
}

/** THE ONE UPLOAD PATH — exported so every flow that stores a file (garment
 * photos, wardrobe scans, discovery images/PDFs, try-on face photos) shares
 * the versioned-filename rule above. Nothing should call /api/upload/image
 * directly: a raw call skips the content hash and reopens the stale-cache
 * window this rule exists to close. */
export async function uploadImageData(dataUrl: string, fileName: string): Promise<string> {
  const response = await fetch('/api/upload/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageData: dataUrl, fileName: versionedFileName(fileName, dataUrl) }),
  });
  if (!response.ok) throw new Error(`photo upload failed: ${response.status}`);
  const data = await response.json();
  if (!data?.imageUrl) throw new Error('photo upload returned no URL');
  return data.imageUrl as string;
}

// ---------------------------------------------------------------------------
// Client-side compression (Pass Forty-Eight) — runs BEFORE any upload or AI
// call, in every flow. A full phone photo is 8–12MB; capping the longest
// side at 1200px and re-encoding as JPEG 0.85 brings the payload to a few
// hundred KB, which takes the upload from 5–8 seconds to under one — on
// phone, laptop, desktop and tablet alike.
// ---------------------------------------------------------------------------

/**
 * Compress an image File with the Canvas API: max `maxPx` on the longest
 * side, JPEG at `quality`. ANY failure (unreadable file, canvas unavailable,
 * encode error) resolves with the ORIGINAL file — compression is an
 * optimisation, never a gate.
 */
export function compressImage(file: File, maxPx = 1200, quality = 0.85): Promise<File> {
  return new Promise((resolve) => {
    try {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      const bail = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(file);
      };
      img.onload = () => {
        try {
          const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext('2d');
          if (!ctx) return bail();
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (blob) => {
              URL.revokeObjectURL(objectUrl);
              if (!blob || blob.size === 0) return resolve(file);
              const jpegName = `${(file.name || 'photo').replace(/\.[a-z0-9]+$/i, '')}.jpg`;
              resolve(new File([blob], jpegName, { type: 'image/jpeg' }));
            },
            'image/jpeg',
            quality,
          );
        } catch {
          bail();
        }
      };
      img.onerror = bail;
      img.src = objectUrl;
    } catch {
      resolve(file);
    }
  });
}

export interface FastUpload { url: string; enhanced: Promise<string | null> }
export interface EnhancedUpload { url: string; enhanced: boolean }

/** Plain fast upload — the file is COMPRESSED client-side first (Pass
 * Forty-Eight: max 1200px, JPEG 0.85 — sub-second instead of 5–8s for a
 * phone photo). The returned URL is the piece's permanent original anchor;
 * the pipeline cleans it in the background. */
/**
 * @param alreadyCompressed Pass `true` when the caller has already run
 *   `compressImage`. `add-piece` compresses on pick so the preview appears
 *   instantly, then handed that same File here — which compressed it a SECOND
 *   time. That is a redundant full decode, canvas redraw and JPEG encode of
 *   every photograph the customer adds, on the main thread, and it degrades
 *   the image twice over: JPEG is lossy, so re-encoding an already-encoded
 *   frame at 0.85 compounds the artefacts for no benefit.
 */
export async function uploadGarmentPhotoFast(file: File, alreadyCompressed = false): Promise<FastUpload> {
  const compressed = alreadyCompressed ? file : await compressImage(file);
  const original = await fileToBase64(compressed);
  const url = await uploadImageData(`data:${original.mimeType};base64,${original.base64}`, compressed.name || 'garment.jpg');
  return { url, enhanced: Promise.resolve(null) };
}

export async function uploadGarmentPhoto(file: File): Promise<EnhancedUpload> {
  const { url } = await uploadGarmentPhotoFast(file);
  return { url, enhanced: false };
}

// ---------------------------------------------------------------------------
// Garment fields — kept for caller compatibility. The Pass Twenty-Five
// pipeline is deterministic (photo in, photo out) and never prompts a model,
// so these fields no longer influence the image — they are retained because
// every add/edit flow passes them and they document what the piece is.
// ---------------------------------------------------------------------------

export interface GarmentFields {
  colors: string[];
  material: string | null;
  pattern?: string | null;
  itemType: string;
  category?: string | null;
  slot?: string | null;
  name?: string | null;
  brand?: string | null;
}

export function garmentFieldsFromPiece(
  piece: Pick<WardrobePiece, 'name' | 'category' | 'slot' | 'colors'> & { brand?: string | null },
  material?: string | null,
  pattern?: string | null,
): GarmentFields {
  return {
    colors: (piece.colors || []).filter(Boolean),
    material: (material || '').trim() || defaultMaterial(piece.slot || null) || null,
    pattern: pattern || null,
    itemType: slotLabel(piece.slot) || piece.name || categoryLabel(piece.category),
    name: piece.name,
    brand: piece.brand || null,
    category: piece.category,
    slot: piece.slot || null,
  };
}

// ---------------------------------------------------------------------------
// Background removal — @imgly/background-removal, client-side, no API key.
// The module is loaded lazily from the CDN on first use; its ONNX/WASM
// assets come from IMG.LY's public CDN (pinned to the same version).
// ---------------------------------------------------------------------------

const IMGLY_VERSION = '1.7.0';
const IMGLY_MODULE_URL = `https://esm.sh/@imgly/background-removal@${IMGLY_VERSION}`;
const IMGLY_PUBLIC_PATH = `https://staticimgly.com/@imgly/background-removal-data/${IMGLY_VERSION}/dist/`;

// Indirect dynamic import so the space compiler/bundler never tries to
// resolve the URL at build time — it stays a native browser import().
const dynamicImport: (url: string) => Promise<any> = new Function('url', 'return import(url)') as any;

let imglyModulePromise: Promise<any> | null = null;

function loadBackgroundRemovalModule(): Promise<any> {
  if (!imglyModulePromise) {
    imglyModulePromise = dynamicImport(IMGLY_MODULE_URL).catch((error: unknown) => {
      imglyModulePromise = null; // allow a retry on the next call
      throw error;
    });
  }
  return imglyModulePromise;
}

/** A cleaned image, as either a URL (https or data:) or inline base64.
 * `provider` records which remover produced the cutout so normalization can
 * gate the alpha-erosion strength on the quality of the mask: Photoroom's
 * segmentation is already clean and needs at most a whisper of erosion,
 * while the local @imgly fallback still needs the full border-artifact
 * cleanup. */
interface CleanImage { url?: string; base64?: string; mimeType?: string; provider?: 'photoroom' | 'imgly' }

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('blob read failed'));
    reader.readAsDataURL(blob);
  });
}

/** Background-removal speed cap (Pass Forty-Six B): if the removal itself
 * takes more than this, the pipeline abandons it and keeps the original
 * image. The one-time model download happens BEFORE the timed window, so a
 * cold cache never eats the budget. */
const REMOVAL_TIMEOUT_MS = 5000;

/** Photoroom's own, LONGER cap (the PHOTOROOM_API_KEY fix): the primary
 * remover uploads the photograph as base64 JSON through the workspace
 * secrets proxy and waits on Photoroom's segmentation — a round-trip that
 * routinely takes more than 5s. The old shared 5s cap silently abandoned
 * perfectly healthy Photoroom calls, which read exactly like "the key
 * isn't working": the piece kept its uncut original. Photoroom now gets a
 * budget that matches its real round-trip, so it runs as the PRIMARY
 * remover whenever the key is available; the fallback below still only
 * engages on genuine Photoroom errors/unavailability. */
const PHOTOROOM_TIMEOUT_MS = 20000;

/**
 * Whether the ~84MB client-side @imgly model may run when Photoroom fails.
 *
 * Off. See the long note in `removeBackgroundFromUrl` — this path was measured
 * consuming 91% of all non-idle CPU in a real session because a misconfigured
 * Photoroom key routed every garment into it.
 */
const ALLOW_CLIENT_SIDE_REMOVAL = false;

/**
 * Reject after `ms`, and — via `onTimeout` — stop the underlying work.
 *
 * This used to stop WAITING without stopping the WORK. A timed-out Photoroom
 * call kept its request open and kept consuming network while the fallback
 * tier started an entirely separate removal for the same photograph, so the
 * two competed for bandwidth and CPU at exactly the moment the pipeline was
 * already behind. Callers now pass an aborter.
 */
function withTimeout<T>(job: Promise<T>, ms: number, label: string, onTimeout?: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      try {
        onTimeout?.();
      } catch { /* aborting is best-effort — never mask the timeout itself */ }
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    job.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// ---------------------------------------------------------------------------
// Photoroom background removal (Pass Forty-Seven) — the PRIMARY remover.
// Photoroom (https://www.photoroom.com/api) is purpose-built for fashion /
// product photography and reads clothing, shoes and accessories far better
// than generic segmentation. The call goes through the workspace SECRETS
// PROXY so the PHOTOROOM_API_KEY secret never reaches the browser; when the
// key is missing or the call fails/times out, the pipeline falls back to the
// client-side @imgly removal below — the flow never breaks.
// ---------------------------------------------------------------------------

const PHOTOROOM_ENDPOINT = 'https://sdk.photoroom.com/v1/segment';

/** Set once the proxy reports the PHOTOROOM_API_KEY secret is missing,
 * disabled or rejected — later pieces skip straight to the client-side
 * fallback instead of burning the 5s budget on a doomed call. */
let photoroomUnavailable = false;

/** Downscale + JPEG-encode an image for the proxied base64 upload — keeps
 * the payload small (Pass Forty-Eight: 1200px / 0.85, matching the client
 * compression spec); output resolution is capped by the 1080×1440 canonical
 * card anyway. */
async function imageToJpegBase64(url: string, maxEdge = 1200): Promise<string> {
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

/** POST the image to Photoroom v1/segment (base64 JSON in, base64 PNG out)
 * through the workspace secrets proxy. Throws on any failure — the caller
 * falls back to client-side removal. */
/**
 * THE CORS TRAP — why Photoroom appeared to be broken.
 *
 * Sending base64 means first drawing the photograph into a canvas, and
 * `loadImage` sets `crossOrigin = 'anonymous'` because a canvas that has been
 * painted with a cross-origin image cannot be read back. Retailer product
 * photography is HOTLINKED — `photo_url` keeps the shop's own URL — and most
 * shops send no `Access-Control-Allow-Origin` header. With `crossOrigin` set,
 * such an image does not merely taint the canvas: it FAILS TO LOAD AT ALL.
 *
 * So `imageToJpegBase64` rejected, `removeBackgroundViaPhotoroom` threw before
 * it ever reached the network, and the piece fell through every tier to "no
 * clean cutout". Photoroom was never called. The garment still appeared in the
 * detail sheet because a plain `<img>` needs no CORS — which is exactly why
 * this looked like a cutout-quality problem rather than a fetch problem.
 *
 * Sending the URL instead moves the fetch server-side, where CORS does not
 * apply, and skips the canvas work altogether. Base64 stays as the fallback
 * for images that are already local (data: and blob: URLs), and for the case
 * where Photoroom cannot reach the URL itself.
 */
async function photoroomRequest(
  json: Record<string, unknown>,
  signal: AbortSignal | undefined,
  ws: any,
): Promise<Response> {
  return fetch(`/api/workspaces/${ws.workspaceId}/secrets/proxy`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', 'X-Workspace-DB-Token': ws.token },
    body: JSON.stringify({
      method: 'POST',
      url: PHOTOROOM_ENDPOINT,
      headers: {
        'x-api-key': '{{secrets.PHOTOROOM_API_KEY}}',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      json,
    }),
  });
}

async function removeBackgroundViaPhotoroom(url: string, signal?: AbortSignal): Promise<CleanImage> {
  if (photoroomUnavailable) throw new Error('Photoroom is unavailable this session');
  const ws = (window as any).__workspaceDb;
  if (!ws?.workspaceId || !ws?.token) throw new Error('workspace token unavailable for the secrets proxy');

  // Remote URL first — no canvas, no CORS, no main-thread pixel work.
  const isRemote = /^https?:\/\//i.test(url.trim());
  let res: Response | null = null;
  if (isRemote) {
    try {
      const attempt = await photoroomRequest({ image_url: url.trim(), format: 'png' }, signal, ws);
      // Only keep this attempt if Photoroom itself accepted the URL form.
      // A 4xx from Photoroom (rather than the proxy) means it did not like
      // the parameter or could not fetch the image — retry as base64 below.
      const peek = attempt.clone();
      const peeked = await peek.json().catch(() => null);
      const upstream = Number(peeked?.status || 0);
      if (attempt.ok && upstream < 300) res = attempt;
    } catch {
      /* fall through to the base64 path */
    }
  }

  if (!res) {
    // Local image, or Photoroom would not take the URL. This path needs the
    // canvas, so it only works for same-origin / CORS-enabled / data: sources.
    const imageB64 = await imageToJpegBase64(url);
    res = await photoroomRequest({ image_file_b64: imageB64, format: 'png' }, signal, ws);
  }
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    // Proxy-level refusal (key missing/disabled, host not allow-listed) is
    // not transient — skip Photoroom for the rest of the session.
    const code = String(payload?.code || payload?.error || '');
    if (/unknown_secret|host_not_allowed|blocked_host|disabled/i.test(code)) photoroomUnavailable = true;
    throw new Error(`Photoroom proxy call failed: ${res.status} ${code}`.trim());
  }
  const status = Number(payload?.status || 0);
  let body = payload?.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch { /* leave as string — handled below */ }
  }
  if (status === 401 || status === 402 || status === 403) {
    photoroomUnavailable = true; // bad key or plan exhausted — fall back for the session
    throw new Error(`Photoroom rejected the key: ${status}`);
  }
  if (status >= 300) throw new Error(`Photoroom returned ${status}`);
  const b64img = typeof body?.base64img === 'string' ? body.base64img.trim() : '';
  if (!b64img) throw new Error('Photoroom returned no image');
  return { base64: b64img, mimeType: 'image/png', provider: 'photoroom' };
}

/**
 * Strip the background from the photo at `url`. Photoroom FIRST — always
 * the primary remover while the PHOTOROOM_API_KEY secret is available
 * (20s-capped — purpose-built for clothing; the call rides the workspace
 * secrets proxy with `{{secrets.PHOTOROOM_API_KEY}}`), then the client-side
 * @imgly removal as the fallback for GENUINE Photoroom errors only.
 * Returns a transparent-background PNG; any failure here makes the caller
 * keep the original image, so nothing ever blocks or breaks.
 */
async function removeBackgroundFromUrl(url: string): Promise<CleanImage> {
  // 1. Photoroom — the primary remover (Pass Forty-Seven).
  const photoroomAbort = new AbortController();
  try {
    return await withTimeout(
      removeBackgroundViaPhotoroom(url, photoroomAbort.signal),
      PHOTOROOM_TIMEOUT_MS,
      'Photoroom background removal',
      // Genuinely cancel the request. Without this the abandoned upload kept
      // running alongside the fallback below, for the same photograph.
      () => photoroomAbort.abort(),
    );
  } catch (photoroomError) {
    console.warn('[Ethaion] Photoroom unavailable:', photoroomError);
  }

  // 2. Fallback — client-side @imgly removal. DISABLED BY DEFAULT.
  //
  // WHY: a DevTools profile of ordinary use measured 73 SECONDS of WebAssembly
  // inference out of a 295-second session — roughly 91% of all non-idle CPU,
  // against 314ms for every canvas operation in this file combined. The cause
  // was Photoroom's secrets proxy returning HTTP 400 (missing or unconfigured
  // API key), which silently routed every single garment into this path.
  //
  // This tier is a trap. It downloads an ~84MB FP16 model plus the ONNX/WASM
  // runtime, then runs inference on the main thread, where it cannot be
  // interrupted. One misconfigured secret therefore turns into a frozen app
  // for every customer, with no error anyone would notice — the images still
  // appear, eventually.
  //
  // Leaving the photograph uncut is strictly better: the piece keeps its
  // original image, the pipeline is not marked settled, and the next visit
  // tries again. A degraded image beats an unusable app.
  //
  // To re-enable (e.g. deliberately, for an offline mode), set this to true.
  // Prefer a server-side retry instead.
  if (!ALLOW_CLIENT_SIDE_REMOVAL) {
    throw new Error(
      'background removal unavailable: Photoroom failed and the client-side ' +
      'model is disabled (see ALLOW_CLIENT_SIDE_REMOVAL in photo-enhance.ts)',
    );
  }

  const mod = await loadBackgroundRemovalModule();
  const removeBackground = mod?.removeBackground || mod?.default;
  if (typeof removeBackground !== 'function') throw new Error('background-removal module unavailable');
  // Hand the library a Blob when we can fetch one (most robust input);
  // fall back to the URL string, which the library also accepts.
  const sourceAbort = new AbortController();
  let input: Blob | string = url;
  try {
    const response = await fetch(url, { signal: sourceAbort.signal });
    if (response.ok) input = await response.blob();
  } catch { /* URL input path below */ }
  const blob: Blob = await withTimeout(
    removeBackground(input, {
      publicPath: IMGLY_PUBLIC_PATH,
      output: { format: 'image/png', quality: 1 },
    }) as Promise<Blob>,
    REMOVAL_TIMEOUT_MS,
    'background removal',
    // Only the source fetch is cancellable here. Once @imgly's WASM inference
    // is under way it cannot be interrupted from the main thread — a further
    // reason this tier is a poor fallback, and why it is worth considering a
    // server-side retry instead of running the model in the browser at all.
    () => sourceAbort.abort(),
  );
  return { url: await blobToDataUrl(blob), provider: 'imgly' };
}

// ---------------------------------------------------------------------------
// Canonical normalization — RETIRED as the stored output (Pass Forty-Nine,
// the universal transparency rule): the piece's canonical image is now the
// GENUINE transparent cutout from trimTransparent, never an opaque paper
// card. normalizeCanonical is kept only as reference for the legacy cards
// still on old rows until the retroactive batch re-cuts them:
//   · 3:4 portrait at a fixed output resolution (1080×1440)
//   · clean #fbf8f1 PAPER background (Pass Forty-Six B) — paper fill FIRST;
//     a background-removed cut-out composites its transparency straight onto
//     it, and any near-white (light grey) background in a non-transparent
//     fallback image is flood-detected from the frame border and repainted
//     the same paper tone
//   · CONTAIN mode only: the garment is containFit into the padded area and
//     centred both horizontally and vertically — never cover, never fill,
//     never crop — with exactly 12px padding on all four sides (CANON_PAD)
// ---------------------------------------------------------------------------

const CANON_W = 1080;
const CANON_H = 1440;
/** Canonical card ground (Pass Forty-Six B) — the design system's #fbf8f1
 * paper, so the garment floats on the page instead of sitting in a white
 * box. PNG export is lossless, so these exact channel values survive. */
const CANON_BG = '#fbf8f1';
const CANON_BG_R = 251;
const CANON_BG_G = 248;
const CANON_BG_B = 241;
/** Padding baked into the canonical image on ALL four sides — exactly 12px,
 * identical for every piece. */
const CANON_PAD = 12;
const BG_LUMINANCE = 0.955;

/**
 * Contain-fit maths: scale source dimensions to fit WITHIN the box while
 * preserving aspect ratio — the garment fills the box along exactly one axis
 * and is centred on the other. Never cover, never fill, never crop.
 */
export function containFit(
  srcW: number,
  srcH: number,
  boxW: number,
  boxH: number,
): { width: number; height: number; scale: number } {
  const scale = Math.min(boxW / Math.max(1, srcW), boxH / Math.max(1, srcH));
  return { width: srcW * scale, height: srcH * scale, scale };
}

/**
 * Pipeline version stamps (stored per piece in piece_photo_norm).
 *
 *  · NORM_VERSION (13) — the stored image is the piece's GENUINE
 *    alpha-channel transparent cutout (Pass Forty-Nine, the universal
 *    transparency rule): background removed, alpha edge eroded ~4px,
 *    tight-cropped to the silhouette + 4px margin, verified on both real
 *    grounds and stored on the CDN. Settled.
 *  · 12 — the Pass Forty-Six B opaque #fbf8f1 paper cards. A solid card is
 *    itself a background box, so these are re-cut into transparent PNGs by
 *    the Pass Forty-Nine retroactive batch.
 *  · 11 — the Pass Twenty-Six pure-white (#FFFFFF) cards.
 *  · 0–10 — legacy: raw uploads, every AI-generated image from passes
 *    ≤ Twenty-Four, and Pass Twenty-Five outputs. ALL of these are re-run
 *    through the pipeline by the one-time retroactive batch.
 */
export const NORM_VERSION = 14;

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

function chromaOf(r: number, g: number, b: number): number {
  return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
}

/** Average colour of the frame's border pixels — the ACTUAL background of a
 * non-transparent image, often near-white light grey rather than #FFFFFF. */
function estimateBackground(data: Uint8ClampedArray, w: number, h: number): { r: number; g: number; b: number } {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const sample = (x: number, y: number) => {
    const o = (y * w + x) * 4;
    r += data[o];
    g += data[o + 1];
    b += data[o + 2];
    n += 1;
  };
  const step = Math.max(1, Math.floor(Math.max(w, h) / 240));
  for (let x = 0; x < w; x += step) {
    sample(x, 0);
    sample(x, h - 1);
  }
  for (let y = 0; y < h; y += step) {
    sample(0, y);
    sample(w - 1, y);
  }
  if (n === 0) return { r: 255, g: 255, b: 255 };
  return { r: r / n, g: g / n, b: b / n };
}

/**
 * Flood-fill the background from the frame border: bright, low-chroma pixels
 * close to the estimated background colour AND connected to the border.
 * Interior garment whites (a white tee's body) are protected because the
 * garment's edge shadows break the connectivity. Returns a mask (1 =
 * background) or null when the border doesn't read as near-white at all.
 */
function floodBackgroundMask(data: Uint8ClampedArray, w: number, h: number): Uint8Array | null {
  const bg = estimateBackground(data, w, h);
  if (lumOf(bg.r, bg.g, bg.b) < 0.8 || chromaOf(bg.r, bg.g, bg.b) > 0.1) return null;
  const isBackground = (o: number): boolean => {
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    if (lumOf(r, g, b) < 0.82 || chromaOf(r, g, b) > 0.08) return false;
    const dr = r - bg.r;
    const dg = g - bg.g;
    const db = b - bg.b;
    return dr * dr + dg * dg + db * db <= 2500;
  };
  const mask = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    const i = y * w + x;
    if (mask[i] || !isBackground(i * 4)) return;
    mask[i] = 1;
    stack.push(i);
  };
  for (let x = 0; x < w; x += 1) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y += 1) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length > 0) {
    const i = stack.pop() as number;
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  return mask;
}

async function normalizeCanonical(image: CleanImage): Promise<string> {
  const src = image.url || `data:${image.mimeType || 'image/png'};base64,${image.base64}`;
  const img = await loadImage(src);
  // Unconditional: no dimension/tolerance short-circuit — every image is
  // redrawn onto the canonical canvas, whatever size it already is.
  const scale = Math.min(1, CANON_H / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const work = document.createElement('canvas');
  work.width = w;
  work.height = h;
  const wctx = work.getContext('2d');
  if (!wctx) throw new Error('canvas 2d context unavailable');

  // PASS 1 — transparent draw: a background-removed cut-out carries an EXACT
  // garment mask in its alpha channel, which beats any colour heuristic.
  wctx.clearRect(0, 0, w, h);
  wctx.drawImage(img, 0, 0, w, h);
  const alphaFrame = wctx.getImageData(0, 0, w, h);
  const alphaData = alphaFrame.data;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  let transparent = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const a = alphaData[(y * w + x) * 4 + 3];
      if (a < 8) {
        transparent += 1;
        continue;
      }
      if (a >= 16) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const alphaMaskUsable = transparent >= w * h * 0.02 && maxX > minX && maxY > minY;

  // Flatten onto the paper ground — the only ground the canonical card has.
  wctx.globalCompositeOperation = 'destination-over';
  wctx.fillStyle = CANON_BG;
  wctx.fillRect(0, 0, w, h);
  wctx.globalCompositeOperation = 'source-over';

  if (!alphaMaskUsable) {
    // PASS 2 — no transparency (the original-photo fallback path, or an old
    // opaque image): find the garment with the border flood-fill, repaint
    // any near-white background the clean #fbf8f1 paper, and box the rest.
    minX = w;
    minY = h;
    maxX = -1;
    maxY = -1;
    const frame = wctx.getImageData(0, 0, w, h);
    const data = frame.data;
    const mask = floodBackgroundMask(data, w, h);
    let masked = 0;
    if (mask) for (let i = 0; i < mask.length; i += 1) masked += mask[i];
    // The mask is only trusted when it found a plausible amount of background
    // AND left a plausible garment — a white garment melting into a white
    // background defeats connectivity, so fall back to the conservative
    // luminance scan instead of mis-whitening the garment itself.
    const maskReliable = !!mask && masked >= w * h * 0.2 && w * h - masked >= w * h * 0.05;
    if (maskReliable && mask) {
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const i = y * w + x;
          if (mask[i]) {
            const o = i * 4;
            data[o] = CANON_BG_R;
            data[o + 1] = CANON_BG_G;
            data[o + 2] = CANON_BG_B;
            data[o + 3] = 255;
          } else {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      wctx.putImageData(frame, 0, 0);
    } else {
      for (let y = 0; y < h; y += 2) {
        for (let x = 0; x < w; x += 2) {
          const o = (y * w + x) * 4;
          if (lumOf(data[o], data[o + 1], data[o + 2]) < BG_LUMINANCE || chromaOf(data[o], data[o + 1], data[o + 2]) > 0.06) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
    }
  }

  // A degenerate box (nothing found, or a sliver) falls back to the full
  // frame rather than mis-cropping — the card geometry stays canonical.
  const boxW = maxX - minX;
  const boxH = maxY - minY;
  if (maxX < 0 || boxW < w * 0.05 || boxH < h * 0.05) {
    minX = 0;
    minY = 0;
    maxX = w - 1;
    maxY = h - 1;
  }
  const pad = Math.round(Math.max(w, h) * 0.01);
  const cropX = Math.max(0, minX - pad);
  const cropY = Math.max(0, minY - pad);
  const cropW = Math.min(w, maxX + pad) - cropX;
  const cropH = Math.min(h, maxY + pad) - cropY;

  // Compose: paper fill FIRST, then the garment containFit into the padded
  // 3:4 frame (CONTAIN — never cover), centred both ways.
  const out = document.createElement('canvas');
  out.width = CANON_W;
  out.height = CANON_H;
  const octx = out.getContext('2d');
  if (!octx) throw new Error('canvas 2d context unavailable');
  octx.fillStyle = CANON_BG;
  octx.fillRect(0, 0, CANON_W, CANON_H);
  const innerW = CANON_W - CANON_PAD * 2;
  const innerH = CANON_H - CANON_PAD * 2;
  const { width: drawW, height: drawH } = containFit(cropW, cropH, innerW, innerH);
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(work, cropX, cropY, cropW, cropH, (CANON_W - drawW) / 2, (CANON_H - drawH) / 2, drawW, drawH);

  // VERIFY: sample five frame pixels — the four corners plus the top-centre.
  // All must be the exact paper tone; if any is not, repaint the frame.
  const cornerPoints: Array<[number, number]> = [
    [2, 2],
    [CANON_W - 3, 2],
    [2, CANON_H - 3],
    [CANON_W - 3, CANON_H - 3],
    [Math.floor(CANON_W / 2), 2],
  ];
  const purePaper = (points: Array<[number, number]>): boolean =>
    points.every(([x, y]) => {
      const p = octx.getImageData(x, y, 1, 1).data;
      return p[0] === CANON_BG_R && p[1] === CANON_BG_G && p[2] === CANON_BG_B;
    });
  if (!purePaper(cornerPoints)) {
    console.warn('[Ethaion] canonical frame corner was not clean paper — repainting the padding frame.');
    octx.fillStyle = CANON_BG;
    octx.fillRect(0, 0, CANON_W, CANON_PAD);
    octx.fillRect(0, CANON_H - CANON_PAD, CANON_W, CANON_PAD);
    octx.fillRect(0, 0, CANON_PAD, CANON_H);
    octx.fillRect(CANON_W - CANON_PAD, 0, CANON_PAD, CANON_H);
    if (!purePaper(cornerPoints)) throw new Error('canonical frame could not be forced to clean paper');
  }

  // PNG export: lossless, so the paper background stays EXACTLY #fbf8f1 —
  // JPEG quantisation was shifting frame pixels off-tone.
  return out.toDataURL('image/png');
}

// ---------------------------------------------------------------------------
// Photo provenance (piece_photo_meta) + original anchors (piece_photo_originals)
// ---------------------------------------------------------------------------

export type PhotoSource = 'pipeline' | 'custom' | 'generated' | 'template' | 'product' | 'original';
export interface PhotoMeta { id: number; piece_id: number; source: PhotoSource }

/** 'pipeline' (cleaned canonical image) and 'custom' (user-chosen) are settled;
 * every legacy value is re-run by the retroactive migration. */
export function isSettledPhotoSource(source?: PhotoSource | string | null): boolean {
  return source === 'pipeline' || source === 'custom';
}

export async function fetchPhotoMeta(): Promise<Record<number, PhotoMeta>> {
  try {
    const { data } = await db().from('piece_photo_meta').orderBy('created_at', 'asc').limit(200).get();
    const output: Record<number, PhotoMeta> = {};
    for (const row of data || []) if (row.piece_id != null) output[Number(row.piece_id)] = row as PhotoMeta;
    return output;
  } catch (error) {
    console.warn('[Ethaion] garment image metadata read failed:', error);
    return {};
  }
}

export async function setPhotoSource(pieceId: number, source: PhotoSource): Promise<void> {
  try {
    const { data } = await db().from('piece_photo_meta').eq('piece_id', pieceId).limit(2).get();
    const existing = data?.[0];
    if (existing) await db().from('piece_photo_meta').update(existing.id, { source });
    else await db().from('piece_photo_meta').insert({ piece_id: pieceId, source });
  } catch (error) {
    console.warn('[Ethaion] garment image metadata write failed:', error);
  }
}

export async function clearPhotoSource(pieceId: number): Promise<void> {
  try {
    const { data } = await db().from('piece_photo_meta').eq('piece_id', pieceId).limit(5).get();
    for (const row of data || []) await db().from('piece_photo_meta').delete(row.id);
  } catch { /* non-fatal companion cleanup */ }
}

export async function fetchPhotoOriginals(): Promise<Record<number, string>> {
  try {
    const { data } = await db().from('piece_photo_originals').orderBy('created_at', 'asc').limit(200).get();
    const output: Record<number, string> = {};
    for (const row of data || []) {
      if (row.piece_id != null && typeof row.original_url === 'string' && row.original_url) {
        output[Number(row.piece_id)] = row.original_url;
      }
    }
    return output;
  } catch (error) {
    console.warn('[Ethaion] original photo read failed:', error);
    return {};
  }
}

/** Persist (or replace) a piece's original uploaded photo — the permanent anchor. */
export async function setPhotoOriginal(pieceId: number, originalUrl: string): Promise<void> {
  try {
    const { data } = await db().from('piece_photo_originals').eq('piece_id', pieceId).limit(2).get();
    const existing = data?.[0];
    if (existing) await db().from('piece_photo_originals').update(existing.id, { original_url: originalUrl });
    else await db().from('piece_photo_originals').insert({ piece_id: pieceId, original_url: originalUrl });
  } catch (error) {
    console.warn('[Ethaion] original photo write failed:', error);
  }
}

async function fetchPhotoOriginal(pieceId: number): Promise<string> {
  try {
    const { data } = await db().from('piece_photo_originals').eq('piece_id', pieceId).limit(1).get();
    const url = data?.[0]?.original_url;
    return typeof url === 'string' ? url : '';
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Normalization stamps (piece_photo_norm) — which version of the pipeline
// each piece's STORED image was produced by. Any piece stamped below
// NORM_VERSION is eligible for the retroactive batch.
// ---------------------------------------------------------------------------

export async function fetchNormVersions(): Promise<Record<number, number>> {
  try {
    const { data } = await db().from('piece_photo_norm').orderBy('created_at', 'asc').limit(200).get();
    const output: Record<number, number> = {};
    for (const row of data || []) if (row.piece_id != null) output[Number(row.piece_id)] = Number(row.norm_version) || 0;
    return output;
  } catch (error) {
    console.warn('[Ethaion] normalization stamp read failed:', error);
    return {};
  }
}

async function setNormVersion(pieceId: number, version: number): Promise<void> {
  try {
    const { data } = await db().from('piece_photo_norm').eq('piece_id', pieceId).limit(2).get();
    const existing = data?.[0];
    if (existing) await db().from('piece_photo_norm').update(existing.id, { norm_version: version });
    else await db().from('piece_photo_norm').insert({ piece_id: pieceId, norm_version: version });
  } catch (error) {
    console.warn('[Ethaion] normalization stamp write failed:', error);
  }
}

// ---------------------------------------------------------------------------
// Regeneration — one piece through background removal + normalization; the
// previous image is kept visible until the new one is ready (no blank state)
// ---------------------------------------------------------------------------

const regeneratingIds = new Set<number>();
const regenListeners = new Set<() => void>();
function notifyRegen(): void { for (const listener of regenListeners) listener(); }
export function isRegenerating(pieceId: number): boolean { return regeneratingIds.has(pieceId); }
export function onRegenChange(listener: () => void): () => void {
  regenListeners.add(listener);
  return () => regenListeners.delete(listener);
}

function isHttpImage(url?: string | null): boolean {
  return !!url && /^https?:\/\//i.test(url.trim());
}

/**
 * Run one piece through THE ONE ingestion pipeline (Pass Forty-Nine — the
 * universal transparency rule). Anchor priority: explicit anchor → stored
 * original upload → whatever image is on the row. Pieces with NO photo at
 * all are left alone (their placeholder tile stays — nothing is
 * AI-generated any more). On success the piece's canonical image becomes
 * the STORED GENUINE transparent cutout (background removed, alpha edge
 * eroded ~4px, tight-cropped to the silhouette + 4px margin, verified on
 * both real grounds) and its URL is returned; on failure the previous
 * image is left untouched and null is returned.
 *
 * `fields` carries the piece's category and name into the stored cutout
 * record — the image itself is always the real photo cut out, never a
 * description.
 */
export async function regeneratePieceImage(
  pieceId: number,
  fields: GarmentFields,
  options: { anchorUrl?: string | null; forceReprocess?: boolean } = {},
): Promise<string | null> {
  if (regeneratingIds.has(pieceId)) return null;
  regeneratingIds.add(pieceId);
  setGarmentRegenerating(pieceId, true);
  notifyRegen();
  try {
    let anchorUrl = (options.anchorUrl || '').trim();
    if (!anchorUrl) anchorUrl = await fetchPhotoOriginal(pieceId);
    if (!anchorUrl) {
      try {
        const { data } = await db().from('wardrobe_pieces').eq('id', pieceId).limit(1).get();
        const stored = data?.[0]?.photo_url;
        if (isHttpImage(stored)) anchorUrl = String(stored).trim();
      } catch { /* row read is best-effort */ }
    }
    // No photo → nothing to process. The quiet placeholder tile stays; no
    // AI generation of any kind (Pass Twenty-Five removes it entirely).
    if (!anchorUrl) return null;

    // THE ONE INGESTION PIPELINE (Pass Forty-Nine — the universal
    // transparency rule). The user-upload path now runs the SAME four steps
    // the online-sourcing path runs: background removal (Photoroom, then
    // the client-side fallback), ~4px alpha-edge EROSION (border-artifact
    // cleanup), TIGHT CROP to the silhouette + 4px, quality + vision
    // verification on both real grounds, and durable storage as a GENUINE
    // alpha-channel transparent PNG with an `image_cutouts` row pointing at
    // it. That stored cutout IS the piece's canonical image — the one file
    // every surface shows. No opaque paper card is produced any more: a
    // solid card was itself the white/solid background box the founder's
    // rule forbids, and it is what read as a faint rectangle around items.
    const asset = await flatLayAssetFor({
      candidates: anchorUrl,
      category: fields.category ?? null,
      name: fields.name ?? null,
      pieceId,
      forceReprocess: options.forceReprocess,
    });
    // Every tier failed, or the finished cut never reached the CDN (a data
    // URL must not be written into the row): the previous image is kept
    // untouched — the display surfaces present it as an honestly plated
    // photograph, never as fake transparency, and a later visit tries again.
    if (!asset.ready || !/^https?:\/\//i.test(asset.url)) {
      console.warn('[Ethaion] transparent ingestion produced no stored cutout — previous image kept.');
      return null;
    }
    const finalUrl = asset.url;

    await db().from('wardrobe_pieces').update(pieceId, { photo_url: finalUrl });
    await setPhotoSource(pieceId, 'pipeline');
    await setNormVersion(pieceId, NORM_VERSION);
    registerGarmentImage(pieceId, finalUrl);
    return finalUrl;
  } catch (error) {
    console.warn('[Ethaion] garment image pipeline failed (previous image kept):', error);
    return null;
  } finally {
    regeneratingIds.delete(pieceId);
    setGarmentRegenerating(pieceId, false);
    notifyRegen();
  }
}

// ---------------------------------------------------------------------------
// BOARD CUTOUTS (Fitting overhaul, Part 3.5) — Reserve pieces and Beau's
// picks are retail photography: they arrive on studio-white or lifestyle
// backgrounds that fight each other the moment two of them sit on the same
// outfit canvas. Before a piece is drawn on the Fitting BOARD (not on the
// shelf thumbnails, which stay cheap), its image is run through the same
// remover the wardrobe uses.
//
// TRANSPARENT, NOT PAPER: a board cutout is deliberately NOT put through the
// canonical paper normalization the wardrobe's stored images use. Flattening
// onto #fbf8f1 is what left the flat-lay reading as a stack of product shots
// inside pale rectangles; overlapping cutouts on a genuinely transparent
// ground are what make it read as clothes laid out on a bed. The cut is
// trimmed hard to its alpha bounding box so nothing carries invisible padding
// that pushes neighbouring pieces apart.
//
// The result is a data URL held in memory only — nothing is uploaded and
// nothing is billed to storage, because a board image is transient. A piece
// whose removal fails keeps its original image: never a blank plate.
// ---------------------------------------------------------------------------

/** Longest edge of a board cutout — the flat-lay never draws a piece wider
 * than ~60% of a 520px canvas, so anything beyond this is wasted bytes. */
const CUTOUT_MAX_EDGE = 900;

/** The tight crop's margin — a FIXED four pixels of clear space on each side
 * of the item's bounding box, so nothing gets clipped at the very edge. The
 * old 7%-of-the-crop band (and the category-aspect canvas the crop was then
 * centred on) is retired: it stored items floating in inflated canvases whose
 * invisible margins made every proportional-sizing calculation size the
 * canvas rather than the item, and made the Today tray taller than its
 * contents. The stored PNG is now barely bigger than the silhouette itself;
 * the breathing room a composition needs is the LAYOUT's business, not the
 * file's. */
const TIGHT_CROP_PAD_PX = 4;

/** How far the alpha edge is eroded after removal, in pixels. Background
 * removal only removes background-COLOURED regions, so a thin border/frame
 * stroke a retailer or scraper baked into the source photograph (a
 * different colour from the ground) survives the pass and reads as a faint
 * rectangle around the item. Shrinking the opaque region by ~4px eats those
 * hairline artifacts — and the white fringe removal sometimes leaves — while
 * costing the garment itself nothing visible.
 *
 * PROVIDER-GATED (the white-garment fix): this full-strength erosion exists
 * for the local @imgly fallback, whose masks keep retailer-baked borders and
 * fringes. Photoroom's segmentation is already clean — running 4px of
 * erosion on it visibly ate into white and near-white garments — so a
 * Photoroom cut gets only the minimal pass below. */
const ALPHA_ERODE_PX = 4;

/** Erosion applied when Photoroom produced the mask — a single pixel, just
 * enough to soften any residual fringe without eating the garment. */
const PHOTOROOM_ERODE_PX = 1;

/**
 * GRAYSCALE EROSION of the alpha channel — each pass replaces every pixel's
 * alpha with the minimum of its 3×3 neighbourhood (the canvas equivalent of
 * PIL's `ImageFilter.MinFilter(3)`), shrinking the opaque region ~1px inward
 * per iteration. Run on the raw alpha rather than a binary mask so the
 * antialiased edge stays soft instead of being cut to a hard stair-step.
 * Separable (horizontal pass then vertical pass), so it is O(pixels) per
 * iteration rather than O(pixels × kernel).
 */
function erodeAlpha(data: Uint8ClampedArray, w: number, h: number, iterations: number): void {
  const current = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i += 1) current[i] = data[i * 4 + 3];
  const scratch = new Uint8Array(w * h);
  for (let pass = 0; pass < iterations; pass += 1) {
    // Horizontal min — left/self/right.
    for (let y = 0; y < h; y += 1) {
      const row = y * w;
      for (let x = 0; x < w; x += 1) {
        let m = current[row + x];
        if (x > 0 && current[row + x - 1] < m) m = current[row + x - 1];
        if (x < w - 1 && current[row + x + 1] < m) m = current[row + x + 1];
        scratch[row + x] = m;
      }
    }
    // Vertical min — above/self/below.
    for (let y = 0; y < h; y += 1) {
      const row = y * w;
      for (let x = 0; x < w; x += 1) {
        let m = scratch[row + x];
        if (y > 0 && scratch[row - w + x] < m) m = scratch[row - w + x];
        if (y < h - 1 && scratch[row + w + x] < m) m = scratch[row + w + x];
        current[row + x] = m;
      }
    }
  }
  for (let i = 0; i < w * h; i += 1) data[i * 4 + 3] = current[i];
}

/**
 * HOLLOW-FRAME REMOVAL — the second half of the border-artifact cleanup
 * (pipeline v5). The ~4px erosion above eats HAIRLINE frame strokes; a
 * heavier baked-in border — the 3–6px rectangle a retailer or scraper drew
 * around the source photograph, in a colour the background remover has no
 * reason to touch — survives it and reads as a dark line around the item on
 * BOTH grounds. Structurally such a frame is its own connected region of
 * opaque pixels: it spans almost the whole frame in both directions yet
 * fills almost none of its own bounding box. This pass labels the alpha
 * channel's connected regions and clears every region that reads as a
 * hollow rectangle — whatever its thickness — leaving the garment alone.
 * Conservative by construction: a garment, a pair of shoes, a belt or a
 * pair of sunglasses all fill far more of their own bounding box than a
 * frame line ever can, and if EVERY region reads as a frame nothing is
 * stripped (that is a judgement failure, not a cleanup).
 */
function stripFrameComponents(data: Uint8ClampedArray, w: number, h: number): void {
  const total = w * h;
  const labels = new Int32Array(total);
  const queue = new Int32Array(total);
  let label = 0;
  const comps: Array<{ label: number; area: number; minX: number; minY: number; maxX: number; maxY: number }> = [];
  for (let start = 0; start < total; start += 1) {
    if (labels[start] !== 0 || data[start * 4 + 3] < 16) continue;
    label += 1;
    labels[start] = label;
    queue[0] = start;
    let head = 0;
    let tail = 1;
    let area = 0;
    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    while (head < tail) {
      const idx = queue[head];
      head += 1;
      area += 1;
      const x = idx % w;
      const y = (idx - x) / w;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && labels[idx - 1] === 0 && data[(idx - 1) * 4 + 3] >= 16) {
        labels[idx - 1] = label;
        queue[tail] = idx - 1;
        tail += 1;
      }
      if (x < w - 1 && labels[idx + 1] === 0 && data[(idx + 1) * 4 + 3] >= 16) {
        labels[idx + 1] = label;
        queue[tail] = idx + 1;
        tail += 1;
      }
      if (y > 0 && labels[idx - w] === 0 && data[(idx - w) * 4 + 3] >= 16) {
        labels[idx - w] = label;
        queue[tail] = idx - w;
        tail += 1;
      }
      if (y < h - 1 && labels[idx + w] === 0 && data[(idx + w) * 4 + 3] >= 16) {
        labels[idx + w] = label;
        queue[tail] = idx + w;
        tail += 1;
      }
    }
    comps.push({ label, area, minX, minY, maxX, maxY });
  }
  if (comps.length < 2) return; // one region — nothing separable to strip
  const drop = new Set<number>();
  for (const c of comps) {
    const bw = c.maxX - c.minX + 1;
    const bh = c.maxY - c.minY + 1;
    const fill = c.area / Math.max(1, bw * bh);
    // A hollow rectangle: spans most of the frame in BOTH directions but
    // fills a sliver of its own bounding box — no garment does that.
    if (bw >= w * 0.6 && bh >= h * 0.6 && fill < 0.18) drop.add(c.label);
  }
  if (drop.size === 0 || drop.size === comps.length) return;
  for (let i = 0; i < total; i += 1) {
    if (drop.has(labels[i])) data[i * 4 + 3] = 0;
  }
}

/**
 * THE NORMALIZATION STEP — run ONCE at ingestion, never at render time.
 * Three things happen here, in order:
 *
 *   1. BORDER-ARTIFACT CLEANUP — the alpha channel is eroded ~4px inward
 *      (`erodeAlpha`), which removes the thin rectangular border/frame
 *      strokes that survive background removal when the source photograph
 *      had one baked in, along with any 1–2px white fringe.
 *   2. TIGHT CROP — the frame is cropped to the item's alpha bounding box
 *      plus a fixed 4px margin. The stored PNG's dimensions are as close as
 *      possible to the item's actual silhouette: no floating in a large
 *      canvas, no category-aspect padding, no invisible margins to throw off
 *      proportional sizing or inflate the tray.
 *   3. The cropped pixel dimensions come back with the PNG so Step 4 can
 *      store them — the frontend then computes the item's aspect ratio
 *      without loading the image.
 *
 * STEP 3 RIDES ALONG WITH IT. The alpha channel is right here, already read
 * into a canvas, so this is where the cut is JUDGED (image-pipeline
 * `assessCutout`): a verdict of `failed` throws, which drops the caller
 * through to the next tier, and an `imperfect` verdict comes back alongside
 * the PNG so the caller can flag it for review instead of auto-publishing it
 * into a composition.
 */
async function trimTransparent(
  image: CleanImage,
): Promise<{ dataUrl: string; quality: CutoutQuality; croppedWidth: number; croppedHeight: number }> {
  const src = image.url || `data:${image.mimeType || 'image/png'};base64,${image.base64}`;
  const img = await loadImage(src);
  const scale = Math.min(1, CUTOUT_MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const work = document.createElement('canvas');
  work.width = w;
  work.height = h;
  const wctx = work.getContext('2d');
  if (!wctx) throw new Error('canvas 2d context unavailable');
  wctx.clearRect(0, 0, w, h);
  wctx.drawImage(img, 0, 0, w, h);
  const frame = wctx.getImageData(0, 0, w, h);
  const { data } = frame;
  // 1 — BORDER-ARTIFACT CLEANUP: erode the alpha edge (hairline strokes and
  // white fringe), then clear any surviving hollow-rectangle frame region
  // outright — whatever its thickness — and write the cleaned frame back so
  // the crop below ships the cleaned pixels. The erosion strength is gated
  // on the provider that produced the mask: Photoroom's cut is already clean
  // (full-strength erosion ate into white garments), so it gets the minimal
  // 1px pass; the @imgly fallback — and any image whose provider is unknown,
  // e.g. the erosion-remediation retry — keeps the full cleanup.
  const erodePx = image.provider === 'photoroom' ? PHOTOROOM_ERODE_PX : ALPHA_ERODE_PX;
  if (erodePx > 0) erodeAlpha(data, w, h, erodePx);
  stripFrameComponents(data, w, h);
  wctx.putImageData(frame, 0, 0);
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (data[(y * w + x) * 4 + 3] >= 16) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  // STEP 3 — VERIFY THE CUT. Fully opaque (the remover handed back the
  // original, or recoloured the ground) and fully empty are both `failed`
  // rather than cutouts, so they throw and the tier pipeline moves on. A
  // fringed, part-cut or ghosted result is `imperfect`: a real transparent
  // PNG, returned with its reasons so the caller flags it for review.
  if (maxX <= minX || maxY <= minY) throw new Error('background removal produced no usable cutout');
  const quality = assessCutout(data, w, h);
  if (quality.verdict === 'failed') {
    throw new Error(`background removal produced no clean cutout: ${quality.reasons.join(', ')}`);
  }
  // 2 — TIGHT CROP: the bounding box plus a fixed 4px margin, clamped to the
  // frame. The output canvas IS the crop — nothing re-centres it on a larger
  // proportion, so the stored file is barely bigger than the item itself.
  const left = Math.max(0, minX - TIGHT_CROP_PAD_PX);
  const top = Math.max(0, minY - TIGHT_CROP_PAD_PX);
  const right = Math.min(w, maxX + 1 + TIGHT_CROP_PAD_PX);
  const bottom = Math.min(h, maxY + 1 + TIGHT_CROP_PAD_PX);
  const cw = right - left;
  const ch = bottom - top;
  const out = document.createElement('canvas');
  out.width = Math.max(1, cw);
  out.height = Math.max(1, ch);
  const octx = out.getContext('2d');
  if (!octx) throw new Error('canvas 2d context unavailable');
  octx.clearRect(0, 0, out.width, out.height);
  octx.drawImage(work, left, top, cw, ch, 0, 0, cw, ch);
  return { dataUrl: out.toDataURL('image/png'), quality, croppedWidth: out.width, croppedHeight: out.height };
}

/** URLs known to be OUR transparent cutouts (uploaded PNGs with real alpha).
 * Populated when a cutout is persisted and when one is read back from the
 * localStorage cache, so recognition survives reloads. */
const knownCutoutUrls = new Set<string>();

/** True when a board image is one of our own transparent cutouts rather than
 * a source photograph we could not cut — the flat-lay draws the two
 * differently (a cutout needs no blend trick to sit on the canvas). */
export function isTransparentCutout(url: string): boolean {
  const clean = (url || '').trim();
  if (/^data:image\/png/i.test(clean)) return true;
  if (knownCutoutUrls.has(clean)) return true;
  // The durable store's answer. The platform renames uploads (a stored
  // cutout lands at a UUID filename), so no filename pattern can identify
  // one — a cutout URL met in persisted state (a saved outfit's pieces
  // JSON, a restored board) is recognised through the image_cutouts rows
  // instead. Without this, a genuine transparent PNG read back after a
  // reload was mistaken for a photograph and PLATED onto a solid ground.
  if (isStoredCutoutUrl(clean)) return true;
  // Our own upload names carry a timestamp and a content hash between the
  // stem and the extension — the pattern must span them.
  return /board-cutout-[a-z0-9.-]+\.png/i.test(clean);
}

// ---------------------------------------------------------------------------
// THE THREE-TIER PIPELINE. CSS mix-blend-mode was never a treatment at all —
// it is display-layer only, it tints off-white grounds, it leaves lifestyle
// backgrounds completely intact and it falls apart the moment the ground
// underneath is dark. So every product image bound for a composition goes
// through REAL image processing instead, stopping at the FIRST CLEAN RESULT:
//
//  TIER 1 — product-only shot, background removed. Beau routinely sources
//    SEVERAL framings for one item; Step 1 (image-pipeline
//    `selectSourceImage`) classifies them — person yes/no, plain background
//    yes/no — and the isolated one is chosen BEFORE anything is removed. The
//    chosen shot goes to the server-side remover (Photoroom via the secrets
//    proxy — the remove.bg class of API), with the client-side @imgly model
//    as the no-key fallback → transparent PNG. High confidence.
//  TIER 2 — shot WITH a person: no product-only option existed, so the same
//    removal runs on the best framing there is — the person stays, the
//    background goes → styled editorial result on transparency. A usable
//    thumbnail, never a flat-lay item.
//  TIER 3 — garment isolation, LAST RESORT: when removal fails or returns
//    an unclean result, a fashion-segmentation-style image transform isolates
//    JUST the garment onto a white ground, which is flooded transparent
//    and trimmed. Tier 3 results may read slightly body-shaped — accepted,
//    and flagged low-confidence.
//
// NORMALIZATION + VERIFICATION (trimTransparent, after whichever tier
// succeeded): erode the alpha edge ~4px (removing thin border/frame
// artifacts that survive removal), TIGHT-CROP to the item's bounding box
// with a fixed 4px margin — the stored PNG is barely bigger than the
// silhouette itself — and JUDGE the alpha channel (Step 3's first half).
// The finished cut is then VERIFIED BY A VISION MODEL (Step 3's second half
// — single product only, no unrelated fragments, checked composited on both
// the light and the dark ground) before it may be published into a
// composition. Its cropped pixel dimensions are stored with it, so a board
// can compute its aspect ratio without loading the image. All of it happens
// ONCE, at ingestion — never at render time.
//
// FAILURE: an item that fails all three tiers comes back ready:false with
// its original url. A flat-lay must EXCLUDE it (or lay it out plainly,
// without overlap) rather than force a real background into the
// composition. Nothing ever becomes a blank plate.
//
// STORAGE (Step 4): a finished cutout is uploaded once to the same platform
// object storage / CDN every other image uses, and the source→cutout mapping
// plus its verdicts are written to the `image_cutouts` table (with
// localStorage as the fast local mirror). That row is why a piece is never
// re-processed — not on a later render, not on a later visit, and not on a
// different device.
// ---------------------------------------------------------------------------

// v4: matches CUTOUT_PIPELINE_VERSION 4 (the vision-verification remediation
// pass) — the prefix bump orphans the older mappings so a cut that was
// flagged under v3 re-ingests once with the remediation instead of being
// served forever from this legacy mapping. v5 bumps it again so every cut
// re-ingests through the hollow-frame removal pass (border-artifact fix).
// v6: matches CUTOUT_PIPELINE_VERSION 6 — the white-on-white remediation. The
// prefix bump orphans every v5 mapping so cuts made while Photoroom was
// unavailable (and then damaged by the white flood fill) are re-ingested once
// through Photoroom instead of being served from this mirror forever.
const CUTOUT_STORE_PREFIX = 'ethaion_board_cutout_v6_';

/** FNV-1a hex — a short stable key for a source URL. */
function cutoutHash(source: string): string {
  let h = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    h ^= source.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function readStoredCutout(source: string): string | null {
  try {
    const value = localStorage.getItem(CUTOUT_STORE_PREFIX + cutoutHash(source));
    if (value && /^https?:\/\//i.test(value)) {
      knownCutoutUrls.add(value);
      return value;
    }
    return null;
  } catch {
    return null;
  }
}

function storeCutout(source: string, url: string): void {
  if (!/^https?:\/\//i.test(url)) return; // data URLs stay in memory only
  try {
    localStorage.setItem(CUTOUT_STORE_PREFIX + cutoutHash(source), url);
  } catch { /* storage unavailable — the memory cache still holds it */ }
}

/** Upload a finished cutout so it never re-processes — falls back to the
 * in-memory data URL when the upload fails (still cached for the session). */
async function persistCutout(source: string, dataUrl: string): Promise<string> {
  try {
    // CACHE-BUSTING: the timestamp keeps a RE-CUT of the same source (a
    // pipeline-version bump) from sharing a filename with the old cut — a
    // stable name is what lets a cache serve the outdated image.
    const uploaded = await uploadImageData(dataUrl, `board-cutout-${cutoutHash(source)}-${Date.now()}.png`);
    knownCutoutUrls.add(uploaded);
    storeCutout(source, uploaded);
    return uploaded;
  } catch (error) {
    console.warn('[Ethaion] cutout upload failed — keeping the session copy:', error);
    return dataUrl;
  }
}

/**
 * TIER-3 STEP 2 — garment isolation: a fashion-segmentation-style
 * image-to-image transform that extracts JUST the garment onto a clean
 * white ground (the platform's image transform endpoint, base64 in/out).
 */
async function isolateGarmentViaSegmentation(url: string, hasPerson: boolean | null): Promise<CleanImage> {
  const base64 = await imageToJpegBase64(url);
  const prompt =
    hasPerson === false
      ? 'Isolate the product in this photograph: the exact same item, completely unchanged in colour, pattern and shape, alone on a pure solid white (#FFFFFF) background with no shadows, no props and no text.'
      : 'Extract ONLY the garment from this photograph: remove the person/model entirely and show just the item of clothing, keeping its exact colour, pattern and shape, on a pure solid white (#FFFFFF) background with no shadows, no props and no text.';
  const res = await fetch('/api/generate/image-to-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      image: base64,
      mimeType: 'image/jpeg',
      style: 'clean e-commerce pack shot, garment only, pure white background, no shadows',
      returnBase64: true,
    }),
  });
  if (!res.ok) throw new Error(`garment isolation failed: ${res.status}`);
  const data = await res.json();
  if (!data?.success || typeof data?.imageBase64 !== 'string' || !data.imageBase64) {
    throw new Error(String(data?.error || 'garment isolation returned no image'));
  }
  return { base64: data.imageBase64, mimeType: data.mimeType || 'image/png' };
}

/**
 * TIER-3 STEP 3 — white ground → transparency: flood the border-connected
 * near-white background transparent (the same flood mask the canonical
 * pipeline trusts), so the isolated garment lands as a true cutout.
 */
async function whiteToTransparent(image: CleanImage): Promise<CleanImage> {
  const src = image.url || `data:${image.mimeType || 'image/png'};base64,${image.base64}`;
  const img = await loadImage(src);
  const scale = Math.min(1, CUTOUT_MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const frame = ctx.getImageData(0, 0, w, h);
  const mask = floodBackgroundMask(frame.data, w, h);
  if (!mask) throw new Error('isolated image has no white ground to remove');
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i]) frame.data[i * 4 + 3] = 0;
  }
  ctx.putImageData(frame, 0, 0);
  return { url: canvas.toDataURL('image/png') };
}

// ---------------------------------------------------------------------------
// STEP 1 — SOURCE SELECTION. The rule itself lives in image-pipeline.ts
// (`selectSourceImage`), because it is the app's rule and not this remover's
// private step: it classifies each candidate photograph with a vision model —
// is a person visible, is the background plain — and returns the framing that
// satisfies "no person AND plain background", tiebroken on resolution and
// then centring, with the best available ON-BODY shot as the flagged
// fallback. The answers are stored per image, so the same photograph is never
// classified twice on any device.
//
// These wrappers keep the older two-value shape the wardrobe's add-by-search
// flow reads (it stores ONE photograph rather than a cutout, so it wants the
// choice without the cutting).
// ---------------------------------------------------------------------------

/** What the selection found. `conclusive` is the important half: it separates
 * "every framing on offer has a model in it" — a FINDING, and the one that
 * must keep the item out of a flat-lay — from "the classifier could not read
 * them", which is merely an absence of information. */
export interface ProductOnlyChoice {
  /** The framing with nobody in it. '' when there is none. */
  url: string;
  /** true when at least one framing was actually read. */
  conclusive: boolean;
}

/** THE SOURCE PREFERENCE — given the framings Beau sourced for one item,
 * best-ranked first, the best one with no person in it. */
export async function chooseProductOnlyShot(candidates: string[]): Promise<ProductOnlyChoice> {
  const selection = await selectSourceImage(candidates).catch(() => null);
  if (!selection) return { url: '', conclusive: false };
  return { url: selection.person === false ? selection.url : '', conclusive: selection.conclusive };
}

/** The preference as a bare url — '' collapsed to null for the callers that
 * only want the better of two photographs. */
export async function preferProductOnlyShot(candidates: string[]): Promise<string | null> {
  return (await chooseProductOnlyShot(candidates)).url || null;
}

// ---------------------------------------------------------------------------
// THE FLAT-LAY ASSET — the ingested, normalized, flat-lay-ready cutout plus
// the metadata a composition needs to decide whether it can use it.
// ---------------------------------------------------------------------------

/** 1 isolated product shot · 2 on-body, background removed · 3 the garment
 * segmented off the model · 0 every tier failed. */
export type FlatLayTier = 0 | 1 | 2 | 3;

export interface FlatLayAsset {
  /** The STORED transparent PNG — or the untouched source when every tier
   * failed. It is a CDN URL like any other image on the page. */
  url: string;
  tier: FlatLayTier;
  /**
   * A CLEANED asset the caller can paint. False means every tier failed and
   * the url still carries a real background.
   */
  ready: boolean;
  /**
   * Safe to place in an OVERLAPPING FLAT-LAY. Tier 2 is the case the whole
   * sourcing rule exists to catch: the only photography that exists for this
   * product has a model in it, so the cut still shows a foot in a loafer
   * rather than the loafer. It is a usable THUMBNAIL and never a flat-lay
   * item — the board must hold it out and name it instead of forcing it into
   * the composition. A cut FLAGGED by Step 3 is held out the same way.
   */
  flatLayReady: boolean;
  /** Tier 2 and tier 3 results can read body-shaped, and so can a cut taken
   * from the only photograph available when that one had a model in it; they
   * are flagged low so a surface can prefer higher-confidence pieces. */
  confidence: 'high' | 'medium' | 'low' | 'none';
  /** STEP 1's verdict on the photograph that was cut: 'good' when a
   * person-free framing was found, 'low' when only an on-body one existed. */
  sourceQuality: 'good' | 'low' | 'unknown';
  /** STEP 3's verdict on the cut itself. */
  cutoutQuality: CutoutVerdict;
  /** True when the cut must NOT be auto-published into a composition view —
   * it goes to the manual review list and the surface shows the plain
   * fallback presentation instead. */
  needsReview: boolean;
  /** Why, in machine terms: 'fringing', 'edge-clipped', 'ghosting',
   * 'on-body-source-only'. */
  reviewReasons: string[];
  /** The category the asset was normalized onto. */
  category: string | null;
  /** The image it was cut from — the cache key. */
  source: string;
  /** Pixel dimensions of the stored tight-cropped PNG (pipeline v3+) — the
   * item's true silhouette plus a fixed 4px margin. A composition surface
   * uses them to compute the item's aspect ratio (and so its render width
   * from its category-derived height) without loading the image first.
   * null/undefined on assets cut before v3 or kept in session memory only. */
  croppedWidth?: number | null;
  croppedHeight?: number | null;
}

/**
 * WHICH CUTS MAY LIE IN AN OVERLAPPING FLAT-LAY. Two conditions, and both are
 * about honesty rather than taste: the model has to be gone (tier 1's
 * isolated shot, or tier 3's garment lifted off the body — tier 2 kept the
 * person), and Step 3 has to have passed the cut. A fringed or half-cut PNG
 * is real transparency and still reads wrong in a composition, so it is held
 * out and presented plainly instead.
 */
function isComposable(tier: FlatLayTier, needsReview: boolean): boolean {
  return (tier === 1 || tier === 3) && !needsReview;
}

/** Confidence is Step 1 and Step 3 together: a clean cut of a person-free,
 * plain-ground photograph is the only 'high' there is. */
function confidenceFor(
  tier: FlatLayTier,
  sourceQuality: FlatLayAsset['sourceQuality'],
  cutoutQuality: CutoutVerdict,
): FlatLayAsset['confidence'] {
  if (tier === 0) return 'none';
  if (tier !== 1 || cutoutQuality !== 'clean') return 'low';
  return sourceQuality === 'good' ? 'high' : 'medium';
}

/** The asset for an item nothing could be cut for — it keeps whatever
 * photograph it arrived with, and every composition view holds it out. */
function uncutAsset(source: string, category: string | null, needsReview: boolean): FlatLayAsset {
  return {
    url: source,
    tier: 0,
    ready: false,
    flatLayReady: false,
    confidence: 'none',
    sourceQuality: 'unknown',
    cutoutQuality: 'failed',
    needsReview,
    reviewReasons: needsReview ? ['no-clean-cutout'] : [],
    category,
    source,
  };
}

/** The tier a finished cutout came from, alongside the cutout URL itself.
 * Kept in its own record so the existing cutout cache stays valid — nothing
 * already processed is thrown away and re-billed. */
const FLAT_LAY_META_PREFIX = 'ethaion_flatlay_meta_v1_';

function readStoredMeta(source: string): { tier: FlatLayTier; category: string | null } | null {
  try {
    const raw = localStorage.getItem(FLAT_LAY_META_PREFIX + cutoutHash(source));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { t?: number; c?: string | null };
    const tier = [0, 1, 2, 3].includes(Number(parsed?.t)) ? (Number(parsed.t) as FlatLayTier) : 1;
    return { tier, category: typeof parsed?.c === 'string' ? parsed.c : null };
  } catch {
    return null;
  }
}

function storeMeta(source: string, tier: FlatLayTier, category: string | null): void {
  try {
    localStorage.setItem(FLAT_LAY_META_PREFIX + cutoutHash(source), JSON.stringify({ t: tier, c: category }));
  } catch { /* storage unavailable — the memory cache still holds it */ }
}

const boardCutouts = new Map<string, Promise<FlatLayAsset>>();
const settledAssets = new Map<string, FlatLayAsset>();
const settledBoardCutouts = new Map<string, string>();

/** Synchronous peek — lets an already-cut piece paint without a flash.
 * Reads the memory map first, then the durable localStorage mapping. */
export function peekBoardCutout(sourceUrl: string): string | null {
  const clean = (sourceUrl || '').trim();
  if (!clean) return null;
  const inMemory = settledBoardCutouts.get(clean);
  if (inMemory) return inMemory;
  const stored = readStoredCutout(clean);
  if (stored) {
    settledBoardCutouts.set(clean, stored);
    return stored;
  }
  return null;
}

/**
 * THE STORED ASSET for a source image — SYNCHRONOUS, and this is the call
 * every grid, tray and board makes. An item that has been ingested (on this
 * device or any other, in this session or a previous one) answers instantly
 * with the CDN URL of its stored transparent PNG, which is what keeps the
 * pipeline off the render path entirely.
 *
 * The order is memory → the durable `image_cutouts` record → the legacy
 * localStorage mapping, so nothing already processed is thrown away and
 * re-billed.
 */
export function peekFlatLayAsset(sourceUrl: string): FlatLayAsset | null {
  const clean = (sourceUrl || '').trim();
  if (!clean) return null;
  const inMemory = settledAssets.get(clean);
  if (inMemory) return inMemory;
  // STEP 4's row: the stored cutout plus the Step 1 and Step 3 verdicts.
  const record = peekCutoutRecord(clean);
  if (record && record.transparentImageUrl) {
    knownCutoutUrls.add(record.transparentImageUrl);
    settledBoardCutouts.set(clean, record.transparentImageUrl);
    const asset: FlatLayAsset = {
      url: record.transparentImageUrl,
      tier: ([0, 1, 2, 3].includes(record.tier) ? record.tier : 1) as FlatLayTier,
      ready: true,
      flatLayReady: record.flatLayReady,
      confidence: record.confidence,
      sourceQuality: record.sourceQuality,
      cutoutQuality: record.cutoutQuality,
      needsReview: record.needsReview,
      reviewReasons: record.reviewReasons,
      category: record.category,
      source: clean,
      croppedWidth: record.croppedWidth ?? null,
      croppedHeight: record.croppedHeight ?? null,
    };
    settledAssets.set(clean, asset);
    return asset;
  }
  if (isTransparentCutout(clean)) {
    const asset: FlatLayAsset = {
      url: clean,
      tier: 1,
      ready: true,
      flatLayReady: true,
      confidence: 'high',
      sourceQuality: 'unknown',
      cutoutQuality: 'clean',
      needsReview: false,
      reviewReasons: [],
      category: null,
      source: clean,
    };
    settledAssets.set(clean, asset);
    return asset;
  }
  const cutout = peekBoardCutout(clean);
  if (!cutout) return null;
  const meta = readStoredMeta(clean);
  const tier = meta?.tier ?? 1;
  const asset: FlatLayAsset = {
    url: cutout,
    tier,
    ready: tier > 0,
    flatLayReady: isComposable(tier, false),
    confidence: confidenceFor(tier, 'unknown', 'clean'),
    sourceQuality: 'unknown',
    cutoutQuality: 'clean',
    needsReview: false,
    reviewReasons: [],
    category: meta?.category ?? null,
    source: clean,
  };
  settledAssets.set(clean, asset);
  return asset;
}

export interface FlatLayRequest {
  /** The framings Beau sourced for this ONE item. `candidates[0]` is the
   * asset's IDENTITY — the cache key, and the image a caller peeks by — so
   * it is whatever photograph the caller already has on screen. */
  candidates: string[] | string;
  category?: string | null;
  name?: string | null;
  /** Run the product-only preference across the framings. Worth it for
   * sourced retail photography, pointless for an owned piece's own
   * photograph — there is only ever one of those. */
  scanForPeople?: boolean;
  /**
   * The order the preference WALKS, which is not the same list as
   * `candidates`: identity is the caller's own photograph, but the choice
   * should start from the pack-shot-ranked candidates and only fall back to
   * the caller's if none of them is isolated. Defaults to `candidates`.
   */
  sourcePreference?: string[];
  /** The wardrobe piece this image belongs to, when it is an owned piece's
   * own photograph — recorded on the stored row so a piece's cutout can be
   * found from the piece as well as from the image. */
  pieceId?: number | null;
  /** Internal — skip settled/persisted cutout cache and re-run ingestion.
   * Used only by the v51 erosion-remediation batch. In-flight jobs still
   * dedupe through boardCutouts. */
  forceReprocess?: boolean;
}

/**
 * INGEST an item's imagery into a stored, flat-lay-ready cutout — ONCE per
 * source image, ever. This is the whole four-step pipeline in one call, and
 * it belongs to INGESTION: it is scheduled when a product is sourced, never
 * as part of rendering a page.
 *
 *   STEP 1 · SOURCE SELECTION. `selectSourceImage` classifies the framings
 *     Beau found — person yes/no, plain background yes/no — and returns the
 *     one that satisfies both, tiebroken on resolution then centring. When
 *     nothing satisfies "no person" it returns the best on-body shot and
 *     flags it `sourceQuality: 'low'`.
 *   STEP 2 · BACKGROUND REMOVAL, on the framing Step 1 chose. Real image
 *     processing: Photoroom through the secrets proxy, with the client-side
 *     @imgly model as the no-key fallback. The output is a genuine
 *     alpha-channel PNG — never a white backing box, and never a CSS trick.
 *   STEP 3 · VERIFICATION, in two halves. The alpha channel first
 *     (`trimTransparent` → `assessCutout`): a cut that removed nothing, or
 *     left nothing, is a failure and falls through to the next tier; a
 *     fringed, part-cut or ghosted one is flagged for review. Then the
 *     VISION PASS (`verifyCutoutWithVision`): the finished cut, composited
 *     on both real grounds, must show only the single product cleanly — no
 *     unrelated fragments, artifacts or partial second objects — or it is
 *     flagged for review and held out of the composition views.
 *   STEP 4 · STORAGE. The finished PNG is uploaded to the same object
 *     storage every other image uses, and `image_cutouts` records where it
 *     is — so every surface reuses that one file at the cost of any other
 *     image, on every device and every later visit.
 *
 * The tiers, stopping at the first clean result:
 *   1 · THE ISOLATED PRODUCT SHOT — Step 1 found a framing with nobody in
 *     it, and its background comes off cleanly. High confidence.
 *   3 · ONLY ON-BODY PHOTOGRAPHY EXISTS (or the removal above was not
 *     clean): fashion segmentation lifts JUST the garment off the model
 *     onto white, which is flooded transparent and trimmed. Low confidence,
 *     still flat-lay ready, because the model is gone.
 *   2 · nothing could lift the garment off the model: the on-body framing
 *     with its background removed. A usable THUMBNAIL and NEVER a flat-lay
 *     item — `flatLayReady: false`, so a board holds it out and names it
 *     rather than laying a photograph of a worn shoe among cutouts.
 *
 * Nothing throws: an item that fails every tier comes back `ready: false`
 * carrying its original url, and the caller keeps it OUT of the overlapping
 * composition rather than forcing a background into it.
 */
export function flatLayAssetFor(request: FlatLayRequest): Promise<FlatLayAsset> {
  const list = (Array.isArray(request.candidates) ? request.candidates : [request.candidates])
    .map((url) => (url || '').trim())
    .filter(Boolean);
  const source = list[0] || '';
  const category = request.category ?? null;
  // Nothing to ingest at all: not a failure, so nothing is flagged for review.
  if (!source) return Promise.resolve(uncutAsset('', category, false));
  if (!request.forceReprocess) {
    const settled = peekFlatLayAsset(source);
    if (settled) return Promise.resolve(settled);
  }
  const running = boardCutouts.get(source);
  if (running) return running;

  const job = (async (): Promise<FlatLayAsset> => {
    // Step 1's answer, filled in below so both the success and the failure
    // paths can record WHICH framing was cut and how good it was.
    let selection: SourceSelection = {
      url: '',
      sourceQuality: 'unknown',
      person: null,
      plainBackground: null,
      conclusive: false,
    };

    const finish = async (
      result: { dataUrl: string; quality: CutoutQuality; croppedWidth: number; croppedHeight: number },
      tier: FlatLayTier,
    ): Promise<FlatLayAsset> => {
      // STEP 3's SECOND HALF — the MANDATORY vision verification pass
      // (image-pipeline `verifyCutoutWithVision`). The alpha metrics already
      // judged the cut mechanically; the model now judges what it SHOWS,
      // composited on both real grounds (the #FBF8F1 tray canvas and the
      // #241a12 walnut slab): only the single product, cleanly, with no
      // unrelated fragments or partial second objects — the umbrella failure
      // the alpha channel cannot see. A NO downgrades the cut to 'imperfect'
      // and flags it for manual review instead of publishing it broken; an
      // unreadable answer keeps the deterministic verdict, because an outage
      // is not a finding. Tier 2 cuts skip the call — they are never composed,
      // so there is nothing for the verification to protect.
      let cut = result;
      let cutVerdict: CutoutVerdict = cut.quality.verdict;
      let reviewReasons = [...cut.quality.reasons];
      if (cutVerdict === 'clean' && tier !== 2) {
        const visionClean = await verifyCutoutWithVision(cut.dataUrl).catch(() => null);
        if (visionClean === false) {
          // ONE REMEDIATION PASS before the cut is flagged. What the model
          // most often sees is the faint border/frame line or fringe the
          // first erosion did not fully eat, and the documented fix for that
          // is MORE EROSION: re-running the normalization on the cut itself
          // erodes the alpha a further ~4px and re-crops. Only a retried cut
          // that passes BOTH the alpha metrics and a fresh vision check
          // replaces the original — anything else keeps the original cut and
          // flags it for review exactly as before.
          let remediated = false;
          try {
            const retried = await trimTransparent({ url: cut.dataUrl });
            if (retried.quality.verdict === 'clean') {
              const retriedClean = await verifyCutoutWithVision(retried.dataUrl).catch(() => null);
              if (retriedClean === true) {
                cut = retried;
                reviewReasons = [...retried.quality.reasons];
                remediated = true;
              }
            }
          } catch { /* the original cut stands, flagged below */ }
          if (!remediated) {
            cutVerdict = 'imperfect';
            reviewReasons.push('vision-artifacts');
          }
        }
      }
      const durable = await persistCutout(source, cut.dataUrl);
      storeMeta(source, tier, category);
      settledBoardCutouts.set(source, durable);
      // STEP 3's consequence: a cut Step 3 did not pass is NOT auto-published
      // into a composition view. It stays a perfectly good thumbnail.
      const needsReview = cutVerdict !== 'clean';
      // A cut taken from the only photograph available, and that one on-body,
      // is lower-confidence by provenance rather than by its edge quality.
      if (selection.sourceQuality === 'low') reviewReasons.push('on-body-source-only');
      const asset: FlatLayAsset = {
        url: durable,
        tier,
        ready: true,
        flatLayReady: isComposable(tier, needsReview),
        confidence: confidenceFor(tier, selection.sourceQuality, cutVerdict),
        sourceQuality: selection.sourceQuality,
        cutoutQuality: cutVerdict,
        needsReview,
        reviewReasons,
        category,
        source,
        croppedWidth: cut.croppedWidth,
        croppedHeight: cut.croppedHeight,
      };
      settledAssets.set(source, asset);
      // STEP 4 — the row that points at the stored PNG. Fire and forget: the
      // asset is already usable, and the row only has to exist before the
      // NEXT visit.
      void saveCutoutRecord({
        sourceUrl: source,
        selectedSourceUrl: selection.url || source,
        transparentImageUrl: durable,
        tier,
        sourceQuality: asset.sourceQuality,
        cutoutQuality: asset.cutoutQuality,
        reviewReasons: asset.reviewReasons,
        needsReview: asset.needsReview,
        flatLayReady: asset.flatLayReady,
        confidence: asset.confidence,
        category,
        pieceId: request.pieceId ?? null,
        croppedWidth: cut.croppedWidth,
        croppedHeight: cut.croppedHeight,
      });
      return asset;
    };
    try {
      // STEP 1 — THE CHOICE, BEFORE ANY CUTTING. It walks the ranked framings
      // (`sourcePreference` when the caller ranked them, otherwise the
      // candidates as given), so the budget is spent on the photographs most
      // likely to be isolated pack shots.
      const preference = (
        request.sourcePreference && request.sourcePreference.length > 0 ? request.sourcePreference : list
      )
        .map((url) => (url || '').trim())
        .filter(Boolean);
      if (request.scanForPeople) {
        selection = await selectSourceImage(preference).catch(() => selection);
      }
      const productOnly = selection.person === false ? selection.url : '';
      // Every framing on offer has a model in it — a finding, not a failure.
      const onlyOnBody = selection.sourceQuality === 'low';
      // A framing Step 1 actually CHOSE wins; when it could read nothing at
      // all, the caller's own photograph is cut, because that is the one the
      // customer is already looking at.
      const chosen = productOnly || (onlyOnBody ? selection.url : '') || source;

      // TIER 1 — the isolated product shot. Skipped outright once Step 1 has
      // established there ISN'T one: removing the background from an on-body
      // photograph only produces a cutout of a worn garment.
      if (!onlyOnBody) {
        try {
          const cutout = await removeBackgroundFromUrl(chosen);
          // Which tier this is is a property of the photo, not of the call.
          // (The stored classification only — never a fresh model call here.)
          const tier: FlatLayTier = productOnly ? 1 : peekClassification(chosen)?.person === true ? 2 : 1;
          return await finish(await trimTransparent(cutout), tier);
        } catch (removalError) {
          console.warn('[Ethaion] Tier 1 background removal not clean — trying garment isolation:', removalError);
        }
      }
      // TIER 3 — garment isolation: lift JUST the garment off the model onto
      // white, flood the white transparent, trim. This is what an item with
      // nothing but on-body photography gets, so the flat-lay shows the
      // loafer rather than the foot in it. Slightly body-shaped results are
      // accepted at low confidence.
      let person: boolean | null = productOnly ? false : onlyOnBody ? true : peekClassification(chosen)?.person ?? null;
      if (person === null) {
        person = (await classifyImage(chosen).catch(() => null))?.person ?? null;
        // The classification we came here without: if the chosen photograph
        // turns out to have a model in it, Step 1's verdict was 'low' after
        // all, and everything downstream should say so.
        if (person === true && selection.sourceQuality === 'unknown') {
          selection = { ...selection, sourceQuality: 'low', person: true, conclusive: true };
        }
      }
      try {
        const isolated = await isolateGarmentViaSegmentation(chosen, person);
        // THE WHITE-ON-WHITE BUG. This used to call `whiteToTransparent`,
        // which flood-fills inward from the frame edges through every pixel
        // that reads as near-white (luminance >= 0.82, low chroma, within ~50
        // RGB units of the estimated ground). White leather sits at roughly
        // 0.9 luminance with almost no chroma, so it PASSES that test: on a
        // white sneaker the flood walked in from the edge, straight through
        // the shoe, and stopped only where something darker blocked it. The
        // result was a garment with bites taken out of it — brown soles and
        // tan linings intact, white leather destroyed. No threshold fixes
        // this; a white garment on a white ground is not separable by colour.
        //
        // Photoroom separates by SUBJECT rather than by colour, so it handles
        // exactly this case. It costs one extra call on a tier that should
        // now be rare, and replaces a heuristic that could never be correct.
        const isolatedSrc =
          isolated.url || `data:${isolated.mimeType || 'image/png'};base64,${isolated.base64}`;
        const transparent = await removeBackgroundFromUrl(isolatedSrc);
        return await finish(await trimTransparent(transparent), 3);
      } catch (isolationError) {
        console.warn('[Ethaion] garment isolation failed — keeping the on-body cut as a thumbnail:', isolationError);
      }
      // TIER 2 — the on-body framing with its background removed: a cleaned
      // THUMBNAIL for the grids, never a flat-lay item. Only reachable when
      // tier 1 was SKIPPED because Step 1 proved there is no isolated
      // framing; if tier 1's own removal is what failed, this has nothing new
      // to try and would only run the same remover a second time.
      if (onlyOnBody) {
        const onBody = await removeBackgroundFromUrl(chosen);
        return await finish(await trimTransparent(onBody), 4);
      }
      throw new Error('no tier produced a clean cutout');
    } catch (error) {
      console.warn('[Ethaion] flat-lay asset failed at every tier — original image kept:', error);
      settledBoardCutouts.set(source, source);
      // Deliberately NOT written to image_cutouts: a total failure is often a
      // rate-limited remover or a hotlink-blocked file rather than a fact
      // about the photograph, and a stored row would make it permanent. It
      // stays a session-level answer, so the next visit tries once more.
      const asset = uncutAsset(source, category, true);
      settledAssets.set(source, asset);
      return asset;
    } finally {
      boardCutouts.delete(source);
    }
  })();
  boardCutouts.set(source, job);
  return job;
}

/**
 * A background-removed, TRANSPARENT version of a product image — the asset
 * pipeline above, with only its URL kept. Resolves to the ORIGINAL url when
 * no tier produces a clean result, so the caller can always render
 * something; callers that need to know whether the result is genuinely
 * flat-lay-ready should use flatLayAssetFor instead.
 */
export function cutoutForBoard(sourceUrl: string, category?: string | null, name?: string | null): Promise<string> {
  const clean = (sourceUrl || '').trim();
  if (!clean) return Promise.resolve('');
  return flatLayAssetFor({ candidates: clean, category, name }).then((asset) => asset.url);
}

// ---------------------------------------------------------------------------
// Shelf scheduling — the fitting shelves (In your Reserve · Beau's picks)
// run their product images through the same pipeline, but a shelf can hold
// dozens of pieces, so the work is queued at low concurrency instead of
// stampeding the removers. Cached pieces answer synchronously as always.
// ---------------------------------------------------------------------------

const SHELF_CUTOUT_CONCURRENCY = 2;
let shelfCutoutActive = 0;
const shelfCutoutQueue: Array<() => void> = [];

/**
 * PER-SESSION INGESTION BUDGET.
 *
 * Concurrency was already capped at 2, which stops the removers being
 * stampeded — but it does not stop the TOTAL amount of work. A wardrobe with
 * sixty uncut pieces still ground through all sixty, two at a time, each one
 * potentially costing a vision classification, a background-removal call, a
 * generative image-to-image call and a verification pass, with canvas pixel
 * work on the main thread between them. The queue simply spread that across
 * the whole visit, which is why the app stayed unresponsive long after load
 * rather than stalling once and recovering.
 *
 * A visit now ingests at most this many NEW pieces. The rest keep their
 * existing image and are picked up on later visits — the store is durable
 * (`image_cutouts` plus the localStorage mirror), so nothing is redone and the
 * wardrobe converges over a few sessions instead of holding one session
 * hostage.
 *
 * Pieces already ingested never touch this budget: they short-circuit on
 * `peekFlatLayAsset` above and cost nothing.
 */
const SESSION_INGEST_BUDGET = 8;
let sessionIngested = 0;

/** Remaining ingestion allowance for this page load. Exposed for diagnostics
 * and for callers that want to show a "still preparing" affordance. */
export function remainingIngestBudget(): number {
  return Math.max(0, SESSION_INGEST_BUDGET - sessionIngested);
}

/** flatLayAssetFor, queued — the shelf ingests dozens of pieces and must not
 * stampede the removers. Anything already ingested answers immediately. */
export function flatLayAssetForShelf(request: FlatLayRequest): Promise<FlatLayAsset> {
  const list = (Array.isArray(request.candidates) ? request.candidates : [request.candidates])
    .map((url) => (url || '').trim())
    .filter(Boolean);
  const source = list[0] || '';
  if (!source) return Promise.resolve(uncutAsset('', request.category ?? null, false));
  const settled = peekFlatLayAsset(source);
  if (settled) return Promise.resolve(settled);

  // Budget exhausted for this visit: hand back the piece's existing image
  // rather than queueing more work. `needsReview: false` keeps this out of the
  // failure reporting — nothing went wrong, the work was simply deferred, and
  // the next visit will pick it up.
  if (sessionIngested >= SESSION_INGEST_BUDGET) {
    return Promise.resolve(uncutAsset(source, request.category ?? null, false));
  }
  sessionIngested += 1;

  return new Promise((resolve) => {
    const run = () => {
      shelfCutoutActive += 1;
      flatLayAssetFor(request)
        .then(resolve)
        .catch(() => resolve(uncutAsset(source, request.category ?? null, true)))
        .finally(() => {
          shelfCutoutActive -= 1;
          const next = shelfCutoutQueue.shift();
          if (next) next();
        });
    };
    if (shelfCutoutActive < SHELF_CUTOUT_CONCURRENCY) run();
    else shelfCutoutQueue.push(run);
  });
}

export function cutoutForShelf(sourceUrl: string, category?: string | null, name?: string | null): Promise<string> {
  const clean = (sourceUrl || '').trim();
  if (!clean) return Promise.resolve('');
  return flatLayAssetForShelf({ candidates: clean, category, name }).then((asset) => asset.url);
}

export interface PreparedProductPhoto {
  originalUrl: string;
  cleanedUrl: string;
  cleaned: boolean;
}

/** Run the search/URL image phase before Save: the source image through THE
 * ONE transparent ingestion pipeline (Pass Forty-Nine) — removal, ~4px alpha
 * erosion, 4px tight crop, verification on both real grounds, durable
 * storage. `cleaned: true` means the returned URL is a stored GENUINE
 * alpha-channel transparent PNG. Failure returns the original as a usable
 * non-blocking fallback (`cleaned: false`) — it is then presented plated,
 * never passed off as transparency. */
export async function prepareProductPhoto(sourceUrl: string): Promise<PreparedProductPhoto> {
  if (!sourceUrl) return { originalUrl: '', cleanedUrl: '', cleaned: false };
  try {
    // scanForPeople: search-sourced photography is retail photography — the
    // classification decides whether the framing has a model in it BEFORE
    // anything is cut, the same rule every other sourced image follows.
    const asset = await flatLayAssetFor({ candidates: sourceUrl, scanForPeople: true });
    if (asset.ready && /^https?:\/\//i.test(asset.url)) {
      return { originalUrl: sourceUrl, cleanedUrl: asset.url, cleaned: true };
    }
    return { originalUrl: sourceUrl, cleanedUrl: sourceUrl, cleaned: false };
  } catch (error) {
    console.warn('[Ethaion] product photo preparation failed — original kept:', error);
    return { originalUrl: sourceUrl, cleanedUrl: sourceUrl, cleaned: false };
  }
}

/** Persist an already-prepared search image without running Photoroom twice. */
export async function attachPreparedProductPhoto(pieceId: number, prepared: PreparedProductPhoto): Promise<string | null> {
  if (!pieceId || !prepared.cleanedUrl) return null;
  try {
    // The visible write first and on its own — everything else is bookkeeping
    // on companion tables that no rendered surface reads synchronously.
    // These four writes used to run one after another, so picking a product
    // from a link cost four sequential round-trips before the image appeared.
    await db().from('wardrobe_pieces').update(pieceId, { photo_url: prepared.cleanedUrl });
    registerGarmentImage(pieceId, prepared.cleanedUrl);
    await Promise.all([
      setPhotoOriginal(pieceId, prepared.originalUrl || prepared.cleanedUrl),
      setPhotoSource(pieceId, prepared.cleaned ? 'pipeline' : 'product'),
      prepared.cleaned ? setNormVersion(pieceId, NORM_VERSION) : Promise.resolve(),
    ]);
    window.dispatchEvent(new CustomEvent('ethaion:piece-photo-settled', { detail: { pieceId, photoUrl: prepared.cleanedUrl } }));
    return prepared.cleanedUrl;
  } catch (error) {
    console.warn('[Ethaion] prepared product photo attach failed:', error);
    return null;
  }
}

/**
 * Attach an image to a known piece id, preserve it as the permanent original,
 * and replace the row with the Photoroom/canonical result when ready. The raw
 * image is written first for optimistic display; every failure leaves that
 * usable original in place and never rejects the save flow.
 */
export async function attachAndSettleProductPhoto(
  pieceId: number,
  sourceUrl: string,
  fields: GarmentFields,
): Promise<string | null> {
  if (!pieceId || !sourceUrl) return null;
  try {
    await setPhotoOriginal(pieceId, sourceUrl);
    await db().from('wardrobe_pieces').update(pieceId, { photo_url: sourceUrl });
    registerGarmentImage(pieceId, sourceUrl);
    const resolved = await regeneratePieceImage(pieceId, fields, { anchorUrl: sourceUrl });
    window.dispatchEvent(
      new CustomEvent('ethaion:piece-photo-settled', {
        detail: { pieceId, photoUrl: resolved || sourceUrl },
      }),
    );
    return resolved || sourceUrl;
  } catch (error) {
    console.warn('[Ethaion] first-save photo settle failed — original kept:', error);
    return null;
  }
}

/**
 * Back-compatible URL lookup for older add flows. New flows should call
 * attachAndSettleProductPhoto with the inserted row id so concurrent saves
 * cannot attach a result to the wrong piece.
 */
export async function settleProductPhoto(
  fastUrl: string,
  _enhanced: Promise<string | null>,
  fields: GarmentFields | null,
): Promise<string | null> {
  if (!fastUrl) return null;
  try {
    const { data } = await db().from('wardrobe_pieces').eq('photo_url', fastUrl).limit(50).get();
    let firstUrl: string | null = null;
    for (const row of data || []) {
      const piece = normalizePiece(row);
      const resolved = await attachAndSettleProductPhoto(
        piece.id,
        fastUrl,
        fields || garmentFieldsFromPiece(piece),
      );
      if (!firstUrl && resolved) firstUrl = resolved;
    }
    return firstUrl;
  } catch (error) {
    console.warn('[Ethaion] pipeline settle failed:', error);
    return null;
  }
}

/**
 * Run the newest `count` wardrobe rows through the pipeline — called right
 * after the add flows insert pieces. Rows without a photo are no-ops.
 */
export async function resolveNewestPieces(count: number): Promise<void> {
  try {
    const { data } = await db().from('wardrobe_pieces').orderBy('created_at', 'desc').limit(Math.max(1, count)).get();
    const rows: any[] = (data || []).slice().reverse();
    for (const row of rows) {
      const piece = normalizePiece(row);
      await regeneratePieceImage(piece.id, garmentFieldsFromPiece(piece));
    }
  } catch (error) {
    console.warn('[Ethaion] image resolution for new pieces failed:', error);
  }
}

// ---------------------------------------------------------------------------
// Retroactive batch (Pass Forty-Nine) — on first app load, EVERY existing
// wardrobe piece with a stored photo is re-run through THE ONE ingestion
// pipeline: real photo in, stored GENUINE alpha-channel transparent cutout
// out (background removed, alpha edge eroded ~4px, tight-cropped to the
// silhouette + 4px margin, verified on both real grounds). NO exemptions —
// every piece with a photoUrl goes through, so no legacy paper card or raw
// image survives as a display image. Processing is SEQUENTIAL — one piece
// at a time, each awaited. A failed piece is logged and skipped with its
// previous image left unchanged, never aborting the batch. Raw uploads
// found on rows are preserved as anchors first. The one-time sweep is
// guarded by the bgRemovalV49 flag in localStorage: if the flag exists the
// batch is skipped entirely, and it is set only after the batch completes
// so it never re-runs on reload.
// ---------------------------------------------------------------------------

export interface MigrationProgress { total: number; done: number; active: boolean }
let migrationRunning = false;

// Pass Forty-Nine: new flag key so every existing piece is re-cut into a
// GENUINE alpha-channel transparent PNG exactly once (the universal
// transparency rule); the Pass Forty-Six B paper-card flag is retired.
// v50: bumped with pipeline v5 (hollow-frame removal) so every piece is
// re-cut once more from its original — the universal border-artifact fix.
const BATCH_FLAG_KEY = 'bgRemovalV50';

function batchFlagSet(): boolean {
  try {
    return localStorage.getItem(BATCH_FLAG_KEY) != null;
  } catch {
    return false;
  }
}

function markBatchFlag(): void {
  try {
    localStorage.setItem(BATCH_FLAG_KEY, '1');
  } catch { /* storage unavailable — DB version stamps still gate re-runs */ }
}

/** Raw uploads live outside the generated-images folder — those are true originals. */
function looksLikeRawUpload(url: string): boolean {
  return /storage\.googleapis\.com\/audos-images\//i.test(url) && !/\/generated-images\//i.test(url);
}

// v51: one-time 4px-erosion remediation — re-cut norm-v14 pieces whose
// stored display cutout fails the dual-ground vision check, from original.
const EROSION_REMEDIATION_FLAG_KEY = 'bgRemovalV51';

function erosionRemediationFlagSet(): boolean {
  try {
    return localStorage.getItem(EROSION_REMEDIATION_FLAG_KEY) != null;
  } catch {
    return false;
  }
}

function markErosionRemediationFlag(): void {
  try {
    localStorage.setItem(EROSION_REMEDIATION_FLAG_KEY, '1');
  } catch { /* storage unavailable — batch may retry next visit */ }
}

async function runErosionRemediationBatch(
  pieces: WardrobePiece[],
  materials: Record<number, string>,
  onProgress?: (progress: MigrationProgress) => void,
  patterns: Record<number, string | null | undefined> = {},
): Promise<number> {
  if (migrationRunning || erosionRemediationFlagSet()) return 0;
  migrationRunning = true;
  let changed = 0;
  let completed = true;
  try {
    const [originals, normVersions] = await Promise.all([fetchPhotoOriginals(), fetchNormVersions()]);
    const fieldsFor = (piece: WardrobePiece) =>
      garmentFieldsFromPiece(piece, materials[piece.id], patterns[piece.id] || null);

    const targets: WardrobePiece[] = [];
    for (const piece of pieces) {
      if ((normVersions[piece.id] || 0) !== NORM_VERSION) continue;
      const displayUrl = String(piece.photo_url || '').trim();
      if (!isHttpImage(displayUrl)) continue;
      const anchorUrl = String(originals[piece.id] || '').trim();
      if (!isHttpImage(anchorUrl)) {
        completed = false;
        console.warn(`[Ethaion] erosion remediation: "${piece.name}" — deferred, no stored original`);
        continue;
      }
      const visionClean = await verifyCutoutWithVision(displayUrl).catch(() => null);
      if (visionClean == null) {
        console.warn(`[Ethaion] erosion remediation: "${piece.name}" — verification unavailable, skipped`);
        continue;
      }
      if (visionClean === false) targets.push(piece);
    }

    const total = targets.length;
    if (total === 0) {
      if (completed) markErosionRemediationFlag();
      return 0;
    }
    onProgress?.({ total, done: 0, active: true });

    let done = 0;
    for (const piece of targets) {
      const url = await regeneratePieceImage(piece.id, fieldsFor(piece), {
        anchorUrl: originals[piece.id],
        forceReprocess: true,
      });
      if (url) {
        changed += 1;
        console.log(`[Ethaion] erosion remediation: "${piece.name}" — success`);
      } else {
        completed = false;
        console.log(`[Ethaion] erosion remediation: "${piece.name}" — failed, previous image kept`);
      }
      done += 1;
      onProgress?.({ total, done, active: done < total });
    }

    if (completed) markErosionRemediationFlag();
    onProgress?.({ total, done, active: false });
    return changed;
  } finally {
    migrationRunning = false;
  }
}

export async function runPhotoMigration(
  pieces: WardrobePiece[],
  materials: Record<number, string>,
  onProgress?: (progress: MigrationProgress) => void,
  patterns: Record<number, string | null | undefined> = {},
): Promise<number> {
  let changed = await runErosionRemediationBatch(pieces, materials, onProgress, patterns);
  // One-time flag: once the Pass Twenty-Six batch has completed on this
  // device, it never re-runs on reload. (New uploads are settled at add
  // time by settleProductPhoto, so nothing is missed.)
  if (batchFlagSet()) return changed;
  if (migrationRunning) return changed;
  migrationRunning = true;
  try {
    const [meta, originals, normVersions] = await Promise.all([fetchPhotoMeta(), fetchPhotoOriginals(), fetchNormVersions()]);

    // Preserve any surviving raw uploads as permanent anchors before cleanup.
    // Images the old pipeline produced (source 'pipeline'/'generated') are
    // NOT originals — they are legacy AI outputs; those pieces fall back to
    // the row image as a transient anchor without persisting it as original.
    for (const piece of pieces) {
      const url = String(piece.photo_url || '').trim();
      const source = meta[piece.id]?.source;
      if (source === 'pipeline' || source === 'generated') continue;
      if (url && !originals[piece.id] && looksLikeRawUpload(url)) {
        await setPhotoOriginal(piece.id, url);
        originals[piece.id] = url;
      }
    }

    const fieldsFor = (piece: WardrobePiece) =>
      garmentFieldsFromPiece(piece, materials[piece.id], patterns[piece.id] || null);

    // Every piece WITH a photo (row image or stored original) that hasn't
    // been through the transparent-cutout pipeline yet. Pieces already
    // stamped at NORM_VERSION are skipped so an interrupted batch resumes
    // where it left off. Photo-less (text-only) pieces are skipped entirely
    // — no AI generation any more. There is NO other exemption: user-chosen
    // 'custom' photos are cut too, so every display image ends up a genuine
    // alpha-channel transparent PNG.
    const targets = pieces.filter((piece) => {
      if (!isHttpImage(piece.photo_url) && !originals[piece.id]) return false;
      return (normVersions[piece.id] || 0) < NORM_VERSION;
    });
    // True founder photos first — they are the best anchors.
    const rank = (piece: WardrobePiece) => (originals[piece.id] ? 0 : 1);
    targets.sort((a, b) => rank(a) - rank(b));

    const total = targets.length;
    if (total === 0) {
      markBatchFlag();
      return changed;
    }
    onProgress?.({ total, done: 0, active: true });

    // SEQUENTIAL processing — one piece at a time, each awaited. A failed
    // piece is logged, its previous image kept, and the batch moves on.
    let done = 0;
    for (const piece of targets) {
      const url = await regeneratePieceImage(piece.id, fieldsFor(piece), { anchorUrl: originals[piece.id] || null });
      if (url) {
        changed += 1;
        console.log(`[Ethaion] background-removal batch: "${piece.name}" — success`);
      } else {
        console.log(`[Ethaion] background-removal batch: "${piece.name}" — failed, previous image kept`);
      }
      done += 1;
      onProgress?.({ total, done, active: done < total });
    }

    // The batch ran to completion (failures were logged and skipped by
    // design) — set the one-time flag so it never re-runs on reload.
    markBatchFlag();
    onProgress?.({ total, done, active: false });
    return changed;
  } finally {
    migrationRunning = false;
  }
}
