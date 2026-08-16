/**
 * THE SEARCH · THE WATCHLIST · BEAU'S OWN INBOX — the subscriber announcements
 * brands send him, and the one place `beau_brand_emails` is read.
 *
 * WHY BEAU HAS AN EMAIL ADDRESS. A great deal of what a maker tells its
 * customers first never appears on its website: the early access, the code, the
 * quiet Friday drop. So Beau subscribes to the brands the reader watches at his
 * OWN address (beau@ethaion.com) and reads those letters on his behalf — the
 * reader's inbox stays clean, and what matters reaches him on the brand's row
 * in the Watchlist instead.
 *
 * WHERE THE ROWS COME FROM. Never from here. An inbound-email provider POSTs
 * each letter to the `beau-inbox` server function, which normalises the brand,
 * pulls out any promo codes, classifies the announcement and files the row.
 * This module only READS those rows and marks one as SURFACED once the reader
 * has been shown it — the only column the app is allowed to write.
 *
 * SHARED, NOT PER-VISITOR. Beau subscribes once for everybody, so the rows are
 * workspace-shared (`session_id` null) and every read here asks for the shared
 * scope. A letter is announced to every reader watching that brand.
 *
 * WHAT "FRESH" MEANS. The rows that were still unsurfaced when this page
 * loaded are held for the whole session, so a notice does not vanish from under
 * the reader the instant the mark-as-surfaced write lands.
 */
import { useEffect, useState } from 'react';
import { looseBrandKey, normaliseBrandName } from './watchlist-model';

// window.__workspaceDb is auto-injected by the platform compiler when it sees
// this literal token in app source.
function db(): any {
  return (window as any).__workspaceDb;
}

/** The address Beau subscribes to brands with. */
export const BEAU_INBOX_ADDRESS = 'beau@ethaion.com';

export type AnnouncementType = 'promo' | 'new_drop' | 'sale' | 'reveal' | 'other';

/** The badge each kind of announcement reads as on the row. */
export const ANNOUNCEMENT_LABELS: Record<AnnouncementType, string> = {
  promo: 'Promo',
  new_drop: 'New drop',
  sale: 'Sale',
  reveal: 'Reveal',
  other: 'Announcement',
};

/** One letter, as every surface reads it. */
export interface BeauBrandEmail {
  id: number;
  brandName: string;
  /** The brand, normalised — what a watched brand is matched on. */
  brandKey: string;
  /** The looser key, so a maker the handler spelled from its sending domain
   * still meets the row watching it. */
  looseKey: string;
  subject: string | null;
  receivedAt: string | null;
  summary: string | null;
  /** Any codes the handler found in the body. */
  promoCodes: string[];
  type: AnnouncementType;
  excerpt: string | null;
  surfaced: boolean;
}

export const BEAU_INBOX_EVENT = 'ethaion:beau-inbox-changed';

interface EmailRow {
  id: number;
  brand_name: string | null;
  email_subject: string | null;
  received_at: string | null;
  summary: string | null;
  promo_codes: string | null;
  announcement_type: string | null;
  raw_body_excerpt: string | null;
  surfaced_to_watchers: boolean | null;
  created_at?: string;
}

function typeOf(value: unknown): AnnouncementType {
  return value === 'promo' || value === 'new_drop' || value === 'sale' || value === 'reveal'
    ? value
    : 'other';
}

function emailFromRow(row: EmailRow): BeauBrandEmail | null {
  const brandName = (row.brand_name || '').trim();
  if (!brandName) return null;
  return {
    id: row.id,
    brandName,
    brandKey: normaliseBrandName(brandName),
    looseKey: looseBrandKey(brandName),
    subject: (row.email_subject || '').trim() || null,
    receivedAt: row.received_at || row.created_at || null,
    summary: (row.summary || '').trim() || null,
    promoCodes: (row.promo_codes || '')
      .split(',')
      .map((code) => code.trim())
      .filter(Boolean),
    type: typeOf(row.announcement_type),
    excerpt: (row.raw_body_excerpt || '').trim() || null,
    surfaced: row.surfaced_to_watchers === true,
  };
}

/** How many letters one read carries — Beau's inbox is a trickle, not a feed. */
const READ_LIMIT = 60;

/**
 * Everything in Beau's inbox, newest first. Never throws: an inbox that will
 * not answer is an empty inbox, and the Watchlist reads exactly as it did
 * before he had one.
 */
export async function fetchBeauInbox(): Promise<BeauBrandEmail[]> {
  try {
    const { data } = await db()
      .from('beau_brand_emails', { shared: true })
      .orderBy('created_at', 'desc')
      .limit(READ_LIMIT)
      .get();
    const emails: BeauBrandEmail[] = [];
    for (const row of (data || []) as EmailRow[]) {
      const email = emailFromRow(row);
      if (email) emails.push(email);
    }
    return emails;
  } catch {
    return [];
  }
}

/** One read per page load, however many surfaces ask for it. */
let loaded: Promise<BeauBrandEmail[]> | null = null;

export function ensureBeauInboxLoaded(): Promise<BeauBrandEmail[]> {
  if (!loaded) loaded = fetchBeauInbox();
  return loaded;
}

export function invalidateBeauInbox(): void {
  loaded = null;
}

/**
 * The letters waiting to be announced for a set of watched brands — what the
 * on-open poll folds into the same pass as the site check.
 */
export async function unsurfacedForBrands(brandNames: string[]): Promise<BeauBrandEmail[]> {
  const wanted = new Set(brandNames.map(normaliseBrandName).filter(Boolean));
  const loosely = new Set(brandNames.map(looseBrandKey).filter(Boolean));
  if (wanted.size === 0) return [];
  const emails = await ensureBeauInboxLoaded();
  return emails.filter(
    (email) => !email.surfaced && (wanted.has(email.brandKey) || loosely.has(email.looseKey)),
  );
}

/** The letters on file for one brand, newest first. */
export function inboxForBrand(emails: BeauBrandEmail[], brandName: string | null): BeauBrandEmail[] {
  const key = normaliseBrandName(brandName);
  const loose = looseBrandKey(brandName);
  if (!key) return [];
  return emails.filter((email) => email.brandKey === key || (!!loose && email.looseKey === loose));
}

/**
 * Mark one letter as announced. `surfaced_to_watchers` is the only column the
 * app may write — everything else on the row is the handler's. Fails soft: a
 * mark that does not land only means the notice reads as new once more.
 */
export async function markBrandEmailSurfaced(id: number): Promise<void> {
  try {
    await db().from('beau_brand_emails', { shared: true }).update(id, { surfaced_to_watchers: true });
    const emails = await ensureBeauInboxLoaded();
    for (const email of emails) {
      if (email.id === id) email.surfaced = true;
    }
  } catch (e) {
    console.warn('[Ethaion] could not mark a brand announcement as seen (non-fatal):', e);
  }
}

/**
 * Beau's inbox as the Watchlist reads it: every letter on file, plus the ids
 * that were still unannounced when the page loaded — those keep their notice
 * for the whole session even after the mark-as-seen write lands.
 */
export function useBeauInbox(): { emails: BeauBrandEmail[]; freshIds: Set<number> } {
  const [emails, setEmails] = useState<BeauBrandEmail[]>([]);
  const [freshIds, setFreshIds] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    let alive = true;
    const read = () => {
      ensureBeauInboxLoaded()
        .then((rows) => {
          if (!alive) return;
          setEmails(rows);
          setFreshIds((held) => {
            const next = new Set(held);
            for (const row of rows) if (!row.surfaced) next.add(row.id);
            return next;
          });
        })
        .catch(() => undefined);
    };
    read();
    const onChanged = () => {
      invalidateBeauInbox();
      read();
    };
    window.addEventListener(BEAU_INBOX_EVENT, onChanged);
    return () => {
      alive = false;
      window.removeEventListener(BEAU_INBOX_EVENT, onChanged);
    };
  }, []);

  return { emails, freshIds };
}
