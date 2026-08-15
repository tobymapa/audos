/**
 * THE INDEX · MAKERS — the houses, as the founder's reference sets them out.
 *
 * No heading of its own: the tab masthead already says The Index, and the
 * face chip already says Makers, so the table starts where the reference
 * starts — with what is held, the way to add a house, and the columns.
 *
 *  · BEAU'S FIFTY leads: fifty houses chosen for THIS reader from the merged
 *    directory — weighed against their build and colouring, their
 *    archetypes, their city and climate, their budget signals, the makers
 *    already on their ledger and the gaps their board names — each with a
 *    one-line justification written for them (index-tab-copy useBeauFifty,
 *    with a deterministic per-reader ranking until the call lands).
 *  · YOUR MAKERS follows: a name or a pasted link files instantly and Beau
 *    researches the house behind it — country, speciality, price point, what
 *    they are known for — and fills the row in himself.
 *  · THE REST OF THE FILE sits behind one control, so the shortlist is not
 *    buried under the directory.
 *
 * EVERY COLUMN HEAD SORTS. A held search, filter or piece hand-off reads the
 * WHOLE file rather than the shortlist — nobody expects a search to miss a
 * house Beau did not pick.
 *
 * THE PIECE HAND-OFF: an arrow on the Pieces face lands here with that
 * piece's kind held, and the bench it lands on is guaranteed to be a real
 * one — at least ten quality makers (index-maker-rows makersForCategory).
 */
import { useMemo, useRef, useState } from 'react';
import { PRICE_BAND_ORDER, type DirectoryEntry } from './brands';
import type { GarmentCategoryId, GarmentType } from './garment-types';
import { categoryName, hideIndexMaker, restoreHiddenIndex, type IndexModel } from './index-model';
import { useBeauFifty, type BeauPick } from './index-tab-copy';
import { addDirectoryBrandStubs, backfillDirectoryBrandStubs } from './hunt-ai';
import { looksLikeUrl, nameFromUrl, normalizeSiteUrl, parseBrandImportFile } from './hunt-brand-import';
import {
  addBrandIndexEntry,
  updateBrandIndexEntry,
  type BrandIndexEntry,
  type BrandIndexStatus,
  type StyleProfile,
  type WardrobePiece,
} from './profile-data';
import {
  CompareSheet,
  DEEP,
  FavStar,
  FilterMenu,
  FindLine,
  MakerEntry,
  MonoButton,
  READ_BLURBS,
  READ_COLORS,
  READ_LABELS,
  READ_ORDER,
  ROW_RULE,
  STOCKED_LABELS,
  SortHead,
  TickBox,
  isStubProfile,
  makerCategorySet,
  makersForCategory,
  priceNewOf,
  readOf,
  stockedOf,
  type SortCol,
  type SortState,
} from './index-maker-rows';
import {
  ACCENT_DEEP,
  FAINT,
  FAINTER,
  HAIRLINE,
  INK,
  RULE,
  SECONDARY,
  WALNUT,
  body,
  mono,
  serif,
} from './index-style';

const MIDDOT = ' \u00b7 ';

/** The reference's column set, in its order. */
const MAKER_GRID =
  'grid grid-cols-[26px_20px_minmax(0,1fr)_92px_30px] lg:grid-cols-[26px_22px_20px_minmax(120px,186px)_minmax(84px,116px)_minmax(0,1fr)_96px_88px_86px_20px]';

const toggleIn = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/** What a piece's arrow — or The Edit's gap link — handed over. */
export interface MakerTypeFilter {
  category: GarmentCategoryId;
  type: GarmentType | null;
  /** Where the hand-off came from, ready to read: “via your wax jacket”, or
   * “via the gap your board names”. */
  via: string;
}

export function IndexMakersFace({
  entries,
  metaRows,
  refreshMeta,
  model,
  pieces,
  profile,
  typeFilter,
  onClearTypeFilter,
}: {
  entries: DirectoryEntry[];
  metaRows: BrandIndexEntry[];
  refreshMeta: () => void;
  model: IndexModel;
  pieces: WardrobePiece[];
  profile: StyleProfile | null;
  typeFilter: MakerTypeFilter | null;
  onClearTypeFilter: () => void;
}) {
  const [find, setFind] = useState('');
  const [favesOnly, setFavesOnly] = useState(false);
  const [places, setPlaces] = useState<string[]>([]);
  const [bands, setBands] = useState<string[]>([]);
  const [makes, setMakes] = useState<string[]>([]);
  const [reads, setReads] = useState<string[]>([]);
  const [stocked, setStocked] = useState<string[]>([]);
  const [held, setHeld] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const [openMaker, setOpenMaker] = useState<string | null>(null);
  const [addValue, setAddValue] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showRest, setShowRest] = useState(false);
  const [sort, setSort] = useState<SortState>({ col: 'rank', dir: 1 });
  const [favOverrides, setFavOverrides] = useState<Record<string, BrandIndexStatus>>({});
  const fileRef = useRef<HTMLInputElement | null>(null);

  // BEAU'S FIFTY — the shortlist chosen for THIS reader.
  const fifty = useBeauFifty(profile, pieces, model, entries);
  const pickMap = useMemo(() => {
    const map = new Map<string, BeauPick>();
    for (const p of fifty.picks) map.set(p.brand.toLowerCase(), p);
    return map;
  }, [fifty]);

  const metaMap = useMemo(() => {
    const map = new Map<string, BrandIndexEntry>();
    for (const row of metaRows || []) {
      const key = (row.name || '').trim().toLowerCase();
      if (key && !map.has(key)) map.set(key, row);
    }
    return map;
  }, [metaRows]);

  const isFav = (brand: string): boolean => {
    const key = brand.toLowerCase();
    const override = favOverrides[key];
    if (override) return override === 'trusted';
    const row = metaMap.get(key);
    return !!row && row.status === 'trusted';
  };

  const toggleFav = async (brand: string) => {
    const key = brand.toLowerCase();
    const next: BrandIndexStatus = isFav(brand) ? 'curious' : 'trusted';
    setFavOverrides((cur) => ({ ...cur, [key]: next }));
    try {
      const existing = (metaRows || []).find((r) => (r.name || '').trim().toLowerCase() === key);
      if (existing) await updateBrandIndexEntry(existing.id, { status: next });
      else
        await addBrandIndexEntry({
          name: brand,
          url: null,
          logo_url: null,
          status: next,
          note: null,
          known_for: null,
          specialisations: null,
          signature_pieces: null,
        });
    } catch (e) {
      console.warn('[Ethaion] favourite save failed (non-fatal):', e);
    } finally {
      refreshMeta();
    }
  };

  const ledgerBrands = useMemo(() => {
    const set = new Set<string>();
    for (const p of pieces) {
      const b = (p.brand || '').trim().toLowerCase();
      if (b) set.add(b);
    }
    return set;
  }, [pieces]);

  const placeOptions = useMemo(
    () =>
      [...new Set(entries.map((e) => e.profile.country).filter((c) => c && c !== '\u2014') as string[])]
        .sort((a, b) => a.localeCompare(b))
        .map((c) => ({ id: c, label: c })),
    [entries],
  );

  const makesOptions = useMemo(() => model.categories.map((c) => ({ id: c.id, label: c.name })), [model.categories]);

  const favCount = useMemo(
    () => entries.filter((e) => isFav(e.profile.brand)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, metaMap, favOverrides],
  );

  // THE BENCH the piece hand-off lands on — at least ten quality houses.
  const bench = useMemo(
    () => (typeFilter ? makersForCategory(entries, typeFilter.category, typeFilter.type) : null),
    [entries, typeFilter],
  );
  const benchKeys = useMemo(
    () => (bench ? new Set(bench.entries.map((e) => e.profile.brand.toLowerCase())) : null),
    [bench],
  );

  const q = find.trim().toLowerCase();
  const shown = useMemo(
    () =>
      entries.filter((e) => {
        const p = e.profile;
        if (benchKeys && !benchKeys.has(p.brand.toLowerCase())) return false;
        if (favesOnly && !isFav(p.brand)) return false;
        if (q) {
          const hay = [p.brand, p.city || '', p.country || '', p.description || ''].join(' ').toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (places.length > 0 && (!p.country || !places.includes(p.country))) return false;
        if (bands.length > 0 && !bands.includes(p.priceBand)) return false;
        if (makes.length > 0) {
          const cats = makerCategorySet(p);
          if (!makes.some((m) => cats.has(m as GarmentCategoryId))) return false;
        }
        if (reads.length > 0 && !reads.includes(readOf(e))) return false;
        if (stocked.length > 0 && !stocked.includes(stockedOf(p))) return false;
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, q, favesOnly, places, bands, makes, reads, stocked, metaMap, favOverrides, benchKeys],
  );

  const filtersHeld =
    (favesOnly ? 1 : 0) + places.length + bands.length + makes.length + reads.length + stocked.length + (q ? 1 : 0);
  const searchingWholeFile = filtersHeld > 0 || !!typeFilter;

  const rankOf = (e: DirectoryEntry): number => {
    const pick = pickMap.get(e.profile.brand.toLowerCase());
    if (pick) return pick.rank;
    if (e.source === 'user') return 500;
    return 1000;
  };

  const comparatorOf = (col: SortCol) => {
    const whereOf = (e: DirectoryEntry) =>
      [e.profile.country && e.profile.country !== '\u2014' ? e.profile.country : '', e.profile.city || ''].join(' ').trim();
    if (col === 'maker') return (a: DirectoryEntry, b: DirectoryEntry) => a.profile.brand.localeCompare(b.profile.brand);
    if (col === 'where') return (a: DirectoryEntry, b: DirectoryEntry) => whereOf(a).localeCompare(whereOf(b));
    if (col === 'defines')
      return (a: DirectoryEntry, b: DirectoryEntry) => (a.profile.description || '').localeCompare(b.profile.description || '');
    if (col === 'price')
      return (a: DirectoryEntry, b: DirectoryEntry) =>
        PRICE_BAND_ORDER.indexOf(a.profile.priceBand) - PRICE_BAND_ORDER.indexOf(b.profile.priceBand);
    if (col === 'stocked') return (a: DirectoryEntry, b: DirectoryEntry) => stockedOf(a.profile).localeCompare(stockedOf(b.profile));
    if (col === 'read') return (a: DirectoryEntry, b: DirectoryEntry) => READ_ORDER.indexOf(readOf(a)) - READ_ORDER.indexOf(readOf(b));
    return (a: DirectoryEntry, b: DirectoryEntry) => rankOf(a) - rankOf(b);
  };

  const onSort = (col: SortCol) => {
    setSort((cur) => (cur.col === col ? { col, dir: cur.dir === 1 ? -1 : 1 } : { col, dir: 1 }));
  };

  const picksShown = useMemo(
    () => shown.filter((e) => e.source !== 'user' && pickMap.has(e.profile.brand.toLowerCase())),
    [shown, pickMap],
  );
  const userShown = useMemo(() => shown.filter((e) => e.source === 'user'), [shown]);
  const restShown = useMemo(
    () => shown.filter((e) => e.source !== 'user' && !pickMap.has(e.profile.brand.toLowerCase())),
    [shown, pickMap],
  );

  // Grouped only in the default order; any other sort reads as ONE table.
  const grouped = sort.col === 'rank' && !searchingWholeFile;
  const flatRows = useMemo(() => {
    const base = grouped ? [] : [...picksShown, ...userShown, ...(searchingWholeFile || showRest ? restShown : [])];
    const cmp = comparatorOf(sort.col);
    return base.sort((a, b) => sort.dir * cmp(a, b) || a.profile.brand.localeCompare(b.profile.brand));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouped, picksShown, userShown, restShown, searchingWholeFile, showRest, sort, pickMap]);

  const sortedPicks = useMemo(() => {
    const list = [...picksShown].sort((a, b) => rankOf(a) - rankOf(b));
    return sort.dir === -1 && sort.col === 'rank' ? list.reverse() : list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picksShown, sort, pickMap]);

  const reset = () => {
    setFind('');
    setFavesOnly(false);
    setPlaces([]);
    setBands([]);
    setMakes([]);
    setReads([]);
    setStocked([]);
    onClearTypeFilter();
  };

  const toggleHeld = (brand: string) => {
    setHeld((cur) => {
      if (cur.includes(brand)) return cur.filter((b) => b !== brand);
      if (cur.length >= 4) return cur;
      return [...cur, brand];
    });
  };

  const heldEntries = useMemo(
    () => held.map((b) => entries.find((e) => e.profile.brand === b)).filter(Boolean) as DirectoryEntry[],
    [held, entries],
  );

  /** ADD YOUR OWN — a name or a pasted link. It files instantly and Beau's
   * research pass fills the dossier in behind it. */
  const addMaker = async () => {
    const raw = addValue.trim();
    if (!raw || addBusy) return;
    const name = looksLikeUrl(raw) ? nameFromUrl(normalizeSiteUrl(raw) || raw) : raw;
    if (!name) {
      setNotice('That did not read as a maker\u2019s name or link \u2014 try again.');
      return;
    }
    setAddBusy(true);
    setNotice(null);
    try {
      const { added, skipped } = await addDirectoryBrandStubs([name]);
      if (added.length > 0) {
        setNotice(added[0] + ' added \u2014 Beau is researching the house and filling the row in.');
        void backfillDirectoryBrandStubs().catch(() => undefined);
      } else if (skipped.length > 0) {
        setNotice(name + ' is already on the list.');
      }
      setAddValue('');
    } catch (e) {
      console.warn('[Ethaion] add maker failed:', e);
      setNotice('That maker could not be added \u2014 try again in a moment.');
    } finally {
      setAddBusy(false);
    }
  };

  /** UPLOAD A LIST — .csv / .xlsx / .txt, the first column read as names. */
  const onFile = async (file: File | null) => {
    if (!file) return;
    setAddBusy(true);
    setNotice(null);
    try {
      const parsed = await parseBrandImportFile(file);
      if (parsed.length === 0) {
        setNotice('Nothing readable in that file \u2014 one maker per line, or in the first column.');
      } else {
        const { added, skipped } = await addDirectoryBrandStubs(parsed.map((e) => e.name));
        const tail = skipped.length > 0 ? ' \u00b7 ' + skipped.length + ' already on the list' : '';
        setNotice(added.length + ' added' + tail + ' \u2014 Beau is pulling the files.');
        if (added.length > 0) void backfillDirectoryBrandStubs().catch(() => undefined);
      }
    } catch (e: any) {
      setNotice((e && e.message) || 'That file could not be read.');
    } finally {
      setAddBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const renderRow = (e: DirectoryEntry) => {
    const p = e.profile;
    const key = p.brand.toLowerCase();
    const read = readOf(e);
    const onLedger = ledgerBrands.has(key);
    const open = openMaker === p.brand;
    const pick = pickMap.get(key) || null;
    const cats = [...makerCategorySet(p)].map((c) => categoryName(c));
    const where = p.city || (p.country && p.country !== '\u2014' ? p.country : '') || '\u2014';
    return (
      <div key={p.brand}>
        <div className={MAKER_GRID + ' items-baseline'} style={{ gap: '4px 12px', padding: '11px 0', borderBottom: ROW_RULE }}>
          <span style={{ ...mono(8, pick ? ACCENT_DEEP : FAINTER), whiteSpace: 'nowrap' }}>
            {pick ? pick.rank : e.source === 'user' ? 'you' : ''}
          </span>
          <span className="hidden lg:block" style={{ alignSelf: 'center' }}>
            <TickBox on={held.includes(p.brand)} disabled={held.length >= 4} onToggle={() => toggleHeld(p.brand)} brand={p.brand} />
          </span>
          <span style={{ alignSelf: 'center' }}>
            <FavStar active={isFav(p.brand)} onToggle={() => void toggleFav(p.brand)} brand={p.brand} />
          </span>
          <span className="min-w-0">
            <button
              type="button"
              onClick={() => setOpenMaker(open ? null : p.brand)}
              title={p.brand + ' \u2014 open the full entry'}
              className="text-left hover:opacity-70 transition-opacity max-w-full"
              style={{
                ...serif(16, WALNUT),
                background: 'transparent',
                padding: 0,
                lineHeight: 1.25,
                display: 'block',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                textDecoration: 'underline',
                textDecorationColor: 'rgba(168,113,44,0.45)',
                textUnderlineOffset: '3.5px',
              }}
            >
              {p.brand}
            </button>
            {onLedger && <span style={{ ...mono(6.5, ACCENT_DEEP), display: 'block', marginTop: '3px' }}>On your rail</span>}
            <span className="lg:hidden block" style={{ ...mono(7, FAINT), marginTop: '3px' }}>
              {[where, priceNewOf(p)].filter((v) => v && v !== '\u2014').join(MIDDOT)}
            </span>
          </span>
          <span className="hidden lg:block min-w-0">
            <span style={{ ...body(13, INK), display: 'block', lineHeight: 1.3 }}>{where}</span>
            {p.founded && <span style={{ ...mono(6.5, FAINT), display: 'block', marginTop: '3px' }}>{'Since ' + p.founded}</span>}
          </span>
          <span className="hidden lg:block min-w-0">
            <span style={{ ...body(13.5, INK), display: 'block', lineHeight: 1.4 }}>
              {isStubProfile(p) ? <span style={{ color: FAINT }}>Beau is pulling the file on this house.</span> : p.description}
            </span>
            {pick && (
              <span style={{ ...body(12.5, ACCENT_DEEP), display: 'block', marginTop: '3px', lineHeight: 1.4, fontStyle: 'italic' }}>
                {pick.why}
              </span>
            )}
          </span>
          <span className="hidden lg:inline" style={{ ...mono(8, SECONDARY), whiteSpace: 'nowrap' }}>
            {priceNewOf(p)}
          </span>
          <span className="hidden lg:inline" style={body(12.5, SECONDARY)}>
            {STOCKED_LABELS[stockedOf(p)]}
          </span>
          <span style={mono(7.5, READ_COLORS[read])}>{READ_LABELS[read]}</span>
          <button
            type="button"
            onClick={() => hideIndexMaker(p.brand)}
            aria-label={'Remove ' + p.brand + ' from the list'}
            title={'Remove from the list \u2014 restorable below'}
            className="justify-self-end hover:opacity-70 transition-opacity"
            style={{ ...mono(9, FAINTER), background: 'transparent', padding: '2px 4px' }}
          >
            {'\u00d7'}
          </button>
        </div>
        {open && (
          <MakerEntry entry={e} categories={cats} why={pick ? pick.why : null} rank={pick ? pick.rank : null} />
        )}
      </div>
    );
  };

  const sectionHead = (label: string, sub?: string) => (
    <div
      className="flex items-baseline justify-between flex-wrap"
      style={{ gap: '4px 16px', padding: '16px 0 8px', borderBottom: '1px solid ' + RULE }}
    >
      <span style={mono(8, ACCENT_DEEP)}>{label}</span>
      {sub && <span style={mono(7.5, FAINTER)}>{sub}</span>}
    </div>
  );

  const addMakerBlock = (
    <div style={{ padding: '14px 0 6px' }}>
      <div className="flex items-center flex-wrap" style={{ gap: '10px 12px' }}>
        <span style={{ ...mono(8, FAINT), flexShrink: 0 }}>Add a maker</span>
        <label
          className="flex items-center min-w-0 flex-1"
          style={{ border: '1px solid ' + RULE, padding: '8px 12px', maxWidth: '420px' }}
        >
          <input
            type="text"
            value={addValue}
            onChange={(e) => setAddValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addMaker();
            }}
            placeholder={'a name, or paste a link \u2014 \u201cSartoria Ripense\u201d, \u201cdrakes.com\u201d'}
            aria-label="Add a maker by name or link"
            className="min-w-0 flex-1 bg-transparent outline-none"
            style={{ ...body(13.5, INK), lineHeight: 1.3 }}
          />
        </label>
        <MonoButton solid disabled={addBusy || !addValue.trim()} onClick={() => void addMaker()}>
          {addBusy ? 'Adding\u2026' : 'Add to the list'}
        </MonoButton>
        <MonoButton disabled={addBusy} onClick={() => fileRef.current && fileRef.current.click()}>
          Upload a list · CSV, XLSX, TXT
        </MonoButton>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls,.txt,text/plain,text/csv"
          className="hidden"
          onChange={(e) => void onFile((e.target.files && e.target.files[0]) || null)}
        />
      </div>
      <p style={{ ...body(12.5, FAINT), margin: '8px 0 0', maxWidth: '70ch' }}>
        Name a house or paste their link and Beau researches them — country, speciality, price point, what they are
        known for — and files the full row himself.
      </p>
      {notice && <div style={{ ...mono(8, ACCENT_DEEP), paddingTop: '10px' }}>{notice}</div>}
    </div>
  );

  const columnHeads = (
    <div className={MAKER_GRID + ' items-end'} style={{ gap: '0 12px', borderBottom: '1px solid ' + RULE, paddingBottom: '6px' }}>
      <SortHead label="#" col="rank" sort={sort} onSort={onSort} />
      <span aria-hidden className="hidden lg:block" />
      <span aria-hidden />
      <SortHead label="Maker" col="maker" sort={sort} onSort={onSort} />
      <span className="hidden lg:block">
        <SortHead label="Where" col="where" sort={sort} onSort={onSort} />
      </span>
      <span className="hidden lg:block">
        <SortHead label="What defines them" col="defines" sort={sort} onSort={onSort} />
      </span>
      <span className="hidden lg:block">
        <SortHead label="Price, new" col="price" sort={sort} onSort={onSort} />
      </span>
      <span className="hidden lg:block">
        <SortHead label="Stocked" col="stocked" sort={sort} onSort={onSort} />
      </span>
      <SortHead label={'Beau\u2019s read'} col="read" sort={sort} onSort={onSort} />
      <span aria-hidden />
    </div>
  );

  const stateLine =
    filtersHeld === 0 && !typeFilter
      ? 'Beau\u2019s fifty, chosen for you \u2014 ' + entries.length + ' houses on file behind them'
      : filtersHeld + (typeFilter ? 1 : 0) + ' held \u2014 ' + shown.length + ' of ' + entries.length + ' makers';

  const benchNote = bench
    ? bench.widened
      ? 'Ten shown \u2014 ' + bench.onFile + ' named for this kind of piece, the rest the best-rated houses in the same registers'
      : bench.entries.length + ' houses on file for this kind of piece'
    : '';

  return (
    <div>
      {/* ——— the hand-off banner — a piece's arrow filtered this list */}
      {typeFilter && (
        <div
          className="flex items-center justify-between flex-wrap"
          style={{
            gap: '8px 16px',
            padding: '10px 13px',
            marginBottom: '6px',
            border: '1px solid ' + ACCENT_DEEP,
            background: 'rgba(168,113,44,0.08)',
          }}
        >
          <span style={mono(8, DEEP)}>
            {'Makers of ' +
              (typeFilter.type ? typeFilter.type.name.toLowerCase() : categoryName(typeFilter.category).toLowerCase()) +
              ' \u00b7 ' +
              typeFilter.via +
              ' \u00b7 ' +
              benchNote}
          </span>
          <button
            type="button"
            onClick={onClearTypeFilter}
            className="hover:opacity-70 transition-opacity"
            style={{ ...mono(8, ACCENT_DEEP), background: 'transparent', textDecoration: 'underline', textUnderlineOffset: '3px' }}
          >
            {'Clear \u00d7'}
          </button>
        </div>
      )}

      {/* ——— what is held, and the one Reset */}
      <div className="flex items-center justify-between flex-wrap" style={{ gap: '8px 16px', padding: '12px 0' }}>
        <span style={mono(8, filtersHeld > 0 || typeFilter ? ACCENT_DEEP : FAINT)}>{stateLine}</span>
        <MonoButton onClick={reset} dim={filtersHeld === 0 && !typeFilter}>
          Reset filters
        </MonoButton>
      </div>

      {/* ——— add a maker: a name, a link, or a list */}
      {addMakerBlock}

      {/* ——— find, favourites, the drop-downs. hab-filter-bar keeps the row
          stacking cleanly on a phone: the search box takes the line above the
          chips, and every control in it stretches to the same height. */}
      <div
        className="flex items-center flex-wrap hab-filter-bar"
        style={{ gap: '10px 12px', padding: '16px 0', borderTop: '1px solid ' + HAIRLINE }}
      >
        <FindLine value={find} onChange={setFind} placeholder={'a maker \u2014 \u201cRubinacci\u201d, \u201cNaples\u201d'} />
        <button
          type="button"
          onClick={() => setFavesOnly((f) => !f)}
          aria-pressed={favesOnly}
          className="transition-colors flex-shrink-0 hab-tap"
          style={{
            ...mono(8.5, favesOnly ? DEEP : SECONDARY),
            background: favesOnly ? 'rgba(168,113,44,0.12)' : 'transparent',
            border: '1px solid ' + (favesOnly ? ACCENT_DEEP : RULE),
            padding: '8px 12px',
            whiteSpace: 'nowrap',
          }}
        >
          {favCount > 0 ? '\u2605 Favourites ' + favCount : '\u2605 Favourites'}
        </button>
        <FilterMenu label="Place" options={placeOptions} active={places} onToggle={(id) => setPlaces((cur) => toggleIn(cur, id))} />
        <FilterMenu
          label="Price"
          options={[
            { id: 'accessible', label: '\u00a3 Accessible' },
            { id: 'mid', label: '\u00a3\u00a3 Mid-range' },
            { id: 'upper-mid', label: '\u00a3\u00a3\u00a3 Premium' },
            { id: 'luxury', label: '\u00a3\u00a3\u00a3\u00a3 Luxury' },
          ]}
          active={bands}
          onToggle={(id) => setBands((cur) => toggleIn(cur, id))}
        />
        <FilterMenu label="Makes" options={makesOptions} active={makes} onToggle={(id) => setMakes((cur) => toggleIn(cur, id))} />
        <FilterMenu
          label={'Beau\u2019s read'}
          options={READ_ORDER.map((r) => ({ id: r, label: READ_LABELS[r] }))}
          active={reads}
          onToggle={(id) => setReads((cur) => toggleIn(cur, id))}
        />
        <FilterMenu
          label="Stocked"
          options={[
            { id: 'ships-online', label: 'Ships online' },
            { id: 'travel', label: 'Travel to buy' },
          ]}
          active={stocked}
          onToggle={(id) => setStocked((cur) => toggleIn(cur, id))}
        />
      </div>

      {/* ——— what the five reads mean */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        style={{ gap: '9px 28px', padding: '14px 0 16px', borderTop: '1px solid ' + HAIRLINE, borderBottom: '1px solid ' + HAIRLINE }}
      >
        {READ_ORDER.map((r) => (
          <div key={r} className="flex items-baseline" style={{ gap: '12px' }}>
            <span style={{ ...mono(7.5, READ_COLORS[r]), flexShrink: 0, minWidth: '76px' }}>{READ_LABELS[r]}</span>
            <span style={body(13, SECONDARY)}>{READ_BLURBS[r]}</span>
          </div>
        ))}
      </div>

      {/* ——— the count, and the compare bench */}
      <div className="flex items-center justify-between flex-wrap" style={{ gap: '8px 16px', padding: '13px 0' }}>
        <span style={mono(7.5, FAINT)}>
          {(grouped
            ? sortedPicks.length + ' chosen \u00b7 ' + userShown.length + ' of your own \u00b7 ' + restShown.length + ' more on file'
            : flatRows.length + ' makers shown') + ' \u00b7 column heads sort'}
        </span>
        <span className="flex items-center flex-wrap" style={{ gap: '8px 14px' }}>
          <span style={mono(7.5, FAINTER)}>{'Select up to four \u00b7 ' + held.length + ' held'}</span>
          {held.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setHeld([]);
                setComparing(false);
              }}
              className="hover:opacity-70 transition-opacity"
              style={{ ...mono(7.5, SECONDARY), background: 'transparent', textDecoration: 'underline' }}
            >
              Clear selection
            </button>
          )}
          {!comparing && (
            <MonoButton disabled={held.length < 2} onClick={() => setComparing(true)}>
              {held.length >= 2 ? 'Compare ' + held.length + ' makers' : 'Select two or more to compare'}
            </MonoButton>
          )}
        </span>
      </div>

      {comparing && heldEntries.length >= 2 ? (
        <CompareSheet entries={heldEntries} ledger={ledgerBrands} onClose={() => setComparing(false)} />
      ) : shown.length === 0 ? (
        <p style={{ ...body(14, SECONDARY), padding: '20px 0' }}>
          No house on file answers this combination — reset the filters to see every maker.
        </p>
      ) : (
        <div>
          {grouped ? (
            <>
              {sectionHead(
                'Beau\u2019s fifty \u00b7 chosen against your profile and your rail',
                fifty.generated
                  ? 'Written by Beau for you \u2014 re-drawn when your wardrobe or dossier changes'
                  : 'Drawn from your record \u2014 Beau is refining the order',
              )}
              {columnHeads}
              {sortedPicks.length === 0 ? (
                <p style={{ ...body(13.5, SECONDARY), padding: '14px 0' }}>
                  None of the fifty answer the held filters — the rest of the file is below.
                </p>
              ) : (
                sortedPicks.map(renderRow)
              )}

              {userShown.length > 0 && (
                <>
                  {sectionHead('Your makers', 'Added by you \u2014 Beau researches each one and fills the row')}
                  {userShown.map(renderRow)}
                </>
              )}

              {restShown.length > 0 && (
                <div style={{ padding: '16px 0 0' }}>
                  <MonoButton onClick={() => setShowRest((s) => !s)} dim={!showRest}>
                    {showRest ? 'Hide the rest of the file \u2191' : 'The rest of the file \u00b7 ' + restShown.length + ' more makers \u2193'}
                  </MonoButton>
                  {showRest && (
                    <div style={{ paddingTop: '10px' }}>
                      {[...restShown].sort((a, b) => a.profile.brand.localeCompare(b.profile.brand)).map(renderRow)}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              {columnHeads}
              {flatRows.map(renderRow)}
            </>
          )}
        </div>
      )}

      {/* ——— a removed row stays restorable, always */}
      {model.hiddenMakers.size > 0 && !comparing && (
        <div style={{ ...mono(7.5, FAINT), paddingTop: '13px' }}>
          {model.hiddenMakers.size + (model.hiddenMakers.size === 1 ? ' maker' : ' makers') + ' removed by you \u00b7 '}
          <button
            type="button"
            onClick={() => restoreHiddenIndex('makers')}
            className="hover:opacity-70 transition-opacity"
            style={{ ...mono(7.5, ACCENT_DEEP), background: 'transparent', textDecoration: 'underline' }}
          >
            {'Restore them \u2192'}
          </button>
        </div>
      )}
    </div>
  );
}
