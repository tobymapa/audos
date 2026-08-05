import { useEffect, useMemo, useState } from 'react';
import { BellRing, Check, Info, Loader2, Sparkles } from 'lucide-react';
import { tw, typography } from '../../lib/colors';
import {
  careInstructions,
  careReminderSuggestion,
  completeCareReminder,
  fabricExplanation,
  fetchCareReminder,
  saveCareReminder,
  type CareReminder,
  type WardrobePiece,
} from './profile-data';

export function FabricLabel({ material, className = '' }: { material: string; className?: string }) {
  const explanation = fabricExplanation(material);
  if (!material) return null;
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span>{material}</span>
      {explanation && (
        <span className="group relative inline-flex">
          <Info className="w-3 h-3 text-[var(--space-text-muted)]" aria-label={`${material}: ${explanation}`} />
          <span className="pointer-events-none absolute left-1/2 bottom-full z-40 mb-2 hidden w-56 -translate-x-1/2 rounded-xl border border-[var(--space-border-default)] bg-[var(--space-surface-card)] px-3 py-2 text-left text-[11px] font-normal leading-relaxed text-[var(--space-text-secondary)] shadow-lg group-hover:block group-focus-within:block">
            {explanation}
          </span>
        </span>
      )}
    </span>
  );
}

const FREQUENCIES = [
  { days: 30, label: 'Every month' },
  { days: 42, label: 'Every 6 weeks' },
  { days: 60, label: 'Every 2 months' },
  { days: 90, label: 'Every season' },
  { days: 180, label: 'Every 6 months' },
];

export function CarePanel({ piece, material }: { piece: WardrobePiece; material: string }) {
  const instructions = useMemo(() => careInstructions(piece, material), [piece.category, piece.slot, material]);
  const suggestion = useMemo(() => careReminderSuggestion(piece, material), [piece.category, piece.slot, material]);
  const [reminder, setReminder] = useState<CareReminder | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [frequency, setFrequency] = useState(suggestion.days);
  const [text, setText] = useState(suggestion.text);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchCareReminder(piece.id)
      .then((row) => {
        if (cancelled) return;
        setReminder(row);
        setEnabled(row?.enabled ?? false);
        setFrequency(row?.frequency_days || suggestion.days);
        setText(row?.reminder_text || suggestion.text);
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [piece.id]);

  const persist = async (nextEnabled = enabled) => {
    if (saving) return;
    setSaving(true);
    try {
      const fresh = await saveCareReminder(piece, material, nextEnabled, frequency, text);
      setReminder(fresh);
      setEnabled(fresh?.enabled ?? nextEnabled);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--space-border-default)] bg-[var(--space-surface-muted)] p-4 space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[var(--space-text-brand)]" />
          <h4 className={`${typography.size.sm} ${typography.weight.semibold} ${typography.color.primary}`}>Care instructions</h4>
        </div>
        <ul className="mt-2 space-y-1.5">
          {instructions.map((line) => (
            <li key={line} className={`${typography.size.xs} ${typography.color.secondary} flex items-start gap-2 leading-relaxed`}>
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--space-brand-primary)] flex-shrink-0" />
              {line}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[10px] text-[var(--space-text-muted)]">Based on {material || 'this garment category'}; the maker’s label takes precedence.</p>
      </div>

      <div className="border-t border-[var(--space-border-default)] pt-3">
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <span className="flex items-center gap-2">
            <BellRing className="w-4 h-4 text-[var(--space-text-brand)]" />
            <span>
              <span className={`block ${typography.size.sm} ${typography.weight.semibold} ${typography.color.primary}`}>Recurring care reminder</span>
              <span className={`block ${typography.size.xs} ${typography.color.muted}`}>Shown in Ethaion when it is due.</span>
            </span>
          </span>
          <input
            type="checkbox"
            checked={enabled}
            disabled={loading || saving}
            onChange={(e) => {
              const next = e.target.checked;
              setEnabled(next);
              void persist(next);
            }}
            className="h-4 w-4 rounded accent-[var(--space-brand-primary)]"
          />
        </label>

        {enabled && (
          <div className="mt-3 grid sm:grid-cols-[1fr_auto] gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-label="Care reminder text"
              className={`${tw.input.base} ${tw.input.default} ${typography.size.xs}`}
            />
            <select
              value={frequency}
              onChange={(e) => setFrequency(Number(e.target.value))}
              aria-label="Care reminder frequency"
              className="rounded-lg border border-[var(--space-border-default)] bg-[var(--space-surface-card)] px-3 py-2 text-xs text-[var(--space-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--space-brand-primary)]"
            >
              {FREQUENCIES.map((option) => <option key={option.days} value={option.days}>{option.label}</option>)}
            </select>
            <div className="sm:col-span-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void persist(true)}
                disabled={saving}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 ${typography.size.xs} ${tw.button.secondary} disabled:opacity-50`}
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Save reminder
              </button>
              {saved && <span className="text-xs text-[var(--space-semantic-success)]">Saved</span>}
              {reminder?.next_due_at && (
                <span className={`${typography.size.xs} ${typography.color.muted}`}>
                  Next: {new Date(reminder.next_due_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function CareReminderBanner({ pieces }: { pieces: WardrobePiece[] }) {
  const { data, refresh } = window.useWorkspaceDB<CareReminder>('care_reminders', {
    orderBy: { column: 'next_due_at', direction: 'asc' },
    limit: 100,
  });
  const now = Date.now();
  const due = (data || []).filter((row) => row.enabled && new Date(row.next_due_at).getTime() <= now);
  if (due.length === 0) return null;

  return (
    <div className="rounded-2xl border border-[var(--space-brand-primary-200)] bg-[var(--space-surface-accent-soft)] p-4">
      <div className="flex items-center gap-2">
        <BellRing className="w-4 h-4 text-[var(--space-text-brand)]" />
        <h3 className={`${typography.size.base} ${typography.weight.semibold} ${typography.color.primary}`}>Care due</h3>
      </div>
      <div className="mt-2 space-y-2">
        {due.map((row) => {
          const piece = pieces.find((p) => p.id === Number(row.piece_id));
          return (
            <div key={row.id} className="flex items-center justify-between gap-3 rounded-xl bg-[var(--space-surface-card)] px-3 py-2">
              <div className="min-w-0">
                <p className={`${typography.size.sm} ${typography.weight.medium} ${typography.color.primary} truncate`}>{piece?.name || 'Wardrobe piece'}</p>
                <p className={`${typography.size.xs} ${typography.color.muted}`}>{row.reminder_text}</p>
              </div>
              <button
                type="button"
                onClick={() => void completeCareReminder(row).then(refresh)}
                className={`flex-shrink-0 inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 ${typography.size.xs} ${tw.button.secondary}`}
              >
                <Check className="w-3 h-3" /> Done
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
