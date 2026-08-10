/**
 * WORLD OF MENSWEAR — The Rail's second sub-tab (Rail overhaul, Part 2).
 *
 * A comprehensive reference of classic menswear — every category, famous and
 * obscure alike — so the user never has to already know something exists in
 * order to find it. Beau surfaces everything.
 *
 * Layout:
 *  · SEARCH BAR at the top — always visible; typing searches every entry in
 *    real time (name + description). Search is the shortcut; browse is the
 *    default mode.
 *  · BROWSE BY CATEGORY below — ten sectioned categories in the app's
 *    canonical menswear order (Tops → Knitwear → Outerwear → Bottoms →
 *    Formalwear → Base Layers → Shoes → Accessories → Bags →
 *    Hats/Headwear), every entry a plain hairline row.
 *  · DETAIL VIEW on tap — four visually DISTINCT registers, so the page
 *    never reads as one undifferentiated wall of text (Recommendation
 *    Engine overhaul, Part 5):
 *      1. REFERENCE TEXT (what it is / origin & history / when to wear it)
 *         — quiet editorial on a paper ground, Cormorant heads, Lora body.
 *      2. BEAU FOR YOU — its own card on the warmer #efe7d9 ground inside a
 *         walnut hairline, headed in oxblood: a personal note, set apart
 *         from the reference text above and below it.
 *      3. PAIRS WELL WITH — horizontal tappable chips, one per pairing.
 *      4. WHERE TO FIND ONE — mini retailer cards in the same shoppable
 *         register as The Rail's Tier 2 product cards, and when the user's
 *         profile is filled in and this type is a gap for them, the cards
 *         carry the SAME maker suggestions Beau would make on a "For You"
 *         recommendation rather than a generic list.
 *
 * Design register: paper and hairlines only — no shadows, no new colours.
 * Cormorant for headings, Lora for body, tobacco gold for strokes and
 * links, oxblood strictly for Beau's voice on light backgrounds.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { ArrowLeft, Search } from 'lucide-react';
import { typography } from '../../lib/colors';
import type { StyleProfile, WardrobePiece } from './profile-data';
import { ProductPhoto } from './product-photo';
import {
  primaryBuyUrl,
  seedsForSubcategory,
  subcategoryForText,
  type RailSubcategory,
} from './rail-subcategories';
import {
  WORLD_CATEGORIES,
  WORLD_ENTRIES,
  ownedPieceForEntry,
  searchWorldEntries,
  worldEntriesFor,
  worldEntry,
  type WorldCategoryId,
  type WorldEntry,
} from './world-taxonomy';

// Beau's voice colour on light backgrounds — oxblood (design system; never
// used on dark/walnut grounds).
const BEAU_INK = '#7d2a24';
// The two grounds: paper for reference text, the warmer page ground for
// Beau's own card so it separates from the editorial around it.
const PAPER = 'var(--color-paper,#fbf8f1)';
const WARM = 'var(--color-bg,#efe7d9)';
const WALNUT = 'var(--color-text,#241a12)';

/** The For You sub-category this entry routes to — entry name first, then
 * its keywords, so "OCBD" lands on the Oxford Shirt rail. */
function forYouSubcategory(entry: WorldEntry): RailSubcategory | null {
  const byName = subcategoryForText(entry.name);
  if (byName) return byName;
  for (const keyword of entry.keywords) {
    const match = subcategoryForText(keyword);
    if (match) return match;
  }
  return null;
}

const FLAG_ESSENTIAL = 'Wardrobe essential — fills a foundational gap';
const FLAG_SPECIALIST = 'Specialist piece — adds range once the essentials are in place';

// ---------------------------------------------------------------------------
// Entry row — shared by the category browse and the search results.
// ---------------------------------------------------------------------------

function EntryRow({
  entry,
  kicker,
  onOpen,
}: {
  entry: WorldEntry;
  /** Optional small category label (search results only). */
  kicker?: string | null;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full grid grid-cols-[minmax(0,1fr)_18px] items-center gap-3 text-left py-[11px] group border-b border-[var(--color-divider,rgba(59,43,29,0.18))]"
      aria-label={`${entry.name} — read the entry`}
    >
      <span className="min-w-0">
        <span className="flex items-baseline gap-2.5 flex-wrap">
          <span
            className={`${typography.color.primary} group-hover:underline`}
            style={{ fontFamily: 'var(--space-font-heading)', fontWeight: 400, fontSize: '17px', lineHeight: 1.25 }}
          >
            {entry.name}
          </span>
          <span
            className="uppercase text-[var(--color-neutral-600,#856c51)]"
            style={{ fontFamily: 'var(--space-font-heading)', fontSize: '9.5px', letterSpacing: '0.14em' }}
          >
            {kicker || (entry.essential ? 'Essential' : 'Specialist')}
          </span>
        </span>
      </span>
      <span
        className="justify-self-end text-[var(--color-neutral-500,#a68e70)] group-hover:translate-x-0.5 transition-transform"
        style={{ fontFamily: 'var(--space-font-heading)', fontSize: '16px', lineHeight: 1 }}
        aria-hidden="true"
      >
        ›
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// The detail view — four distinct registers on one page.
// ---------------------------------------------------------------------------

function SectionHead({ children }: { children: string }) {
  return (
    <p
      className="uppercase text-[var(--color-neutral-600,#856c51)]"
      style={{ fontFamily: 'var(--space-font-heading)', fontSize: '11px', letterSpacing: '0.16em', marginBottom: '6px' }}
    >
      {children}
    </p>
  );
}

const bodyType: React.CSSProperties = {
  fontFamily: 'var(--space-font-family)',
  fontSize: '14.5px',
  lineHeight: 1.65,
  maxWidth: '64ch',
};

/** One row of "Where to find one": a maker or retailer, a price guide when
 * one is known, and — when Beau's own picks are driving the list — the
 * specific product he'd point at, with its photograph. */
interface FindCard {
  key: string;
  retailer: string;
  url: string;
  /** The specific piece Beau would recommend, when the list is his. */
  product?: string;
  /** Price or price range, shown muted in the middle column. */
  price?: string;
}

/**
 * WHERE TO FIND ONE, Beau-intelligence first (Part 5.5): when the user has
 * a profile filled in AND this type is a gap in their wardrobe, the list is
 * the same set of makers Beau puts on a "For You" recommendation for this
 * piece type — specific products, his price guides, straight to the maker.
 * Otherwise it falls back to the entry's curated general retailer links.
 */
function findCardsFor(
  entry: WorldEntry,
  sub: RailSubcategory | null,
  personalised: boolean,
): { cards: FindCard[]; personalised: boolean } {
  if (personalised && sub) {
    const seeds = seedsForSubcategory(sub.id);
    if (seeds.length > 0) {
      return {
        personalised: true,
        cards: seeds.slice(0, 4).map((seed) => ({
          key: `${seed.brand}\u241f${seed.name}`,
          retailer: seed.brand,
          product: seed.name,
          price: seed.price,
          url: primaryBuyUrl(seed.brand, seed.name),
        })),
      };
    }
  }
  return {
    personalised: false,
    cards: entry.find.map((link) => ({ key: link.url, retailer: link.retailer, url: link.url })),
  };
}

function FindRow({ card, category }: { card: FindCard; category: WorldCategoryId }) {
  return (
    <div
      className="grid items-center gap-3"
      style={{
        gridTemplateColumns: card.product ? '68px minmax(0,1.4fr) minmax(0,0.8fr) 18px' : 'minmax(0,1.4fr) minmax(0,0.8fr) 18px',
        padding: '12px 2px',
        borderTop: '1px solid var(--color-divider,rgba(59,43,29,0.18))',
      }}
    >
      {card.product && (
        /* The product's own photograph on the shared 4:5 plate — tapping it
           opens the source product page directly. */
        <ProductPhoto
          brand={card.retailer}
          name={card.product}
          href={card.url}
          className="w-[68px]"
          renderWidth={68}
          category={category}
        />
      )}
      <a
        href={card.url}
        target="_blank"
        rel="noopener noreferrer"
        className="min-w-0 group"
        aria-label={`${card.product ? `${card.product} — ` : ''}${card.retailer} — open in a new tab`}
      >
        <span
          className={`block truncate ${typography.color.primary} group-hover:underline`}
          style={{ fontFamily: 'var(--space-font-family)', fontSize: '14.5px', lineHeight: 1.35 }}
        >
          {card.retailer}
        </span>
        {card.product && (
          <span
            className="block truncate text-[var(--color-neutral-600,#856c51)]"
            style={{ fontFamily: 'var(--space-font-family)', fontSize: '12.5px', marginTop: '2px' }}
          >
            {card.product}
          </span>
        )}
      </a>
      <span
        className="text-[var(--color-neutral-600,#856c51)] tabular-nums text-center truncate"
        style={{ fontFamily: 'var(--space-font-family)', fontSize: '12.5px' }}
      >
        {card.price || ''}
      </span>
      <span
        className="justify-self-end text-[var(--color-neutral-500,#a68e70)]"
        style={{ fontFamily: 'var(--space-font-heading)', fontSize: '16px', lineHeight: 1 }}
        aria-hidden="true"
      >
        ›
      </span>
    </div>
  );
}

export function WorldEntryPage({
  entry,
  pieces,
  profile,
  onBack,
  onSeeForYou,
}: {
  entry: WorldEntry;
  pieces: WardrobePiece[];
  profile: StyleProfile | null;
  onBack: () => void;
  onSeeForYou: (sub: RailSubcategory) => void;
}) {
  const topRef = useRef<HTMLDivElement | null>(null);
  // A fresh entry always opens read from the top.
  useEffect(() => {
    topRef.current?.scrollIntoView({ block: 'start' });
  }, [entry.id]);

  const category = WORLD_CATEGORIES.find((c) => c.id === entry.categoryId) || null;
  const owned = ownedPieceForEntry(entry, pieces);
  const forYouSub = forYouSubcategory(entry);

  // Beau has enough of the user to reason personally: a style direction,
  // their proportions, or a wardrobe he can read.
  const hasProfile = !!(
    (profile?.archetypes && profile.archetypes.length > 0) ||
    profile?.height_range ||
    profile?.build ||
    profile?.skin_tone ||
    pieces.length > 0
  );
  const { cards: findCards, personalised } = useMemo(
    () => findCardsFor(entry, forYouSub, hasProfile && !owned),
    [entry, forYouSub, hasProfile, owned],
  );
  // The reference register's right-hand plate on wide screens: the specific
  // product Beau would point at, when his own picks are driving the list.
  // Otherwise the plate reads as a warm fabric swatch — a hook for a real
  // photograph, and better than dead whitespace either way.
  const plate = personalised ? findCards.find((c) => !!c.product) || null : null;

  return (
    <div ref={topRef} style={{ scrollMarginTop: '80px' }}>
      <button
        type="button"
        onClick={onBack}
        className={`inline-flex items-center gap-1.5 ${typography.size.xs} ${typography.color.brand} hover:underline`}
      >
        <ArrowLeft className="w-3.5 h-3.5" /> World of Menswear
      </button>

      {/* 1 — Name: Cormorant, walnut, over a tobacco-gold hairline (the same
          header grammar as the For You Tier 2 pages). */}
      <div className="mt-6" style={{ borderBottom: '1px solid var(--color-accent,#a8712c)', paddingBottom: '12px' }}>
        {category && (
          <p
            className="uppercase text-[var(--color-neutral-600,#856c51)]"
            style={{ fontFamily: 'var(--space-font-heading)', fontSize: '11px', letterSpacing: '0.16em', marginBottom: '5px' }}
          >
            {category.label}
          </p>
        )}
        <h3 className={typography.color.primary} style={{ fontFamily: 'var(--space-font-heading)', fontWeight: 400, fontSize: '34px', lineHeight: 1.1 }}>
          {entry.name}
        </h3>
        {/* The gap-or-specialist flag, right under the name. */}
        <p
          className="inline-block mt-2.5 px-2.5 py-1 uppercase"
          style={{
            fontFamily: 'var(--space-font-heading)',
            fontSize: '10.5px',
            letterSpacing: '0.13em',
            color: 'var(--color-neutral-700,#634e38)',
            border: '1px solid var(--color-divider,rgba(59,43,29,0.34))',
          }}
        >
          {entry.essential ? FLAG_ESSENTIAL : FLAG_SPECIALIST}
        </p>
      </div>

      {/* REGISTER 1 — REFERENCE TEXT. Quiet editorial on paper: what it is,
          where it came from, when to wear it. Nothing competes here. On wide
          screens it runs as two columns — the text left, a narrow plate for
          the piece itself right; on mobile the plate drops away and the copy
          stays stacked exactly as it was. */}
      <div className="mt-6 flex items-start gap-6" style={{ background: PAPER, padding: '22px 22px 24px' }}>
        <div className="flex-1 min-w-0">
          <div>
            <SectionHead>What it is</SectionHead>
            <p className={typography.color.primary} style={bodyType}>{entry.what}</p>
          </div>
          <div className="mt-6">
            <SectionHead>Origin &amp; history</SectionHead>
            <p className={typography.color.primary} style={bodyType}>{entry.history}</p>
          </div>
          <div className="mt-6">
            <SectionHead>When to wear it</SectionHead>
            <p className={typography.color.primary} style={bodyType}>{entry.useCase}</p>
          </div>
        </div>
        <div className="hidden sm:block flex-shrink-0" style={{ width: '110px' }}>
          {plate ? (
            <ProductPhoto
              brand={plate.retailer}
              name={plate.product || entry.name}
              href={plate.url}
              className="w-[110px]"
              renderWidth={110}
              category={entry.categoryId}
            />
          ) : (
            <span
              className="block"
              aria-hidden="true"
              style={{
                width: '110px',
                aspectRatio: '4 / 5',
                background: '#ede3d0',
                border: '1px solid var(--color-divider,rgba(59,43,29,0.18))',
              }}
            />
          )}
        </div>
      </div>

      {/* REGISTER 2 — BEAU FOR YOU. His own card: the warmer ground inside a
          walnut hairline, headed in oxblood. A personal note, not reference. */}
      <div className="mt-6" style={{ background: WARM, border: `1px solid ${WALNUT}`, padding: '18px 20px 20px' }}>
        <p
          className="uppercase not-italic"
          style={{ fontFamily: 'var(--space-font-heading)', fontSize: '11.5px', letterSpacing: '0.15em', color: BEAU_INK, marginBottom: '7px' }}
        >
          Beau for you
        </p>
        <p style={{ ...bodyType, color: BEAU_INK, fontStyle: 'italic' }}>
          {owned ? (
            <>You have this covered — {owned.name} in your wardrobe.</>
          ) : entry.essential ? (
            <>
              This is a gap for you — you don’t have one yet.{' '}
              {forYouSub && (
                <button
                  type="button"
                  onClick={() => onSeeForYou(forYouSub)}
                  className="hover:opacity-80 not-italic"
                  style={{ fontFamily: 'var(--space-font-family)', fontSize: '14.5px', color: BEAU_INK, textDecoration: 'underline', textUnderlineOffset: '3px' }}
                >
                  → See options in For You
                </button>
              )}
            </>
          ) : (
            <>Not a gap right now — but worth knowing about as your wardrobe develops.</>
          )}
        </p>
      </div>

      {/* REGISTER 3 — PAIRS WELL WITH. Chips, not prose: scannable at a
          glance, and obviously a different kind of content. */}
      <div className="mt-7">
        <SectionHead>Pairs well with</SectionHead>
        <div className="flex flex-wrap gap-2" aria-label={`What a ${entry.name} pairs with`}>
          {entry.pairings.map((pairing) => {
            const sub = subcategoryForText(pairing);
            const chip = (
              <span
                className={typography.color.primary}
                style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', lineHeight: 1.3 }}
              >
                {pairing}
              </span>
            );
            const chipStyle: React.CSSProperties = {
              background: PAPER,
              border: '1px solid var(--color-divider,rgba(59,43,29,0.34))',
              borderRadius: '999px',
              padding: '9px 14px',
              minHeight: '38px',
              display: 'inline-flex',
              alignItems: 'center',
            };
            return sub ? (
              <button
                key={pairing}
                type="button"
                onClick={() => onSeeForYou(sub)}
                style={chipStyle}
                className="transition-colors hover:border-[var(--color-accent,#a8712c)]"
                title={`See Beau’s ${sub.label.toLowerCase()} picks`}
              >
                {chip}
              </button>
            ) : (
              <span key={pairing} style={chipStyle}>
                {chip}
              </span>
            );
          })}
        </div>
      </div>

      {/* REGISTER 4 — WHERE TO FIND ONE. Mini retailer cards in the same
          shoppable register as The Rail's Tier 2 — maker left, price guide
          centre, tap-through right, hairline between rows. */}
      <div className="mt-7 pb-4">
        <SectionHead>Where to find one</SectionHead>
        {personalised && (
          <p
            className="not-italic"
            style={{ fontFamily: 'var(--space-font-family)', fontSize: '12.5px', lineHeight: 1.5, color: BEAU_INK, marginBottom: '4px', maxWidth: '62ch' }}
          >
            Beau’s own picks for this gap — the makers he’d put in front of you on the For You rail.
          </p>
        )}
        <div style={{ borderBottom: '1px solid var(--color-divider,rgba(59,43,29,0.18))' }}>
          {findCards.map((card) => (
            <FindRow key={card.key} card={card} category={entry.categoryId} />
          ))}
        </div>
        <p className={`${typography.size.xs} ${typography.color.muted} mt-3`} style={{ fontSize: '10px', maxWidth: '62ch' }}>
          {personalised
            ? 'Matched to your profile and your wardrobe. Tap any photograph to open the product page at the source.'
            : 'Item-specific pages on quality retailers and maker sites — never a bare homepage. Fill in your profile and Beau swaps this for the makers he’d recommend to YOU.'}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The World of Menswear root — search on top, category browse beneath,
// detail view on tap.
// ---------------------------------------------------------------------------

export function WorldOfMenswear({
  pieces,
  profile = null,
  onSeeForYou,
}: {
  pieces: WardrobePiece[];
  /** Drives Beau's personalised "Where to find one" list. */
  profile?: StyleProfile | null;
  /** "→ See options in For You" — opens the For You sub-tab on this
   * sub-category's Tier 2 recommendations. */
  onSeeForYou: (sub: RailSubcategory) => void;
}) {
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const results = useMemo(() => searchWorldEntries(query), [query]);
  const searching = query.trim().length > 0;
  const open = worldEntry(openId);

  if (open) {
    return (
      <WorldEntryPage
        entry={open}
        pieces={pieces}
        profile={profile}
        onBack={() => setOpenId(null)}
        onSeeForYou={onSeeForYou}
      />
    );
  }

  return (
    <div>
      {/* Standfirst — what this half of The Rail is for. */}
      <p className={typography.color.primary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '16px', lineHeight: 1.55, maxWidth: '62ch', marginBottom: '18px' }}>
        The whole map of classic menswear — every piece type, famous and obscure, so you never need to already
        know a thing exists to find it. Search it, or browse category by category; every entry tells you what it
        is, where it came from, and whether it’s a gap for you.
      </p>

      {/* SEARCH — always visible at the top; typing filters in real time. */}
      <div
        className="flex items-center gap-2.5 bg-[var(--color-paper,#fbf8f1)] focus-within:border-[var(--color-accent,#a8712c)] transition-colors"
        style={{ border: '1px solid var(--color-divider,rgba(59,43,29,0.34))', padding: '0 14px', height: '48px' }}
      >
        <Search className="w-4 h-4 flex-shrink-0 text-[var(--color-neutral-600,#856c51)]" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search every piece type — “balmacaan”, “loafer”, “something for rain”…"
          aria-label="Search the World of Menswear"
          className="w-full bg-transparent focus:outline-none placeholder:text-[var(--color-neutral-500,#a68e70)]"
          style={{ fontFamily: 'var(--space-font-family)', fontSize: '14.5px', color: 'var(--space-text-primary)' }}
        />
        {searching && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="flex-shrink-0 text-[var(--color-neutral-600,#856c51)] hover:text-[var(--space-text-primary)]"
            style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px' }}
            aria-label="Clear the search"
          >
            Clear ×
          </button>
        )}
      </div>
      <p className={`${typography.size.xs} ${typography.color.muted} mt-2`} style={{ fontSize: '10.5px' }}>
        {searching
          ? `${results.length} entr${results.length === 1 ? 'y' : 'ies'} match${results.length === 1 ? 'es' : ''} “${query.trim()}”`
          : `${WORLD_ENTRIES.length} piece types across ${WORLD_CATEGORIES.length} categories — discovery is the default; search is the shortcut.`}
      </p>

      {searching ? (
        /* SEARCH RESULTS — a flat hairline list, category named on each row. */
        <div className="mt-5 border-t border-[var(--color-divider,rgba(59,43,29,0.18))]">
          {results.map((entry) => {
            const cat = WORLD_CATEGORIES.find((c) => c.id === entry.categoryId);
            return <EntryRow key={entry.id} entry={entry} kicker={cat ? cat.label : null} onOpen={() => setOpenId(entry.id)} />;
          })}
          {results.length === 0 && (
            <p className="py-6" style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', lineHeight: 1.6, color: 'var(--color-neutral-600,#856c51)', maxWidth: '58ch' }}>
              Nothing in the reference matches that — try a simpler word (“boot”, “coat”, “linen”), or ask Beau
              directly and he’ll point you to the right entry.
            </p>
          )}
        </div>
      ) : (
        /* BROWSE BY CATEGORY — ten sections in the canonical menswear order. */
        <div>
          {WORLD_CATEGORIES.map((category) => {
            const entries = worldEntriesFor(category.id);
            if (entries.length === 0) return null;
            return (
              <section key={category.id} aria-label={category.label} style={{ marginTop: '34px' }}>
                <div style={{ borderBottom: '1px solid var(--color-accent,#a8712c)', paddingBottom: '9px' }}>
                  <div className="flex items-baseline justify-between gap-3">
                    <h4
                      className={typography.color.primary}
                      style={{ fontFamily: 'var(--space-font-heading)', fontWeight: 400, fontSize: '26px', lineHeight: 1.15 }}
                    >
                      {category.label}
                    </h4>
                    <span className="hab-kicker text-[var(--color-neutral-600,#856c51)] tabular-nums flex-shrink-0" style={{ letterSpacing: '0.14em' }}>
                      {entries.length} entries
                    </span>
                  </div>
                  <p
                    className="text-[var(--color-neutral-700,#634e38)]"
                    style={{ fontFamily: 'var(--space-font-family)', fontSize: '13.5px', lineHeight: 1.55, marginTop: '4px', maxWidth: '62ch' }}
                  >
                    {category.blurb}
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8">
                  {entries.map((entry) => (
                    <EntryRow key={entry.id} entry={entry} onOpen={() => setOpenId(entry.id)} />
                  ))}
                </div>
              </section>
            );
          })}

          <p className={`${typography.size.xs} ${typography.color.muted} mt-8`} style={{ fontSize: '10px', maxWidth: '68ch' }}>
            Every entry carries the full file: what it is, where it came from, when to wear it, what it pairs with,
            whether it’s a wardrobe essential or a specialist piece, and where to find a good one. Beau’s note on
            each entry ties it back to YOUR wardrobe — owned, a live gap (with the way into For You), or simply
            worth knowing about.
          </p>
        </div>
      )}
    </div>
  );
}
