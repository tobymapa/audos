/**
 * THE EDIT · BY CATEGORY, AND THE GAP TABLE — to the founder's reference
 * design.
 *
 *  · BY CATEGORY — the eleven categories as one ruled list: the name, how
 *    many pieces he owns there, a COMPLETENESS BAR (one mark per
 *    sub-category, shaded exactly as the map's cells are) and the number of
 *    gaps. Unfolding one shows its sub-categories in full: what each one
 *    answers, whether it is Covered, Thin or a Gap, Beau's line on it, and —
 *    on a gap — the way straight into that sub-category in The Hunt.
 *
 *  · THE GAPS, IN THE ORDER BEAU WOULD CLOSE THEM — the table that closes
 *    the page: rank, the piece as he names it, the days of the year it costs,
 *    what closing it changes, and two ways on — his picks, and the piece's
 *    own entry in The Index.
 *
 * Every colour, rule and type size here is the design's, drawn from the
 * shared Index tokens (index-style.tsx) — nothing sets a hue of its own.
 */
import { Info } from 'lucide-react';
import {
  ACCENT,
  ACCENT_DEEP,
  FAINT,
  INK,
  PAPER,
  SECONDARY,
  WALNUT,
  body,
  mono,
  serif,
} from './index-style';
import {
  HATCH_GAP_ON_PAGE,
  SHADE_COVERED,
  SHADE_THIN,
  TIER_LABEL,
  type CoverageTier,
  type EditCategoryRow,
  type EditSubRow,
} from './edit-model';
import { openInBeausPicks, openInTheIndex } from './edit-links';
import { type EditGap } from './edit-coverage-ai';

const ROW_RULE = '1px solid rgba(59,43,29,0.14)';
const HEAD_RULE = '1px solid rgba(59,43,29,0.24)';
const SOFT_RULE = '1px solid rgba(59,43,29,0.12)';
const PANEL_RULE = '1px solid rgba(59,43,29,0.2)';

const TIER_FG: Record<CoverageTier, string> = {
  gap: ACCENT_DEEP,
  thin: '#856c51',
  covered: FAINT,
};

const TIER_MARK_BG: Record<CoverageTier, string> = {
  covered: SHADE_COVERED,
  thin: SHADE_THIN,
  gap: HATCH_GAP_ON_PAGE,
};

// ---------------------------------------------------------------------------
// The two ways on, as the design draws them.
// ---------------------------------------------------------------------------

function PicksButton({
  categoryId,
  subCategory,
  // The no-break space holds “Beau's picks” on ONE line on a phone
  // (founder's correction, August 2026) — only the arrow may wrap.
  label = 'Beau\u2019s\u00a0picks',
  title,
  block = false,
}: {
  categoryId: string;
  subCategory: string | null;
  label?: string;
  title: string;
  block?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => openInBeausPicks({ categoryId, subCategory })}
      title={title}
      className="transition-colors hover:bg-[rgba(168,113,44,0.22)]"
      style={{
        ...mono(9, WALNUT),
        border: `1px solid ${ACCENT}`,
        background: 'rgba(168,113,44,0.12)',
        padding: block ? '8px 15px' : '6px 13px',
        // Side by side in a narrow cell, the label wraps rather than spilling
        // out of its own box (founder's correction, August 2026).
        whiteSpace: block ? 'normal' : 'nowrap',
        textAlign: 'center',
        width: block ? '100%' : undefined,
      }}
    >
      {label} →
    </button>
  );
}

function IndexButton({ typeId, block = false }: { typeId: string; block?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => openInTheIndex({ typeId })}
      title="About this piece — its full page in The Index"
      className="transition-colors hover:border-[#a8712c]"
      style={{
        ...mono(9, SECONDARY),
        border: '1px solid rgba(59,43,29,0.28)',
        background: 'transparent',
        // The same vertical padding as PicksButton, so the pair stands at
        // ONE height (founder's correction, August 2026).
        padding: block ? '8px 15px' : '6px 13px',
        whiteSpace: block ? 'normal' : 'nowrap',
        textAlign: 'center',
        width: block ? '100%' : undefined,
      }}
    >
      The piece's page →
    </button>
  );
}

/** The small info control a sub-category row carries — the piece type's
 * own full page in The Index. */
function SubInfoButton({ typeId, label }: { typeId: string; label: string }) {
  return (
    <button
      type="button"
      onClick={() => openInTheIndex({ typeId })}
      aria-label={`About ${label} — its page in the Index`}
      title="About this piece — its page in the Index"
      className="transition-colors hover:border-[#a8712c] flex items-center justify-center flex-shrink-0"
      style={{ width: '30px', height: '30px', border: '1px solid rgba(59,43,29,0.28)', background: 'transparent', color: SECONDARY, borderRadius: 0 }}
    >
      <Info className="w-3.5 h-3.5" strokeWidth={1.6} aria-hidden="true" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// BY CATEGORY
// ---------------------------------------------------------------------------

const CAT_GRID = 'grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[200px_128px_minmax(0,1fr)_96px]';
const SUB_GRID = 'grid grid-cols-1 md:grid-cols-[220px_104px_minmax(0,1fr)_168px]';

function SubRow({ row, why }: { row: EditSubRow; why: string }) {
  return (
    <div
      className={`${SUB_GRID} items-center`}
      style={{ gap: '6px 20px', padding: '12px 0', borderTop: ROW_RULE }}
    >
      <div className="min-w-0">
        <div style={{ ...body(14.5, WALNUT), lineHeight: 1.35 }}>{row.label}</div>
        <div style={{ ...mono(8.5, '#856c51'), marginTop: '3px' }}>
          {row.bandLabel}
          {row.days != null && row.tier === 'gap' ? ` \u00b7 ${row.days} days` : ''}
        </div>
      </div>
      <span style={mono(9.5, TIER_FG[row.tier])}>{TIER_LABEL[row.tier]}</span>
      <span style={{ ...body(13, INK), lineHeight: 1.5 }}>{why}</span>
      {row.tier === 'gap' ? (
        <span className="md:justify-self-end flex items-center" style={{ gap: '6px' }}>
          {row.typeId && <SubInfoButton typeId={row.typeId} label={row.label} />}
          <PicksButton
            categoryId={row.categoryId}
            subCategory={row.subCategory}
            title={`Beau\u2019s picks for ${row.label}`}
          />
        </span>
      ) : (
        <span className="md:justify-self-end flex items-center" style={{ gap: '10px' }}>
          <span style={mono(9, FAINT)}>{`${row.count} piece${row.count === 1 ? '' : 's'}`}</span>
          {row.typeId && <SubInfoButton typeId={row.typeId} label={row.label} />}
        </span>
      )}
    </div>
  );
}

export function CategoryList({
  categories,
  subLines,
  open,
  onToggle,
}: {
  categories: EditCategoryRow[];
  /** sub-category key → Beau's line, where he has written one. */
  subLines: Record<string, string>;
  open: string | null;
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <div
        className={`${CAT_GRID} items-baseline`}
        style={{ gap: '20px', padding: '10px 0 8px', borderTop: `1px solid ${INK}`, borderBottom: HEAD_RULE }}
      >
        <span style={mono(9, FAINT)}>Category</span>
        <span className="hidden md:block" style={mono(9, FAINT)}>
          You own
        </span>
        <span className="hidden md:block" style={mono(9, FAINT)}>
          Completeness · sub-category by sub-category
        </span>
        <span className="hidden md:block" style={{ ...mono(9, FAINT), textAlign: 'right' }}>
          Gaps
        </span>
      </div>

      {categories.map((category) => {
        const isOpen = open === category.id;
        return (
          <div
            key={category.id}
            id={`edit-cat-${category.id}`}
            style={{ borderBottom: ROW_RULE, background: isOpen ? 'rgba(168,113,44,0.05)' : 'transparent' }}
          >
            <button
              type="button"
              onClick={() => onToggle(category.id)}
              aria-expanded={isOpen}
              className={`${CAT_GRID} items-center w-full text-left transition-colors hover:bg-[rgba(168,113,44,0.06)]`}
              style={{ gap: '10px 20px', padding: '14px 0', background: 'transparent', border: 'none', cursor: 'pointer' }}
            >
              <span className="flex items-baseline min-w-0" style={{ gap: '10px' }}>
                <span aria-hidden="true" style={{ ...mono(13, ACCENT), flexShrink: 0 }}>
                  {isOpen ? '\u2212' : '+'}
                </span>
                <span style={{ ...serif(23, WALNUT), lineHeight: 1.1 }}>{category.name}</span>
              </span>
              <span style={{ ...mono(11, SECONDARY), textTransform: 'none', whiteSpace: 'nowrap' }}>
                {`${category.owned} piece${category.owned === 1 ? '' : 's'}`}
              </span>
              <span className="hidden md:flex items-center min-w-0" style={{ gap: '3px' }}>
                {category.rows.map((row) => (
                  <span
                    key={row.key}
                    title={`${row.label} \u00b7 ${TIER_LABEL[row.tier]}`}
                    style={{
                      height: '15px',
                      flex: 1,
                      background: TIER_MARK_BG[row.tier],
                      border: row.tier === 'gap' ? `1px solid ${ACCENT}` : 'none',
                    }}
                  />
                ))}
                <span style={{ ...mono(9, '#856c51'), marginLeft: '10px', whiteSpace: 'nowrap' }}>
                  {`${category.rows.length} sub-categor${category.rows.length === 1 ? 'y' : 'ies'}`}
                </span>
              </span>
              <span
                className="hidden md:block"
                style={{ ...mono(9.5, category.gap > 0 ? ACCENT_DEEP : FAINT), justifySelf: 'end' }}
              >
                {category.gap > 0
                  ? `${category.gap} gap${category.gap === 1 ? '' : 's'}`
                  : category.thin > 0
                    ? 'thin'
                    : '\u2014'}
              </span>
            </button>

            {isOpen && (
              <div style={{ padding: '0 0 16px', paddingLeft: '34px' }}>
                {category.rows.map((row) => (
                  <SubRow key={row.key} row={row} why={subLines[row.key] || row.note} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// THE GAP TABLE
// ---------------------------------------------------------------------------

/** The last column holds BOTH ways on, side by side (founder's correction,
 * August 2026), so it is wide enough for the two buttons on one line. */
const GAP_GRID = 'grid grid-cols-1 md:grid-cols-[34px_210px_118px_minmax(0,1fr)_276px]';

export function GapTable({
  gaps,
  meta,
  foot,
  shown,
  onShowAll,
}: {
  gaps: EditGap[];
  meta: string;
  foot: string;
  shown: number;
  onShowAll: () => void;
}) {
  const visible = gaps.slice(0, shown);
  const remaining = gaps.length - visible.length;

  return (
    <div style={{ marginTop: '34px', border: `1px solid ${INK}`, background: PAPER }}>
      <div
        className="flex items-baseline justify-between flex-wrap"
        style={{ gap: '20px', padding: '16px 22px', borderBottom: PANEL_RULE }}
      >
        <span style={serif(24, WALNUT)}>The gaps, in the order Beau would close them</span>
        <span style={mono(9.5, '#856c51')}>{meta}</span>
      </div>

      {gaps.length === 0 ? (
        <p style={{ ...body(14, SECONDARY), padding: '18px 22px 22px', maxWidth: '80ch' }}>
          Nothing reads as a gap just now — every sub-category your year asks for has something in it.
        </p>
      ) : (
        <>
          <div
            className={`${GAP_GRID} items-baseline`}
            style={{ gap: '18px', padding: '11px 22px 9px', borderBottom: PANEL_RULE }}
          >
            <span className="hidden md:block" />
            <span style={mono(9, FAINT)}>The gap</span>
            <span className="hidden md:block" style={mono(9, FAINT)}>
              Days it costs
            </span>
            <span className="hidden md:block" style={mono(9, FAINT)}>
              What it changes
            </span>
            <span className="hidden md:block" />
          </div>

          {visible.map((gap, i) => (
            <div
              key={gap.key}
              className={`${GAP_GRID} items-center`}
              style={{ gap: '10px 18px', padding: '15px 22px', borderBottom: SOFT_RULE }}
            >
              <span style={{ ...mono(11, ACCENT) }}>{String(i + 1).padStart(2, '0')}</span>
              <div className="min-w-0">
                <div style={{ ...body(15, WALNUT), lineHeight: 1.3 }}>{gap.name}</div>
                <div style={{ ...mono(8.5, '#856c51'), marginTop: '3px' }}>
                  {`${gap.categoryName} \u00b7 ${gap.bandLabel}`}
                </div>
              </div>
              <div className="min-w-0">
                <div style={{ ...mono(14, WALNUT), textTransform: 'none', fontFeatureSettings: "'tnum'" }}>
                  {gap.days == null ? '\u2014' : `${gap.days} days`}
                </div>
                <div style={{ ...mono(8.5, FAINT), marginTop: '3px' }}>
                  {gap.days == null ? 'climate not on file' : `${Math.round((gap.days / 365) * 100)}% of the year`}
                </div>
              </div>
              <span style={{ ...body(13, INK), lineHeight: 1.52 }}>{gap.why}</span>
              {/* THE TWO WAYS ON SIT SIDE BY SIDE, on every width (founder's
                  correction, August 2026) — they used to stack into a column
                  from md up, which read as two separate controls. */}
              <div
                className="md:justify-self-end flex flex-row w-full"
                style={{ gap: '6px', alignItems: 'stretch', minWidth: '200px' }}
              >
                <PicksButton
                  categoryId={gap.categoryId}
                  subCategory={gap.subCategory}
                  title={`Beau\u2019s picks for ${gap.subCategory}`}
                  block
                />
                {gap.typeId && <IndexButton typeId={gap.typeId} block />}
              </div>
            </div>
          ))}

          {remaining > 0 && (
            <button
              type="button"
              onClick={onShowAll}
              className="transition-colors hover:underline"
              style={{ ...mono(9, ACCENT_DEEP), background: 'transparent', border: 'none', padding: '14px 22px 0' }}
            >
              {`Show the remaining ${remaining} \u2192`}
            </button>
          )}

          <div style={{ ...body(13, SECONDARY), padding: '14px 22px 18px', maxWidth: '110ch' }}>{foot}</div>
        </>
      )}
    </div>
  );
}
