/**
 * The old Rail — the owned wardrobe in photo form (Pass Forty-Three).
 *
 * MILESTONES OVERHAUL: the Rail no longer occupies a tab-bar slot — its
 * contents merged into The Ledger as the "On the Rail" section
 * (OnTheRailSection below, embedded by App.tsx under Your Pieces). The
 * full RailTab screen is preserved intact and stays routable (chat deep
 * links), it just has no tab. The NEW "The Rail" tab is the renamed
 * Curated surface (curated.tsx) — a different thing entirely.
 *
 * The owned wardrobe in photo form — every piece the user owns, photographed
 * and filed, always in sync with the wardrobe tracker (same wardrobe_pieces
 * data, two views).
 *
 * Layout, top to bottom:
 *  1. "The Rail" page heading (Cormorant 52px/400) + standfirst, with the
 *     "Rail view · List view" segmented toggle on the same baseline row.
 *  2. "Add a piece" — the two-pill tab switcher shared with the Wardrobe
 *     screen (Pass Forty-Seven): [ Photograph ] [ Search ], the selected
 *     flow unfolding in place beneath the pills. No section header above.
 *  3. "On the rail" — section head + "{n} pieces · newest first", then:
 *      · RAIL VIEW — a 5-column photo grid with TRUE hairline gutters (grid
 *        background is the divider colour, gap 1px), each cell --paper with
 *        16px padding: the canonical 4:5 catalogue plate, the piece name in
 *        Cormorant 17px, and "Category · material" in Lora 12px neutral-600.
 *        A dashed "+ Add a piece" cell closes the grid.
 *      · LIST VIEW — plain hairline rows: name Cormorant 18px · category +
 *        material · brand · › chevron.
 *     Tapping any owned piece opens the shared edit sheet (piece-edit.tsx).
 *
 * No white surfaces, no rounded cards, no shadows — hairlines and paper
 * only. Logging lives on the Wardrobe tab; The Rail is the record.
 */
import { useMemo, useState } from 'react';
import { typography } from '../../lib/colors';
import {
  categoryLabel,
  deletePiece,
  materialFor,
  type WardrobePiece,
} from './profile-data';
import { CanonicalGarment } from './canonical-garment';
import { PieceEditSheet } from './piece-edit';
import { AddPieceSection } from './add-piece';
import { pieceBrandType, pieceMetaType, pieceNameType } from './piece-typography';

function goToAddFlow() {
  // The ONE photo-first add flow lives on the Wardrobe tab (Pass
  // Thirty-Three) — route there rather than duplicating it here.
  window.dispatchEvent(new CustomEvent('ethaion:navigate', { detail: { tab: 'wardrobe' } }));
}

// ---------------------------------------------------------------------------
// Rail-view cells
// ---------------------------------------------------------------------------

/** One owned piece — the canonical catalogue image on a 4:5 plate, name in
 * Cormorant 17px, "Category · material" below; tapping opens the edit sheet. */
function PieceCell({
  piece,
  material,
  onEdit,
  onRemove,
}: {
  piece: WardrobePiece;
  material: string;
  onEdit: () => void;
  /** Remove this piece from the wardrobe/Rail entirely (Pass Forty-Four). */
  onRemove: () => void;
}) {
  const sub = [categoryLabel(piece.category), material || null].filter(Boolean).join(' · ');
  // Optimistic add (Pass Forty-Six): a just-saved piece renders faint until
  // its write settles.
  const pending = !!(piece as WardrobePiece & { __pending?: boolean }).__pending;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onEdit();
      }}
      className="bg-[var(--color-paper,#fbf8f1)] text-left block w-full flex flex-col cursor-pointer group focus:outline-none focus:ring-1 focus:ring-inset focus:ring-[var(--color-accent,#a8712c)]"
      style={{ padding: '10px 10px 14px', gap: '8px', ...(pending ? { opacity: 0.55, pointerEvents: 'none' as const } : null) }}
      title={`Edit ${piece.name}`}
      aria-label={`Edit ${piece.name} — name, photo, category, brand, colour, material`}
    >
      <span className="relative block">
        {/* CanonicalGarment carries the shared matted-plate treatment itself */}
        <CanonicalGarment
          fields={{
            name: piece.name,
            category: piece.category,
            slot: piece.slot,
            colors: piece.colors,
            pattern: (piece as WardrobePiece & { pattern?: string | null }).pattern,
            brand: piece.brand,
          }}
          photoUrl={piece.photo_url || null}
          pieceId={piece.id}
          title={piece.name}
          className="w-full aspect-[4/5]"
        />
        {/* × remove control — top-right of the photo plate, shown on hover
            (always visible on touch, where there is no hover). */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute top-0 right-0 min-w-[36px] min-h-[36px] flex items-center justify-center text-[var(--color-neutral-500,#a68e70)] hover:text-[var(--color-accent-700,#7c4a17)] transition-opacity opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
          style={{ fontFamily: 'var(--space-font-family)', fontSize: 'max(var(--eth-body, 0px), 13px)', lineHeight: 1, background: 'transparent' }}
          aria-label={`Remove ${piece.name} from your wardrobe`}
          title="Remove this piece from your wardrobe"
        >
          ×
        </button>
      </span>
      <span className="block min-w-0">
        {/* Three-tier piece typography (piece-typography.ts): name · brand ·
            category + fabric — three clearly distinct visual levels. */}
        <span className="block" style={pieceNameType}>
          {piece.name}
        </span>
        {piece.brand && (
          <span className="block" style={{ ...pieceBrandType, marginTop: '2px' }}>
            {piece.brand}
          </span>
        )}
        <span className="block" style={{ ...pieceMetaType, marginTop: '2px' }}>
          {sub || '\u2014'}
        </span>
      </span>
    </div>
  );
}

/** The dashed "+ Add a piece" cell — always the last cell in the grid. */
function AddPieceCell() {
  return (
    <button
      type="button"
      onClick={goToAddFlow}
      className="bg-[var(--color-paper,#fbf8f1)] text-left block w-full flex flex-col group"
      style={{ padding: '10px 10px 14px', gap: '8px' }}
      aria-label="Add a piece — opens the Wardrobe tab's photo-first add flow"
    >
      <span
        className="flex w-full aspect-[4/5] items-center justify-center border border-dashed border-[var(--color-neutral-300,#dccdb2)] group-hover:border-[var(--color-accent,#a8712c)] transition-colors box-border"
      >
        <span
          className="group-hover:text-[var(--color-accent,#a8712c)] transition-colors"
          style={{ fontFamily: 'var(--space-font-heading)', fontSize: '15px', fontWeight: 400, color: 'var(--color-neutral-600,#856c51)' }}
        >
          + Add a piece
        </span>
      </span>
      <span className="block">
        <span
          className="block text-[var(--color-neutral-700,#634e38)]"
          style={{ fontFamily: 'var(--space-font-heading)', fontSize: '17px', fontWeight: 400, lineHeight: 1.2 }}
        >
          Photograph the next one
        </span>
        <span className="block text-[var(--color-neutral-600,#856c51)]" style={{ fontFamily: 'var(--space-font-family)', fontSize: 'max(var(--eth-label, 0px), 12px)' }}>
          Logs to your tracker
        </span>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// "On the Rail" — the section The Ledger embeds under Your Pieces
// (Milestones overhaul, Part 2c): the same photo record, merged in from the
// old Rail tab. Same wardrobe_pieces data, nothing lost.
// ---------------------------------------------------------------------------

export function OnTheRailSection({
  pieces,
  materials = {},
  onChanged,
}: {
  pieces: WardrobePiece[];
  /** piece id → material display string (piece_materials companion table). */
  materials?: Record<number, string>;
  onChanged: () => void;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const editingPiece = editingId != null ? pieces.find((p) => p.id === editingId) || null : null;

  const removePiece = async (id: number) => {
    try {
      await deletePiece(id);
    } finally {
      if (editingId === id) setEditingId(null);
      onChanged();
    }
  };

  // Newest first — the tracker hands pieces up oldest-first.
  const sorted = useMemo(
    () => [...pieces].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')),
    [pieces],
  );

  return (
    <section aria-label="On the Rail">
      <div className="flex items-baseline justify-between gap-3 pb-2.5 border-b border-[var(--color-text,#3b2b1d)]">
        <h3 className={`hab-section-head ${typography.color.primary}`}>On the Rail</h3>
        <span className="hab-kicker text-[var(--color-neutral-600,#856c51)] tabular-nums" style={{ letterSpacing: '0.14em' }}>
          {sorted.length} piece{sorted.length === 1 ? '' : 's'} · newest first
        </span>
      </div>
      <p className={typography.color.primary} style={{ fontFamily: 'var(--space-font-family)', fontSize: 'max(var(--eth-body, 0px), 14px)', lineHeight: 1.6, maxWidth: '62ch', margin: '12px 0 16px' }}>
        Everything you own, photographed and filed — the same pieces as the categories above, hung out as a rail.
        Tap any piece to edit it.
      </p>

      {sorted.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px bg-[var(--color-divider,rgba(59,43,29,0.18))] border-b border-[var(--color-divider,rgba(59,43,29,0.18))]">
          {sorted.map((piece) => (
            <PieceCell
              key={piece.id}
              piece={piece}
              material={materialFor(piece, materials)}
              onEdit={() => setEditingId(piece.id)}
              onRemove={() => void removePiece(piece.id)}
            />
          ))}
          <AddPieceCell />
        </div>
      ) : (
        <p style={{ fontFamily: 'var(--space-font-family)', fontSize: 'max(var(--eth-body, 0px), 14px)', lineHeight: 1.55, color: 'var(--color-neutral-600,#856c51)' }}>
          Nothing on the rail yet — photograph a piece above and it appears here, in step with your pieces.
        </p>
      )}

      {editingPiece && (
        <PieceEditSheet
          piece={editingPiece}
          material={materialFor(editingPiece, materials)}
          onClose={() => setEditingId(null)}
          onChanged={onChanged}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// The old Rail tab root — preserved intact (no tab-bar slot; still routable).
// ---------------------------------------------------------------------------

export function RailTab({
  pieces,
  materials = {},
  onChanged,
}: {
  pieces: WardrobePiece[];
  /** piece id → material display string (piece_materials companion table). */
  materials?: Record<number, string>;
  onChanged: () => void;
}) {
  const [view, setView] = useState<'rail' | 'list'>('rail');
  // Tap any owned piece to edit it in place — the same shared edit sheet as
  // the Wardrobe tab, writing to the same wardrobe_pieces row.
  const [editingId, setEditingId] = useState<number | null>(null);
  const editingPiece = editingId != null ? pieces.find((p) => p.id === editingId) || null : null;
  // Clear wardrobe (Pass Forty-Four) — removes ALL pieces from the wardrobe
  // and The Rail, behind a plain inline confirm (never a styled modal).
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  const removePiece = async (id: number) => {
    try {
      await deletePiece(id);
    } finally {
      if (editingId === id) setEditingId(null);
      onChanged();
    }
  };

  const clearWardrobe = async () => {
    if (clearing) return;
    setClearing(true);
    try {
      // Sequential deletes — deletePiece also cleans each piece's companion
      // rows (materials, details, attributes, reminders, photo metadata).
      for (const piece of pieces) {
        try {
          await deletePiece(piece.id);
        } catch (error) {
          console.warn('[Ethaion] clear wardrobe: could not remove one piece:', piece.name, error);
        }
      }
      // The pipeline's normalization stamps live outside deletePiece's
      // cleanup list — clear them so a rebuilt wardrobe starts fresh.
      try {
        const { data } = await (window as any).__workspaceDb.from('piece_photo_norm').limit(200).get();
        for (const row of data || []) await (window as any).__workspaceDb.from('piece_photo_norm').delete(row.id);
      } catch { /* non-fatal companion cleanup */ }
      setEditingId(null);
      onChanged();
    } finally {
      setClearing(false);
      setConfirmClear(false);
    }
  };

  // Newest first — the tracker hands pieces up oldest-first.
  const sorted = useMemo(
    () => [...pieces].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')),
    [pieces],
  );

  return (
    <div className="pb-24">
      {/* Page heading row (HTML reference): heading + standfirst left, the
          Rail view / List view segmented toggle right, closed by a hairline. */}
      <div className="px-6 sm:px-10 pt-[52px] pb-11 border-b border-[var(--color-divider,rgba(59,43,29,0.18))]">
        <div className="max-w-[1180px] mx-auto flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div className="min-w-0">
            <h3 className={`hab-page-title ${typography.color.primary}`} style={{ marginBottom: '14px' }}>The Rail</h3>
            <p className={typography.color.primary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '16px', lineHeight: 1.55, maxWidth: '52ch' }}>
              Everything you own, photographed and filed — always in sync with your wardrobe tracker. Same data,
              two views.
            </p>
          </div>
          <div className="flex flex-col items-start sm:items-end gap-3 flex-shrink-0">
            {/* Clear wardrobe — plain Lora 13px accent text link, top-right of
                the screen, behind a plain inline confirm (Pass Forty-Four). */}
            {pieces.length > 0 && (
              <div style={{ fontFamily: 'var(--space-font-family)', fontSize: 'max(var(--eth-body, 0px), 13px)' }}>
                {!confirmClear ? (
                  <button
                    type="button"
                    onClick={() => setConfirmClear(true)}
                    className="hover:underline"
                    style={{ color: 'var(--color-accent,#a8712c)' }}
                  >
                    Clear wardrobe ›
                  </button>
                ) : (
                  <span className="inline-flex items-baseline gap-3 flex-wrap">
                    <span className="text-[var(--color-neutral-700,#634e38)]">Are you sure? This removes all pieces.</span>
                    <button
                      type="button"
                      onClick={() => void clearWardrobe()}
                      disabled={clearing}
                      className="hover:underline disabled:opacity-50"
                      style={{ color: 'var(--color-accent,#a8712c)' }}
                    >
                      {clearing ? 'Clearing…' : 'Yes, clear it'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClear(false)}
                      disabled={clearing}
                      className="text-[var(--color-neutral-600,#856c51)] hover:underline disabled:opacity-50"
                    >
                      Keep
                    </button>
                  </span>
                )}
              </div>
            )}
            <div className="flex" role="group" aria-label="Rail views">
              {([
                { id: 'rail', label: 'Rail view' },
                { id: 'list', label: 'List view' },
              ] as const).map(({ id, label }, i) => {
                const active = view === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setView(id)}
                    aria-pressed={active}
                    className={`uppercase min-h-[44px] px-5 grid place-items-center whitespace-nowrap transition-colors ${
                      active
                        ? 'border border-[var(--color-accent,#a8712c)] bg-[var(--color-accent-100,#fbf1de)] text-[var(--color-accent-800,#5c3413)]'
                        : 'border border-[var(--color-divider,rgba(59,43,29,0.18))] text-[var(--color-neutral-700,#634e38)] hover:text-[var(--space-text-primary)]'
                    } ${i > 0 ? 'border-l-0' : ''}`}
                    style={{ fontFamily: 'var(--space-font-heading)', fontSize: 'max(var(--eth-serif, 0px), 12px)', letterSpacing: '0.12em' }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Add a piece — the SAME two-pill tab switcher as the Wardrobe
          screen (Pass Forty-Seven): [ Photograph ] [ Search ] at the top of
          the tab, the selected flow unfolding beneath. */}
      <div className="px-6 sm:px-10 pt-10">
        <div className="max-w-[1180px] mx-auto">
          <AddPieceSection pieces={pieces} onAdded={onChanged} />
        </div>
      </div>

      {/* On the rail — section head + the record itself */}
      <div className="px-6 sm:px-10 pt-[52px]">
        <div className="max-w-[1180px] mx-auto">
          <div className="flex items-baseline justify-between gap-3 pb-2.5 border-b border-[var(--color-text,#3b2b1d)]">
            <h4 className={`hab-section-head ${typography.color.primary}`}>On the rail</h4>
            <span className="hab-kicker text-[var(--color-neutral-600,#856c51)] tabular-nums" style={{ letterSpacing: '0.14em' }}>
              {sorted.length} piece{sorted.length === 1 ? '' : 's'} · newest first
            </span>
          </div>

          {view === 'rail' ? (
            /* RAIL VIEW — 5-column photo grid, TRUE hairline gutters, flush
               to the content edges. */
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px bg-[var(--color-divider,rgba(59,43,29,0.18))] border-b border-[var(--color-divider,rgba(59,43,29,0.18))]">
              {sorted.map((piece) => (
                <PieceCell
                  key={piece.id}
                  piece={piece}
                  material={materialFor(piece, materials)}
                  onEdit={() => setEditingId(piece.id)}
                  onRemove={() => void removePiece(piece.id)}
                />
              ))}
              <AddPieceCell />
            </div>
          ) : (
            /* LIST VIEW — plain hairline rows over the same data. */
            <div className="divide-y divide-[var(--color-divider,rgba(59,43,29,0.18))] border-b border-[var(--color-divider,rgba(59,43,29,0.18))]">
              {sorted.map((piece) => {
                const material = materialFor(piece, materials);
                return (
                  <button
                    key={piece.id}
                    type="button"
                    onClick={() => setEditingId(piece.id)}
                    className="w-full grid items-center text-left group"
                    style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr) 18px', gap: '24px', padding: '16px 4px' }}
                  >
                    <span
                      className={`min-w-0 truncate ${typography.color.primary}`}
                      style={{ fontFamily: 'var(--space-font-heading)', fontSize: '18px', fontWeight: 400, lineHeight: 1.2 }}
                    >
                      {piece.name}
                    </span>
                    <span className="min-w-0 truncate" style={{ fontFamily: 'var(--space-font-family)', fontSize: 'max(var(--eth-body, 0px), 13px)' }}>
                      {piece.brand && <span style={{ color: 'var(--color-accent,#a8712c)' }}>{piece.brand}</span>}
                      {piece.brand && (categoryLabel(piece.category) || material) ? (
                        <span style={{ color: '#9a8a7a' }}>{' · '}</span>
                      ) : null}
                      <span style={{ color: '#9a8a7a', fontSize: 'max(var(--eth-label, 0px), 12px)' }}>
                        {[categoryLabel(piece.category), material || null].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span
                      className="justify-self-end text-[var(--color-neutral-500,#a68e70)] group-hover:translate-x-0.5 transition-transform"
                      style={{ fontFamily: 'var(--space-font-heading)', fontSize: '17px', lineHeight: 1 }}
                      aria-hidden="true"
                    >
                      ›
                    </span>
                  </button>
                );
              })}
              {sorted.length === 0 && (
                <p className="py-6" style={{ fontFamily: 'var(--space-font-family)', fontSize: 'max(var(--eth-body, 0px), 14px)', color: 'var(--color-neutral-600,#856c51)' }}>
                  Nothing filed yet — upload a photo above and the list fills in.
                </p>
              )}
            </div>
          )}

          {view === 'rail' && sorted.length === 0 && (
            /* Quiet note under the grid — the dashed add cell carries the way in. */
            <p
              className="mt-5"
              style={{ fontFamily: 'var(--space-font-family)', fontSize: 'max(var(--eth-body, 0px), 14px)', lineHeight: 1.55, color: 'var(--color-neutral-600,#856c51)' }}
            >
              Nothing on the rail yet — photograph a piece and it appears here, in step with your wardrobe tracker.
            </p>
          )}
        </div>
      </div>

      {editingPiece && (
        <PieceEditSheet
          piece={editingPiece}
          material={materialFor(editingPiece, materials)}
          onClose={() => setEditingId(null)}
          onChanged={onChanged}
        />
      )}
    </div>
  );
}
