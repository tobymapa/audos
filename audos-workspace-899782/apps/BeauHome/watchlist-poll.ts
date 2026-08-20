/**
 * THE SEARCH · THE WATCHLIST · THE BACKGROUND POLL — Beau checking, quietly,
 * on everything the reader has asked him to keep an eye on.
 *
 * WHEN. NOT from the app at all any more (server-side move, August 2026).
 * The sweep's owner is now the `watchlist-sweep-daily` SERVER HOOK, which
 * runs about once a day on the platform scheduler with the same logic as
 * this file — same page reader, same price verdicts, same FNV-1a brand
 * snapshot, same never-clear-an-unseen-alert rule — so an app open costs no
 * retailer reads whatsoever. Nothing in the app calls this module on load or
 * on tab-open: `sweepWatchlist` below is kept ONLY for a deliberate manual
 * check (and `sweepWatchlistIfStale` as its two-hour-gated wrapper). Nothing
 * about it is on the critical path: it never blocks a render, never shows a
 * spinner and never reports a failure to the reader. The Watchlist tab
 * simply reads fresher rows the next time he opens it.
 *
 * HOW. Each active row's retailer page is re-read SERVER-SIDE through the
 * `beau-fetch-page` hook — the same reader Beau's chat uses for a pasted
 * link, so a retailer that blocks robots still answers through its proxy
 * fallback. A browser cannot read a cross-origin retail page itself, which is
 * why this cannot be done in the tab.
 *
 * WHAT IT WRITES.
 *   · A price that has MOVED from the baseline, or a page that reads as sold
 *     out — `alert_triggered` true and a plain-English `alert_message`.
 *   · Nothing changed — the alert is cleared, so the row goes quiet again.
 *   · THE PAGE WOULD NOT ANSWER — `last_checked_at` still moves, and the row
 *     is left as it was. Scraping retail pages is unreliable, and a failed
 *     re-check is not evidence that a price went back up: an alert he has not
 *     seen yet is never cleared by one. The “couldn't reach” note is written
 *     only onto a row that was quiet anyway, so it can never bury the alert
 *     it would otherwise be explaining.
 *
 * The baseline itself (`last_known_price`) is never re-based — see the note
 * at the top of watchlist-model.ts.
 *
 * WATCHED BRANDS go through the same sweep, read against a different question.
 * There is no price on a new-arrivals page to compare, so the row keeps an
 * FNV-1a hash of the page as Beau last read it: a hash that has MOVED means
 * the maker has put something new up, and that is what the row says. The first
 * read only learns the hash — it can never itself be “a change” — and a page
 * that will not open leaves the row exactly as it was, as with a piece.
 *
 * AND BEAU'S OWN POST. After the site check, the same pass reads his inbox
 * (watchlist-inbox.ts) for subscriber announcements from brands the reader is
 * watching and puts those on the brand's row too — so one open of the app
 * gathers both what the website shows and what the brand only told the people
 * on its list.
 */
import {
  fetchWatchlist,
  fnv1aHash,
  invalidateWatchlist,
  looseBrandKey,
  normaliseBrandName,
  recordWatchCheck,
  WATCHLIST_EVENT,
  type WatchedPiece,
} from './watchlist-model';
import { ANNOUNCEMENT_LABELS, unsurfacedForBrands } from './watchlist-inbox';

/** How many rows one sweep will read. Twelve is what the daily Radar watcher
 * settled on — enough for a real Watchlist, small enough to stay invisible. */
const MAX_PER_SWEEP = 12;

/** A row checked more recently than this is left alone, so opening the app
 * four times in an hour costs one round of reads, not four. */
const MIN_RECHECK_MS = 30 * 60 * 1000;

/** A breath between pages — the sweep is never in a hurry. */
const BETWEEN_PAGES_MS = 400;

// ---------------------------------------------------------------------------
// THE WHOLE-SWEEP GATE (startup performance pass, August 2026)
//
// MIN_RECHECK_MS above throttles one ROW inside a sweep. The sweep itself was
// fired seven seconds after every app load and again on every visit to The
// Search, so a Watchlist of a dozen rows meant a dozen server-side page reads
// on an open where the reader never went near it. The stamp below throttles
// the SWEEP, and lives in localStorage so it survives a reload, a new tab and
// a new session — not just the page that set it.
// ---------------------------------------------------------------------------

/** When this device last started a sweep. */
const SWEEP_STAMP_KEY = 'ethaion:watchlist-sweep:last';

/** Two hours between sweeps. */
const SWEEP_MIN_GAP_MS = 2 * 60 * 60 * 1000;

function lastSweepAt(): number {
  try {
    const raw = window.localStorage.getItem(SWEEP_STAMP_KEY);
    const at = raw ? Number(raw) : 0;
    return Number.isFinite(at) ? at : 0;
  } catch {
    return 0;
  }
}

function stampSweep(): void {
  try {
    window.localStorage.setItem(SWEEP_STAMP_KEY, String(Date.now()));
  } catch {
    /* storage unavailable — the per-row throttle inside the sweep still holds */
  }
}

/** True when it is more than two hours since this device last swept. */
export function watchlistSweepIsDue(): boolean {
  return Date.now() - lastSweepAt() > SWEEP_MIN_GAP_MS;
}

/**
 * The sweep as the APP fires it — on load, and when The Search comes forward.
 * A no-op unless the gate above is open, so an app open costs nothing.
 */
export async function sweepWatchlistIfStale(): Promise<void> {
  if (!watchlistSweepIsDue()) return;
  await sweepWatchlist();
}

function workspaceIdForHooks(): string {
  return (window as any).__workspaceDb?.workspaceId || 'workspace-899782';
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

// ---------------------------------------------------------------------------
// Reading one retailer page
// ---------------------------------------------------------------------------

interface PageRead {
  /** False when the page could not be opened at all. */
  read: boolean;
  /** The price the page STATES about itself — its JSON-LD offer or its
   * price meta tag, with the currency symbol. Only this is trusted enough to
   * raise a price alert. */
  price: string | null;
  /** The first currency amount anywhere in the page's text. Good enough to
   * learn a baseline for a piece watched without one, NOT good enough to tell
   * a man his jacket dropped £40: a delivery threshold in a banner reads
   * exactly like a price. */
  loosePrice: string | null;
  /** True in stock, false sold out, null when the page does not say. */
  inStock: boolean | null;
  /** A hash of the page's readable text — what a BRAND watch compares. */
  snapshotHash: string | null;
}

/**
 * The page as one short value — WORDS ONLY, deliberately.
 *
 * Case and spacing are levelled, then two kinds of churn are thrown away: any
 * very long alphanumeric run (a session nonce or a cache-busting id, different
 * on every single read) and every DIGIT (a cart count, a countdown, a “3 left”,
 * a delivery threshold). What survives is the page's prose — which is where a
 * new piece announces itself, by its name. Without this the hash would move on
 * every open and the row would cry new arrivals each time.
 */
function snapshotOf(text: string): string | null {
  const normalised = (text || '')
    .toLowerCase()
    .replace(/[a-z0-9_-]{20,}/g, ' ')
    .replace(/[0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalised.length < 40 ? null : fnv1aHash(normalised);
}

const CURRENCY_SYMBOLS: Record<string, string> = { GBP: '\u00a3', USD: '$', EUR: '\u20ac' };

function priceWithCurrency(amount: unknown, currency: unknown): string | null {
  const raw = typeof amount === 'string' || typeof amount === 'number' ? String(amount).trim() : '';
  if (!raw) return null;
  const cleaned = raw.replace(/\b[A-Z]{3}\b/g, '').trim();
  if (!cleaned) return null;
  // Already carries its own symbol.
  if (/[^\d.,\s]/.test(cleaned)) return cleaned;
  const code = typeof currency === 'string' ? currency.trim().toUpperCase() : '';
  const symbol = CURRENCY_SYMBOLS[code] || (code ? `${code} ` : '');
  return `${symbol}${cleaned}`;
}

/** The first currency amount in a slab of page text. */
function priceFromText(text: string): string | null {
  const match = (text || '').match(/[\u00a3$\u20ac]\s?\d[\d.,]*/);
  return match ? match[0].replace(/\s+/g, '') : null;
}

function stockFrom(availability: unknown, text: string): boolean | null {
  const stated = typeof availability === 'string' ? availability : '';
  if (/out_?of_?stock|sold_?out|discontinued/i.test(stated)) return false;
  if (/in_?stock|limited_?availability|preorder/i.test(stated)) return true;
  if (/\bsold\s*out\b|\bout\s*of\s*stock\b|no longer available/i.test(text.slice(0, 20000))) return false;
  return null;
}

/**
 * Re-read one product page. Never throws — a page that will not open comes
 * back `read: false`, which the caller treats as “no news” rather than as an
 * error.
 */
async function readRetailerPage(url: string): Promise<PageRead> {
  const quiet: PageRead = { read: false, price: null, loosePrice: null, inStock: null, snapshotHash: null };
  try {
    const res = await fetch(`/api/workspaces/${workspaceIdForHooks()}/hooks/beau-fetch-page/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) return quiet;
    const data = await res.json();
    if (!data || data.fetched !== true) return quiet;
    const text = typeof data.pageText === 'string' ? data.pageText : '';
    const product = data.product || null;
    return {
      read: true,
      price: priceWithCurrency(product?.price, product?.currency),
      loosePrice: priceFromText(text),
      inStock: stockFrom(product?.availability, text),
      snapshotHash: snapshotOf(text),
    };
  } catch {
    return quiet;
  }
}

// ---------------------------------------------------------------------------
// What the reading MEANS against the baseline
// ---------------------------------------------------------------------------

function numbersIn(text: string | null): number[] {
  if (!text) return [];
  return (text.replace(/,/g, '').match(/\d+(?:\.\d+)?/g) || []).map(Number).filter((n) => Number.isFinite(n));
}

interface Verdict {
  /** True only when something the reader would want to know has changed. */
  triggered: boolean;
  message: string | null;
  /** Set only when the piece was watched with no price at all. */
  learnedPrice?: string;
  /** Brand rows: the page as this read found it. */
  snapshotHash?: string;
}

const NO_CHANGE: Verdict = { triggered: false, message: null };

/** Half a unit of currency — below this a “change” is rounding, not news. */
const PRICE_EPSILON = 0.5;

function verdictFor(piece: WatchedPiece, page: PageRead): Verdict {
  if (page.inStock === false) {
    return { triggered: true, message: 'This item may no longer be available — worth checking the link.' };
  }
  const baseline = (piece.lastKnownPrice || '').trim();
  if (!page.price) {
    // Nothing to compare. A piece watched with no price at all can still
    // learn one from the page's text — it becomes the baseline for the NEXT
    // check, and can never itself be read as a change.
    const learned = !baseline ? page.loosePrice || undefined : undefined;
    return {
      triggered: false,
      message: 'Beau read the page but could not confirm a price on it — worth a look yourself.',
      ...(learned ? { learnedPrice: learned } : {}),
    };
  }
  if (!baseline) return { ...NO_CHANGE, learnedPrice: page.price };

  const now = numbersIn(page.price)[0];
  const was = numbersIn(baseline);
  if (now === undefined || was.length === 0) return NO_CHANGE;

  // A guide RANGE (“£145–£220”) is not one price: inside it is no news, and
  // outside it is worth a word without pretending to a precise difference.
  if (was.length > 1) {
    const low = Math.min(...was);
    const high = Math.max(...was);
    if (now >= low - PRICE_EPSILON && now <= high + PRICE_EPSILON) return NO_CHANGE;
    return {
      triggered: true,
      message:
        now < low
          ? `Now ${page.price} — under the ${baseline} it was guided at when you saved it.`
          : `Now ${page.price} — above the ${baseline} it was guided at when you saved it.`,
    };
  }

  const before = was[0];
  if (Math.abs(now - before) < PRICE_EPSILON) return NO_CHANGE;
  return {
    triggered: true,
    message:
      now < before
        ? `Price dropped from ${baseline} to ${page.price} since you saved it.`
        : `Price has risen from ${baseline} to ${page.price} since you saved it.`,
  };
}

/**
 * What a BRAND watch's reading means. The question is not what it costs but
 * whether the maker has put anything new up, and the answer is the page's own
 * hash against the one the row is holding.
 */
function brandVerdictFor(brand: WatchedPiece, page: PageRead): Verdict {
  if (!page.read || !page.snapshotHash) {
    return { triggered: false, message: "Couldn't reach this maker's page — worth a look yourself." };
  }
  // The first read only LEARNS the page; it can never be a change itself.
  if (!brand.pageSnapshotHash) return { ...NO_CHANGE, snapshotHash: page.snapshotHash };
  if (brand.pageSnapshotHash === page.snapshotHash) return NO_CHANGE;
  return {
    triggered: true,
    message: `New arrivals detected at ${brand.pieceName} — tap to ask Beau`,
    snapshotHash: page.snapshotHash,
  };
}

// ---------------------------------------------------------------------------
// Beau's own post
// ---------------------------------------------------------------------------

/**
 * Fold any subscriber announcement Beau has received for a watched brand onto
 * that brand's row. Run AFTER the site check in the same pass, so a letter —
 * the more particular news of the two — is what the row ends up saying.
 *
 * The letter is not marked as announced here: the Watchlist marks one surfaced
 * when it actually SHOWS it (watchlist-view.tsx), so an alert written into a
 * tab nobody opened is still waiting the next time they do.
 */
async function sweepBeauInbox(pieces: WatchedPiece[]): Promise<number> {
  const brands = pieces.filter((p) => p.watchType === 'brand' && p.id);
  if (brands.length === 0) return 0;
  let waiting: Awaited<ReturnType<typeof unsurfacedForBrands>>;
  try {
    waiting = await unsurfacedForBrands(brands.map((b) => b.pieceName));
  } catch {
    return 0;
  }
  if (waiting.length === 0) return 0;

  let wrote = 0;
  for (const brand of brands) {
    const key = normaliseBrandName(brand.pieceName);
    const loose = looseBrandKey(brand.pieceName);
    const letters = waiting.filter(
      (letter) => letter.brandKey === key || (!!loose && letter.looseKey === loose),
    );
    if (letters.length === 0) continue;
    const newest = letters[0];
    const parts = [`Beau got a subscriber email from ${brand.pieceName}`, ANNOUNCEMENT_LABELS[newest.type]];
    if (newest.promoCodes.length > 0) parts.push(`Code: ${newest.promoCodes[0]}`);
    if (letters.length > 1) parts.push(`${letters.length} unread`);
    try {
      await recordWatchCheck(brand.id as number, {
        // His post is not a site check: the stamp stays where the last real
        // read left it rather than claiming a page was re-read.
        lastCheckedAt: brand.lastCheckedAt || new Date().toISOString(),
        alertTriggered: true,
        alertMessage: parts.join(' · '),
      });
      wrote += 1;
    } catch (e) {
      console.warn('[Ethaion] a brand announcement could not be recorded (non-fatal):', e);
    }
  }
  return wrote;
}

// ---------------------------------------------------------------------------
// The sweep
// ---------------------------------------------------------------------------

let sweeping = false;

function due(piece: WatchedPiece, force: boolean): boolean {
  if (!piece.id || !(piece.retailerUrl || '').trim()) return false;
  if (force || !piece.lastCheckedAt) return true;
  const at = new Date(piece.lastCheckedAt).getTime();
  if (Number.isNaN(at)) return true;
  return Date.now() - at > MIN_RECHECK_MS;
}

/**
 * Check every active watched piece with a retailer page. Silent throughout:
 * it resolves when it is done and every failure inside it is a no-op on the
 * row it was reading.
 */
export async function sweepWatchlist({ force = false }: { force?: boolean } = {}): Promise<void> {
  if (sweeping) return;
  sweeping = true;
  // The stamp moves BEFORE the reads, not after: a sweep that gives up halfway
  // must not leave the gate open for the next load to start it all again.
  stampSweep();
  try {
    const pieces = await fetchWatchlist();
    // Pieces and brands share the one budget — a sweep is a handful of reads
    // however the Watchlist is made up.
    const dueNow = pieces.filter((p) => due(p, force)).slice(0, MAX_PER_SWEEP);
    if (dueNow.length === 0) {
      // Nothing to re-read, but his post may still be waiting.
      if ((await sweepBeauInbox(pieces)) > 0) {
        invalidateWatchlist();
        await fetchWatchlist();
        window.dispatchEvent(new CustomEvent(WATCHLIST_EVENT));
      }
      return;
    }

    let wrote = 0;
    for (const piece of dueNow) {
      const checkedAt = new Date().toISOString();
      const page = await readRetailerPage((piece.retailerUrl || '').trim());
      const verdict: Verdict =
        piece.watchType === 'brand'
          ? brandVerdictFor(piece, page)
          : page.read
            ? verdictFor(piece, page)
            : { triggered: false, message: "Couldn't reach the retailer page — check manually." };

      // WHAT THE ROW LEARNS. A verdict that says something — a real change, or
      // a clean reading with nothing to report — is written straight onto the
      // row. A verdict that says only “I could not tell” (an unreachable page,
      // or a page with no price on it) must not overwrite an alert the reader
      // has not seen yet: the stamp still moves, so he can see Beau tried, and
      // the note is written only where there was nothing to bury.
      const inconclusive = !verdict.triggered && verdict.message !== null;
      const patch: Parameters<typeof recordWatchCheck>[1] = { lastCheckedAt: checkedAt };
      if (!inconclusive || !piece.alertTriggered) {
        patch.alertTriggered = verdict.triggered;
        patch.alertMessage = verdict.message;
      }
      if (verdict.learnedPrice) patch.lastKnownPrice = verdict.learnedPrice;
      if (verdict.snapshotHash) patch.pageSnapshotHash = verdict.snapshotHash;

      try {
        await recordWatchCheck(piece.id as number, patch);
        wrote += 1;
      } catch (e) {
        console.warn('[Ethaion] watchlist check could not be recorded (non-fatal):', e);
      }

      await wait(BETWEEN_PAGES_MS);
    }

    wrote += await sweepBeauInbox(pieces);

    if (wrote > 0) {
      invalidateWatchlist();
      await fetchWatchlist();
      window.dispatchEvent(new CustomEvent(WATCHLIST_EVENT));
    }
  } catch (e) {
    console.warn('[Ethaion] watchlist sweep did not run (non-fatal):', e);
  } finally {
    sweeping = false;
  }
}
