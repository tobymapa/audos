/**
 * THE HUNT · YOUR CALLS — the third sub-tab.
 *
 * Every piece tagged anywhere on The Hunt, in ONE table, in the founder's
 * columns: the photograph, the piece, the maker, the price, the call itself
 * and when it was made. EVERY COLUMN HEAD SORTS — tap once for one
 * direction, again for the other, exactly as The Index's Makers face sorts.
 *
 * The call reads as a pill: a favourite in tobacco gold, a save in ink, a
 * pass in the muted grey — so the shape of the list is legible before a word
 * of it is read. Tapping a row opens the piece's own page where there is one.
 *
 * And a call is never a one-way door: the tag can be CHANGED in place from
 * the controls at the end of the row, or REMOVED entirely, and Beau's next
 * draw reads the change.
 *
 * The same controls carry the WATCH eye, so a piece already put by can be
 * handed to Beau to keep an eye on without leaving the table — it appears on
 * the Watchlist face and its call here is untouched. WATCH BRAND sits beside
 * it as a text link where the row names a maker: the whole house goes on the
 * Watchlist and Beau reads its new arrivals.
 */
import { useMemo, useState } from 'react';
import type React from 'react';
import { Bookmark, Heart, X } from 'lucide-react';
import {
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
import { categoryName } from './index-model';
import {
  HUNT_SOURCE_LABELS,
  HUNT_TAG_LABELS,
  tagRank,
  type HuntCall,
  type HuntTag,
} from './hunt-model';
import { HuntPhoto, HuntQuietLine, type HuntCallsState } from './hunt-cards';
import { WatchBrandLink, WatchButton } from './watchlist-watch';

type SortKey = 'name' | 'brand' | 'price' | 'status' | 'date';

const COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: 'name', label: 'The piece' },
  { key: 'brand', label: 'Maker' },
  { key: 'price', label: 'Price' },
  { key: 'status', label: 'Your call' },
  { key: 'date', label: 'Added' },
];

const TAG_ORDER: HuntTag[] = ['saved', 'favourite', 'passed'];

/** The pill each call reads as — gold for a favourite, ink for a save, the
 * muted grey for a pass. */
function tagStyle(tag: HuntTag): React.CSSProperties {
  if (tag === 'favourite') {
    return { ...mono(8, ACCENT_DEEP), border: `1px solid ${ACCENT_DEEP}`, background: TINT };
  }
  if (tag === 'saved') {
    return { ...mono(8, INK), border: `1px solid ${RULE}`, background: 'transparent' };
  }
  return { ...mono(8, FAINTER), border: `1px solid ${HAIRLINE}`, background: 'transparent' };
}

function StatusPill({ tag }: { tag: HuntTag }) {
  return (
    <span style={{ ...tagStyle(tag), display: 'inline-block', padding: '4px 9px', whiteSpace: 'nowrap' }}>
      {HUNT_TAG_LABELS[tag]}
    </span>
  );
}

function whenLabel(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '—';
  const days = Math.floor((Date.now() - at.getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** The first number in a price guide (“£145–£220” → 145) — what the price
 * column sorts on. A call with no price sorts last, whichever way. */
function priceValue(guide: string | null | undefined): number {
  const match = (guide || '').replace(/[,\s]/g, '').match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : Number.POSITIVE_INFINITY;
}

function valueFor(call: HuntCall, key: SortKey): string | number {
  switch (key) {
    case 'name':
      return call.pieceName.toLowerCase();
    case 'brand':
      return (call.maker || '\uffff').toLowerCase();
    case 'price':
      return priceValue(call.priceGuide);
    case 'status':
      return tagRank(call.tag);
    case 'date':
      return -new Date(call.taggedAt).getTime();
    default:
      return '';
  }
}

/** The three small tag controls on a row, the watch eye and Remove — tap the
 * call it already holds to take it off. */
function TagControls({ call, calls }: { call: HuntCall; calls: HuntCallsState }) {
  const busy = calls.writingKey === call.cardKey;
  const icons: Record<HuntTag, React.ReactNode> = {
    saved: <Bookmark className="w-3 h-3" strokeWidth={1.6} fill={call.tag === 'saved' ? 'currentColor' : 'none'} aria-hidden="true" />,
    favourite: <Heart className="w-3 h-3" strokeWidth={1.6} fill={call.tag === 'favourite' ? 'currentColor' : 'none'} aria-hidden="true" />,
    passed: <X className="w-3 h-3" strokeWidth={1.6} aria-hidden="true" />,
  };
  return (
    <div className="flex items-center gap-1">
      {TAG_ORDER.map((tag) => {
        const active = call.tag === tag;
        const title = active
          ? `Remove this call — ${HUNT_TAG_LABELS[tag].toLowerCase()} no longer applies`
          : `Change this call to ${HUNT_TAG_LABELS[tag].toLowerCase()}`;
        return (
          <button
            key={tag}
            type="button"
            disabled={busy}
            aria-pressed={active}
            aria-label={title}
            title={title}
            onClick={(e) => {
              e.stopPropagation();
              // Tapping the call it already carries clears it; tapping another
              // changes it. Both go through the one tag writer.
              void calls.toggleTag(
                {
                  pieceName: call.pieceName,
                  categoryId: call.categoryId,
                  subCategory: call.subCategory,
                  source: call.source,
                  maker: call.maker,
                  priceGuide: call.priceGuide,
                  note: call.note,
                  productUrl: call.productUrl,
                  imageUrl: call.imageUrl,
                },
                tag,
              );
            }}
            className="transition-colors flex items-center hover:bg-[rgba(168,113,44,0.06)]"
            style={{
              ...mono(8, active ? ACCENT_DEEP : FAINTER),
              border: `1px solid ${active ? ACCENT_DEEP : HAIRLINE}`,
              background: active ? TINT : 'transparent',
              padding: '7px 8px',
              minHeight: '34px',
              cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.55 : 1,
            }}
          >
            {icons[tag]}
          </button>
        );
      })}
      <WatchButton
        size="icon"
        target={{
          pieceName: call.pieceName,
          brand: call.maker || null,
          retailerUrl: call.productUrl || null,
          imageUrl: call.imageUrl || null,
          price: call.priceGuide || null,
          verdict: call.note || null,
          source: 'your_calls',
        }}
      />
      <WatchBrandLink
        target={{
          pieceName: call.pieceName,
          brand: call.maker || null,
          retailerUrl: call.productUrl || null,
          imageUrl: call.imageUrl || null,
          price: call.priceGuide || null,
          verdict: call.note || null,
          source: 'your_calls',
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          void calls.removeTag(call.cardKey);
        }}
        title="Take this call off entirely"
        className="transition-colors hover:bg-[rgba(168,113,44,0.06)]"
        style={{
          ...mono(8, FAINTER),
          border: `1px solid ${HAIRLINE}`,
          background: 'transparent',
          padding: '7px 9px',
          minHeight: '34px',
          cursor: busy ? 'default' : 'pointer',
        }}
      >
        Remove
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The sub-tab
// ---------------------------------------------------------------------------

export function HuntCalls({ calls, onGoToPicks }: { calls: HuntCallsState; onGoToPicks: () => void }) {
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'date', asc: true });

  const rows = useMemo(() => {
    const list = [...calls.calls];
    list.sort((a, b) => {
      const av = valueFor(a, sort.key);
      const bv = valueFor(b, sort.key);
      let cmp = 0;
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      // A stable tiebreak on the piece name keeps a re-sort from shuffling
      // rows that share a value.
      if (cmp === 0) cmp = a.pieceName.localeCompare(b.pieceName);
      return sort.asc ? cmp : -cmp;
    });
    return list;
  }, [calls.calls, sort]);

  const counts = useMemo(() => {
    const out: Record<HuntTag, number> = { saved: 0, favourite: 0, passed: 0 };
    for (const call of calls.calls) out[call.tag] += 1;
    return out;
  }, [calls.calls]);

  const toggleSort = (key: SortKey) => {
    setSort((cur) => (cur.key === key ? { key, asc: !cur.asc } : { key, asc: true }));
  };

  const openRow = (call: HuntCall) => {
    if (!call.productUrl) return;
    window.open(call.productUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div>
      <div style={{ borderBottom: `1px solid ${HAIRLINE}`, paddingBottom: '9px' }}>
        <h3 style={{ ...serif(20, WALNUT), margin: 0 }}>Everything you have wanted, put by, or passed</h3>
        <p style={{ ...body(13, SECONDARY), margin: '5px 0 0', maxWidth: '66ch' }}>
          Every piece you have tagged, from Beau’s Picks or from an Ask Beau result. Every column head sorts, a row
          opens the piece’s own page, and a call can be changed or taken off — he reads the change on his next draw.
        </p>
      </div>
      <p style={{ ...mono(8.5, FAINT), margin: '12px 0 0' }}>
        {calls.calls.length === 0
          ? 'No calls made yet'
          : `${counts.favourite} favourite · ${counts.saved} saved · ${counts.passed} passed`}
      </p>

      {calls.calls.length === 0 ? (
        <div style={{ marginTop: '18px', borderTop: `1px solid ${RULE}` }}>
          <HuntQuietLine>
            Nothing here yet. Unfold a category in Beau’s Picks and save what you like the look of — or pass on what
            you do not, which is just as useful to him.
          </HuntQuietLine>
          <button
            type="button"
            onClick={onGoToPicks}
            className="transition-colors hover:bg-[rgba(168,113,44,0.06)]"
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
        <div className="overflow-x-auto" style={{ marginTop: '16px', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '900px' }}>
            <thead>
              <tr>
                <th scope="col" style={{ borderBottom: `1px solid ${WALNUT}`, width: '86px', padding: '11px 14px 11px 0' }}>
                  <span style={{ ...mono(8, FAINT) }}>Piece</span>
                </th>
                {COLUMNS.map((column) => {
                  const active = sort.key === column.key;
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      aria-sort={active ? (sort.asc ? 'ascending' : 'descending') : 'none'}
                      style={{ textAlign: 'left', padding: 0, borderBottom: `1px solid ${WALNUT}` }}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(column.key)}
                        title={`Sort by ${column.label.toLowerCase()}`}
                        className="transition-colors w-full text-left hover:bg-[rgba(168,113,44,0.06)]"
                        style={{
                          ...mono(8, active ? ACCENT_DEEP : FAINT),
                          background: 'transparent',
                          border: 'none',
                          padding: '11px 14px 11px 0',
                          minHeight: '42px',
                          cursor: 'pointer',
                        }}
                      >
                        {column.label}
                        <span style={{ marginLeft: '6px', color: active ? ACCENT_DEEP : FAINTER }}>
                          {active ? (sort.asc ? '↑' : '↓') : '↕'}
                        </span>
                      </button>
                    </th>
                  );
                })}
                <th scope="col" style={{ borderBottom: `1px solid ${WALNUT}` }}>
                  <span className="sr-only">Change this call, watch the piece or its maker, or remove it</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((call) => (
                <tr
                  key={call.cardKey}
                  onClick={() => openRow(call)}
                  className={call.productUrl ? 'transition-colors hover:bg-[rgba(168,113,44,0.06)]' : undefined}
                  title={call.productUrl ? 'Open the product page' : undefined}
                  style={{
                    background: call.tag === 'passed' ? 'transparent' : PAPER,
                    cursor: call.productUrl ? 'pointer' : 'default',
                  }}
                >
                  <td style={{ padding: '12px 14px 12px 0', borderBottom: `1px solid ${HAIRLINE}`, verticalAlign: 'top', width: '86px' }}>
                    <span style={{ display: 'block', width: '72px' }}>
                      <HuntPhoto
                        pieceName={call.pieceName}
                        maker={call.maker}
                        imageUrl={call.imageUrl}
                        productUrl={call.productUrl}
                        aspectRatio="1 / 1"
                      />
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px 12px 0', borderBottom: `1px solid ${HAIRLINE}`, verticalAlign: 'top' }}>
                    <span style={{ ...serif(16.5, WALNUT), display: 'block', lineHeight: 1.25 }}>{call.pieceName}</span>
                    <span style={{ ...mono(8, FAINTER), display: 'block', marginTop: '4px' }}>
                      {[HUNT_SOURCE_LABELS[call.source], call.categoryId ? categoryName(call.categoryId) : null, call.subCategory]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    {call.note && (
                      <span style={{ ...body(12.5, SECONDARY), display: 'block', marginTop: '5px', maxWidth: '44ch' }}>
                        {call.note}
                      </span>
                    )}
                  </td>
                  <td style={{ ...body(13, INK), padding: '12px 14px 12px 0', borderBottom: `1px solid ${HAIRLINE}`, verticalAlign: 'top' }}>
                    {call.maker || '—'}
                  </td>
                  <td style={{ ...body(13, INK), padding: '12px 14px 12px 0', borderBottom: `1px solid ${HAIRLINE}`, verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                    {call.priceGuide || '—'}
                  </td>
                  <td style={{ padding: '12px 14px 12px 0', borderBottom: `1px solid ${HAIRLINE}`, verticalAlign: 'top' }}>
                    <StatusPill tag={call.tag} />
                  </td>
                  <td style={{ ...mono(8.5, FAINT), padding: '12px 14px 12px 0', borderBottom: `1px solid ${HAIRLINE}`, verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                    {whenLabel(call.taggedAt)}
                  </td>
                  <td style={{ padding: '12px 0', borderBottom: `1px solid ${HAIRLINE}`, verticalAlign: 'top' }}>
                    <TagControls call={call} calls={calls} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
