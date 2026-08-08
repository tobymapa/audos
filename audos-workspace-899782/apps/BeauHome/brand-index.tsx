/**
 * BRAND INDEX — The Reserve's second sub-tab (alongside The Watchlist).
 *
 * A personal ledger of makers: who the user trusts, who he's curious about,
 * and who he's ruled out. Each entry holds the brand name, its site URL, an
 * auto-fetched logo (the site's OG image, falling back to its favicon), a
 * status, a personal note, what the maker is known for, its specialisations
 * and its signature pieces.
 *
 * BEAU INTEGRATION (profile-data.ts · fetchBrandSignals):
 *  · Trusted  — a positive preference signal: merged into the profile's
 *    trustedBrands array (with the older loyalty list) and synced into the
 *    style rubric, so Beau checks these makers first when hunting gaps.
 *  · Curious  — personal tracking only; never reaches Beau.
 *  · Avoided  — the profile's avoidedBrands exclusion list: Beau never
 *    recommends these makers.
 *
 * Design: the Warm Editorial register — hairline-parted rows on paper, no
 * shadows outside the shared sheet pattern, Cormorant heads over Lora body.
 * Status chips carry the palette's registers: Trusted in oxblood, Curious
 * in muted walnut, Avoided in neutral grey.
 */
import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { tw, typography } from '../../lib/colors';
import { HairlineRowsSkeleton } from './skeleton';
import {
  BRAND_INDEX_CHANGED_EVENT,
  addBrandIndexEntry,
  deleteBrandIndexEntry,
  updateBrandIndexEntry,
  type BrandIndexEntry,
  type BrandIndexStatus,
} from './profile-data';

// ---------------------------------------------------------------------------
// Status registers — colour-coded per the Ethaion palette: Trusted = oxblood,
// Curious = muted walnut, Avoided = neutral grey.
// ---------------------------------------------------------------------------

const STATUS_META: Record<BrandIndexStatus, { label: string; color: string; border: string; bg: string; line: string }> = {
  trusted: {
    label: 'Trusted',
    color: '#8B3A3A',
    border: 'rgba(139,58,58,0.55)',
    bg: 'rgba(139,58,58,0.08)',
    line: 'Feeds Beau — he checks this maker first when hunting your gaps.',
  },
  curious: {
    label: 'Curious',
    color: 'var(--color-neutral-600,#8A7F70)',
    border: 'var(--color-divider,#D9CFBE)',
    bg: 'transparent',
    line: 'Your own tracking only — no influence on Beau’s recommendations.',
  },
  avoided: {
    label: 'Avoided',
    color: '#8A857C',
    border: '#CCC7BD',
    bg: '#EDE8DF',
    line: 'Excluded — Beau never recommends this maker.',
  },
};

function StatusChip({ status, small = false }: { status: BrandIndexStatus; small?: boolean }) {
  const meta = STATUS_META[status];
  return (
    <span
      className="uppercase inline-flex items-center rounded border flex-shrink-0"
      style={{
        fontFamily: 'var(--space-font-heading)',
        fontSize: small ? '10px' : '11px',
        letterSpacing: '0.12em',
        fontWeight: 500,
        color: meta.color,
        borderColor: meta.border,
        background: meta.bg,
        padding: small ? '2px 8px' : '4px 10px',
      }}
    >
      {meta.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Logo fetching — paste a URL, get the site's OG image; favicon fallback.
// The OG read runs through the platform's server-side scraper (the same
// apify/cheerio-scraper the discovery log and product-images use — a browser
// cannot read cross-origin pages) and fails soft to the favicon service.
// ---------------------------------------------------------------------------

function normalizeSiteUrl(raw: string): string | null {
  let url = (raw || '').trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    // Validates the URL; anything unparseable is treated as no URL at all.
    void new URL(url);
    return url;
  } catch {
    return null;
  }
}

function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./i, '') || null;
  } catch {
    return null;
  }
}

/** The favicon-service fallback — always resolvable from just the domain. */
function faviconFor(url: string): string | null {
  const domain = domainOf(url);
  return domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128` : null;
}

/** A default brand-name guess from the domain, e.g. drakes.com → “Drakes”. */
function nameFromUrl(url: string): string {
  const domain = domainOf(url);
  if (!domain) return '';
  const stem = domain.split('.')[0] || '';
  return stem ? stem.charAt(0).toUpperCase() + stem.slice(1) : '';
}

/** Reads the page's OG/twitter image and its declared icons, in page order. */
const LOGO_PAGE_FUNCTION = `async function pageFunction(context) {
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
  return { url: request.url, og: og.slice(0, 5), icons: icons.slice(0, 5) };
}`;

/**
 * The logo for a brand site: its OG image first, then a declared page icon,
 * then the favicon service. Never throws — a blocked page simply means the
 * favicon fallback carries it.
 */
async function fetchBrandLogo(pageUrl: string): Promise<string | null> {
  const clean = normalizeSiteUrl(pageUrl);
  if (!clean) return null;
  try {
    const res = await fetch('/api/apify/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actorId: 'apify/cheerio-scraper',
        input: {
          startUrls: [{ url: clean }],
          pageFunction: LOGO_PAGE_FUNCTION,
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
      if (og) return og;
      const icon = (Array.isArray(row?.icons) ? row.icons : []).find(isHttp);
      if (icon) return icon;
    }
  } catch (e) {
    console.warn('[Ethaion] brand logo read failed — falling back to the favicon:', e);
  }
  return faviconFor(clean);
}

// ---------------------------------------------------------------------------
// Logo tile — the fetched mark on a paper plate; the brand's initial while
// there is none (or the image cannot load).
// ---------------------------------------------------------------------------

function BrandLogo({ name, logoUrl, size = 44 }: { name: string; logoUrl: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [logoUrl]);
  const showImage = !!logoUrl && !broken;
  return (
    <span
      className="inline-flex items-center justify-center overflow-hidden flex-shrink-0 border border-[var(--color-divider,rgba(59,43,29,0.18))] bg-[var(--color-paper,#FBF8F1)]"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {showImage ? (
        <img
          src={logoUrl as string}
          alt=""
          style={{ maxWidth: '82%', maxHeight: '82%', objectFit: 'contain' }}
          onError={() => setBroken(true)}
        />
      ) : (
        <span
          style={{
            fontFamily: 'var(--space-font-heading)',
            fontSize: Math.round(size * 0.45),
            color: 'var(--color-neutral-500,#a68e70)',
            lineHeight: 1,
          }}
        >
          {(name || '?').trim().charAt(0).toUpperCase() || '?'}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// The add/edit sheet — the SAME dimmed-overlay pattern as piece editing
// (piece-edit.tsx's PieceEditSheet): fixed dialog under the shell header,
// shadowed card, tap-outside or Close to dismiss.
// ---------------------------------------------------------------------------

function BrandSheet({
  entry,
  onClose,
  onChanged,
}: {
  /** null = filing a new brand. */
  entry: BrandIndexEntry | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState(entry?.name || '');
  const [url, setUrl] = useState(entry?.url || '');
  const [logoUrl, setLogoUrl] = useState(entry?.logo_url || '');
  const [status, setStatus] = useState<BrandIndexStatus>(entry?.status || 'curious');
  const [note, setNote] = useState(entry?.note || '');
  const [knownFor, setKnownFor] = useState(entry?.known_for || '');
  const [specialisations, setSpecialisations] = useState(entry?.specialisations || '');
  const [signaturePieces, setSignaturePieces] = useState(entry?.signature_pieces || '');
  const [saving, setSaving] = useState(false);
  const [fetchingLogo, setFetchingLogo] = useState(false);
  const [logoNote, setLogoNote] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // The URL the last logo fetch ran against — so blurring the unchanged
  // field doesn't re-crawl the same page.
  const [fetchedFor, setFetchedFor] = useState<string | null>(entry?.url || null);

  const fetchLogo = async (force = false) => {
    const clean = normalizeSiteUrl(url);
    if (!clean || fetchingLogo) return;
    if (!force && clean === fetchedFor && logoUrl) return;
    setFetchingLogo(true);
    setLogoNote(null);
    try {
      const found = await fetchBrandLogo(clean);
      setFetchedFor(clean);
      if (found) {
        setLogoUrl(found);
        setLogoNote('Logo fetched from the site — saved with the brand.');
      } else {
        setLogoNote('Couldn’t read a logo off that site — the entry works fine without one.');
      }
      if (!name.trim()) setName(nameFromUrl(clean));
    } finally {
      setFetchingLogo(false);
    }
  };

  const save = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const clean = normalizeSiteUrl(url);
      const payload = {
        name: name.trim(),
        url: clean,
        logo_url: logoUrl.trim() || null,
        status,
        note: note.trim() || null,
        known_for: knownFor.trim() || null,
        specialisations: specialisations.trim() || null,
        signature_pieces: signaturePieces.trim() || null,
      };
      if (entry) await updateBrandIndexEntry(entry.id, payload);
      else await addBrandIndexEntry(payload);
      onChanged();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!entry || deleting) return;
    setDeleting(true);
    try {
      await deleteBrandIndexEntry(entry.id);
      onChanged();
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  const field = (
    label: string,
    value: string,
    set: (v: string) => void,
    placeholder: string,
  ) => (
    <div>
      <p className={`${typography.size.xs} uppercase tracking-wide ${typography.color.muted} mb-1`}>{label}</p>
      <input
        type="text"
        value={value}
        onChange={(e) => set(e.target.value)}
        placeholder={placeholder}
        className={`${tw.input.base} ${tw.input.default} ${typography.size.sm}`}
        aria-label={label}
      />
    </div>
  );

  return (
    <div
      className="fixed left-0 right-0 bottom-0 top-[88px] sm:top-[104px] z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={entry ? `Edit ${entry.name}` : 'Add a brand to the Index'}
    >
      <span className="absolute inset-0 bg-[var(--space-shell-shadow-strong)]" aria-hidden="true" />
      <div
        className="relative w-full sm:max-w-md sm:mx-4 bg-[var(--space-surface-card)] rounded-t-2xl sm:rounded-2xl p-5 shadow-xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h4 className={`${typography.size.base} ${typography.weight.semibold} ${typography.color.primary} truncate`}>
              {entry ? entry.name : 'File a brand'}
            </h4>
            <p className={`${typography.size.xs} ${typography.color.muted}`}>
              Trusted and Avoided steer Beau — Curious is your own tracking.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`px-2 py-1 rounded-lg ${typography.size.xs} hover:bg-[var(--space-surface-muted)] text-[var(--space-text-muted)] flex-shrink-0`}
            aria-label="Close"
          >
            Close
          </button>
        </div>

        {/* Paste the brand's site — the logo comes off the page (OG image,
            favicon fallback), and the name pre-fills from the domain. */}
        <div className="pb-3 border-b border-[var(--color-divider,rgba(59,43,29,0.18))]">
          <p className={`${typography.size.xs} uppercase tracking-wide ${typography.color.muted} mb-1`}>
            Brand site — paste the URL and the logo fetches itself
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onBlur={() => void fetchLogo()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void fetchLogo(true);
                }
              }}
              placeholder="https://… (the brand’s site)"
              className={`flex-1 min-w-[12rem] ${tw.input.base} ${tw.input.default} ${typography.size.sm}`}
              aria-label="Brand site URL"
            />
            <button
              type="button"
              onClick={() => void fetchLogo(true)}
              disabled={!normalizeSiteUrl(url) || fetchingLogo}
              className="px-3.5 min-h-[40px] rounded text-[13px] inline-flex items-center gap-1.5 bg-transparent border border-[var(--color-accent,#a8712c)] text-[var(--color-accent-700,#7c4a17)] hover:bg-[var(--color-accent-100,#fbf1de)] transition-colors disabled:opacity-40"
            >
              {fetchingLogo && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {fetchingLogo ? 'Reading the site…' : 'Fetch the logo'}
            </button>
          </div>
          {(logoUrl || fetchingLogo || logoNote) && (
            <div className="flex items-center gap-2.5 mt-2">
              <BrandLogo name={name} logoUrl={logoUrl || null} size={44} />
              <span className={`${typography.size.xs} ${typography.color.muted}`}>
                {fetchingLogo ? 'Reading the site for its mark…' : logoNote || 'The stored logo — refetch any time.'}
              </span>
            </div>
          )}
        </div>

        <div className="grid gap-3 mt-3">
          {field('Brand name', name, setName, 'e.g. Drake’s')}

          {/* Status — the three registers, colour-coded. */}
          <div>
            <p className={`${typography.size.xs} uppercase tracking-wide ${typography.color.muted} mb-1`}>Status</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Brand status">
              {(Object.keys(STATUS_META) as BrandIndexStatus[]).map((id) => {
                const meta = STATUS_META[id];
                const active = status === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setStatus(id)}
                    aria-pressed={active}
                    className="uppercase min-h-[40px] px-4 rounded border transition-colors flex-shrink-0"
                    style={{
                      fontFamily: 'var(--space-font-heading)',
                      fontSize: '12px',
                      letterSpacing: '0.1em',
                      fontWeight: active ? 500 : 400,
                      color: active ? meta.color : 'var(--color-neutral-700,#634e38)',
                      borderColor: active ? meta.border : 'var(--color-divider,rgba(59,43,29,0.18))',
                      background: active ? meta.bg : 'transparent',
                    }}
                  >
                    {meta.label}
                  </button>
                );
              })}
            </div>
            <p className={`${typography.size.xs} ${typography.color.muted} mt-1.5`}>{STATUS_META[status].line}</p>
          </div>

          {field('Known for', knownFor, setKnownFor, 'e.g. Oxford shirts, knitwear')}
          {field('Specialisations', specialisations, setSpecialisations, 'e.g. tailoring, casualwear — comma-separated')}
          {field('Signature pieces', signaturePieces, setSignaturePieces, 'e.g. the unstructured blazer, the chambray OCBD')}

          <div>
            <p className={`${typography.size.xs} uppercase tracking-wide ${typography.color.muted} mb-1`}>Your note</p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. sizing runs slim — order a size up in knitwear"
              rows={2}
              className={`${tw.input.base} ${tw.input.default} ${typography.size.sm} resize-none`}
              aria-label="Your note"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 mt-4 flex-wrap">
          <button
            type="button"
            onClick={() => void save()}
            disabled={!name.trim() || saving}
            className={`px-4 min-h-[44px] rounded ${typography.size.sm} inline-flex items-center gap-1.5 ${tw.button.primary} disabled:opacity-40`}
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {entry ? 'Save the brand' : 'Add to the Index'}
          </button>
          {entry && (
            <span style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px' }}>
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="text-[var(--color-neutral-600,#856c51)] hover:underline"
                >
                  Remove from the Index ›
                </button>
              ) : (
                <span className="inline-flex items-baseline gap-3 flex-wrap">
                  <span className="text-[var(--color-neutral-700,#634e38)]">Sure?</span>
                  <button
                    type="button"
                    onClick={() => void remove()}
                    disabled={deleting}
                    className="hover:underline disabled:opacity-50"
                    style={{ color: 'var(--color-accent,#a8712c)' }}
                  >
                    {deleting ? 'Removing…' : 'Yes, remove it'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    disabled={deleting}
                    className="text-[var(--color-neutral-600,#856c51)] hover:underline disabled:opacity-50"
                  >
                    Keep
                  </button>
                </span>
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The sub-tab root.
// ---------------------------------------------------------------------------

type BrandFilter = 'all' | BrandIndexStatus;

export function BrandIndexSubTab() {
  const { data: rows, loading, refresh } = window.useWorkspaceDB<BrandIndexEntry>('brand_index', {
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 200,
  });
  const [filter, setFilter] = useState<BrandFilter>('all');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // A mutation anywhere (this sub-tab, chat) refreshes the list.
  useEffect(() => {
    const onChanged = () => refresh();
    window.addEventListener(BRAND_INDEX_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(BRAND_INDEX_CHANGED_EVENT, onChanged);
  }, [refresh]);

  const entries = rows || [];
  const editingEntry = editingId != null ? entries.find((e) => e.id === editingId) || null : null;

  const counts = useMemo(() => {
    const c: Record<BrandIndexStatus, number> = { trusted: 0, curious: 0, avoided: 0 };
    for (const e of entries) c[e.status] = (c[e.status] || 0) + 1;
    return c;
  }, [entries]);

  const shown = useMemo(
    () => (filter === 'all' ? entries : entries.filter((e) => e.status === filter)),
    [entries, filter],
  );

  return (
    <div>
      {/* Heading row — standfirst left, the index stat block right, the same
          grid register as The Watchlist's. */}
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_320px] items-end gap-8 sm:gap-16">
        <div>
          <p className={typography.color.primary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '16px', lineHeight: 1.55, maxWidth: '54ch' }}>
            The makers on your radar — who you trust, who you’re curious about, who you’ve ruled out. Trusted and
            Avoided steer Beau’s recommendations; Curious is your own tracking.
          </p>
        </div>
        <div className="w-full">
          <div className="flex items-baseline justify-between gap-3 pb-2 border-b border-[var(--color-text,#3b2b1d)]">
            <span
              className="uppercase text-[var(--color-neutral-700,#634e38)]"
              style={{ fontFamily: 'var(--space-font-heading)', fontSize: '12px', letterSpacing: '0.14em' }}
            >
              In the index
            </span>
            <span
              className={`tabular-nums ${typography.color.primary}`}
              style={{ fontFamily: 'var(--space-font-heading)', fontWeight: 500, fontSize: '30px', lineHeight: 1 }}
            >
              {entries.length}
            </span>
          </div>
          <p className="mt-2.5 text-[var(--color-neutral-700,#634e38)]" style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px' }}>
            {entries.length > 0
              ? `${counts.trusted} trusted · ${counts.curious} curious · ${counts.avoided} avoided.`
              : 'Trusted makers get checked first when Beau hunts your gaps.'}
          </p>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-2 inline-flex items-center gap-1.5 group hover:underline"
            style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', color: 'var(--color-accent,#a8712c)' }}
          >
            Add a brand
            <span
              className="group-hover:translate-x-0.5 transition-transform"
              style={{ fontFamily: 'var(--space-font-heading)', fontSize: '17px', lineHeight: 1 }}
              aria-hidden="true"
            >
              ›
            </span>
          </button>
        </div>
      </div>

      {/* Status filter — hairline chips, the register the category chips use. */}
      {entries.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-8" role="group" aria-label="Filter by status">
          {([
            { id: 'all' as const, label: 'All' },
            { id: 'trusted' as const, label: 'Trusted' },
            { id: 'curious' as const, label: 'Curious' },
            { id: 'avoided' as const, label: 'Avoided' },
          ]).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              aria-pressed={filter === id}
              className={`px-2.5 py-1 rounded border transition-colors ${typography.size.xs} ${
                filter === id
                  ? 'bg-[var(--color-accent-100,#fbf1de)] text-[var(--color-accent-700,#7c4a17)] border-[var(--color-accent,#a8712c)]'
                  : 'border-[var(--color-divider,rgba(59,43,29,0.18))] text-[var(--space-text-secondary)] hover:border-[var(--space-border-strong)]'
              }`}
              style={{ fontSize: '11px' }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {loading && entries.length === 0 ? (
        <div className="mt-8">
          <HairlineRowsSkeleton rows={4} />
        </div>
      ) : entries.length === 0 ? (
        /* Empty state — plain centred text, the Watchlist's register. */
        <div className="text-center py-12">
          <p
            className="max-w-md mx-auto"
            style={{ fontFamily: 'var(--space-font-family)', fontSize: '16px', lineHeight: 1.55, color: 'var(--color-neutral-600,#856c51)' }}
          >
            No brands filed yet. Add a maker you trust — or one you’re curious about — and Beau folds it into his
            thinking.
          </p>
        </div>
      ) : (
        /* THE LIST — hairline-parted rows; tap a row to open its full detail
           and edit. */
        <div className="mt-6 divide-y divide-[var(--color-divider,rgba(59,43,29,0.18))] border-b border-[var(--color-divider,rgba(59,43,29,0.18))]">
          {shown.map((entry) => {
            const metaLine = [entry.known_for, entry.specialisations].filter(Boolean).join(' · ');
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setEditingId(entry.id)}
                className="w-full flex items-center gap-4 text-left group py-3.5 px-1"
                aria-label={`${entry.name} — view and edit`}
              >
                <BrandLogo name={entry.name} logoUrl={entry.logo_url} size={44} />
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate ${typography.color.primary}`}
                    style={{ fontFamily: 'var(--space-font-heading)', fontSize: '18px', fontWeight: 400, lineHeight: 1.2 }}
                  >
                    {entry.name}
                  </span>
                  <span
                    className="block truncate mt-0.5"
                    style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px', color: 'var(--color-neutral-600,#856c51)' }}
                  >
                    {metaLine || (entry.url ? domainOf(entry.url) || entry.url : '\u2014')}
                  </span>
                </span>
                <StatusChip status={entry.status} small />
                <span
                  className="text-[var(--color-neutral-500,#a68e70)] group-hover:translate-x-0.5 transition-transform flex-shrink-0"
                  style={{ fontFamily: 'var(--space-font-heading)', fontSize: '17px', lineHeight: 1 }}
                  aria-hidden="true"
                >
                  ›
                </span>
              </button>
            );
          })}
          {shown.length === 0 && (
            <p className="py-6" style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', color: 'var(--color-neutral-600,#856c51)' }}>
              Nothing under that status yet.
            </p>
          )}
        </div>
      )}

      {adding && (
        <BrandSheet entry={null} onClose={() => setAdding(false)} onChanged={refresh} />
      )}
      {editingEntry && (
        <BrandSheet entry={editingEntry} onClose={() => setEditingId(null)} onChanged={refresh} />
      )}
    </div>
  );
}
