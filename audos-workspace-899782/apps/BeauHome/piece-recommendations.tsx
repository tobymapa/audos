/**
 * THE INDEX · PIECE ENTRY — WHERE TO GET A GOOD ONE (founder's change 5).
 *
 * A reference entry that names a garment type and then leaves the wearer to
 * find one is half an answer. Every piece entry now leads with a REAL
 * recommendation:
 *
 *   · THE PICK — one maker, with a photograph of THEIR version of this piece
 *     and a link straight to their page for it (never a homepage, never a
 *     search results page: product-images resolves the actual product page,
 *     and rail-subcategories' primaryBuyUrl is the standing fallback).
 *   · THEN FOUR MORE — the next best makers for the same type, named, linked.
 *
 * The ranking is Beau's, made against the wearer's dossier (proportions,
 * colouring, the directions they wear, what they already own) through
 * runMatchSearch — no second recommendation engine.
 * With too little dossier to personalise, the same call runs profile-off and
 * returns generally well-regarded makers for the type instead; if the model
 * is unreachable, the catalog's own tier-ranked makers stand in. Nothing is
 * hardcoded per piece type.
 *
 * A model call per opened entry would be indefensible, so answers are cached
 * in localStorage for a day against the type + a dossier fingerprint, and
 * concurrent openings share one in-flight lookup.
 */
import { useEffect, useState } from 'react';
import type React from 'react';
import { Loader2 } from 'lucide-react';
import { MONO } from './mono-type';
import { ProductPhoto } from './product-photo';
import { primaryBuyUrl } from './rail-subcategories';
import { resolveProductPage } from './product-images';
import { runMatchSearch, type MatchRecommendation } from './hunt-ai';
import type { StyleProfile, WardrobePiece } from './profile-data';

// The 8a registers, as the panel sets them.
const SERIF = 'var(--space-font-heading)';
const BODY = 'var(--space-font-family)';
const WALNUT = '#241a12';
const INK = '#3b2b1d';
const SECONDARY = '#634e38';
const MUTED = '#856c51';
const FAINT = '#a68e70';
const ACCENT_DEEP = '#7c4a17';
const PAPER = '#fbf8f1';
const HAIR = 'rgba(59,43,29,0.18)';
const HAIR_STRONG = 'rgba(59,43,29,0.3)';

function mono(size = 9, color = FAINT): React.CSSProperties {
  return { fontFamily: MONO, fontSize: `${size}px`, letterSpacing: '0.06em', textTransform: 'uppercase', color };
}

// ---------------------------------------------------------------------------
// The day-long cache + the in-flight guard.
// ---------------------------------------------------------------------------

const CACHE_KEY = 'ethaion_piece_brand_picks_v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHED = 60;

interface CachedPicks {
  at: number;
  picks: MatchRecommendation[];
}

function readCache(): Record<string, CachedPicks> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeCache(key: string, picks: MatchRecommendation[]): void {
  try {
    const all = readCache();
    all[key] = { at: Date.now(), picks };
    const keys = Object.keys(all);
    if (keys.length > MAX_CACHED) {
      const oldest = keys.sort((a, b) => (all[a]?.at || 0) - (all[b]?.at || 0)).slice(0, keys.length - MAX_CACHED);
      for (const k of oldest) delete all[k];
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch {
    /* storage full or unavailable — the session still has the answer */
  }
}

const inflight = new Map<string, Promise<MatchRecommendation[]>>();

function loadPicks(
  key: string,
  input: {
    query: string;
    profileOn: boolean;
    profile: StyleProfile | null;
    pieces: WardrobePiece[];
  },
): Promise<MatchRecommendation[]> {
  const cached = readCache()[key];
  if (cached && Date.now() - cached.at < CACHE_TTL_MS && cached.picks.length > 0) {
    return Promise.resolve(cached.picks);
  }
  const running = inflight.get(key);
  if (running) return running;
  const job = runMatchSearch({
    query: input.query,
    profileOn: input.profileOn,
    profile: input.profile,
    // Per-category ceilings don't apply here; the dossier's frame,
    // colouring and directions are what rank makers for a TYPE.
    budgets: {},
    pieces: input.pieces,
    prefs: null,
  })
    .then((picks) => {
      const trimmed = picks.filter((pick) => (pick.brandName || '').trim()).slice(0, 5);
      if (trimmed.length > 0) writeCache(key, trimmed);
      return trimmed;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, job);
  return job;
}

/** Enough dossier to personalise? With none of it, the same call runs
 * profile-off and answers from general menswear knowledge instead. */
function canPersonalise(profile: StyleProfile | null): boolean {
  if (!profile) return false;
  return !!(
    (profile.archetypes || []).length > 0 ||
    (profile.occasions || []).length > 0 ||
    profile.build ||
    profile.height_range ||
    profile.skin_tone ||
    profile.materials
  );
}

function dossierFingerprint(profile: StyleProfile | null, pieces: WardrobePiece[]): string {
  if (!profile) return 'general';
  return [
    (profile.archetypes || []).join(','),
    (profile.occasions || []).join(','),
    profile.height_range || '',
    profile.build || '',
    profile.skin_tone || '',
    profile.materials || '',
    // The wardrobe only needs to move the answer when it changes size.
    String(Math.min(40, pieces.length)),
  ].join('|');
}

// ---------------------------------------------------------------------------
// The link — the maker's own page for THIS piece, resolved, with the standing
// retail link underneath it so a row is never a dead end.
// ---------------------------------------------------------------------------

function useBestLink(brand: string, typeName: string): string {
  const [url, setUrl] = useState(() => primaryBuyUrl(brand, typeName));
  useEffect(() => {
    let alive = true;
    setUrl(primaryBuyUrl(brand, typeName));
    resolveProductPage({ name: `${brand} ${typeName}`, brand })
      .then((page) => {
        if (alive && page) setUrl(page);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [brand, typeName]);
  return url;
}

function OpenLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-baseline gap-1 hover:underline"
      style={{ fontFamily: BODY, fontSize: '12.5px', color: ACCENT_DEEP }}
    >
      {label}
      <span aria-hidden="true" style={{ fontSize: '10px', lineHeight: 1 }}>↗</span>
    </a>
  );
}

/** THE PICK — photograph, maker, why, and the link to their own page. */
function PrimaryPick({ pick, typeName }: { pick: MatchRecommendation; typeName: string }) {
  const href = useBestLink(pick.brandName, typeName);
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-[172px_minmax(0,1fr)]"
      style={{ gap: '16px', border: `1px solid ${HAIR_STRONG}`, background: PAPER, padding: '14px' }}
    >
      <ProductPhoto brand={pick.brandName} name={typeName} href={href} renderWidth={172} category={null} />
      <div className="min-w-0">
        <div style={mono(8.5, MUTED)}>Beau’s pick</div>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="block hover:underline"
          style={{ marginTop: '4px', fontFamily: SERIF, fontSize: '23px', lineHeight: 1.14, color: WALNUT }}
        >
          {pick.brandName}
        </a>
        {pick.whatTheyMake && (
          <p style={{ margin: '3px 0 0', fontFamily: BODY, fontSize: '12.5px', lineHeight: 1.5, color: MUTED }}>{pick.whatTheyMake}</p>
        )}
        {(pick.profileNote || pick.whyItFits) && (
          <p style={{ margin: '8px 0 0', fontFamily: BODY, fontSize: '13.5px', lineHeight: 1.55, color: INK, maxWidth: '52ch' }}>
            {pick.profileNote || pick.whyItFits}
          </p>
        )}
        <div className="flex items-baseline flex-wrap" style={{ gap: '14px', marginTop: '10px' }}>
          <OpenLink href={href} label={`See their ${typeName.toLowerCase()}`} />
          {pick.priceRange && <span style={{ ...mono(8.5, FAINT), letterSpacing: '0.08em' }}>{pick.priceRange}</span>}
        </div>
      </div>
    </div>
  );
}

/** One of the next four — maker, one line, link. */
function SecondaryPick({ pick, typeName, last }: { pick: MatchRecommendation; typeName: string; last: boolean }) {
  const href = useBestLink(pick.brandName, typeName);
  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline"
      style={{ gap: '12px', padding: '10px 0', borderBottom: last ? 'none' : `1px solid ${HAIR}` }}
    >
      <span className="min-w-0">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
          style={{ fontFamily: SERIF, fontSize: '16px', color: WALNUT }}
        >
          {pick.brandName}
        </a>
        {(pick.whatTheyMake || pick.whyItFits) && (
          <span className="block" style={{ marginTop: '2px', fontFamily: BODY, fontSize: '12px', lineHeight: 1.5, color: SECONDARY }}>
            {pick.whatTheyMake || pick.whyItFits}
          </span>
        )}
      </span>
      <OpenLink href={href} label="Their page" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The section.
// ---------------------------------------------------------------------------

export function PieceBrandPicks({
  typeName,
  categoryName,
  keywords,
  profile,
  pieces,
  /** The catalog's own tier-ranked makers for this type — the standing
   * answer while Beau reads, and the answer if he can't be reached. */
  fallbackBrands,
}: {
  typeName: string;
  categoryName: string;
  keywords: string[];
  profile: StyleProfile | null;
  pieces: WardrobePiece[];
  fallbackBrands: string[];
}) {
  const clean = typeName.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
  const personal = canPersonalise(profile);
  const cacheKey = `${clean.toLowerCase()}\u241f${personal ? dossierFingerprint(profile, pieces) : 'general'}`;
  const [picks, setPicks] = useState<MatchRecommendation[]>([]);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!clean) return undefined;
    let alive = true;
    setBusy(true);
    setPicks([]);
    const aka = keywords.filter((k) => k && k.toLowerCase() !== clean.toLowerCase()).slice(0, 4);
    const query = [
      `Which makers should I buy a ${clean.toLowerCase()} from?`,
      categoryName ? `It's a ${categoryName.toLowerCase()} piece.` : '',
      aka.length > 0 ? `Also called: ${aka.join(', ')}.` : '',
      'Name the five best makers for me, best first — makers who actually make this piece well.',
    ]
      .filter(Boolean)
      .join(' ');
    loadPicks(cacheKey, { query, profileOn: personal, profile, pieces })
      .then((recs) => {
        if (!alive) return;
        setPicks(recs);
        setBusy(false);
      })
      .catch(() => {
        if (!alive) return;
        setBusy(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, clean]);

  // Beau's ranking when it lands; the catalog's tier order until it does.
  const rows: MatchRecommendation[] =
    picks.length > 0
      ? picks
      : fallbackBrands.slice(0, 5).map((brand) => ({
          brandName: brand,
          whatTheyMake: '',
          whyItFits: '',
          priceRange: '',
        }));

  if (rows.length === 0) {
    return (
      <div style={{ marginTop: '16px', border: `1px dashed ${HAIR_STRONG}`, padding: '18px', textAlign: 'center' }}>
        <div style={mono(8.5, MUTED)}>Where to get a good one</div>
        <p style={{ margin: '6px 0 0', fontFamily: BODY, fontSize: '12.5px', lineHeight: 1.55, color: SECONDARY }}>
          {busy ? 'Beau is reading the market for this piece…' : 'Nothing to recommend for this type yet — ask Beau in the chat and it lands here.'}
        </p>
      </div>
    );
  }

  const [primary, ...rest] = rows;

  return (
    <div style={{ marginTop: '16px' }}>
      <div className="flex items-baseline justify-between gap-4" style={{ marginBottom: '10px' }}>
        <span style={{ ...mono(9.5, MUTED), letterSpacing: '0.14em' }}>Where to get a good one</span>
        <span style={{ ...mono(8.5, FAINT), letterSpacing: '0.08em' }}>
          {busy ? (
            <span className="inline-flex items-center" style={{ gap: '6px' }}>
              <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> Beau is ranking
            </span>
          ) : personal && picks.length > 0 ? (
            'Against your dossier'
          ) : (
            'Generally well regarded'
          )}
        </span>
      </div>

      <PrimaryPick key={primary.brandName} pick={primary} typeName={clean} />

      {rest.length > 0 && (
        <div style={{ marginTop: '14px' }}>
          {/* The next-best makers follow the pick directly — no heading label
              (founder's removal); the rows speak for themselves. */}
          <div className="flex flex-col" style={{ marginTop: 0 }}>
            {rest.slice(0, 4).map((pick, i, all) => (
              <SecondaryPick key={pick.brandName} pick={pick} typeName={clean} last={i === all.length - 1} />
            ))}
          </div>
        </div>
      )}

      <p style={{ margin: '10px 0 0', fontFamily: BODY, fontSize: '11.5px', lineHeight: 1.5, color: MUTED, maxWidth: '68ch' }}>
        {personal && picks.length > 0
          ? 'Ranked for your frame, colouring and the directions you actually wear — the link goes to the maker’s own page for this piece, not a shop front.'
          : 'Generally well-regarded makers for this piece. Fill in more of your dossier and Beau ranks them for you instead.'}
      </p>
    </div>
  );
}
