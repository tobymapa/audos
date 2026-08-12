/**
 * THE FIRST-RUN TOUR — a coach-mark walkthrough of the app's main areas,
 * shown ONCE automatically on a customer's first load (after Beau's intake
 * wizard) and re-triggerable any time from the small "?" button in the
 * bottom-left corner of the shell (bottom-right is the photo-migration
 * pill's spot).
 *
 * Six stops, in the order a new customer meets the product — the
 * primary tabs AND their key sub-tabs / sections:
 *   The Ledger · its categories
 *   The Fitting · the board's actions · the Board section
 *   The Hunt — where Beau's recommendations and the comparison bench live
 *
 * Each stop is a tooltip card anchored to a `data-tour="…"` element (the
 * tab bar's buttons, plus elements inside the tabs). A stop whose anchor
 * lives INSIDE a tab first navigates there — dispatching the same
 * `ethaion:navigate` events chat deep links use —
 * so the element exists before it is measured. The highlighted element
 * gets a subtle oxblood ring and the rest of the page dims lightly behind
 * it; when an anchor isn't on screen the card centres instead — the tour
 * never breaks on a missing element. The "?" re-trigger replays the FULL
 * extended walkthrough, sub-tab stops included.
 *
 * The auto-show is gated behind localStorage `ethaion_onboarding_done`: once
 * dismissed (skip or finish alike) it never auto-shows again. The "?" button
 * stays, quietly, in the corner.
 *
 * Palette (Ethaion): #241a12 walnut · #F5F0E6 ground · #FBF8F1 card ·
 * #EDE8DF darker beige · #D9CFBE line · #8A7F70 muted · #8B3A3A oxblood.
 */
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

export const ONBOARDING_DONE_KEY = 'ethaion_onboarding_done';

interface TourStep {
  /** The data-tour attribute value of the element this step points at. */
  anchor: string;
  kicker: string;
  body: string;
  /** Where this step's anchor LIVES: dispatched as `ethaion:navigate`
   * before measuring, so sub-tab stops can ring elements inside their own
   * tab. Stops anchored to the always-visible tab bar carry none. */
  navigate?: { tab?: string };
}

/** Copy contract: short, direct, Ethaion's voice — never "Welcome to the
 * X module!". One line of substance per stop. */
const STEPS: TourStep[] = [
  {
    anchor: 'tour-ledger',
    kicker: 'The Ledger',
    body: 'Your pieces live here. Add one to get started — a photo or a few words is enough.',
    navigate: { tab: 'wardrobe' },
  },
  {
    anchor: 'tour-ledger-pieces',
    kicker: 'The Ledger · By category',
    body: 'Open a category to see what is in it, then open a piece to correct what Beau thinks it is — the cloth, the cut, how it fits you.',
    navigate: { tab: 'wardrobe' },
  },
  {
    anchor: 'tour-fitting',
    kicker: 'The Fitting',
    body: 'The board opens on today\u2019s look, already dressed — a swap is one tap.',
  },
  {
    anchor: 'tour-fitting-board',
    kicker: 'The Fitting · The board',
    body: 'Compose an outfit on the board, then save it or share it — a board holding a piece you don\u2019t own saves as a proposal.',
    navigate: { tab: 'fitting-room' },
  },
  {
    anchor: 'tour-fitting-shelf',
    kicker: 'The Fitting · Board',
    body: 'Everything you can put on the board — what you own, what you\u2019re weighing and Beau\u2019s picks; anything not yours lands dashed.',
    navigate: { tab: 'fitting-room' },
  },
  {
    anchor: 'tour-hunt',
    kicker: 'The Hunt',
    body: 'What Beau would buy next, category by category — plus a bench that compares up to four pieces you\u2019re weighing.',
  },
];

const WALNUT = '#241a12';
const CARD = '#FBF8F1';
const PAPER = '#F5F0E6';
const LINE = '#D9CFBE';
const MUTED = '#8A7F70';
const OXBLOOD = '#8B3A3A';

interface AnchorRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function measureAnchor(anchor: string): AnchorRect | null {
  if (typeof document === 'undefined') return null;
  const el = document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  // Off-screen (a section scrolled away) reads as "no anchor" — the card
  // centres rather than ringing something invisible.
  if (rect.bottom < 0 || rect.top > window.innerHeight) return null;
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

/** The overlay itself — one step at a time, Next / Got it / Skip. */
function TourOverlay({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<AnchorRect | null>(null);
  const current = STEPS[step];
  const last = step === STEPS.length - 1;

  // Bring the step's anchor into view, then measure it — and keep the
  // measurement honest through scrolls and resizes.
  useLayoutEffect(() => {
    // SUB-TAB NAVIGATION (walkthrough extension): a stop whose anchor lives
    // inside a tab navigates there first — the same events chat deep links
    // use — so the element actually exists before it is measured.
    if (current.navigate?.tab) {
      window.dispatchEvent(new CustomEvent('ethaion:navigate', { detail: { tab: current.navigate.tab } }));
    }
    // Bring the anchor into view once it exists. Lazily-mounted tabs land
    // over several frames, so the scroll attempt retries inside the settle
    // loop until the element appears.
    let scrolledTo = false;
    const scrollToAnchor = () => {
      if (scrolledTo || typeof document === 'undefined') return;
      const el = document.querySelector<HTMLElement>(`[data-tour="${current.anchor}"]`);
      if (!el) return;
      scrolledTo = true;
      try {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch { /* older engines: instant is fine */ }
    };
    const sync = () => {
      scrollToAnchor();
      setRect(measureAnchor(current.anchor));
    };
    sync();
    // A smooth scrollIntoView — and a lazy tab still mounting — lands over
    // several frames: keep re-measuring briefly.
    const settle = window.setInterval(sync, 140);
    const stopSettle = window.setTimeout(() => window.clearInterval(settle), 2600);
    window.addEventListener('resize', sync);
    window.addEventListener('scroll', sync, true);
    return () => {
      window.clearInterval(settle);
      window.clearTimeout(stopSettle);
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', sync, true);
    };
  }, [current.anchor, current.navigate]);

  // The ring sits a touch proud of the element it highlights.
  const pad = 6;
  const ring = rect
    ? {
        top: Math.max(rect.top - pad, 4),
        left: Math.max(rect.left - pad, 4),
        width: Math.min(rect.width + pad * 2, window.innerWidth - 8),
        height: rect.height + pad * 2,
      }
    : null;

  // Card placement: under the ring when there's room, above it otherwise,
  // centred when there's no anchor at all. Clamped to the viewport.
  const cardWidth = Math.min(330, window.innerWidth - 32);
  let cardStyle: React.CSSProperties;
  if (ring) {
    const below = ring.top + ring.height + 12;
    const fitsBelow = below + 190 < window.innerHeight;
    const top = fitsBelow ? below : Math.max(ring.top - 12 - 190, 12);
    const left = Math.min(Math.max(ring.left + ring.width / 2 - cardWidth / 2, 16), window.innerWidth - cardWidth - 16);
    cardStyle = { position: 'fixed', top, left, width: cardWidth };
  } else {
    cardStyle = { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: cardWidth };
  }

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Ethaion tour">
      {/* The dimmed backdrop — light, never a blackout. With a ring, the
          spotlight box carries the dim as a giant outer shadow so the
          highlighted element itself stays at full brightness. */}
      {ring ? (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            top: ring.top,
            left: ring.left,
            width: ring.width,
            height: ring.height,
            border: `2px solid ${OXBLOOD}`,
            borderRadius: '6px',
            boxShadow: '0 0 0 9999px rgba(36, 26, 18, 0.38)',
            pointerEvents: 'none',
            transition: 'top 160ms ease, left 160ms ease, width 160ms ease, height 160ms ease',
          }}
        />
      ) : (
        <div aria-hidden="true" style={{ position: 'fixed', inset: 0, background: 'rgba(36, 26, 18, 0.38)' }} />
      )}

      <div
        style={{
          ...cardStyle,
          background: CARD,
          border: `1px solid ${LINE}`,
          boxShadow: '0 12px 32px rgba(36, 26, 18, 0.25)',
          padding: '18px 20px 16px',
        }}
      >
        <p
          className="uppercase"
          style={{ fontFamily: 'var(--space-font-heading)', fontSize: '11px', letterSpacing: '0.16em', color: OXBLOOD }}
        >
          {current.kicker}
        </p>
        <p style={{ fontFamily: 'var(--space-font-family)', fontSize: '14.5px', lineHeight: 1.6, color: WALNUT, marginTop: '6px' }}>
          {current.body}
        </p>
        <div className="flex items-center justify-between" style={{ marginTop: '14px' }}>
          <span style={{ fontFamily: 'var(--space-font-family)', fontSize: '11px', color: MUTED }}>
            {step + 1} of {STEPS.length}
          </span>
          <span className="flex items-center gap-3">
            {!last && (
              <button
                type="button"
                onClick={onDone}
                style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px', color: MUTED, background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Skip
              </button>
            )}
            <button
              type="button"
              onClick={() => (last ? onDone() : setStep((s) => s + 1))}
              style={{
                fontFamily: 'var(--space-font-family)',
                fontSize: '12.5px',
                letterSpacing: '0.04em',
                color: PAPER,
                background: WALNUT,
                border: `1px solid ${WALNUT}`,
                padding: '7px 18px',
                cursor: 'pointer',
              }}
            >
              {last ? 'Got it' : 'Next'}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * The whole feature in one mount: auto-shows the tour on first load (gated
 * behind `ethaion_onboarding_done`), renders the overlay while it runs, and
 * keeps the persistent "?" re-trigger button in the corner.
 * Render it once inside the app shell — after onboarding, never over the
 * intake wizard.
 */
export function OnboardingTour() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let done = '1';
    try {
      done = localStorage.getItem(ONBOARDING_DONE_KEY) || '';
    } catch { /* storage unavailable — never auto-show */ }
    if (done) return;
    // A beat after first paint, so the shell (and the tab bar the tour
    // anchors to) is actually on screen.
    const t = window.setTimeout(() => setOpen(true), 900);
    return () => window.clearTimeout(t);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    try {
      localStorage.setItem(ONBOARDING_DONE_KEY, '1');
    } catch { /* best-effort */ }
    // The walkthrough may end deep inside a sub-tab — land the customer
    // back on The Ledger rather than wherever the last stop happened to be.
    window.dispatchEvent(new CustomEvent('ethaion:navigate', { detail: { tab: 'wardrobe' } }));
  }, []);

  return (
    <>
      {open && <TourOverlay onDone={close} />}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Take the tour"
          title="Take the tour"
          className="fixed bottom-[72px] sm:bottom-4 left-4 z-40 flex items-center justify-center"
          style={{
            width: '34px',
            height: '34px',
            borderRadius: '50%',
            background: CARD,
            border: `1px solid ${LINE}`,
            color: MUTED,
            fontFamily: 'var(--space-font-heading)',
            fontSize: '16px',
            lineHeight: 1,
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(36, 26, 18, 0.12)',
          }}
        >
          ?
        </button>
      )}
    </>
  );
}
