/**
 * THE INDEX — rebuilt from the founder's reference designs (August 2026).
 *
 * The old tab is gone. What stood here listed the 380-type taxonomy with the
 * reader's ledger drawn over it; the reference asks for the opposite reading
 * — THE READER'S OWN PIECES, held against the temperature spectrum, category
 * by category — so the page was wiped and rebuilt around that.
 *
 * ONE masthead, the shared one (tab-header.tsx), so the indentation, the type
 * scale, the standfirst and the closing rule are identical to the other five
 * primary tabs. TWO faces under the same chip bar the other tabs use
 * (sub-tabs.tsx, the app's shared face-toggle treatment), sitting in the
 * masthead's aside:
 *
 *  · PIECES (index-wardrobe.tsx) — the temperature spectrum with the reader's
 *    city over it, their own piece count under every band and coldest to
 *    warmest across it; then the eleven categories in the same order The
 *    Hunt's Beau's Picks runs them, each ONE line with its count, each
 *    unfolding into the pieces they have actually logged. A piece's NAME
 *    opens its card (index-piece-card.tsx); its ARROW crosses to the Makers
 *    face, filtered to the houses known for that kind of piece.
 *
 *  · MAKERS (index-maker-table.tsx) — Beau's fifty for this reader, then the
 *    houses they added themselves (a name or a pasted link auto-researches
 *    into a full row), then the rest of the file. Every column head sorts.
 *
 * NOTHING ON EITHER FACE IS HARD-CODED. The spectrum counts, the category
 * totals and every row come from the reader's ledger via index-model
 * (readLedgerPieces, against each piece's stored warmth row or the same
 * inference the Today pre-filter runs); the verdicts and Beau's reads are
 * written for this reader from those same facts (index-tab-copy), each with
 * a deterministic per-reader fallback so the page is personalised from the
 * first paint. The tab holds the record and the reference — it never invents
 * a piece, a count or a house.
 */
import { useEffect, useMemo, useState } from 'react';
import { mergeDirectory, type DirectoryBrandRow, type DirectoryEntry } from './brands';
import { findGarmentType, type GarmentCategoryId } from './garment-types';
import { readLedgerPieces, useIndexModel, type LedgerPieceRead } from './index-model';
import { fetchMaterials, fetchPieceDetails, BRAND_INDEX_CHANGED_EVENT, type BrandIndexEntry, type PieceDetails, type StyleProfile, type WardrobePiece } from './profile-data';
import { fetchPieceWarmth, type PieceWarmth } from './warmth-model';
import { DISCOVER_BRANDS_EVENT, backfillDirectoryBrandStubs } from './hunt-ai';
import { usePlexMono } from './mono-type';
import { SubTabs } from './sub-tabs';
import { TabHeader } from './tab-header';
import { INDEX_OPEN_TYPE_EVENT, peekIndexTarget, takeIndexTarget, type IndexTarget } from './edit-links';
import { IndexPiecesFace } from './index-wardrobe';
import { IndexMakersFace, type MakerTypeFilter } from './index-maker-table';
import { FAINT, FAINTER, WALNUT, mono } from './index-style';

type IndexFace = 'pieces' | 'makers';

/** Deep link into the app's own tabs. */
function goToTab(tab: string): void {
  window.dispatchEvent(new CustomEvent('ethaion:navigate', { detail: { tab } }));
}

export function IndexTab({ pieces, profile }: { pieces: WardrobePiece[]; profile: StyleProfile | null }) {
  usePlexMono();
  const model = useIndexModel(pieces);
  const [face, setFace] = useState<IndexFace>('pieces');
  const [typeFilter, setTypeFilter] = useState<MakerTypeFilter | null>(null);

  // ---- the ledger's companions -------------------------------------------
  // Each piece's REAL temperature range (its stored piece_warmth row, and the
  // material it was inferred from) and the size and note the reader wrote.
  // Everything the spectrum and the rows count is read from these.
  const [warmth, setWarmth] = useState<Record<number, PieceWarmth>>({});
  const [materials, setMaterials] = useState<Record<number, string>>({});
  const [details, setDetails] = useState<Record<number, PieceDetails>>({});

  const ledgerKey = useMemo(
    () => pieces.map((p) => p.id + ':' + p.category + ':' + (p.slot || '')).sort().join('|'),
    [pieces],
  );

  useEffect(() => {
    let alive = true;
    fetchPieceWarmth()
      .then((rows) => {
        if (alive) setWarmth(rows);
      })
      .catch(() => undefined);
    fetchMaterials()
      .then((rows) => {
        if (alive) setMaterials(rows);
      })
      .catch(() => undefined);
    fetchPieceDetails()
      .then((rows) => {
        if (alive) setDetails(rows);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledgerKey]);

  /** THE READ the whole Pieces face is drawn from — one pass over the ledger. */
  const reads = useMemo(() => readLedgerPieces(pieces, warmth, materials), [pieces, warmth, materials]);

  // ---- the maker file ----------------------------------------------------
  // The catalog seed merged with the reader's own additions. The limit reads
  // well past any realistic file so no house is ever dropped.
  const { data: addedRows, refresh } = window.useWorkspaceDB<DirectoryBrandRow>('hunt_directory_brands', {
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 500,
  });
  useEffect(() => {
    const onChanged = () => refresh();
    window.addEventListener(DISCOVER_BRANDS_EVENT, onChanged);
    return () => window.removeEventListener(DISCOVER_BRANDS_EVENT, onChanged);
  }, [refresh]);

  // The personal per-house files — favourites live here (status 'trusted').
  const { data: metaRows, refresh: refreshMeta } = window.useWorkspaceDB<BrandIndexEntry>('brand_index', {
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 500,
  });
  useEffect(() => {
    const onChanged = () => refreshMeta();
    window.addEventListener(BRAND_INDEX_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(BRAND_INDEX_CHANGED_EVENT, onChanged);
  }, [refreshMeta]);

  // Imported stubs gain their full dossiers quietly.
  useEffect(() => {
    void backfillDirectoryBrandStubs().catch(() => undefined);
  }, [addedRows]);

  const entries = useMemo<DirectoryEntry[]>(
    () => mergeDirectory(addedRows).filter((e) => !model.hiddenMakers.has(e.profile.brand.toLowerCase())),
    [addedRows, model.hiddenMakers],
  );

  // ---- the two hand-offs -------------------------------------------------

  /** A piece row's arrow: the Makers face, filtered to that kind of piece. */
  const onMakersForPiece = (read: LedgerPieceRead) => {
    const category = (read.category || (read.type ? read.type.category : null)) as GarmentCategoryId | null;
    if (!category) return;
    setTypeFilter({ category, type: read.type, via: 'via your ' + read.piece.name.toLowerCase() });
    setFace('makers');
  };

  /**
   * THE EDIT'S WAY IN. A Gap row asks for ONE garment type by id. The Pieces
   * face reads the reader's OWN ledger now, and a gap is by definition
   * something they do not own — so the deep link lands on the MAKERS bench
   * for that type instead: the houses that cut the thing their board is
   * asking for, at least ten of them. A type the canon does not know still
   * lands the tab on Pieces rather than nowhere.
   */
  useEffect(() => {
    const land = (target: IndexTarget | null) => {
      if (!target) return;
      const type = findGarmentType(target.typeId);
      if (type && type.category !== 'other') {
        setTypeFilter({ category: type.category as GarmentCategoryId, type, via: 'via the gap your board names' });
        setFace('makers');
      } else {
        setFace('pieces');
      }
    };
    land(takeIndexTarget() || peekIndexTarget());
    const onOpen = (e: Event) => land(((e as CustomEvent).detail || null) as IndexTarget | null);
    window.addEventListener(INDEX_OPEN_TYPE_EVENT, onOpen);
    return () => window.removeEventListener(INDEX_OPEN_TYPE_EVENT, onOpen);
  }, []);

  const crumbs = [
    'Ethaion',
    'The Index',
    face === 'pieces' ? 'Pieces' : 'Makers',
    face === 'pieces'
      ? reads.length + (reads.length === 1 ? ' piece logged' : ' pieces logged')
      : entries.length + ' makers on file',
  ];

  const city = model.climate.city;
  const standfirst =
    face === 'pieces'
      ? city
        ? 'Everything you own, read against ' + city + ' by temperature.'
        : 'Everything you own, read by temperature, category by category.'
      : 'The houses Beau would send you to first, read against your record.';

  return (
    <div>
      {/* The shared tab masthead — the same block, indentation and closing
          rule every other primary tab carries, with the two face chips in
          its aside on the app's shared chip treatment. */}
      <TabHeader
        title="The Index"
        standfirst={standfirst}
        aside={
          <SubTabs
            items={[
              { id: 'pieces' as const, label: 'Pieces', suffix: reads.length > 0 ? ' \u00b7 ' + reads.length : '' },
              { id: 'makers' as const, label: 'Makers', suffix: entries.length > 0 ? ' \u00b7 ' + entries.length + ' on file' : '' },
            ]}
            active={face}
            onChange={setFace}
            ariaLabel="The Index"
            variant="sub-tab--index-face"
            className="max-w-full"
          />
        }
      />

      <div className="px-6 sm:px-10 py-8 max-w-[1180px] mx-auto w-full pb-28">
        {/* Where the reader is inside the reference — the same crumb line The
            Ledger carries, and the one the reference sets over this page. */}
        <div className="flex items-center flex-wrap" style={{ gap: '9px', paddingBottom: '14px' }}>
          {crumbs.map((crumb, i) => (
            <span key={crumb + i} className="flex items-center" style={{ gap: '9px' }}>
              <span style={mono(9, i === crumbs.length - 1 ? WALNUT : FAINT)}>{crumb}</span>
              {i < crumbs.length - 1 && <span style={mono(9, FAINTER)}>/</span>}
            </span>
          ))}
        </div>

        {/* Both faces stay mounted — a held band, a search, an unfolded
            category and a selection all survive the toggle. */}
        <div style={{ display: face === 'pieces' ? undefined : 'none' }}>
          <IndexPiecesFace
            model={model}
            reads={reads}
            profile={profile}
            pieces={pieces}
            details={details}
            onMakersForPiece={onMakersForPiece}
            onOpenLedger={() => goToTab('wardrobe')}
            onSetCity={() => goToTab('your-style')}
          />
        </div>
        <div style={{ display: face === 'makers' ? undefined : 'none' }}>
          <IndexMakersFace
            entries={entries}
            metaRows={metaRows || []}
            refreshMeta={refreshMeta}
            model={model}
            pieces={pieces}
            profile={profile}
            typeFilter={typeFilter}
            onClearTypeFilter={() => setTypeFilter(null)}
          />
        </div>
      </div>
    </div>
  );
}
