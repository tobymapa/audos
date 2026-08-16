/**
 * TRIP BRIEF FORM (Milestones overhaul, Parts 7 & 10).
 *
 * The Ledger's Beau · Trip entry is now a PLAIN HAIRLINE ROW ("Plan for a
 * trip") — dark cards are reserved for Beau-initiated, TIME-SENSITIVE
 * prompts (Beau · Today only); user-initiated / contextual actions are
 * hairline rows. Tapping the row routes straight to The Fitting in Trip
 * mode, and THIS short form renders there on the light board ground —
 * destination, dates, occasion mix — until the brief is submitted. Then
 * Beau composes one board per day plus the packing list.
 *
 * (This file used to hold the old dark "Beau · Trip" card; the form moved
 * into The Fitting and the dark treatment was retired per the visual rule.)
 */
import { useState } from 'react';
import { tw, typography } from '../../lib/colors';
import type { TripBrief } from './fitting-room-state';

export function TripBriefForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (brief: TripBrief) => void;
  onCancel: () => void;
}) {
  const [destination, setDestination] = useState('');
  const [dates, setDates] = useState('');
  const [occasions, setOccasions] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!destination.trim()) {
      setError('Where are you headed? Type a destination.');
      return;
    }
    setError(null);
    onSubmit({
      destination: destination.trim(),
      dates: dates.trim(),
      occasions: occasions.trim(),
    });
  };

  return (
    <div className="px-6 sm:px-10 py-8">
      <div className="max-w-[560px] mx-auto">
        <p
          className="uppercase text-[var(--color-neutral-600,#856c51)]"
          style={{ fontFamily: 'var(--space-font-heading)', fontSize: 'max(var(--eth-serif, 0px), 11px)', letterSpacing: '0.16em', marginBottom: '6px' }}
        >
          The Fitting · trip
        </p>
        <h3
          className={typography.color.primary}
          style={{ fontFamily: 'var(--space-font-heading)', fontWeight: 400, fontSize: '26px', lineHeight: 1.15 }}
        >
          Plan for a trip
        </h3>
        <p
          className="mt-2 text-[var(--color-neutral-700,#634e38)]"
          style={{ fontFamily: 'var(--space-font-family)', fontSize: 'max(var(--eth-body, 0px), 14px)', lineHeight: 1.55, maxWidth: '52ch' }}
        >
          Destination, dates and the occasion mix — Beau builds one board per day from your own wardrobe, with a
          packing list underneath, and flags anything missing.
        </p>

        <div className="grid sm:grid-cols-2 gap-2.5 mt-5">
          <label className={`${typography.size.xs} ${typography.color.muted}`}>Destination
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="e.g. Lisbon"
              className={`${tw.input.base} ${tw.input.default} ${typography.size.sm} mt-1`}
              aria-label="Trip destination"
            />
          </label>
          <label className={`${typography.size.xs} ${typography.color.muted}`}>Dates
            <input
              type="text"
              value={dates}
              onChange={(e) => setDates(e.target.value)}
              placeholder='e.g. "3 days" or "12–15 Sep"'
              className={`${tw.input.base} ${tw.input.default} ${typography.size.sm} mt-1`}
              aria-label="Trip dates"
            />
          </label>
        </div>
        <label className={`block ${typography.size.xs} ${typography.color.muted} mt-2.5`}>Occasion mix
          <input
            type="text"
            value={occasions}
            onChange={(e) => setOccasions(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            placeholder='e.g. "mostly casual, one dinner out"'
            className={`${tw.input.base} ${tw.input.default} ${typography.size.sm} mt-1`}
            aria-label="Occasion mix"
          />
        </label>

        <div className="flex items-center gap-3 mt-5 flex-wrap">
          <button
            type="button"
            onClick={submit}
            className={`px-4 min-h-[44px] rounded text-[14px] inline-flex items-center gap-1.5 ${tw.button.primary}`}
          >
            Build my trip boards
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] px-2 hover:underline text-[var(--color-neutral-600,#856c51)]"
            style={{ fontFamily: 'var(--space-font-family)', fontSize: 'max(var(--eth-body, 0px), 13px)' }}
          >
            Not now
          </button>
        </div>
        {error && <p className={`${typography.size.xs} text-[var(--space-semantic-warning)] mt-2`}>{error}</p>}
      </div>
    </div>
  );
}

export default TripBriefForm;
