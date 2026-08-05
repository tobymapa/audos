/**
 * Browse — the consequence-free sandbox, now the PASSIVE mode of the unified
 * Scout tab (Pass Twelve: the standalone Explore tab was merged into Scout).
 *
 * Browse and experiment without touching anything: no style profile reads,
 * no Curated influence, no wardrobe writes. A standalone search (scoped to
 * this mode only) plus standalone filters (category, material, price range,
 * occasion) that persist between visits — but ONLY here: they never touch
 * Scout's hunts, Curated or any other tab. Results are AI-curated from brand
 * sites, established menswear retailers and vetted editorial ONLY (never
 * Reddit, Quora or forums) and deliberately NOT personalised. Results now
 * persist between sessions too (localStorage). Nothing leaves this mode —
 * the View link on a result is the only action.
 */
import { useEffect, useState } from 'react';
import {
  Compass,
  ExternalLink,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import { tw, typography } from '../../lib/colors';
import {
  OCCASION_TAGS,
  WARDROBE_CATEGORIES,
  categoryLabel,
  currencySymbol,
} from './profile-data';
import { fetchFeedPhoto } from './wardrobe-ai';
import { fetchProductImage } from './og-image';
import { PickCardsSkeleton, ShimmerDefs, Skeleton } from './skeleton';

// ---------------------------------------------------------------------------
// Sandboxed search engine — web search + neutral curation, no profile input
// ---------------------------------------------------------------------------

interface ExploreResult {
  name: string;
  brand: string;
  price: string;
  blurb: string;
  link: string;
  photoQuery: string;
}

const MATERIAL_FILTERS = ['Any material', 'Cotton', 'Wool', 'Linen', 'Leather', 'Denim', 'Silk', 'Waxed cotton', 'Suede'];

// ---------------------------------------------------------------------------
// Source policy (Pass Five): Explore pulls from brand sites, established
// menswear retailers, and vetted menswear editorial ONLY. Reddit, Quora and
// general web forums are NEVER sources — results are brand/product-level.
// ---------------------------------------------------------------------------

/** Domains that are never acceptable Explore sources. */
const BLOCKED_SOURCES = /reddit\.com|quora\.com|pinterest\.|stackexchange\.com|stackoverflow\.com|styleforum\.net|askandyaboutclothes|thefedoralounge|facebook\.com|instagram\.com|twitter\.com|x\.com|tiktok\.com|youtube\.com|wikihow\.com|wikipedia\.org|answers\.|\/forum(s)?\/|\/thread(s)?\//i;

/** The retailer + editorial canon the results should come from. */
const APPROVED_SOURCES = [
  'mrporter.com', 'endclothing.com', 'beams-plus.com', 'drakes.com', 'trunkclothiers.com',
  'nomanwalksalone.com', 'therake.com', 'permanentstyle.com', 'putthison.com',
  'sonofastag.com', 'clutchcafe.com', 'oipolloi.com', 'johnsimons.co.uk', 'kafka-mercantile.com',
  'frans-boone-store.com', 'anatomica.jp', 'lostandfound.it', 'shopcanoeclub.com', 'independence-chicago.com',
  'unionmadegoods.com', 'selfedge.com', 'blueingreensoho.com', 'standardandstrange.com',
];

function extractJson(text: string): any {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function searchWeb(query: string): Promise<Array<{ title: string; link: string; snippet: string }>> {
  try {
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, searchType: 'web', num: 10 }),
    });
    const data = await res.json();
    if (!data.success) return [];
    const results = (data.results || []) as Array<{ title: string; link: string; snippet: string }>;
    // Hard source filter: forums, Q&A sites and social feeds never reach the
    // model — Explore is brand/retailer/editorial only.
    return results.filter((r) => !BLOCKED_SOURCES.test(r.link || ''));
  } catch {
    return [];
  }
}

const EXPLORE_SYSTEM = `You are a menswear research assistant for an "Explore" sandbox. The user is browsing freely — you know NOTHING about them and must not personalise. Ground every product in the provided web search results.

SOURCE POLICY (strict): only surface products found on brand websites, established menswear retailers (Mr Porter, End Clothing, Beams+, Drake's, Trunk Clothiers, No Man Walks Alone, and comparable specialist shops) and vetted menswear editorial (The Rake, Permanent Style, Put This On). NEVER cite or draw from Reddit, Quora, Pinterest, social media, or general web forums — if a search result is forum or Q&A content, ignore it entirely. Every result must be a specific brand + product, not an article summary or discussion.

Respond ONLY with strict JSON (no markdown):
{
  "results": [
    {
      "name": string,       // product name
      "brand": string,
      "price": string,      // from the search results, with currency symbol; approximate with "~" if unsure; "" if unknown
      "blurb": string,      // ONE neutral, factual sentence: what it is and what's notable (fabric, construction, maker)
      "link": string,       // a brand/retailer URL that APPEARS in the search results, else ""
      "photoQuery": string  // stock-photo phrase for a representative product photo
    }
  ]
}

Rules: 4–8 real products from the results; respect any stated filters (category, material, price range, occasion); never invent URLs or prices; no personal reasoning ("for you", "your style") — this is a sandbox; keep every string tight.`;

async function runExploreSearch(query: string, filterLine: string): Promise<ExploreResult[]> {
  // Two passes: one scoped to the retailer/editorial canon, one open (with
  // forums excluded at both the query and the filter level).
  const scoped = `${query} ${filterLine} (${APPROVED_SOURCES.slice(0, 6).map((d) => `site:${d}`).join(' OR ')})`.replace(/\s+/g, ' ').trim();
  const open = `${query} ${filterLine} menswear buy -site:reddit.com -site:quora.com -site:pinterest.com`.replace(/\s+/g, ' ').trim();
  const [scopedResults, openResults] = await Promise.all([searchWeb(scoped), searchWeb(open)]);
  const seen = new Set<string>();
  const results = [...scopedResults, ...openResults].filter((r) => {
    if (!r.link || seen.has(r.link)) return false;
    seen.add(r.link);
    return true;
  }).slice(0, 12);
  const res = await fetch('/proxy/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: EXPLORE_SYSTEM },
        {
          role: 'user',
          content: [
            `SEARCH: ${query}`,
            filterLine ? `FILTERS: ${filterLine}` : null,
            results.length > 0
              ? `WEB SEARCH RESULTS:\n${results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet}\n   ${r.link}`).join('\n\n')}`
              : 'WEB SEARCH RESULTS: none available — reason from general menswear knowledge and leave link empty.',
          ].filter(Boolean).join('\n\n'),
        },
      ],
      max_tokens: 1400,
      temperature: 0.6,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error('Explore is unreachable right now — try again in a moment.');
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  const parsed = typeof content === 'string' ? extractJson(content) : null;
  const raw: any[] = Array.isArray(parsed?.results) ? parsed.results : [];
  const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  return raw
    .map((r) => ({
      name: clean(r?.name),
      brand: clean(r?.brand),
      price: clean(r?.price),
      blurb: clean(r?.blurb),
      link: clean(r?.link),
      photoQuery: clean(r?.photoQuery) || 'classic menswear product',
    }))
    .filter((r) => r.name)
    .slice(0, 8);
}

// ---------------------------------------------------------------------------
// Result card — Curated's visual treatment, labelled as Explore
// ---------------------------------------------------------------------------

function ExplorePhoto({
  cacheId,
  query,
  alt,
  productUrl,
}: {
  cacheId: string;
  query: string;
  alt: string;
  /** The result's product page — its og:image is preferred over stock photography. */
  productUrl?: string | null;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    void (async () => {
      // Pass Fourteen: the real product photo (og:image, cached per URL — the
      // same mechanic Curated uses) first; stock photography as the fallback;
      // the labelled tile last — never a broken-image icon.
      if (productUrl && productUrl.trim()) {
        const clean = productUrl.trim().startsWith('http') ? productUrl.trim() : `https://${productUrl.trim()}`;
        const img = await fetchProductImage(clean);
        if (cancelled) return;
        if (img) {
          setUrl(img);
          return;
        }
      }
      const u = await fetchFeedPhoto(cacheId, query);
      if (cancelled) return;
      if (u) setUrl(u);
      else setFailed(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [cacheId, query, productUrl]);
  if (url) return <img src={url} alt={alt} className="hab-plate w-full h-36 object-contain bg-[#fbf8f1]" loading="lazy" width={300} height={144} onError={() => setFailed(true)} />;
  return (
    <div className="w-full h-36 bg-[var(--space-surface-muted)] flex items-center justify-center">
      {failed ? (
        <span className={`${typography.size.xs} ${typography.color.muted} px-3 text-center`}>{alt}</span>
      ) : (
        /* Shimmer while the photo resolves — never a generic spinner */
        <>
          <ShimmerDefs />
          <Skeleton className="w-full h-full" />
        </>
      )}
    </div>
  );
}

// Explore results stand alone — the View link is the only action. Anything
// worth keeping goes through the Saved tab's own intake (or Beau in chat),
// keeping Explore truly consequence-free.

// ---------------------------------------------------------------------------
// Explore tab root — filters persist between visits (localStorage), scoped
// to THIS tab only: they never leak into Scout, Curated or the profile.
// ---------------------------------------------------------------------------

const EXPLORE_FILTERS_KEY = 'brummell_explore_filters';
const EXPLORE_RESULTS_KEY = 'brummell_explore_results';

interface StoredResults {
  results: ExploreResult[];
  searchedFor: string;
  seq: number;
}

function readStoredResults(): StoredResults | null {
  try {
    const raw = localStorage.getItem(EXPLORE_RESULTS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.results) || parsed.results.length === 0) return null;
    return {
      results: parsed.results,
      searchedFor: typeof parsed.searchedFor === 'string' ? parsed.searchedFor : '',
      seq: typeof parsed.seq === 'number' ? parsed.seq : 1,
    };
  } catch {
    return null;
  }
}

interface ExploreFilters {
  category: string;
  material: string;
  minPrice: string;
  maxPrice: string;
  occasion: string;
}

function readStoredFilters(): ExploreFilters {
  const fallback: ExploreFilters = { category: '', material: MATERIAL_FILTERS[0], minPrice: '', maxPrice: '', occasion: '' };
  try {
    const raw = localStorage.getItem(EXPLORE_FILTERS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      category: typeof parsed.category === 'string' ? parsed.category : '',
      material: typeof parsed.material === 'string' && MATERIAL_FILTERS.includes(parsed.material) ? parsed.material : MATERIAL_FILTERS[0],
      minPrice: typeof parsed.minPrice === 'string' ? parsed.minPrice : '',
      maxPrice: typeof parsed.maxPrice === 'string' ? parsed.maxPrice : '',
      occasion: typeof parsed.occasion === 'string' ? parsed.occasion : '',
    };
  } catch {
    return fallback;
  }
}

export function ExploreBrowse() {
  const stored = readStoredFilters();
  const storedResults = readStoredResults();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>(stored.category);
  const [material, setMaterial] = useState<string>(stored.material);
  const [minPrice, setMinPrice] = useState(stored.minPrice);
  const [maxPrice, setMaxPrice] = useState(stored.maxPrice);
  const [occasion, setOccasion] = useState<string>(stored.occasion);

  // Persist the filters (browse-scoped only) whenever they change.
  useEffect(() => {
    try {
      localStorage.setItem(EXPLORE_FILTERS_KEY, JSON.stringify({ category, material, minPrice, maxPrice, occasion }));
    } catch { /* storage unavailable — filters simply stay session-local */ }
  }, [category, material, minPrice, maxPrice, occasion]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Results persist between sessions — the last browse is waiting on return.
  const [results, setResults] = useState<ExploreResult[] | null>(storedResults?.results ?? null);
  const [searchedFor, setSearchedFor] = useState(storedResults?.searchedFor ?? '');
  const [searchSeq, setSearchSeq] = useState(storedResults?.seq ?? 0);

  const filterLine = [
    category ? `category: ${categoryLabel(category)}` : null,
    material !== MATERIAL_FILTERS[0] ? `material: ${material}` : null,
    minPrice.trim() || maxPrice.trim()
      ? `price range: ${minPrice.trim() ? currencySymbol() + minPrice.trim() : 'any'} to ${maxPrice.trim() ? currencySymbol() + maxPrice.trim() : 'any'}`
      : null,
    occasion ? `occasion: ${OCCASION_TAGS.find((o) => o.id === occasion)?.label || occasion}` : null,
  ].filter(Boolean).join('; ');

  const run = async () => {
    if (busy) return;
    const q = query.trim();
    if (!q && !filterLine) {
      setError('Type what you want to explore — or set a filter or two.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const found = await runExploreSearch(q || 'interesting quality menswear pieces', filterLine);
      setResults(found);
      setSearchedFor(q || filterLine);
      setSearchSeq((s) => {
        const next = s + 1;
        if (found.length > 0) {
          try {
            localStorage.setItem(EXPLORE_RESULTS_KEY, JSON.stringify({ results: found, searchedFor: q || filterLine, seq: next }));
          } catch { /* storage unavailable — results simply stay session-local */ }
        }
        return next;
      });
      if (found.length === 0) setError('Nothing surfaced for that — try different words or looser filters.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Explore failed — try again.');
    } finally {
      setBusy(false);
    }
  };

  const filterPill = (active: boolean) =>
    `px-2.5 py-1 rounded-full ${typography.size.xs} border transition-colors ${
      active
        ? 'bg-[var(--space-surface-accent-soft)] text-[var(--space-brand-primary-700)] border-[var(--space-brand-primary)]'
        : 'bg-[var(--space-surface-card)] border-[var(--space-border-default)] text-[var(--space-text-muted)] hover:border-[var(--space-border-strong)] hover:text-[var(--space-text-primary)]'
    }`;

  return (
    <div className="space-y-5">
      <div>
        <h4 className={`${typography.size.lg} ${typography.weight.semibold} ${typography.color.primary} flex items-center gap-2`}>
          <Compass className="w-5 h-5 text-[var(--space-text-brand)]" />
          Browse the market
        </h4>
        <p className={`${typography.size.sm} ${typography.color.secondary} mt-1 max-w-lg`}>
          A sandbox for browsing and experimenting — search anything, filter freely, follow tangents.
        </p>
        <p className={`${typography.size.xs} ${typography.color.muted} mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-[var(--space-surface-muted)] px-3 py-1`}>
          <Compass className="w-3 h-3" />
          Browsing freely — nothing here touches your profile, hunts or other tabs
        </p>
      </div>

      {/* Standalone search — scoped to browsing only */}
      <div className={`${tw.card.default} rounded-2xl p-4`}>
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void run();
            }}
            placeholder="Search pieces, brands or styles…"
            className={`${tw.input.base} ${tw.input.default} ${typography.size.sm} flex-1 min-w-0`}
            aria-label="Explore search"
          />
          <button
            type="button"
            onClick={() => void run()}
            disabled={busy}
            className={`px-4 py-2 rounded-lg ${typography.size.sm} inline-flex items-center gap-1.5 ${tw.button.primary} disabled:opacity-50`}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Browse
          </button>
        </div>
        {/* Example prompts live BELOW the input (they were getting cut off as
            placeholder text) — full hint always visible, wraps cleanly. */}
        <p className={`${typography.size.xs} ${typography.color.muted} mt-1.5 leading-snug`}>
          Try: “camp collar shirts” · “Japanese denim brands” · “what goes with a rust knit”
        </p>

        {/* Standalone filters — kept between visits, but scoped to Explore only */}
        <div className="mt-3 space-y-2.5">
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className={`${typography.size.xs} ${typography.color.muted} mr-1`} style={{ fontSize: '10px' }}>Category</span>
            <button type="button" onClick={() => setCategory('')} className={filterPill(category === '')}>Any</button>
            {WARDROBE_CATEGORIES.filter((c) => c.id !== 'other').map((c) => (
              <button key={c.id} type="button" onClick={() => setCategory(category === c.id ? '' : c.id)} className={filterPill(category === c.id)}>
                {c.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className={`${typography.size.xs} ${typography.color.muted} mr-1`} style={{ fontSize: '10px' }}>Material</span>
            {MATERIAL_FILTERS.map((m) => (
              <button key={m} type="button" onClick={() => setMaterial(m)} className={filterPill(material === m)}>
                {m}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className={`${typography.size.xs} ${typography.color.muted} mr-1`} style={{ fontSize: '10px' }}>Occasion</span>
            <button type="button" onClick={() => setOccasion('')} className={filterPill(occasion === '')}>Any</button>
            {OCCASION_TAGS.map((o) => (
              <button key={o.id} type="button" onClick={() => setOccasion(occasion === o.id ? '' : o.id)} className={filterPill(occasion === o.id)}>
                {o.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className={`${typography.size.xs} ${typography.color.muted} mr-1`} style={{ fontSize: '10px' }}>Price</span>
            <span className={`${typography.size.xs} ${typography.color.muted}`}>{currencySymbol()}</span>
            <input
              type="number"
              min={0}
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              placeholder="min"
              className={`w-16 px-2 py-1 rounded-lg border border-[var(--space-border-default)] bg-[var(--space-surface-card)] ${typography.size.xs} focus:outline-none focus:ring-1 focus:ring-[var(--space-brand-primary)]`}
              aria-label="Minimum price"
            />
            <span className={`${typography.size.xs} ${typography.color.muted}`}>– {currencySymbol()}</span>
            <input
              type="number"
              min={0}
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              placeholder="max"
              className={`w-16 px-2 py-1 rounded-lg border border-[var(--space-border-default)] bg-[var(--space-surface-card)] ${typography.size.xs} focus:outline-none focus:ring-1 focus:ring-[var(--space-brand-primary)]`}
              aria-label="Maximum price"
            />
            {(category || material !== MATERIAL_FILTERS[0] || occasion || minPrice || maxPrice) && (
              <button
                type="button"
                onClick={() => {
                  setCategory('');
                  setMaterial(MATERIAL_FILTERS[0]);
                  setOccasion('');
                  setMinPrice('');
                  setMaxPrice('');
                }}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg ${typography.size.xs} ${tw.button.ghost} border border-[var(--space-border-default)]`}
              >
                <X className="w-3 h-3" /> Clear filters
              </button>
            )}
          </div>
        </div>
      </div>

      {error && <p className={`${typography.size.xs} text-[var(--space-semantic-warning)]`}>{error}</p>}

      {/* Browse running (Pass Forty-Six): the incoming results show as
          shimmer card ghosts in the grid they'll land in — never a blank
          area, never a bare spinner. */}
      {busy && (
        <div>
          <p className={`${typography.size.xs} uppercase tracking-[0.18em] ${typography.weight.medium} ${typography.color.secondary} mb-2`}>
            Browsing the market…
          </p>
          <PickCardsSkeleton cards={4} columns="grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" />
        </div>
      )}

      {/* Results — Curated's visual language, explicitly labelled Explore */}
      {!busy && results && results.length > 0 && (
        <div>
          <p className={`${typography.size.xs} uppercase tracking-[0.18em] ${typography.weight.medium} ${typography.color.secondary} mb-2`}>
            Browse results · {searchedFor}
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {results.map((r, idx) => (
              <div key={`${r.name}-${idx}`} className={`${tw.card.default} rounded-2xl overflow-hidden flex flex-col`}>
                <ExplorePhoto cacheId={`explore-${searchSeq}-${idx}`} query={r.photoQuery} alt={`${r.brand} ${r.name}`} productUrl={r.link} />
                <div className="p-3.5 flex flex-col flex-1">
                  {r.brand && (
                    <p className={`${typography.size.xs} uppercase tracking-[0.15em] ${typography.color.muted}`}>{r.brand}</p>
                  )}
                  <p className={`${typography.size.sm} ${typography.weight.semibold} ${typography.color.primary} mt-0.5`}>{r.name}</p>
                  {r.price && <p className={`${typography.size.xs} ${typography.color.secondary} mt-0.5`}>{r.price}</p>}
                  {r.blurb && (
                    <p className={`${typography.size.xs} ${typography.color.muted} mt-2 leading-relaxed flex-1`}>{r.blurb}</p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    {r.link && (
                      <a
                        href={r.link.startsWith('http') ? r.link : `https://${r.link}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center gap-1 mt-2 ${typography.size.xs} ${typography.color.brand} hover:underline`}
                      >
                        View <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className={`${typography.size.xs} ${typography.color.muted} mt-3`} style={{ fontSize: '10px' }}>
            Results come from brand sites, established menswear retailers and vetted editorial — never forums.
            Photography is representative, not the exact listing. Nothing here touches your profile, and your last
            browse is kept for next time.
          </p>
        </div>
      )}

      {!results && !busy && (
        <div className="text-center py-8">
          <Compass className="w-8 h-8 mx-auto text-[var(--space-text-muted)]" />
          <p className={`${typography.size.sm} ${typography.color.primary} font-medium mt-2`}>Wander without consequences</p>
          <p className={`${typography.size.xs} ${typography.color.muted} mt-1 max-w-sm mx-auto`}>
            Search a style you’ve never tried, a brand you’re curious about, or a piece you’d never actually buy.
            Your profile, The Rail’s picks and your wardrobe stay exactly as they are.
          </p>
        </div>
      )}
    </div>
  );
}
