/**
 * COMPLETE THE LOOK — the outfit-slot section below the coverage map on
 * The Edit tab (Milestones overhaul, Part 3d).
 *
 * An occasion selector on top (Casual Friday / Business Meeting / Weekend /
 * Evening); below it a slot grid in the app's canonical menswear order —
 * top · outerwear · bottom · shoes · accessory (category-order.ts). Each slot shows either a piece the user OWNS that suits the
 * occasion's register (solid box, his own label) or a GAP — a dashed box
 * carrying nothing but its category label and a "Gap ›" mark in oxblood.
 * The reason empty slots matter is stated ONCE above the grid rather than
 * repeated in every empty box. Below the grid, what Beau recommends for the
 * gaps he has a read on — pulled from the CACHED Layer 2 assessment, never a
 * fresh AI call. Same Layer 1 semantic data as the coverage map above it.
 *
 * Visual language: ticket-frame card, solid boxes for owned, dashed boxes
 * for gaps, hairline borders — palette and fonts unchanged.
 */
import { useEffect, useMemo, useState } from 'react';
import { typography } from '../../lib/colors';
import { type WardrobePiece } from './profile-data';
import { fetchSemanticTags, type SemanticTags } from './semantic-tags';
import { type BeauAssessment } from './beau-assessment';
import { gapLabel, registerOf, rowFor, type RegisterId } from './coverage-map';
import { TicketFrame, dashedBoxStyle, solidBoxStyle } from './ticket-frame';
import { sortByCategoryOrder } from './category-order';

const OCCASIONS: Array<{ id: string; label: string; registers: RegisterId[] }> = [
  { id: 'casual-friday', label: 'Casual Friday', registers: ['smart-casual', 'casual'] },
  { id: 'business-meeting', label: 'Business meeting', registers: ['formal', 'smart-casual'] },
  { id: 'weekend', label: 'Weekend', registers: ['casual'] },
  { id: 'evening', label: 'Evening', registers: ['smart-casual', 'formal'] },
];

/** The outfit slots, handed out in the app's ONE canonical menswear order
 * (worn garments first, then shoes, then accessories) rather than a
 * hand-written sequence — the same order The Ledger, The Rail and the
 * coverage map above this section run in. */
const SLOTS: Array<{ id: string; label: string; row: string }> = sortByCategoryOrder(
  [
    { id: 'top', label: 'Top', row: 'Tops' },
    { id: 'bottom', label: 'Bottom', row: 'Bottoms' },
    { id: 'shoes', label: 'Shoes', row: 'Shoes' },
    { id: 'outerwear', label: 'Outerwear', row: 'Outerwear' },
    { id: 'accessory', label: 'Accessory', row: 'Accessories' },
  ],
  (slot) => slot.row,
);

const REGISTER_LABEL: Record<RegisterId, string> = {
  casual: 'Casual',
  'smart-casual': 'Smart-Casual',
  formal: 'Formal',
};

/** The cached-assessment recommendation that best fills a slot's row. */
function recommendationFor(assessment: BeauAssessment | null, row: string): { pieceName: string; whyNow: string } | null {
  if (!assessment) return null;
  const rowKey = row.toLowerCase().replace(/ies$/, 'y'); // "Accessories" matches "accessory" too
  for (const rec of assessment.recommendations) {
    const cat = `${rec.category} ${rec.subType}`.toLowerCase();
    if (cat.includes(row.toLowerCase().slice(0, 5)) || cat.includes(rowKey.slice(0, 5))) {
      return { pieceName: rec.pieceName, whyNow: rec.whyNow };
    }
  }
  return null;
}

export function CompleteTheLook({
  pieces,
  assessment,
}: {
  pieces: WardrobePiece[];
  /** The CACHED Layer 2 assessment — gap explanations come from here. */
  assessment: BeauAssessment | null;
}) {
  const [tags, setTags] = useState<Record<number, SemanticTags>>({});
  const [occasionId, setOccasionId] = useState<string>(OCCASIONS[0].id);

  useEffect(() => {
    let live = true;
    const load = () => {
      void fetchSemanticTags().then((next) => {
        if (live) setTags(next);
      });
    };
    load();
    window.addEventListener('ethaion:semantics-updated', load);
    return () => {
      live = false;
      window.removeEventListener('ethaion:semantics-updated', load);
    };
  }, [pieces.length]);

  const occasion = OCCASIONS.find((o) => o.id === occasionId) || OCCASIONS[0];

  const slotReads = useMemo(() => {
    return SLOTS.map((slot) => {
      // Scan the occasion's registers in preference order; the first owned
      // piece that suits fills the slot.
      for (const reg of occasion.registers) {
        const match = pieces.find((p) => rowFor(p, tags[p.id]) === slot.row && registerOf(p, tags[p.id]) === reg);
        if (match) return { slot, piece: match, register: reg as RegisterId, gap: false as const };
      }
      return { slot, piece: null, register: occasion.registers[0], gap: true as const };
    });
  }, [pieces, tags, occasion]);

  // One line per gap Beau actually has a recommendation for — no repeated
  // boilerplate for the ones he doesn't.
  const gapAdvice = useMemo(
    () =>
      slotReads
        .filter((s) => s.gap)
        .map(({ slot }) => ({ slot, rec: recommendationFor(assessment, slot.row) }))
        .filter((entry): entry is { slot: (typeof SLOTS)[number]; rec: { pieceName: string; whyNow: string } } => !!entry.rec),
    [slotReads, assessment],
  );

  if (pieces.length === 0) return null;

  return (
    <section aria-label="Complete the look" className="mt-10">
      <div className="pb-3 border-b border-[var(--color-text,#3b2b1d)]">
        <h3 className={`hab-section-head ${typography.color.primary}`} style={{ marginBottom: '6px' }}>Complete the look</h3>
        <p className={typography.color.primary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', lineHeight: 1.6, maxWidth: '62ch' }}>
          Pick an occasion and Beau assembles the outfit from what you own — every empty slot is a real gap, with
          his read on what should fill it and why.
        </p>
      </div>

      {/* Occasion selector */}
      <div className="flex flex-wrap mt-5" role="group" aria-label="Occasion">
        {OCCASIONS.map((o, i) => {
          const active = o.id === occasionId;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => setOccasionId(o.id)}
              aria-pressed={active}
              className={`uppercase min-h-[44px] px-4 grid place-items-center whitespace-nowrap transition-colors ${
                active
                  ? 'border border-[var(--color-accent,#a8712c)] bg-[var(--color-accent-100,#fbf1de)] text-[var(--color-accent-800,#5c3413)]'
                  : 'border border-[var(--color-divider,rgba(59,43,29,0.18))] text-[var(--color-neutral-700,#634e38)] hover:text-[var(--space-text-primary)]'
              } ${i > 0 ? 'border-l-0' : ''}`}
              style={{ fontFamily: 'var(--space-font-heading)', fontSize: '11px', letterSpacing: '0.12em' }}
            >
              {o.label}
            </button>
          );
        })}
      </div>

      {/* The outfit slot grid — owned pieces in solid boxes, gaps in broken
          boxes. The gap context is said ONCE above the grid; each empty slot
          carries only its category label and a "Gap ›" mark. */}
      <TicketFrame className="mt-5" padding="18px">
        {slotReads.some((s) => s.gap) && (
          <p
            className="text-[var(--color-neutral-600,#856c51)]"
            style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px', lineHeight: 1.5, marginBottom: '12px' }}
          >
            An open slot is a real gap — exactly the hole Beau would close next.
          </p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {slotReads.map(({ slot, piece, register, gap }) => (
            <div key={slot.id} className="min-w-0">
              <p
                className="uppercase text-[var(--color-neutral-600,#856c51)]"
                style={{ fontFamily: 'var(--space-font-heading)', fontSize: '10px', letterSpacing: '0.14em', marginBottom: '6px' }}
              >
                {slot.label}
              </p>
              {!gap && piece ? (
                <div style={{ ...solidBoxStyle, padding: '10px 12px', minHeight: '78px' }}>
                  <p className={typography.color.primary} style={{ fontFamily: 'var(--space-font-heading)', fontSize: '15px', fontWeight: 400, lineHeight: 1.25 }}>
                    {piece.name}
                  </p>
                  <p className="text-[var(--color-neutral-600,#856c51)]" style={{ fontFamily: 'var(--space-font-family)', fontSize: '11px', marginTop: '4px' }}>
                    {REGISTER_LABEL[register]}
                  </p>
                </div>
              ) : (
                <div
                  className="block w-full text-left"
                  style={{ ...dashedBoxStyle, padding: '10px 12px', minHeight: '78px', background: 'transparent' }}
                  title={gapLabel(slot.row, register)}
                >
                  {/* THE GAP IS NAMED (6a) — never a bare “Gap ›”. */}
                  <span
                    className="block"
                    style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px', lineHeight: 1.4, color: 'var(--color-neutral-700,#634e38)' }}
                  >
                    {gapLabel(slot.row, register)}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Gap advice — what Beau recommends and why, from the cached
            reasoning pass. Only gaps he has a real recommendation for get a
            line; the generic "nothing owned" context is said once above. */}
        {gapAdvice.length > 0 && (
          <div className="mt-5 pt-4" style={{ borderTop: '1px solid var(--color-divider,rgba(59,43,29,0.18))' }}>
            {gapAdvice.map(({ slot, rec }) => (
              <p key={slot.id} className={typography.color.secondary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', lineHeight: 1.6, maxWidth: '62ch', marginTop: '6px' }}>
                <span className="uppercase text-[var(--color-accent-700,#7c4a17)]" style={{ fontFamily: 'var(--space-font-heading)', fontSize: '10px', letterSpacing: '0.14em', marginRight: '8px' }}>
                  {slot.label}
                </span>
                {`Beau recommends ${rec.pieceName.toLowerCase().startsWith('a ') || rec.pieceName.toLowerCase().startsWith('an ') ? rec.pieceName : `a ${rec.pieceName}`}${rec.whyNow ? ` — ${rec.whyNow.charAt(0).toLowerCase()}${rec.whyNow.slice(1)}` : '.'}`}
              </p>
            ))}
          </div>
        )}
      </TicketFrame>

      <p className={`${typography.size.xs} ${typography.color.muted} mt-3`} style={{ fontSize: '10px' }}>
        Assembled from the same semantic read as the coverage map and Beau’s cached assessment — no extra thinking
        spent. Gap advice comes from his last reasoning pass; Re-assess above refreshes it.
      </p>
    </section>
  );
}
