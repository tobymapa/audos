/**
 * THE LEDGER — “Everything you own, by category” (rebuilt to the founder's
 * reference design; tab id 'wardrobe', label “The Ledger”).
 *
 * THE PAGE IS THE RECORD. One question, answered by his own ledger: what do
 * you own, and what is each piece actually doing for you?
 *
 *  · THE MASTHEAD is the shared one (tab-header.tsx), so the indentation,
 *    type scale and closing rule are identical to every other primary tab.
 *    Its aside carries the count of pieces logged and the live note — how
 *    many categories there are to open, the corrections he has just made, or
 *    Beau re-reading them.
 *  · LOG A PIECE sits directly under it: a link goes in one end — a shop's
 *    page or a resale listing — or a photograph does, and the real ingestion
 *    flows (search-piece.tsx / add-piece.tsx) read it and open their card for
 *    him to correct.
 *  · THE CATEGORIES are the body of the page: nine of them, collapsed, each
 *    with Beau's line under its name and the count and status against it.
 *    Unfolding one lists its pieces — as a table (the piece, the cloth,
 *    colour and band, Beau's read) or as tiles. Opening a piece opens the
 *    sheet (ledger-piece.tsx), which is where he corrects Beau.
 *  · WHAT BEAU WOULD CUT closes the page: the pieces the record argues
 *    against, each with the evidence, and Keep it · Retire · Sell against
 *    them. The call he makes is stored — an override is part of the record.
 *
 * Every number is arithmetic over the ledger (ledger-model.ts). The WORDS —
 * the per-piece reads, the category lines, the cut reasons — are Beau's,
 * from ONE model call cached for the session (ledger-read-ai.ts), with a
 * deterministic fallback for every one of them, so the page is complete and
 * honest whether or not a call lands. Nothing here is placeholder copy about
 * a piece: no piece, no line.
 *
 * Design register is the reference's own, drawn from the shared Index tokens
 * (index-style.tsx): oatmeal ground, paper panels, hairline rules, walnut and
 * tobacco-gold ink, Cormorant headings, Lora body, IBM Plex Mono small-caps
 * labels, square corners, no shadows.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePlexMono, capWord, numberWord } from './mono-type';
import { TabHeader } from './tab-header';
import {
  fetchMaterials,
  fetchPieceConditions,
  fetchPieceValues,
  type CategoryBudget,
  type PieceCondition,
  type PieceValue,
  type StylePrefs,
  type StyleProfile,
  type WardrobePiece,
} from './profile-data';
import { fetchPieceWarmth, type PieceWarmth } from './warmth-model';
import {
  ACCENT,
  ACCENT_DEEP,
  FAINT,
  FAINTER,
  INK,
  MUTED,
  PAPER,
  SECONDARY,
  WALNUT,
  body,
  mono,
  serif,
} from './index-style';
import { HairlineRowsSkeleton } from './skeleton';
import { useReassessStatus } from './reassess-queue';
import { hostLabel, loadHuntReader, looksLikeBareUrl, normaliseUrl } from './hunt-reader';
import { loadHuntCallsMirror } from './hunt-model';
import { PhotoConfirmFlow } from './add-piece';
import { SearchPieceFlow } from './search-piece';
import {
  CUT_FOOT,
  READ_INK,
  UNREAD_CLOTH,
  buildLedger,
  cutMeta,
  cutWhy,
  matchesQuery,
  type LedgerCategoryRow,
  type LedgerModel,
  type LedgerPieceRow,
} from './ledger-model';
import { LEDGER_NOTES_EVENT, fetchLedgerNotes, setLedgerNote, type LedgerCall, type LedgerNote } from './ledger-notes';
import { applyLedgerReading, emptyLedgerReading, readLedgerVerdicts, type LedgerReading } from './ledger-read-ai';
import { LedgerPieceSheet } from './ledger-piece';

type LedgerView = 'list' | 'tiles';

const MIDDOT = '\u00b7';
const HATCH = 'repeating-linear-gradient(45deg,rgba(59,43,29,0.07) 0 5px,rgba(59,43,29,0) 5px 10px)';

/** The five-column table the reference sets, stacking on a phone. */
const ROW_GRID =
  'grid grid-cols-[70px_minmax(0,1fr)] md:grid-cols-[70px_minmax(0,1.2fr)_150px_minmax(0,1.15fr)_104px] gap-x-4 gap-y-2 md:gap-[18px]';

// ---------------------------------------------------------------------------
// The furniture
// ---------------------------------------------------------------------------

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="transition-colors hover:border-[#a8712c]"
      style={{
        ...mono(9.5, active ? WALNUT : SECONDARY),
        border: `1px solid ${active ? ACCENT : 'rgba(59,43,29,0.28)'}`,
        background: active ? 'rgba(168,113,44,0.14)' : 'transparent',
        padding: '6px 14px',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

/** The piece's own photograph, or the hatched frame that says there is none. */
function PieceFrame({ row, height }: { row: LedgerPieceRow; height: string }) {
  return (
    <div
      className="flex items-center justify-center overflow-hidden"
      style={{
        height,
        border: '1px solid rgba(59,43,29,0.28)',
        background: row.photo ? PAPER : HATCH,
        opacity: row.pending ? 0.55 : 1,
      }}
    >
      {row.photo ? (
        <img src={row.photo} alt={row.name} className="w-full h-full" style={{ objectFit: 'contain' }} loading="lazy" />
      ) : (
        <span style={mono(7, FAINT)}>No photo</span>
      )}
    </div>
  );
}

function OpenButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="transition-colors hover:border-[#a8712c]"
      style={{ ...mono(9, SECONDARY), border: '1px solid rgba(59,43,29,0.3)', padding: '6px 12px', whiteSpace: 'nowrap' }}
    >
      Open
    </button>
  );
}

// ---------------------------------------------------------------------------
// One piece, as a table row and as a tile
// ---------------------------------------------------------------------------

function PieceRow({ row, onOpen }: { row: LedgerPieceRow; onOpen: () => void }) {
  return (
    <div
      className={`${ROW_GRID} items-center`}
      style={{ padding: '13px 0', borderBottom: '1px solid rgba(59,43,29,0.12)' }}
    >
      <PieceFrame row={row} height="74px" />
      <div className="min-w-0">
        <div style={{ ...body(15, WALNUT), lineHeight: 1.3 }}>{row.name}</div>
        <div style={{ ...mono(9, MUTED), marginTop: '3px' }}>
          {[row.maker, row.sub].filter(Boolean).join(` ${MIDDOT} `)}
        </div>
      </div>
      <div className="col-span-2 md:col-span-1 flex flex-col" style={{ gap: '4px' }}>
        <span style={body(13, INK)}>{[row.cloth, row.colour].filter(Boolean).join(` ${MIDDOT} `)}</span>
        <span style={mono(9, ACCENT_DEEP)}>
          {[row.band, row.fit ? row.fit.toLowerCase() : null].filter(Boolean).join(` ${MIDDOT} `)}
        </span>
      </div>
      <div className="col-span-2 md:col-span-1 min-w-0">
        <div style={mono(9.5, READ_INK[row.read])}>{row.read}</div>
        <div style={{ ...body(12.5, SECONDARY), marginTop: '4px', lineHeight: 1.45 }}>{row.note}</div>
      </div>
      <div className="col-span-2 md:col-span-1 md:justify-self-end">
        <OpenButton onClick={onOpen} />
      </div>
    </div>
  );
}

function PieceTile({ row, onOpen }: { row: LedgerPieceRow; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-left transition-colors hover:border-[#a8712c]"
      style={{ border: '1px solid rgba(59,43,29,0.28)', background: PAPER, padding: '12px', borderRadius: 0 }}
    >
      <PieceFrame row={row} height="150px" />
      <div style={{ ...serif(19, WALNUT), marginTop: '10px', lineHeight: 1.14 }}>{row.name}</div>
      <div style={{ ...mono(8.5, MUTED), marginTop: '4px' }}>{row.maker || row.sub}</div>
      <div className="flex flex-wrap" style={{ marginTop: '8px', gap: '4px' }}>
        {[row.colour, row.band].filter(Boolean).map((tag) => (
          <span
            key={tag}
            style={{ ...mono(8, SECONDARY), border: '1px solid rgba(59,43,29,0.22)', padding: '2px 7px' }}
          >
            {tag}
          </span>
        ))}
      </div>
      <div
        style={{
          ...mono(9, READ_INK[row.read]),
          marginTop: '9px',
          paddingTop: '8px',
          borderTop: '1px solid rgba(59,43,29,0.16)',
        }}
      >
        {row.read}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// One category
// ---------------------------------------------------------------------------

function CategoryBlock({
  category,
  open,
  view,
  onToggle,
  onOpenPiece,
}: {
  category: LedgerCategoryRow;
  open: boolean;
  view: LedgerView;
  onToggle: () => void;
  onOpenPiece: (id: number) => void;
}) {
  const showing = open && category.pieces.length > 0;
  return (
    <div
      style={{
        borderTop: '1px solid rgba(59,43,29,0.24)',
        background: showing ? 'rgba(168,113,44,0.04)' : 'transparent',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full text-left grid grid-cols-[34px_minmax(0,1fr)_auto] items-baseline transition-colors hover:bg-[rgba(168,113,44,0.06)]"
        style={{ gap: '18px', padding: '17px 8px 17px 0', background: 'transparent', borderRadius: 0 }}
      >
        <span style={{ ...mono(15, ACCENT), letterSpacing: 0 }}>{open ? '\u2212' : '+'}</span>
        <span className="min-w-0 block">
          <span className="block" style={{ ...serif(27, WALNUT), lineHeight: 1.1 }}>
            {category.name}
          </span>
          <span className="block" style={{ ...body(13, SECONDARY), marginTop: '5px', lineHeight: 1.5 }}>
            {category.line}
          </span>
        </span>
        <span className="flex items-center whitespace-nowrap" style={{ gap: '14px' }}>
          <span style={mono(9.5, category.toLookAt > 0 ? ACCENT_DEEP : FAINT)}>{category.status}</span>
          <span style={{ ...mono(11, SECONDARY), letterSpacing: 0 }}>{category.count}</span>
        </span>
      </button>

      {showing && (
        <div className="md:pl-[52px]" style={{ paddingBottom: '22px' }}>
          {view === 'list' ? (
            <div>
              <div
                className={`${ROW_GRID} items-baseline hidden md:grid`}
                style={{ padding: '8px 0', borderBottom: '1px solid rgba(59,43,29,0.24)' }}
              >
                <span />
                <span style={mono(8.5, FAINT)}>The piece</span>
                <span style={mono(8.5, FAINT)}>{`Cloth ${MIDDOT} colour ${MIDDOT} band`}</span>
                <span style={mono(8.5, FAINT)}>{'Beau\u2019s read'}</span>
                <span />
              </div>
              {category.pieces.map((row) => (
                <PieceRow key={row.id} row={row} onOpen={() => onOpenPiece(row.id)} />
              ))}
            </div>
          ) : (
            <div
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
              style={{ gap: '16px', paddingTop: '14px' }}
            >
              {category.pieces.map((row) => (
                <PieceTile key={row.id} row={row} onOpen={() => onOpenPiece(row.id)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// What Beau would cut
// ---------------------------------------------------------------------------

const CALLS: Array<{ id: LedgerCall; label: string }> = [
  { id: 'keep', label: 'Keep it' },
  { id: 'retire', label: 'Retire' },
  { id: 'sell', label: 'Sell' },
];

function CutTable({
  cuts,
  reading,
  onCall,
}: {
  cuts: LedgerPieceRow[];
  reading: LedgerReading;
  onCall: (row: LedgerPieceRow, call: LedgerCall) => void;
}) {
  return (
    <div style={{ marginTop: '34px', border: `1px solid ${INK}`, background: PAPER }}>
      <div
        className="flex items-baseline justify-between flex-wrap"
        style={{ gap: '20px', padding: '16px 22px', borderBottom: '1px solid rgba(59,43,29,0.2)' }}
      >
        <span style={serif(24, WALNUT)}>What Beau would cut</span>
        <span style={mono(9.5, MUTED)}>{cutMeta(cuts)}</span>
      </div>

      {cuts.length === 0 ? (
        <div style={{ ...body(13, SECONDARY), padding: '18px 22px', maxWidth: '110ch', lineHeight: 1.55 }}>
          Nothing on your ledger argues against itself yet. A piece reaches this table when you tell Beau you never
          quite feel right in it, when your own note says it is finished, or when it is holding a slot it never
          leaves the house in — never because he would rather you owned something else.
        </div>
      ) : (
        <>
          {cuts.map((row, i) => (
            <div
              key={row.id}
              className="grid grid-cols-1 md:grid-cols-[34px_minmax(0,1fr)_minmax(0,1.3fr)_210px] items-center"
              style={{
                gap: '10px 18px',
                padding: '15px 22px',
                borderBottom: '1px solid rgba(59,43,29,0.12)',
                background:
                  row.call === 'retire'
                    ? 'rgba(59,43,29,0.05)'
                    : row.call
                      ? 'rgba(168,113,44,0.07)'
                      : 'transparent',
              }}
            >
              <span style={{ ...mono(11, ACCENT), letterSpacing: 0 }}>{String(i + 1).padStart(2, '0')}</span>
              <div className="min-w-0">
                <div style={body(15, WALNUT)}>{row.name}</div>
                <div style={{ ...mono(8.5, MUTED), marginTop: '3px' }}>
                  {[row.maker, row.categoryName, row.cloth === UNREAD_CLOTH ? null : row.cloth, row.feel ? row.feel.toLowerCase() : null]
                    .filter(Boolean)
                    .join(` ${MIDDOT} `)}
                </div>
              </div>
              <span style={{ ...body(13, INK), lineHeight: 1.5 }}>{reading.cuts[row.id] || cutWhy(row)}</span>
              <div className="flex md:justify-self-end" style={{ gap: '5px' }}>
                {CALLS.map((call) => {
                  const on = row.call === call.id;
                  const retire = call.id === 'retire';
                  return (
                    <button
                      key={call.id}
                      type="button"
                      onClick={() => onCall(row, call.id)}
                      aria-pressed={on}
                      className="transition-colors hover:border-[#a8712c]"
                      style={{
                        ...mono(9, on ? WALNUT : SECONDARY),
                        border: `1px solid ${on ? (retire ? 'rgba(59,43,29,0.5)' : ACCENT) : 'rgba(59,43,29,0.3)'}`,
                        background: on ? (retire ? 'rgba(59,43,29,0.12)' : 'rgba(168,113,44,0.16)') : 'transparent',
                        padding: '6px 11px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {call.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div style={{ ...body(13, SECONDARY), padding: '14px 22px 18px', maxWidth: '110ch', lineHeight: 1.55 }}>
            {reading.foot || CUT_FOOT}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The tab
// ---------------------------------------------------------------------------

export function LedgerTab({
  profile,
  pieces,
  prefs,
  loading = false,
  onChanged,
}: {
  profile: StyleProfile | null;
  pieces: Array<WardrobePiece & { pattern?: string | null; __pending?: boolean }>;
  prefs: StylePrefs | null;
  /** Accepted for parity with the other tabs; nothing here consumes it. */
  budgets?: Record<string, CategoryBudget>;
  /** True while the first read of wardrobe_pieces is still out. */
  loading?: boolean;
  /** The record moved — the app re-reads the pieces and their companions. */
  onChanged: () => void;
}) {
  usePlexMono();

  const [view, setView] = useState<LedgerView>('list');
  const [openIds, setOpenIds] = useState<string[] | null>(null);
  const [query, setQuery] = useState('');
  const [openPieceId, setOpenPieceId] = useState<number | null>(null);
  const [corrections, setCorrections] = useState(0);
  const reassessing = useReassessStatus() === 'reassessing';

  // ---- the record's companions -------------------------------------------
  const [materials, setMaterials] = useState<Record<number, string>>({});
  const [warmth, setWarmth] = useState<Record<number, PieceWarmth>>({});
  const [conditions, setConditions] = useState<Record<number, PieceCondition>>({});
  const [values, setValues] = useState<Record<number, PieceValue>>({});
  const [notes, setNotes] = useState<Record<number, LedgerNote>>({});

  const ledgerKey = useMemo(
    () => pieces.map((p) => `${p.id}:${p.name}:${p.category}:${p.slot || ''}:${p.photo_url || ''}`).sort().join('|'),
    [pieces],
  );

  const readCompanions = useCallback(() => {
    fetchMaterials().then(setMaterials).catch(() => undefined);
    fetchPieceWarmth().then(setWarmth).catch(() => undefined);
    fetchPieceConditions().then(setConditions).catch(() => undefined);
    fetchPieceValues().then(setValues).catch(() => undefined);
    fetchLedgerNotes().then(setNotes).catch(() => undefined);
  }, []);

  useEffect(() => {
    readCompanions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledgerKey, readCompanions]);

  useEffect(() => {
    const onNotes = () => {
      fetchLedgerNotes().then(setNotes).catch(() => undefined);
    };
    window.addEventListener(LEDGER_NOTES_EVENT, onNotes);
    return () => window.removeEventListener(LEDGER_NOTES_EVENT, onNotes);
  }, []);

  // ---- the arithmetic ----------------------------------------------------
  const computed = useMemo<LedgerModel>(
    () => buildLedger({ pieces, materials, warmth, conditions, values, notes }),
    [pieces, materials, warmth, conditions, values, notes],
  );

  // ---- Beau's words -----------------------------------------------------
  const [reading, setReading] = useState<LedgerReading | null>(null);
  const [thinking, setThinking] = useState(false);
  const held = useRef(computed);
  held.current = computed;
  const factsKey = useMemo(
    () =>
      computed.rows
        .map((r) => `${r.id}:${r.cloth}:${r.colour}:${r.band}:${r.fit || ''}:${r.feel || ''}:${r.condition || ''}:${r.wears}`)
        .sort()
        .join('|'),
    [computed],
  );

  useEffect(() => {
    if (computed.rows.length === 0) return undefined;
    let alive = true;
    setThinking(true);
    loadHuntReader({ profile, pieces, prefs, calls: loadHuntCallsMirror() })
      .then((reader) => readLedgerVerdicts({ reader, model: held.current }))
      .then((next) => {
        if (!alive) return;
        setReading(next);
        setThinking(false);
      })
      .catch(() => {
        if (alive) setThinking(false);
      });
    return () => {
      alive = false;
    };
    // The facts stand in for the record itself — a re-render with the same
    // ledger and the same dossier never re-reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factsKey, profile, prefs]);

  const fallback = useMemo(() => emptyLedgerReading(), []);
  const read = reading || fallback;
  const model = useMemo(() => applyLedgerReading(computed, read), [computed, read]);

  // ---- what the page is showing ------------------------------------------
  const q = query.trim();
  const filtered = useMemo<LedgerCategoryRow[]>(
    () =>
      model.categories.map((category) => ({
        ...category,
        pieces: q ? category.pieces.filter((row) => matchesQuery(row, q)) : category.pieces,
      })),
    [model, q],
  );
  const hits = useMemo(() => filtered.reduce((n, c) => n + c.pieces.length, 0), [filtered]);

  // The page opens on the category the record argues with most — the first
  // unfold is never an empty one.
  const defaultOpen = useMemo(() => {
    const arguing = [...model.categories].filter((c) => c.toLookAt > 0).sort((a, b) => b.toLookAt - a.toLookAt)[0];
    const first = arguing || model.categories.filter((c) => c.owned > 0)[0];
    return first ? [first.id] : [];
  }, [model.categories]);
  const open = openIds ?? defaultOpen;
  // A search opens whatever it found, so nothing hides behind a closed rule.
  const openNow = q ? filtered.filter((c) => c.pieces.length > 0).map((c) => c.id) : open;
  const allOpen = open.length >= model.categories.length;

  const openPiece = openPieceId != null ? model.rows.find((row) => row.id === openPieceId) || null : null;

  // ---- logging a piece ---------------------------------------------------
  const [draft, setDraft] = useState('');
  const [logQuery, setLogQuery] = useState('');
  const [logToken, setLogToken] = useState(0);
  const [logNote, setLogNote] = useState(
    'Paste a link or photograph it \u2014 Beau fills in the rest, you correct him',
  );
  const openPhotoPicker = useRef<(() => void) | null>(null);

  const logIt = () => {
    const raw = draft.trim();
    if (!raw) return;
    setLogQuery(raw);
    setLogToken((t) => t + 1);
    setDraft('');
    const host = looksLikeBareUrl(raw) ? hostLabel(normaliseUrl(raw)) : null;
    setLogNote(
      host
        ? `${host} ${MIDDOT} Beau is reading the page \u2014 check what he got when the card opens`
        : `“${raw}” ${MIDDOT} Beau is looking for it \u2014 pick the right one when the results land`,
    );
  };

  // The Index's “Log one I own” lands on this tab: the search flow opens
  // seeded with the type name, exactly as it did before.
  useEffect(() => {
    const onAddPiece = (e: Event) => {
      const name = String((e as CustomEvent).detail?.name || '').trim();
      if (name) {
        setLogQuery(name);
        setLogNote(`${name} ${MIDDOT} Beau is looking for it`);
      }
      setLogToken((t) => t + 1);
    };
    window.addEventListener('ethaion:add-piece', onAddPiece);
    return () => window.removeEventListener('ethaion:add-piece', onAddPiece);
  }, []);

  const afterChange = useCallback(() => {
    onChanged();
    readCompanions();
  }, [onChanged, readCompanions]);

  const onCall = (row: LedgerPieceRow, call: LedgerCall) => {
    const next = row.call === call ? null : call;
    setNotes((current) => {
      const onFile = current[row.id];
      return {
        ...current,
        [row.id]: {
          ...(onFile || { pieceId: row.id, fit: null, feel: null, wearContexts: [], tailoring: null, note: null, call: null }),
          call: next,
        },
      };
    });
    void setLedgerNote(row.id, { call: next }, notes[row.id] || null);
  };

  // ---- the masthead's aside ---------------------------------------------
  const headNote = reassessing
    ? 'Beau is re-reading your ledger'
    : corrections > 0
      ? `${capWord(numberWord(corrections))} ${corrections === 1 ? 'correction' : 'corrections'} made ${MIDDOT} Beau is reading them`
      : model.total === 0
        ? 'Nothing logged yet \u2014 start with one piece'
        : `${capWord(numberWord(model.categories.length))} categories ${MIDDOT} open one to see what is in it`;

  const crumbs = [
    'Ethaion',
    'The Ledger',
    q ? `“${q}”` : view === 'list' ? 'List' : 'Tiles',
    openPiece ? openPiece.name : '',
  ].filter(Boolean);

  return (
    <div>
      <TabHeader
        title="The Ledger"
        standfirst={'Everything you own, by category \u2014 open a piece to correct Beau.'}
        aside={
          <>
            <span style={{ ...serif(44, WALNUT), lineHeight: 1 }}>{model.total}</span>
            <span style={mono(9.5, MUTED)}>pieces logged</span>
            <span aria-live="polite" style={mono(9.5, ACCENT_DEEP)}>
              {headNote}
            </span>
          </>
        }
      />

      <div className="px-6 sm:px-10 py-8 max-w-[1180px] mx-auto w-full pb-28">
        {/* Where you are inside the record. */}
        <div className="flex items-center flex-wrap" style={{ gap: '9px', paddingBottom: '14px' }}>
          {crumbs.map((crumb, i) => (
            <span key={`${crumb}-${i}`} className="flex items-center" style={{ gap: '9px' }}>
              <span style={mono(9.5, i === crumbs.length - 1 ? WALNUT : FAINT)}>{crumb}</span>
              {i < crumbs.length - 1 && <span style={mono(9.5, FAINTER)}>/</span>}
            </span>
          ))}
        </div>

        {/* LOG A PIECE — a link in one end or a photograph in the other. */}
        <div
          className="flex items-center flex-wrap"
          style={{
            gap: '12px',
            padding: '14px 0',
            borderTop: `1px solid ${INK}`,
            borderBottom: '1px solid rgba(59,43,29,0.2)',
          }}
        >
          <span style={mono(9, FAINT)}>Log a piece</span>
          <div
            className="flex items-center flex-1"
            style={{
              gap: '12px',
              border: '1px solid rgba(59,43,29,0.35)',
              padding: '8px 14px',
              minWidth: '260px',
              maxWidth: '460px',
              background: PAPER,
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') logIt();
              }}
              placeholder={'paste the link \u2014 the shop\u2019s page, or a resale listing'}
              aria-label="Paste a link, or name the piece"
              className="flex-1 min-w-0"
              style={{
                border: 'none',
                background: 'transparent',
                fontFamily: 'var(--space-font-family)',
                fontSize: '14px',
                color: WALNUT,
                outline: 'none',
              }}
            />
          </div>
          <button
            type="button"
            onClick={logIt}
            style={{
              fontFamily: 'var(--space-font-heading)',
              fontSize: '13px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              padding: '8px 16px',
              background: WALNUT,
              color: '#f6f0e5',
              border: 'none',
              borderRadius: 0,
              whiteSpace: 'nowrap',
            }}
          >
            Log it
          </button>
          <button
            type="button"
            onClick={() => openPhotoPicker.current?.()}
            className="transition-colors hover:border-[#a8712c]"
            style={{
              ...mono(9.5, SECONDARY),
              border: '1px solid rgba(59,43,29,0.4)',
              padding: '8px 14px',
              whiteSpace: 'nowrap',
            }}
          >
            Photograph a piece
          </button>
          <span style={mono(9, ACCENT_DEEP)}>{logNote}</span>
        </div>

        {/* The two real ingestion flows. The photograph flow renders nothing
            until a photograph is chosen; the search flow appears with what he
            pasted and reads it straight away. */}
        <PhotoConfirmFlow pieces={pieces} onAdded={afterChange} openPickerRef={openPhotoPicker} />
        {logQuery && (
          <div style={{ marginTop: '18px' }}>
            <SearchPieceFlow pieces={pieces} onAdded={afterChange} focusToken={logToken} initialQuery={logQuery} />
          </div>
        )}

        {/* Show as · open every category · find. */}
        <div
          className="flex items-center justify-between flex-wrap"
          style={{ gap: '14px 20px', padding: '16px 0 14px' }}
        >
          <div className="flex items-center flex-wrap" style={{ gap: '8px' }}>
            <span style={mono(9, FAINT)}>Show as</span>
            <Chip label="List" active={view === 'list'} onClick={() => setView('list')} />
            <Chip label="Tiles" active={view === 'tiles'} onClick={() => setView('tiles')} />
            <button
              type="button"
              onClick={() => setOpenIds(allOpen ? [] : model.categories.map((c) => c.id))}
              style={{
                ...mono(9, ACCENT_DEEP),
                marginLeft: '8px',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid rgba(168,113,44,0.4)',
                padding: 0,
                borderRadius: 0,
              }}
            >
              {allOpen ? 'Close every category' : 'Open every category'}
            </button>
            <span aria-live="polite" style={mono(9, FAINT)}>
              {thinking && !reading ? 'Beau is reading your ledger\u2026' : ''}
            </span>
          </div>
          <div
            className="flex items-center"
            style={{
              gap: '12px',
              border: '1px solid rgba(59,43,29,0.3)',
              padding: '7px 13px',
              minWidth: '280px',
              background: PAPER,
            }}
          >
            <span style={mono(9, FAINT)}>Find</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="a piece, a maker, a cloth"
              aria-label="Find a piece"
              className="flex-1 min-w-0"
              style={{
                border: 'none',
                background: 'transparent',
                fontFamily: 'var(--space-font-family)',
                fontSize: '13.5px',
                color: WALNUT,
                outline: 'none',
              }}
            />
          </div>
        </div>

        {loading && model.total === 0 ? (
          <HairlineRowsSkeleton rows={6} />
        ) : (
          <section data-tour="tour-ledger-pieces" aria-label="Everything you own, by category">
            {filtered.map((category) => (
              <CategoryBlock
                key={category.id}
                category={category}
                open={openNow.includes(category.id)}
                view={view}
                onToggle={() =>
                  setOpenIds(
                    open.includes(category.id) ? open.filter((id) => id !== category.id) : [...open, category.id],
                  )
                }
                onOpenPiece={setOpenPieceId}
              />
            ))}
            <div style={{ borderTop: `1px solid ${INK}` }} />

            {q && hits === 0 && (
              <div style={{ ...serif(21, MUTED), padding: '22px 0' }}>
                {`Nothing matches “${q}” \u2014 try a shorter word.`}
              </div>
            )}

            {model.total === 0 ? (
              <p style={{ ...body(14.5, SECONDARY), margin: '22px 0 0', maxWidth: '74ch' }}>
                Nothing on the ledger yet. Paste a link or photograph one piece and Beau reads the cloth, the cut and
                the temperature band off it — you correct him, and the rest of the app has something to work from.
              </p>
            ) : (
              <CutTable cuts={model.cuts} reading={read} onCall={onCall} />
            )}
          </section>
        )}
      </div>

      {openPiece && (
        <LedgerPieceSheet
          row={openPiece}
          onClose={() => setOpenPieceId(null)}
          onChanged={afterChange}
          onNote={(note) => {
            setNotes((current) => ({ ...current, [note.pieceId]: note }));
            setCorrections((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}
