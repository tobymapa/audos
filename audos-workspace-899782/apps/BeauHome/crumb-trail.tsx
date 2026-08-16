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
import { ArrowUp, Settings as SettingsIcon } from 'lucide-react';
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
  // THE LITERAL PATH (founder's correction, August 2026): the trail reads as
  // the page's own file path — `page › sub page › sub page`. The wordmark
  // segment is dropped so the path STARTS at the page, and the separator is
  // the chevron rather than the slash.
  const path =
    segs.length > 1 && (segs[0]?.label || '').trim().toLowerCase() === 'ethaion' ? segs.slice(1) : segs;
  return (
    <nav aria-label="Where you are" className="flex items-baseline flex-wrap" style={{ gap: '4px 9px', minWidth: 0, ...style }}>
      {path.map((seg, i) => {
        const last = i === path.length - 1;
        return (
          <span key={`${seg.label}-${i}`} className="inline-flex items-baseline" style={{ gap: '9px', minWidth: 0 }}>
            {i > 0 && (
              <span aria-hidden="true" style={mono(8.5, FAINTER)}>
                ›
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

/**
 * The header a drill-down opens with. It NO LONGER DRAWS a back control or a
 * path of its own (founder's correction, August 2026): the app has exactly
 * ONE back button and ONE breadcrumb, the floating pair in the sticky chrome
 * row, and a page that drew its own put two of each on screen. The header now
 * only PUBLISHES its whereabouts to that row — plus whatever `right` content
 * the page hangs off it, which was never a duplicate.
 */
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
    <div className="flex items-center justify-end flex-wrap" style={{ gap: '10px 18px' }}>
      <CrumbPublisher segs={segs} onBack={onBack} backLabel={backLabel} />
      {right != null && <div className="flex items-center min-w-0">{right}</div>}
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

// Beau and Settings belong to the SHELL (Desktop.tsx), not to this app,
// so the floating chrome asks for them by window event instead of reaching
// into the shell's state.
export const ASK_BEAU_EVENT = 'ethaion:ask-beau';

/**
 * WHAT THE READER WAS JUST LOOKING AT — the deepest VISIBLE crumb
 * publication, read by the Beau drawer so its opening remark can speak to
 * the screen the reader came from. Returns null on a tab root (fewer than
 * three segments), where a remark would have nothing specific to say.
 */
export function currentBeauContext(): string | null {
  let best: RegisteredCrumbs | null = null;
  for (const pub of crumbRegistry.values()) {
    const el = pub.el;
    if (!el || !el.isConnected || el.offsetParent === null) continue;
    if (!best || pub.segs.length > best.segs.length || (pub.segs.length === best.segs.length && pub.id > best.id)) {
      best = pub;
    }
  }
  if (!best || best.segs.length < 3) return null;
  return best.segs
    .slice(1)
    .map((s) => s.label)
    .filter(Boolean)
    .join(' · ');
}
export const OPEN_SETTINGS_EVENT = 'ethaion:open-settings';
/** Announced while the floating chrome is on screen so the shell drops its
 * own masthead copies of the two controls — neither is ever drawn twice. */
export const CHROME_BAR_EVENT = 'ethaion:chrome-bar';
/** The same fact as a window flag, because React runs a CHILD's effects
 * before its parent's: on first load this bar announces itself before the
 * shell has subscribed, so the shell reads the flag when it subscribes and
 * the event only has to carry later changes. */
export const CHROME_BAR_FLAG = '__ethaionChromeNavBar';

// ---------------------------------------------------------------------------
// ASK BEAU — the circular portrait button in the BOTTOM-RIGHT corner
// (standard chat-widget placement, founder's request August 2026). No text —
// just Beau's portrait filling the whole circle. The engraving is black ink
// on white paper; the button's own beige ground shows through it via
// mix-blend multiply, so every white area of the image reads as the SAME
// beige the old Ask Beau capsule wore (white × beige = beige, ink stays ink).
// Tapping it dispatches the same shell event the old nav capsule did — open
// the drawer, tap again to come back.
// ---------------------------------------------------------------------------

const BEAU_PORTRAIT_URL =
  'https://storage.googleapis.com/audos-images/attachments/3460cb2c-8c4f-405c-83a2-057f8b58da27/9b4a5b0e-eb4d-49ac-bdbe-ed005d600045.jpg';

export function AskBeauCorner() {
  return (
    <>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(ASK_BEAU_EVENT))}
        title="Talk to Beau — tap again to come back"
        aria-label="Beau"
        className="fixed z-[45] overflow-hidden transition-transform hover:scale-[1.05] bottom-[72px] sm:bottom-4 right-4"
        style={{
          // MIRRORED on the "?" tour button in the opposite corner
          // (founder's rule, August 2026): the tour button sits at
          // bottom-[72px] left-4 on a phone and bottom-4 left-4 from sm up,
          // so Beau carries the SAME offsets as CLASSES — they were inline
          // styles before, which meant the sm media override could never
          // win and the button floated ~72px up on a desktop while the "?"
          // sat at 16px (founder's alignment fix, August 2026). Both now
          // sit exactly 16px from the bottom edge from sm up.
          width: '56px',
          height: '56px',
          borderRadius: '999px',
          background: PAPER,
          border: `1px solid ${RULE}`,
          padding: 0,
          boxShadow: '0 5px 18px rgba(43,30,20,0.24)',
          cursor: 'pointer',
        }}
        data-tour="tour-beau-button"
        data-testid="button-ask-beau-corner"
      >
        <img
          src={BEAU_PORTRAIT_URL}
          alt=""
          aria-hidden="true"
          draggable={false}
          loading="lazy"
          decoding="async"
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            // White areas of the engraving take the button's beige ground.
            mixBlendMode: 'multiply',
          }}
        />
      </button>
    </>
  );
}

// ---------------------------------------------------------------------------
// BACK TO THE TOP — now a CAPSULE IN THE FLOATING CHROME ROW (founder's
// request, August 2026): it sits on the same line as ← BACK, the page path
// and the settings gear, wearing the same NavPill box — shown only once the
// reader has scrolled the top of the page out of view, and it jumps (never
// animates) straight back. The bottom-right corner now belongs to Ask Beau.
//
// The page does NOT scroll the window: the app renders inside the shell's own
// scrolling panel, so the control finds the nearest scrollable ancestor and
// listens to that. The window is the fallback for surfaces that do scroll it.
// ---------------------------------------------------------------------------

function nearestScroller(from: HTMLElement | null): HTMLElement | Window {
  let el: HTMLElement | null = from?.parentElement || null;
  while (el) {
    const overflowY = window.getComputedStyle(el).overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 8) return el;
    el = el.parentElement;
  }
  return window;
}

function scrollTopOf(target: HTMLElement | Window): number {
  return target === window
    ? window.scrollY || document.documentElement.scrollTop || 0
    : (target as HTMLElement).scrollTop;
}

/** How far down the reader must be before the button is worth offering. */
const SCROLL_TOP_THRESHOLD = 260;

/** RETIRED — the floating bottom-right capsule this used to render moved
 * into the chrome row (ScrollTopNavPill below); the corner now belongs to
 * the Ask Beau portrait button. Kept as a no-op so an older import cannot
 * break a build. */
export function ScrollToTop() {
  return null;
}

function ScrollTopNavPill() {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      setShown(scrollTopOf(nearestScroller(anchorRef.current)) > SCROLL_TOP_THRESHOLD);
    };
    const onAnyScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(read);
    };
    read();
    // CAPTURE-PHASE on the window: scroll events do not bubble, but they DO
    // capture, so this hears EVERY scrollable panel in the shell. The
    // scroller is RE-RESOLVED on every event too — at mount the page often
    // has not overflowed yet, so the old once-only detection latched onto
    // the window forever and the pill never appeared (founder's report,
    // August 2026).
    window.addEventListener('scroll', onAnyScroll, true);
    window.addEventListener('ethaion:tab-activated', onAnyScroll);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onAnyScroll, true);
      window.removeEventListener('ethaion:tab-activated', onAnyScroll);
    };
  }, []);

  const jump = () => {
    const target = nearestScroller(anchorRef.current);
    if (target === window) window.scrollTo(0, 0);
    else (target as HTMLElement).scrollTop = 0;
    setShown(false);
  };

  return (
    <>
      <span ref={anchorRef} aria-hidden="true" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} />
      {shown && (
        <NavPill floating icon onClick={jump} title="Back to the top" ariaLabel="Back to the top">
          <ArrowUp width={14} height={14} strokeWidth={1.6} aria-hidden="true" />
        </NavPill>
      )}
    </>
  );
}

/** LITERAL BACK ACROSS TABS (founder's correction, August 2026): the app
 * keeps its own history of tab jumps. ← Back first unwinds the current
 * page's own drill-down (each step literally the previous screen); with
 * nothing left to unwind it returns across tabs to the page the reader
 * jumped in FROM — tabs stay mounted in the background, so their state is
 * exactly as the reader left it. */
const tabTrail: string[] = [];
let activeTabForTrail: string | null = null;
let suppressTrailPush = false;

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
  // THE TAB HISTORY — every activation of a DIFFERENT tab records where the
  // reader was, except when ← Back itself made the jump (suppressTrailPush),
  // so walking back never re-records the tabs it is leaving.
  useEffect(() => {
    const onTabActivated = (e: Event) => {
      const tab = String((e as CustomEvent).detail?.tab || '');
      if (!tab || tab === activeTabForTrail) return;
      if (activeTabForTrail && !suppressTrailPush) {
        tabTrail.push(activeTabForTrail);
        if (tabTrail.length > 40) tabTrail.shift();
      }
      suppressTrailPush = false;
      activeTabForTrail = tab;
      setTick((n) => n + 1);
    };
    window.addEventListener('ethaion:tab-activated', onTabActivated);
    return () => window.removeEventListener('ethaion:tab-activated', onTabActivated);
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
      {/* MOBILE: the two clusters share one line at 44pt-friendly sizes and
          the trail is allowed to shrink (and, if it must, scroll) rather than
          push Ask Beau off the screen or wrap under the content beneath. */}
      <style>{
        '.hab-chrome-rail{top:9px;left:19px;right:19px;gap:12px}' +
        '.hab-chrome-trail{max-width:100%;overflow:hidden}' +
        '@media (max-width:640px){' +
        '.hab-chrome-rail{top:6px;left:10px;right:10px;gap:8px}' +
        // Only the capsules themselves get the bigger tap target — not the
        // individual path segments nested inside the breadcrumb frame.
        '.hab-chrome-rail > div > button{min-height:34px}' +
        '.hab-chrome-trail{max-width:46vw}' +
        '}'
      }</style>
      <div
        className="hab-chrome-rail absolute flex items-start justify-between"
        style={{
          // ~0.5cm in from BOTH edges of the screen (founder's rule); the
          // stylesheet above tightens both on a phone.
          // The middle is empty AND click-through — only the capsules
          // themselves take a tap.
          pointerEvents: 'none',
        }}
      >
        <div className="hab-chrome-trail flex items-center flex-wrap" style={{ gap: '8px', minWidth: 0, pointerEvents: 'auto' }}>
          {(shown.onBack || tabTrail.length > 0) && (
            <NavPill
              floating
              onClick={() => {
                // LITERAL BACK: unwind the page's own drill-down first (that
                // WAS the previous screen); with nothing left to unwind,
                // return across tabs to the page the reader jumped in from.
                if (shown.onBack) {
                  shown.onBack();
                  return;
                }
                const prev = tabTrail.pop();
                if (prev) {
                  suppressTrailPush = true;
                  goToEthaionTab(prev);
                }
              }}
            >
              ← Back
            </NavPill>
          )}
          {segs.length > 0 && (
            <PillFrame>
              <CrumbTrail segs={segs} />
            </PillFrame>
          )}
        </div>
        <div className="flex items-center flex-shrink-0" style={{ gap: '8px', pointerEvents: 'auto' }}>
          {/* BACK TO THE TOP — the same capsule family, on the same line as
              the other chrome controls (founder's request): appears once the
              page has scrolled, jumps straight back. Ask Beau itself moved to
              the circular portrait button in the bottom-right corner. */}
          <ScrollTopNavPill />
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
