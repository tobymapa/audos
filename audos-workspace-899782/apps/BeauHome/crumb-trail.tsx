/**
 * THE CRUMB TRAIL — the app's ONE back-button + breadcrumb treatment, used
 * on every drill-down surface (founder's correction, August 2026):
 *
 *   ← BACK · [PARENT]     ETHAION / THE INDEX / COATS / WOOL OVERCOAT
 *
 * · BackPill — the bordered “← BACK” control, optionally carrying the
 *   parent's label after a middot.
 * · CrumbTrail — the small-caps path. Every segment with an onClick is a
 *   link back up the path; the current page (the last segment) renders
 *   plain in walnut. The first segment is usually “Ethaion”.
 *
 * Both are drawn entirely from the shared warm-editorial tokens
 * (index-style.tsx) — nothing here sets a colour of its own.
 */
import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import {
  ACCENT_DEEP,
  FAINTER,
  PAPER,
  RULE,
  SECONDARY,
  WALNUT,
  mono,
} from './index-style';

export interface CrumbSegment {
  label: string;
  /** Present on every segment that links back up the path. */
  onClick?: () => void;
}

/** Deep link to another primary tab — used by trails whose first segment
 * is the wordmark (it lands on The Ledger, the app's first tab). */
export function goToEthaionTab(tab: string): void {
  window.dispatchEvent(new CustomEvent('ethaion:navigate', { detail: { tab } }));
}

/**
 * THE NAV CAPSULE — the ONE text box every chrome control wears: small-caps
 * mono in deep accent, a hairline RULE border, 12px corners. “← BACK”, the
 * page path, “ASK BEAU” and the settings gear read as one family because
 * they are literally the same box (founder's rule).
 *
 * `floating` is the variant the free-floating chrome clusters use: the same
 * box on a paper ground with a soft shadow, because out there it sits over
 * the page itself and has to stay legible as content scrolls beneath it.
 * In-page headers (CrumbHeader) keep the plain transparent box.
 */
function pillBox(floating: boolean): React.CSSProperties {
  return {
    ...mono(8.5, ACCENT_DEEP),
    border: `1px solid ${RULE}`,
    background: floating ? PAPER : 'transparent',
    padding: '7px 13px',
    whiteSpace: 'nowrap',
    borderRadius: '12px',
    ...(floating ? { boxShadow: '0 2px 10px rgba(43,30,20,0.10)' } : null),
  };
}

export function NavPill({
  children,
  onClick,
  title,
  ariaLabel,
  floating = false,
  icon = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
  ariaLabel?: string;
  floating?: boolean;
  /** A symbol rather than a word — same box, tightened to a square. */
  icon?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      className="transition-colors hover:bg-[rgba(168,113,44,0.08)]"
      style={{
        ...pillBox(floating),
        ...(icon ? { padding: '7px 9px', display: 'inline-flex', alignItems: 'center' } : null),
      }}
    >
      {children}
    </button>
  );
}

/** The same capsule with nothing to click — it wraps the page path so the
 * trail reads as a text box in the same family as the buttons beside it
 * (founder's correction). The segments inside stay individually clickable. */
export function PillFrame({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center" style={{ ...pillBox(true), whiteSpace: 'normal', minWidth: 0 }}>
      {children}
    </span>
  );
}

export function BackPill({
  label,
  onClick,
}: {
  /** The parent surface's name — “The Index”, “Beau's Picks”. Omit for a
   * bare “← BACK”. The label renders ALL-CAPS through the shared mono()
   * helper (textTransform: uppercase), the founder's breadcrumb rule. */
  label?: string;
  onClick: () => void;
}) {
  return <NavPill onClick={onClick}>← Back{label ? ` · ${label}` : ''}</NavPill>;
}

export function CrumbTrail({ segs, style }: { segs: CrumbSegment[]; style?: React.CSSProperties }) {
  return (
    <nav aria-label="Where you are" className="flex items-baseline flex-wrap" style={{ gap: '4px 9px', minWidth: 0, ...style }}>
      {segs.map((seg, i) => {
        const last = i === segs.length - 1;
        return (
          <span key={`${seg.label}-${i}`} className="inline-flex items-baseline" style={{ gap: '9px', minWidth: 0 }}>
            {i > 0 && (
              <span aria-hidden="true" style={mono(8.5, FAINTER)}>
                /
              </span>
            )}
            {seg.onClick && !last ? (
              <button
                type="button"
                onClick={seg.onClick}
                className="hover:underline text-left"
                style={{ ...mono(8.5, SECONDARY), background: 'transparent', padding: 0, border: 'none' }}
              >
                {seg.label}
              </button>
            ) : (
              <span aria-current={last ? 'page' : undefined} style={mono(8.5, last ? WALNUT : SECONDARY)}>
                {seg.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

/** The full header row most drill-downs open with — the pill at the left,
 * the trail beside it, wrapping on a phone. */
export function CrumbHeader({
  backLabel,
  onBack,
  segs,
  right,
}: {
  backLabel?: string;
  onBack: () => void;
  segs: CrumbSegment[];
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between flex-wrap" style={{ gap: '10px 18px' }}>
      {/* Every header also feeds the app-wide chrome nav bar under the tab
          strip, so a drill-down page never has to publish its whereabouts
          twice. */}
      <CrumbPublisher segs={segs} onBack={onBack} backLabel={backLabel} />
      <div className="flex items-center flex-wrap" style={{ gap: '10px 16px', minWidth: 0 }}>
        <BackPill label={backLabel} onClick={onBack} />
        <CrumbTrail segs={segs} />
      </div>
      {right != null && <div className="flex items-center">{right}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// THE FLOATING CHROME (founder's correction, August 2026) — NOT a bar. There
// is NO row: no ground, no border and no band spanning the screen. Two
// clusters of capsules float just under the tab strip, one pinned to each
// side, with nothing at all between them:
//
//   [← BACK] [ETHAION / THE INDEX / MAKERS]              [ASK BEAU] [⚙]
//
// · LEFT — the back control and the page path, each in its own capsule,
//   ~0.5cm in from the left edge. Every surface that knows where it is
//   PUBLISHES its trail with <CrumbPublisher segs onBack? /> (CrumbHeader
//   does this automatically). The publisher renders a zero-size anchor, so
//   a publisher inside a hidden, kept-mounted tab (display:none) is ignored
//   — only what is actually on screen can win. Of all the VISIBLE
//   publications the deepest one wins (most segments); when nothing deeper
//   is on screen the fallback shows — the active tab's own root trail,
//   which carries no back control. The ← BACK capsule renders only when the
//   winning publication carries an onBack — a root tab view never shows one
//   (founder's rule).
// · RIGHT — Ask Beau and the settings GEAR, ~0.5cm in from the right edge,
//   in the same capsule as everything on the left.
// · THE RAIL that carries them has zero height and no background, so it
//   takes up none of the page and the empty middle is click-through: the
//   content underneath keeps its own full width and every tap in the gap
//   between the two clusters reaches the page. Because the rail is sticky
//   the clusters stay put under the tab strip however far the page scrolls.
// · <ChromeNavBar fallback /> is mounted ONCE in App.tsx.
// ---------------------------------------------------------------------------

export interface CrumbPublication {
  segs: CrumbSegment[];
  onBack?: (() => void) | null;
  backLabel?: string;
}

interface RegisteredCrumbs extends CrumbPublication {
  id: number;
  el: HTMLElement | null;
}

const crumbRegistry = new Map<number, RegisteredCrumbs>();
let crumbSeq = 0;
const CRUMBS_CHANGED_EVENT = 'ethaion:crumbs-changed';

function announceCrumbsChanged(): void {
  window.dispatchEvent(new Event(CRUMBS_CHANGED_EVENT));
}

/** Publish this surface's trail to the chrome nav bar while it is on screen.
 * Renders a zero-size anchor used only for visibility detection. */
export function CrumbPublisher({ segs, onBack, backLabel }: CrumbPublication) {
  const idRef = useRef(0);
  if (idRef.current === 0) {
    crumbSeq += 1;
    idRef.current = crumbSeq;
  }
  const elRef = useRef<HTMLSpanElement | null>(null);
  // Registration is refreshed on every render, so the bar always carries the
  // segments and back handler of the CURRENT render, never a stale closure.
  useEffect(() => {
    crumbRegistry.set(idRef.current, { id: idRef.current, segs, onBack, backLabel, el: elRef.current });
    announceCrumbsChanged();
  });
  useEffect(() => {
    const id = idRef.current;
    return () => {
      crumbRegistry.delete(id);
      announceCrumbsChanged();
    };
  }, []);
  return <span ref={elRef} aria-hidden="true" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} />;
}

// Ask Beau and Settings belong to the SHELL (Desktop.tsx), not to this app,
// so the floating chrome asks for them by window event instead of reaching
// into the shell's state.
export const ASK_BEAU_EVENT = 'ethaion:ask-beau';
export const OPEN_SETTINGS_EVENT = 'ethaion:open-settings';
/** Announced while the floating chrome is on screen so the shell drops its
 * own masthead copies of the two controls — neither is ever drawn twice. */
export const CHROME_BAR_EVENT = 'ethaion:chrome-bar';
/** The same fact as a window flag, because React runs a CHILD's effects
 * before its parent's: on first load this bar announces itself before the
 * shell has subscribed, so the shell reads the flag when it subscribes and
 * the event only has to carry later changes. */
export const CHROME_BAR_FLAG = '__ethaionChromeNavBar';

/** The floating chrome itself — mounted once, under the tab strip. */
export function ChromeNavBar({ fallback }: { fallback: CrumbPublication }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const announce = (active: boolean) => {
      (window as unknown as Record<string, unknown>)[CHROME_BAR_FLAG] = active;
      window.dispatchEvent(new CustomEvent(CHROME_BAR_EVENT, { detail: { active } }));
    };
    announce(true);
    return () => announce(false);
  }, []);
  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    window.addEventListener(CRUMBS_CHANGED_EVENT, bump);
    // Tab switches hide and show kept-mounted publishers without their own
    // re-render — re-read the registry when the shell announces one.
    window.addEventListener('ethaion:tab-activated', bump);
    return () => {
      window.removeEventListener(CRUMBS_CHANGED_EVENT, bump);
      window.removeEventListener('ethaion:tab-activated', bump);
    };
  }, []);

  // The deepest VISIBLE publication wins; the newest one breaks a tie. A
  // publisher whose anchor sits under display:none (a kept-mounted tab in
  // the background) has no offsetParent and is passed over.
  let shown: CrumbPublication = fallback;
  let bestDepth = 0;
  let bestId = 0;
  for (const pub of crumbRegistry.values()) {
    const el = pub.el;
    if (!el || !el.isConnected || el.offsetParent === null) continue;
    if (pub.segs.length > bestDepth || (pub.segs.length === bestDepth && pub.id > bestId)) {
      bestDepth = pub.segs.length;
      bestId = pub.id;
      shown = pub;
    }
  }

  const segs = shown.segs || [];
  return (
    <div
      // THE RAIL — zero height and no ground of its own, so it is not a row:
      // it adds nothing to the page and paints nothing across it. Sticky so
      // the clusters hold their place under the tab strip as the page
      // scrolls: top-0 on a phone (where the strip moves to the bottom bar
      // and this is the first thing in the page), and from sm up 46px — just
      // inside the strip's 47px row, whose higher z-index covers the seam.
      className="sticky top-0 sm:top-[46px] z-[28] flex-shrink-0"
      style={{ height: 0 }}
    >
      <div
        className="absolute flex items-start justify-between"
        style={{
          top: '9px',
          // ~0.5cm in from BOTH edges of the screen (founder's rule).
          left: '19px',
          right: '19px',
          gap: '12px',
          // The middle is empty AND click-through — only the capsules
          // themselves take a tap.
          pointerEvents: 'none',
        }}
      >
        <div className="flex items-center flex-wrap" style={{ gap: '8px', minWidth: 0, pointerEvents: 'auto' }}>
          {shown.onBack && <NavPill floating onClick={shown.onBack}>← Back</NavPill>}
          {segs.length > 0 && (
            <PillFrame>
              <CrumbTrail segs={segs} />
            </PillFrame>
          )}
        </div>
        <div className="flex items-center flex-shrink-0" style={{ gap: '8px', pointerEvents: 'auto' }}>
          <NavPill
            floating
            onClick={() => window.dispatchEvent(new Event(ASK_BEAU_EVENT))}
            title="Talk to Beau — tap again to come back"
            ariaLabel="Ask Beau"
          >
            Ask Beau
          </NavPill>
          {/* Settings is the GEAR itself (founder's correction) — same
              capsule, same accent ink, a symbol instead of the word. */}
          <NavPill
            floating
            icon
            onClick={() => window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT))}
            title="Settings"
            ariaLabel="Settings"
          >
            <SettingsIcon width={14} height={14} strokeWidth={1.6} aria-hidden="true" />
          </NavPill>
        </div>
      </div>
    </div>
  );
}
