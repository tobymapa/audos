/**
 * Product images for Curated Layer 2 (Pass Thirteen).
 *
 * Every product pick with a URL shows the brand's own og:image — the official
 * social-share product photo — fetched server-side by the `beau-og-image`
 * workspace hook (browsers can't read cross-origin retail pages directly).
 *
 * Caching: memory + localStorage per product URL, hits AND misses, so a
 * gap's sub-page never re-fetches the same page twice — reopening Layer 2 is
 * instant. In-flight requests are deduplicated. A pick whose page yields no
 * image (or whose image 404s) falls back to the card's neutral illustrated
 * placeholder — never a broken-image icon.
 */
import { useEffect, useState } from 'react';
import { isTransparentCutout } from './photo-enhance';

const CACHE_PREFIX = 'brummell_product_img_';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // re-check a page after a week

const memory = new Map<string, string>(); // url → image URL ('' = known none)
const inflight = new Map<string, Promise<string>>();

function workspaceIdForHooks(): string {
  return (window as any).__workspaceDb?.workspaceId || 'workspace-899782';
}

function readCache(url: string): string | null {
  if (memory.has(url)) return memory.get(url) as string;
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + url);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { img: string; t: number };
    if (typeof parsed?.img !== 'string' || typeof parsed?.t !== 'number') return null;
    if (Date.now() - parsed.t > CACHE_TTL_MS) return null;
    memory.set(url, parsed.img);
    return parsed.img;
  } catch {
    return null;
  }
}

function writeCache(url: string, img: string): void {
  memory.set(url, img);
  try {
    localStorage.setItem(CACHE_PREFIX + url, JSON.stringify({ img, t: Date.now() }));
  } catch { /* storage unavailable — memory cache still holds it */ }
}

/**
 * Resolve the official product photo (og:image) for a product URL.
 * Returns '' when the page has none or can't be read — the card then keeps
 * its neutral placeholder.
 */
export async function fetchProductImage(url: string | null | undefined): Promise<string> {
  const clean = (url || '').trim();
  if (!clean || !/^https?:\/\//i.test(clean)) return '';
  const cached = readCache(clean);
  if (cached != null) return cached;
  if (inflight.has(clean)) return inflight.get(clean) as Promise<string>;

  const job = (async () => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceIdForHooks()}/hooks/beau-og-image/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: clean }),
      });
      if (!res.ok) throw new Error(`og-image hook failed: ${res.status}`);
      const data = await res.json();
      const img = typeof data?.images?.[clean] === 'string' ? data.images[clean] : '';
      writeCache(clean, img);
      return img;
    } catch (e) {
      console.warn('[Ethaion] product image fetch failed:', e);
      // A FAILED fetch (hook unreachable, network blip) is remembered only
      // for this session — persisting it for a week left every card on that
      // product imageless long after the hiccup passed. Only a page that was
      // successfully read and genuinely has no og:image persists as a miss.
      memory.set(clean, '');
      return '';
    } finally {
      inflight.delete(clean);
    }
  })();
  inflight.set(clean, job);
  return job;
}

/**
 * The image block at the top of a Layer 2 pick card: the brand's product
 * photo when the linked page provides one, otherwise the neutral `fallback`
 * placeholder — never a broken-image icon.
 *
 * NO PLATE, NO GROUND, NO BOX. The mat border and sepia plate treatment is
 * retired here as it already is on the Fitting's shelf and on the shared
 * product plate (product-photo.tsx): a product photograph floats on the
 * card's own paper, with nothing drawn behind it and nothing around it. The
 * block still RESERVES its height, so a late-loading retailer image cannot
 * reflow the grid — reserved space, not a plate. A photograph that arrives on
 * a studio-white ground multiplies into the paper instead of sitting on it as
 * a pale rectangle; a genuine transparent cutout is drawn as-is.
 */
export function ProductImage({
  url,
  alt,
  fallback,
  className = '',
}: {
  url: string | null | undefined;
  alt: string;
  fallback?: React.ReactNode;
  className?: string;
}) {
  const [src, setSrc] = useState<string>(() => readCache((url || '').trim()) || '');
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    let active = true;
    setBroken(false);
    void fetchProductImage(url).then((img) => {
      if (active) setSrc(img);
    });
    return () => {
      active = false;
    };
  }, [url]);

  const showPhoto = !!src && !broken;
  return (
    <div
      className={`w-full h-44 flex items-center justify-center overflow-hidden ${className}`}
      style={{ background: 'transparent', border: 'none', boxShadow: 'none', borderRadius: 0 }}
    >
      {showPhoto ? (
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-contain"
          loading="lazy"
          style={{ mixBlendMode: isTransparentCutout(src) ? 'normal' : 'multiply' }}
          onError={() => setBroken(true)}
        />
      ) : (
        fallback ?? null
      )}
    </div>
  );
}
