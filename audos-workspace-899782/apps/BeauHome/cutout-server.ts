/**
 * SERVER-SIDE CUTOUT INGESTION — the Efficiency doc's first-order fix
 * (§04: "move ingestion server-side — process on upload, store the cutout,
 * the client displays it").
 *
 * WHAT MOVES OFF THE CUSTOMER'S DEVICE. A platform SERVER FUNCTION (hook)
 * named `ethaion-cutout-ingest` now does the whole expensive round for a
 * new upload: it calls Photoroom's segmentation through the workspace
 * secrets proxy (the PHOTOROOM_API_KEY never reaches the browser — same
 * key, same proxy the in-browser path used) AND stores the finished
 * transparent PNG in platform object storage, returning only the stored
 * URL. The browser sends one small JSON request and receives one URL — no
 * base64 megabytes over the wire, no decode/encode work on the main
 * thread, no WASM, ever.
 *
 * THE FALLBACK CONTRACT (per the design handoff): the server endpoint
 * handles new uploads; the existing client-side pipeline in
 * photo-enhance.ts stays as the fallback for offline / legacy —
 * `serverCutout` returns null on ANY failure (hook missing and
 * uncreatable, network down, Photoroom key absent) and the caller falls
 * through to the in-browser call it always made. Nothing gains a new
 * failure mode.
 *
 * THREE SIZES PER CUTOUT (Efficiency §02): after a hero cutout lands,
 * `storeCutoutVariants` derives a 96px shelf thumb and a ~300px tile from
 * it — cheap canvas work at INGEST time, never on view — uploads both and
 * records them in the `cutout_variants` table. `cutoutVariantFor` is the
 * synchronous read every tile surface uses; it returns the hero URL until
 * variants exist, so nothing ever waits on it.
 *
 * SELF-PROVISIONING: the hook is created through the platform's hooks API
 * the first time this module needs it, and re-created when HOOK_VERSION
 * bumps. All of it fails soft.
 */

function ws(): any {
  return (window as any).__workspaceDb;
}

const HOOK_NAME = 'ethaion-cutout-ingest';
const HOOK_VERSION = 1;
const HOOK_MARKER = `ethaion-cutout-ingest v${HOOK_VERSION}`;

/** The server function's code — runs in the platform hook sandbox. */
const HOOK_CODE = `
// ${HOOK_MARKER} — background removal + storage, server-side.
const src = String((request.body && request.body.sourceUrl) || '').trim();
const origin = String((request.body && request.body.uploadOrigin) || '').trim();
if (!src) {
  respond(400, { error: 'sourceUrl required' });
} else {
  const seg = await platform.secretsProxy({
    method: 'POST',
    url: 'https://sdk.photoroom.com/v1/segment',
    headers: { 'x-api-key': '{{secrets.PHOTOROOM_API_KEY}}', 'Content-Type': 'application/json' },
    json: { image_url: src, format: 'png' },
    responseType: 'binary',
  });
  if (!seg.ok || seg.encoding !== 'base64' || !seg.body) {
    respond(502, { error: (seg && seg.error) || 'segmentation failed', code: (seg && seg.code) || 'not_binary' });
  } else {
    let storedUrl = null;
    if (origin && /^https:\\/\\//i.test(origin)) {
      try {
        const up = await fetch(origin + '/api/upload/image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageData: 'data:image/png;base64,' + seg.body,
            fileName: 'server-cutout-' + Date.now() + '.png',
          }),
        });
        if (up.ok) {
          const data = await up.json();
          if (data && data.imageUrl) storedUrl = data.imageUrl;
        }
      } catch (e) {
        console.warn('cutout upload failed: ' + String(e));
      }
    }
    if (storedUrl) respond(200, { url: storedUrl });
    else respond(200, { base64: seg.body, mimeType: 'image/png' });
  }
}
`;

let hookReady: Promise<boolean> | null = null;

/** Make sure the server function exists (create it once; refresh it when
 * HOOK_VERSION bumps). Fails soft — false means "use the client path". */
function ensureHook(): Promise<boolean> {
  if (hookReady) return hookReady;
  hookReady = (async () => {
    const workspaceId = ws()?.workspaceId;
    if (!workspaceId) return false;
    try {
      const listRes = await fetch(`/api/workspaces/${workspaceId}/hooks`);
      if (!listRes.ok) return false;
      const hooks = await listRes.json();
      const existing = Array.isArray(hooks) ? hooks.find((h: any) => h?.name === HOOK_NAME) : null;
      if (existing && typeof existing.code === 'string' && existing.code.includes(HOOK_MARKER)) return true;
      const payload = {
        name: HOOK_NAME,
        description: `Ethaion — server-side cutout ingestion (${HOOK_MARKER}): Photoroom segmentation + storage, off the customer's device.`,
        code: HOOK_CODE,
        language: 'javascript',
        enabled: true,
      };
      const res = existing
        ? await fetch(`/api/workspaces/${workspaceId}/hooks/${existing.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: HOOK_CODE, description: payload.description, enabled: true }),
          })
        : await fetch(`/api/workspaces/${workspaceId}/hooks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
      return res.ok;
    } catch (e) {
      console.warn('[Ethaion] cutout hook provisioning failed — the in-browser pipeline carries it:', e);
      return false;
    }
  })();
  return hookReady;
}

export interface ServerCutoutResult {
  /** The stored transparent PNG's durable URL — present when the server
   * did the whole round (the normal case). */
  url?: string;
  /** Rare fallback: the server segmented but could not store — the client
   * uploads these bytes exactly as it uploads its own. */
  base64?: string;
  mimeType?: string;
}

/**
 * Ask the server to cut this image out and store it. Null on ANY failure —
 * the caller falls back to the client-side pipeline (offline/legacy path).
 */
export async function serverCutout(sourceUrl: string): Promise<ServerCutoutResult | null> {
  const src = (sourceUrl || '').trim();
  if (!/^https?:\/\//i.test(src)) return null; // data URLs can't ride a JSON hook call
  try {
    const ready = await ensureHook();
    if (!ready) return null;
    const workspaceId = ws()?.workspaceId;
    const res = await fetch(`/api/workspaces/${workspaceId}/hooks/${HOOK_NAME}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceUrl: src, uploadOrigin: window.location.origin }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.url && /^https?:\/\//i.test(data.url)) return { url: data.url };
    if (typeof data?.base64 === 'string' && data.base64) return { base64: data.base64, mimeType: data.mimeType || 'image/png' };
    return null;
  } catch (e) {
    console.warn('[Ethaion] server-side cutout unavailable — falling back to the in-browser pipeline:', e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// THREE SIZES PER CUTOUT — 96px thumb · ~300px tile · the hero as stored.
// ---------------------------------------------------------------------------

interface VariantRow {
  id: number;
  source_hash: string | null;
  hero_url: string;
  thumb_url: string | null;
  tile_url: string | null;
}

/** hero_url → its variants; hydrated once per session. */
const variantMap = new Map<string, { thumb: string | null; tile: string | null }>();
let variantsHydrated: Promise<void> | null = null;
const variantJobs = new Set<string>();

export function hydrateCutoutVariants(): Promise<void> {
  if (variantsHydrated) return variantsHydrated;
  variantsHydrated = (async () => {
    try {
      const { data } = await ws().from('cutout_variants').orderBy('created_at', 'desc').limit(300).get();
      for (const row of (data || []) as VariantRow[]) {
        if (row.hero_url && !variantMap.has(row.hero_url)) {
          variantMap.set(row.hero_url, { thumb: row.thumb_url || null, tile: row.tile_url || null });
        }
      }
    } catch { /* variants are an optimisation — the hero always works */ }
  })();
  return variantsHydrated;
}

/**
 * The right-sized stored file for a surface — synchronous; returns the hero
 * URL until variants exist (they arrive at ingest time, never on view).
 */
export function cutoutVariantFor(heroUrl: string, kind: 'thumb' | 'tile'): string {
  void hydrateCutoutVariants();
  const v = variantMap.get(heroUrl);
  const url = kind === 'thumb' ? v?.thumb : v?.tile;
  return url || heroUrl;
}

function uploadDataUrl(dataUrl: string, fileName: string): Promise<string> {
  return fetch('/api/upload/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageData: dataUrl, fileName }),
  }).then(async (res) => {
    if (!res.ok) throw new Error(`variant upload failed: ${res.status}`);
    const data = await res.json();
    if (!data?.imageUrl) throw new Error('variant upload returned no URL');
    return data.imageUrl as string;
  });
}

function scaleToPng(img: HTMLImageElement, longSide: number): string | null {
  const scale = Math.min(1, longSide / Math.max(img.naturalWidth, img.naturalHeight, 1));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  try {
    return canvas.toDataURL('image/png');
  } catch {
    // A tainted canvas (the stored file came back without CORS headers) —
    // variants are skipped; the hero keeps carrying every size.
    return null;
  }
}

/**
 * Derive + store the 96px thumb and ~300px tile for a freshly stored hero
 * cutout. Fire-and-forget at INGEST time; every failure is silent because
 * the hero is always a correct (if heavier) answer.
 */
export function storeCutoutVariants(sourceHash: string | null, heroUrl: string): void {
  const hero = (heroUrl || '').trim();
  if (!/^https?:\/\//i.test(hero) || variantJobs.has(hero)) return;
  variantJobs.add(hero);
  void (async () => {
    await hydrateCutoutVariants();
    if (variantMap.has(hero)) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const loaded = await new Promise<boolean>((resolve) => {
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = hero;
    });
    if (!loaded) return;
    const thumbData = scaleToPng(img, 96);
    const tileData = scaleToPng(img, 300);
    if (!thumbData && !tileData) return;
    try {
      const stamp = Date.now();
      const thumb = thumbData ? await uploadDataUrl(thumbData, `cutout-thumb-${stamp}.png`) : null;
      const tile = tileData ? await uploadDataUrl(tileData, `cutout-tile-${stamp}.png`) : null;
      if (!thumb && !tile) return;
      await ws().from('cutout_variants').insert({ source_hash: sourceHash, hero_url: hero, thumb_url: thumb, tile_url: tile });
      variantMap.set(hero, { thumb, tile });
    } catch (e) {
      console.warn('[Ethaion] cutout variant storage failed (the hero carries every size):', e);
    }
  })();
}
