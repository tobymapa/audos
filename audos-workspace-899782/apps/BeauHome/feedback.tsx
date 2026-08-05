/**
 * Purchase close-the-loop — the short Beau prompt that appears the moment a
 * Radar piece is marked "I own it now".
 *
 * Two-tap rating (Loved it / It was fine / Disappointed) plus optional free
 * text. The response is stored per piece (purchase_feedback) so the wardrobe
 * detail can show "You rated this…", and folded into the rubric notes so
 * future recommendations learn from real outcomes.
 */
import { useState } from 'react';
import { Check, Heart, Loader2, X } from 'lucide-react';
import { tw, typography } from '../../lib/colors';
import {
  FEEDBACK_RATINGS,
  feedbackRatingMeta,
  savePurchaseFeedback,
  type PurchaseFeedback,
  type WardrobePiece,
} from './profile-data';

/**
 * The prompt card. Render it right after a radarToWardrobe move, passing the
 * freshly created wardrobe piece. Dismissible — feedback is never forced.
 */
export function PurchaseFeedbackPrompt({
  piece,
  onDone,
}: {
  piece: WardrobePiece;
  onDone: () => void;
}) {
  const [rating, setRating] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const submit = async (chosen: string) => {
    if (saving) return;
    setRating(chosen);
    setSaving(true);
    try {
      await savePurchaseFeedback(piece, chosen, comment.trim() || null);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const saveComment = async () => {
    if (!rating || saving) return;
    setSaving(true);
    try {
      await savePurchaseFeedback(piece, rating, comment.trim() || null);
      setSaved(true);
      setTimeout(onDone, 900);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--space-brand-primary-200)] bg-[var(--space-surface-accent-soft)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Heart className="w-4 h-4 text-[var(--space-text-brand)] flex-shrink-0" />
          <p className={`${typography.size.sm} ${typography.weight.semibold} ${typography.color.primary}`}>
            You got the {piece.name} — how was it?
          </p>
        </div>
        <button
          type="button"
          onClick={onDone}
          className={`p-1 rounded-lg ${tw.button.ghost} flex-shrink-0`}
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className={`${typography.size.xs} ${typography.color.secondary} mt-0.5`}>
        Quality what you expected? Fit right? Two taps — it sharpens every future recommendation.
      </p>

      <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
        {FEEDBACK_RATINGS.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => void submit(r.id)}
            disabled={saving}
            aria-pressed={rating === r.id}
            className={`px-3 py-1.5 rounded-full border ${typography.size.xs} transition-colors disabled:opacity-60 ${
              rating === r.id
                ? 'bg-[var(--space-surface-accent-soft)] text-[var(--space-brand-primary-700)] border-[var(--space-brand-primary)]'
                : 'bg-[var(--space-surface-card)] border-[var(--space-border-default)] text-[var(--space-text-secondary)] hover:border-[var(--space-border-strong)]'
            }`}
          >
            {r.label}
          </button>
        ))}
        {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--space-text-muted)]" />}
        {saved && !saving && (
          <span className={`${typography.size.xs} text-[var(--space-semantic-success)] inline-flex items-center gap-1`}>
            <Check className="w-3 h-3" /> Noted — Beau will remember
          </span>
        )}
      </div>

      {rating && (
        <div className="flex gap-2 mt-2.5">
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveComment();
            }}
            placeholder="Anything specific? e.g. runs slim — sized up and it's perfect"
            className={`${tw.input.base} ${tw.input.default} ${typography.size.xs} flex-1`}
            aria-label="Optional feedback note"
          />
          <button
            type="button"
            onClick={() => void saveComment()}
            disabled={saving}
            className={`px-3 py-1.5 rounded-lg ${typography.size.xs} ${tw.button.primary} disabled:opacity-50`}
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}

/** "You rated this" line for the wardrobe item detail views. */
export function FeedbackNote({ feedback }: { feedback: PurchaseFeedback | undefined }) {
  if (!feedback) return null;
  const meta = feedbackRatingMeta(feedback.rating);
  if (!meta) return null;
  return (
    <p className={`${typography.size.xs} ${typography.color.secondary} rounded-lg bg-[var(--space-surface-muted)] px-2.5 py-1.5 inline-flex items-start gap-1.5`}>
      <Heart className="w-3 h-3 mt-0.5 flex-shrink-0 text-[var(--space-text-brand)]" />
      <span>
        You rated this: <span className={typography.weight.medium}>{meta.label}</span> — {meta.line}
        {feedback.comment ? <> · “{feedback.comment}”</> : null}
      </span>
    </p>
  );
}
