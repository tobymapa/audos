/**
 * Skeleton loading primitives (Pass Fifteen, Track J; rebuilt Pass Forty-Six)
 * — ghost outlines in the shape of the content that's coming, instead of
 * spinners or blank areas. Feels instant.
 *
 * Pass Forty-Six adds the Warm Editorial SHIMMER system: Lora-sized bars at
 * #e8ddd0 (a mid-beige between the oatmeal background and the divider),
 * animated with a subtle left-to-right shimmer. Every tab's loading state
 * (Curated picks, Scout results, Wardrobe pieces, Radar table, Browse cards)
 * renders one of these shapes — never a blank white area, never a generic
 * spinner.
 */

const SHIMMER_BG: React.CSSProperties = {
  background: 'linear-gradient(90deg, #e8ddd0 25%, #ede5d8 50%, #e8ddd0 75%)',
  backgroundSize: '200% 100%',
  animation: 'hab-shimmer 1.2s infinite',
};

/** Injects the shimmer keyframes once per skeleton root — safe to repeat.
 * Exported (Pass Forty-Six B) so standalone thumbnail placeholders outside
 * the prefab skeletons can shimmer too. */
export function ShimmerDefs() {
  return <style>{'@keyframes hab-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }'}</style>;
}

/** One shimmering bar — size with width/height (defaults to a Lora text line). */
export function ShimmerBar({
  width = '100%',
  height = '14px',
  className = '',
  style,
}: {
  width?: string;
  height?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return <span aria-hidden="true" className={`block ${className}`} style={{ width, height, borderRadius: 0, ...SHIMMER_BG, ...style }} />;
}

/** A pulsing ghost block. Size it with className (w-… h-… rounded-…). */
export function Skeleton({ className = '' }: { className?: string }) {
  return <span className={`block ${className}`} style={SHIMMER_BG} aria-hidden="true" />;
}

/** Ghost of a piece tile — square image area + two text lines. */
export function PieceTileSkeleton() {
  return (
    <div className="rounded-2xl border border-[var(--space-border-default)] overflow-hidden" aria-hidden="true">
      <ShimmerDefs />
      <Skeleton className="w-full aspect-square" />
      <div className="p-3 space-y-2">
        <Skeleton className="h-3 w-2/3 rounded" />
        <Skeleton className="h-2.5 w-1/3 rounded" />
      </div>
    </div>
  );
}

/** Ghost of a horizontal card row (icon + two text lines). */
export function CardRowSkeleton() {
  return (
    <div className="rounded-2xl border border-[var(--space-border-default)] px-4 py-3.5 flex items-center gap-3" aria-hidden="true">
      <ShimmerDefs />
      <Skeleton className="w-10 h-10 rounded-xl flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-1/3 rounded" />
        <Skeleton className="h-2.5 w-2/3 rounded" />
      </div>
    </div>
  );
}

/** Full-page ghost while the app's profile loads — header + cards + grid. */
export function HomeSkeleton() {
  return (
    <div className="px-6 py-8 max-w-5xl mx-auto w-full space-y-8" aria-label="Loading" role="status">
      <ShimmerDefs />
      <div className="space-y-3">
        <Skeleton className="h-2.5 w-24 rounded" />
        <Skeleton className="h-6 w-56 rounded" />
        <Skeleton className="h-3 w-80 max-w-full rounded" />
      </div>
      <CardRowSkeleton />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <PieceTileSkeleton />
        <PieceTileSkeleton />
        <PieceTileSkeleton />
        <PieceTileSkeleton />
      </div>
      <CardRowSkeleton />
    </div>
  );
}

/**
 * Hairline data rows — the shape of the Wardrobe category list, Scout
 * history, and Radar table while their rows load: a wide title bar and a
 * shorter sub bar per row, parted by the standard 1px divider hairlines.
 */
export function HairlineRowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="divide-y divide-[var(--color-divider,rgba(59,43,29,0.18))] border-b border-[var(--color-divider,rgba(59,43,29,0.18))]"
    >
      <ShimmerDefs />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex flex-col gap-2" style={{ padding: '17px 4px' }}>
          <ShimmerBar width={i % 2 === 0 ? '38%' : '46%'} height="16px" />
          <ShimmerBar width={i % 2 === 0 ? '60%' : '52%'} height="11px" />
        </div>
      ))}
    </div>
  );
}

/**
 * Search-result rows — the shape of the search-to-log results list while a
 * lookup runs: a 56×70 thumbnail block plus name/brand bars per row.
 */
export function SearchResultsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading results"
      className="divide-y divide-[var(--color-divider,rgba(59,43,29,0.18))] border-b border-[var(--color-divider,rgba(59,43,29,0.18))]"
    >
      <ShimmerDefs />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="grid items-center" style={{ gridTemplateColumns: '56px minmax(0,1fr)', gap: '16px', padding: '12px 0' }}>
          <span aria-hidden="true" className="block" style={{ width: '56px', height: '70px', ...SHIMMER_BG }} />
          <span className="flex flex-col gap-2 min-w-0">
            <ShimmerBar width={i % 2 === 0 ? '52%' : '64%'} height="14px" />
            <ShimmerBar width={i % 2 === 0 ? '34%' : '28%'} height="11px" />
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Product-pick card ghosts — the shape of Curated Layer 2 picks and Scout
 * Browse result cards while a live hunt runs: an image block over text bars.
 */
export function PickCardsSkeleton({ cards = 4, columns = 'grid-cols-1 lg:grid-cols-2' }: { cards?: number; columns?: string }) {
  return (
    <div role="status" aria-label="Loading picks" className={`grid ${columns} gap-4`}>
      <ShimmerDefs />
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="border border-[var(--color-divider,rgba(59,43,29,0.18))] bg-[var(--color-paper,#fbf8f1)] p-3">
          <span aria-hidden="true" className="block w-full h-36" style={SHIMMER_BG} />
          <span className="flex flex-col gap-2 mt-3">
            <ShimmerBar width="70%" height="14px" />
            <ShimmerBar width="40%" height="11px" />
            <ShimmerBar width="88%" height="11px" />
          </span>
        </div>
      ))}
    </div>
  );
}

/** The Rail: ledger rows with compact piece thumbnails and ruled metadata. */
export function RailLedgerSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading The Rail" className="border-t border-[var(--space-border-default)]">
      <ShimmerDefs />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="grid grid-cols-[48px_minmax(0,1fr)_64px] items-center gap-4 border-b border-[var(--space-border-default)] py-3">
          <span aria-hidden="true" className="block h-14 w-12" style={SHIMMER_BG} />
          <span className="space-y-2">
            <ShimmerBar width={i % 2 ? '48%' : '62%'} height="15px" />
            <ShimmerBar width={i % 2 ? '72%' : '55%'} height="10px" />
          </span>
          <ShimmerBar width="100%" height="10px" />
        </div>
      ))}
    </div>
  );
}

/** The Edit: the year grid's band headers and calendar-like coverage cells. */
export function EditCalendarSkeleton() {
  return (
    <div role="status" aria-label="Loading The Edit" className="space-y-5">
      <ShimmerDefs />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20" />)}
      </div>
      <div className="grid grid-cols-[92px_repeat(4,minmax(0,1fr))] sm:grid-cols-[140px_repeat(8,minmax(0,1fr))] gap-px bg-[var(--space-border-default)] border border-[var(--space-border-default)]">
        {Array.from({ length: 45 }, (_, i) => (
          <span key={i} aria-hidden="true" className={`${i % 9 === 0 ? 'h-11' : 'h-9'} bg-[var(--space-surface-card)] p-2`}>
            <ShimmerBar width={i % 9 === 0 ? '78%' : '100%'} height="100%" />
          </span>
        ))}
      </div>
    </div>
  );
}

/** The Fitting: day rail, portrait outfit canvas and three garment shelves. */
export function FittingRoomSkeleton() {
  return (
    <div role="status" aria-label="Loading The Fitting" className="space-y-6">
      <ShimmerDefs />
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-10" />)}
      </div>
      <div className="grid md:grid-cols-[minmax(0,1.2fr)_minmax(260px,.8fr)] gap-6">
        <Skeleton className="h-[330px] sm:h-[420px]" />
        <div className="space-y-4">
          {Array.from({ length: 3 }, (_, row) => (
            <div key={row} className="space-y-2">
              <ShimmerBar width="34%" height="11px" />
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="aspect-[3/4]" />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The Search: question box, category rows and product result cards. */
export function SearchWorkspaceSkeleton() {
  return (
    <div role="status" aria-label="Loading The Search" className="space-y-5">
      <ShimmerDefs />
      <Skeleton className="h-24 w-full" />
      <HairlineRowsSkeleton rows={4} />
      <PickCardsSkeleton cards={4} columns="grid-cols-1 sm:grid-cols-2" />
    </div>
  );
}

/** The Index: reference piece cards in the same responsive editorial grid. */
export function IndexPieceCardsSkeleton() {
  return (
    <div role="status" aria-label="Loading The Index" className="space-y-5">
      <ShimmerDefs />
      <div className="flex gap-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="border border-[var(--space-border-default)] p-3 space-y-3">
            <Skeleton className="aspect-[4/5] w-full" />
            <ShimmerBar width={i % 2 ? '68%' : '82%'} height="14px" />
            <ShimmerBar width="46%" height="10px" />
          </div>
        ))}
      </div>
    </div>
  );
}
