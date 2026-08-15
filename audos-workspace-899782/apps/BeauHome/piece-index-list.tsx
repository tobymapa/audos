/**
 * THE INDEX · PIECES · THE ROOT LIST — rebuilt to the founder's visual pass
 * (design screen: the piece index as one page of category runs):
 *
 *  · EVERY CATEGORY HEADS ITS OWN RUN — “Outerwear.” in serif with its
 *    count, an italic line Beau writes against THIS wearer beneath it
 *    (index-beau-copy.ts — generated and cached, never a fixed string),
 *    then the run's rows: type name · temperature band · verdict. The most
 *    judgeable rows show first (owned · flagged gaps · core · written up);
 *    “+ N more ↓” unfolds the rest.
 *  · THE ROW is the shared PlateRow (category-plate.tsx): owned rows draw a
 *    filled walnut band, the maker and OWNED; a gap the board names rides a
 *    tinted row with a dashed band; everything else draws grey. Names are
 *    links — a type opens its 8a entry panel, a category name opens the
 *    CATEGORY PLATE (the L1 drill-down page, same file).
 *  · THE FOOT — three small annotation blocks (the structure · types &
 *    gaps · the colour system), Beau-written against the wearer's own
 *    coverage.
 *
 * FIXED · FITTED · GENERATED — the taxonomy and each type's band are
 * written once and identical for every user (index-lenses.ts); the verdict
 * column is computed per user from their city's climate curve; owned marks
 * and swatches come from the ledger, gap flags from the board; the prose is
 * the ONLY generated register, and it caches on the facts it was written
 * from. The LIST · QUADRANT toggle stays at the right edge of the find row
 * (never removed).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { swatchFor, type StyleProfile, type WardrobePiece } from './profile-data';
import { worldEntry } from './world-taxonomy';
import { PieceDetailPanel } from './index-detail-panel';
import { catalogDirectoryEntries } from './brands';
import { PIECE_INDEX_CATEGORIES, type PieceIndexCategory, type PieceIndexType } from './piece-index-data';
import { peekBeauAssessment } from './beau-assessment';
import { ensureSharedWeather, useSharedWeather } from './weather-context';
import { cityCurveFrom, typeBandFor, verdictFor } from './index-lenses';
import { MONO, usePlexMono } from './mono-type';
import { useIsNarrow } from './plot-zoom';
import {
  AnnotationFoot,
  CategoryPlate,
  PlateColumnsHeader,
  PlateRow,
  cleanTypeName,
  rankRows,
  scaleFor,
  type IndexRow,
} from './category-plate';
import { useRootIndexCopy, type RootIndexFacts } from './index-beau-copy';

// ---------------------------------------------------------------------------
// The palette and type registers.
// ---------------------------------------------------------------------------

const SERIF = 'var(--space-font-heading)';
const BODY = 'var(--space-font-family)';
const WALNUT = '#241a12';
const INK = '#3b2b1d';
const SECONDARY = '#634e38';
const MUTED = '#856c51';
const FAINT = '#a68e70';
const ACCENT_DEEP = '#7c4a17';

function mono(size = 9, color = FAINT): React.CSSProperties {
  return { fontFamily: MONO, fontSize: `${size}px`, letterSpacing: '0.06em', textTransform: 'uppercase', color };
}

// ---------------------------------------------------------------------------
// Registers per type — occasion reads off each type's name + subgroup with
// menswear keyword rules (the 8a detail panel reads it). Fixed, written once.
// ---------------------------------------------------------------------------

const OCCASION_RULES: Array<[string, RegExp]> = [
  ['Work', /dress shirt|dress trousers|dress belt|dress socks|oxford shirt|ocbd|poplin|pinpoint|twill dress|suit\b|blazer|sport coat|odd jacket|waistcoat|tie\b|briefcase|attaché|portfolio|cap-toe|wholecut|derby|monk|overcoat|chesterfield|covert|trench|mac\b|mackintosh|cufflinks|collar/],
  ['Dinner', /dinner|smoking|patent|opera|silk scarf|double-breasted|loafer|blazer|velvet|signet/],
  ['Outdoors', /parka|anorak|cagoule|hiking|duck boot|wellington|snow|gilet|down |puffer|waxed|shooting|barn|mackinaw|field jacket|trapper|balaclava|beanie|watch cap|boot socks|thermal|merino|fleece|windbreaker|mountain|ski\b|wax/],
  ['Travel', /car coat|weekender|holdall|duffle\b|dopp|garment bag|espadrille|panama|sun hat|camp collar|linen|driving|swim|board shorts|sunglasses|rucksack|backpack|messenger|tote|camera bag|belt bag/],
  ['Formal', /tailcoat|morning coat|frock|dinner|tuxedo|patent|opera|cummerbund|bow tie|wing collar|marcella|top hat|kilt|doublet|homburg|three-piece|dress waistcoat/],
];

function occasionsFor(type: PieceIndexType, group: string, categoryId: string): Set<string> {
  const text = `${type.name} ${group}`.toLowerCase();
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
  if (occasions.size === 0) occasions.add('Everyday');
  return occasions;
}

// ---------------------------------------------------------------------------
// Ownership — swatches (and the maker) of what you own. Each PIECE claims
// its ONE best-matching type (longest keyword wins), so a polo coat never
// lights up “Polo”. Matching text is the piece's own name + slot + category.
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

let flatKeywordCache: Array<{ key: string; kws: string[] }> | null = null;
function flatTypeKeywords(): Array<{ key: string; kws: string[] }> {
  if (flatKeywordCache) return flatKeywordCache;
  const flat: Array<{ key: string; kws: string[] }> = [];
  for (const cat of PIECE_INDEX_CATEGORIES) {
    for (const group of cat.groups) {
      for (const type of group.types) {
        flat.push({ key: typeKey(cat.id, type.name), kws: keywordsFor(type) });
      }
    }
  }
  flatKeywordCache = flat;
  return flat;
}

interface Ownership {
  swatches: Map<string, string[]>;
  brands: Map<string, string>;
}

function useOwnership(pieces: WardrobePiece[]): Ownership {
  return useMemo(() => {
    const flat = flatTypeKeywords();
    const swatchesByType = new Map<string, string[]>();
    const brandsByType = new Map<string, string>();
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
      const brand = (piece.brand || '').trim();
      if (brand && !brandsByType.has(bestKey)) brandsByType.set(bestKey, brand);
    }
    return { swatches: swatchesByType, brands: brandsByType };
  }, [pieces]);
}

/** THE GAPS YOUR BOARD NAMES — read from the LAST stored assessment (never
 * triggers a model call), each recommendation claiming its best-matching
 * type, ranked, capped at five. */
function useGapKeys(owned: Map<string, string[]>): Map<string, number> {
  return useMemo(() => {
    const ranks = new Map<string, number>();
    const peeked = peekBeauAssessment();
    if (!peeked) return ranks;
    const flat = flatTypeKeywords();
    for (const rec of peeked.assessment.recommendations || []) {
      const text = `${(rec as any).pieceName || ''} ${(rec as any).subType || ''} ${(rec as any).category || ''}`.toLowerCase();
      if (!text.trim()) continue;
      let bestKey: string | null = null;
      let bestLen = 0;
      for (const { key, kws } of flat) {
        if (owned.has(key) || ranks.has(key)) continue;
        for (const kw of kws) {
          if (kw.length > bestLen && text.includes(kw)) {
            bestKey = key;
            bestLen = kw.length;
          }
        }
      }
      if (bestKey) ranks.set(bestKey, ranks.size + 1);
      if (ranks.size >= 5) break;
    }
    return ranks;
  }, [owned]);
}

// ---------------------------------------------------------------------------
// The list itself.
// ---------------------------------------------------------------------------

/** Rows a folded category shows before “+ N more ↓”. */
const ROOT_FOLDED = 5;

export function PieceIndexList({
  pieces,
  profile,
  toggle,
  onPlateChange,
}: {
  pieces: WardrobePiece[];
  profile: StyleProfile | null;
  /** The LIST · QUADRANT toggle — lives at the right edge of the find row;
   * the ONE Pieces | Makers switcher stays at The Index's top. */
  toggle: React.ReactNode;
  /** Tells the tab a CATEGORY PLATE is open, so the page header can yield
   * to the plate's own breadcrumb. */
  onPlateChange?: (open: boolean) => void;
}) {
  usePlexMono();
  const narrow = useIsNarrow();
  const [query, setQuery] = useState('');
  const [unfoldedCats, setUnfoldedCats] = useState<Set<string>>(new Set());
  // THE CATEGORY PLATE (L1) — which category page is open, if any.
  const [plateCatId, setPlateCatId] = useState<string | null>(null);
  // THE DETAIL PANEL (8a) — which type is open, addressed as its category
  // plus its position on that category's own shelf, so forward/back can
  // walk the shelf without closing the panel.
  const [openType, setOpenType] = useState<{ catId: string; index: number } | null>(null);
  const topRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    onPlateChange?.(plateCatId !== null);
    if (plateCatId) topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [plateCatId, onPlateChange]);
  useEffect(() => () => onPlateChange?.(false), [onPlateChange]);

  // The verdict column reads against the user's own city — the same shared
  // weather every other surface uses. Never re-prompts once a city is set.
  useEffect(() => {
    ensureSharedWeather();
  }, []);
  const { weather } = useSharedWeather();
  const curve = useMemo(() => cityCurveFrom(weather), [weather]);

  const ownership = useOwnership(pieces);
  const gaps = useGapKeys(ownership.swatches);

  // Every row of every category, keyed by category — the root list shows
  // them all, and the open plate borrows its own category's rows.
  const rowsByCat = useMemo(() => {
    const map = new Map<string, IndexRow[]>();
    for (const cat of PIECE_INDEX_CATEGORIES) {
      const out: IndexRow[] = [];
      let shelfIndex = 0;
      for (const group of cat.groups) {
        for (const type of group.types) {
          const key = typeKey(cat.id, type.name);
          const band = typeBandFor(type.name, cat.id, group.label);
          const gapRank = gaps.get(key);
          out.push({
            type,
            group: group.label,
            shelfIndex,
            key,
            band,
            verdict: verdictFor(band, curve, { name: type.name, core: type.core, gap: !!gapRank }),
            owned: ownership.swatches.get(key),
            ownedBrand: ownership.brands.get(key) || null,
            gapRank,
          });
          shelfIndex += 1;
        }
      }
      map.set(cat.id, out);
    }
    return map;
  }, [ownership, gaps, curve]);

  const allRows = useMemo(() => [...rowsByCat.values()].flat(), [rowsByCat]);
  // ONE scale for the whole root page, so a band reads the same in every
  // category's run.
  const scale = useMemo(() => scaleFor(allRows), [allRows]);
  const typeTotal = allRows.length;

  const countOf = (c: PieceIndexCategory) => c.groups.reduce((n, g) => n + g.types.length, 0);

  // The facts Beau's root copy is written from — the italic category lines
  // and the three foot blocks re-write only when these change.
  const rootFacts = useMemo<RootIndexFacts>(
    () => ({
      typeTotal,
      ownedTotal: ownership.swatches.size,
      city: curve.city,
      categories: PIECE_INDEX_CATEGORIES.map((cat) => {
        const rows = rowsByCat.get(cat.id) || [];
        const owned = rows.filter((r) => r.owned);
        return {
          id: cat.id,
          name: cat.name,
          total: rows.length,
          owned: owned.length,
          ownedNames: owned.slice(0, 5).map((r) => cleanTypeName(r.type.name)),
          gapNames: rows.filter((r) => r.gapRank).slice(0, 4).map((r) => cleanTypeName(r.type.name)),
        };
      }),
    }),
    [rowsByCat, ownership, curve.city, typeTotal],
  );
  const rootCopy = useRootIndexCopy(profile, rootFacts);

  const openRow = (catId: string, shelfIndex: number) => setOpenType({ catId, index: shelfIndex });

  const toggleCat = (id: string) => {
    setUnfoldedCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // -------------------------------------------------------------- search
  const q = query.trim().toLowerCase();
  const searchSections = useMemo(() => {
    if (!q) return [];
    return PIECE_INDEX_CATEGORIES.map((c) => {
      const shelf = c.groups.flatMap((g) => g.types);
      const hits = shelf
        .map((type, index) => ({ type, index }))
        .filter(({ type }) => type.name.toLowerCase().includes(q));
      return { cat: c, hits };
    }).filter((s) => s.hits.length > 0);
  }, [q]);
  const makerHits = useMemo(() => {
    if (!q) return 0;
    try {
      return catalogDirectoryEntries().filter((e: any) => String(e?.profile?.brand || '').toLowerCase().includes(q)).length;
    } catch {
      return 0;
    }
  }, [q]);

  // The open type's category shelf — every type of the category in list
  // order; the panel's ← → walk it (8a).
  const openPanel = (() => {
    if (!openType) return null;
    const panelCat = PIECE_INDEX_CATEGORIES.find((c) => c.id === openType.catId);
    if (!panelCat) return null;
    const shelf = panelCat.groups.flatMap((group) => group.types.map((type) => ({ ...type, group: group.label })));
    const index = Math.max(0, Math.min(shelf.length - 1, openType.index));
    const type = shelf[index];
    if (!type) return null;
    const key = typeKey(panelCat.id, type.name);
    return (
      <PieceDetailPanel
        category={panelCat}
        type={type}
        occasions={[...occasionsFor(type, type.group, panelCat.id)]}
        ownedSwatches={ownership.swatches.get(key)}
        position={{ index, total: shelf.length }}
        prevName={index > 0 ? cleanTypeName(shelf[index - 1].name) : null}
        nextName={index < shelf.length - 1 ? cleanTypeName(shelf[index + 1].name) : null}
        pieceTotal={typeTotal}
        makerTotal={catalogDirectoryEntries().length}
        // The entry's brand recommendation is ranked against the dossier and
        // what the wearer already owns — both live here already.
        profile={profile}
        pieces={pieces}
        onPrev={() => setOpenType({ catId: panelCat.id, index: Math.max(0, index - 1) })}
        onNext={() => setOpenType({ catId: panelCat.id, index: Math.min(shelf.length - 1, index + 1) })}
        onClose={() => setOpenType(null)}
      />
    );
  })();

  // ------------------------------------------------- THE CATEGORY PLATE
  const plateCat = plateCatId ? PIECE_INDEX_CATEGORIES.find((c) => c.id === plateCatId) || null : null;
  if (plateCat) {
    return (
      <div ref={topRef} style={{ scrollMarginTop: '72px' }}>
        <CategoryPlate
          cat={plateCat}
          rows={rowsByCat.get(plateCat.id) || []}
          curve={curve}
          profile={profile}
          onBack={() => setPlateCatId(null)}
          onGoCategory={(id) => {
            setPlateCatId(id);
            topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          onOpenType={(shelfIndex) => openRow(plateCat.id, shelfIndex)}
        />
        {openPanel}
      </div>
    );
  }

  // -------------------------------------------------- the search reading
  const columns = narrow ? 2 : 4;
  const searchReading = q && (
    <div>
      {makerHits > 0 && (
        <div style={{ padding: '14px 0 0', ...mono(8.5, ACCENT_DEEP) }}>
          {makerHits} maker{makerHits === 1 ? '' : 's'} match{makerHits === 1 ? 'es' : ''} “{query.trim()}” — the toggle above switches the list to makers
        </div>
      )}
      {searchSections.map(({ cat: sCat, hits }) => {
        const rowsPerCol = Math.max(1, Math.ceil(hits.length / columns));
        return (
          <section
            key={sCat.id}
            className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)]"
            style={{ gap: '14px 40px', padding: '20px 0', borderBottom: '1px solid rgba(59,43,29,0.18)' }}
          >
            <div>
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setPlateCatId(sCat.id);
                }}
                className="hover:underline text-left"
                style={{ background: 'transparent', padding: 0, fontFamily: SERIF, fontSize: '21px', color: WALNUT }}
                aria-label={`Open the ${sCat.name} plate`}
              >
                {sCat.name}.
              </button>
              <div style={{ marginTop: '5px', ...mono(8.5, FAINT) }}>{hits.length} of {countOf(sCat)} match</div>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                gridAutoFlow: 'column',
                gridTemplateRows: `repeat(${rowsPerCol}, auto)`,
                columnGap: '22px',
                alignSelf: 'start',
              }}
            >
              {hits.map(({ type, index }) => (
                <button
                  key={type.name}
                  type="button"
                  onClick={() => setOpenType({ catId: sCat.id, index })}
                  className="hover:underline text-left"
                  style={{
                    background: 'transparent',
                    padding: '3px 0',
                    fontFamily: BODY,
                    fontSize: 'max(var(--eth-body, 0px), 13.5px)',
                    lineHeight: 1.35,
                    color: ownership.swatches.has(typeKey(sCat.id, type.name)) ? WALNUT : INK,
                  }}
                >
                  {type.name}
                </button>
              ))}
            </div>
          </section>
        );
      })}
      {searchSections.length === 0 && (
        <p style={{ padding: '24px 0', fontFamily: BODY, fontSize: 'max(var(--eth-body, 0px), 14px)', lineHeight: 1.6, color: MUTED, maxWidth: '58ch' }}>
          No type answers that — clear the search and the index refills. Nothing has been removed from the taxonomy,
          only from view.
        </p>
      )}
    </div>
  );

  // ------------------------------------------------ the category runs
  const categoryRuns = (
    <div>
      <PlateColumnsHeader narrow={narrow} />
      {PIECE_INDEX_CATEGORIES.map((cat) => {
        const rows = rowsByCat.get(cat.id) || [];
        const open = unfoldedCats.has(cat.id);
        const ranked = rankRows(rows);
        const shown = open || rows.length <= ROOT_FOLDED + 3 ? ranked : ranked.slice(0, ROOT_FOLDED);
        const hiddenCount = ranked.length - shown.length;
        const ownedHere = rows.filter((r) => r.owned).length;
        return (
          <section key={cat.id} aria-label={`${cat.name} — the run`} style={{ padding: '26px 0 8px' }}>
            <div className="flex items-baseline flex-wrap" style={{ gap: '4px 12px' }}>
              <button
                type="button"
                onClick={() => setPlateCatId(cat.id)}
                className="hover:underline text-left"
                aria-label={`${cat.name} — open the category plate`}
                title={`Open the ${cat.name} plate`}
                style={{ background: 'transparent', padding: 0, fontFamily: SERIF, fontSize: '25px', fontWeight: 400, lineHeight: 1.15, color: WALNUT }}
              >
                {cat.name}.
              </button>
              <span style={mono(8.5, FAINT)}>
                {rows.length}{ownedHere > 0 ? ` · ${ownedHere} owned` : ''}
              </span>
            </div>
            <p style={{ margin: '4px 0 10px', fontFamily: SERIF, fontStyle: 'italic', fontSize: 'max(var(--eth-serif, 0px), 13.5px)', lineHeight: 1.45, color: SECONDARY, maxWidth: '58ch' }}>
              {rootCopy.blurbs[cat.id]}
            </p>
            <div style={{ borderTop: '1px solid rgba(59,43,29,0.24)' }}>
              {shown.map((row) => (
                <PlateRow key={row.key} row={row} scale={scale} narrow={narrow} onOpen={() => openRow(cat.id, row.shelfIndex)} />
              ))}
            </div>
            {(hiddenCount > 0 || (open && rows.length > ROOT_FOLDED + 3)) && (
              <button
                type="button"
                onClick={() => toggleCat(cat.id)}
                className="hover:underline text-left"
                style={{ background: 'transparent', padding: '8px 6px 0', ...mono(8, ACCENT_DEEP), letterSpacing: '0.07em' }}
              >
                {open ? 'Fold the run ↑' : `+ ${hiddenCount} more ↓`}
              </button>
            )}
          </section>
        );
      })}
    </div>
  );

  return (
    <div ref={topRef} style={{ scrollMarginTop: '72px' }}>
      {/* ------------------------------------------------ find + the toggle */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] items-center" style={{ gap: '12px 28px', paddingBottom: '16px' }}>
        <label
          className="flex items-center focus-within:border-[var(--color-accent,#a8712c)] transition-colors"
          style={{ gap: '14px', border: '1px solid rgba(59,43,29,0.35)', padding: '9px 14px', maxWidth: '520px' }}
        >
          <span style={mono(8.5, FAINT)}>Find</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='a type or a maker — try “teba”, “raglan”, “Rubinacci”'
            aria-label="Find a garment type or a maker in the index"
            className="w-full bg-transparent focus:outline-none placeholder:text-[#856c51]"
            style={{ fontFamily: BODY, fontSize: 'max(var(--eth-body, 0px), 14px)', color: INK }}
          />
        </label>
        <span className="justify-self-start lg:justify-self-end">{toggle}</span>
      </div>

      {/* --------------------- the runs, or the search reading over them */}
      {q ? searchReading : categoryRuns}

      {/* -------------------- the three annotation blocks, in Beau's hand */}
      <AnnotationFoot
        slots={[
          { label: 'The structure', text: rootCopy.annotations.up },
          { label: 'Types & gaps', text: rootCopy.annotations.down },
          { label: 'The colour system', text: rootCopy.annotations.out },
        ]}
      />

      {/* THE ENTRY PANEL (8a) — opened over the index, ← → walk the shelf,
          backdrop · × · Escape dismiss it. */}
      {openPanel}
    </div>
  );
}
