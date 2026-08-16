/**
 * THE SEARCH · WATCHLIST — the fourth sub-tab, after Your Calls.
 *
 * Everything the reader has asked Beau to keep an eye on, in TWO REGISTERS on
 * one page.
 *
 * WATCHING BRANDS comes first, because a maker is the wider instruction: a
 * banner row, the house's name in Cormorant at the head of it, no photograph
 * (a brand is not a product), the page Beau reads beneath it, and a NEW
 * ARRIVALS badge when his last read found the page had moved. Tapping a row
 * that has something to say opens Ask Beau with the obvious question already
 * in the box — “What's new at Spier & Mackay that fits my profile?” — so the
 * news turns into a recommendation in one tap. A brand watched from a piece
 * whose retailer link gave up only a domain says so plainly and takes the real
 * new-arrivals link in place.
 *
 * WATCHING PIECES is the original face, unchanged: the product's own
 * photograph, the piece in Cormorant, the maker beneath it in mono small-caps,
 * the price it was watched at, the retailer link, Beau's verdict from the card
 * it came from (held to two lines), and the WATCHING control in its active
 * state with REMOVE beside it.
 *
 * WHAT BEAU HAS NOTICED. A row whose last check found something — a price that
 * moved, a page that reads as sold out, a maker that has put new pieces up —
 * carries the accent rule, a small accent dot and his one line on what
 * changed. Nothing shouts: the alert is the same tobacco gold the rest of the
 * tab uses for a favourite. Every row also says when it was last checked, so a
 * quiet row is legible as CHECKED AND QUIET rather than as forgotten.
 *
 * AND HIS OWN POST. Beau subscribes to watched brands at his own address
 * (watchlist-inbox.ts), so a brand row also carries what the maker told its
 * subscribers and never put on the site: the kind of announcement, and any
 * code, shown in full. A letter is marked as surfaced the moment this face
 * shows it, so it is announced once and then reads as history.
 *
 * The checking itself happens elsewhere and silently (watchlist-poll.ts, run
 * on app load and when The Search comes forward) — this face never waits on
 * it, and never shows a spinner for it. It reads whatever the rows say now.
 */
import { useEffect, useMemo, useState } from 'react';
import { Mail, Store } from 'lucide-react';
import {
  ACCENT,
  ACCENT_DEEP,
  FAINT,
  FAINTER,
  HAIRLINE,
  INK,
  PAPER,
  RULE,
  SECONDARY,
  TINT,
  WALNUT,
  body,
  mono,
  serif,
} from './index-style';
import { hostLabel } from './hunt-reader';
import { HuntPhoto, HuntQuietLine } from './hunt-cards';
import { openInAskBeau } from './edit-links';
import {
  WATCH_SOURCE_LABELS,
  brandUrlNeedsArrivals,
  setBrandWatchUrl,
  unwatchPiece,
  type WatchedPiece,
} from './watchlist-model';
import { WatchButton, useWatchlist } from './watchlist-watch';
import {
  ANNOUNCEMENT_LABELS,
  BEAU_INBOX_ADDRESS,
  inboxForBrand,
  markBrandEmailSurfaced,
  useBeauInbox,
  type BeauBrandEmail,
} from './watchlist-inbox';

function whenLabel(iso: string | null): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const days = Math.floor((Date.now() - at.getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** The small accent dot and pill every alerting row carries. */
function NoticedPill({ children }: { children: string }) {
  return (
    <p className="flex items-baseline gap-2" style={{ margin: '0 0 6px' }}>
      <span
        aria-hidden="true"
        style={{
          display: 'inline-block',
          width: '6px',
          height: '6px',
          borderRadius: '999px',
          background: ACCENT,
          flexShrink: 0,
        }}
      />
      <span style={{ ...mono(8, ACCENT_DEEP), background: TINT, padding: '3px 7px' }}>{children}</span>
    </p>
  );
}

/** The quiet control both kinds of row take their leave with. */
function RemoveButton({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={title}
      className="transition-colors flex-shrink-0 hover:bg-[rgba(168,113,44,0.06)] hab-tap"
      style={{
        ...mono(8, FAINTER),
        border: `1px solid ${HAIRLINE}`,
        background: 'transparent',
        padding: '8px 12px',
        minHeight: '40px',
        cursor: 'pointer',
      }}
    >
      Remove
    </button>
  );
}

// ---------------------------------------------------------------------------
// One watched piece
// ---------------------------------------------------------------------------

function PieceWatchRow({ piece }: { piece: WatchedPiece }) {
  const alert = piece.alertTriggered && !!piece.alertMessage;
  const checked = whenLabel(piece.lastCheckedAt);
  const added = whenLabel(piece.addedAt);

  return (
    <article
      style={{
        background: PAPER,
        border: `1px solid ${alert ? ACCENT_DEEP : HAIRLINE}`,
        padding: '16px 18px 17px',
      }}
    >
      <div className="grid grid-cols-[84px_minmax(0,1fr)] sm:grid-cols-[96px_minmax(0,1fr)_auto] gap-x-4 gap-y-3 items-start">
        <span style={{ display: 'block', width: '100%' }}>
          <HuntPhoto
            pieceName={piece.pieceName}
            maker={piece.brand}
            imageUrl={piece.imageUrl}
            productUrl={piece.retailerUrl}
            aspectRatio="1 / 1"
          />
        </span>

        <div className="min-w-0">
          {alert && <NoticedPill>Beau noticed something</NoticedPill>}

          <h4 style={{ ...serif(19, WALNUT), lineHeight: 1.22, margin: 0 }}>{piece.pieceName}</h4>

          {alert && (
            <p style={{ ...body(13, ACCENT_DEEP), margin: '6px 0 0', maxWidth: '54ch' }}>{piece.alertMessage}</p>
          )}

          <p style={{ ...mono(8, SECONDARY), margin: '7px 0 0' }}>
            {[piece.brand, `from ${WATCH_SOURCE_LABELS[piece.source]}`, added ? `watched ${added}` : null]
              .filter(Boolean)
              .join(' \u00b7 ')}
          </p>

          <div className="flex items-baseline flex-wrap" style={{ gap: '12px', marginTop: '9px' }}>
            <span style={{ ...body(15, WALNUT) }}>{piece.lastKnownPrice || 'Price not stated'}</span>
            {piece.retailerUrl && (
              <a
                href={piece.retailerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:underline"
                style={{ ...mono(8, ACCENT_DEEP), textDecoration: 'none' }}
              >
                {hostLabel(piece.retailerUrl) || 'the listing'} →
              </a>
            )}
          </div>

          {piece.beauVerdict && (
            <p
              style={{
                ...body(12.5, SECONDARY),
                margin: '9px 0 0',
                maxWidth: '58ch',
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: 2,
                overflow: 'hidden',
              }}
            >
              {piece.beauVerdict}
            </p>
          )}

          <p style={{ ...mono(8, FAINTER), margin: '10px 0 0' }}>
            {!piece.retailerUrl
              ? 'No retailer page on this one \u2014 nothing for Beau to check'
              : checked
                ? `Beau last checked ${checked}`
                : 'Beau has not checked this one yet'}
          </p>
        </div>

        <div
          className="col-span-2 sm:col-span-1 flex items-center sm:flex-col sm:items-end"
          style={{ gap: '6px' }}
        >
          <WatchButton
            target={{
              pieceName: piece.pieceName,
              brand: piece.brand,
              retailerUrl: piece.retailerUrl,
              imageUrl: piece.imageUrl,
              price: piece.lastKnownPrice,
              verdict: piece.beauVerdict,
              source: piece.source,
            }}
          />
          <RemoveButton
            onClick={() => void unwatchPiece(piece.watchKey)}
            title="Take this piece off your Watchlist"
          />
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// One letter from Beau's inbox
// ---------------------------------------------------------------------------

function InboxNotice({
  email,
  fresh,
  /** The maker as the READER named it when he put it on watch — the handler may
   * only have had a sending domain to go on. */
  brandLabel,
}: {
  email: BeauBrandEmail;
  fresh: boolean;
  brandLabel: string;
}) {
  const when = whenLabel(email.receivedAt);
  if (!fresh) {
    return (
      <p style={{ ...mono(8, FAINTER), margin: '8px 0 0' }}>
        {[
          `Last from his inbox: ${ANNOUNCEMENT_LABELS[email.type]}`,
          email.subject,
          when ? `arrived ${when}` : null,
        ]
          .filter(Boolean)
          .join(' \u00b7 ')}
      </p>
    );
  }
  return (
    <div
      style={{
        border: `1px solid ${ACCENT_DEEP}`,
        background: TINT,
        padding: '11px 13px 12px',
        marginTop: '11px',
      }}
    >
      <p className="flex items-center flex-wrap" style={{ gap: '8px', margin: 0 }}>
        <Mail className="w-3 h-3" strokeWidth={1.6} style={{ color: ACCENT_DEEP }} aria-hidden="true" />
        <span style={mono(8, ACCENT_DEEP)}>Beau got a subscriber email from {brandLabel}</span>
        <span style={{ ...mono(7.5, SECONDARY), border: `1px solid ${HAIRLINE}`, padding: '2px 6px' }}>
          {ANNOUNCEMENT_LABELS[email.type]}
        </span>
        {when && <span style={mono(7.5, FAINTER)}>{when}</span>}
      </p>

      {email.subject && (
        <p style={{ ...serif(16, WALNUT), margin: '8px 0 0', lineHeight: 1.25 }}>{email.subject}</p>
      )}

      {(email.summary || email.excerpt) && (
        <p
          style={{
            ...body(12.5, INK),
            margin: '6px 0 0',
            maxWidth: '58ch',
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 3,
            overflow: 'hidden',
          }}
        >
          {email.summary || email.excerpt}
        </p>
      )}

      {email.promoCodes.length > 0 && (
        <p style={{ ...body(13, ACCENT_DEEP), margin: '9px 0 0' }}>
          {email.promoCodes.map((code) => (
            <span
              key={code}
              style={{
                ...mono(9, ACCENT_DEEP),
                border: `1px solid ${ACCENT_DEEP}`,
                background: PAPER,
                padding: '4px 8px',
                marginRight: '8px',
              }}
            >
              Code: {code}
            </span>
          ))}
          <span style={mono(8, SECONDARY)}>from Beau’s subscription</span>
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One watched brand
// ---------------------------------------------------------------------------

/** The box a brand row offers when Beau only has the maker's front page. */
function ArrivalsLinkField({ watchKey, host }: { watchKey: string; host: string | null }) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const save = () => {
    const url = value.trim();
    if (!url || saving) return;
    setSaving(true);
    void setBrandWatchUrl(watchKey, url).finally(() => {
      setSaving(false);
      setValue('');
    });
  };

  return (
    <div style={{ marginTop: '11px', borderTop: `1px solid ${HAIRLINE}`, paddingTop: '10px' }}>
      <p style={{ ...mono(8, FAINTER), margin: 0, maxWidth: '62ch', lineHeight: 1.6 }}>
        {host
          ? `Beau is reading ${host} itself \u2014 give him the new arrivals page and he will read that instead`
          : 'Beau has no page for this maker yet \u2014 give him its new arrivals link'}
      </p>
      <div className="flex items-center flex-wrap" style={{ gap: '7px', marginTop: '8px' }}>
        <input
          type="url"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              e.preventDefault();
              save();
            }
          }}
          placeholder="https://…/new-arrivals"
          aria-label="The maker's new arrivals page"
          style={{
            ...body(12.5, INK),
            // A text box under 16px makes iOS Safari zoom the page in on focus.
            fontSize: 'max(var(--eth-input, 0px), 12.5px)',
            flex: '1 1 220px',
            minWidth: 0,
            background: PAPER,
            border: `1px solid ${HAIRLINE}`,
            outline: 'none',
            padding: '8px 10px',
            minHeight: 'var(--eth-field-h, 38px)',
          }}
        />
        <button
          type="button"
          disabled={!value.trim() || saving}
          onClick={(e) => {
            e.stopPropagation();
            save();
          }}
          className="transition-colors flex-shrink-0 hover:bg-[rgba(168,113,44,0.06)] hab-tap"
          style={{
            ...mono(8, WALNUT),
            border: `1px solid ${RULE}`,
            background: 'transparent',
            padding: '9px 13px',
            minHeight: '38px',
            cursor: !value.trim() || saving ? 'default' : 'pointer',
            opacity: !value.trim() || saving ? 0.55 : 1,
          }}
        >
          Give it to Beau
        </button>
      </div>
    </div>
  );
}

function BrandWatchRow({
  brand,
  emails,
  freshIds,
}: {
  brand: WatchedPiece;
  emails: BeauBrandEmail[];
  freshIds: Set<number>;
}) {
  const letters = useMemo(() => inboxForBrand(emails, brand.pieceName), [emails, brand.pieceName]);
  const fresh = useMemo(() => letters.filter((letter) => freshIds.has(letter.id)).slice(0, 2), [letters, freshIds]);
  const freshKey = fresh.map((letter) => letter.id).join(',');

  // Shown is announced: the letter is marked the moment this row paints it, so
  // the next open reads it as history rather than as news.
  useEffect(() => {
    for (const letter of fresh) {
      if (!letter.surfaced) void markBrandEmailSurfaced(letter.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshKey]);

  const alert = (brand.alertTriggered && !!brand.alertMessage) || fresh.length > 0;
  const checked = whenLabel(brand.lastCheckedAt);
  const added = whenLabel(brand.addedAt);
  const host = brand.retailerUrl ? hostLabel(brand.retailerUrl) : null;
  const needsArrivals = brandUrlNeedsArrivals(brand.retailerUrl);
  const ask = () => openInAskBeau(`What\u2019s new at ${brand.pieceName} that fits my profile?`);

  return (
    <article
      onClick={alert ? ask : undefined}
      title={alert ? `Ask Beau what is new at ${brand.pieceName}` : undefined}
      className={alert ? 'transition-colors hover:bg-[rgba(168,113,44,0.04)]' : undefined}
      style={{
        background: PAPER,
        border: `1px solid ${alert ? ACCENT_DEEP : HAIRLINE}`,
        borderLeft: `3px solid ${alert ? ACCENT_DEEP : RULE}`,
        padding: '15px 18px 16px',
        cursor: alert ? 'pointer' : 'default',
      }}
    >
      <div className="flex items-start justify-between flex-wrap" style={{ gap: '14px' }}>
        <div className="min-w-0 flex-1">
          {alert && <NoticedPill>New arrivals</NoticedPill>}

          <h4 className="flex items-center" style={{ ...serif(24, WALNUT), lineHeight: 1.16, margin: 0, gap: '9px' }}>
            <Store className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} style={{ color: ACCENT_DEEP }} aria-hidden="true" />
            {brand.pieceName}
          </h4>

          <p style={{ ...mono(8, SECONDARY), margin: '7px 0 0' }}>
            {['Watching the maker', added ? `since ${added}` : null].filter(Boolean).join(' \u00b7 ')}
          </p>

          {brand.alertTriggered && brand.alertMessage && (
            <p style={{ ...body(13, ACCENT_DEEP), margin: '8px 0 0', maxWidth: '58ch' }}>{brand.alertMessage}</p>
          )}

          <div className="flex items-baseline flex-wrap" style={{ gap: '12px', marginTop: '9px' }}>
            {brand.retailerUrl && (
              <a
                href={brand.retailerUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="transition-colors hover:underline"
                style={{ ...mono(8, ACCENT_DEEP), textDecoration: 'none' }}
              >
                {host || 'the maker'} →
              </a>
            )}
            <span style={mono(8, FAINTER)}>
              {!brand.retailerUrl
                ? 'No page for Beau to read yet'
                : checked
                  ? `Beau last read it ${checked}`
                  : 'Beau has not read it yet'}
            </span>
          </div>
        </div>

        <div className="flex items-center flex-shrink-0" style={{ gap: '6px' }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              ask();
            }}
            title={`Ask Beau what is new at ${brand.pieceName}`}
            className="transition-colors flex-shrink-0 hover:bg-[rgba(168,113,44,0.06)] hab-tap"
            style={{
              ...mono(8, alert ? ACCENT_DEEP : SECONDARY),
              border: `1px solid ${alert ? ACCENT_DEEP : HAIRLINE}`,
              background: alert ? TINT : 'transparent',
              padding: '8px 12px',
              minHeight: '40px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Ask Beau what’s new
          </button>
          <RemoveButton
            onClick={() => void unwatchPiece(brand.watchKey)}
            title={`Stop watching ${brand.pieceName}`}
          />
        </div>
      </div>

      {fresh.map((letter) => (
        <InboxNotice key={letter.id} email={letter} fresh brandLabel={brand.pieceName} />
      ))}
      {fresh.length === 0 && letters.length > 0 && (
        <InboxNotice email={letters[0]} fresh={false} brandLabel={brand.pieceName} />
      )}

      {needsArrivals && <ArrivalsLinkField watchKey={brand.watchKey} host={host} />}
    </article>
  );
}

// ---------------------------------------------------------------------------
// The sub-tab
// ---------------------------------------------------------------------------

/** The small rule-and-label each group of rows sits under. */
function GroupLabel({ label, note }: { label: string; note: string }) {
  return (
    <div style={{ marginTop: '22px', borderBottom: `1px solid ${HAIRLINE}`, paddingBottom: '7px' }}>
      <span style={mono(9, WALNUT)}>{label}</span>
      <span style={{ ...mono(8, FAINTER), marginLeft: '10px' }}>{note}</span>
    </div>
  );
}

export function HuntWatchlist({ onGoToPicks }: { onGoToPicks: () => void }) {
  const { items } = useWatchlist();
  const inbox = useBeauInbox();

  // What Beau has noticed comes to the top of each group; the rest read newest
  // first.
  const rows = useMemo(() => {
    const list = [...items];
    list.sort((a, b) => {
      const alertA = a.alertTriggered && a.alertMessage ? 0 : 1;
      const alertB = b.alertTriggered && b.alertMessage ? 0 : 1;
      if (alertA !== alertB) return alertA - alertB;
      return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
    });
    return list;
  }, [items]);

  const brands = useMemo(() => rows.filter((row) => row.watchType === 'brand'), [rows]);
  const pieces = useMemo(() => rows.filter((row) => row.watchType !== 'brand'), [rows]);
  const alerts = rows.filter((row) => row.alertTriggered && row.alertMessage).length;

  const standing = [
    pieces.length > 0 ? `${pieces.length} ${pieces.length === 1 ? 'piece' : 'pieces'}` : null,
    brands.length > 0 ? `${brands.length} ${brands.length === 1 ? 'brand' : 'brands'}` : null,
  ]
    .filter(Boolean)
    .join(' \u00b7 ');

  return (
    <div>
      <div style={{ borderBottom: `1px solid ${HAIRLINE}`, paddingBottom: '9px' }}>
        <h3 style={{ ...serif(20, WALNUT), margin: 0 }}>What Beau is keeping an eye on</h3>
        <p style={{ ...body(13, SECONDARY), margin: '5px 0 0', maxWidth: '66ch' }}>
          Watch a piece from Beau’s Picks, an Ask Beau verdict or a Your Calls row and he re-reads its retailer page
          each time you open the app. Watch the MAKER instead — the text link under the eye — and he reads its new
          arrivals, and subscribes to it himself, so a drop or a subscriber-only code reaches you here.
        </p>
      </div>
      <p style={{ ...mono(8.5, alerts > 0 ? ACCENT_DEEP : FAINT), margin: '12px 0 0' }}>
        {rows.length === 0
          ? 'Nothing on watch yet'
          : `${standing} on watch${alerts > 0 ? ` \u00b7 ${alerts} with something to say` : ' \u00b7 all quiet'}`}
      </p>

      {rows.length === 0 ? (
        <div style={{ marginTop: '18px', borderTop: `1px solid ${RULE}` }}>
          <HuntQuietLine>
            Nothing on your Watchlist yet — press the eye on a piece from Beau’s Picks, Ask Beau or Your Calls to
            track it, or “Watch brand” under it to have him follow the whole maker.
          </HuntQuietLine>
          <button
            type="button"
            onClick={onGoToPicks}
            className="transition-colors hover:bg-[rgba(168,113,44,0.06)] hab-tap"
            style={{
              ...mono(9, WALNUT),
              border: `1px solid ${RULE}`,
              background: 'transparent',
              padding: '10px 15px',
              minHeight: '42px',
              cursor: 'pointer',
            }}
          >
            Go to Beau’s Picks →
          </button>
        </div>
      ) : (
        <>
          {brands.length > 0 && (
            <>
              <GroupLabel label="Watching brands" note="their new arrivals, and what they tell subscribers" />
              <div className="grid grid-cols-1" style={{ gap: '13px', marginTop: '13px' }}>
                {brands.map((brand) => (
                  <BrandWatchRow
                    key={brand.watchKey}
                    brand={brand}
                    emails={inbox.emails}
                    freshIds={inbox.freshIds}
                  />
                ))}
              </div>
            </>
          )}

          {pieces.length > 0 && (
            <>
              <GroupLabel label="Watching pieces" note="their price, and whether they are still there" />
              <div className="grid grid-cols-1" style={{ gap: '13px', marginTop: '13px' }}>
                {pieces.map((piece) => (
                  <PieceWatchRow key={piece.watchKey} piece={piece} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      <p style={{ ...body(12.5, INK), margin: '18px 0 0', maxWidth: '62ch', opacity: 0.75 }}>
        Retailer pages are not always readable. When one will not open, Beau says so on the row rather than guessing —
        and he never clears something he has already flagged because a later read failed.
      </p>

      {brands.length > 0 && (
        <p style={{ ...body(12.5, SECONDARY), margin: '10px 0 0', maxWidth: '62ch' }}>
          Beau subscribes to brands you watch using his own inbox ({BEAU_INBOX_ADDRESS}). Email alerts arrive when
          brands send subscriber-only announcements.
        </p>
      )}
    </div>
  );
}
