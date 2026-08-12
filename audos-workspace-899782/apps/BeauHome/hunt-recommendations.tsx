/**
 * THE HUNT · BEAU IS HUNTING FOR YOU — the personalised discovery shelf
 * that leads The Hunt tab (Hunt redesign, August 2026).
 *
 * A clean search-and-discovery reading: Beau's recommended pieces as
 * editorial product cards — photograph, maker, piece, price and one tap to
 * file it under Spotted — with category and price filters over the top.
 *
 * NOTHING here is a static feed. The cards come from the SAME live
 * recommendation engine as Beau's picks (beau-picks-ai.ts): the reader's
 * complete logged wardrobe, style archetypes, measurements, colouring,
 * budgets, home city and brand signals go to the model, and what comes
 * back is ranked for THIS reader — each card carries Beau's own reason
 * (whyNow) written against their actual record. Results are cached on a
 * fingerprint of the wardrobe + profile, so the model is only re-asked
 * when the facts change (or on an explicit re-draw).
 *
 * Saving a card files a real candidate: radar_items + candidate_meta at
 * the Spotted stage, origin "Beau's pick", reason carried over — the same
 * record every other Hunt intake writes.
 */
import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { Check, Loader2, RotateCcw } from 'lucide-react';
import {
  beauPicksFingerprint,
  getBeauPicks,
  type BeauRecommendation,
} from './beau-picks-ai';
import { fileCandidate } from './hunt-stages';
import { ProductPhoto } from './product-photo';
import { primaryBuyUrl } from './rail-subcategories';
import { categoryLabel, homeCity, type StylePrefs, type StyleProfile, type WardrobePiece } from './profile-data';
import { MONO, capWord, numberWord, usePlexMono } from './mono-type';
import { ShimmerDefs, Skeleton } from './skeleton';

// ---------------------------------------------------------------------------
// The register — the same warm editorial furniture as the rest of the tab.
// ---------------------------------------------------------------------------

const SERIF = 'var(--space-font-heading)';
const BODY = 'var(--space-font-family)';
const WALNUT = '#241a12';
const INK = '#3b2b1d';
const SECONDARY = '#634e38';
const FAINT = '#a68e70';
const ACCENT_DEEP = '#7c4a17';
const PAPER = '#fbf8f1';
const RULE = 'rgba(59,43,29,0.34)';
const HAIRLINE = 'rgba(59,43,29,0.18)';

function mono(size = 9, color = FAINT): React.CSSProperties {
  return { fontFamily: MONO, fontSize: `${size}px`, letterSpacing: '0.07em', textTransform: 'uppercase', color };
}

// ---------------------------------------------------------------------------
// Price bands — parsed from each pick's own typicalPrice, never authored.
// ---------------------------------------------------------------------------

interface PriceBandDef {
  id: string;
  label: string;
  test: (n: number) => boolean;
}

const PRICE_BANDS: PriceBandDef[] = [
  { id: 'under-100', label: 'Under £100', test: (n) => n < 100 },
  { id: '100-250', label: '£100–250', test: (n) => n >= 100 && n < 250 },
  { id: '250-500', label: '£250–500', test: (n) => n >= 250 && n < 500 },
  { id: '500-plus', label: '£500+', test: (n) => n >= 500 },
];

/** The first figure in a price guide like "£145–£220" — null when the
 * model gave no usable guide, in which case the card never matches a held
 * price filter but always shows under "any price". */
function priceFigure(raw: string): number | null {
  const match = (raw || '').replace(/[,\s]/g, '').match(/(\d+(?:\.\d+)?)/);
  const value = match ? Number(match[1]) : NaN;
  return Number.isFinite(value) && value > 0 ? value : null;
}

const keyOf = (p: BeauRecommendation) => `${p.exampleBrand}\u241f${p.pieceName}`;

// ---------------------------------------------------------------------------
// One card — photograph · maker · piece · price · Beau's reason · save.
// ---------------------------------------------------------------------------

function PickCard({
  pick,
  saved,
  saving,
  onSave,
}: {
  pick: BeauRecommendation;
  saved: boolean;
  saving: boolean;
  onSave: () => void;
}) {
  const href = primaryBuyUrl(pick.exampleBrand, pick.pieceName);
  return (
    <div className="flex flex-col min-w-0" style={{ border: `1px solid ${HAIRLINE}`, background: PAPER, padding: '12px' }}>
      <ProductPhoto
        brand={pick.exampleBrand}
        name={pick.pieceName}
        href={href}
        renderWidth={280}
        category={pick.categoryId}
      />
      <div style={{ marginTop: '10px' }}>
        <div className="flex items-baseline justify-between" style={{ gap: '10px' }}>
          <span style={mono(7.5, ACCENT_DEEP)}>{pick.exampleBrand}</span>
          {pick.categoryId && <span style={mono(7, FAINT)}>{categoryLabel(pick.categoryId)}</span>}
        </div>
        <div style={{ fontFamily: SERIF, fontSize: '17px', lineHeight: 1.22, color: WALNUT, marginTop: '4px' }}>{pick.pieceName}</div>
        <div className="flex items-baseline justify-between" style={{ gap: '10px', marginTop: '4px' }}>
          {pick.typicalPrice ? <span style={mono(8, SECONDARY)}>{pick.typicalPrice}</span> : <span style={mono(8, FAINT)}>Price on the hunt</span>}
          {pick.register && <span style={mono(7, FAINT)}>{pick.register}</span>}
        </div>
      </div>
      {pick.whyNow && (
        <p style={{ fontFamily: BODY, fontSize: '12.5px', lineHeight: 1.5, color: INK, margin: '8px 0 0' }}>{pick.whyNow}</p>
      )}
      <div style={{ marginTop: 'auto', paddingTop: '12px' }}>
        {saved ? (
          <span className="inline-flex items-center" style={{ ...mono(8, ACCENT_DEEP), gap: '6px' }}>
            <Check className="w-3 h-3" aria-hidden /> Filed under Spotted
          </span>
        ) : (
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="transition-colors w-full"
            title={`File the ${pick.pieceName.toLowerCase()} under Spotted`}
            style={{
              ...mono(8.5, saving ? FAINT : '#f6f0e5'),
              background: saving ? 'transparent' : '#2e2115',
              border: `1px solid ${saving ? RULE : '#2e2115'}`,
              padding: '9px 12px',
              cursor: saving ? 'default' : 'pointer',
            }}
          >
            {saving ? (
              <span className="inline-flex items-center justify-center" style={{ gap: '6px' }}>
                <Loader2 className="w-3 h-3 animate-spin" aria-hidden /> Filing…
              </span>
            ) : (
              'Save to the Hunt'
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The shelf.
// ---------------------------------------------------------------------------

export function HuntRecommendations({
  profile,
  pieces,
  prefs = null,
}: {
  profile: StyleProfile | null;
  pieces: WardrobePiece[];
  prefs?: StylePrefs | null;
}) {
  usePlexMono();
  const [picks, setPicks] = useState<BeauRecommendation[]>([]);
  const [busy, setBusy] = useState(true);
  const [phase, setPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [catFilter, setCatFilter] = useState<string>('all');
  const [priceFilter, setPriceFilter] = useState<string>('any');
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // The engine is cached on a fingerprint of the wardrobe + profile — the
  // effect keys on the same fingerprint so a mere re-render never re-asks.
  const fp = useMemo(() => beauPicksFingerprint(profile, pieces), [profile, pieces]);

  const load = (force: boolean) => {
    setBusy(true);
    setError(null);
    getBeauPicks({ profile, pieces, prefs, forceRefresh: force, onPhase: setPhase })
      .then((res) => setPicks(res.picks))
      .catch((e) => setError(e?.message || 'Beau couldn\u2019t reach his desk just now — try again in a moment.'))
      .finally(() => setBusy(false));
  };

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fp]);

  // Category chips — built from the picks themselves, never a fixed list.
  const cats = useMemo(() => {
    const seen: string[] = [];
    for (const p of picks) {
      const id = p.categoryId || '';
      if (id && !seen.includes(id)) seen.push(id);
    }
    return seen;
  }, [picks]);

  const shown = useMemo(
    () =>
      picks.filter((p) => {
        if (catFilter !== 'all' && p.categoryId !== catFilter) return false;
        if (priceFilter !== 'any') {
          const band = PRICE_BANDS.find((b) => b.id === priceFilter);
          const figure = priceFigure(p.typicalPrice);
          if (!band || figure == null || !band.test(figure)) return false;
        }
        return true;
      }),
    [picks, catFilter, priceFilter],
  );

  const city = homeCity(profile);
  const pieceCount = pieces.length;
  // The standfirst is COMPUTED from the reader's own facts — their count,
  // their city — while each card's reason below is Beau's own line.
  const standfirst =
    pieceCount === 0
      ? `Nothing on your ledger yet — these are the foundations Beau would lay first${city ? ` for ${city}` : ''}.`
      : `Read against the ${pieceCount > 99 ? pieceCount : numberWord(pieceCount)} piece${pieceCount === 1 ? '' : 's'} on your ledger${
          city ? ` and ${city}` : ''
        } — what Beau would bring back first, strongest first.`;

  const save = async (pick: BeauRecommendation) => {
    const key = keyOf(pick);
    if (saved[key] || savingKey) return;
    setSavingKey(key);
    try {
      await fileCandidate({
        name: pick.pieceName,
        brand: pick.exampleBrand || null,
        price: pick.typicalPrice || null,
        productUrl: null,
        category: pick.categoryId || null,
        origin: "Beau's pick",
        reason: pick.whyNow || null,
        source: 'hunt-recommendations',
      });
      setSaved((cur) => ({ ...cur, [key]: true }));
    } catch (e) {
      console.warn('[Ethaion] filing the recommendation failed:', e);
    } finally {
      setSavingKey(null);
    }
  };

  const chip = (active: boolean, label: string, onClick: () => void) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="transition-colors flex-shrink-0"
      style={{
        ...mono(8, active ? '#5c3413' : SECONDARY),
        background: active ? 'rgba(168,113,44,0.12)' : 'transparent',
        border: `1px solid ${active ? ACCENT_DEEP : HAIRLINE}`,
        padding: '7px 12px',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );

  return (
    <section aria-label="Beau is hunting for you">
      {/* ——— the masthead line */}
      <div className="flex items-end justify-between flex-wrap" style={{ gap: '10px 20px' }}>
        <div className="min-w-0">
          <div style={mono(8, ACCENT_DEEP)}>Beau is hunting for you</div>
          <p style={{ fontFamily: BODY, fontSize: '14px', lineHeight: 1.55, color: SECONDARY, margin: '6px 0 0', maxWidth: '62ch' }}>
            {standfirst}
          </p>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={busy}
          className="transition-colors flex-shrink-0 inline-flex items-center"
          title="Ask Beau to re-draw the hunt against your current ledger and dossier"
          style={{
            ...mono(8.5, busy ? FAINT : SECONDARY),
            gap: '7px',
            background: 'transparent',
            border: `1px solid ${busy ? HAIRLINE : RULE}`,
            padding: '8px 13px',
            cursor: busy ? 'default' : 'pointer',
          }}
        >
          <RotateCcw className="w-3 h-3" aria-hidden /> Re-draw the hunt
        </button>
      </div>

      {/* ——— the filters: category from the picks themselves, price from
          each pick's own guide */}
      {picks.length > 0 && (
        <div style={{ marginTop: '14px', paddingBottom: '14px', borderBottom: `1px solid ${HAIRLINE}` }}>
          <div className="flex items-start" style={{ gap: '12px' }}>
            <span style={{ ...mono(7.5, FAINT), paddingTop: '9px', flexShrink: 0, minWidth: '52px' }}>Category</span>
            <div className="flex flex-wrap min-w-0 flex-1" style={{ gap: '7px' }}>
              {chip(catFilter === 'all', 'All', () => setCatFilter('all'))}
              {cats.map((id) => chip(catFilter === id, categoryLabel(id), () => setCatFilter(catFilter === id ? 'all' : id)))}
            </div>
          </div>
          <div className="flex items-start" style={{ gap: '12px', marginTop: '8px' }}>
            <span style={{ ...mono(7.5, FAINT), paddingTop: '9px', flexShrink: 0, minWidth: '52px' }}>Price</span>
            <div className="flex flex-wrap min-w-0 flex-1" style={{ gap: '7px' }}>
              {chip(priceFilter === 'any', 'Any price', () => setPriceFilter('any'))}
              {PRICE_BANDS.map((b) => chip(priceFilter === b.id, b.label, () => setPriceFilter(priceFilter === b.id ? 'any' : b.id)))}
            </div>
          </div>
        </div>
      )}

      {/* ——— the shelf */}
      {busy ? (
        <div>
          <div style={{ ...mono(8, FAINT), padding: '14px 0 10px' }}>{phase || 'Beau is reading your wardrobe\u2026'}</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" style={{ gap: '14px' }}>
            <ShimmerDefs />
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ border: `1px solid ${HAIRLINE}`, background: PAPER, padding: '12px' }}>
                <div style={{ aspectRatio: '4 / 5', position: 'relative' }}>
                  <Skeleton className="absolute inset-0" />
                </div>
                <div style={{ position: 'relative', height: '12px', marginTop: '10px' }}>
                  <Skeleton className="absolute inset-0" />
                </div>
                <div style={{ position: 'relative', height: '12px', marginTop: '6px', width: '60%' }}>
                  <Skeleton className="absolute inset-0" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : error ? (
        <div style={{ padding: '18px 0' }}>
          <p style={{ fontFamily: BODY, fontSize: '13.5px', color: SECONDARY, margin: 0 }}>{error}</p>
          <button
            type="button"
            onClick={() => load(false)}
            className="hover:underline"
            style={{ ...mono(8.5, ACCENT_DEEP), background: 'transparent', padding: 0, marginTop: '8px' }}
          >
            Try again →
          </button>
        </div>
      ) : shown.length === 0 ? (
        <p style={{ fontFamily: BODY, fontSize: '13.5px', color: SECONDARY, padding: '18px 0', margin: 0 }}>
          {picks.length === 0
            ? 'Nothing to hunt yet — log a piece or two and Beau reads what your wardrobe asks for next.'
            : 'Nothing Beau is hunting answers this combination — release a filter to see the rest.'}
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" style={{ gap: '14px', paddingTop: '14px' }}>
          {shown.map((pick) => {
            const key = keyOf(pick);
            return <PickCard key={key} pick={pick} saved={!!saved[key]} saving={savingKey === key} onSave={() => void save(pick)} />;
          })}
        </div>
      )}

      {!busy && !error && shown.length > 0 && (
        <p style={{ ...mono(7.5, FAINT), margin: '12px 0 0' }}>
          {capWord(numberWord(shown.length))} of {picks.length > 99 ? picks.length : numberWord(picks.length)} recommendations shown · each reason is written against your own ledger and dossier · saving files it under Spotted
        </p>
      )}
    </section>
  );
}
