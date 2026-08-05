/**
 * Ethaion Fitting Room AVATAR — the masculine figure garments render onto.
 *
 * Instead of sending the user's real photo to the try-on provider for every
 * render (10–20s each, and the neutral default read feminine), the app
 * builds ONE avatar up front from optional profile data and caches it:
 *
 *   1. A MASCULINE BASELINE FIGURE is chosen from a pre-sourced set of nine
 *      studio photographs (three builds × three skin-tone bands), every one
 *      of them already wearing classic men's pyjamas — piped collar shirt,
 *      loose trousers, oatmeal/cream tones — on the warm oatmeal ground.
 *      So the DEFAULT Fitting Room state needs NO render at all.
 *   2. Profile inputs (all optional): height, weight, body type, skin tone,
 *      and the face photo already collected in Your Style. Zero input →
 *      the clean masculine default (medium build, mid skin tone). More
 *      data → a closer figure.
 *   3. If a face photo exists, it is composited onto the chosen base with a
 *      soft editorial blend (Gemini image-to-image via the platform
 *      endpoint). If the composite fails or looks wrong, the base model is
 *      used as-is — never a broken avatar.
 *   4. The result is CACHED three ways (memory, localStorage, the
 *      avatar_profiles WorkspaceDB row) keyed by a signature of the inputs,
 *      so the Fitting Room opens instantly after the first build and only
 *      rebuilds when profile data changes.
 *
 * Try-on renders then use the cached avatar as the person image through
 * lib/tryon's `tryOn()` — the provider seam (Fashn today) stays swappable
 * and untouched.
 */
import { fetchTryOnPhoto } from './index';

// ---------------------------------------------------------------------------
// Inputs — every field optional; missing data falls back to the default.
// ---------------------------------------------------------------------------

export type BodyType = 'slim' | 'athletic' | 'broad';
export type SkinBand = 'light' | 'medium' | 'deep';

export interface SkinTone {
  id: string;
  label: string;
  /** The swatch colour shown in the selector. */
  hex: string;
  /** Which base-model band this swatch maps to. */
  band: SkinBand;
}

/** Eight swatches, light → deep, warm and cool options. */
export const SKIN_TONES: SkinTone[] = [
  { id: 'porcelain', label: 'Porcelain', hex: '#f3e0cf', band: 'light' },
  { id: 'fair-warm', label: 'Fair warm', hex: '#eccdb0', band: 'light' },
  { id: 'fair-cool', label: 'Fair cool', hex: '#e5c6ab', band: 'light' },
  { id: 'golden', label: 'Golden', hex: '#c99b6d', band: 'medium' },
  { id: 'tan-warm', label: 'Tan warm', hex: '#b07f52', band: 'medium' },
  { id: 'bronze', label: 'Bronze', hex: '#8f6140', band: 'medium' },
  { id: 'deep-warm', label: 'Deep warm', hex: '#6b4630', band: 'deep' },
  { id: 'deep-cool', label: 'Deep cool', hex: '#4a3123', band: 'deep' },
];

export interface AvatarInputs {
  heightCm: number | null;
  heightUnit: 'cm' | 'ftin';
  weightKg: number | null;
  weightUnit: 'kg' | 'lbs';
  bodyType: BodyType | null;
  /** Swatch id from SKIN_TONES. */
  skinTone: string | null;
}

export const EMPTY_INPUTS: AvatarInputs = {
  heightCm: null,
  heightUnit: 'cm',
  weightKg: null,
  weightUnit: 'kg',
  bodyType: null,
  skinTone: null,
};

// ---------------------------------------------------------------------------
// The base-model set — pre-sourced studio photographs, every figure male,
// neutral expression, standing, ALREADY IN men's pyjamas on the oatmeal
// ground (so the default Fitting Room state costs zero renders).
// ---------------------------------------------------------------------------

const ASSETS = 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-899782/';

export const BASE_MODELS: Record<string, string> = {
  'slim-light': `${ASSETS}img-1785537572547-xj7h9g.png`,
  'slim-medium': `${ASSETS}img-1785537601382-tts2n7.png`,
  'slim-deep': `${ASSETS}img-1785537628722-8hzq9o.png`,
  'athletic-light': `${ASSETS}img-1785537657338-dv3jh9.png`,
  'athletic-medium': `${ASSETS}img-1785537536083-tgoedx.png`,
  'athletic-deep': `${ASSETS}img-1785537685324-dwf8x4.png`,
  'broad-light': `${ASSETS}img-1785537783771-t4y52r.png`,
  'broad-medium': `${ASSETS}img-1785537811606-fjodiw.png`,
  'broad-deep': `${ASSETS}img-1785537838439-qbom7o.png`,
};

/** Zero input → the single clean masculine default: medium build, mid tone. */
export const DEFAULT_BASE_KEY = 'athletic-medium';

/** Body type: explicit choice first; else inferred from height + weight
 * (rough BMI bands); else the medium default. */
export function resolveBodyType(inputs: AvatarInputs): BodyType {
  if (inputs.bodyType) return inputs.bodyType;
  if (inputs.heightCm && inputs.weightKg && inputs.heightCm > 0) {
    const metres = inputs.heightCm / 100;
    const bmi = inputs.weightKg / (metres * metres);
    if (bmi < 21) return 'slim';
    if (bmi > 26.5) return 'broad';
  }
  return 'athletic';
}

export function resolveSkinBand(inputs: AvatarInputs): SkinBand {
  const swatch = SKIN_TONES.find((tone) => tone.id === inputs.skinTone);
  return swatch?.band || 'medium';
}

export function baseKeyFor(inputs: AvatarInputs): string {
  const key = `${resolveBodyType(inputs)}-${resolveSkinBand(inputs)}`;
  return BASE_MODELS[key] ? key : DEFAULT_BASE_KEY;
}

// ---------------------------------------------------------------------------
// The avatar_profiles row — one per visitor, updated in place.
// ---------------------------------------------------------------------------

interface ProfileRow {
  id: number;
  height_cm: number | string | null;
  height_unit: string | null;
  weight_kg: number | string | null;
  weight_unit: string | null;
  body_type: string | null;
  skin_tone: string | null;
  base_key: string | null;
  avatar_url: string | null;
  face_url: string | null;
  avatar_sig: string | null;
}

// window.__workspaceDb is auto-injected by the platform compiler when it sees
// this literal token in app source.
function db(): any {
  return (window as any).__workspaceDb;
}

let cachedRow: ProfileRow | null | undefined; // undefined = not read yet
let rowPromise: Promise<ProfileRow | null> | null = null;

async function fetchProfileRow(force = false): Promise<ProfileRow | null> {
  if (!force && cachedRow !== undefined) return cachedRow;
  if (!force && rowPromise) return rowPromise;
  rowPromise = (async () => {
    try {
      const { data } = await db().from('avatar_profiles').orderBy('created_at', 'desc').limit(1).get();
      cachedRow = Array.isArray(data) && data.length > 0 ? (data[0] as ProfileRow) : null;
    } catch (e) {
      console.warn('[Ethaion] reading the avatar profile failed:', e);
    } finally {
      rowPromise = null;
    }
    return cachedRow ?? null;
  })();
  return rowPromise;
}

function rowToInputs(row: ProfileRow | null): AvatarInputs {
  if (!row) return { ...EMPTY_INPUTS };
  const num = (v: number | string | null) => {
    const n = typeof v === 'string' ? parseFloat(v) : v;
    return typeof n === 'number' && isFinite(n) && n > 0 ? n : null;
  };
  return {
    heightCm: num(row.height_cm),
    heightUnit: row.height_unit === 'ftin' ? 'ftin' : 'cm',
    weightKg: num(row.weight_kg),
    weightUnit: row.weight_unit === 'lbs' ? 'lbs' : 'kg',
    bodyType: row.body_type === 'slim' || row.body_type === 'athletic' || row.body_type === 'broad' ? row.body_type : null,
    skinTone: row.skin_tone || null,
  };
}

/** Read the visitor's saved avatar inputs (cached after the first read). */
export async function fetchAvatarInputs(force = false): Promise<AvatarInputs> {
  return rowToInputs(await fetchProfileRow(force));
}

/** Save (upsert) avatar inputs. Kicks a background rebuild — the Fitting
 * Room hears about the fresh avatar via the AVATAR_EVENT broadcast. */
export async function saveAvatarInputs(patch: Partial<AvatarInputs>): Promise<AvatarInputs> {
  const row = await fetchProfileRow(true);
  const merged = { ...rowToInputs(row), ...patch };
  const record = {
    height_cm: merged.heightCm,
    height_unit: merged.heightUnit,
    weight_kg: merged.weightKg,
    weight_unit: merged.weightUnit,
    body_type: merged.bodyType,
    skin_tone: merged.skinTone,
  };
  try {
    if (row) {
      await db().from('avatar_profiles').update(row.id, record);
    } else {
      await db().from('avatar_profiles').insert(record);
    }
    await fetchProfileRow(true);
  } catch (e) {
    console.warn('[Ethaion] saving the avatar profile failed:', e);
  }
  rebuildAvatarInBackground();
  return merged;
}

// ---------------------------------------------------------------------------
// The constructed avatar + its three-layer cache.
// ---------------------------------------------------------------------------

export interface Avatar {
  /** The image every try-on render uses as the person photo. */
  url: string;
  baseKey: string;
  /** True when the user's face photo was blended onto the base model. */
  composited: boolean;
}

export const AVATAR_EVENT = 'ethaion:avatar';

const LOCAL_KEY = 'ethaion_avatar_v1';
const SIG_VERSION = 'v1';

function signature(baseKey: string, faceUrl: string): string {
  return `${SIG_VERSION}::${baseKey}::${faceUrl}`;
}

let memoryAvatar: (Avatar & { sig: string }) | null = null;
let buildPromise: Promise<Avatar> | null = null;

function readLocal(): (Avatar & { sig: string }) | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.url !== 'string' || typeof parsed?.sig !== 'string') return null;
    return parsed as Avatar & { sig: string };
  } catch {
    return null;
  }
}

function writeLocal(avatar: Avatar & { sig: string }): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(avatar));
  } catch { /* storage unavailable — memory + DB caches still hold it */ }
}

/** Synchronous peek at the last built avatar — lets the Fitting Room paint
 * a figure immediately while ensureAvatar() revalidates in the background.
 * Falls back to the default base model, so there is ALWAYS a figure. */
export function cachedAvatarSync(): Avatar {
  const hit = memoryAvatar || readLocal();
  if (hit) return { url: hit.url, baseKey: hit.baseKey, composited: hit.composited };
  return { url: BASE_MODELS[DEFAULT_BASE_KEY], baseKey: DEFAULT_BASE_KEY, composited: false };
}

/** True when no avatar has ever been built for this visitor — the one time
 * the Fitting Room shows its "getting your Fitting Room ready" state. */
export function avatarNeedsFirstBuild(): boolean {
  return !memoryAvatar && !readLocal();
}

function broadcast(avatar: Avatar): void {
  window.dispatchEvent(new CustomEvent(AVATAR_EVENT, { detail: { avatar } }));
}

// ---------------------------------------------------------------------------
// Face composite — soft edge blend via the platform's Gemini image-to-image
// endpoint. Editorial, not uncanny: if anything about it fails, the base
// model is used as-is and the face overlay is simply omitted.
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

/** Canvas re-encode to JPEG base64 — same approach as the photo pipeline. */
async function toJpegBase64(url: string, maxEdge = 1200): Promise<string> {
  const img = await loadImage(url);
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

async function compositeFace(baseUrl: string, faceUrl: string): Promise<string> {
  const [base, face] = await Promise.all([toJpegBase64(baseUrl), toJpegBase64(faceUrl, 900)]);
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 75000);
  try {
    const res = await fetch('/api/generate/image-to-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt:
          'The first image is a full-length studio photograph of a man in cream pyjamas standing against a plain warm oatmeal-beige background. The second image shows the face of a different person. Recreate the FIRST image exactly — identical pose, identical body and build, identical cream pyjamas, identical oatmeal background, identical framing and lighting — but replace the man\u2019s face and head with the person from the second image, blending skin tone and light softly at the edges so it reads as one natural photograph of that person. Photorealistic, warm editorial menswear photography. Never distorted, never cartoonish.',
        images: [
          { data: base, mimeType: 'image/jpeg' },
          { data: face, mimeType: 'image/jpeg' },
        ],
        style: 'photorealistic warm editorial studio photography, soft diffused light, muted natural colour grade',
      }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success || typeof data.imageUrl !== 'string' || !data.imageUrl) {
      throw new Error((data && data.error) || `composite endpoint returned ${res.status}`);
    }
    // Quality gate: the composite must load and still be a portrait plate —
    // anything else and the clean base model wins.
    const img = await loadImage(data.imageUrl);
    if (img.naturalHeight <= img.naturalWidth) throw new Error('composite lost the portrait framing');
    return data.imageUrl as string;
  } finally {
    window.clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// ensureAvatar — the ONE way to get the figure. Instant on a signature hit;
// a quiet background build otherwise.
// ---------------------------------------------------------------------------

export interface EnsureAvatarOptions {
  /** Progress copy callback — Beau's warm voice during the one-time build. */
  onPhase?: (phase: string) => void;
  /** Rebuild even when the signature matches (profile edits call this). */
  force?: boolean;
}

export async function ensureAvatar({ onPhase, force = false }: EnsureAvatarOptions = {}): Promise<Avatar> {
  if (buildPromise && !force) return buildPromise;
  const job = (async (): Promise<Avatar> => {
    const [inputs, facePhoto] = await Promise.all([fetchAvatarInputs(force), fetchTryOnPhoto(force)]);
    const faceUrl = facePhoto?.photo_url || '';
    const baseKey = baseKeyFor(inputs);
    const sig = signature(baseKey, faceUrl);

    // Cache hits. Even a FORCED rebuild returns the cached avatar when the
    // input signature is unchanged and the last composite succeeded — the
    // output would be identical, so re-running the paid face blend for a
    // no-op edit (e.g. a unit toggle) is pure waste. A cached avatar whose
    // composite previously FAILED (composited=false while a face exists)
    // does get retried on force.
    const local = memoryAvatar || readLocal();
    if (local && local.sig === sig && (!force || local.composited || !faceUrl)) {
      memoryAvatar = local;
      return { url: local.url, baseKey: local.baseKey, composited: local.composited };
    }
    if (!force) {
      const row = await fetchProfileRow();
      if (row?.avatar_sig === sig && row.avatar_url) {
        const fromDb = { url: row.avatar_url, baseKey, composited: !!faceUrl && row.face_url === faceUrl, sig };
        memoryAvatar = fromDb;
        writeLocal(fromDb);
        return { url: fromDb.url, baseKey, composited: fromDb.composited };
      }
    }

    // Build: the pre-sourced base figure, plus the face blend when a face
    // photo exists. Composite failure is quiet — the base model stands in.
    onPhase?.('Beau is getting your Fitting Room ready\u2026');
    let url = BASE_MODELS[baseKey];
    let composited = false;
    if (faceUrl) {
      try {
        url = await compositeFace(url, faceUrl);
        composited = true;
      } catch (e) {
        console.warn('[Ethaion] face composite fell back to the base model:', e);
        url = BASE_MODELS[baseKey];
        composited = false;
      }
    }

    const built = { url, baseKey, composited, sig };
    memoryAvatar = built;
    writeLocal(built);
    try {
      const row = await fetchProfileRow();
      const record = { base_key: baseKey, avatar_url: url, face_url: composited ? faceUrl : '', avatar_sig: sig };
      if (row) {
        await db().from('avatar_profiles').update(row.id, record);
      } else {
        await db().from('avatar_profiles').insert(record);
      }
      await fetchProfileRow(true);
    } catch (e) {
      console.warn('[Ethaion] persisting the avatar cache failed (memory cache still holds it):', e);
    }
    const avatar = { url, baseKey, composited };
    broadcast(avatar);
    return avatar;
  })();
  buildPromise = job.finally(() => {
    buildPromise = null;
  });
  return buildPromise;
}

/** Fire-and-forget rebuild — profile edits and face-photo changes call this
 * so the avatar is already fresh by the time the Fitting Room next opens. */
export function rebuildAvatarInBackground(): void {
  void ensureAvatar({ force: true }).catch((e) => {
    console.warn('[Ethaion] background avatar rebuild failed:', e);
  });
}

// A changed/removed face photo invalidates the composite — rebuild quietly.
if (typeof window !== 'undefined') {
  window.addEventListener('ethaion:tryon-photo', () => {
    memoryAvatar = null;
    rebuildAvatarInBackground();
  });
}
