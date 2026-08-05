/**
 * BEAU'S ASSESSMENT — the Wardrobe tab's closing data section (the Beau
 * intelligence overhaul). It replaces the old hardcoded "Wardrobe
 * milestones" gauge (regex sub-type counting + static targets): wardrobe
 * standing is now judged by Beau's LIVE reasoning pass (beau-assessment.ts)
 * whose home is The Edit tab.
 *
 * This card is strictly READ-ONLY over the cached assessment — it NEVER
 * triggers a model call itself. It shows the verdict + the six-step
 * foundation ladder from Beau's last pass and routes to The Edit tab for
 * the full read (which is where a stale cache re-runs).
 */
import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { typography } from '../../lib/colors';
import { goToTab, type WardrobePiece } from './profile-data';
import { peekBeauAssessment, type BeauAssessment } from './beau-assessment';

export function BeauAssessmentSummary({ pieces }: { pieces: WardrobePiece[] }) {
  const [cached, setCached] = useState<{ assessment: BeauAssessment; generatedAt: number } | null>(() => peekBeauAssessment());

  // A finished assessment (the Beau tab, or the background auto-refresh
  // after logging) updates this card without a reload.
  useEffect(() => {
    const refresh = () => setCached(peekBeauAssessment());
    window.addEventListener('ethaion:assessment-updated', refresh);
    return () => window.removeEventListener('ethaion:assessment-updated', refresh);
  }, []);

  const assessment = cached?.assessment || null;

  return (
    <div>
      {/* Section heading — the same two-column ink-ruled header language as
          the rest of the Wardrobe tab's data sections. */}
      <div className="pb-3 border-b border-[var(--color-text,#3b2b1d)]">
        <h3 className={`hab-section-head ${typography.color.primary}`} style={{ marginBottom: '8px' }}>Beau’s assessment</h3>
        <p className={typography.color.primary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', lineHeight: 1.6, maxWidth: '62ch' }}>
          No fixed formulas — Beau reads your actual pieces against your style directions and judges where the
          wardrobe stands, in strict foundation order. His full read lives on The Edit tab.
        </p>
      </div>

      {!assessment && (
        <div className="py-7">
          <p className={typography.color.secondary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '15px', lineHeight: 1.6, maxWidth: '58ch' }}>
            {pieces.length === 0
              ? 'Log what you own above, then open The Edit — Beau\u2019ll take his first read of your wardrobe and tell you exactly what to build first.'
              : 'Beau hasn\u2019t taken his read of this wardrobe yet — open The Edit and he\u2019ll assess it piece by piece.'}
          </p>
          <button
            type="button"
            onClick={() => goToTab('beau')}
            className="mt-4 inline-flex items-center gap-1.5 group"
            style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', color: 'var(--color-accent,#a8712c)' }}
          >
            Open The Edit
            <span className="group-hover:translate-x-0.5 transition-transform" style={{ fontFamily: 'var(--space-font-heading)', fontSize: '17px', lineHeight: 1 }} aria-hidden="true">
              ›
            </span>
          </button>
        </div>
      )}

      {assessment && (
        <div className="py-6">
          {assessment.verdict && (
            <p className={typography.color.primary} style={{ fontFamily: 'var(--space-font-heading)', fontWeight: 400, fontSize: '21px', lineHeight: 1.4, maxWidth: '58ch' }}>
              {assessment.verdict}
            </p>
          )}

          {/* The foundation ladder, compact — one hairline row per step. */}
          {assessment.foundation.length > 0 && (
            <div className="mt-6 divide-y divide-[var(--space-border-default)] border-t border-b border-[var(--space-border-default)]">
              {assessment.foundation.map((s) => (
                <div key={s.step} className="py-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                  <span className={typography.color.primary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px' }}>
                    <span className="text-[var(--color-neutral-600,#856c51)]" style={{ fontFamily: 'var(--space-font-heading)', fontSize: '12px', letterSpacing: '0.12em', marginRight: '10px' }}>
                      {s.step}
                    </span>
                    {s.name}
                  </span>
                  {s.status === 'complete' ? (
                    <span className="inline-flex items-center gap-1 text-[var(--space-semantic-success)]" style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px' }}>
                      <Check className="w-3.5 h-3.5" aria-hidden="true" /> Covered
                    </span>
                  ) : s.status === 'current' ? (
                    <span className="uppercase text-[var(--color-accent-700,#7c4a17)]" style={{ fontFamily: 'var(--space-font-heading)', fontSize: '11px', letterSpacing: '0.12em' }}>
                      Current focus
                    </span>
                  ) : (
                    <span className="text-[var(--color-neutral-600,#856c51)]" style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px' }}>
                      Comes later
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => goToTab('beau')}
            className="mt-5 inline-flex items-center gap-1.5 group"
            style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', color: 'var(--color-accent,#a8712c)' }}
          >
            Open the full read in The Edit
            <span className="group-hover:translate-x-0.5 transition-transform" style={{ fontFamily: 'var(--space-font-heading)', fontSize: '17px', lineHeight: 1 }} aria-hidden="true">
              ›
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
