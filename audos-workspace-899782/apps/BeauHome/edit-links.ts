/**
 * THE EDIT · THE TWO WAYS OUT — the deep links every Gap row on the tab
 * carries (August 2026 redesign).
 *
 *  · → BEAU'S PICKS — The Hunt's first sub-tab, scrolled to the category the
 *    gap sits in and unfolded, so his three recommendations for it are being
 *    drawn by the time the reader arrives.
 *  · → THE INDEX — The Index's Pieces face, its filters cleared, with that
 *    garment type's own information card open.
 *
 * A tab that has never been opened is LAZY and not mounted yet, so a bare
 * event would land on nothing. Each request is therefore both DISPATCHED and
 * PARKED: the target tab picks up whichever reaches it first — the event if
 * it is already mounted, the parked request on its first mount — and a
 * parked request expires by itself so it can never fire late into a session
 * the reader has moved on from.
 *
 * Both listeners are small, additive and inside the tabs that own those
 * surfaces (hunt-tab.tsx / hunt-picks.tsx and index-tab.tsx). Nothing about
 * either tab's layout changes.
 */

export const HUNT_OPEN_CATEGORY_EVENT = 'ethaion:hunt-open-category';
export const INDEX_OPEN_TYPE_EVENT = 'ethaion:index-open-type';
/** Ask Beau, pre-filled — the piece detail page's “Ask Beau to search”. */
export const HUNT_ASK_EVENT = 'ethaion:hunt-ask';

export interface HuntTarget {
  /** An Index category id — 'shoes', 'outerwear'… */
  categoryId: string;
  /** The sub-category (run) the gap sits in, when the row names one. */
  subCategory?: string | null;
}

export interface IndexTarget {
  /** A garment type id — 'penny-loafer', 'wool-overcoat'… */
  typeId: string;
}

/** How long a parked request stays valid — long enough for a lazy tab to
 * finish loading, short enough that it never surprises the reader later. */
const PARK_MS = 6000;

let parkedHunt: HuntTarget | null = null;
let parkedIndex: IndexTarget | null = null;
let parkedAsk: string | null = null;

function goToTab(tab: string): void {
  window.dispatchEvent(new CustomEvent('ethaion:navigate', { detail: { tab } }));
}

/** Open a category inside The Hunt's Beau's Picks. */
export function openInBeausPicks(target: HuntTarget): void {
  parkedHunt = target;
  goToTab('hunt');
  window.dispatchEvent(new CustomEvent(HUNT_OPEN_CATEGORY_EVENT, { detail: target }));
  // Again once the tab has had a moment to mount for the first time.
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent(HUNT_OPEN_CATEGORY_EVENT, { detail: target }));
  }, 420);
  window.setTimeout(() => {
    if (parkedHunt === target) parkedHunt = null;
  }, PARK_MS);
}

/** Open one garment type's information card inside The Index. */
export function openInTheIndex(target: IndexTarget): void {
  parkedIndex = target;
  goToTab('index');
  window.dispatchEvent(new CustomEvent(INDEX_OPEN_TYPE_EVENT, { detail: target }));
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent(INDEX_OPEN_TYPE_EVENT, { detail: target }));
  }, 420);
  window.setTimeout(() => {
    if (parkedIndex === target) parkedIndex = null;
  }, PARK_MS);
}

/** Open The Hunt's Ask Beau face with the box pre-filled — dispatched AND
 * parked exactly as the other two deep links are, so a lazy tab still
 * lands on it. Nothing is sent in the reader's name: the box fills, the
 * reader presses send. */
export function openInAskBeau(query: string): void {
  const ask = (query || '').trim();
  if (!ask) return;
  parkedAsk = ask;
  goToTab('hunt');
  window.dispatchEvent(new CustomEvent(HUNT_ASK_EVENT, { detail: { query: ask } }));
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent(HUNT_ASK_EVENT, { detail: { query: ask } }));
  }, 420);
  window.setTimeout(() => {
    if (parkedAsk === ask) parkedAsk = null;
  }, PARK_MS);
}

/** Read the parked request without clearing it — for a parent that only
 * needs to switch face. */
export function peekHuntTarget(): HuntTarget | null {
  return parkedHunt;
}

export function peekAskQuery(): string | null {
  return parkedAsk;
}

export function takeAskQuery(): string | null {
  const held = parkedAsk;
  parkedAsk = null;
  return held;
}

export function peekIndexTarget(): IndexTarget | null {
  return parkedIndex;
}

/** Take the parked request — for the surface that actually opens it. */
export function takeHuntTarget(): HuntTarget | null {
  const held = parkedHunt;
  parkedHunt = null;
  return held;
}

export function takeIndexTarget(): IndexTarget | null {
  const held = parkedIndex;
  parkedIndex = null;
  return held;
}
