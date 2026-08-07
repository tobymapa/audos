/**
 * Clear wardrobe (Pass Twenty-Seven) — the ONE shared destructive control,
 * rendered on BOTH the Wardrobe tab and The Rail tab. A quiet text button
 * that opens a confirmation dialog; on confirm it permanently deletes every
 * wardrobe piece (plus companion rows via deletePiece) and both views return
 * to their empty states. Nothing is deleted until "Delete All" is tapped.
 */
import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { tw, typography } from '../../lib/colors';
import { deletePiece, type WardrobePiece } from './profile-data';

export function ClearWardrobeCard({ pieces, onCleared }: { pieces: WardrobePiece[]; onCleared: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (pieces.length === 0) return null;

  const clearAll = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // Deletes run a few at a time rather than strictly one after another.
      // Clearing a 40-piece wardrobe was 40 sequential round-trips (each of
      // which then cleaned ten companion tables serially), which is why the
      // button appeared to hang. The pool is kept small so a large wardrobe
      // cannot flood the platform.
      const queue = [...pieces];
      await Promise.all(
        new Array(Math.min(4, queue.length)).fill(null).map(async () => {
          for (;;) {
            const piece = queue.shift();
            if (!piece) return;
            try {
              await deletePiece(piece.id);
            } catch (error) {
              console.warn('[Ethaion] clear wardrobe: could not remove one piece:', piece.name, error);
            }
          }
        }),
      );
      // The pipeline's normalization stamps are keyed by piece id but live
      // outside deletePiece's cleanup list — clear them so a rebuilt wardrobe
      // starts fresh.
      try {
        const { data } = await (window as any).__workspaceDb.from('piece_photo_norm').limit(200).get();
        await Promise.all(
          (data || []).map((row: any) => (window as any).__workspaceDb.from('piece_photo_norm').delete(row.id)),
        );
      } catch { /* non-fatal companion cleanup */ }
      setConfirming(false);
      onCleared();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex justify-end">
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={`inline-flex items-center gap-1.5 ${typography.size.xs} ${typography.color.muted} hover:text-[var(--space-semantic-danger)] hover:underline transition-colors`}
        title="Permanently delete every wardrobe item"
      >
        <Trash2 className="w-3.5 h-3.5" /> Clear wardrobe
      </button>

      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label="Clear wardrobe confirmation"
          onClick={() => {
            if (!busy) setConfirming(false);
          }}
        >
          <span className="absolute inset-0 bg-[var(--space-shell-shadow-strong)]" aria-hidden="true" />
          <div
            className="relative w-full max-w-sm mx-4 bg-[var(--space-surface-card)] rounded-2xl p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className={`${typography.size.base} ${typography.weight.semibold} ${typography.color.primary}`}>
              Clear your wardrobe?
            </h4>
            <p className={`${typography.size.sm} ${typography.color.secondary} mt-2 leading-relaxed`}>
              This will permanently delete all your wardrobe items. This cannot be undone. Are you sure?
            </p>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy}
                className={`px-3.5 py-2 rounded-lg ${typography.size.sm} ${tw.button.ghost} border border-[var(--space-border-default)] disabled:opacity-50`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void clearAll()}
                disabled={busy}
                className={`px-3.5 py-2 rounded-lg ${typography.size.sm} ${tw.button.danger} inline-flex items-center gap-1.5 disabled:opacity-50`}
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
