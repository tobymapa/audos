/**
 * THE HUNT — Discover's brand-entry helpers (brand fields & import overhaul).
 *
 * Three ways into the maker directory share these utilities:
 *  · PASTE A URL — normalizeSiteUrl / nameFromUrl / fetchSiteMeta read the
 *    brand's NAME and MARK off its own page (og:site_name / og:image via the
 *    platform's server-side cheerio scraper — a browser cannot read
 *    cross-origin pages), failing soft to the domain stem and the favicon
 *    service so a blocked page never blocks the entry.
 *  · UPLOAD A FILE — parseBrandImportFile reads a .txt (one entry per line)
 *    or .xlsx (first column of data rows; SheetJS loaded once from its
 *    official CDN, the same loader the discovery log uses) into a list of
 *    {name, url, logoUrl} entries, URL-vs-plain-name detected per line.
 *
 * The personal per-brand file (status / note / known for / specialisations /
 * signature pieces / logo) lives in the SAME `brand_index` table the
 * Reserve's Brand Index uses (profile-data.ts) — one ledger, so a Trusted
 * or Avoided status set from Discover feeds Beau's trustedBrands /
 * avoidedBrands signals exactly like one set from the Reserve.
 */

// ---------------------------------------------------------------------------
// URL primitives
// ---------------------------------------------------------------------------

/** Normalise pasted input into a valid https URL, or null when unparseable. */
export function normalizeSiteUrl(raw: string): string | null {
  let url = (raw || '').trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    void new URL(url);
    return url;
  } catch {
    return null;
  }
}

export function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./i, '') || null;
  } catch {
    return null;
  }
}

/** The favicon-service fallback — always resolvable from just the domain. */
export function faviconFor(url: string): string | null {
  const domain = domainOf(url);
  return domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128` : null;
}

/** A brand-name guess from the domain: “anglo-italian.com” → “Anglo Italian”. */
export function nameFromUrl(url: string): string {
  const domain = domainOf(url);
  if (!domain) return '';
  const stem = domain.split('.')[0] || '';
  return stem
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** True when a line/cell reads as a URL rather than a plain brand name. */
export function looksLikeUrl(text: string): boolean {
  const t = (text || '').trim();
  if (!t || /\s/.test(t)) return false;
  if (/^https?:\/\//i.test(t)) return true;
  return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(\/\S*)?$/i.test(t);
}

// ---------------------------------------------------------------------------
// Site metadata — the brand's own name and mark, read off its page
// ---------------------------------------------------------------------------

/** Reads the page's site name, title, OG/twitter images and declared icons. */
const SITE_META_PAGE_FUNCTION = `async function pageFunction(context) {
  const { $, request } = context;
  const og = [];
  const icons = [];
  const push = (list, raw) => {
    const value = String(raw || '').trim();
    if (!value || value.indexOf('data:') === 0) return;
    let absolute = value;
    try { absolute = new URL(value, request.url).toString(); } catch (e) { return; }
    if (!/^https?:\\/\\//i.test(absolute)) return;
    if (list.indexOf(absolute) === -1) list.push(absolute);
  };
  $('meta[property="og:image"], meta[property="og:image:secure_url"], meta[name="twitter:image"], meta[name="twitter:image:src"]').each((i, el) => push(og, $(el).attr('content')));
  $('link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"], link[rel="icon"], link[rel="shortcut icon"]').each((i, el) => push(icons, $(el).attr('href')));
  const siteName = String($('meta[property="og:site_name"]').attr('content') || '').trim();
  const title = String($('title').first().text() || '').trim();
  return { url: request.url, og: og.slice(0, 5), icons: icons.slice(0, 5), siteName, title };
}`;

export interface SiteMeta {
  /** The brand name read off the page (og:site_name, then the title stem,
   * then the domain stem) — never empty for a valid URL. */
  name: string;
  /** OG image first, a declared icon next, the favicon service last. */
  logoUrl: string | null;
}

/**
 * Read a brand site's name + logo. Never throws — a blocked or unreadable
 * page falls back to the domain-stem name and the favicon service.
 */
export async function fetchSiteMeta(pageUrl: string): Promise<SiteMeta> {
  const clean = normalizeSiteUrl(pageUrl);
  if (!clean) return { name: '', logoUrl: null };
  let name = '';
  let logo: string | null = null;
  try {
    const res = await fetch('/api/apify/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actorId: 'apify/cheerio-scraper',
        input: {
          startUrls: [{ url: clean }],
          pageFunction: SITE_META_PAGE_FUNCTION,
          maxRequestsPerCrawl: 1,
          proxyConfiguration: { useApifyProxy: true },
        },
        timeout: 2,
        parseWithGPT: false,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const row = Array.isArray(data?.results) ? data.results[0] : null;
      const isHttp = (u: unknown): u is string => typeof u === 'string' && /^https?:\/\//i.test(u);
      const og = (Array.isArray(row?.og) ? row.og : []).find(isHttp);
      const icon = (Array.isArray(row?.icons) ? row.icons : []).find(isHttp);
      logo = og || icon || null;
      const siteName = typeof row?.siteName === 'string' ? row.siteName.trim() : '';
      const title = typeof row?.title === 'string' ? row.title.trim() : '';
      // Titles read “Brand | Official Site” — the stem before the separator
      // is the name. Hyphenated brand names survive: the separator must be
      // whitespace-parted.
      name = siteName || (title ? title.split(/\s+[|·–—-]\s+/)[0].trim() : '');
    }
  } catch (e) {
    console.warn('[Ethaion] brand site read failed — falling back to the domain stem + favicon:', e);
  }
  return { name: name || nameFromUrl(clean), logoUrl: logo || faviconFor(clean) };
}

// ---------------------------------------------------------------------------
// File import — .txt (one entry per line) and .xlsx (first column of rows)
// ---------------------------------------------------------------------------

export interface BrandImportEntry {
  name: string;
  url: string | null;
  /** Favicon-service logo for URL rows — instant, no scrape per row. */
  logoUrl: string | null;
}

const MAX_IMPORT_ENTRIES = 100;

/** Header cells/lines that are labels, not brands. */
const HEADER_WORDS = new Set(['brand', 'brands', 'brand name', 'name', 'names', 'maker', 'makers', 'url', 'urls', 'website', 'websites', 'link', 'links']);

/** Strip list furniture (“- ”, “* ”, “3. ”) without touching names like 100Hands. */
function cleanImportValue(raw: string): string {
  return (raw || '').replace(/^\s*(?:[-*•]|\d{1,3}[.)])\s+/, '').trim();
}

/** Load SheetJS from its official CDN once (script tag — no bundler needed). */
async function loadSheetJS(): Promise<any> {
  const w = window as any;
  if (w.XLSX) return w.XLSX;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('could not load the spreadsheet reader'));
    document.head.appendChild(script);
  });
  if (!w.XLSX) throw new Error('spreadsheet reader unavailable');
  return w.XLSX;
}

function toEntries(values: string[]): BrandImportEntry[] {
  const entries: BrandImportEntry[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = cleanImportValue(raw);
    if (!value || HEADER_WORDS.has(value.toLowerCase())) continue;
    let entry: BrandImportEntry;
    if (looksLikeUrl(value)) {
      const url = normalizeSiteUrl(value);
      if (!url) continue;
      const name = nameFromUrl(url);
      if (!name) continue;
      entry = { name, url, logoUrl: faviconFor(url) };
    } else {
      entry = { name: value, url: null, logoUrl: null };
    }
    const key = entry.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
    if (entries.length >= MAX_IMPORT_ENTRIES) break;
  }
  return entries;
}

/**
 * Parse an uploaded brand list into import entries. `.txt` reads one entry
 * per line; `.xlsx` reads the FIRST COLUMN of the first sheet's data rows.
 * Lines/cells that read as URLs come back with the URL and a favicon logo;
 * plain names come back as-is. Throws with a human-readable message when
 * the file can't be read.
 */
export async function parseBrandImportFile(file: File): Promise<BrandImportEntry[]> {
  const lower = (file.name || '').toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    const XLSX = await loadSheetJS();
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new Error('That spreadsheet has no readable sheet — check the file and try again.');
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
    const firstColumn = rows.map((row) => (Array.isArray(row) ? String(row[0] ?? '').trim() : '')).filter(Boolean);
    return toEntries(firstColumn);
  }
  if (lower.endsWith('.txt') || file.type.startsWith('text/')) {
    const text = await file.text();
    return toEntries(text.split(/\r?\n/));
  }
  throw new Error('That file type isn\u2019t supported — a .txt (one brand per line) or .xlsx (brands in the first column) works.');
}
