/**
 * CANDIDATE URL PARSING — the add-to-Hunt entry point (design handoff,
 * The Hunt §3). Paste a product page and the app files the candidate with
 * its maker, piece name and — where the URL carries one — a price hint.
 *
 * Two shapes of URL, handled differently:
 *   · MAKER-OWN SITES (asphalte.com/products/the-fishermans-jacket):
 *     the DOMAIN is the maker, the slug after /products/ is the piece.
 *   · MULTI-BRAND RETAILERS (ssense.com, mrporter.com, endclothing.com…):
 *     the domain is a shop, not a maker — the brand rides in the PATH
 *     (e.g. ssense.com/en-gb/men/product/<brand>/<piece>/<id>), so the
 *     parser reads it from there and never logs "Ssense" as a maker.
 *
 * Common cases handled deliberately; anything unparseable returns nulls and
 * the UI falls back to the manual entry form — never a wrong guess saved
 * silently.
 */

export interface ParsedCandidate {
  /** The maker/brand, title-cased — e.g. "Asphalte". Null when unreadable. */
  brand: string | null;
  /** The piece name, title-cased — e.g. "The Fisherman's Jacket". */
  name: string | null;
  /** The cleaned product URL (https ensured). */
  url: string | null;
}

/** Small words kept lowercase inside a title (never at the start). */
const SMALL_WORDS = new Set(['a', 'an', 'and', 'de', 'du', 'for', 'in', 'la', 'le', 'of', 'on', 'or', 'the', 'to', 'with']);

/** "the-fishermans-jacket" → "The Fisherman's Jacket" (possessive-s slugs
 * get their apostrophe back when the pattern is unambiguous). */
export function titleFromSlug(slug: string): string {
  const cleaned = decodeURIComponent(slug)
    .replace(/\.(html?|php|aspx?)$/i, '')
    .replace(/[_+]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
  if (!cleaned) return '';
  const words = cleaned.split('-').filter(Boolean).filter((w) => !/^\d{4,}$/.test(w));
  return words
    .map((word, i) => {
      let w = word.toLowerCase();
      // "fishermans" → "fisherman's": a known possessive-noun pattern.
      w = w.replace(/^(fisherman|craftsman|sportsman|workman|painter|farmer|hunter|sailor|officer)s$/i, "$1's");
      if (i > 0 && SMALL_WORDS.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
}

/** Multi-brand retailers whose domain must NEVER be logged as the maker,
 * with the path shape that carries the real brand + piece. */
const RETAILER_PATTERNS: Array<{
  host: RegExp;
  parse: (segments: string[]) => { brand: string | null; name: string | null };
}> = [
  {
    // ssense.com/en-gb/men/product/<brand-slug>/<product-slug>/<id>
    host: /(^|\.)ssense\.com$/i,
    parse: (seg) => {
      const i = seg.indexOf('product');
      if (i >= 0 && seg.length > i + 2) {
        return { brand: titleFromSlug(seg[i + 1]), name: titleFromSlug(seg[i + 2]) };
      }
      return { brand: null, name: null };
    },
  },
  {
    // mrporter.com/en-gb/mens/product/<brand>/<category>/<sub>/<piece>/<id>
    host: /(^|\.)mrporter\.com$/i,
    parse: (seg) => {
      const i = seg.indexOf('product');
      if (i >= 0 && seg.length > i + 1) {
        const brand = titleFromSlug(seg[i + 1]);
        // The piece slug is the LAST non-numeric segment after the brand.
        const tail = seg.slice(i + 2).filter((s) => !/^\d+$/.test(s));
        const name = tail.length > 0 ? titleFromSlug(tail[tail.length - 1]) : null;
        return { brand, name };
      }
      return { brand: null, name: null };
    },
  },
  {
    // endclothing.com/gb/<brand-and-piece-slug>-<sku>.html — brand is the
    // slug's leading words; too ambiguous to split — give the whole title.
    host: /(^|\.)endclothing\.com$/i,
    parse: (seg) => {
      const last = seg[seg.length - 1] || '';
      return { brand: null, name: titleFromSlug(last) };
    },
  },
  {
    // farfetch.com/uk/shopping/men/<brand-piece-slug>-item-<id>.aspx
    host: /(^|\.)farfetch\.com$/i,
    parse: (seg) => {
      const last = (seg[seg.length - 1] || '').replace(/-item-\d+.*$/i, '');
      return { brand: null, name: titleFromSlug(last) };
    },
  },
];

/** Domains that are retailers/marketplaces — never a maker — even when no
 * structured pattern matched. */
const GENERIC_RETAILERS = /(^|\.)(amazon|ebay|etsy|zalando|asos|yoox|matchesfashion|net-a-porter|vinted|grailed|depop)\./i;

function hostToMaker(host: string): string {
  const stem = host.replace(/^www\./i, '').split('.')[0] || '';
  if (!stem) return '';
  // "crockettandjones" → "Crockettandjones" is the best a domain offers —
  // still better than nothing, and correctable on the card.
  return stem
    .split('-')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * Parse a pasted product URL into { brand, name, url }. Nulls where the URL
 * doesn't carry the fact — the caller falls back to manual entry.
 */
export function parseCandidateUrl(raw: string): ParsedCandidate {
  let input = (raw || '').trim();
  if (!input) return { brand: null, name: null, url: null };
  if (!/^https?:\/\//i.test(input)) input = `https://${input}`;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { brand: null, name: null, url: null };
  }
  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split('/').filter(Boolean);

  // 1 · Known multi-brand retailers — the brand lives in the path.
  for (const retailer of RETAILER_PATTERNS) {
    if (retailer.host.test(host)) {
      const parsed = retailer.parse(segments);
      return { brand: parsed.brand, name: parsed.name, url: url.toString() };
    }
  }

  // 2 · Generic marketplaces — refuse to guess a maker off the domain.
  if (GENERIC_RETAILERS.test(host)) {
    const last = segments[segments.length - 1] || '';
    const name = /[a-z]/i.test(last) ? titleFromSlug(last) : null;
    return { brand: null, name, url: url.toString() };
  }

  // 3 · Maker-own sites — the domain IS the maker (asphalte.com → Asphalte).
  //    Shopify-style /products/<slug> is the strongest signal for the piece;
  //    otherwise the last readable slug carries it.
  const brand = hostToMaker(host) || null;
  const productsIdx = segments.findIndex((s) => /^products?$/i.test(s));
  let slug: string | null = null;
  if (productsIdx >= 0 && segments.length > productsIdx + 1) {
    slug = segments[productsIdx + 1];
  } else {
    const readable = segments.filter((s) => /[a-z]/i.test(s) && s.length > 2 && !/^(en|fr|es|de|it|gb|us|uk|men|mens|shop|collections?|pages?)$/i.test(s));
    slug = readable.length > 0 ? readable[readable.length - 1] : null;
  }
  const name = slug ? titleFromSlug(slug) : null;
  return { brand, name, url: url.toString() };
}
