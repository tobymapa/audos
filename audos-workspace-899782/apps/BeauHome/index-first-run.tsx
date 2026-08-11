/**
 * THE INDEX · FIRST RUN (29e · new) — the Index before it knows anything:
 * the page most readers see first, and the proof of the abstention rule.
 * Every generated slot has no wardrobe to reason from, so all of them
 * abstain and their elements are removed — this page is what remains.
 *
 *  · The owned column renders as EM DASHES, never zeros: zero is a claim
 *    about the reader; an em dash says the Index hasn't asked yet.
 *  · Nothing is gated — both buttons lead somewhere real. The questions
 *    buy the second column, not entry.
 *  · G12 is the ONE slot allowed a fallback string, because here the model
 *    has nothing to reason from.
 */
import { GenSlot, OutlinedControl, FAINT, FAINTER, HAIRLINE, INK, SECONDARY, WALNUT, body, mono, serif, type IndexNav } from './index-chrome';
import { type IndexModel } from './index-model';
import { usePlexMono } from './mono-type';

const G12_FALLBACK =
  'The Index works without you. Every count below is true of clothing rather than of a person, and you can read the whole taxonomy, every maker and every temperature band without answering a single question. What you cannot see yet is the second column — which of these you own, which bands you have covered twice, and which of your days are met by nothing at all.';

const ANSWERS: Array<{ q: string; screens: string; note: string }> = [
  { q: 'Your city', screens: 'the ruler · the field', note: 'Turns the eight bands from a scale into a year: how many days each one actually is. Without it the ruler can rank but not weigh.' },
  { q: 'Your registers', screens: 'the field', note: 'Draws the field\u2019s six rows and mutes the ones you don\u2019t live in. This is the answer that stops the Index recommending a dinner jacket.' },
  { q: 'Skin tone', screens: 'every type page', note: 'Reorders the colour field on every type page. The colour set is fixed; only the ranking moves.' },
  { q: 'What you own', screens: 'all seven fields', note: 'The second column everywhere, and the only answer that unlocks a verdict. Ten pieces is enough; you can add them one at a time forever.' },
];

export function IndexFirstRun({ model, nav, onReadAnyway }: { model: IndexModel; nav: IndexNav; onReadAnyway: () => void }) {
  usePlexMono();
  return (
    <div>
      <div style={{ paddingBottom: '20px', borderBottom: `1px solid ${INK}` }}>
        <div style={mono(8.5, FAINT)}>Nothing on record</div>
        <h3 style={{ ...serif(0), fontSize: 'clamp(28px, 3.8vw, 40px)', lineHeight: 1.1, margin: '8px 0 0', maxWidth: '22ch' }}>
          {model.typeTotal} types, and none of them yours yet
        </h3>
        {/* GEN · G12 — the one slot with a fallback string; no other has one. */}
        <GenSlot slot="G12" scope="first-run" fallback={G12_FALLBACK} style={{ margin: '14px 0 0', maxWidth: '68ch' }} />
        <div className="flex flex-wrap" style={{ gap: '10px 14px', marginTop: '18px' }}>
          <OutlinedControl onClick={() => window.dispatchEvent(new CustomEvent('ethaion:open-dossier'))}>Answer four questions →</OutlinedControl>
          <OutlinedControl onClick={onReadAnyway}>Read it anyway →</OutlinedControl>
        </div>
        <div style={{ ...mono(8, FAINT), marginTop: '10px' }}>City, registers, skin tone, and what you already own. All four have defaults.</div>
      </div>

      {/* ——— the taxonomy, fully readable now — second column WITHHELD */}
      <div style={{ marginTop: '22px' }}>
        <div className="flex items-baseline" style={{ gap: '14px' }}>
          <span style={serif(19)}>The taxonomy, fully readable now</span>
          <span style={mono(8, FAINT)}>second column withheld, not empty</span>
        </div>
        <div style={{ marginTop: '10px', maxWidth: '520px' }}>
          {model.categories.map((cat) => (
            <div key={cat.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline" style={{ gap: '18px', padding: '7px 0', borderBottom: `1px solid rgba(59,43,29,0.12)` }}>
              <button type="button" onClick={() => { onReadAnyway(); nav.goPlate(cat.id); }} className="hover:underline text-left" style={{ background: 'transparent', padding: 0, fontFamily: 'var(--space-font-heading)', fontSize: '15px', color: WALNUT }}>
                {cat.name}
              </button>
              <span style={{ ...mono(9, WALNUT), textAlign: 'right' }}>{cat.total}</span>
              <span style={{ ...mono(9, FAINTER), width: '20px', textAlign: 'right' }}>—</span>
            </div>
          ))}
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline" style={{ gap: '18px', padding: '9px 0' }}>
            <span style={mono(8.5, SECONDARY)}>{model.categories.length} categories</span>
            <span style={{ ...mono(9, WALNUT), textAlign: 'right' }}>{model.typeTotal}</span>
            <span style={{ ...mono(9, FAINTER), width: '20px', textAlign: 'right' }}>—</span>
          </div>
        </div>
      </div>

      {/* ——— what each answer switches on */}
      <div style={{ marginTop: '26px', paddingTop: '18px', borderTop: `1px solid ${HAIRLINE}` }}>
        <div style={serif(19)}>What each answer switches on</div>
        <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: '16px 40px', marginTop: '12px' }}>
          {ANSWERS.map((a) => (
            <div key={a.q}>
              <div className="flex items-baseline" style={{ gap: '10px' }}>
                <span style={{ ...mono(8.5, WALNUT) }}>{a.q}</span>
                <span style={mono(7.5, FAINT)}>{a.screens}</span>
              </div>
              <p style={{ ...body(13, SECONDARY), margin: '6px 0 0' }}>{a.note}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
