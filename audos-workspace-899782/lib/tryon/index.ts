/**
 * Ethaion virtual try-on — the provider-agnostic seam.
 *
 * Screens (Curated, Radar, …) call `tryOn(personImageUrl, garmentImageUrl)`
 * and get back a rendered-image URL. They never import a provider directly,
 * so the engine can be swapped (Fashn.ai today; e.g. Google Vertex AI
 * Virtual Try-On later) by changing ONE line in this file:
 *
 *   lib/tryon/
 *     index.ts   ← this file: the interface + the saved base-photo store
 *     fashn.ts   ← Fashn.ai implementation (via the beau-tryon server hook)
 *     vertex.ts  ← future Google Vertex implementation (not built yet)
 *
 * This module also owns the user's saved BASE PHOTO (Option A): one photo of
 * themselves, stored per visitor in the `tryon_photos` WorkspaceDB table and
 * reused for every “Try this on” tap.
 */
import { fashnTryOn, type FashnTryOnOptions } from './fashn';

export interface TryOnOptions {
  /** Progress copy callback — Beau's warm voice while the render cooks. */
  onPhase?: (phase: string) => void;
}

/**
 * Render the garment at `garmentImageUrl` onto the person in
 * `personImageUrl`. Resolves with the rendered image URL; rejects with a
 * plain-English error the UI can show quietly.
 */
export async function tryOn(
  personImageUrl: string,
  garmentImageUrl: string,
  options: TryOnOptions = {},
): Promise<string> {
  // THE provider seam — swap this call to change engines.
  return fashnTryOn(personImageUrl, garmentImageUrl, options as FashnTryOnOptions);
}

// ---------------------------------------------------------------------------
// The saved base photo — set once in Your Style, reused for every try-on.
// ---------------------------------------------------------------------------

export interface TryOnPhoto {
  id: number;
  photo_url: string;
}

// window.__workspaceDb is auto-injected by the platform compiler when it sees
// this literal token in app source.
function db(): any {
  return (window as any).__workspaceDb;
}

/** In-memory cache: `undefined` = not read yet, `null` = read, none saved. */
let cachedPhoto: TryOnPhoto | null | undefined;

function broadcast(): void {
  window.dispatchEvent(new CustomEvent('ethaion:tryon-photo', { detail: { photo: cachedPhoto ?? null } }));
}

/** Read the visitor's saved try-on photo (cached after the first read). */
export async function fetchTryOnPhoto(force = false): Promise<TryOnPhoto | null> {
  if (!force && cachedPhoto !== undefined) return cachedPhoto;
  try {
    const { data } = await db().from('tryon_photos').orderBy('created_at', 'desc').limit(1).get();
    const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
    cachedPhoto = row && row.photo_url ? { id: row.id, photo_url: row.photo_url } : null;
    return cachedPhoto;
  } catch (e) {
    console.warn('[Ethaion] reading the try-on photo failed:', e);
    return cachedPhoto ?? null; // never cache a failure as “no photo”
  }
}

/** Save (or replace) the visitor's base photo. */
export async function saveTryOnPhoto(photoUrl: string): Promise<TryOnPhoto | null> {
  const existing = await fetchTryOnPhoto(true);
  if (existing) {
    await db().from('tryon_photos').update(existing.id, { photo_url: photoUrl });
  } else {
    await db().from('tryon_photos').insert({ photo_url: photoUrl });
  }
  const fresh = await fetchTryOnPhoto(true);
  broadcast();
  return fresh;
}

/** Remove the saved base photo. */
export async function removeTryOnPhoto(): Promise<void> {
  const existing = await fetchTryOnPhoto(true);
  if (existing) {
    await db().from('tryon_photos').delete(existing.id);
  }
  cachedPhoto = null;
  broadcast();
}
