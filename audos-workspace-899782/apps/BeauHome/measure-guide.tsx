/**
 * How-to-measure guide (Pass Twelve) — a clean, scannable popup opened from
 * the onboarding measurements step (and Your Style's Body section) that walks
 * through taking each measurement, with a cm / in toggle for every number.
 */
import { useState } from 'react';
import { HelpCircle, Ruler, X } from 'lucide-react';
import { tw, typography } from '../../lib/colors';

interface GuideStep {
  title: string;
  how: string;
  /** Typical range in cm [min, max] — rendered in the active unit. */
  typicalCm?: [number, number];
  tip?: string;
}

const STEPS: GuideStep[] = [
  {
    title: 'Chest',
    how: 'Wrap the tape around the fullest part of your chest, under the armpits and across the shoulder blades. Keep the tape level and snug — not tight — and breathe normally.',
    typicalCm: [92, 112],
    tip: 'Arms relaxed at your sides; ask someone to read the tape if you can.',
  },
  {
    title: 'Waist',
    how: 'Measure around your natural waist — the crease where you bend sideways, usually just above the belly button. Don’t suck in; the tape should sit comfortably.',
    typicalCm: [76, 100],
    tip: 'For trouser sizing, also measure where you actually wear your waistband.',
  },
  {
    title: 'Hips / seat',
    how: 'Stand with feet together and wrap the tape around the widest part of your seat, keeping it level all the way round.',
    typicalCm: [92, 112],
  },
  {
    title: 'Inseam',
    how: 'Measure from the top of your inner thigh (the crotch seam of well-fitting trousers) straight down to where you want the hem — usually the top of your shoe.',
    typicalCm: [74, 86],
    tip: 'Easiest done on a pair of trousers that already fit: lay them flat and measure the inner leg seam.',
  },
  {
    title: 'Shoulder width',
    how: 'Across the back, measure from the bony tip of one shoulder to the other — where a shirt’s shoulder seams should sit.',
    typicalCm: [42, 50],
    tip: 'Use a shirt that fits well: lay it flat and measure seam to seam.',
  },
];

const CM_PER_IN = 2.54;

function rangeLabel(cmRange: [number, number], unit: 'cm' | 'in'): string {
  if (unit === 'cm') return `${cmRange[0]}–${cmRange[1]} cm`;
  const toIn = (v: number) => Math.round((v / CM_PER_IN) * 2) / 2;
  return `${toIn(cmRange[0])}–${toIn(cmRange[1])} in`;
}

export function MeasureGuideModal({ onClose }: { onClose: () => void }) {
  const [unit, setUnit] = useState<'cm' | 'in'>('cm');

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="How to take your measurements"
    >
      <span className="absolute inset-0 bg-[var(--space-shell-shadow-strong)]" aria-hidden="true" />
      <div
        className="relative w-full sm:max-w-lg sm:mx-4 bg-[var(--space-surface-card)] rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-[var(--space-surface-card)] border-b border-[var(--space-border-default)] px-5 py-4 flex items-center gap-3">
          <Ruler className={`w-5 h-5 ${tw.icon.primary} flex-shrink-0`} />
          <div className="flex-1 min-w-0">
            <h3 className={`${typography.size.base} ${typography.weight.semibold} ${typography.color.primary}`}>
              How to measure
            </h3>
            <p className={`${typography.size.xs} ${typography.color.muted}`}>
              A soft tape measure over light clothing works best.
            </p>
          </div>
          {/* cm / in toggle — switches every number in the guide */}
          <div className="inline-flex rounded-lg border border-[var(--space-border-default)] overflow-hidden flex-shrink-0" role="group" aria-label="Units">
            {(['cm', 'in'] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnit(u)}
                aria-pressed={unit === u}
                className={`px-3 py-1.5 ${typography.size.xs} transition-colors ${
                  unit === u
                    ? 'bg-[var(--space-surface-accent-soft)] text-[var(--space-brand-primary-700)] font-medium ring-1 ring-inset ring-[var(--space-brand-primary)]'
                    : 'bg-[var(--space-surface-card)] text-[var(--space-text-secondary)] hover:bg-[var(--space-surface-muted)]'
                }`}
              >
                {u}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--space-surface-muted)] text-[var(--space-text-muted)] flex-shrink-0"
            aria-label="Close the guide"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <ol className="px-5 py-4 space-y-4">
          {STEPS.map((step, idx) => (
            <li key={step.title} className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-[var(--space-surface-accent-soft)] text-[var(--space-text-brand)] flex items-center justify-center flex-shrink-0 font-semibold" style={{ fontSize: 'max(var(--eth-label, 0px), 11px)' }}>
                {idx + 1}
              </span>
              <div className="min-w-0">
                <p className={`${typography.size.sm} ${typography.weight.semibold} ${typography.color.primary}`}>
                  {step.title}
                  {step.typicalCm && (
                    <span className={`${typography.size.xs} ${typography.color.muted} font-normal ml-2`}>
                      typically {rangeLabel(step.typicalCm, unit)}
                    </span>
                  )}
                </p>
                <p className={`${typography.size.xs} ${typography.color.secondary} mt-0.5 leading-relaxed`}>{step.how}</p>
                {step.tip && (
                  <p className={`${typography.size.xs} ${typography.color.muted} mt-1 italic`}>{step.tip}</p>
                )}
              </div>
            </li>
          ))}
        </ol>

        <div className="px-5 pb-5">
          <p className={`${typography.size.xs} ${typography.color.muted} rounded-xl bg-[var(--space-surface-muted)] px-3 py-2.5 leading-relaxed`}>
            Enter the numbers in whichever unit you measured — note “cm” or “in” with the value (e.g. “102 cm” or “40 in”)
            and Beau reads both. Everything stays editable later from Your Style.
          </p>
        </div>
      </div>
    </div>
  );
}

/** The “How to measure” entry point — owns its own modal state. */
export function HowToMeasureButton({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ${typography.size.xs} border border-[var(--space-border-default)] text-[var(--space-text-brand)] hover:border-[var(--space-border-strong)] transition-colors ${className}`}
      >
        <HelpCircle className="w-3.5 h-3.5" />
        How to measure
      </button>
      {open && <MeasureGuideModal onClose={() => setOpen(false)} />}
    </>
  );
}
