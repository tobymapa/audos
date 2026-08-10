/**
 * THE INDEX · PIECES · AS A LIST — rebuilt to design handoff screen 13a
 * (“The piece index, set as an index”).
 *
 * A row per type was the wrong unit; prose paragraphs were worse. The list
 * is set as an INDEX: a category and its description on the LEFT, its types
 * on the RIGHT in columns you read down, grouped by the runs a tailor would
 * use (Button-front · Jersey & knitted · Town coats · …). Names sit on
 * their own line so the eye can find one, not read a paragraph.
 *
 *  · OWNERSHIP reads through the row's ink alone — no dots, no swatches,
 *    no counts on the rows (UI cleanup pass: the colour circles are gone).
 *  · FIND — one search bar over the whole index; typing narrows every
 *    category at once. Nothing is removed from the taxonomy, only from view.
 *  · THE THREE READINGS — Everything · The core · You own, as view chips.
 *  · FOUR FILTERS — archetype · occasion · essentialness · flexibility, so
 *    the count isn't the only reading. One filter per row; tap again to
 *    clear; a quiet count + Clear line under the rows shows what's on.
 *  · THE JUMP RAIL — category names + counts between the filters and the
 *    list; tapping one scrolls its section into view.
 *  · Tapping a type WITH an entry opens its full World of Menswear page;
 *    the rest read as reference rows — the taxonomy is the point.
 *
 * The map/quadrant toggle stays at the header's right edge (previous pass);
 * this file only re-sets the list reading.
 */
import { useMemo, useRef, useState } from 'react';
import type React from 'react';
import { swatchFor, type StyleProfile, type WardrobePiece } from './profile-data';
import type { RailSubcategory } from './rail-subcategories';
import { worldEntry } from './world-taxonomy';
import { PieceDetailPanel } from './index-detail-panel';
import { catalogDirectoryEntries } from './brands';
import { PIECE_INDEX_CATEGORIES, type PieceIndexCategory, type PieceIndexType } from './piece-index-data';
import { MONO, usePlexMono } from './mono-type';
import { useIsNarrow } from './plot-zoom';

// ---------------------------------------------------------------------------
// The 13a palette and type registers.
// ---------------------------------------------------------------------------

const SERIF = 'var(--space-font-heading)';
const BODY = 'var(--space-font-family)';
const WALNUT = '#241a12';
const INK = '#3b2b1d';
const SECONDARY = '#634e38';
const MUTED = '#856c51';
const FAINT = '#a68e70';
const ACCENT = '#a8712c';
const ACCENT_DEEP = '#7c4a17';
const PAPER = '#f6f0e5';

function mono(size = 9, color = FAINT): React.CSSProperties {
  return { fontFamily: MONO, fontSize: `${size}px`, letterSpacing: '0.06em', textTransform: 'uppercase', color };
}

// ---------------------------------------------------------------------------
// The four filter dimensions (13a) — archetype and occasion read off each
// type's name + subgroup with menswear keyword rules; essentialness comes
// straight from the data (core = essential entry, common = has an entry,
// specialist = reference-only); flexibility is derived from how many
// occasions a type serves. Filters narrow from VIEW, never from the data.
// ---------------------------------------------------------------------------

const ARCHETYPES = ['Ivy', 'British country', 'Continental', 'Workwear', 'Military', 'Sport'] as const;
const OCCASIONS = ['Everyday', 'Work', 'Dinner', 'Outdoors', 'Travel', 'Formal'] as const;
const ESSENTIALNESS = ['Core', 'Common', 'Specialist'] as const;
const FLEXIBILITY = ['Three registers', 'Two', 'One'] as const;

const ARCHETYPE_RULES: Array<[string, RegExp]> = [
  ['Ivy', /ocbd|oxford shirt|madras|seersucker|popover|penny loafer|tassel|saddle shoe|\bbuck\b|varsity|rugby|cricket|tennis|boater|baseball cap|chinos|blazer|shetland|shawl collar|crew neck|polo coat|duffle coat|sweatshirt|slipover|sweater vest|breton|pocket tee|herringbone|pinpoint/],
  ['British country', /waxed|barn|tweed|norfolk|hacking|shooting|gilet|covert|crombie|british warm|guards|wellington|country brogue|flat cap|deerstalker|moleskin|cavalry twill|whipcord|plus fours|breeches|jodhpur|fair isle|guernsey|aran|cable|loden|tyrolean|mackintosh|balmacaan|ulster|inverness|corduroy|cords|chukka|brogue|riding/],
  ['Continental', /teba|sahariana|safari|linen|fresco|driving|loafer|espadrille|camp collar|guayabera|neckerchief|silk scarf|double-breasted|unstructured|suede|car coat|belgian|panama|knitted polo|riviera|nehru|mandarin/],
  ['Workwear', /chore|carpenter|painter|boiler|dungarees|donkey|bleu de travail|smock|mackinaw|work shirt|work boot|moc-toe|engineer|roper|denim|jeans|trucker|five-pocket|western|chambray|flannel shirt|chamois|ranch|duck boot|fatigues|noragi|watch cap|beanie/],
  ['Military', /field jacket|m-43|m-65|m-51|parka|bomber|flight jacket|deck jacket|ike jacket|tanker|souvenir|peacoat|reefer|trench|cargo|fatigues|service boot|balaclava|ushanka|trapper|military/],
  ['Sport', /track|\bski\b|tennis|rugby|baseball|swim|board shorts|sweat|runner|plimsoll|skate|trail|hiking|fleece|windbreaker|anorak|cagoule|sneaker|hoodie|high-top|varsity|sport socks|polo\b/],
];

const OCCASION_RULES: Array<[string, RegExp]> = [
  ['Work', /dress shirt|dress trousers|dress belt|dress socks|oxford shirt|ocbd|poplin|pinpoint|twill dress|suit\b|blazer|sport coat|odd jacket|waistcoat|tie\b|briefcase|attaché|portfolio|cap-toe|wholecut|derby|monk|overcoat|chesterfield|covert|trench|mac\b|mackintosh|cufflinks|collar/],
  ['Dinner', /dinner|smoking|patent|opera|silk scarf|double-breasted|loafer|blazer|velvet|signet/],
  ['Outdoors', /parka|anorak|cagoule|hiking|duck boot|wellington|snow|gilet|down |puffer|waxed|shooting|barn|mackinaw|field jacket|trapper|balaclava|beanie|watch cap|boot socks|thermal|merino|fleece|windbreaker|mountain|ski\b|wax/],
  ['Travel', /car coat|weekender|holdall|duffle\b|dopp|garment bag|espadrille|panama|sun hat|camp collar|linen|driving|swim|board shorts|sunglasses|rucksack|backpack|messenger|tote|camera bag|belt bag/],
  ['Formal', /tailcoat|morning coat|frock|dinner|tuxedo|patent|opera|cummerbund|bow tie|wing collar|marcella|top hat|kilt|doublet|homburg|three-piece|dress waistcoat/],
];

interface TypeMeta {
  archetypes: Set<string>;
  occasions: Set<string>;
  essential: (typeof ESSENTIALNESS)[number];
  flexibility: (typeof FLEXIBILITY)[number];
}

function metaFor(type: PieceIndexType, group: string, categoryId: string): TypeMeta {
  const text = `${type.name} ${group}`.toLowerCase();
  const archetypes = new Set<string>();
  for (const [tag, rx] of ARCHETYPE_RULES) if (rx.test(text)) archetypes.add(tag);
  if (group === 'Military & flight') archetypes.add('Military');
  if (group === 'Country & work' || group === 'Riding & country') archetypes.add('British country');
  const occasions = new Set<string>();
  for (const [tag, rx] of OCCASION_RULES) if (rx.test(text)) occasions.add(tag);
  if (group === 'Tailored' || group === 'Suits' || group === 'Odd jackets' || group === 'Waistcoats' || group === 'Lace-ups') occasions.add('Work');
  if (group === 'Black tie & ceremonial') occasions.add('Formal');
  if (group === 'Country & work' || group === 'Rain & wind' || group === 'Boots' || group === 'Riding & country') occasions.add('Outdoors');
  if (categoryId === 'bags') occasions.add('Travel');
  if (
    type.core ||
    categoryId === 'sweatshirts' ||
    group === 'Jersey & knitted' ||
    group === 'Denim' ||
    group === 'Sneakers' ||
    group === 'Casual' ||
    group === 'Under' ||
    group === 'Hosiery'
  ) {
    occasions.add('Everyday');
  }
  const essential = type.core ? 'Core' : type.entry ? 'Common' : 'Specialist';
  const flexibility = occasions.size >= 3 ? 'Three registers' : occasions.size === 2 ? 'Two' : 'One';
  return { archetypes, occasions, essential, flexibility };
}

// ---------------------------------------------------------------------------
// Ownership — swatches are the colours you own. Each PIECE claims its ONE
// best-matching type (longest keyword wins), so a polo coat never lights up
// “Polo”. Matching text is the piece's own name + slot + category.
// ---------------------------------------------------------------------------

function typeKey(categoryId: string, name: string): string {
  return `${categoryId}\u241f${name}`;
}

function keywordsFor(type: PieceIndexType): string[] {
  const lower = type.name.toLowerCase();
  const paren = lower.match(/\(([^)]+)\)/)?.[1]?.trim();
  const clean = lower.replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim();
  const kws = [clean];
  if (paren) kws.push(paren);
  const entry = worldEntry(type.entry || null);
  if (entry) {
    kws.push(entry.name.toLowerCase());
    for (const k of entry.keywords) kws.push(k.toLowerCase());
  }
  return kws.filter((k) => k.length >= 3);
}

function useOwnership(pieces: WardrobePiece[]) {
  return useMemo(() => {
    const flat: Array<{ key: string; kws: string[] }> = [];
    for (const cat of PIECE_INDEX_CATEGORIES) {
      for (const group of cat.groups) {
        for (const type of group.types) {
          flat.push({ key: typeKey(cat.id, type.name), kws: keywordsFor(type) });
        }
      }
    }
    const swatchesByType = new Map<string, string[]>();
    for (const piece of pieces) {
      const text = `${piece.name || ''} ${piece.slot || ''} ${piece.category || ''}`.toLowerCase();
      if (!text.trim()) continue;
      let bestKey: string | null = null;
      let bestLen = 0;
      for (const { key, kws } of flat) {
        for (const kw of kws) {
          if (kw.length > bestLen && text.includes(kw)) {
            bestKey = key;
            bestLen = kw.length;
          }
        }
      }
      if (!bestKey) continue;
      const existing = swatchesByType.get(bestKey) || [];
      for (const c of piece.colors || []) {
        const sw = swatchFor(c);
        if (sw && existing.length < 4 && !existing.includes(sw)) existing.push(sw);
      }
      if (existing.length === 0) existing.push('#d5d3cd');
      swatchesByType.set(bestKey, existing);
    }
    return swatchesByType;
  }, [pieces]);
}

// ---------------------------------------------------------------------------
// Small shared bits.
// ---------------------------------------------------------------------------

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="whitespace-nowrap transition-colors hover:opacity-85"
      style={{
        fontFamily: MONO,
        fontSize: '9px',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        padding: '4px 10px',
        ...(active
          ? { background: WALNUT, color: PAPER, border: `1px solid ${WALNUT}` }
          : { background: 'transparent', color: SECONDARY, border: '1px solid rgba(59,43,29,0.3)' }),
      }}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// The list itself.
// ---------------------------------------------------------------------------

type ViewChip = 'all' | 'core' | 'own';

export function PieceIndexList({
  pieces,
  profile,
  onSeeForYou,
  toggle,
}: {
  pieces: WardrobePiece[];
  profile: StyleProfile | null;
  onSeeForYou: (sub: RailSubcategory) => void;
  /** The AS A LIST · ON A MAP · AS A QUADRANT toggle — the sub-view
   * options WITHIN the Pieces tab, rendered under the Pieces | Makers
   * switcher (which lives once, at The Index's top — never duplicated
   * here). */
  toggle: React.ReactNode;
}) {
  usePlexMono();
  const narrow = useIsNarrow();
  const [query, setQuery] = useState('');
  const [viewChip, setViewChip] = useState<ViewChip>('all');
  const [archetype, setArchetype] = useState<string | null>(null);
  const [occasion, setOccasion] = useState<string | null>(null);
  const [essential, setEssential] = useState<string | null>(null);
  const [flexibility, setFlexibility] = useState<string | null>(null);
  // THE DETAIL PANEL (8a) — which type is open, addressed as its category
  // plus its position on that category's own shelf, so forward/back can
  // walk the shelf without closing the panel.
  const [openType, setOpenType] = useState<{ catId: string; index: number } | null>(null);
  const topRef = useRef<HTMLDivElement | null>(null);

  const ownership = useOwnership(pieces);
  const metas = useMemo(() => {
    const map = new Map<string, TypeMeta>();
    for (const cat of PIECE_INDEX_CATEGORIES) {
      for (const group of cat.groups) {
        for (const type of group.types) {
          map.set(typeKey(cat.id, type.name), metaFor(type, group.label, cat.id));
        }
      }
    }
    return map;
  }, []);

  const totals = useMemo(() => {
    let all = 0;
    let core = 0;
    for (const cat of PIECE_INDEX_CATEGORIES) for (const g of cat.groups) for (const t of g.types) {
      all += 1;
      if (t.core) core += 1;
    }
    return { all, core, own: ownership.size };
  }, [ownership]);

  const q = query.trim().toLowerCase();
  const filtersOn = !!(q || viewChip !== 'all' || archetype || occasion || essential || flexibility);

  const passes = (cat: PieceIndexCategory, type: PieceIndexType): boolean => {
    const key = typeKey(cat.id, type.name);
    if (q && !type.name.toLowerCase().includes(q)) return false;
    if (viewChip === 'core' && !type.core) return false;
    if (viewChip === 'own' && !ownership.has(key)) return false;
    const meta = metas.get(key);
    if (!meta) return true;
    if (archetype && !meta.archetypes.has(archetype)) return false;
    if (occasion && !meta.occasions.has(occasion)) return false;
    if (essential && meta.essential !== essential) return false;
    if (flexibility && meta.flexibility !== flexibility) return false;
    return true;
  };

  const visibleCount = useMemo(() => {
    let n = 0;
    for (const cat of PIECE_INDEX_CATEGORIES) for (const g of cat.groups) for (const t of g.types) if (passes(cat, t)) n += 1;
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, viewChip, archetype, occasion, essential, flexibility, ownership, metas]);

  const clearFilters = () => {
    setQuery('');
    setViewChip('all');
    setArchetype(null);
    setOccasion(null);
    setEssential(null);
    setFlexibility(null);
  };

  // The open type's category shelf — every type of the category in list
  // order; the panel's ← → walk it (8a: "← Oxford · ALL SHOES · 7 · Loafer →").
  const openPanel = (() => {
    if (!openType) return null;
    const cat = PIECE_INDEX_CATEGORIES.find((c) => c.id === openType.catId);
    if (!cat) return null;
    const shelf = cat.groups.flatMap((group) => group.types.map((type) => ({ ...type, group: group.label })));
    const index = Math.max(0, Math.min(shelf.length - 1, openType.index));
    const type = shelf[index];
    if (!type) return null;
    const key = typeKey(cat.id, type.name);
    const meta = metas.get(key);
    return (
      <PieceDetailPanel
        category={cat}
        type={type}
        occasions={meta ? [...meta.occasions] : []}
        ownedSwatches={ownership.get(key)}
        position={{ index, total: shelf.length }}
        prevName={index > 0 ? shelf[index - 1].name.replace(/\(.*?\)/g, '').trim() : null}
        nextName={index < shelf.length - 1 ? shelf[index + 1].name.replace(/\(.*?\)/g, '').trim() : null}
        pieceTotal={totals.all}
        makerTotal={catalogDirectoryEntries().length}
        onPrev={() => setOpenType({ catId: cat.id, index: Math.max(0, index - 1) })}
        onNext={() => setOpenType({ catId: cat.id, index: Math.min(shelf.length - 1, index + 1) })}
        onClose={() => setOpenType(null)}
      />
    );
  })();

  const columns = narrow ? 2 : 4;

  return (
    <div ref={topRef}>
      {/* ------------------------------------------------------- the header */}
      <div
        className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-5 md:gap-12 md:items-end"
        style={{ paddingBottom: '20px' }}
      >
        <div>
          <h3 style={{ margin: 0, fontFamily: SERIF, fontSize: 'clamp(32px, 4.5vw, 46px)', fontWeight: 400, lineHeight: 1.08, letterSpacing: '-0.012em', color: WALNUT }}>
            The piece index
          </h3>
          <p style={{ margin: '12px 0 0', maxWidth: '74ch', fontFamily: BODY, fontSize: '15.5px', lineHeight: 1.58, color: INK }}>
            {totals.all} garment types in the app’s own eleven categories — the Teba and the Sahariana next to the
            blazer, the donkey jacket next to the overcoat. A category and its description on the left; its types on
            the right in columns you read down, grouped by the runs a tailor would use. Names sit on their own line
            so the eye can find one, not read a paragraph.
          </p>
        </div>
        <div className="flex flex-col items-start md:items-end" style={{ gap: '10px' }}>
          {/* The duplicate Pieces · N | Makers chip is GONE (UI corrections
              pass) — the ONE Pieces | Makers switcher lives at the top of
              The Index; this header carries only the sub-view toggle. */}
          {toggle}
          <span style={{ ...mono(10, MUTED), letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
            You own {totals.own} type{totals.own === 1 ? '' : 's'} of {totals.all}
          </span>
        </div>
      </div>

      {/* ------------------------------------------- find + the three views */}
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] items-center" style={{ gap: '14px 32px', paddingBottom: '14px' }}>
        <label
          className="flex items-center focus-within:border-[var(--color-accent,#a8712c)] transition-colors"
          style={{ gap: '14px', border: '1px solid rgba(59,43,29,0.35)', padding: '9px 14px', maxWidth: '520px' }}
        >
          <span style={mono(10, FAINT)}>Find</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='a type — try “teba”, “monk”, “parka”'
            aria-label="Find a garment type in the index"
            className="w-full bg-transparent focus:outline-none placeholder:text-[#856c51]"
            style={{ fontFamily: BODY, fontSize: '14px', color: INK }}
          />
        </label>
        <div className="flex flex-wrap" style={{ gap: '8px' }}>
          <FilterChip label={`Everything ${totals.all}`} active={viewChip === 'all'} onClick={() => setViewChip('all')} />
          <FilterChip label={`The core ${totals.core}`} active={viewChip === 'core'} onClick={() => setViewChip(viewChip === 'core' ? 'all' : 'core')} />
          <FilterChip label={`You own ${totals.own}`} active={viewChip === 'own'} onClick={() => setViewChip(viewChip === 'own' ? 'all' : 'own')} />
        </div>
      </div>

      {/* ------------------------------------------------ the four filters */}
      <div style={{ padding: '6px 0 16px' }}>
        <div>
          {([
            ['Archetype', ARCHETYPES as readonly string[], archetype, setArchetype],
            ['Occasion', OCCASIONS as readonly string[], occasion, setOccasion],
            ['Essentialness', ESSENTIALNESS as readonly string[], essential, setEssential],
            ['Flexibility', FLEXIBILITY as readonly string[], flexibility, setFlexibility],
          ] as Array<[string, readonly string[], string | null, (v: string | null) => void]>).map(([label, options, value, set]) => (
            <div
              key={label}
              className="grid grid-cols-[86px_minmax(0,1fr)] sm:grid-cols-[104px_minmax(0,1fr)] items-baseline"
              style={{ gap: '14px', padding: '9px 0', borderBottom: '1px solid rgba(59,43,29,0.14)' }}
            >
              <div style={mono(9, FAINT)}>{label}</div>
              <div className="flex flex-wrap" style={{ gap: '7px' }}>
                {options.map((option) => (
                  <FilterChip key={option} label={option} active={value === option} onClick={() => set(value === option ? null : option)} />
                ))}
              </div>
            </div>
          ))}
        </div>
        {/* The quiet status line — what's on and the way out. */}
        {filtersOn && (
          <div className="flex items-center flex-wrap" style={{ gap: '14px', paddingTop: '10px' }}>
            <span style={mono(9, ACCENT_DEEP)}>
              {visibleCount} type{visibleCount === 1 ? '' : 's'} shown
            </span>
            <button type="button" onClick={clearFilters} className="hover:underline" style={{ ...mono(9, MUTED), background: 'transparent' }}>
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* -------------------------------------------------- the jump rail */}
      <div
        className="flex flex-wrap"
        style={{ gap: '8px 22px', padding: '12px 0', borderTop: '1px solid rgba(59,43,29,0.18)', borderBottom: `1px solid ${INK}` }}
      >
        {PIECE_INDEX_CATEGORIES.map((cat) => {
          const count = cat.groups.reduce((n, g) => n + g.types.length, 0);
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => document.getElementById(`piece-index-${cat.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="hover:underline whitespace-nowrap"
              style={{ ...mono(9.5, SECONDARY), background: 'transparent' }}
            >
              {cat.name} <span style={{ color: FAINT }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* ------------------------------------------------ the categories */}
      {PIECE_INDEX_CATEGORIES.map((cat) => {
        const total = cat.groups.reduce((n, g) => n + g.types.length, 0);
        const ownedHere = cat.groups.reduce(
          (n, g) => n + g.types.filter((t) => ownership.has(typeKey(cat.id, t.name))).length,
          0,
        );
        const visibleGroups = cat.groups
          .map((group) => ({ group, types: group.types.filter((t) => passes(cat, t)) }))
          .filter(({ types }) => types.length > 0);
        if (visibleGroups.length === 0) return null;
        return (
          <section
            key={cat.id}
            id={`piece-index-${cat.id}`}
            aria-label={cat.name}
            className="grid grid-cols-1 md:grid-cols-[230px_minmax(0,1fr)]"
            style={{ gap: '18px 40px', padding: '24px 0', borderBottom: '1px solid rgba(59,43,29,0.24)', scrollMarginTop: '84px' }}
          >
            <div>
              <div style={{ fontFamily: SERIF, fontSize: '25px', lineHeight: 1.1, color: WALNUT }}>{cat.name}</div>
              <div style={{ marginTop: '7px', fontFamily: BODY, fontSize: '12.5px', lineHeight: 1.5, color: SECONDARY }}>{cat.blurb}</div>
              <div style={{ marginTop: '9px', ...mono(9, FAINT) }}>
                {total} types{ownedHere > 0 ? ` · you own ${ownedHere}` : ''}
              </div>
            </div>
            <div className="flex flex-col" style={{ gap: '16px' }}>
              {visibleGroups.map(({ group, types }) => {
                const rows = Math.max(1, Math.ceil(types.length / columns));
                return (
                  <div key={group.label} className="grid grid-cols-1 sm:grid-cols-[90px_minmax(0,1fr)] items-start" style={{ gap: '6px 18px' }}>
                    <div style={{ ...mono(9, FAINT), paddingTop: '5px' }}>{group.label}</div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                        gridAutoFlow: 'column',
                        gridTemplateRows: `repeat(${rows}, auto)`,
                        columnGap: '22px',
                      }}
                    >
                      {types.map((type) => {
                        const key = typeKey(cat.id, type.name);
                        const owned = ownership.get(key);
                        const nameNode = <span style={{ display: 'block' }}>{type.name}</span>;
                        const rowStyle: React.CSSProperties = {
                          display: 'grid',
                          gridTemplateColumns: '11px minmax(0,1fr)',
                          padding: '3px 0',
                          fontFamily: BODY,
                          fontSize: '13.5px',
                          lineHeight: 1.35,
                          color: owned ? WALNUT : INK,
                          textAlign: 'left',
                        };
                        // EVERY TYPE OPENS ITS ENTRY PANEL (8a) — the ones
                        // with a written entry carry the full file; the rest
                        // open as reference rows, still navigable.
                        const shelfIndex = cat.groups
                          .flatMap((g) => g.types)
                          .findIndex((t) => t.name === type.name);
                        return (
                          <button
                            key={type.name}
                            type="button"
                            onClick={() => setOpenType({ catId: cat.id, index: shelfIndex })}
                            className="hover:underline"
                            style={{ ...rowStyle, background: 'transparent' }}
                            aria-label={`${type.name} — open the entry`}
                          >
                            <span />
                            {nameNode}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {visibleCount === 0 && (
        <p style={{ padding: '24px 0', fontFamily: BODY, fontSize: '14px', lineHeight: 1.6, color: MUTED, maxWidth: '58ch' }}>
          Nothing matches that reading — clear a filter (or the search) and the index refills. Nothing has been
          removed from the taxonomy, only from view.
        </p>
      )}

      {/* --------------------------------------------------- the footnote */}
      <div
        style={{
          marginTop: '24px',
          padding: '13px 16px',
          background: '#fbf6e9',
          borderLeft: `2px solid ${ACCENT}`,
          fontFamily: BODY,
          fontSize: '13px',
          lineHeight: 1.55,
          color: INK,
          maxWidth: '86ch',
        }}
      >
        Tapping a type opens its entry — what it is, what separates a good one, which registers it serves, who makes
        it well. The obscure ones are being written up entry by entry; every type is already findable, filterable
        and mappable — that is the point of a reference work.
      </div>

      {/* THE ENTRY PANEL (8a) — opened over the index, ← → walk the shelf,
          backdrop · × · Escape dismiss it. */}
      {openPanel}
    </div>
  );
}
