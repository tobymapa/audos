/**
 * SAVED LOOKS — the dedicated saved-library screen (feature pass · 22a ·
 * M7), opened from The Fitting's “View saved” action.
 *
 *   · TWO-UP flat-lay grid — the one drawing of a look (build brief rule 5),
 *     quartered: the flat lay is a silhouette, and silhouettes scale.
 *   · SORTED BY LAST WORN — most recently worn first; never-worn looks sink
 *     to the bottom. Wear tracking lives in the look_meta companion table
 *     (saved_outfits cannot gain a column).
 *   · LOOKS vs PROPOSALS — a look is wearable tomorrow (solid border); a
 *     proposal holds at least one piece you don't own (DASHED border —
 *     build brief rule 2) and can't be “worn” until it stops being one.
 *   · “WORE IT” on a look stamps the look AND advances each owned piece's
 *     piece_value wear counter, so cost-per-wear moves with real life.
 *   · Tapping a card opens the look in the Fitting board builder.
 */
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Plus, X } from 'lucide-react';
import { typography } from '../../lib/colors';
import { fetchPieceValues, incrementWear } from './profile-data';
import { FlatLayBoard, parsePieces, type BoardPiece } from './flat-view';

// window.__workspaceDb is auto-injected by the platform compiler when it sees
// this literal token in app source.
function db(): any {
  return (window as any).__workspaceDb;
}

interface SavedOutfitRow {
  id: number;
  name: string;
  pieces: unknown;
  mode?: string | null;
  created_at?: string;
}

interface LookMetaRow {
  id: number;
  look_id: number;
  times_worn: number;
  last_worn_at: string | null;
}

const bodyFont: React.CSSProperties = { fontFamily: 'var(--space-font-family)', fontSize: '13px', lineHeight: 1.5 };

function agoLabel(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface LookCardModel {
  row: SavedOutfitRow;
  pieces: BoardPiece[];
  proposal: boolean;
  waitingOn: number;
  meta: LookMetaRow | null;
}

function LookCard({
  look,
  onOpen,
  onWore,
  onDelete,
  wearBusy,
  deleteBusy,
}: {
  look: LookCardModel;
  onOpen: () => void;
  onWore: () => void;
  onDelete: () => void;
  wearBusy: boolean;
  deleteBusy: boolean;
}) {
  const { row, pieces, proposal, waitingOn, meta } = look;
  const worn = meta?.times_worn || 0;
  const wornLine = proposal
    ? `Waiting on ${waitingOn} piece${waitingOn === 1 ? '' : 's'}`
    : worn > 0
      ? `Worn ${worn}\u00d7 · ${agoLabel(meta?.last_worn_at)}`
      : 'Not yet worn';
  return (
    <div
      className="flex flex-col bg-[var(--color-paper,#fbf8f1)]"
      style={{
        border: proposal
          ? '1.5px dashed var(--color-accent,#a8712c)'
          : '1px solid var(--color-divider,rgba(59,43,29,0.28))',
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        className="text-left group flex-1"
        title={`Open \u201c${row.name}\u201d in the board builder`}
      >
        {/* THE ONE DRAWING OF A LOOK (rule 5): the same flat-lay, quartered.
            A saved look keeps one seed forever, so it lays out identically
            here and on the full board. */}
        <div className="pointer-events-none px-2 pt-2">
          <FlatLayBoard
            pieces={pieces}
            seed={`saved-${row.id}`}
            aspect={480 / 600}
            maxWidth="100%"
            panel="paper"
            variant="tray"
            ground="transparent"
          />
        </div>
        <div className="px-3 pb-2 pt-1">
          <p className="group-hover:underline" style={{ fontFamily: 'var(--space-font-heading)', fontSize: '16px', fontWeight: 500, lineHeight: 1.2, color: 'var(--color-text,#241a12)' }}>
            {row.name}
          </p>
          <p className="text-[var(--color-neutral-600,#856c51)]" style={{ ...bodyFont, fontSize: '11.5px', marginTop: '2px' }}>
            {pieces.length} piece{pieces.length === 1 ? '' : 's'} · {wornLine}
          </p>
        </div>
      </button>
      <div className="flex items-center gap-1 px-3 pb-2.5 flex-wrap">
        {!proposal && (
          <button
            type="button"
            onClick={onWore}
            disabled={wearBusy}
            className="inline-flex items-center gap-1 min-h-[36px] px-1.5 hover:underline disabled:opacity-50"
            style={{ ...bodyFont, fontSize: '12px', color: 'var(--color-accent,#a8712c)' }}
            title="Wore this look — stamps the look and every owned piece on it"
          >
            {wearBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
            Wore it
          </button>
        )}
        <span className="flex-1" />
        <button
          type="button"
          onClick={onDelete}
          disabled={deleteBusy}
          className="min-h-[36px] min-w-[36px] flex items-center justify-center text-[var(--color-neutral-500,#a68e70)] hover:text-[var(--color-accent-700,#7c4a17)] disabled:opacity-40"
          aria-label={`Delete \u201c${row.name}\u201d`}
          title={proposal ? 'Delete this proposal' : 'Delete this saved look'}
        >
          {deleteBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '\u00d7'}
        </button>
      </div>
    </div>
  );
}

export function SavedLooksScreen({
  onLoadLook,
  onClose,
}: {
  /** Open a saved look in the Fitting board builder (and close this screen). */
  onLoadLook: (row: { id: number; name: string; pieces: unknown; mode?: string | null }) => void;
  onClose: () => void;
}) {
  const { data: savedRows, refresh: refreshSaved } = (window as any).useWorkspaceDB('saved_outfits', {
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 100,
  });
  const { data: metaRows, refresh: refreshMeta } = (window as any).useWorkspaceDB('look_meta', {
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 200,
  });
  const [wearBusyId, setWearBusyId] = useState<number | null>(null);
  const [deleteBusyId, setDeleteBusyId] = useState<number | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 3500);
    return () => window.clearTimeout(t);
  }, [flash]);

  const { looks, proposals } = useMemo(() => {
    const metaByLook = new Map<number, LookMetaRow>();
    for (const m of ((metaRows || []) as LookMetaRow[])) {
      const existing = metaByLook.get(Number(m.look_id));
      if (!existing || Number(m.id) > Number(existing.id)) metaByLook.set(Number(m.look_id), m);
    }
    const models: LookCardModel[] = ((savedRows || []) as SavedOutfitRow[]).map((row) => {
      const pieces = parsePieces(row.pieces);
      const waitingOn = pieces.filter((p) => !(p.key || '').startsWith('owned-')).length;
      const proposal = row.mode === 'proposal' || waitingOn > 0;
      return { row, pieces, proposal, waitingOn, meta: metaByLook.get(row.id) || null };
    });
    // LAST WORN FIRST; never-worn at the bottom (newest of those first).
    const byWear = (a: LookCardModel, b: LookCardModel) => {
      const aw = a.meta?.last_worn_at ? new Date(a.meta.last_worn_at).getTime() : 0;
      const bw = b.meta?.last_worn_at ? new Date(b.meta.last_worn_at).getTime() : 0;
      if (aw !== bw) return bw - aw;
      return new Date(b.row.created_at || 0).getTime() - new Date(a.row.created_at || 0).getTime();
    };
    return {
      looks: models.filter((m) => !m.proposal).sort(byWear),
      proposals: models.filter((m) => m.proposal).sort(byWear),
    };
  }, [savedRows, metaRows]);

  /** “Wore it”: stamp the look's meta row AND advance every owned piece's
   * wear counter — cost-per-wear updates live everywhere it shows. */
  const woreLook = async (look: LookCardModel) => {
    if (wearBusyId != null) return;
    setWearBusyId(look.row.id);
    try {
      const existing = look.meta;
      if (existing) {
        await db().from('look_meta').update(existing.id, {
          times_worn: (existing.times_worn || 0) + 1,
          last_worn_at: new Date().toISOString(),
        });
      } else {
        await db().from('look_meta').insert({
          look_id: look.row.id,
          times_worn: 1,
          last_worn_at: new Date().toISOString(),
        });
      }
      // Each owned piece on the board wore it too.
      const ownedIds = look.pieces
        .map((p) => ((p.key || '').startsWith('owned-') ? Number((p.key || '').slice('owned-'.length)) : null))
        .filter((id): id is number => id != null && Number.isFinite(id));
      if (ownedIds.length > 0) {
        const values = await fetchPieceValues();
        for (const pieceId of ownedIds) {
          try {
            await incrementWear(pieceId, values[pieceId] || null);
          } catch { /* one piece never blocks the rest */ }
        }
      }
      setFlash(`Worn — “${look.row.name}” and its ${ownedIds.length} piece${ownedIds.length === 1 ? '' : 's'} all move their counters.`);
      refreshMeta();
    } catch (e) {
      console.warn('[Ethaion] look wear failed:', e);
    } finally {
      setWearBusyId(null);
    }
  };

  const deleteLook = async (look: LookCardModel) => {
    if (deleteBusyId != null) return;
    setDeleteBusyId(look.row.id);
    try {
      await db().from('saved_outfits').delete(look.row.id);
      refreshSaved();
    } catch (e) {
      console.warn('[Ethaion] look delete failed:', e);
    } finally {
      setDeleteBusyId(null);
    }
  };

  const grid = (models: LookCardModel[]) => (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 mt-3">
      {models.map((look) => (
        <LookCard
          key={look.row.id}
          look={look}
          onOpen={() => onLoadLook(look.row)}
          onWore={() => void woreLook(look)}
          onDelete={() => void deleteLook(look)}
          wearBusy={wearBusyId === look.row.id}
          deleteBusy={deleteBusyId === look.row.id}
        />
      ))}
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{ background: 'var(--color-bg,#efe7d9)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Saved looks and proposals"
    >
      <div className="max-w-[880px] mx-auto px-5 sm:px-10 py-8 pb-24">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 min-h-[44px] hover:underline"
            style={{ ...bodyFont, fontSize: '13px', color: 'var(--color-neutral-700,#634e38)' }}
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> Back to the board
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 flex items-center justify-center border border-[var(--color-divider,rgba(59,43,29,0.18))] bg-[var(--color-paper,#fbf8f1)] text-[var(--color-neutral-600,#856c51)] hover:text-[var(--color-accent-700,#7c4a17)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <h3 className={typography.color.primary} style={{ fontFamily: 'var(--space-font-heading)', fontWeight: 400, fontSize: '34px', lineHeight: 1.1, marginTop: '18px' }}>
          Saved
        </h3>
        <p className={typography.color.primary} style={{ ...bodyFont, fontSize: '14.5px', marginTop: '8px', maxWidth: '54ch' }}>
          Looks are wearable tomorrow — every piece yours. Proposals hold something you don’t own, drawn dashed.
          Most recently worn first; tap any card to open it on the board.
        </p>

        {flash && (
          <p className="mt-3" style={{ ...bodyFont, fontSize: '12.5px', color: 'var(--color-accent-700,#7c4a17)' }} aria-live="polite">
            {flash}
          </p>
        )}

        <section aria-label="Saved looks" className="mt-7">
          <p className="uppercase text-[var(--color-neutral-700,#634e38)] pb-2 border-b border-[var(--color-text,#3b2b1d)]" style={{ fontFamily: 'var(--space-font-heading)', fontSize: '12px', letterSpacing: '0.16em' }}>
            Looks · {looks.length} — sorted by last worn
          </p>
          {looks.length > 0 ? (
            grid(looks)
          ) : (
            <p className="pt-3 text-[var(--color-neutral-600,#856c51)]" style={{ ...bodyFont, fontSize: '13px' }}>
              Nothing saved yet — build a board and tap Save.
            </p>
          )}
        </section>

        <section aria-label="Proposals" className="mt-9">
          <p className="uppercase text-[var(--color-neutral-700,#634e38)] pb-2 border-b border-[var(--color-text,#3b2b1d)]" style={{ fontFamily: 'var(--space-font-heading)', fontSize: '12px', letterSpacing: '0.16em' }}>
            Proposals · {proposals.length} — dashed = not yours yet
          </p>
          {proposals.length > 0 ? (
            grid(proposals)
          ) : (
            <p className="pt-3 text-[var(--color-neutral-600,#856c51)]" style={{ ...bodyFont, fontSize: '13px' }}>
              No proposals — a board holding a piece you don’t own saves here, and becomes a look the day you buy it.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
