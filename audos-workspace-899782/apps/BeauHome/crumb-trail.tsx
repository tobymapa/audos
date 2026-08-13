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
import {
  ACCENT_DEEP,
  FAINTER,
  HAIRLINE,
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
  return (
    <button
      type="button"
      onClick={onClick}
      className="transition-colors hover:bg-[rgba(168,113,44,0.08)]"
      style={{
        ...mono(8.5, ACCENT_DEEP),
        border: `1px solid ${RULE}`,
        background: 'transparent',
        padding: '7px 13px',
        whiteSpace: 'nowrap',
        borderRadius: '12px',
      }}
    >
      ← Back{label ? ` · ${label}` : ''}
    </button>
  );
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
      {/* Every header also feeds the app-wide FLOATING trail (top-left), so
          a drill-down page never has to publish its whereabouts twice. */}
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
// THE FLOATING TRAIL (founder's request, August 2026) — one fixed breadcrumb
// bar pinned to the top-left of the viewport, on EVERY page and sub-page:
//
//   [← BACK] │ ETHAION / THE INDEX / MAKERS
//
// · Every surface that knows where it is PUBLISHES its trail with
//   <CrumbPublisher segs onBack? /> (CrumbHeader does this automatically).
//   The publisher renders a zero-size anchor, so a publisher inside a
//   hidden, kept-mounted tab (display:none) is ignored — only what is
//   actually on screen can win.
// · <FloatingCrumbBar fallback /> is mounted ONCE in App.tsx. Of all the
//   VISIBLE publications it shows the deepest one (most segments); when
//   nothing deeper is on screen it shows the fallback — the active tab's
//   own root trail, which carries no back control.
// · The ← BACK pill renders only when the winning publication carries an
//   onBack — a root tab view never shows one (founder's rule).
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

/** Publish this surface's trail to the floating bar while it is on screen.
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

/** The fixed top-left bar itself — mounted once, at the app root. */
export function FloatingCrumbBar({ fallback }: { fallback: CrumbPublication }) {
  const [, setTick] = useState(0);
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

  if (!shown.segs || shown.segs.length === 0) return null;
  return (
    <div
      className="fixed z-[45] flex items-center flex-wrap"
      style={{
        // Below the sticky tab strip (47px + a breath), clear of its hits.
        top: '58px',
        // The SAME inset the shell header gives the Settings corner (px-4 —
        // 16px) so the bar never touches the left edge (founder's rule).
        left: '16px',
        gap: '10px',
        maxWidth: 'min(90vw, 680px)',
        // The “Ask Beau” composer's own treatment (AgentChatView): card
        // ground, hairline border, rounded-2xl corners, soft double shadow.
        // Every label inside is ALL-CAPS via the shared mono() helper.
        background: PAPER,
        border: `1px solid ${HAIRLINE}`,
        borderRadius: '16px',
        boxShadow: '0 8px 28px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)',
        padding: shown.onBack ? '5px 16px 5px 5px' : '8px 16px',
      }}
    >
      {shown.onBack && (
        <>
          <BackPill onClick={shown.onBack} />
          <span aria-hidden="true" style={{ width: '1px', height: '16px', background: RULE, flexShrink: 0 }} />
        </>
      )}
      <CrumbTrail segs={shown.segs} />
    </div>
  );
}
