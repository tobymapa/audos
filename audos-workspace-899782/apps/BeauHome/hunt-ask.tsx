/**
 * THE HUNT · ASK BEAU — the second sub-tab.
 *
 * ONE box, three uses, and Beau reads which it is: a question, a brief to go
 * and find something, or a product link to assess. The box and its two
 * controls sit as the founder's screen has them — the field filling the row,
 * “Put it to him” solid walnut at the top right and “Queue this product”
 * outlined beneath it — with a row of openings under the field for a reader
 * who does not know what to ask yet.
 *
 * Beneath: THE BENCH, up to four product links held side by side, each read
 * as it is added by the shared link reader (hunt-reader.ts — piece, maker,
 * price, photograph, description). With two or more on it Beau writes the
 * COMPARISON: the same four criteria per product in one table, then his call
 * and the runner-up.
 *
 * Then his VERDICT AND RECOMMENDATION on the walnut band, and the real pieces
 * to act on under it — each carrying the same Save · Favourite · Pass as
 * Beau's Picks, so a call made here files on Your Calls beside one made there,
 * and the same WATCH, so a piece he is not ready to decide on can be left to
 * Beau to keep an eye on instead — or WATCH BRAND under it, which hands him the
 * whole house and its new arrivals.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Trash2 } from 'lucide-react';
import {
  ACCENT_DEEP,
  FAINT,
  FAINTER,
  HAIRLINE,
  INK,
  ON_WALNUT,
  ON_WALNUT_GOLD,
  PAPER,
  RULE,
  SECONDARY,
  TINT,
  WALNUT,
  body,
  mono,
  serif,
} from './index-style';
import { huntCardKey, type HuntTaggable } from './hunt-model';
import {
  ASK_QUEUE_LIMIT,
  compareQueued,
  runAskBeau,
  type AskAnswer,
  type ComparisonResult,
  type QueuedProduct,
} from './hunt-ask-ai';
import {
  firstUrl,
  hostLabel,
  looksLikeBareUrl,
  normaliseUrl,
  pieceNameFromUrl,
  readProductLink,
  type HuntReader,
} from './hunt-reader';
import { HuntButton, HuntCard, HuntPhoto, HuntWorkingLine, type HuntCallsState } from './hunt-cards';
import { HUNT_ASK_EVENT, takeAskQuery } from './edit-links';

let queueSeq = 0;
function nextQueueId(): string {
  queueSeq += 1;
  return `bench-${queueSeq}`;
}

/** Openings for a reader who has not decided what to ask yet — they fill the
 * box rather than sending, so nothing is asked in his name. */
const OPENINGS = [
  'A suede boot I can wear with flannels without looking dressed up',
  'Something warm for ten degrees that is not a coat',
  'What should I wear on top in November',
];

// ---------------------------------------------------------------------------
// The bench — up to four products held for comparison.
// ---------------------------------------------------------------------------

function BenchCard({
  product,
  index,
  onRemove,
}: {
  product: QueuedProduct;
  index: number;
  onRemove: () => void;
}) {
  return (
    <div style={{ background: PAPER, border: `1px solid ${HAIRLINE}`, padding: '13px 14px' }}>
      <div className="flex items-start justify-between gap-2" style={{ marginBottom: '9px' }}>
        <span style={{ ...mono(8, ACCENT_DEEP) }}>{String(index + 1).padStart(2, '0')}</span>
        <button
          type="button"
          onClick={onRemove}
          title="Take this off the bench"
          aria-label={`Take ${product.pieceName} off the bench`}
          className="transition-colors hover:opacity-70"
          style={{ color: FAINTER, background: 'transparent', border: 'none', padding: '2px', cursor: 'pointer' }}
        >
          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.6} aria-hidden="true" />
        </button>
      </div>
      <HuntPhoto
        pieceName={product.pieceName}
        maker={product.maker}
        imageUrl={product.imageUrl}
        productUrl={product.url}
        aspectRatio="4 / 3"
      />
      <p style={{ ...serif(15.5, WALNUT), margin: '11px 0 0', lineHeight: 1.25 }}>{product.pieceName}</p>
      <p style={{ ...mono(8, FAINT), margin: '5px 0 0' }}>
        {[product.maker, product.price, hostLabel(product.url)].filter(Boolean).join(' · ') || hostLabel(product.url)}
      </p>
      {product.reading && <p style={{ ...mono(8, FAINTER), margin: '7px 0 0' }}>Beau is reading the page…</p>}
      {!product.reading && product.description && (
        <p style={{ ...body(12.5, SECONDARY), margin: '8px 0 0' }}>{product.description}</p>
      )}
      {!product.reading && product.note && (
        <p style={{ ...body(12.5, INK), margin: '8px 0 0' }}>{product.note}</p>
      )}
      {!product.reading && product.unread && (
        <p style={{ ...body(12.5, FAINTER), margin: '8px 0 0' }}>
          That page would not open up to him — the link is kept, and he will weigh it on what he knows.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The comparison — one column per product, the same four criteria.
// ---------------------------------------------------------------------------

const CRITERIA: Array<{ key: 'fit' | 'make' | 'colour' | 'value'; label: string }> = [
  { key: 'fit', label: 'On your frame' },
  { key: 'make', label: 'The make' },
  { key: 'colour', label: 'The colour' },
  { key: 'value', label: 'The value' },
];

function ComparisonTable({
  comparison,
  queued,
}: {
  comparison: ComparisonResult;
  queued: QueuedProduct[];
}) {
  const columns = comparison.columns
    .map((col) => ({ col, product: queued.find((p) => p.id === col.productId) || null }))
    .filter((entry): entry is { col: ComparisonResult['columns'][number]; product: QueuedProduct } => !!entry.product);
  if (columns.length < 2) return null;
  return (
    <section aria-label="Beau's side-by-side" style={{ marginTop: '30px' }}>
      <div style={{ borderBottom: `1px solid ${WALNUT}`, paddingBottom: '8px' }}>
        <h3 style={{ ...serif(21, WALNUT), margin: 0 }}>Side by side</h3>
        <p style={{ ...body(13, SECONDARY), margin: '4px 0 0', maxWidth: '62ch' }}>
          The same four questions of each, answered for you — not for a general buyer.
        </p>
      </div>

      <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        <table style={{ borderCollapse: 'collapse', minWidth: `${180 + columns.length * 220}px`, width: '100%' }}>
          <thead>
            <tr>
              <th style={{ ...mono(8, FAINT), textAlign: 'left', padding: '13px 14px 13px 0', width: '132px', borderBottom: `1px solid ${RULE}`, verticalAlign: 'bottom' }}>
                &nbsp;
              </th>
              {columns.map(({ col, product }) => (
                <th
                  key={col.productId}
                  style={{ textAlign: 'left', padding: '13px 14px', borderBottom: `1px solid ${RULE}`, verticalAlign: 'bottom' }}
                >
                  <span style={{ ...serif(16, WALNUT), display: 'block', lineHeight: 1.25 }}>{product.pieceName}</span>
                  <span style={{ ...mono(8, FAINT), display: 'block', marginTop: '4px' }}>
                    {[product.maker, product.price].filter(Boolean).join(' · ') || hostLabel(product.url)}
                  </span>
                  <span
                    style={{
                      ...mono(8, col.standing === 'The one' ? ACCENT_DEEP : SECONDARY),
                      display: 'inline-block',
                      marginTop: '7px',
                      border: `1px solid ${col.standing === 'The one' ? ACCENT_DEEP : HAIRLINE}`,
                      background: col.standing === 'The one' ? TINT : 'transparent',
                      padding: '3px 7px',
                    }}
                  >
                    {col.standing}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CRITERIA.map((criterion) => (
              <tr key={criterion.key}>
                <th
                  scope="row"
                  style={{ ...mono(8, FAINT), textAlign: 'left', padding: '14px 14px 14px 0', borderBottom: `1px solid ${HAIRLINE}`, verticalAlign: 'top', fontWeight: 400 }}
                >
                  {criterion.label}
                </th>
                {columns.map(({ col }) => (
                  <td
                    key={`${col.productId}-${criterion.key}`}
                    style={{ ...body(13, INK), padding: '14px', borderBottom: `1px solid ${HAIRLINE}`, verticalAlign: 'top' }}
                  >
                    {col[criterion.key] || '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ background: WALNUT, padding: '22px 24px', marginTop: '20px' }}>
        <p style={{ ...mono(9, ON_WALNUT_GOLD), margin: '0 0 8px' }}>Beau · his call</p>
        {comparison.call.split(/\n{2,}/).map((line, i) => (
          <p
            key={i}
            style={{ fontFamily: 'var(--space-font-family)', fontSize: '15px', lineHeight: 1.6, color: ON_WALNUT, margin: i === 0 ? 0 : '11px 0 0', maxWidth: '58ch' }}
          >
            {line}
          </p>
        ))}
        {comparison.runnerUp && (
          <p style={{ fontFamily: 'var(--space-font-family)', fontSize: '13.5px', lineHeight: 1.6, color: ON_WALNUT, opacity: 0.8, margin: '14px 0 0', maxWidth: '58ch' }}>
            <span style={{ ...mono(8.5, ON_WALNUT_GOLD), display: 'block', marginBottom: '3px' }}>The runner-up</span>
            {comparison.runnerUp}
          </p>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The sub-tab
// ---------------------------------------------------------------------------

export function HuntAsk({ reader, calls }: { reader: HuntReader | null; calls: HuntCallsState }) {
  const [text, setText] = useState('');
  const [queued, setQueued] = useState<QueuedProduct[]>([]);
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [asked, setAsked] = useState<string | null>(null);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [phase, setPhase] = useState<string | null>(null);
  const [comparePhase, setComparePhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The photograph each result card painted, so a tag carries the picture.
  const photos = useRef<Map<string, string>>(new Map());

  // “Ask Beau to search” from a piece page: the box FILLS with the brief —
  // it never sends in the reader's name. Parked requests cover a tab that
  // was still loading when the link was pressed.
  useEffect(() => {
    const parked = takeAskQuery();
    if (parked) setText(parked);
    const onAsk = (e: Event) => {
      const query = String((e as CustomEvent).detail?.query || '').trim();
      if (query) {
        setText(query);
        takeAskQuery();
      }
    };
    window.addEventListener(HUNT_ASK_EVENT, onAsk);
    return () => window.removeEventListener(HUNT_ASK_EVENT, onAsk);
  }, []);

  const benchFull = queued.length >= ASK_QUEUE_LIMIT;
  const pastedUrl = useMemo(() => {
    const trimmed = text.trim();
    if (!trimmed) return null;
    return firstUrl(trimmed) || (looksLikeBareUrl(trimmed) ? normaliseUrl(trimmed) : null);
  }, [text]);

  /** Put one product link on the bench and read its page in the background. */
  const enqueue = useCallback(
    async (rawUrl: string) => {
      const url = normaliseUrl(rawUrl);
      if (!url) return;
      if (queued.some((p) => p.url === url)) {
        setError('That one is already on the bench.');
        return;
      }
      if (queued.length >= ASK_QUEUE_LIMIT) {
        setError(`The bench holds ${ASK_QUEUE_LIMIT} — take one off before adding another.`);
        return;
      }
      setError(null);
      // The comparison belongs to the bench as it was; a new product retires it.
      setComparison(null);
      const id = nextQueueId();
      setQueued((cur) => [
        ...cur,
        {
          id,
          url,
          pieceName: pieceNameFromUrl(url),
          maker: null,
          price: null,
          imageUrl: null,
          description: null,
          categoryId: null,
          note: null,
          reading: true,
        },
      ]);
      const read = await readProductLink({ url, reader });
      setQueued((cur) =>
        cur.map((p) =>
          p.id === id
            ? {
                ...p,
                pieceName: read.pieceName || p.pieceName,
                maker: read.maker,
                price: read.price,
                imageUrl: read.imageUrl,
                description: read.description,
                categoryId: read.categoryId,
                note: read.note,
                reading: false,
                unread: !read.read,
              }
            : p,
        ),
      );
    },
    [queued, reader],
  );

  const send = useCallback(async () => {
    const ask = text.trim();
    if (!ask || !reader || phase) return;
    setError(null);
    setPhase('Beau is reading your ask\u2026');
    // A bare link is a product to weigh: it goes on the bench as well as to
    // him, so a second link turns straight into a comparison.
    if (pastedUrl && looksLikeBareUrl(ask)) void enqueue(pastedUrl);
    try {
      const result = await runAskBeau({ query: ask, reader, queued, onPhase: setPhase });
      setAnswer(result);
      setAsked(ask);
      setText('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not land — try again in a moment.');
    } finally {
      setPhase(null);
    }
  }, [enqueue, pastedUrl, phase, queued, reader, text]);

  const compare = useCallback(async () => {
    if (!reader || queued.length < 2 || comparePhase) return;
    setError(null);
    setComparePhase('Beau is lining them up\u2026');
    try {
      const result = await compareQueued({ reader, queued, onPhase: setComparePhase });
      if (!result) {
        setError('Beau could not weigh those against each other this minute — try again shortly.');
        return;
      }
      setComparison(result);
    } catch {
      setError('That comparison did not land — try again in a moment.');
    } finally {
      setComparePhase(null);
    }
  }, [comparePhase, queued, reader]);

  const removeFromBench = useCallback((id: string) => {
    setQueued((cur) => cur.filter((p) => p.id !== id));
    setComparison(null);
  }, []);

  return (
    <div>
      <div style={{ borderBottom: `1px solid ${HAIRLINE}`, paddingBottom: '9px' }}>
        <h3 style={{ ...serif(20, WALNUT), margin: 0 }}>Ask Beau, or put a link in front of him</h3>
        <p style={{ ...body(13, SECONDARY), margin: '5px 0 0', maxWidth: '66ch' }}>
          One box for both. A question comes back as an answer with what he ruled out; a link comes back as a
          verdict — what the thing is, who the house is, what it would mean for you. Queue up to{' '}
          {ASK_QUEUE_LIMIT} links and he will compare them.
        </p>
      </div>

      {/* THE BOX — the field, with Send above Queue in its own column. */}
      <div className="flex flex-col sm:flex-row items-stretch" style={{ gap: '12px', marginTop: '18px' }}>
        <div className="flex-1 min-w-0" style={{ border: `1px solid ${RULE}`, background: PAPER, padding: '13px 15px' }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void send();
              }
            }}
            rows={3}
            placeholder="Ask Beau to find something, evaluate a piece, or paste a product link…"
            aria-label="Ask Beau"
            style={{
              ...body(14.5, INK),
              width: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              resize: 'vertical',
              minHeight: '76px',
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5 flex-shrink-0 sm:w-[220px]">
          <HuntButton onClick={() => void send()} solid full disabled={!text.trim() || !reader} busy={!!phase}>
            Put it to him <ArrowRight className="w-3 h-3" strokeWidth={1.8} aria-hidden="true" />
          </HuntButton>
          <HuntButton
            onClick={() => pastedUrl && void enqueue(pastedUrl)}
            full
            disabled={!pastedUrl || benchFull}
            title={
              benchFull
                ? `The bench holds ${ASK_QUEUE_LIMIT} — take one off before adding another`
                : 'Hold this product for a side-by-side'
            }
          >
            Queue this product · {queued.length} of {ASK_QUEUE_LIMIT}
          </HuntButton>
        </div>
      </div>

      {/* The openings — they fill the box, they never send. */}
      <div className="flex items-center flex-wrap" style={{ gap: '8px', marginTop: '12px' }}>
        <span style={{ ...mono(8, FAINTER), flexShrink: 0 }}>Try</span>
        {OPENINGS.map((opening) => (
          <button
            key={opening}
            type="button"
            onClick={() => setText(opening)}
            className="transition-colors text-left hover:bg-[rgba(168,113,44,0.06)]"
            style={{
              ...body(12.5, SECONDARY),
              border: `1px solid ${HAIRLINE}`,
              background: 'transparent',
              padding: '7px 11px',
              minHeight: '36px',
              cursor: 'pointer',
            }}
          >
            {opening}
          </button>
        ))}
      </div>

      {error && (
        <p
          aria-live="polite"
          style={{ ...body(13, 'var(--space-semantic-danger-600)'), margin: '12px 0 0', maxWidth: '60ch' }}
        >
          {error}
        </p>
      )}
      {phase && <HuntWorkingLine phase={phase} />}

      {/* THE BENCH */}
      <section aria-label="The bench" style={{ marginTop: '22px', borderTop: `1px solid ${HAIRLINE}`, paddingTop: '13px' }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span style={{ ...mono(8, FAINT) }}>
            {queued.length === 0
              ? 'The queue is empty — paste a link and queue it'
              : `${queued.length} of ${ASK_QUEUE_LIMIT} on the bench · two or more and he will compare them properly`}
          </span>
          <HuntButton
            onClick={() => void compare()}
            busy={!!comparePhase}
            disabled={queued.length < 2}
            title={queued.length < 2 ? 'Queue two products and he will compare them' : 'Ask Beau to compare the bench'}
          >
            {comparison ? 'Compare again' : 'Compare the queue'}
          </HuntButton>
        </div>

        {queued.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" style={{ gap: '12px', paddingTop: '14px' }}>
            {queued.map((product, i) => (
              <BenchCard key={product.id} product={product} index={i} onRemove={() => removeFromBench(product.id)} />
            ))}
          </div>
        )}
        {comparePhase && <HuntWorkingLine phase={comparePhase} />}
      </section>

      {/* THE VERDICT AND THE RECOMMENDATION */}
      {answer && (
        <section aria-label="Beau's verdict" style={{ marginTop: '30px' }}>
          {asked && (
            <div style={{ marginBottom: '14px' }}>
              <p style={{ ...mono(8, FAINT), margin: 0 }}>You asked</p>
              <p style={{ ...serif(20, WALNUT), margin: '5px 0 0', maxWidth: '58ch', lineHeight: 1.28 }}>{asked}</p>
            </div>
          )}
          <div style={{ background: WALNUT, padding: '26px 24px 28px' }}>
            <p style={{ ...mono(9, ON_WALNUT_GOLD), margin: '0 0 9px' }}>Beau · his verdict</p>
            <p style={{ fontFamily: 'var(--space-font-heading)', fontWeight: 400, fontSize: '24px', lineHeight: 1.32, color: ON_WALNUT, margin: 0, maxWidth: '54ch' }}>
              {answer.headline}
            </p>
            {answer.verdict.split(/\n{2,}/).filter(Boolean).map((para, i) => (
              <p
                key={i}
                style={{ fontFamily: 'var(--space-font-family)', fontSize: '15px', lineHeight: 1.62, color: ON_WALNUT, opacity: 0.86, margin: '15px 0 0', maxWidth: '58ch' }}
              >
                {para}
              </p>
            ))}
            {!answer.grounded && (
              <p style={{ ...mono(8, ON_WALNUT_GOLD), margin: '16px 0 0', opacity: 0.8 }}>
                The market would not answer him this minute — this is his judgement, not today’s prices
              </p>
            )}
          </div>
        </section>
      )}

      {/* THE SIDE-BY-SIDE — part of the verdict whenever the bench holds two
          or more, and it stands on its own when he was asked nothing else. */}
      {comparison && <ComparisonTable comparison={comparison} queued={queued} />}

      {answer && answer.products.length > 0 && (
        <section aria-label="What Beau would act on" style={{ marginTop: '20px' }}>
          <p style={{ ...mono(8.5, FAINT), margin: '0 0 12px' }}>What he would act on</p>
          <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: '15px' }}>
            {answer.products.map((product) => {
              const key = `${product.pieceName}\u241f${product.url || ''}`;
              const taggable: HuntTaggable = {
                pieceName: product.pieceName,
                categoryId: product.categoryId,
                subCategory: product.subCategory,
                source: 'ask',
                maker: product.maker,
                priceGuide: product.priceGuide,
                note: product.whyYou || null,
                productUrl: product.url,
                imageUrl: photos.current.get(key) || null,
              };
              return (
                <HuntCard
                  key={key}
                  pieceName={product.pieceName}
                  garmentType={product.subCategory || product.maker}
                  maker={product.maker}
                  priceGuide={product.priceGuide}
                  whyYou={product.whyYou}
                  qualitySignals={product.qualitySignals}
                  url={product.url}
                  retailer={product.retailer}
                  onPhoto={(url) => photos.current.set(key, url)}
                  actions={{
                    tag: calls.tagOf(taggable),
                    onTag: (tag) => {
                      void calls.toggleTag(
                        { ...taggable, imageUrl: photos.current.get(key) || null },
                        tag,
                      );
                    },
                    busy: calls.writingKey === huntCardKey(taggable),
                    // Read at the tap, so the photograph the card actually
                    // painted travels onto the Watchlist row.
                    watch: () => ({
                      pieceName: product.pieceName,
                      brand: product.maker,
                      retailerUrl: product.url,
                      imageUrl: photos.current.get(key) || null,
                      price: product.priceGuide,
                      verdict: product.whyYou || null,
                      source: 'ask_beau',
                    }),
                  }}
                />
              );
            })}
          </div>
        </section>
      )}

      {!answer && !phase && queued.length === 0 && (
        <p style={{ ...body(13, FAINTER), margin: '22px 0 0', maxWidth: '58ch' }}>
          Nothing asked yet. He reasons with your whole dossier every time — there is no profile switch to remember.
        </p>
      )}
    </div>
  );
}
